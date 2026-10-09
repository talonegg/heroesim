// How the front ends name things in words (v1.1.6-S11, DL-186 item 1): a content row by its name, a
// list as a sentence gives one, a signed number, and a capital for text that stands alone
// (docs/agents/ui-text.md). Words only; no rule; one copy for the CLI and the page alike
// (DL-197).

/** A content row's name; a key the content does not define is shown as it is (data-model rule 5). */
export function nameIn(rows: Readonly<Record<string, { name: string }>>, key: string): string {
  return Object.hasOwn(rows, key) ? (rows[key]?.name ?? key) : key;
}

/** Standalone text begins with a capital (docs/agents/ui-text.md): `capitalised('weapon')` is `Weapon`. */
export function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** A list as a sentence gives one: `a`, `a and b`, `a, b and c`; or with `or`. */
export function listed(items: readonly string[], word = 'and'): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${word} ${items.at(-1) ?? ''}`;
}

/** `+2`, `-1`, `0`. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
