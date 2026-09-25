// The play sweep's counters (M2-S12), each read from a document's History through its index by
// type, `history.byType`, never by scanning every entry, and joined to the World State only for
// the Guild an entry names. M2-S9 added the first, the Quests taken by each kind of controller,
// which shows how contested the Board is (DL-30); M2-S12 adds the rest (DL-34).

import {
  isId,
  questBands,
  type Controller,
  type EndingReason,
  type Entry,
  type EventType,
  type Guild,
  type GuildId,
  type QuestBand,
  type WorldDocument,
} from '@heroesim/engine';

/** Whose choices a Guild's are: the player's or a Rival's Disposition's (ADR-0002). */
export type ControllerKind = Controller['kind'];

export const controllerKinds = ['player', 'rival'] as const satisfies readonly ControllerKind[];

/** Every way a Guild's game ends (M2-S10), in the order the endings are checked. */
export const endingReasons = ['retirement', 'bankruptcy', 'roster-wiped'] as const satisfies readonly EndingReason[];

/** A count for each kind of controller. */
export type ByController = Record<ControllerKind, number>;

const byController = (): ByController => ({ player: 0, rival: 0 });

/** The entries of `type`, oldest first, read through `history.byType`. */
function entriesOf({ history }: WorldDocument, type: EventType): Entry[] {
  const found: Entry[] = [];
  for (const position of history.byType[type] ?? []) {
    const entry = history.entries[position];
    if (entry === undefined) throw new Error(`byType["${type}"] names position ${position}, outside the History`);
    found.push(entry);
  }
  return found;
}

/** `field` of an entry's payload, or `undefined` when the payload has none. */
function payloadField(entry: Entry, field: string): unknown {
  const { payload } = entry;
  return typeof payload === 'object' && payload !== null ? Reflect.get(payload, field) : undefined;
}

/**
 * The Guild an entry is about: its payload's `guildId`, or else the first Guild among its
 * participants, where `emit` puts the Guild of any Hero it names at the time (DL-24 item 3), so a
 * Hero's Injury counts for the Guild they were on then, whatever became of them since. The row is
 * read from the World State, whose Guild rows are never removed (DL-27).
 *
 * @throws Error on an entry naming no Guild the world holds: the document is not one the engine made
 */
function guildOf(document: WorldDocument, entry: Entry, position: string): Guild {
  const { guilds } = document.world;
  const fromPayload = payloadField(entry, 'guildId');
  const guildId: unknown = isId('guilds', fromPayload)
    ? fromPayload
    : entry.participants.find((participant) => isId('guilds', participant));
  const guild = isId('guilds', guildId) && Object.hasOwn(guilds, guildId) ? guilds[guildId as GuildId] : undefined;
  if (guild === undefined) throw new Error(`${entry.type} entry ${position} names no Guild in the world`);
  return guild;
}

/** The entries of `type` counted by the kind of controller of the Guild each is about. */
function countByController(document: WorldDocument, type: EventType): ByController {
  const counts = byController();
  entriesOf(document, type).forEach((entry, index) => {
    counts[guildOf(document, entry, `${index}`).controller.kind] += 1;
  });
  return counts;
}

/**
 * The Quests taken in `document`'s History, one per `quest.taken` entry, counted by the kind of
 * controller of the Guild that took each, which the entry's payload names.
 *
 * @throws Error on an entry naming no Guild the world holds: the document is not one the engine made
 */
export function questsTakenByController(document: WorldDocument): ByController {
  return countByController(document, 'quest.taken');
}

/** Everything a harness game is counted by (M2-S12's counters, DL-34). */
export interface GameCounters {
  questsTaken: ByController;
  /** `quest.resolved` by the resolving Guild's controller, then by band. */
  questsResolved: Record<ControllerKind, Record<QuestBand, number>>;
  heroesInjured: ByController;
  heroesDied: ByController;
  heroesRecruited: ByController;
  heroesRetired: ByController;
  /** `guild.folded`, by the reason the Rival reached its ending. */
  rivalFolds: Record<EndingReason, number>;
  /** `game.ended`'s reason, or `null` when the player's game has not ended. */
  ending: EndingReason | null;
  /** The Turn the game ended on, or the world's Turn when it has not. */
  lastTurn: number;
}

/** A count for each ending. */
function byReason(): Record<EndingReason, number> {
  return { retirement: 0, bankruptcy: 0, 'roster-wiped': 0 };
}

function isReason(value: unknown): value is EndingReason {
  return (endingReasons as readonly unknown[]).includes(value);
}

function isBand(value: unknown): value is QuestBand {
  return (questBands as readonly unknown[]).includes(value);
}

/**
 * Every counter of a harness game, read from `document`'s History through `byType` and joined to
 * the World State for the Guild each entry is about.
 *
 * @throws Error on an entry the engine would not have made: one naming no Guild the world holds,
 * a `quest.resolved` without a band, an ending without a reason
 */
export function countGame(document: WorldDocument): GameCounters {
  const questsResolved: GameCounters['questsResolved'] = {
    player: { fail: 0, success: 0, strong: 0 },
    rival: { fail: 0, success: 0, strong: 0 },
  };
  entriesOf(document, 'quest.resolved').forEach((entry, index) => {
    const band = payloadField(entry, 'band');
    if (!isBand(band)) throw new Error(`quest.resolved entry ${index} has no band`);
    questsResolved[guildOf(document, entry, `${index}`).controller.kind][band] += 1;
  });

  const rivalFolds = byReason();
  entriesOf(document, 'guild.folded').forEach((entry, index) => {
    const reason = payloadField(entry, 'reason');
    if (!isReason(reason)) throw new Error(`guild.folded entry ${index} has no reason`);
    rivalFolds[reason] += 1;
  });

  const endings = entriesOf(document, 'game.ended');
  if (endings.length > 1) throw new Error(`The History holds ${endings.length} game.ended entries`);
  const reason = endings[0] === undefined ? null : payloadField(endings[0], 'reason');
  if (reason !== null && !isReason(reason)) throw new Error('The game.ended entry has no reason');

  const { world } = document;
  return {
    questsTaken: questsTakenByController(document),
    questsResolved,
    heroesInjured: countByController(document, 'hero.injured'),
    heroesDied: countByController(document, 'hero.died'),
    heroesRecruited: countByController(document, 'hero.recruited'),
    heroesRetired: countByController(document, 'hero.retired'),
    rivalFolds,
    ending: reason,
    lastTurn: world.ended?.turn ?? world.turn,
  };
}
