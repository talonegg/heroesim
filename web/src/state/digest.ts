// What the shell reads (M9-S3, DL-103): the counts on the navigation, the home view's digest of
// what needs attention, and the History rail's latest entries. Each function takes the game in hand
// and returns plain rows of words and numbers, as `selectors.ts` does.
//
// Nothing here computes a rule (ADR-0007, principle 12). Every number is a document field, an
// engine selector's answer (`offersTo` through `offersView`), the History as `history.ts` shows it, or read from
// the last play's events. "New since the last action" is exactly those events: the engine appends
// each event of a play to the History as it is, neither copied nor frozen (`append`, ADR-0008), so
// an entry is new when it is one of `log`'s.

import {
  playerGuild,
  type Entry,
  type EngineEventOf,
  type GuildId,
  type PartyId,
  type QuestId,
  type TurnEvent,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { historyEntries, historyFilter } from './history';
import { returnEntry, type ReturnEntry } from './quest-return';
import { nightOf, rowOf } from './names';
import { listed, narrationFor, questNamer } from './narrate';
import type { GameState } from './reducer';
import { boardView, linesOf, type LogLine } from './selectors';
import { offersView } from './trade-views';

/** The counts the navigation shows. */
export interface NavCounts {
  /** The Quests on offer: the Board's count. */
  quests: number;
  /** The Transfer Offers waiting for an answer: the Roster's dot. */
  offers: number;
  /** The entries of the player's Guild's History that the last play appended: the History's count. */
  fresh: number;
}

/**
 * The last play's events that name the player's Guild (a Hero's Guild is named with the Hero, `emit`)
 * and that its History shows (M9-F4, `historyFilter`): what the History and the rail mark new.
 */
function freshFor(state: Pick<GameState, 'document' | 'log'>): TurnEvent[] {
  const { document } = state;
  const guild = document === null ? undefined : playerGuild(document.world);
  if (document === null || guild === undefined) return [];
  const shows = historyFilter(document, guild.id);
  return state.log.filter((event) => event.participants.includes(guild.id) && shows(event));
}

/** The counts on the navigation: none before a game. */
export function navCounts(state: Pick<GameState, 'document' | 'log'>): NavCounts {
  const { document } = state;
  if (document === null) return { quests: 0, offers: 0, fresh: 0 };
  return {
    quests: document.world.board.length,
    offers: offersView(document)?.offers.length ?? 0,
    fresh: freshFor(state).length,
  };
}

// ── The Parties out ──────────────────────────────────────────────────────────────────────────

/** A Party of the player's away on a Quest. */
export interface PartyOutRow {
  partyId: PartyId;
  /** The Quest's name, as the Board named it. */
  quest: string;
  /** Who went, by name, in the Party's order. */
  names: string[];
  /** `Finn, Vigdis and Arne`. */
  heroes: string;
  /** `the night of Day 5`: when it comes home, as the Roster says it. */
  returns: string;
}

/** The player's Parties out, in the order they were sent. */
export function partiesOutView(document: WorldDocument): PartyOutRow[] {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined) return [];
  const questName = questNamer(document, content);
  return Object.values(world.parties)
    .filter((party) => party.guildId === guild.id)
    .map((party) => {
      const names = party.heroIds.map((heroId) => rowOf(world.heroes, heroId)?.name ?? 'a Hero');
      return { partyId: party.id, quest: questName(party.questId), names, heroes: listed(names), returns: nightOf(party.returnsOnTurn) };
    });
}

// ── The Quests on their last Day ─────────────────────────────────────────────────────────────

/** A Quest on its last Day on the Board. */
export interface LeavingRow {
  questId: QuestId;
  name: string;
  patron: string;
  reward: number;
}

/**
 * The Quests on the Board whose last Day on offer is today, in the Board's order: those `boardView`
 * marks as leaving today (M9-S4), the Day the Board says each is "on offer through" being the Day of
 * the Turn in hand. The next morning's refresh takes them off (`board-refresh`), if no Guild has.
 */
