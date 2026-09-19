/**
 * Choosing the Vignette a Beat comes from, and the Hero its slot resolves to.
 * Solution architecture §5. The engine matches conditions and fills slots; it never
 * reads a narrative (ADR-0008).
 */

import type { Content, Vignette } from './content.js';
import { ContentError, EngineError } from './errors.js';
import type { Rng } from './rng.js';
import type { Hero, Stat } from './types.js';

/** Everything the selection rule looks at. */
export interface VignetteContext {
  /** Which Beat of the Commission this is, counting from one. */
  beatIndex: number;
  /** The Commission's tags, from its Sphere's entry for the title. */
  commissionTags: readonly string[];
  /** The Sphere the Commission's Patron belongs to. */
  sphereId: string;
  /** The Party, so a `requiresTrait` condition can be answered. */
  heroes: readonly Hero[];
  /** Vignette ids already spent on this Commission. */
  used: readonly string[];
}

function partyHolds(heroes: readonly Hero[], trait: string): boolean {
  return heroes.some((hero) => hero.traits.some((held) => held.name === trait));
}

function conditionsHold(vignette: Vignette, context: VignetteContext, ignoreTags: boolean): boolean {
  const { conditions } = vignette;
  if (conditions.minBeat !== undefined && context.beatIndex < conditions.minBeat) return false;
  if (conditions.maxBeat !== undefined && context.beatIndex > conditions.maxBeat) return false;
  if (conditions.spheres !== undefined && !conditions.spheres.includes(context.sphereId)) return false;
  if (conditions.requiresTrait !== undefined && !partyHolds(context.heroes, conditions.requiresTrait)) {
    return false;
  }
  if (
    !ignoreTags &&
    conditions.tags !== undefined &&
    !conditions.tags.some((tag) => context.commissionTags.includes(tag))
  ) {
    return false;
  }
  return true;
}

function pickByWeight(candidates: readonly Vignette[], rng: Rng): Vignette {
  const total = candidates.reduce((sum, vignette) => sum + vignette.weight, 0);
  let target = rng.float() * total;
  for (const vignette of candidates) {
    target -= vignette.weight;
    if (target < 0) return vignette;
  }
  const last = candidates[candidates.length - 1];
  if (last === undefined) {
    throw new EngineError('InternalError', 'weighted pick was given nothing to pick from');
  }
  return last;
}

/**
 * Pick the Vignette for a Beat: candidates whose conditions all hold, preferring ones
 * not yet spent on this Commission, chosen by weight. If nothing matches, fall back to
 * the Vignettes whose only failing condition was `tags`. If still nothing, the authored
 * set has a hole and that is a content error.
 */
export function selectVignette(content: Content, context: VignetteContext, rng: Rng): Vignette {
  let candidates = content.vignettes.filter((vignette) => conditionsHold(vignette, context, false));
  if (candidates.length === 0) {
    candidates = content.vignettes.filter((vignette) => conditionsHold(vignette, context, true));
  }
  if (candidates.length === 0) {
    throw new ContentError(
      `vignettes: no Vignette can fire on Beat ${context.beatIndex} of a Commission from ` +
        `"${context.sphereId}" tagged ${context.commissionTags.join(', ') || '(none)'}`,
    );
  }
  const unused = candidates.filter((vignette) => !context.used.includes(vignette.id));
  return pickByWeight(unused.length > 0 ? unused : candidates, rng);
}

/** The Hero a Vignette's slot resolved to, and the Trait the Beat turns on, if any. */
export interface SlotFill {
  hero: Hero;
  /**
   * From `conditions.requiresTrait` or a `with_trait:` slot, and only when this Hero
   * actually holds it. Absent when neither applies, or when the slot fell back to a
   * Hero who does not.
   */
  trait?: string;
}

function extremeBy(heroes: readonly Hero[], stat: Stat, highest: boolean, rng: Rng): Hero {
  let best = Number.NEGATIVE_INFINITY;
  for (const hero of heroes) {
    const value = highest ? hero.stats[stat] : -hero.stats[stat];
    if (value > best) best = value;
  }
  const tied = heroes.filter((hero) => (highest ? hero.stats[stat] : -hero.stats[stat]) === best);
  return rng.pick(tied);
}

/**
 * Fill the Hero slot. `any` picks uniformly; `with_trait:X` picks among those holding X
 * and falls back to anyone; `highest:`/`lowest:` pick the extreme, ties broken by the RNG.
 */
export function fillHeroSlot(vignette: Vignette, heroes: readonly Hero[], rng: Rng): SlotFill {
  if (heroes.length === 0) {
    throw new EngineError('InternalError', 'a Beat fired for a Party with no Heroes in it');
  }
  const rule = vignette.slots.hero;
  let hero: Hero;
  let slotTrait: string | undefined;

  if (rule === 'any') {
    hero = rng.pick(heroes);
  } else if (rule.startsWith('with_trait:')) {
    slotTrait = rule.slice('with_trait:'.length);
    const holders = heroes.filter((candidate) =>
      candidate.traits.some((held) => held.name === slotTrait),
    );
    hero = rng.pick(holders.length > 0 ? holders : heroes);
  } else if (rule.startsWith('highest:')) {
    hero = extremeBy(heroes, rule.slice('highest:'.length) as Stat, true, rng);
  } else {
    hero = extremeBy(heroes, rule.slice('lowest:'.length) as Stat, false, rng);
  }

  // Name the Trait only when the Hero the slot resolved to actually holds it. The
  // `with_trait:` fallback picks anyone when nobody does, and a `requiresTrait` only
  // says somebody in the Party holds it — so reporting the asked-for Trait regardless
  // would put a Trait in the mouth of a Hero who has not got it (DL-13, F11).
  const asked = vignette.conditions.requiresTrait ?? slotTrait;
  if (asked === undefined) return { hero };
  return hero.traits.some((held) => held.name === asked) ? { hero, trait: asked } : { hero };
}
