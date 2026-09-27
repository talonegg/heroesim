// How the views name things (M7-S3): a content row by its name, a row of the world by its id, an
// ordinal, a night. Words only; no rule. Shared by `selectors.ts`, `world-views.ts` and
// `trade-views.ts` (DL-73).

import { dayOf, type Guild } from '@heroesim/engine';

/** The row of `rows` keyed by `id`, never one `Object.prototype` lends (`constructor`). */
export function rowOf<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}

/** A content row's name; a key the content does not define is shown as it is (data-model rule 5). */
export function nameIn(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  return rowOf(rows, key)?.name ?? key;
}

export function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** A list joined with commas, or `none`. */
export function none(list: readonly string[]): string {
  return list.length === 0 ? 'none' : list.join(', ');
}

/** `the night of Day 7`. */
export function nightOf(turn: number): string {
  return `the night of Day ${dayOf(turn)}`;
}

/** `1st`, `2nd`, `3rd`, `11th`, `22nd`. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** Who makes a Guild's choices, in the CLI's words (`show guilds`), the player's Guild as `Yours`. */
export function controllerWords(guild: Pick<Guild, 'controller'>): string {
  return guild.controller.kind === 'player' ? 'Yours' : `Rival (${guild.controller.disposition})`;
}

/** `+2`, `-1`, `0`. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