export function leavingTodayView(document: WorldDocument): LeavingRow[] {
  return boardView(document)
    .filter((card) => card.leavesToday)
    .map(({ questId, name, patron, reward }) => ({ questId, name, patron, reward }));
}

// ── The History rail ─────────────────────────────────────────────────────────────────────────

/** How many entries the History rail shows. A front end's choice, not a rule. */
export const railLength = 24;

/** A line of the rail: a line of the History, and whether the last play appended it. */
export interface RailLine extends LogLine {
  fresh: boolean;
  /** A Party's return, as its one entry (M9-F5, DL-111 item 2); `null` on any other line. */
  questReturn: ReturnEntry | null;
}

export interface RailView {
  /** The player's Guild, whose Banner stands beside "Latest for {Guild}" (DL-125 item 7). */
  guildId: GuildId;
  guildName: string;
  /** The Guild's newest entries, newest first. */
  lines: RailLine[];
  /** How many entries naming the Guild the last play appended: the History's count on the navigation. */
  fresh: number;
}

/**
 * The History rail beside a view on a wide screen (M9-S3, DL-103): the player's Guild's latest
 * `limit` entries, newest first, as its History shows them (`historyEntries`, with what M9-F4's
 * filter leaves out left out), each marked new when the last play appended it. It keeps to the
 * player's Guild, where the History opens (DL-99 item 2).
 */
export function railView(state: Pick<GameState, 'document' | 'log'>, limit = railLength): RailView | null {
  const { document } = state;
  const guild = document === null ? undefined : playerGuild(document.world);
  if (document === null || guild === undefined) return null;
  const fresh = new Set<object>(freshFor(state));
  const entries = besideTheirReturn(historyEntries(document, guild.id, limit));
  const lines = linesOf(entries, narrationFor(document, content));
  return {
    guildId: guild.id,
    guildName: guild.name,
    lines: lines.map((line, index) => {
      const entry = entries[index] as Entry;
      const resolved = entry.type === 'quest.resolved' ? (entry as EngineEventOf<'quest.resolved'>).payload : null;
      return {
        ...line,
        // A return's line keeps its key as newer lines come in above it, and with it the state of its disclosure.
        key: resolved === null ? line.key : `return-${resolved.partyId}`,
        fresh: fresh.has(entry),
        questReturn: resolved === null ? null : returnEntry(document, { partyId: resolved.partyId, questId: resolved.questId }),
      };
    }),
    fresh: fresh.size,
  };
}

/**
 * The rail's entries, newest first, with each return's Loot, then its Injuries and Deaths, moved to
 * straight after it in the order they happened, so they are the entries next after it, read down the
 * rail as in the History's order (M9-F5, DL-111 item 2; M9-F7, DL-120 item 6). One whose return is not
 * among them stays where it is.
 */
function besideTheirReturn(entries: readonly Entry[]): Entry[] {
  const questOf = (entry: Entry): unknown => (entry.payload as { questId?: unknown }).questId;
  const returned = new Set(entries.filter((entry) => entry.type === 'quest.resolved').map(questOf));
  const held = new Map<unknown, Entry[]>();
  const ordered: Entry[] = [];
  for (const entry of entries) {
    if (besideAReturn.has(entry.type) && returned.has(questOf(entry))) {
      // Newest first here: each older one goes before those held already.
      held.set(questOf(entry), [entry, ...(held.get(questOf(entry)) ?? [])]);
      continue;
    }
    ordered.push(entry);
    if (entry.type === 'quest.resolved') ordered.push(...(held.get(questOf(entry)) ?? []));
  }
  return ordered;
}

/** The entries of a return that stand beside its entry in the rail: its Loot, Injuries and Deaths, and the Traits its Heroes earned (v1.1.4-S7). */
const besideAReturn: ReadonlySet<string> = new Set(['quest.loot', 'hero.injured', 'hero.died', 'hero.trait-gained']);
