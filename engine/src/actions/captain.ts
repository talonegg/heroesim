// `nameCaptain` (DL-280 item 6, Q3 c; DL-287; R40): a Guild names one Hero of its Roster its Captain.
// Every Guild names through this one rule, the player's front end by `applyAction` and a Rival's
// controller on the Turn's copy (ADR-0002, DL-30). Naming to an empty post is free, at founding and
// after a Death, a Retirement or a departure left it empty (`leaveRoster`); naming one in another's
// place costs the outgoing Captain `captainChangeMoraleCost` and locks the post for
// `captainChangeLockDays` (`captainLock`), as a Transfer locks a Hero (DL-60). What a Captain brings is
// read where it matters, never here (captain.ts).

import { captainLock, captainOf } from '../captain.js';
import type { EngineDeps } from '../config.js';
import { rowOf, type Guild, type GuildId, type HeroId, type Turn, type World } from '../document.js';
import { eventEmitter } from '../emit.js';
import type { EngineEvent } from '../events.js';
import { changeMorale } from '../morale.js';
import type { Rejection, WorldActionResult } from './result.js';

export interface NameCaptainAction {
  kind: 'nameCaptain';
  /** The Guild whose post it is. */
  guildId: GuildId;
  /** A Hero of its Roster. */
  heroId: HeroId;
}

/** The Guild has folded (DL-28): it has left play and names no Captain. */
export interface NameCaptainGuildFolded extends Rejection<'nameCaptain', 'guild-folded'> {
  guildId: GuildId;
}

/** The Hero is not on the Guild's Roster: another Guild's, the Unattached pool's, gone from play, or no row. */
export interface NameCaptainHeroNotOnRoster extends Rejection<'nameCaptain', 'hero-not-on-roster'> {
  heroId: HeroId;
}

/** The Hero is the Captain already: naming them again would change nothing, and is refused rather than charged. */
export interface NameCaptainAlreadyCaptain extends Rejection<'nameCaptain', 'already-captain'> {
  heroId: HeroId;
}

/**
 * The post was changed too lately to change again (`captainLock`): the Captain who holds it, the Turn
 * of the change, and the first Turn another may be made.
 */
export interface NameCaptainLocked extends Rejection<'nameCaptain', 'captain-locked'> {
  captainId: HeroId;
  changedOnTurn: Turn;
  untilTurn: Turn;
}

/** Why a Guild could not name a Captain. */
export type NameCaptainRejection = NameCaptainGuildFolded | NameCaptainHeroNotOnRoster | NameCaptainAlreadyCaptain | NameCaptainLocked;

/**
 * `guildId` names `heroId`, a Hero of its Roster, its Captain, and emits `guild.captain-named`, a
 * Milestone naming the Guild, the Hero and the Captain replaced. To an empty post, that is all. In
 * another Captain's place, the outgoing Captain loses `captainChangeMoraleCost` Morale, with
 * `hero.morale-changed` for `captain-changed` (none for a cost of 0), and the post is locked from this
 * Turn (`captainChangedOnTurn`, read by `captainLock`). A Hero away on a Quest, or injured, may be named.
 *
 * Refused, changing nothing: `guild-folded`, `hero-not-on-roster`, `already-captain`, `captain-locked`
 * (a change while the last one's lock holds; never a vacancy filled), in that order. Throws on a
 * Guild id the world does not hold, a programming error.
 *
 * Changes `world` in place and returns its events rather than appending them: `applyAction` runs it on
 * a copy of a document's world, a Rival controller on the Turn's copy (DL-30).
 */
export function applyNameCaptain(
  world: World,
  { guildId, heroId }: Pick<NameCaptainAction, 'guildId' | 'heroId'>,
  deps: EngineDeps,
): WorldActionResult<NameCaptainRejection> {
  const { config } = deps;
  const guild: Guild | undefined = rowOf(world.guilds, guildId);
  if (guild === undefined) throw new RangeError(`No Guild in the world has the id ${guildId}`);
  if (guild.foldedOnTurn !== null) {
    return { ok: false, rejection: { action: 'nameCaptain', reason: 'guild-folded', guildId } };
  }
  if (!guild.rosterIds.includes(heroId) || rowOf(world.heroes, heroId) === undefined) {
    return { ok: false, rejection: { action: 'nameCaptain', reason: 'hero-not-on-roster', heroId } };
  }
  if (guild.captainId === heroId) {
    return { ok: false, rejection: { action: 'nameCaptain', reason: 'already-captain', heroId } };
  }
  const outgoing = captainOf(guild, world);
  if (outgoing !== undefined) {
    const lock = captainLock(guild, world.turn, config);
    if (lock !== null) {
      return { ok: false, rejection: { action: 'nameCaptain', reason: 'captain-locked', captainId: outgoing.id, ...lock } };
    }
  }

  const emit = eventEmitter(world);
  guild.captainId = heroId;
  if (outgoing !== undefined) guild.captainChangedOnTurn = world.turn;
  const lock = outgoing === undefined ? null : captainLock(guild, world.turn, config);
  const events: EngineEvent[] = [
    emit({
      type: 'guild.captain-named',
      participants: [guildId, heroId, ...(outgoing === undefined ? [] : [outgoing.id])],
      payload: { guildId, heroId, replacedId: outgoing?.id ?? null, lockedUntilTurn: lock?.untilTurn ?? null },
    }),
  ];
  if (outgoing !== undefined && config.captainChangeMoraleCost !== 0) {
    events.push(changeMorale(outgoing, config.captainChangeMoraleCost, 'captain-changed', config, emit));
  }
  return { ok: true, events };
}
