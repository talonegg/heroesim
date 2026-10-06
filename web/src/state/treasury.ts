// The Treasury (M9-F3, DL-111 item 5, DL-112 item 6, DL-116): a Guild's accounts, a part of the Guild
// view. Its Wealth; Upkeep's next payment, with its Day and its parts; the Bankruptcy floor, and the
// countdown while the Guild is below it; and the ledger, every change to its Wealth read from the
// History, by six categories, newest first and a page at a time, with the totals of what is shown.
//
// Nothing here computes a rule (ADR-0007, principle 12). Every amount is an event's payload, as the
// engine wrote it when the Wealth moved (DL-112's context: every change to a Guild's Wealth has an
// event that carries the amount); the ledger opens with the Wealth the Guild was founded with, which
// its `guild.founded` carries from M9-F7 (DL-120 item 4); and Upkeep's figures are the engine's `upkeepParts` and
// `nextUpkeepDay` (M9-F1, DL-114 item 3). The ledger reads the History's own index of entries by
// participant, never the History view's scopes or filters (M9-F4's), since every Wealth event names
// its Guild.

import {
  isEngineEvent,
  nextUpkeepDay,
  playerGuild,
  upkeepParts,
  type EngineEventOf,
  type EngineEventType,
  type Entry,
  type GuildId,
  type TurnEvent,
  type WorldDocument,
} from '@heroesim/engine';
import { nightOfDay, signed, whenOfTurn } from '@heroesim/words';
import { content } from '../content';
import { narrateSegments, narrationFor, textOf, type Segment } from './namer';
import { calendarFor, playDeps } from './reducer';
import { countdownView, historyPageSize } from './selectors';

// ── What an entry did to a Guild's Wealth ────────────────────────────────────────────────────

/** The ledger's categories, the owner's (DL-111 item 5), mapped to events by DL-112 item 6. */
export type LedgerCategory = 'upkeep' | 'quest' | 'market' | 'hall' | 'heroes' | 'other';

/** The categories in the order the Treasury names them. */
export const ledgerCategories: readonly LedgerCategory[] = ['upkeep', 'quest', 'market', 'hall', 'heroes', 'other'];

/** Each category's name on the page. */
export const categoryWords: Readonly<Record<LedgerCategory, string>> = Object.freeze({
  upkeep: 'Upkeep',
  quest: 'Quest rewards',
  market: 'Market',
  hall: 'Hall',
  heroes: 'Heroes',
  other: 'Other',
});

/** What an entry did to one Guild's Wealth: its category, and the amount, positive for income. */
export interface WealthChange {
  category: LedgerCategory;
  amount: number;
}

type Reader<Type extends EngineEventType> = (payload: EngineEventOf<Type>['payload'], guildId: GuildId) => WealthChange | null;

/** `amount` in `category` when `mine`; none otherwise. */
function when(mine: boolean, category: LedgerCategory, amount: number): WealthChange | null {
  return mine ? { category, amount } : null;
}

/**
 * How each event type moves a Guild's Wealth, if it does: keyed by every event type, `null` for one
 * that never does, so that `tsc -b` refuses a type the engine adds until it is decided, as the
 * History's `routineKinds` does.
 */
