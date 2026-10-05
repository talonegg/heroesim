// The content's files as the editor reads and writes them: each file's text and its JSON value, under
// a repository's root. A change is written into the file's own text (`editJson`, the portrait tool's),
// so `git diff` shows only what changed.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentFiles, type ContentFileName } from '@heroesim/content';
import type { ContentJson } from '@heroesim/content/uses';
import { editJson } from '@heroesim/content/write';

/** This repository's root, three folders above this file. */
export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** A content file's path under a root. */
export function contentPath(root: string, file: ContentFileName): string {
  return path.join(root, 'content', file);
}

/** The content's files at `root`, as they are on disk: each one's text and its value. A file that is not there is left out. */
export interface ContentOnDisk {
  texts: Partial<Record<ContentFileName, string>>;
  values: ContentJson;
}

export function readContentFiles(root: string): ContentOnDisk {
  const texts: Partial<Record<ContentFileName, string>> = {};
  const values: Partial<Record<ContentFileName, unknown>> = {};
  for (const file of contentFiles) {
    const full = contentPath(root, file);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, 'utf8');
    texts[file] = text;
    try {
      values[file] = JSON.parse(text);
    } catch {
      // Left out: the content's checks name a file that is not JSON.
    }
  }
  return { texts, values };
}

/** The files of `values` that differ from `disk`'s, each with its new text in its old text's layout. */
export function changedTexts(disk: ContentOnDisk, values: ContentJson): Partial<Record<ContentFileName, string>> {
  const changed: Partial<Record<ContentFileName, string>> = {};
  for (const file of contentFiles) {
    const value = values[file];
    if (value === undefined || JSON.stringify(value) === JSON.stringify(disk.values[file])) continue;
    changed[file] = editJson(disk.texts[file] ?? '', value, { keepLines: true });
  }
  return changed;
}

/** Every content file's text, those of `changed` in place of their own: what the content's checks read. */
export function textsWith(disk: ContentOnDisk, changed: Partial<Record<ContentFileName, string>>): Record<string, string> {
  return { ...disk.texts, ...changed } as Record<string, string>;
}
