// The History (ADR-0008, data-model §4): append-only, shared by reference between the documents
// of successive Turns, never copied. `append` is its only writer and this module exports no
// other mutator; the readers never write, and return new arrays of the stored entries.
//
// `append` maintains three indexes, each a list of ascending positions in `entries`, so that a
// Hero's page, a counter or a Turn range never scans the whole log:
//   byEntity    per participant: a Hero's page is its list read from the end
//   byType      per event type: the harness's counters are the lengths
//   milestones  the Milestones
//
// The choices the epic left open (the bounds of `entriesBetween`, paging, what `append` checks,
// and that it does not freeze) are DL-18.

import { parseId, type EntityId, type Entry, type EventType, type History, type Turn } from './document.js';

/** An empty History. */
export function createHistory(): History {
  return { entries: [], byEntity: {}, byType: {}, milestones: [] };
}

/**
 * Appends `entry` to `history` and indexes it; returns its position, which is its sequence
 * number. The entry is stored as given, neither copied nor frozen: from now on it belongs to
 * the History and nothing may change it (data-model rule 3). An entity listed twice among the
 * participants is indexed once.
 *
 * Throws, changing nothing, on a programming error: a `type` without the dot of
 * `<entity>.<what-happened>`, a participant that is not an entity id, or a `turn` that is not a
 * whole number from 0 or is lower than the last entry's (entries arrive in Turn order, so a Turn
 * range is a binary search). These are what the indexes and the search rely on; whether the
 * entry is JSON-safe is the validator's check (DL-18).
 */
export function append(history: History, entry: Entry): number {
  checkEntry(history, entry);

  const position = history.entries.length;
  history.entries.push(entry);
  for (const id of entry.participants) {
    const positions = positionsOf(history.byEntity, id);
    if (positions === undefined) history.byEntity[id] = [position];
    // A second listing in the same entry finds this position already last.
    else if (positions[positions.length - 1] !== position) positions.push(position);
  }
  const typed = positionsOf(history.byType, entry.type);
  if (typed === undefined) history.byType[entry.type] = [position];
  else typed.push(position);
  if (entry.milestone) history.milestones.push(position);
  return position;
}

/** Which page of an entity's entries to read, counted from the newest. */
export interface HistoryPage {
  /** How many of the newest entries to skip: 0, the default, starts at the newest. */
  from?: number;
  /** The most entries to return; every remaining entry when omitted. */
  limit?: number;
}

/**
 * The entries naming `entityId` among their participants, newest first: `{ from: 20, limit: 10 }`
 * is the third page of ten. Empty for an entity with no entries and for a page past the end.
 * Throws on a `from` or `limit` that is not a whole number from 0.
 */
export function entriesFor(history: History, entityId: EntityId, page: HistoryPage = {}): Entry[] {
  const { from = 0, limit } = page;
  checkWholeNumber('from', from);
  if (limit !== undefined) checkWholeNumber('limit', limit);

  const positions = positionsOf(history.byEntity, entityId) ?? [];
  const end = positions.length - from;
  const start = limit === undefined ? 0 : Math.max(0, end - limit);
  const found: Entry[] = [];
  for (let index = end - 1; index >= start; index -= 1) found.push(entryAt(history, positions[index]));
  return found;
}

/**
 * The entries from Turn `fromTurn` up to but not including Turn `toTurn`, oldest first. The
 * range is half-open, like `Array.prototype.slice`, so consecutive ranges tile without overlap:
 * Turn `t` alone is `entriesBetween(history, t, t + 1)`, year `y` runs from `y × turnsPerYear`
 * to `(y + 1) × turnsPerYear`, and either bound may be an infinity. Empty when
 * `toTurn <= fromTurn`. Two binary searches on `entries` and one slice; throws on a NaN bound.
 */
export function entriesBetween(history: History, fromTurn: Turn, toTurn: Turn): Entry[] {
  if (Number.isNaN(fromTurn) || Number.isNaN(toTurn)) {
    throw new RangeError(`A Turn range needs two numbers; got ${fromTurn} to ${toTurn}`);
  }
  const start = firstAtOrAfter(history.entries, fromTurn, 0);
  // The end is never before the start: an entry at or after `fromTurn` is past a lower `toTurn` too.
  const end = firstAtOrAfter(history.entries, toTurn, start);
  return history.entries.slice(start, end);
}

/** How many entries of `type` the History holds: 0 for a type never appended. */
export function count(history: History, type: EventType): number {
  return positionsOf(history.byType, type)?.length ?? 0;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────

/**
 * An index's list for `key`, read as an own property only, so that a key of `Object.prototype`
 * (`constructor`, `__proto__`) reads as absent in a History built here or parsed from JSON.
 */
function positionsOf<Key extends string>(index: Record<Key, number[]>, key: Key): number[] | undefined {
  return Object.hasOwn(index, key) ? index[key] : undefined;
}

function entryAt(history: History, position: number | undefined): Entry {
  const found = position === undefined ? undefined : history.entries[position];
  if (found === undefined) throw new RangeError(`An index names position ${position}, outside the History's entries`);
  return found;
}

/**
 * The index keys are checked first: a type always has a dot and an id is always
 * `<table>-<six digits>`, so no key an index is written under can be one of Object.prototype's.
 */
function checkEntry(history: History, entry: Entry): void {
  const { turn, type, participants } = entry;
  if (typeof type !== 'string' || !type.includes('.')) {
    throw new TypeError(`An event type is <entity>.<what-happened>; got ${JSON.stringify(type)}`);
  }
  for (const id of participants) {
    if (parseId(id) === null) throw new TypeError(`A participant is an entity id; ${type} names ${JSON.stringify(id)}`);
  }
  if (!Number.isSafeInteger(turn) || turn < 0) {
    throw new RangeError(`An entry's Turn is a whole number from 0; ${type} has ${turn}`);
  }
  const last = history.entries.at(-1);
  if (last !== undefined && turn < last.turn) {
    throw new RangeError(`Entries arrive in Turn order: ${type} at Turn ${turn} follows ${last.type} at Turn ${last.turn}`);
  }
}

function checkWholeNumber(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`A page's ${name} is a whole number from 0; got ${value}`);
}

/** The first position from `low` on whose entry's Turn is not below `turn`: a lower bound. */
function firstAtOrAfter(entries: readonly Entry[], turn: Turn, low: number): number {
  let lo = low;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((entries[mid]?.turn ?? turn) < turn) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
