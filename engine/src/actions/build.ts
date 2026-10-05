// `build` (M3-S6, R33, INPUTS 7.3, DL-38): a Guild buys a Hall Improvement, raising one facility of
// its Hall by one grade for the next grade's cost in content (`improvements.json`). Moved from M5 so
// that the infirmary (M2-S6) and the training yard (M3-S2) are exercised from the milestones whose
// rules read them (pre-M0 review D8). Every Guild builds through this one rule, `applyBuild`, the
// player's front end by `applyAction` and a Rival's controller on the Turn's copy (ADR-0002, DL-30).
//
// What a grade does is read where the grade matters, never here: the infirmary when an Injury is
// inflicted (`infirmaryHealFactor`), the training yard by the night's training (M3-S2), the quarters
// by the Morale baseline (`moraleBaselineFor`), and every grade by Upkeep's Hall maintenance.

import type { EngineDeps } from '../config.js';
import {
  facilityKeys,
  rowOf,
  type FacilityKey,
  type Guild,
  type GuildId,
  type World,
} from '../document.js';
import { eventEmitter } from '../emit.js';
import { nextImprovement } from '../selectors.js';
import type { Rejection, WorldActionResult } from './result.js';

export interface BuildAction {
  kind: 'build';
  /** The Guild that builds and pays. */
  guildId: GuildId;
  /** The Hall facility raised by one grade. */
  facility: FacilityKey;
}

/** What `build` is asked: the action without its `kind`. */
export type BuildRequest = Omit<BuildAction, 'kind'>;

/** The Guild has folded (M2-S10): it has left play and builds nothing again. */
export interface BuildGuildFolded extends Rejection<'build', 'guild-folded'> {
  guildId: GuildId;
}

/** The facility is at the highest grade content defines: there is no next Improvement to build. */
export interface MaxGrade extends Rejection<'build', 'max-grade'> {
  facility: FacilityKey;
  grade: number;
}

/** The Guild's Wealth is below the next grade's cost. */
export interface BuildInsufficientWealth extends Rejection<'build', 'insufficient-wealth'> {
  facility: FacilityKey;
  cost: number;
  wealth: number;
}

/** Why a Guild could not build. */
export type BuildRejection = BuildGuildFolded | MaxGrade | BuildInsufficientWealth;

/**
 * `guildId` raises `facility` of its Hall by one grade: deducts exactly the next grade's cost
 * (`nextImprovement`) from the Guild's Wealth, raises the grade, and emits `guild.improved`, a
 * Milestone naming the Guild. Wealth equal to the cost is enough.
 *
 * Refused, changing nothing: `guild-folded`, `max-grade` (content defines no next grade),
 * `insufficient-wealth`, in that order. Throws on a programming error: a Guild id the world does
 * not hold, or a facility that is not one of the Hall's.
 *
 * Changes `world` in place and returns its events rather than appending them: `applyAction` runs
 * it on a copy of a document's world, a Rival controller on the Turn's copy (DL-30).
 */
export function applyBuild(
  world: World,
  { guildId, facility }: BuildRequest,
  deps: EngineDeps,
): WorldActionResult<BuildRejection> {
  const guild: Guild | undefined = rowOf(world.guilds, guildId);
  if (guild === undefined) throw new RangeError(`No Guild in the world has the id ${guildId}`);
  if (!(facilityKeys as readonly string[]).includes(facility)) {
    throw new RangeError(`The Hall has no facility ${JSON.stringify(facility)}; it has ${facilityKeys.join(', ')}`);
  }
  if (guild.foldedOnTurn !== null) {
    return { ok: false, rejection: { action: 'build', reason: 'guild-folded', guildId } };
  }
  const improvement = nextImprovement(guild, facility, deps.content);
  if (improvement === null) {
    return { ok: false, rejection: { action: 'build', reason: 'max-grade', facility, grade: guild.hall[facility] } };
  }
  const { cost, grade } = improvement;
  if (guild.wealth < cost) {
    return { ok: false, rejection: { action: 'build', reason: 'insufficient-wealth', facility, cost, wealth: guild.wealth } };
  }

  guild.wealth -= cost;
  guild.hall[facility] = grade;

  const improved = eventEmitter(world)({
    type: 'guild.improved',
    participants: [guildId],
    payload: { guildId, facility, grade, improvementKey: improvement.key, cost },
  });
  return { ok: true, events: [improved] };
}
