/**
 * The authored content, bundled into the page (E8-S1). Vite inlines every TOML file
 * under `content/` at build time, so nothing is read from disk and nothing is fetched
 * over the network — the browser never makes a request (CLAUDE.md invariant 9).
 *
 * This and `state/` are the only places in `web/` allowed to call into `@heroesim/*`
 * values; `tests/engine-imports.test.ts` enforces that.
 */

import { parseContent } from '@heroesim/content';
import type { Content } from '@heroesim/engine';

/**
 * Every TOML file under the content directory, as raw text, keyed by the path Vite
 * resolved it from — `../../content/traits.toml`, `/content/vignettes/night-attack.toml`
 * and so on, depending on how the bundler was invoked.
 */
const bundled = import.meta.glob('../../content/**/*.toml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const CONTENT_DIRECTORY = 'content/';

/**
 * Turn a bundler key into the path `parseContent` expects: relative to the content
 * directory, with forward slashes — `traits.toml`, `vignettes/night-attack.toml`.
 */
export function contentPathOf(key: string): string {
  const normalised = key.replace(/\\/g, '/');
  const at = normalised.lastIndexOf(`/${CONTENT_DIRECTORY}`);
  if (at !== -1) return normalised.slice(at + CONTENT_DIRECTORY.length + 1);
  if (normalised.startsWith(CONTENT_DIRECTORY)) return normalised.slice(CONTENT_DIRECTORY.length);
  return normalised.replace(/^.*\//, '');
}

/** The bundled files, keyed as `parseContent` wants them. Exported so a test can read it. */
export const contentFiles: Record<string, string> = Object.fromEntries(
  Object.entries(bundled).map(([key, text]) => [contentPathOf(key), text]),
);

/**
 * The validated content. `parseContent` returns a `Content` that has already been
 * through the engine's `validateContent`, so it is not validated a second time here.
 */
export const content: Content = parseContent(contentFiles);
