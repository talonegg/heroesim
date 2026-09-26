// The core content set, bundled into the page (M7-S1). Vite inlines every content file as text at
// build time, so the browser reads nothing from disk and requests nothing over the network
// (principle 12). Harvested from v1 (feature/poc) and trimmed to v2's flat directory of JSON.

import { parseContent } from '@heroesim/content';
import type { ContentSet } from '@heroesim/engine';

/**
 * Every JSON file in the content directory as raw text, keyed by the path Vite resolved it from
 * (`../../content/stats.json`). The package's own manifests are not content and stay out of the
 * bundle.
 */
const bundled = import.meta.glob<string>(
  ['../../content/*.json', '!**/package.json', '!**/tsconfig.json'],
  { query: '?raw', import: 'default', eager: true },
);

/** A bundler key's file name, as the content directory names it: `stats.json`. */
export function fileNameOf(key: string): string {
  return key.slice(key.replace(/\\/g, '/').lastIndexOf('/') + 1);
}

/** The bundled files' text by file name, the shape `parseContent` takes. Exported for a test. */
export const bundledFiles: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(bundled).map(([key, text]) => [fileNameOf(key), text]),
);

/**
 * The parsed and validated content set: `parseContent` runs `validateContent` before it returns
 * (content/src/parse.ts), exactly as the Node entry's `loadContent` relies on, so it is not run a
 * second time here (DL-64).
 */
export const content: ContentSet = parseContent(bundledFiles);
