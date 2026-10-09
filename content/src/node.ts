// @heroesim/content/node: the content set read from disk. The one file in this package that may
// use Node (approach §5); everything else is the pure entry, which this calls.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentSet } from '@heroesim/engine/content';
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

/**
 * The content set with each content file `drafts` holds in place of the core file of its name, parsed
 * and validated as the game's is, so that draft content can be read before it is written into
 * `content/` (v1.1.4-S9, DL-162: the calibration, the harness's play runs and the review page);
 * `drafts` `null` for the core alone. Returns the files taken from it, in `contentFiles`' order.
 *
 * @throws Error when `drafts` is not a directory, or holds no content file (the verification, DL-162)
 * @throws ContentError naming the file and key of every problem
 */
export function loadDrafts(drafts: string | null, dir: string = contentDir): { content: ContentSet; drafted: string[] } {
  if (drafts !== null && !(existsSync(drafts) && statSync(drafts).isDirectory())) {
    throw new Error(`The drafts ${drafts} is not a directory`);
  }
  if (drafts !== null && !contentFiles.some((name) => existsSync(join(drafts, name)))) {
    throw new Error(`The drafts directory ${drafts} holds no content file (${contentFiles.join(', ')})`);
  }
  const files: Record<string, string> = {};
  const drafted: string[] = [];
  for (const name of contentFiles) {
    const draft = drafts === null ? null : join(drafts, name);
    if (draft !== null && existsSync(draft)) {
      files[name] = readFileSync(draft, 'utf8');
      drafted.push(name);
    } else if (existsSync(join(dir, name))) {
      files[name] = readFileSync(join(dir, name), 'utf8');
    }
  }
  return { content: parseContent(files), drafted };
}
