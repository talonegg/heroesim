import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { contentDir, loadContent } from '../node.js';
import { transaction } from './transaction.js';
import { raiseContentVersion, readContentVersion, versionPath } from './version.js';

// The content version as data (v1.1.6-S4, DL-186 item 14): `content/version.json`, which the tools
// raise by writing JSON, each raise a line of its changelog, and nothing else in the file changed.

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A scratch root holding a copy of this package's content files, `version.json` among them. */
function scratchRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-version-'));
  made.push(dir);
  cpSync(contentDir, path.join(dir, 'content'), { recursive: true, filter: (source) => source === contentDir || source.endsWith('.json') });
  return dir;
}

describe('the content version', () => {
  test("is read from a root's content/version.json, as the content's loader reads it", () => {
    const root = path.join(contentDir, '..');
    expect(versionPath(root)).toBe(path.join(root, 'content', 'version.json'));
    expect(readContentVersion(root)).toBe(loadContent().version);
  });

  test('is raised by one, the changelog given a line saying why, and the rest of the file kept as it was', async () => {
    const root = scratchRoot();
    const before = readFileSync(versionPath(root), 'utf8');
    const from = readContentVersion(root);

    const raised = await transaction(async (files) => raiseContentVersion(root, files, 'the content editor\'s Finish of 2026-10-05 (changed thrifty)'));

    expect(raised).toEqual({ from, to: from + 1 });
    const after = readFileSync(versionPath(root), 'utf8');
    const json = JSON.parse(after) as { version: number; changelog: string[] };
    expect(json.version).toBe(from + 1);
    expect(json.changelog.at(-1)).toBe(`${from + 1} from the content editor's Finish of 2026-10-05 (changed thrifty).`);
    expect(json.changelog.slice(0, -1)).toEqual((JSON.parse(before) as { changelog: string[] }).changelog);
    // The version's line, the last entry's comma and the new entry: no other line changes, and the line ends are kept.
    const [old, next] = [before.split('\n'), after.split('\n')];
    expect(next).toHaveLength(old.length + 1);
    expect(old.filter((line) => !next.includes(line)).map((line) => line.trim())).toEqual([`"version": ${from},`, `${JSON.stringify(json.changelog.at(-2))}`]);
    expect(next.filter((line) => !old.includes(line)).map((line) => line.trim())).toEqual([
      `"version": ${from + 1},`,
      `${JSON.stringify(json.changelog.at(-2))},`,
      JSON.stringify(json.changelog.at(-1)),
    ]);
    expect(after.includes('\r\n')).toBe(before.includes('\r\n'));
    expect(loadContent(path.join(root, 'content')).version).toBe(from + 1);
  });

  test('is put back with the rest of a transaction that fails', async () => {
    const root = scratchRoot();
    const before = readFileSync(versionPath(root), 'utf8');

    await expect(
      transaction(async (files) => {
        raiseContentVersion(root, files, 'a change undone');
        throw new Error('a check failed');
      }),
    ).rejects.toThrow('a check failed');
    expect(readFileSync(versionPath(root), 'utf8')).toBe(before);
  });

  // The tools wrote the version into `content/src/parse.ts` and the number `content.test.ts` pinned, by
  // regular expressions, until v1.1.6-S4: neither tool's source names either file now.
  test("is raised by no tool's regular expression over a TypeScript file", () => {
    const tools = path.join(contentDir, '..', 'tools');
    for (const tool of ['editor', 'portraits']) {
      const dir = path.join(tools, tool, 'src');
      for (const file of readdirSync(dir).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
        const text = readFileSync(path.join(dir, file), 'utf8');
        expect(text, `${tool}/src/${file}`).not.toMatch(/parse\.ts|content\.test\.ts|export const contentVersion|content\.version\)\.toBe/);
      }
    }
  });

  test('is refused, naming the file, where it holds no whole number', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'heroesim-version-'));
    made.push(root);
    mkdirSync(path.join(root, 'content'));
    writeFileSync(versionPath(root), '{ "version": "32", "changelog": [] }\n');
    expect(() => readContentVersion(root)).toThrow(`${versionPath(root)}: no whole number at "version"`);
    writeFileSync(versionPath(root), 'not JSON');
    expect(() => readContentVersion(root)).toThrow(versionPath(root));
  });
});
