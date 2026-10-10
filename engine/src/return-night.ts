// Parties' returns played as the engine plays them, with outcomes a test chose (DL-245): for the other
// packages' tests, through `@heroesim/engine/testing`, never production code. The Quest Engine's
// draws rarely give a Death or a Level when a test needs one, so the test gives the resolution, and
// the engine applies it and plays the rest of the return's night that writes it: `questsConclude`'s
// applying of each outcome (`conclude`), then `levelUps` and `gearReturn`. Each event is recorded to the
// History as `advance` records a Turn's, so a test's return is the engine's in every entry's shape,
// order and participants. Only a night the game plays is played: the Parties' own return night, not yet
// played, every Party of it in one call (DL-250).

import type { EngineDeps } from './config.js';
import { compareByCodeUnit, requireRow, type PartyId, type Turn, type WorldDocument } from './document.js';
import type { EngineEvent } from './events.js';
import { gearReturn } from './phases/gear-return.js';
import { levelUps } from './phases/level-ups.js';
import { phaseContext } from './phases/phase.js';
import { conclude } from './phases/quests-conclude.js';
import type { Resolution } from './quest-engine/resolve.js';
import { record } from './record.js';
import { dayOf, nightOf } from './time.js';
import { copyWorld } from './world-copy.js';

/** A Party coming home, and the resolution a test chose for the Quest Engine's. */
export interface Returning {
  partyId: PartyId;
  resolution: Resolution;
}

/**
 * Plays `returns` on the night `turn`, each Party's with its resolution for the Quest Engine's: on a copy
 * of `document`'s world moved to that night, each outcome applied as `questsConclude` applies them, in
 * Party id order, then the night's Levels and the gear of the dead back to their Guilds, every Guild's as
 * the phases do. Returns the new document, sharing `meta` and `history` (ADR-0008), and the events in
 * the order they happened.
 *
 * @throws RangeError when `turn` is already played (the world's Turn or before it), is not a night, or is
 *   not every Party's `returnsOnTurn`, or when a Party, its Guild or its Quest has no row
 */
export function playReturnNight(
  document: WorldDocument,
  returns: readonly Returning[],
  deps: EngineDeps,
  turn: Turn,
): { document: WorldDocument; events: EngineEvent[] } {
  if (turn <= document.world.turn) throw new RangeError(`Turn ${turn} is already played: the world stands on Turn ${document.world.turn}`);
  if (nightOf(dayOf(turn)) !== turn) throw new RangeError(`Turn ${turn} is not a night: a Party comes home on one`);
  const world = copyWorld(document.world);
  world.turn = turn;
  const ctx = phaseContext(world, deps, document.history);
  const concluding = [...returns]
    .sort((a, b) => compareByCodeUnit(a.partyId, b.partyId))
    .map(({ partyId, resolution }) => {
      const party = requireRow(world.parties, partyId, 'parties');
      if (party.returnsOnTurn !== turn) throw new RangeError(`${partyId} comes home on Turn ${party.returnsOnTurn}, not ${turn}`);
      return { party, guild: requireRow(world.guilds, party.guildId, 'guilds'), quest: requireRow(world.quests, party.questId, 'quests'), resolution };
    });
  const events = [...concluding.flatMap((each) => conclude(world, ctx, each)), ...levelUps(world, ctx), ...gearReturn(world, ctx)];
  for (const heroId of record(document.history, events)) delete world.heroes[heroId];
  return { document: { meta: document.meta, world, history: document.history }, events };
}
