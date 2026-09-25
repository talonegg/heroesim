// What the generators share: which stream they draw from, and the few ways they draw from
// content (DL-19). Every function takes a fixed number of draws for its arguments' sizes, never
// one that depends on the values drawn.

import type { Names } from '../content-types.js';
import type { Sex, World } from '../document.js';
import { int, pick, shuffle, type StreamName } from '../rng.js';

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
  const state = Object.hasOwn(world.rng, name) ? world.rng[name] : undefined;
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
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The keys of `sortedRows(table, keep)`. */
export function sortedKeys<Row extends { key: string }>(
  table: Record<string, Row>,
  keep: (row: Row) => boolean = () => true,
): string[] {
  return sortedRows(table, keep).map((row) => row.key);
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
  const free = names.filter((name) => !used.has(name));
  if (free.length === 0) throw new RangeError(`Every ${what} name in content is already in use`);
  return pick(state, free);
}

/** The sexes a person is generated with, in draw order. */
export const sexes: readonly Sex[] = ['female', 'male'];

/** A person's name: a given name for their sex, then a family name. Two draws. */
export function drawPersonName(state: Stream, names: Names, sex: Sex): string {
  const given = pick(state, names.given[sex]);
  const family = pick(state, names.family);
  return `${given} ${family}`;
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
