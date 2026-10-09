// The page's one reader of the History (DL-242): a Quest's return, a Guild's Wealth, a scope's page,
// and the lookups the History view makes. It is the only page module that reads the History's
// entries and its indexes (`history-reader.test.ts` holds the rest to it); the History view, the
// Quest report, the Treasury and the rail read through it.
//
// It reads the History shared by reference and never copies it (ADR-0008): every entry it gives is
// the History's own object, which is how the last play's events are found among its entries. Which
// entries a return wrote is the engine's to know (`returnOf`, `nightsReturnOf`): a Level and a dead
// Hero's gear name no Quest, and the engine knows the order its night runs in.

import {
  nightsReturnOf,
  returnOf,
  type EngineEventOf,
  type EntityId,
  type Entry,
  type GuildId,
  type HeroId,
  type History,
  type ReturnKey,
  type ReturnRecord,
  type TurnEvent,
} from '@heroesim/engine';

/** How many entries a page of the History shows, a Hero's among them, and a page of the ledger. A front end's choice, not a rule. */
export const historyPageSize = 20;

/** The index's ascending places of the entries naming `entityId`, read as an own property only. */
function positionsOf(history: History, entityId: EntityId): readonly number[] {
  return Object.hasOwn(history.byEntity, entityId) ? (history.byEntity[entityId] ?? []) : [];
}

// ── Entries ──────────────────────────────────────────────────────────────────────────────────

/** The entry at `position`, the History's own; `undefined` past its end. */
export function entryAt(history: History, position: number): Entry | undefined {
  return history.entries[position];
}

/** How many entries the History holds. */
export function historyLength(history: History): number {
  return history.entries.length;
}

/** The newest entry naming `entityId`; `undefined` for an entity the History does not name. */
export function newestNaming(history: History, entityId: EntityId): Entry | undefined {
  const positions = positionsOf(history, entityId);
  return positions.length === 0 ? undefined : history.entries[positions.at(-1) ?? -1];
}

/** Every entity the History names. */
export function namedEntities(history: History): EntityId[] {
  return Object.keys(history.byEntity) as EntityId[];
}

/** `entityId`'s newest entries, newest first, of those `shows` keeps, at most `limit`. */
export function newestEntries(history: History, entityId: EntityId, shows: (entry: Entry) => boolean, limit: number): Entry[] {
  const positions = positionsOf(history, entityId);
  const found: Entry[] = [];
  for (let index = positions.length - 1; index >= 0 && found.length < limit; index -= 1) {
    const entry = history.entries[positions[index] ?? -1];
    if (entry !== undefined && shows(entry)) found.push(entry);
  }
  return found;
}

/**
 * The events of `log`, the last play's, that the History holds: the same objects, among its newest
 * entries, since the engine appends each event it records as it is and leaves out the pool's
 * comings and goings of a Hero never hired (ADR-0008, DL-211).
 */
export function appendedOf(history: History, log: readonly TurnEvent[]): ReadonlySet<object> {
  if (log.length === 0) return new Set();
  const held = new Set<object>(history.entries.slice(-log.length));
  return new Set<object>(log.filter((event) => held.has(event)));
}

// ── A Quest's return ─────────────────────────────────────────────────────────────────────────

/** `key`'s return as the engine reads it: its outcome, the entries naming its Quest, and its night's Levels and dead's gear. */
export function returnEntries(history: History, key: ReturnKey): ReturnRecord | null {
  return returnOf(history, key);
}

/**
 * Whether `entry` is a part of a Party's return, which the player's Guild's History gathers under
 * the return's one entry (DL-111 item 2, DL-113 item 1): an Encounter or a consumable used; a Level
 * of one of its Heroes on the night it came home; and its dead's gear going back that night, the
 * last two the engine's to match (`nightsReturnOf`). Its Loot is not a part: it is the next entry.
 * Nor are its Injuries and Deaths, which stand out beside it (DL-120 item 6).
 */
export function partOfAReturn(history: History, entry: Entry): boolean {
  switch (entry.type) {
    case 'quest.encounter':
    case 'item.expended':
      return true;
    case 'hero.levelled':
    case 'item.returned':
      return nightsReturnOf(history, entry) !== null;
    default:
      return false;
  }
}

