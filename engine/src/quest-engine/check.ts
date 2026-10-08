// The Check (M4-S2, CONTEXT.md): the comparison of a Party's capability against an Encounter's
// difficulty (INPUTS 6.2, DL-42). Capability is the Check's score, a Query over the Party's members
// (v1.1.4-S1, query.ts, ADR-0010), plus `skillBonusPerRating` times the best rating any member holds
// of each of its Skills, plus the Synergy term (`synergy.ts`, M4-S3's), all times the teamwork
// scalar (`teamwork.ts`, M4-S4's), plus the Encounter bonus of the members' Hero Traits (v1.1.4-S7,
// traits.ts). One roll from the `quests` stream scales it by up to
// ±`checkVariance`, or the Check's own `variance`, and the roll against the target, `flat` plus
// `difficultyFactor` times the Quest's difficulty, gives the Check's Degree (v1.1.4-S2, degree.ts):
// a Success or better when it reaches the target.
//
// The score is read with each Hero's form (v1.1.4-S3, form.ts, query.ts): the Stat values a Hero adds
// into it are times their form, and nothing else in the capability is. A raw Check is read without
// form (DL-152). When the same roll with every form at 1 would have fallen on the other side of the
// Success line, the Check says so (`formDecided`), for the Encounter's (resolve.ts).
//
// Only the Party's own qualities are read here. Rules about the Guild's leader and the Guild's
// dealings live in Guild-side phases and actions, never in this file nor in query.ts (M4's third
// risk); a test reads both files to hold it so.

import type { EngineDeps } from '../config.js';
import type { Degree, EncounterCheck } from '../content-types.js';
import type { Quest, World } from '../document.js';
import { streamOf } from '../generators/draw.js';
import { next } from '../rng.js';
import { traitEncounterBonus, type BonusTarget } from '../traits.js';
import { degreeOf, succeeded } from './degree.js';
import { evaluate, type QueryParty } from './query.js';
import { synergyBonus } from './synergy.js';
import { teamwork } from './teamwork.js';

/** What the Check reads from the rules and the content. */
export type CheckDeps = Pick<EngineDeps, 'config' | 'content'>;

/** Whether an Encounter's Check succeeded: at a Success or a Triumph (v1.1.4-S2, `succeeded`). */
export type EncounterOutcome = 'success' | 'failure';

/** Which way form moved a Check, or an Encounter, across the Success line from where every form at 1 would have left it (v1.1.4-S3). */
export type FormDecided = 'raised' | 'lowered';

/** A Check, as the Quest Engine records it. */
export interface CheckResult {
  /** The Party's capability before the roll (`capability`), with the `bonus` it carried. */
  capability: number;
  /** The capability after the roll. */
  roll: number;
  /** What the roll must reach: `flat + difficultyFactor × quest.difficulty`. */
  target: number;
  /** `roll − checkDegrees.success × target`: at 0 or more the Check succeeded, whatever the threshold (DL-152). */
  margin: number;
  /** The roll's Degree against the target (v1.1.4-S2, `degreeOf`). */
  degree: Degree;
  /** `success` at a Success or a Triumph, else `failure`. */
  outcome: EncounterOutcome;
  /**
   * Set when, from the same roll, every form at 1 would have fallen on the other side of the Success
   * line (v1.1.4-S3, the verification): `raised` when form made it a Success or better from below,
   * `lowered` the reverse. Absent otherwise, a Failure made a Setback or a Success a Triumph among them.
   */
  formDecided?: FormDecided;
}

/**
 * `party`'s capability on `encounterCheck`, a Check of `encounter` (M4-S2, v1.1.4-S1): the Check's
 * score (`evaluate`, query.ts), read with each Hero's form unless `withForm` is false (v1.1.4-S3); plus, for each of its Skills, `skillBonusPerRating` times the best
 * rating any member holds of it, 0 when none does; plus the Synergy bonus of the Encounter's kind;
 * all times the teamwork scalar. A Stat, or a Skill, that content no longer defines counts for
 * nothing (data-model rule 5). No members, no capability. A member's effective values are the one
 * selector's, `effectiveStats` (selectors.ts), read once as the Party is taken (`queryParty`), which
 * holds every modifier of a Stat: the Class Stat bonuses of the Hero's Guild's Traits (M4-S5) and,
 * gear (DL-44, DL-49); the Hero Traits' Stat changes (DL-159). None is worked out here.
 * Then, after the teamwork scalar, the Encounter bonus of the members' Hero Traits
 * (`traitEncounterBonus`, v1.1.4-S7, DL-148 item 26), once for the Party however many hold each
 * Trait. A raw Check's capability is its score alone (v1.1.4-S2's verification, DL-152), read
 * without form and without a Trait's bonus, as without a consumable's.
 */
