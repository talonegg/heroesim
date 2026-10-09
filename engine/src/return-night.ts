// A Party's return played as the engine plays it, with an outcome a test chose (DL-245): for the other
// packages' tests, through `@heroesim/engine/testing`, never production code. The Quest Engine's
// draws rarely give a Death or a Level when a test needs one, so the test gives the resolution, and
// the engine applies it and plays the rest of the return's night that writes it: `questsConclude`'s
// applying of the outcome (`conclude`), then `levelUps` and `gearReturn`. Each event is recorded to the
// History as `advance` records a Turn's, so a test's return is the engine's in every entry's shape,
// order and participants.

import type { EngineDeps } from './config.js';
import { requireRow, type PartyId, type Turn, type WorldDocument } from './document.js';
import type { EngineEvent } from './events.js';
import { gearReturn } from './phases/gear-return.js';
import { levelUps } from './phases/level-ups.js';
import { phaseContext } from './phases/phase.js';
import { conclude } from './phases/quests-conclude.js';
import type { Resolution } from './quest-engine/resolve.js';
import { record } from './record.js';
import { copyWorld } from './world-copy.js';

/**
 * Plays `partyId`'s return on the night `turn` with `resolution` for the Quest Engine's: on a copy of
 * `document`'s world moved to that night, the outcome applied as `questsConclude` applies one, then the
 * night's Levels and the gear of the dead back to their Guilds, every Guild's as the phases do. Returns
 * the new document, sharing `meta` and `history` (ADR-0008), and the events in the order they happened.
 *
 * @throws RangeError when `turn` is before the world's Turn, or the Party, its Guild or its Quest has no row
 */
export function playReturnNight(
  document: WorldDocument,
  partyId: PartyId,
  resolution: Resolution,
  deps: EngineDeps,
  turn: Turn,
): { document: WorldDocument; events: EngineEvent[] } {
  if (turn < document.world.turn) throw new RangeError(`A return on Turn ${turn} is before the world's Turn ${document.world.turn}`);
  const world = copyWorld(document.world);
  world.turn = turn;
  const party = requireRow(world.parties, partyId, 'parties');
  const guild = requireRow(world.guilds, party.guildId, 'guilds');
  const quest = requireRow(world.quests, party.questId, 'quests');
  const ctx = phaseContext(world, deps, document.history);
  const events = [...conclude(world, ctx, { party, guild, quest, resolution }), ...levelUps(world, ctx), ...gearReturn(world, ctx)];
  for (const heroId of record(document.history, events)) delete world.heroes[heroId];
  return { document: { meta: document.meta, world, history: document.history }, events };
}
