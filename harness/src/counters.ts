// The play sweep's counters (M2-S12), each read from a document's History through its index by
// type, `history.byType`, never by scanning every entry. M2-S9 adds the first: the Quests taken by
// each kind of controller, which shows how contested the Board is (DL-30).

import { isId, type Controller, type Guild, type WorldDocument } from '@heroesim/engine';

/** Whose choices a Guild's are: the player's or a Rival's Disposition's (ADR-0002). */
export type ControllerKind = Controller['kind'];

/**
 * The Quests taken in `document`'s History, one per `quest.taken` entry, counted by the kind of
 * controller of the Guild that took each, which the entry's payload names. The Guild is read
 * from the World State, whose Guild rows are never removed (DL-27).
 *
 * @throws Error on an entry naming no Guild the world holds: the document is not one the engine made
 */
export function questsTakenByController(document: WorldDocument): Record<ControllerKind, number> {
  const { world, history } = document;
  const counts: Record<ControllerKind, number> = { player: 0, rival: 0 };
  for (const position of history.byType['quest.taken'] ?? []) {
    const payload = history.entries[position]?.payload;
    const guildId: unknown = typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'guildId') : undefined;
    const guild: Guild | undefined =
      isId('guilds', guildId) && Object.hasOwn(world.guilds, guildId) ? world.guilds[guildId] : undefined;
    if (guild === undefined) throw new Error(`quest.taken entry ${position} names no Guild in the world`);
    counts[guild.controller.kind] += 1;
  }
  return counts;
}
