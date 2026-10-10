import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { contentDir, loadContent, readContentDir } from '../node.js';
import { transaction } from './transaction.js';
import { raiseContentVersion, raisedVersion, readContentVersion, versionPath } from './version.js';

// The content version as data (DL-186 item 14): `content/version.json`, which the tools
// raise by writing JSON, each raise a line of its changelog, and nothing else in the file changed.

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A scratch root holding a copy of this package's content files, `version.json` among them, its folders' rows too (DL-260). */
function scratchRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-version-'));
  made.push(dir);
  for (const [name, text] of Object.entries(readContentDir())) {
    mkdirSync(path.dirname(path.join(dir, 'content', name)), { recursive: true });
    writeFileSync(path.join(dir, 'content', name), text);
  }
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

  // The content version is `content/version.json` (DL-186 item 14): no tool writes it into
  // `content/src/parse.ts` or a number `content.test.ts` pins by a regular expression, and neither
  // tool's source names either file.
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

// Any versioned file's value, `version` and `changelog` beside whatever else it holds, is raised the
// same way: the content version's, and the config version's that the content editor's edit session
// raises (DL-244).
describe('a versioned value', () => {
  test('is raised by one with a line of its changelog saying why, its other fields kept in their order', () => {
    const value = { version: 16, changelog: ['16 from a story.'], sections: { world: { boardSizeMax: 6 } } };
    const raised = raisedVersion(value, 'a trial: boardSizeMax 6 to 7', 'config.json');
    expect(raised).toEqual({ from: 16, to: 17, value: { version: 17, changelog: ['16 from a story.', '17 from a trial: boardSizeMax 6 to 7.'], sections: { world: { boardSizeMax: 6 } } } });
    expect(Object.keys(raised.value)).toEqual(['version', 'changelog', 'sections']);
    expect(value.version).toBe(16);
  });

  test('is refused, naming its file, where it holds no version or no changelog', () => {
    expect(() => raisedVersion({ version: 1.5, changelog: [] }, 'why', 'a.json')).toThrow('a.json: no whole number at "version"');
    expect(() => raisedVersion({ version: 1 }, 'why', 'a.json')).toThrow('a.json: no list at "changelog"');
    expect(() => raisedVersion([], 'why', 'a.json')).toThrow('a.json: no whole number at "version"');
  });
});
