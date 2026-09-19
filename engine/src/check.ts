/**
 * Checks: the d20 resolution at the heart of every Beat, and the two things that bend
 * it — the Hero's Traits and the Party's Backing. Solution architecture §5.
 */

import { clamp, type GameConfig } from './config.js';
import type { Content, TraitDef } from './content.js';
import type { Rng } from './rng.js';
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
 * once when the Party is committed and fixed for that Commission's duration. Regard does
 * not contribute yet; that is E2.
 */
export function backingFor(guildmaster: Guildmaster, content: Content, config: GameConfig): number {
  const fromStats = clamp(
    Math.round((guildmaster.stats.Nerve + guildmaster.stats.Guile) / 2) - 2,
    0,
    config.backingMax,
  );
  const defs = traitDefsByName(content);
  let fromTraits = 0;
  for (const held of guildmaster.traits) {
    fromTraits += defs.get(held.name)?.backing ?? 0;
  }
  return fromStats + fromTraits;
}

/**
 * The DC a Beat is resolved against: the Vignette's own difficulty, shifted by how hard
 * the Commission is, and clamped. Hard Commissions make every Beat harder.
 */
export function beatDc(vignetteDifficulty: number, commission: Commission, config: GameConfig): number {
  const shifted = vignetteDifficulty + (commission.difficulty - config.commissionDifficultyPivot);
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
