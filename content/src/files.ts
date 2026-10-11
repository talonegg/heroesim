// Where the content set's kinds sit in the content directory. Pure: the page's script reads them too.
//
// A kind's source is one file, `stats.json`, or a folder of one file a row, `items/`, each named by
// its row's key, `items/short-sword.json` (DL-260). The kind declares which (`kinds/`); the readers,
// the Node entry and the tools take it from there. Content's files are named by their path in the
// content directory, with `/` between a folder and its file whatever the system.

/** The content set this package holds, as `meta.content` records it. */
export const contentSetId = 'core';

/** Where a kind's content sits: one file, or a folder of one file a row. */
export type ContentSource = `${string}.json` | `${string}/`;

/** Whether `source` is a folder of one file a row. */
export function isFolder(source: ContentSource): source is `${string}/` {
  return source.endsWith('/');
}

/** The file of the row `key` in the folder `source`: `items/short-sword.json`. */
export function rowFile(source: `${string}/`, key: string): string {
  return `${source}${key}.json`;
}

/** The key of the row whose file is `name` in the folder `source`, or `null` where it is no row's file there. */
export function rowKeyOf(source: `${string}/`, name: string): string | null {
  if (!name.startsWith(source) || !name.endsWith('.json')) return null;
  const key = name.slice(source.length, -'.json'.length);
  return key === '' || key.includes('/') ? null : key;
}

/** Code-unit order, the engine's for keys (DL-19 item 3), the same on every system and in every locale. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The rows of the folder `source` among `names`, the files' names, as `[key, name]` in key order: the
 * order a folder's rows are read in, since a folder has none of its own (DL-260).
 */
export function rowFilesIn(source: `${string}/`, names: Iterable<string>): [string, string][] {
  const rows: [string, string][] = [];
  for (const name of names) {
    const key = rowKeyOf(source, name);
    if (key !== null) rows.push([key, name]);
  }
  return rows.sort(([a], [b]) => byCodeUnit(a, b));
}

/**
 * A place in content in words, as a refusal names it: the file, then the path in it. A path into a
 * folder's table starts with its row's key, which names the row's file: `encounters/the-long-march.json:
 * consequences.failure.0` where a one-file kind's reads `injuries.json: deep-cut.leavesTrait`.
 */
export function placeOf(source: ContentSource, path: readonly (string | number)[]): string {
  if (!isFolder(source)) return `${source}: ${path.join('.')}`;
  const [key, ...rest] = path;
  if (key === undefined) return source;
  const file = rowFile(source, String(key));
  return rest.length === 0 ? file : `${file}: ${rest.join('.')}`;
}
