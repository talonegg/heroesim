/**
 * The Node entry point: reads the content directory from disk and parses it. The pure
 * entry point (`.`) stays free of `node:fs` so the browser bundle can import it; this is
 * where the file reading lives (DL-03).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Content } from '@heroesim/engine';
import { CONTENT_FILES, parseContent } from './index.js';

export { PACKAGE_NAME } from './index.js';

const SKIPPED = new Set(['node_modules', 'dist', 'coverage']);

/**
 * The content package's own directory: walk up from this module until `traits.toml` is
 * beside us, so the loader works from the TypeScript source and from a compiled copy.
 */
function contentDirectory(): string {
  let here = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      readFileSync(join(here, CONTENT_FILES.traits));
      return here;
    } catch {
      const parent = dirname(here);
      if (parent === here) {
        throw new Error(`could not find ${CONTENT_FILES.traits} above ${dirname(fileURLToPath(import.meta.url))}`);
      }
      here = parent;
    }
  }
}

function collect(root: string, directory: string, files: Record<string, string>): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      collect(root, full, files);
    } else if (entry.isFile() && entry.name.endsWith('.toml')) {
      files[relative(root, full).split(sep).join('/')] = readFileSync(full, 'utf8');
    }
  }
}

/**
 * Read every `.toml` file under a directory and parse it as content.
 *
 * @param dir the content directory. Defaults to this package's own.
 * @throws ContentError naming the file and field for anything malformed or missing
 */
export function loadContentFromDisk(dir?: string): Content {
  const root = dir === undefined ? contentDirectory() : resolve(dir);
  const files: Record<string, string> = {};
  collect(root, root, files);
  return parseContent(files);
}
