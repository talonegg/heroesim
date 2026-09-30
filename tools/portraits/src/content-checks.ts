// The content's own checks, run on a repository's `content/` folder: the parser and validator of
// `@heroesim/content`, which judge each row the tool adds or puts in place, whatever its shape.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ContentError, contentFiles, parseContent } from '@heroesim/content';
import { loadContent } from '@heroesim/content/node';

function problemsOf(error: unknown): string[] {
  if (error instanceof ContentError) return [...error.problems];
  return [error instanceof Error ? error.message : String(error)];
}

/** Whether the content at `root` passes its checks, and each problem where it does not. */
export function contentChecks(root: string): { ok: boolean; problems: string[] } {
  try {
    loadContent(path.join(root, 'content'));
    return { ok: true, problems: [] };
  } catch (error) {
    return { ok: false, problems: problemsOf(error) };
  }
}

/** The content's files at `root` as text, by name, each of `instead` in place of its own (v1.1.3-S3). */
export function contentTexts(root: string, instead: Readonly<Record<string, string>> = {}): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of contentFiles) {
    const file = path.join(root, 'content', name);
    if (existsSync(file)) files[name] = readFileSync(file, 'utf8');
  }
  return { ...files, ...instead };
}

/** Whether content of these files passes its checks, and each problem where it does not (v1.1.3-S3). */
export function textChecks(files: Readonly<Record<string, string>>): { ok: boolean; problems: string[] } {
  try {
    parseContent(files);
    return { ok: true, problems: [] };
  } catch (error) {
    return { ok: false, problems: problemsOf(error) };
  }
}
