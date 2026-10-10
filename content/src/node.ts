// @heroesim/content/node: the content set read from disk. The one file in this package that may
// use Node (approach §5); everything else is the pure entry, which this calls.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentSet } from '@heroesim/engine/content';
import { contentSources, isFolder, parseContent, type ContentSource } from './index.js';

/** This package's directory, where the core content files sit. */
export const contentDir = fileURLToPath(new URL('..', import.meta.url));

/** Whether `dir` holds `source`: its file, or its folder (DL-260). */
function holds(dir: string, source: ContentSource): boolean {
  const path = join(dir, source);
  return existsSync(path) && statSync(path).isDirectory() === isFolder(source);
}

/**
 * The text of `source`'s files in `dir`, by their path in the content directory: its one file, or
 * every `.json` file of its folder, `items/short-sword.json` (DL-260); none where `dir` lacks it.
 */
export function readSource(dir: string, source: ContentSource): Record<string, string> {
  if (!holds(dir, source)) return {};
  if (!isFolder(source)) return { [source]: readFileSync(join(dir, source), 'utf8') };
  const files: Record<string, string> = {};
  for (const name of readdirSync(join(dir, source)).sort()) {
    if (name.endsWith('.json')) files[`${source}${name}`] = readFileSync(join(dir, source, name), 'utf8');
  }
  return files;
}

/** The text of every content file in `dir`, by its path in the content directory: what `parseContent` reads. */
export function readContentDir(dir: string = contentDir): Record<string, string> {
  return Object.assign({}, ...contentSources.map((source) => readSource(dir, source))) as Record<string, string>;
}

/**
 * Read the content files from a directory, then parse and validate them.
 *
 * @param dir the content directory; this package's own by default
 * @throws ContentError naming the file and key of every problem, a missing file included
 */
export function loadContent(dir: string = contentDir): ContentSet {
  return parseContent(readContentDir(dir));
}

/**
 * The content set with each content source `drafts` holds in place of the core's, parsed and
 * validated as the game's is, so that draft content can be read before it is written into
 * `content/` (DL-162: the calibration, the harness's play runs and the review page); a folder drafted
 * is taken whole, in place of the core's folder (DL-260). `drafts` `null` for the core alone. Returns
 * the sources taken from it, in `contentSources`' order.
 *
 * @throws Error when `drafts` is not a directory, or holds no content file (DL-162)
 * @throws ContentError naming the file and key of every problem
 */
export function loadDrafts(drafts: string | null, dir: string = contentDir): { content: ContentSet; drafted: string[] } {
  if (drafts !== null && !(existsSync(drafts) && statSync(drafts).isDirectory())) {
    throw new Error(`The drafts ${drafts} is not a directory`);
  }
  if (drafts !== null && !contentSources.some((source) => holds(drafts, source))) {
    throw new Error(`The drafts directory ${drafts} holds no content file (${contentSources.join(', ')})`);
  }
  const files: Record<string, string> = {};
  const drafted: string[] = [];
  for (const source of contentSources) {
    const drafting = drafts !== null && holds(drafts, source);
    Object.assign(files, readSource(drafting ? drafts : dir, source));
    if (drafting) drafted.push(source);
  }
  return { content: parseContent(files), drafted };
}
