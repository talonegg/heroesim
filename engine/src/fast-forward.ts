// Fast forward (M2-S11, approach §2, principle 10, DL-33): `advance` in a loop until a reason to
// stop, or the Turns allowed run out. It adds no rule: every Turn is `advance`'s, and every reason
// is detected in stops.ts.

import { advance } from './advance.js';
import type { EngineDeps } from './config.js';
import type { GuildId, WorldDocument } from './document.js';
import type { TurnEvent } from './events.js';
import {
  alwaysStops,
  endedStop,
  isStopCondition,
  stopConditions,
  stopsOfTurn,
  type StopCondition,
  type StopReason,
} from './stops.js';

export interface FastForwardOptions {
  /**
   * The Guild whose Parties, decisions and Transfer Offers stop the fast forward. A front end passes the player's
   * (`playerGuild`); the engine never asks whose it is (ADR-0002), so another Guild's Parties never
   * stop it.
   */
  guildId: GuildId;
  /**
   * The opt-in conditions to stop on as well (`quest-staffable`, `pool-refreshed`). The always-on
   * ones (`ended`, `below-floor`, `party-returned`, `decision-needed`, `transfer-offer`, and a
   * module's stop, `module`) stop it whether listed or not (`alwaysStops`).
   */
  until: readonly StopCondition[];
  /** The most Turns to play: a whole number from 0. At 0 nothing is played. */
  maxTurns: number;
}

export interface FastForwardResult {
  /** The document after the last Turn played; the one given when none was. */
  document: WorldDocument;
  /** Every event of every Turn played, in order, each also appended to the History; the modules' own among them. */
  events: TurnEvent[];
  /** Why it stopped: the first reason, in `stopConditions`' order, of the last Turn, or `max-turns`. */
  stoppedBecause: StopReason;
}

/**
 * Plays Turns with `advance` until one gives a reason to stop that is always on or listed in
 * `until`, and stops after that Turn; or until `maxTurns` Turns are played, stopping with
 * `max-turns`. A game already over is returned as it is, with `ended`, whatever `maxTurns`.
 *
 * Throws on a programming error: `maxTurns` not a whole number from 0, a condition in `until` that
 * is not one, or a Guild not in the world.
 */
export function fastForward(document: WorldDocument, options: FastForwardOptions, deps: EngineDeps): FastForwardResult {
  const { guildId, until, maxTurns } = options;
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 0) {
    throw new RangeError(`maxTurns must be a whole number from 0, not ${maxTurns}`);
  }
  for (const condition of until) {
    if (!isStopCondition(condition)) throw new RangeError(`${String(condition)} is not a stop condition`);
  }
  if (!Object.hasOwn(document.world.guilds, guildId)) throw new RangeError(`No Guild ${guildId} to watch`);

  const ended = endedStop(document.world);
  if (ended !== null) return { document, events: [], stoppedBecause: ended };

  const listened = stopConditions.filter((condition) => alwaysStops[condition] || until.includes(condition));
  const events: TurnEvent[] = [];
  let current = document;
  for (let played = 0; played < maxTurns; played += 1) {
    const turn = advance(current, deps);
    events.push(...turn.events);
    const [stop] = stopsOfTurn(
      { before: current.world, after: turn.document.world, events: turn.events, stoppedBecause: turn.stoppedBecause },
      guildId,
      deps,
      listened,
    );
    current = turn.document;
    if (stop !== undefined) return { document: current, events, stoppedBecause: stop };
  }
  return { document: current, events, stoppedBecause: { kind: 'max-turns' } };
}
