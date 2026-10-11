// The content's own checks, run on a repository's `content/` folder or on files' text: the parser and
// validator of `@heroesim/content`, which judge each row a tool adds or puts in place, whatever its
// shape.

import path from 'node:path';
import { ContentError, parseContent } from '../index.js';
import { loadContent, readContentDir } from '../node.js';

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

/** The content's files at `root` as text, by their path in the content directory, each of `instead` in place of its own. */
export function contentTexts(root: string, instead: Readonly<Record<string, string>> = {}): Record<string, string> {
  return { ...readContentDir(path.join(root, 'content')), ...instead };
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
