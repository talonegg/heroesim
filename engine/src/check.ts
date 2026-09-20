/**
 * Checks: the d20 resolution at the heart of every Beat, and the two things that bend
 * it — the Hero's Traits and the Party's Backing. Solution architecture §5.
 */

import { clamp, type GameConfig } from './config.js';
import type { Content, TraitDef } from './content.js';
import type { Rng } from './rng.js';
import { HALL_TRAINING_YARD } from './types.js';
import type { BeatResult, Commission, Guildmaster, Hero, Stat } from './types.js';

/** One resolved Check, as the Beat and its event need it. */
export interface CheckOutcome {
  /** The die alone. */
  roll: number;
  /** Roll plus Stat plus Trait modifiers plus Backing. */
  total: number;
  /** What the total had to reach. */
  dc: number;
  result: BeatResult;
}

function traitDefsByName(content: Content): Map<string, TraitDef> {
  const index = new Map<string, TraitDef>();
  for (const trait of content.traits) index.set(trait.name, trait);
  return index;
}

/**
 * What a person's Traits add to a Check. A modifier applies when its `stat` is absent or
 * equal to the Beat's Stat, and its `tags` are absent or intersect the Vignette's tags.
 * A Trait the content does not define contributes nothing.
 */
export function traitModifiers(
  holder: { traits: { name: string }[] },
  stat: Stat,
  vignetteTags: readonly string[],
  content: Content,
  index?: ReadonlyMap<string, TraitDef>,
): number {
  const defs = index ?? traitDefsByName(content);
  let total = 0;
  for (const held of holder.traits) {
    const def = defs.get(held.name);
    if (def === undefined) continue;
    for (const modifier of def.modifiers) {
      if (modifier.stat !== undefined && modifier.stat !== stat) continue;
      if (modifier.tags !== undefined && !modifier.tags.some((tag) => vignetteTags.includes(tag))) {
        continue;
      }
      total += modifier.delta;
    }
  }
  return total;
}

/**
 * What the Guildmaster contributes to a Party they are not part of (ADR-0007). Computed
 * once when the Party is committed and fixed for that Commission's duration.
 *
 * Three terms, as solution architecture §5 always said it would be (E2, DL-14): what the
 * Guildmaster is, what they carry, and what the Party thinks of them. A Party of
 * resentful Heroes takes the Backing negative, so neglect is paid for in the field.
 *
 * E3 adds a fourth, which is the Hall's rather than the Guildmaster's: a training yard
 * adds `config.trainingYardBacking` to every Party, before the clamp.
 *
 * @param members the Heroes being sent. Their mean Regard for the Guildmaster is the
 * third term; an empty Party contributes nothing rather than dividing by zero.
 * @param hall the improvements the Guild's Hall holds. Empty where there is no Hall to
 * read, which is how E1's own Check tests call this.
 */
export function backingFor(
  guildmaster: Guildmaster,
  members: readonly Hero[],
  content: Content,
  config: GameConfig,
  index?: ReadonlyMap<string, TraitDef>,
  hall: readonly string[] = [],
): number {
  const fromStats = clamp(
    Math.round((guildmaster.stats.Nerve + guildmaster.stats.Guile) / config.backingStatDivisor) -
      config.backingStatOffset,
    0,
    config.backingMax,
  );
  const defs = index ?? traitDefsByName(content);
  let fromTraits = 0;
  for (const held of guildmaster.traits) {
    fromTraits += defs.get(held.name)?.backing ?? 0;
  }
  const fromRegard = regardTerm(members, config);
  const fromHall = hall.includes(HALL_TRAINING_YARD) ? config.trainingYardBacking : 0;
  return clamp(fromStats + fromTraits + fromRegard + fromHall, config.backingMin, config.backingMax);
}

/** The Regard term of a Party's Backing: mean Regard for the Guildmaster, scaled down. */
function regardTerm(members: readonly Hero[], config: GameConfig): number {
  if (members.length === 0 || config.backingRegardDivisor === 0) return 0;
  const total = members.reduce((sum, hero) => sum + hero.regardForGuildmaster.value, 0);
  const term = Math.round(total / members.length / config.backingRegardDivisor);
  // Math.round(-0.4) is -0, which survives a clone and is lost by JSON. Normalise it here
  // so that a saved Career comes back deep-equal to the one that was written.
  // Defensive and currently unreachable from `backingFor`: `fromStats` is clamped to >= +0
  // there, and (+0) + (−0) is +0, so a −0 here never survives into the returned Backing.
  return term === 0 ? 0 : term;
}

/**
 * The DC a Beat is resolved against: the Vignette's own difficulty, shifted by how hard
 * the Commission is, and clamped. Hard Commissions make every Beat harder.
 *
 * @param dcDelta what an answered Decision did to the rest of the work (E6-S3). Zero for
 * every Beat of every Party that has not been asked anything, which is what keeps E1's own
 * Check rule the rule.
 */
export function beatDc(
  vignetteDifficulty: number,
  commission: Commission,
  config: GameConfig,
  dcDelta = 0,
): number {
  const shifted =
    vignetteDifficulty + (commission.difficulty - config.commissionDifficultyPivot) + dcDelta;
  return clamp(shifted, config.dcMin, config.dcMax);
}

/** Roll the Check and read the result off the total. */
export function resolveCheck(
  hero: Hero,
  stat: Stat,
  vignetteTags: readonly string[],
  backing: number,
  dc: number,
  content: Content,
  config: GameConfig,
  rng: Rng,
  index?: ReadonlyMap<string, TraitDef>,
): CheckOutcome {
  const roll = rng.int(config.diceSides) + 1;
  const total = roll + hero.stats[stat] + traitModifiers(hero, stat, vignetteTags, content, index) + backing;
  const result: BeatResult =
    total >= dc + config.criticalMargin ? 'critical' : total >= dc ? 'success' : 'failure';
  return { roll, total, dc, result };
}

/** TraitDefs by name, so a run of Beats does not rebuild the lookup each time. */
export type TraitDefIndex = ReadonlyMap<string, TraitDef>;

/** Build the TraitDef lookup for a run of Beats. */
export function traitIndex(content: Content): TraitDefIndex {
  return traitDefsByName(content);
}