/**
 * The entries that stand beside a return, after it, in the player's Guild's History and the rail:
 * its Loot, Injuries and Deaths, and the Traits its Heroes earned (DL-159), written next after them.
 */
export const besideAReturn: ReadonlySet<string> = new Set(['quest.loot', 'hero.injured', 'hero.died', 'hero.trait-gained']);

/**
 * Whether the Hero `heroId` was away with a Party when the History reached `position`: sent on a Quest
 * (`quest.taken`) and not yet home from it (`quest.resolved`), read from their own entries.
 */
export function awayAt(history: History, heroId: HeroId, position: number): boolean {
  let out: unknown = null;
  for (const at of positionsOf(history, heroId)) {
    if (at >= position) break;
    const entry = history.entries[at];
    if (entry?.type === 'quest.taken' && (entry as EngineEventOf<'quest.taken'>).payload.heroIds.includes(heroId)) out = (entry as EngineEventOf<'quest.taken'>).payload.partyId;
    if (entry?.type === 'quest.resolved' && (entry as EngineEventOf<'quest.resolved'>).payload.partyId === out) out = null;
  }
  return out !== null;
}

// ── A Guild's Wealth ─────────────────────────────────────────────────────────────────────────

/**
 * Each change to `guildId`'s Wealth the History holds, newest first, with its entry and its place: the
 * entries naming the Guild that `changeOf` reads as one. Every Wealth event names its Guild (DL-112).
 */
export function wealthChanges<Change extends object>(
  history: History,
  guildId: GuildId,
  changeOf: (entry: Entry) => Change | null,
): (Change & { position: number; entry: Entry })[] {
  const positions = positionsOf(history, guildId);
  const changes: (Change & { position: number; entry: Entry })[] = [];
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const position = positions[index] ?? -1;
    const entry = history.entries[position];
    if (entry === undefined) continue;
    const change = changeOf(entry);
    if (change !== null) changes.push({ ...change, position, entry });
  }
  return changes;
}

/** The first `guild.founded` naming `guildId`, with its place: where its ledger opens (DL-120 item 4); `null` for none. */
export function foundingOf(history: History, guildId: GuildId): { entry: EngineEventOf<'guild.founded'>; position: number } | null {
  const position = positionsOf(history, guildId).find((at) => history.entries[at]?.type === 'guild.founded');
  return position === undefined ? null : { entry: history.entries[position] as EngineEventOf<'guild.founded'>, position };
}

// ── A scope's page ───────────────────────────────────────────────────────────────────────────

/**
 * The positions `scopePositions` found, by History and target, with the History's length then. The
 * History is appended to, never changed, so the positions hold until it grows: a page turned, a
 * choice made or the count read again does not walk it again (DL-119).
 */
const positionsFound = new WeakMap<History, Map<string, { length: number; positions: readonly number[] }>>();

/**
 * The ascending places of the entries a scope shows: for the World History, every entry `shows`
 * keeps; for an entity, those naming it, every one for `shows` null, else those `shows` keeps. Kept
 * for the History and the target until the History grows.
 */
export function scopePositions(history: History, target: EntityId | 'world', shows: ((entry: Entry) => boolean) | null): readonly number[] {
  const found = positionsFound.get(history) ?? new Map<string, { length: number; positions: readonly number[] }>();
  positionsFound.set(history, found);
  const known = found.get(target);
  if (known !== undefined && known.length === history.entries.length) return known.positions;
  const positions = walked(history, target, shows);
  found.set(target, { length: history.entries.length, positions });
  return positions;
}

function walked(history: History, target: EntityId | 'world', shows: ((entry: Entry) => boolean) | null): readonly number[] {
  if (target === 'world') {
    const positions: number[] = [];
    history.entries.forEach((entry, position) => {
      if (shows === null || shows(entry)) positions.push(position);
    });
    return positions;
  }
  const indexed = positionsOf(history, target);
  return shows === null ? indexed : indexed.filter((position) => shows(history.entries[position] as Entry));
}