export function capability(
  party: QueryParty,
  encounter: BonusTarget,
  encounterCheck: EncounterCheck,
  world: World,
  deps: CheckDeps,
  withForm = true,
): number {
  const { config, content } = deps;
  // A raw Check is its score alone (DL-152): a gate on a count is not moved by anything else, form neither.
  if (encounterCheck.raw === true) return evaluate(encounterCheck.score, party);
  const heroes = party.members.map((member) => member.hero);
  let base = evaluate(encounterCheck.score, party, withForm);
  for (const skillKey of encounterCheck.skills) {
    if (!Object.hasOwn(content.skills, skillKey)) continue;
    const ratings = heroes.map((hero) => (Object.hasOwn(hero.skills, skillKey) ? (hero.skills[skillKey] ?? 0) : 0));
    base += config.skillBonusPerRating * Math.max(0, ...ratings);
  }
  return (base + synergyBonus(party, encounter, base, deps)) * teamwork(heroes, world, deps) + traitEncounterBonus(heroes, encounter, content);
}

/** What `encounterCheck`'s roll must reach on `quest` (v1.1.4-S2): its `flat`, 0 when it has none, plus `difficultyFactor` times the difficulty. */
export function targetOf(encounterCheck: Pick<EncounterCheck, 'flat' | 'difficultyFactor'>, quest: Pick<Quest, 'difficulty'>): number {
  return (encounterCheck.flat ?? 0) + encounterCheck.difficultyFactor * quest.difficulty;
}

/**
 * Checks `party` on `encounterCheck`, a Check of `encounter`, on `quest` (M4-S2): the roll is the
 * capability times `1 + r`, `r` one draw from −v up to +v from `world.rng.quests` (and never below
 * 0), v the Check's `variance` or else `checkVariance`; the target is the Check's `flat`, 0 when it
 * has none, plus `difficultyFactor × quest.difficulty`; and the Check's Degree is the roll's against
 * the target (v1.1.4-S2, `degreeOf`), a Success or better when the roll is at least the target.
 * Always one draw, whatever the Party, at a variance of 0 too. `bonus` is added to
 * the capability before the roll: what the Party carries adds to it (a consumable's flat bonus,
 * M5-S3, consumables.ts), 0 when nothing does, and nothing to a raw Check. When any member's form is
 * not 1, the capability with every form at 1 is rolled by the same draw too, and `formDecided` set
 * when the two fall on either side of the Success line (v1.1.4-S3). Changes nothing but the stream; throws on a world without it.
 */
export function check(
  party: QueryParty,
  encounter: BonusTarget,
  encounterCheck: EncounterCheck,
  quest: Pick<Quest, 'difficulty'>,
  world: World,
  deps: CheckDeps,
  bonus = 0,
): CheckResult {
  const state = streamOf(world, 'quests');
  const raw = encounterCheck.raw === true;
  const capable = capability(party, encounter, encounterCheck, world, deps) + (raw ? 0 : bonus);
  // Never below 0, nor −0, which is not JSON-safe (a variance above 1 could otherwise reach them).
  const variance = encounterCheck.variance ?? deps.config.checkVariance;
  const spread = 1 + (next(state) * 2 - 1) * variance;
  const roll = Math.max(0, capable * spread);
  const target = targetOf(encounterCheck, quest);
  const degree = degreeOf(roll, target, deps.config);
  const margin = roll - deps.config.checkDegrees.success * target;
  const result: CheckResult = { capability: capable, roll, target, margin, degree, outcome: succeeded(degree) ? 'success' : 'failure' };
  // v1.1.4-S3: the same roll with every form at 1, when form could have moved it.
  if (!raw && party.members.some((member) => member.form !== 1)) {
    const asTheyAre = capability(party, encounter, encounterCheck, world, deps, false) + bonus;
    const without = degreeOf(Math.max(0, asTheyAre * spread), target, deps.config);
    if (succeeded(without) !== succeeded(degree)) result.formDecided = succeeded(degree) ? 'raised' : 'lowered';
  }
  return result;
}
