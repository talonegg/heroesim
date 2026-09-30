// The content version (`contentVersion` in `content/src/parse.ts`) is raised whenever the content
// changes, so a document says which content it was created under; each intake and each apply raises
// it by one (v1.1.3 epic §2). The content's own test pins the number, and is raised with it.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Transaction } from './transaction.js';

const declaration = /(\r?\n \*\/\r?\nexport const contentVersion = )(\d+);/;
const pinned = /expect\(content\.version\)\.toBe\((\d+)\);/;

/** The files that hold the version, under a repository's root. */
export function versionFiles(root: string): { parse: string; test: string } {
  return { parse: path.join(root, 'content', 'src', 'parse.ts'), test: path.join(root, 'content', 'src', 'content.test.ts') };
}

/** The content version a repository holds. */
export function readContentVersion(root: string): number {
  const { parse } = versionFiles(root);
  const match = declaration.exec(readFileSync(parse, 'utf8'));
  if (match === null) throw new Error(`${parse}: no \`export const contentVersion = <n>;\` after its comment`);
  return Number(match[2]);
}

/**
 * Raises the content version by one, adding to its comment a line that says why, and raises the
 * number the content's test pins where it pins the old one.
 *
 * @param why what raised it, as a sentence's end: `the portrait tool's intake of 2026-10-02 (…)`
 */
export function raiseContentVersion(root: string, files: Transaction, why: string): { from: number; to: number } {
  const { parse, test } = versionFiles(root);
  const from = readContentVersion(root);
  const to = from + 1;
  const text = readFileSync(parse, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  files.write(parse, text.replace(declaration, `${eol} * ${to} from ${why}.$1${to};`));
  let testText: string | null = null;
  try {
    testText = readFileSync(test, 'utf8');
  } catch {
    // No test to raise: a scratch copy may hold only the source.
  }
  if (testText !== null) {
    const match = pinned.exec(testText);
    if (match !== null && Number(match[1]) === from) files.write(test, testText.replace(pinned, `expect(content.version).toBe(${to});`));
  }
  return { from, to };
}
