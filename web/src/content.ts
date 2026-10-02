// The core content set, bundled into the page (M7-S1). Vite inlines every content file as text at
// build time, so the browser reads nothing from disk and requests nothing over the network
// (principle 12). Harvested from v1 (feature/poc) and trimmed to v2's flat directory of JSON.

import { readContent } from '@heroesim/content';
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
 * The content set, read with each row's shape checked (`readContent`). The checks across rows are
 * not carried in the script: the build validates these very files with `parseContent` and fails on
 * any problem (`content-gate.ts`), and content's tests validate them too (v1.1.4-S2's verification,
 * DL-152, superseding DL-64 item 4's call of `parseContent` here). `content.test.ts` holds this set
 * deep-equal to the Node entry's validated one.
 */
export const content: ContentSet = readContent(bundledFiles);
