// The content gate (v1.1.4-S2's verification, DL-152): the page's script carries the content's
// shape-only reader, `readContent`, not the checks across rows, which are tens of kilobytes of the
// 800 kB script. So the build validates the very files it bundles, with `parseContent`, the path the
// CLI and the harness take, and fails on any problem: no script is built from content the checks
// refuse. Content's own tests validate the same files.
//
// The configuration imports this, and through it the content package's TypeScript, so Vite loads it
// with its module runner (`--configLoader runner` in package.json's scripts): the default loader
// leaves a workspace package to Node, which cannot resolve its `.js` imports of `.ts` files.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { contentFiles, parseContent } from '@heroesim/content';
import type { Plugin } from 'vite';

/** Validates every content file in `dir` (`parseContent`); throws the `ContentError` naming each problem. */
export async function validateContentDir(dir: string): Promise<void> {
  const names = new Set<string>(contentFiles);
  const files: Record<string, string> = {};
  for (const name of await readdir(dir)) {
    if (names.has(name)) files[name] = await readFile(path.join(dir, name), 'utf8');
  }
  parseContent(files);
}

/** A build-only plugin that validates the content in `dir` as the build starts, failing it on any problem. */
export function contentGate(dir: string): Plugin {
  return {
    name: 'heroesim:content-gate',
    apply: 'build',
    async buildStart() {
      await validateContentDir(dir);
    },
  };
}