const readers: { readonly [Type in EngineEventType]: Reader<Type> | null } = {
  'world.created': null,
  'guild.founded': null,
  'guildmaster.generated': null,
  'hero.generated': null,
  'patron.generated': null,
  'world.rules-adopted': null,
  'guild.upkeep-paid': (payload, guildId) => when(payload.guildId === guildId, 'upkeep', -payload.amount),
  'guild.below-floor': null,
  'guild.floor-recovered': null,
  'hero.recruited': (payload, guildId) => when(payload.guildId === guildId, 'heroes', -payload.fee),
  'hero.left-pool': null,
  'quest.offered': null,
  'quest.expired': null,
  'quest.taken': null,
  'quest.encounter': null,
  'quest.resolved': (payload, guildId) => when(payload.guildId === guildId, 'quest', payload.wealthDelta),
  'quest.loot': null,
  'hero.injured': null,
  'hero.died': null,
  'hero.xp-gained': null,
  'hero.morale-changed': null,
  'hero.healed': null,
  'hero.trait-gained': null,
  'hero.trait-lost': null,
  'hero.retired': null,
  'hero.declined': null,
  'game.ended': null,
  'guild.folded': null,
  'guildmaster.succeeded': null,
  'hero.left-guild': null,
  'guild.improved': (payload, guildId) => when(payload.guildId === guildId, 'hall', -payload.cost),
  'hero.levelled': null,
  'patron.regard-changed': null,
  'guildmaster.regard-changed': null,
  'hero.regard-changed': null,
  'item.expended': null,
  'item.equipped': null,
  'item.unequipped': null,
  'item.returned': null,
  'item.bought': (payload, guildId) => when(payload.guildId === guildId, 'market', -payload.cost),
  // A folding Guild's unique Items go to the Market for it (`cause: 'fold'`): a sale all the same.
  'item.sold': (payload, guildId) => when(payload.guildId === guildId, 'market', payload.proceeds),
  // The fee is paid by the Guild the Hero goes to, to the one they leave.
  'hero.transferred': (payload, guildId) =>
    payload.toGuildId === guildId ? { category: 'heroes', amount: -payload.fee } : when(payload.fromGuildId === guildId, 'heroes', payload.fee),
  'guild.transfer-offered': null,
  'guild.transfer-offer-declined': null,
  'guild.transfer-offer-expired': null,
  'guild.wealth-changed': (payload, guildId) => when(payload.guildId === guildId, 'other', payload.after - payload.before),
};

/**
 * What `entry` did to `guildId`'s Wealth: its category and amount; `null` for an entry that moved
 * none of it, a module's own event among them. An amount of nothing gives no row, as a failed
 * Quest's nil reward does not (DL-116).
 */
export function wealthChangeOf(entry: Entry | TurnEvent, guildId: GuildId): WealthChange | null {
  if (!isEngineEvent(entry)) return null;
  const read = readers[entry.type] as Reader<EngineEventType> | null;
  const change = read === null ? null : read(entry.payload as never, guildId);
  return change === null || change.amount === 0 ? null : change;
}

// ── The ledger ───────────────────────────────────────────────────────────────────────────────

/**
 * One change to a Guild's Wealth, as the Treasury's ledger shows it; or its opening row, the Wealth it
 * was founded with (M9-F7, DL-120 item 4), which has no category.
 */
export interface LedgerRow {
  /** Its place in the History: unique, and the same on every page. */
  key: string;
  /** `Year 1 Day 20, night`. */
  when: string;
  /** What happened, in the History's words, each name opening whom it names; `Founded with 500 Wealth` for the opening row. */
  segments: Segment[];
  sentence: string;
  /** `null` for the opening row. */
  category: LedgerCategory | null;
  /** `Quest rewards`; `Opening balance` for the opening row. */
  categoryWords: string;
  /** Positive for income, negative for an expense; the founding Wealth for the opening row. */
  amount: number;
  /** `+300`, `-120`; `500` for the opening row, a balance and not a change. */
  amountWords: string;
}

/** A change to a Guild's Wealth where the History holds it, before it is put in words. */
interface LedgerChange extends WealthChange {
  position: number;
  entry: Entry;
}

/** Every change to `guildId`'s Wealth the History holds, newest first, not yet in words. */
function changesOf(document: WorldDocument, guildId: GuildId): LedgerChange[] {
  const { history } = document;
  const positions = Object.hasOwn(history.byEntity, guildId) ? (history.byEntity[guildId] ?? []) : [];
  const changes: LedgerChange[] = [];
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const position = positions[index] ?? -1;
    const entry = history.entries[position];
    if (entry === undefined) continue;
    const change = wealthChangeOf(entry, guildId);
    if (change !== null) changes.push({ ...change, position, entry });
  }
  return changes;
}

