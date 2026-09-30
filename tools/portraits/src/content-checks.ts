// The content's own checks, run on a repository's `content/` folder: the parser and validator of
// `@heroesim/content`, which judge each row the tool adds or puts in place, whatever its shape.

import path from 'node:path';
import { ContentError } from '@heroesim/content';
import { loadContent } from '@heroesim/content/node';

/** Whether the content at `root` passes its checks, and each problem where it does not. */
export function contentChecks(root: string): { ok: boolean; problems: string[] } {
  try {
    loadContent(path.join(root, 'content'));
    return { ok: true, problems: [] };
  } catch (error) {
    if (error instanceof ContentError) return { ok: false, problems: [...error.problems] };
    return { ok: false, problems: [error instanceof Error ? error.message : String(error)] };
  }
}
