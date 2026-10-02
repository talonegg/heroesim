// The two lists of Traits (v1.1.4-S7, DL-150 items 1 and 3): a Guildmaster's in
// `guildmaster-traits.json`, a Hero's in `hero-traits.json`, keyed apart, so a key names a Trait
// of one list or of none. A Guildmaster or a Hero holds 0 or more Traits of their own list, never
// two of which one excludes the other.

import type { ContentSet, Trait, TraitKey } from './content-types.js';

/** What the Traits are read from: both lists. */
export type TraitContent = Pick<ContentSet, 'guildmasterTraits' | 'heroTraits'>;

/** The Trait keyed `key` in either list, or `undefined` for a key content does not define (rule 5). */
export function traitOf(content: TraitContent, key: TraitKey): Trait | undefined {
  if (Object.hasOwn(content.guildmasterTraits, key)) return content.guildmasterTraits[key];
  return Object.hasOwn(content.heroTraits, key) ? content.heroTraits[key] : undefined;
}

/** Whether one of two Traits excludes the other, read from either side. */
export function excludeEachOther(one: Pick<Trait, 'key' | 'excludes'>, other: Pick<Trait, 'key' | 'excludes'>): boolean {
  return one.excludes.includes(other.key) || other.excludes.includes(one.key);
}

/**
 * The first pair of `rows`, in their order, of which one excludes the other: the earlier row first,
 * each later row tried against it before the next earlier row. `null` when no two do.
 */
export function excludedPair<Row extends Pick<Trait, 'key' | 'excludes'>>(rows: readonly Row[]): [Row, Row] | null {
  for (const [index, row] of rows.entries()) {
    for (const other of rows.slice(index + 1)) if (excludeEachOther(row, other)) return [row, other];
  }
  return null;
}