/** A change as the ledger shows it, in the History's words. */
function ledgerRow({ position, entry, category, amount }: LedgerChange, narration: ReturnType<typeof narrationFor>): LedgerRow {
  const segments = narrateSegments(entry as TurnEvent, narration);
  return {
    key: `ledger-${position}`,
    when: whenOfTurn(entry.turn, narration.calendar),
    segments,
    sentence: textOf(segments),
    category,
    categoryWords: categoryWords[category],
    amount,
    amountWords: signed(amount),
  };
}

/**
 * The ledger's opening row: the Wealth `guildId` was founded with, from its `guild.founded`, the first
 * entry naming it; `null` when that names none, as a founding written before M9-F7 does.
 */
function openingOf(document: WorldDocument, guildId: GuildId): LedgerRow | null {
  const { history } = document;
  const positions = Object.hasOwn(history.byEntity, guildId) ? (history.byEntity[guildId] ?? []) : [];
  const position = positions.find((at) => history.entries[at]?.type === 'guild.founded');
  const founded = position === undefined ? undefined : (history.entries[position] as EngineEventOf<'guild.founded'>);
  const wealth = founded?.payload.guildId === guildId ? founded.payload.wealth : undefined;
  if (founded === undefined || wealth === undefined) return null;
  const sentence = `Founded with ${wealth} Wealth`;
  return {
    key: `ledger-${position}`,
    when: whenOfTurn(founded.turn, calendarFor(document)),
    segments: [{ kind: 'text', text: sentence }],
    sentence,
    category: null,
    categoryWords: 'Opening balance',
    amount: wealth,
    amountWords: String(wealth),
  };
}

/** Every change to `guildId`'s Wealth the History holds, newest first, then its opening row when the History has one. */
export function ledgerOf(document: WorldDocument, guildId: GuildId): LedgerRow[] {
  const narration = narrationFor(document, content);
  const opening = openingOf(document, guildId);
  return [...changesOf(document, guildId).map((change) => ledgerRow(change, narration)), ...(opening === null ? [] : [opening])];
}

// ── The Treasury part ────────────────────────────────────────────────────────────────────────

/** Which way the ledger's rows move the Wealth: both ways, into the Guild, or out of it. */
export type LedgerFlow = 'both' | 'income' | 'expense';

/** What the ledger shows: which way, and one category or all of them. */
export interface TreasuryFilter {
  flow: LedgerFlow;
  category: LedgerCategory | null;
}

/** The sums of what the ledger shows: income positive, expense negative, and the two together. */
export interface LedgerTotals {
  income: number;
  expense: number;
  net: number;
  /** `+300`, `-420`, `-120`. */
  incomeWords: string;
  expenseWords: string;
  netWords: string;
}

export interface TreasuryView {
  guildName: string;
  wealth: number;
  upkeep: {
    /** `Upkeep of The Lantern: 120 Wealth every 10 Days`, the sentence the Hall gave until M9-F3. */
    sentence: string;
    /** What the next payment takes (`upkeepParts`' total), at the Roster and Hall of now. */
    total: number;
    /** `the night of Year 1 Day 20` (`nextUpkeepDay`); `null` once the game has ended or the Guild folded. */
    next: string | null;
    /** Wages and the Hall's maintenance, and the Guildmaster's Traits' factor when one bears on it. */
    parts: { label: string; value: string }[];
  };
  /** The Bankruptcy floor. */
  floor: number;
  /** The Bankruptcy countdown while the Guild is below the floor (`countdownView`); `null` otherwise. */
  countdown: string | null;
  ledger: {
    /** The page's rows, newest first; the opening row last, on the last page, when it is shown. */
    rows: LedgerRow[];
    /** Which page, from 0, of how many; a ledger with nothing to show has one, empty. */
    page: number;
    pages: number;
    /** How many changes the filter lets through, on every page: the opening row is none. */
    shown: number;
    /** Whether the opening row is shown: with every change, no filter chosen, when the History names the founding Wealth (M9-F7). */
    opens: boolean;
    totals: LedgerTotals;
    /** Each category the Guild's ledger holds, in the Treasury's order, with its rows' count, whatever is shown: the filter's chips. */
    categories: { key: LedgerCategory; label: string; count: number }[];
  };
}

