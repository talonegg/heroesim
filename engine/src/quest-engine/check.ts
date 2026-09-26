// The Check (M4-S2, CONTEXT.md): the comparison of a Party's capability against an Encounter's
// difficulty (INPUTS 6.2, DL-42). Capability is the Party's weighted effective Stats on the
// Encounter's demands, the best Hero's value of each or the Party's sum as the Encounter says, plus
// `skillBonusPerRating` times the best rating any member holds of each of its Skills, plus the
// Synergy term (`synergy.ts`, M4-S3's), all times the teamwork scalar (`teamwork.ts`, M4-S4's).
// One roll from the `quests` stream scales it by up to ±`checkVariance`, and the Check succeeds
// when the roll reaches `difficultyFactor` times the Quest's difficulty.
//
// Only the Party's own qualities are read here. Rules about the Guild's leader and the Guild's
// dealings live in Guild-side phases and actions, never in this file (M4's third risk); a test
// reads this file to hold it so.

import type { EngineDeps } from '../config.js';
import type { Encounter } from '../content-types.js';
import type { Hero, Quest, World } from '../document.js';
import { streamOf } from '../generators/draw.js';
import { next } from '../rng.js';
import { effectiveStats } from '../selectors.js';
import { synergyBonus } from './synergy.js';
import { teamwork } from './teamwork.js';

/** What the Check reads from the rules and the content. */
export type CheckDeps = Pick<EngineDeps, 'config' | 'content'>;

/** Whether an Encounter's Check succeeded. */
export type EncounterOutcome = 'success' | 'failure';

/** A Check, as the Quest Engine records it. */
export interface CheckResult {
  /** The Party's capability before the roll (`capability`), with the `bonus` it carried. */
  capability: number;
  /** The capability after the roll. */
  roll: number;
  /** What the roll must reach: `difficultyFactor × quest.difficulty`. */
  target: number;
  /** `roll − target`: at 0 or more the Check succeeded. */
  margin: number;
  outcome: EncounterOutcome;
}

/**
 * `heroes`' capability on `encounter` (M4-S2): for each demand, its weight times the best member's
 * effective value of the Stat (`best`) or the members' sum of it (`sum`); plus, for each of the
 * Encounter's Skills, `skillBonusPerRating` times the best rating any member holds of it, 0 when
 * none does; plus the Synergy bonus; all times the teamwork scalar. A demand on a Stat, or a Skill,
 * that content no longer defines counts for nothing (data-model rule 5). No members, no capability.
 * A member's effective values are the one selector's, `effectiveStats` (selectors.ts), which holds
 * every modifier of a Stat: the Class Stat bonuses of the Hero's Guild's Traits (M4-S5) and, from
 * M5-S2, gear (DL-44). None is worked out here.
 */
export function capability(heroes: readonly Hero[], encounter: Encounter, world: World, deps: CheckDeps): number {
  const { config, content } = deps;
  const stats = heroes.map((hero) => effectiveStats(hero, world, content));
  let base = 0;
  for (const [statKey, weight] of encounter.demands) {
    const values = stats.map((values) => (Object.hasOwn(values, statKey) ? (values[statKey] ?? 0) : 0));
    const aggregate = encounter.aggregate === 'best' ? Math.max(0, ...values) : values.reduce((sum, value) => sum + value, 0);
    base += weight * aggregate;
  }
  for (const skillKey of encounter.skillKeys) {
    if (!Object.hasOwn(content.skills, skillKey)) continue;
    const ratings = heroes.map((hero) => (Object.hasOwn(hero.skills, skillKey) ? (hero.skills[skillKey] ?? 0) : 0));
    base += config.skillBonusPerRating * Math.max(0, ...ratings);
  }
  return (base + synergyBonus(heroes, encounter, base, deps)) * teamwork(heroes, world, deps);
}

/**
 * Checks `heroes` against `encounter` on `quest` (M4-S2): the roll is the capability times
 * `1 + r`, `r` one draw from −`checkVariance` up to +`checkVariance` from `world.rng.quests` (and
 * never below 0), and
 * the Check succeeds when the roll is at least `difficultyFactor × quest.difficulty`. Always one
 * draw, whatever the Party. `bonus` is added to the capability before the roll: what the Party
 * carries adds to it (a consumable's flat bonus, M5-S3, consumables.ts), 0 when nothing does.
 * Changes nothing but the stream; throws on a world without it.
 */
export function check(
  heroes: readonly Hero[],
  encounter: Encounter,
  quest: Pick<Quest, 'difficulty'>,
  world: World,
  deps: CheckDeps,
  bonus = 0,
): CheckResult {
  const state = streamOf(world, 'quests');
  const capable = capability(heroes, encounter, world, deps) + bonus;
  // Never below 0, nor −0, which is not JSON-safe (a variance above 1 could otherwise reach them).
  const roll = Math.max(0, capable * (1 + (next(state) * 2 - 1) * deps.config.checkVariance));
  const target = encounter.difficultyFactor * quest.difficulty;
  return { capability: capable, roll, target, margin: roll - target, outcome: roll >= target ? 'success' : 'failure' };
}
