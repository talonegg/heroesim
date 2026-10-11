// The core content set, bundled into the page (M7-S1). Vite inlines every content file as text at
// build time, so the browser reads nothing from disk and requests nothing over the network
// (principle 12). Harvested from v1 (feature/poc) and trimmed to v2's directory of JSON: a kind's one
// file, or its folder of one file a row (DL-260).

import { readContent } from '@heroesim/content';
import type { ContentSet } from '@heroesim/engine';

/**
 * Every JSON file in the content directory and in its folders as raw text, keyed by the path Vite
 * resolved it from (`../../content/stats.json`, `../../content/items/short-sword.json`): a folder's
 * rows found by the pattern, with no list of them kept (DL-260). The package's own manifests and its
 * source are not content and stay out of the bundle.
 */
const bundled = import.meta.glob<string>(
  // The negations name the files as the pattern does: `!**/package.json` matches no `../../content/`
  // path, and would let both manifests into the bundle (DL-157).
  ['../../content/*.json', '../../content/*/*.json', '!../../content/package.json', '!../../content/tsconfig.json', '!../../content/src/**', '!../../content/dist/**'],
  { query: '?raw', import: 'default', eager: true },
);

/** A bundler key's path in the content directory, as the content names its files: `stats.json`, `items/short-sword.json`. */
export function fileNameOf(key: string): string {
  const path = key.replace(/\\/g, '/');
  return path.slice(path.lastIndexOf('/content/') + '/content/'.length);
}

/** The bundled files' text by their path in the content directory, the shape `parseContent` takes. Exported for a test. */
export const bundledFiles: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(bundled).map(([key, text]) => [fileNameOf(key), text]),
);

/**
 * The content set, read with each row's shape checked (`readContent`). The checks across rows are
 * not carried in the script: the build validates these very files with `parseContent` and fails on
 * any problem (`content-gate.ts`), and content's tests validate them too (v1.1.4-S2's verification,
 * DL-152, superseding DL-64 item 4's call of `parseContent` here). `content.test.ts` holds this set
 * deep-equal to the Node entry's validated one.
 */
export const content: ContentSet = readContent(bundledFiles);