/** A scope's entries as its pages read them, and what keeps entries together across a page's edge. */
export interface PagedScope {
  /** How many entries the scope shows. */
  count: number;
  /** The place in the History of the scope's `index`-th newest entry, from 0. */
  at: (index: number) => number;
  /** A Party's steps fold under its outcome, so stay on its page: everywhere but the World History and the whole History. */
  foldsSteps: boolean;
  /** A return's Loot, Injuries and Deaths keep it on their page: in the player's Guild's History (DL-120 item 6). */
  keepsReturns: boolean;
}

/** A page of a scope: which, of how many, and its entries' places in the History, newest first. */
export interface HistoryPageRead {
  page: number;
  pages: number;
  positions: number[];
}

/**
 * The page (from 0) of `scope`: `historyPageSize` entries counted from the newest, the steps and
 * the return kept with it as `scope` says (`pageEnd`). Each page starts where the one before ends,
 * so none is empty and `pages` is exact. A page past the last reads as the last; an empty scope has
 * one page, empty.
 */
export function historyPage(history: History, scope: PagedScope, page: number): HistoryPageRead {
  const { entries } = history;
  const starts = [0];
  for (let end = pageEnd(scope, entries, 0); end < scope.count; end = pageEnd(scope, entries, end)) starts.push(end);
  const shown = Math.min(Math.max(0, Math.floor(page)), starts.length - 1);
  const positions: number[] = [];
  for (let index = starts[shown] ?? 0, end = pageEnd(scope, entries, index); index < end; index += 1) positions.push(scope.at(index));
  return { page: shown, pages: starts.length, positions };
}

/** A Party's steps on a Quest, which fold under its outcome: its Encounters and the consumables it used. */
export function isStep(entry: Entry | undefined): boolean {
  return entry?.type === 'quest.encounter' || entry?.type === 'item.expended';
}

/** The Party an entry names in its payload, if any. */
export function partyOf(entry: Entry): unknown {
  return (entry.payload as { partyId?: unknown } | null)?.partyId;
}

/**
 * Where, counted from the newest, the outcome is that the step at `index` folds under: the Quest
 * Engine appends a Party's steps, then its outcome (`quests-conclude.ts`), so from the step, newer,
 * past the Party's other steps of the Turn, comes its `quest.resolved`. `-1` when it is not there.
 */
function outcomeIndex(scope: PagedScope, entries: readonly Entry[], index: number): number {
  const step = entries[scope.at(index)] as Entry;
  for (let newer = index - 1; newer >= 0; newer -= 1) {
    const entry = entries[scope.at(newer)];
    if (entry === undefined || entry.turn !== step.turn || partyOf(entry) !== partyOf(step)) return -1;
    if (entry.type === 'quest.resolved') return newer;
    if (!isStep(entry)) return -1;
  }
  return -1;
}

/**
 * Whether `next`, the entry older than `last`, is the return `last` stands beside, or another of its
 * Loot, Injuries and Deaths (DL-120 item 6): they are written after the return, so newer, and a
 * page that ends on one of them takes its return with it.
 */
function besideItsReturn(last: Entry | undefined, next: Entry | undefined): boolean {
  if (last === undefined || next === undefined || !besideAReturn.has(last.type)) return false;
  const questId = (last.payload as { questId?: unknown }).questId;
  if (questId === null || questId === undefined || (next.payload as { questId?: unknown }).questId !== questId) return false;
  return next.type === 'quest.resolved' || besideAReturn.has(next.type);
}

/**
 * Where the page that starts at `start` ends, counted from the newest: `historyPageSize` entries on,
 * or the scope's end; past that, where it keeps returns, the return whose Loot, Injury or Death ends
 * the page (DL-121); and every step whose outcome the page holds, so that a Party's steps
 * stay with its outcome however many there are.
 */
function pageEnd(scope: PagedScope, entries: readonly Entry[], start: number): number {
  let end = Math.min(scope.count, start + historyPageSize);
  while (scope.keepsReturns && end < scope.count && besideItsReturn(entries[scope.at(end - 1)], entries[scope.at(end)])) end += 1;
  while (scope.foldsSteps && end < scope.count && isStep(entries[scope.at(end)]) && outcomeIndex(scope, entries, end) >= start) end += 1;
  return end;
}
