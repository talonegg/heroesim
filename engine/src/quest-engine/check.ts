// The Check (M4-S2, CONTEXT.md): the comparison of a Party's capability against an Encounter's
// difficulty (INPUTS 6.2, DL-42). Capability is the Check's score, a Query over the Party's members
// (v1.1.4-S1, query.ts, ADR-0010), plus `skillBonusPerRating` times the best rating any member holds
// of each of its Skills, plus the Synergy term (`synergy.ts`, M4-S3's), all times the teamwork
// scalar (`teamwork.ts`, M4-S4's). One roll from the `quests` stream scales it by up to
// ±`checkVariance`, and the Check succeeds when the roll reaches `difficultyFactor` times the
// Quest's difficulty. An Encounter in the old form has one Check, whose score weighs the best
// Hero's value of each demanded Stat, or the Party's sum, as its `aggregate` said (M4-S2).
//
// Only the Party's own qualities are read here. Rules about the Guild's leader and the Guild's
// dealings live in Guild-side phases and actions, never in this file nor in query.ts (M4's third
// risk); a test reads both files to hold it so.

import type { EngineDeps } from '../config.js';
import type { Encounter, EncounterCheck } from '../content-types.js';
import type { Quest, World } from '../document.js';
import { streamOf } from '../generators/draw.js';
import { next } from '../rng.js';
import { evaluate, type QueryParty } from './query.js';
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
 * `party`'s capability on `encounterCheck`, a Check of `encounter` (M4-S2, v1.1.4-S1): the Check's
 * score (`evaluate`, query.ts); plus, for each of its Skills, `skillBonusPerRating` times the best
 * rating any member holds of it, 0 when none does; plus the Synergy bonus of the Encounter's kind;
 * all times the teamwork scalar. A Stat, or a Skill, that content no longer defines counts for
 * nothing (data-model rule 5). No members, no capability. A member's effective values are the one
 * selector's, `effectiveStats` (selectors.ts), read once as the Party is taken (`queryParty`), which
 * holds every modifier of a Stat: the Class Stat bonuses of the Hero's Guild's Traits (M4-S5) and,
 * from M5-S2, gear (DL-44). None is worked out here.
 */
export function capability(
  party: QueryParty,
  encounter: Pick<Encounter, 'kind'>,
  encounterCheck: EncounterCheck,
  world: World,
  deps: CheckDeps,
): number {
  const { config, content } = deps;
  const heroes = party.members.map((member) => member.hero);
  let base = evaluate(encounterCheck.score, party);
  for (const skillKey of encounterCheck.skills) {
    if (!Object.hasOwn(content.skills, skillKey)) continue;
    const ratings = heroes.map((hero) => (Object.hasOwn(hero.skills, skillKey) ? (hero.skills[skillKey] ?? 0) : 0));
    base += config.skillBonusPerRating * Math.max(0, ...ratings);
  }
  return (base + synergyBonus(party, encounter, base, deps)) * teamwork(heroes, world, deps);
}

/**
 * Checks `party` on `encounterCheck`, a Check of `encounter`, on `quest` (M4-S2): the roll is the
 * capability times `1 + r`, `r` one draw from −`checkVariance` up to +`checkVariance` from
 * `world.rng.quests` (and never below 0), and the Check succeeds when the roll is at least
 * `difficultyFactor × quest.difficulty`. Always one draw, whatever the Party. `bonus` is added to
 * the capability before the roll: what the Party carries adds to it (a consumable's flat bonus,
 * M5-S3, consumables.ts), 0 when nothing does. Changes nothing but the stream; throws on a world
 * without it.
 */
export function check(
  party: QueryParty,
  encounter: Pick<Encounter, 'kind'>,
  encounterCheck: EncounterCheck,
  quest: Pick<Quest, 'difficulty'>,
  world: World,
  deps: CheckDeps,
  bonus = 0,
): CheckResult {
  const state = streamOf(world, 'quests');
  const capable = capability(party, encounter, encounterCheck, world, deps) + bonus;
  // Never below 0, nor −0, which is not JSON-safe (a variance above 1 could otherwise reach them).
  const roll = Math.max(0, capable * (1 + (next(state) * 2 - 1) * deps.config.checkVariance));
  const target = encounterCheck.difficultyFactor * quest.difficulty;
  return { capability: capable, roll, target, margin: roll - target, outcome: roll >= target ? 'success' : 'failure' };
}
