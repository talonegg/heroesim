// What the generators share: which stream they draw from, and the few ways they draw from
// content (DL-19). Every function takes a fixed number of draws for its arguments' sizes, never
// one that depends on the values drawn.

import type { Names } from '../content-types.js';
import { compareByCodeUnit, rowOf, type Sex, type World } from '../document.js';
import { int, next, pick, shuffle, weightedPick, type StreamName } from '../rng.js';

/** A stream's state, reached through `world.rng` as the rest of the engine reaches it (M1-S2). */
export type Stream = World['rng'][StreamName];

/** What every generator's options include: the stream it draws from (pre-M0 review D7). */
export interface DrawsFrom {
  /** `generation` when omitted; M2-S8's pool refresh names `pool`. */
  stream?: StreamName;
}

/** The stream a generator draws from unless its caller names another. */
export const defaultStream: StreamName = 'generation';

/** The state of `world`'s stream `name`. Throws when the world has no such stream. */
export function streamOf(world: World, name: StreamName = defaultStream): Stream {
  const state = rowOf(world.rng, name);
  if (state === undefined) throw new RangeError(`The world has no random stream named ${JSON.stringify(name)}`);
  return state;
}

/**
 * `table`'s rows that pass `keep`, sorted by key in code-unit order, so that what a draw picks
 * does not depend on the order content's rows were written or assembled in (DL-19 item 3).
 */
export function sortedRows<Row extends { key: string }>(
  table: Record<string, Row>,
  keep: (row: Row) => boolean = () => true,
): Row[] {
  return Object.values(table)
    .filter(keep)
    .sort((a, b) => compareByCodeUnit(a.key, b.key));
}

/** The keys of `sortedRows(table, keep)`. */
export function sortedKeys<Row extends { key: string }>(
  table: Record<string, Row>,
  keep: (row: Row) => boolean = () => true,
): string[] {
  return sortedRows(table, keep).map((row) => row.key);
}

/** A row's weight in a draw: its `weight`, 1 when it has none (v1.1.6-S16, DL-202). */
export const weightOf = (row: { weight?: number }): number => row.weight ?? 1;

/**
 * One of `rows`, each drawn in proportion to its weight, from one draw (v1.1.6-S16, DL-186 item 16,
 * DL-202): with every weight 1, which is every row's when none has a `weight`, the row `pick` picks from
 * the same state, so a game plays as it did before rows were weighted. Throws on an empty list.
 */
export function pickByWeight<Row extends { weight?: number }>(state: Stream, rows: readonly Row[]): Row {
  return weightedPick(state, rows, rows.map(weightOf));
}

/**
 * `count` items from `items`, every item once before any twice: each round of `items` is a fresh
 * shuffle, and the last round is cut short (DL-19 item 7). One shuffle per round begun.
 */
export function dealEvenly<T>(state: Stream, items: readonly T[], count: number): T[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError(`Cannot deal ${count} items`);
  if (count > 0 && items.length === 0) throw new RangeError(`Cannot deal ${count} items from none`);
  const dealt: T[] = [];
  while (dealt.length < count) dealt.push(...shuffle(state, items).slice(0, count - dealt.length));
  return dealt;
}

/**
 * One of `names` that is not in `used`, in one draw. Throws when every name is used, naming
 * `what` the names are for.
 */
export function pickUnused(state: Stream, names: readonly string[], used: ReadonlySet<string>, what: string): string {
  return pickUnusedBy(state, names, (name) => name, used, what);
}

/**
 * One of `rows` whose `nameOf` is not in `used`, in one draw: what `pickUnused` draws from the rows'
 * names, the same rows in the same order, so the row drawn is the one whose name `pickUnused` would
 * draw (a Patron's name with its sex, v1.1.2-S3). Throws when every name is used.
 */
export function pickUnusedBy<Row>(
  state: Stream,
  rows: readonly Row[],
  nameOf: (row: Row) => string,
  used: ReadonlySet<string>,
  what: string,
): Row {
  const free = rows.filter((row) => !used.has(nameOf(row)));
  if (free.length === 0) throw new RangeError(`Every ${what} name in content is already in use`);
  return pick(state, free);
}

/**
 * One of `items`, each equally likely, or `null` when there are none, from exactly one draw either
 * way (v1.1.2-S3): how many there are to choose from, none included, never moves a later draw. What
 * it picks from a list is what `pick` picks from the same state.
 */
export function pickOrNone<T>(state: Stream, items: readonly T[]): T | null {
  if (items.length === 0) {
    next(state);
    return null;
  }
  return pick(state, items);
}

/**
 * One of `items`, each equally likely, taking exactly `draws` draws: the first picks, as `pick`
 * draws, and the rest are spent, so that how many items there are to choose from never moves a
 * later draw (DL-109 item 1: a Guildmaster's legal sets of Traits). With no draw to take, the one
 * item is taken. Throws on an empty list, a count of draws that is not a whole number from 0, or
 * several items and no draw to choose between them.
 */
export function pickInDraws<T>(state: Stream, items: readonly T[], draws: number): T {
  if (!Number.isSafeInteger(draws) || draws < 0) throw new RangeError(`A count of draws is a whole number from 0; got ${draws}`);
  if (draws === 0) {
    if (items.length !== 1) throw new RangeError(`With no draw to take there must be one item; got ${items.length}`);
    return items[0] as T;
  }
  const item = pick(state, items);
  for (let spent = 1; spent < draws; spent += 1) next(state);
  return item;
}

/**
 * The sexes a person is generated with, in draw order, and the ones a setup may choose for its
 * Guildmaster (`setupRefusal`). Exported from the engine for the front ends to offer (the M9 review).
 */
export const sexes: readonly Sex[] = Object.freeze(['female', 'male'] as const);

/** A person's name: a given name for their sex, then a family name. Two draws. */
export function drawPersonName(state: Stream, names: Names, sex: Sex): string {
  const given = pick(state, names.given[sex]);
  const family = pick(state, names.family);
  return `${given} ${family}`;
}

/**
 * A person's name that is not in `used`: a given name for their sex and a family name, drawn in one
 * draw from the pairs no one in `used` has, each pair equally likely (M9-S2, a successor's name).
 * Throws when every pair is in use.
 */
export function drawUnusedPersonName(state: Stream, names: Names, sex: Sex, used: ReadonlySet<string>): string {
  const pairs = names.given[sex].flatMap((given) => names.family.map((family) => `${given} ${family}`));
  return pickUnused(state, pairs, used, `${sex} person's`);
}

/** `value` held inside `[floor, ceiling]`. */
export function clamp(value: number, floor: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(floor, value));
}

/**
 * How many of `available` things to take: `int(min, max)` held inside `[0, available]`. One
 * draw, so a config range wider than the content never changes the draws after it.
 */
export function drawCount(state: Stream, min: number, max: number, available: number): number {
  return clamp(int(state, min, max), 0, available);
}

/** Throws unless `name` has some character other than white space: a front end checks first. */
export function checkName(name: string, what: string): void {
  if (name.trim() === '') throw new RangeError(`A ${what} needs a name; got ${JSON.stringify(name)}`);
}
