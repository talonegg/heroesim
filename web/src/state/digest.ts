// What the shell reads (M9-S3, DL-103): the counts on the navigation, the home view's digest of
// what needs attention, and the History rail's latest entries. Each function takes the game in hand
// and returns plain rows of words and numbers, as `selectors.ts` does.
//
// Nothing here computes a rule (ADR-0007, principle 12). Every number is a document field, an
// engine selector's answer (`offersTo` through `offersView`, `entriesFor`), or read from
// the last play's events. "New since the last action" is exactly those events: the engine appends
// each event of a play to the History as it is, neither copied nor frozen (`append`, ADR-0008), so
// an entry is new when it is one of `log`'s.

import {
  entriesFor,
  playerGuild,
  type EngineEventOf,
  type PartyId,
  type QuestBand,
  type QuestId,
  type TurnEvent,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { pageOfEntry } from './history';
import { nameIn, nightOf, rowOf } from './names';
import { listed, narrationFor, questNamer } from './narrate';
import type { GameState } from './reducer';
import { boardView, linesOf, whenOf, type LogLine } from './selectors';
import { offersView } from './trade-views';

/** The counts the navigation shows. */
export interface NavCounts {
  /** The Quests on offer: the Board's count. */
  quests: number;
  /** The Transfer Offers waiting for an answer: the Roster's dot. */
  offers: number;
  /** The entries naming the player's Guild that the last play appended: the History's count. */
  fresh: number;
}

/** The last play's events that name the player's Guild (a Hero's Guild is named with the Hero, `emit`). */
function freshFor(state: Pick<GameState, 'document' | 'log'>): TurnEvent[] {
  const guild = state.document === null ? undefined : playerGuild(state.document.world);
  return guild === undefined ? [] : state.log.filter((event) => event.participants.includes(guild.id));
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

// ── The Parties that came home ───────────────────────────────────────────────────────────────

/** A Quest band as a word the home view shows, `CONTEXT.md`'s: failure, success or strong success. */
const bandWords: Readonly<Record<QuestBand, string>> = { fail: 'Failure', success: 'Success', strong: 'Strong success' };

/** How a Party of the player's came home in the last play. */
export interface OutcomeRow {
  /** Unique within the list. */
  key: string;
  /** `Day 5, night`: when it came home. */
  when: string;
  quest: string;
  band: QuestBand;
  /** `Success`. */
  bandWords: string;
  /** Who went, by name. */
  names: string[];
  /** `Finn, Vigdis and Arne`. */
  heroes: string;
  /** Wealth to the Guild, and Fame, as the outcome gave them: Fame falls on a failure. */
  wealth: number;
  fame: number;
  /** XP to each Hero who came home alive. */
  xp: number;
  /** `Finn Grimshaw: Broken arm, healing on the night of Day 12`. */
  injuries: string[];
  /** Who died on the Quest, by name. */
  deaths: string[];
  /** Its line in the History, `outcome-party-000004`, which the home view opens (M9-S5, DL-105). */
  anchor: string;
  /** The page of the player's Guild's History the line stands on; `null` if it is not there. */
  page: number | null;
}

type Resolved = EngineEventOf<'quest.resolved'>;
type Injured = EngineEventOf<'hero.injured'>;

/**
 * Each Party of the player's that came home in the last play, in the order they came home: the
 * Quest Engine's outcome (`quest.resolved`) with the Injuries it recorded (`hero.injured`, which
 * says the night each heals). Names are the events' labels, written when it happened. Each says
 * where its line is read in the player's Guild's History (M9-S5).
 */
export function outcomesView(state: Pick<GameState, 'document' | 'log'>): OutcomeRow[] {
  const { document, log } = state;
  const guild = document === null ? undefined : playerGuild(document.world);
  if (guild === undefined) return [];
  const injured = log.filter((event): event is Injured => event.type === 'hero.injured');
  return log
    .filter((event): event is Resolved => event.type === 'quest.resolved' && (event as Resolved).payload.guildId === guild.id)
    .map((event, index) => {
      const { payload, labels } = event;
      const named = (id: string): string => labels[id as keyof typeof labels] ?? 'a Hero';
      const names = payload.heroIds.map(named);
      return {
        key: `${event.turn}-${index}`,
        when: whenOf(event.turn),
        quest: nameIn(content.questTemplates, payload.templateKey),
        band: payload.band,
        bandWords: bandWords[payload.band],
        names,
        heroes: listed(names),
        wealth: payload.wealthDelta,
        fame: payload.fameDelta,
        xp: payload.xpPerHero,
        injuries: payload.injuries.map(({ heroId, typeKey, healDays }) => {
          const heals = injured.find((each) => each.payload.heroId === heroId && each.payload.questId === payload.questId);
          const until = heals === undefined ? `healing in ${healDays} ${healDays === 1 ? 'Day' : 'Days'}` : `healing on ${nightOf(heals.payload.healsOnTurn)}`;
          return `${named(heroId)}: ${nameIn(content.injuries, typeKey)}, ${until}`;
        }),
        deaths: payload.deaths.map(named),
        anchor: `outcome-${payload.partyId}`,
        page: document === null ? null : pageOfEntry(document, null, event),
      };
    });
}

// ── The History rail ─────────────────────────────────────────────────────────────────────────

/** How many entries the History rail shows. A front end's choice, not a rule. */
export const railLength = 24;

/** A line of the rail: a line of the History, and whether the last play appended it. */
export interface RailLine extends LogLine {
  fresh: boolean;
}

export interface RailView {
  guildName: string;
  /** The Guild's newest entries, newest first. */
  lines: RailLine[];
  /** How many entries naming the Guild the last play appended: the History's count on the navigation. */
  fresh: number;
}

/**
 * The History rail beside a view on a wide screen (M9-S3, DL-103): the player's Guild's latest
 * `limit` entries, newest first, as its History gives them (`entriesFor`), each marked new when the
 * last play appended it. It keeps to the player's Guild, where the History opens (DL-99 item 2).
 */
export function railView(state: Pick<GameState, 'document' | 'log'>, limit = railLength): RailView | null {
  const { document } = state;
  const guild = document === null ? undefined : playerGuild(document.world);
  if (document === null || guild === undefined) return null;
  const fresh = new Set<object>(freshFor(state));
  const entries = entriesFor(document.history, guild.id, { limit });
  const lines = linesOf(entries, narrationFor(document, content));
  return {
    guildName: guild.name,
    lines: lines.map((line, index) => ({ ...line, fresh: fresh.has(entries[index] as object) })),
    fresh: fresh.size,
  };
}