/** Whether `row` is one `filter` shows. */
function shows(row: WealthChange, filter: TreasuryFilter): boolean {
  if (filter.category !== null && row.category !== filter.category) return false;
  return filter.flow === 'both' || (filter.flow === 'income' ? row.amount > 0 : row.amount < 0);
}

function totalsOf(rows: readonly WealthChange[]): LedgerTotals {
  const income = rows.reduce((sum, row) => (row.amount > 0 ? sum + row.amount : sum), 0);
  const expense = rows.reduce((sum, row) => (row.amount < 0 ? sum + row.amount : sum), 0);
  const net = income + expense;
  return { income, expense, net, incomeWords: signed(income), expenseWords: signed(expense), netWords: signed(net) };
}

/**
 * The player's Guild's Treasury: its Wealth, Upkeep and the Bankruptcy floor, and the ledger's rows
 * `filter` shows, a page (from 0) of `historyPageSize` at a time, newest first, with their totals;
 * `null` in a save with no player's Guild. A page past the last reads as the last.
 */
export function treasuryView(document: WorldDocument, filter: TreasuryFilter, page: number): TreasuryView | null {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined) return null;
  const { config } = playDeps(document);

  const parts = upkeepParts(guild, world, config, content);
  const playing = world.ended === null && guild.foldedOnTurn === null;

  // Filtered, counted and totalled before words: only the page shown is narrated (M9-F6, code review).
  const all = changesOf(document, guild.id);
  const shown = all.filter((row) => shows(row, filter));
  // The opening row is a balance, neither income nor expense: it ends the ledger shown whole (M9-F7).
  const opening = filter.flow === 'both' && filter.category === null ? openingOf(document, guild.id) : null;
  const rows = shown.length + (opening === null ? 0 : 1);
  const pages = Math.max(1, Math.ceil(rows / historyPageSize));
  const narration = narrationFor(document, content);
  const at = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const onPage = shown.slice(at * historyPageSize, (at + 1) * historyPageSize).map((change) => ledgerRow(change, narration));
  if (opening !== null && at === pages - 1) onPage.push(opening);

  return {
    guildName: guild.name,
    wealth: guild.wealth,
    upkeep: {
      sentence: `Upkeep of ${guild.name}: ${parts.total} Wealth every ${config.upkeepEveryDays} Days`,
      total: parts.total,
      next: playing ? nightOfDay(nextUpkeepDay(world.turn, config), config) : null,
      parts: [
        { label: 'Wages', value: String(parts.wages) },
        { label: 'Hall maintenance', value: String(parts.hallMaintenance) },
        // Two factors multiply in floating point (1.1 × 0.9): shown to two places, as a player reads it (M9-F6).
        ...(parts.traitFactor === 1 ? [] : [{ label: 'Guildmaster’s Traits', value: `×${Number(parts.traitFactor.toFixed(2))}` }]),
      ],
    },
    floor: config.bankruptcyFloor,
    countdown: countdownView(document),
    ledger: {
      rows: onPage,
      page: at,
      pages,
      shown: shown.length,
      opens: opening !== null,
      totals: totalsOf(shown),
      categories: ledgerCategories.flatMap((key) => {
        const count = all.filter((row) => row.category === key).length;
        return count === 0 ? [] : [{ key, label: categoryWords[key], count }];
      }),
    },
  };
}
