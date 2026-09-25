// @heroesim/content/node: the content set read from disk. The one file in this package that may
// use Node (approach §5); everything else is the pure entry, which this calls.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentSet } from '@heroesim/engine';
import { contentFiles, parseContent } from './index.js';

/** This package's directory, where the core content files sit. */
export const contentDir = fileURLToPath(new URL('..', import.meta.url));

/**
 * Read the content files from a directory, then parse and validate them.
 *
 * @param dir the content directory; this package's own by default
 * @throws ContentError naming the file and key of every problem, a missing file included
 */
export function loadContent(dir: string = contentDir): ContentSet {
  const files: Record<string, string> = {};
  for (const name of contentFiles) {
    const path = join(dir, name);
    if (existsSync(path)) files[name] = readFileSync(path, 'utf8');
  }
  return parseContent(files);
}
