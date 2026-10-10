import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { formatJson, readContentVersion, Undone } from '@heroesim/content/write';
import { describe, expect, test } from 'vitest';
import { contentFiles, type Edit } from './content-files.js';
import { journalPath, journalState, writeAtomically } from './finish-journal.js';
import type { Kind, Row } from './kind.js';
import { EditSession } from './session.js';
import { git, scratch, status } from './test-support.js';
import type { TestResult, TestRunner } from './tests-run.js';

// DL-260: a kind in a folder of one file a row. The edit session writes each row to its own file, a
// row added making its file, one removed deleting it and one renamed doing both, as one transaction
// under "Finish"'s journal, so that a test that fails or a "Finish" cut off puts every file back.

const passed: TestResult = { ok: true, exitCode: 0, failures: [], tail: [] };
const failed: TestResult = { ok: false, exitCode: 1, failures: ['× planted'], tail: [] };
const passing: TestRunner = () => Promise.resolve(passed);
const failing: TestRunner = () => Promise.resolve(failed);

/** A process number no process holds. */
const gonePid = 2 ** 22 + 7;

/** The Loot tables as a kind of the editor's, in their folder: rows put and taken whole. */
const lootTables: Kind = {
  name: 'loot-tables',
  title: 'Loot tables',
  lists: [{ id: 'loot', title: 'Loot tables', file: 'loot-tables/' }],
  forms: () => [],
  rowFrom: (_list, values, previous) => ({ row: { ...previous, ...values }, problems: [] }),
  put(content, _list, key, row) {
    const rows: Record<string, Row> = { ...(content['loot-tables/'] as Record<string, Row>) };
    if (row === null) delete rows[key];
    else rows[key] = row;
    return { ...content, 'loot-tables/': rows };
  },
  uses: () => [],
  rules: () => [],
  words: () => [],
};

const plain: Row = { entries: [{ definitionKey: 'whetstone', weight: 1, quantityMin: 1, quantityMax: 2 }] };

/** A session over the Loot tables of `dir`, with `edits` held as pending. */
function holding(dir: string, edits: Edit[]): EditSession<Edit, unknown> {
  const session = new EditSession(dir, contentFiles(lootTables));
  session.hold(edits, 0);
  return session;
}

const file = (dir: string, key: string): string => path.join(dir, 'content', 'loot-tables', `${key}.json`);
const lines = (dir: string): string[] => status(dir).split('\n').filter((line) => line !== '').sort();

/** `dir` with the row `plain-loot` added and committed. */
async function withPlain(dir: string): Promise<void> {
  await holding(dir, [{ op: 'add', list: 'loot', key: 'plain-loot', row: plain }]).finish({ runTests: passing });
  git(dir, 'add', '--all');
  git(dir, 'commit', '--quiet', '-m', 'plain-loot');
}

describe("the edit session over a folder's rows", () => {
  test("adds a row as a file of its own, named by its key and laid out as the tool lays out a new file; the result names it", async () => {
    const dir = scratch();
    const version = readContentVersion(dir);

    const finished = await holding(dir, [{ op: 'add', list: 'loot', key: 'plain-loot', row: plain }]).finish({ runTests: passing });

    expect(finished.changed).toEqual(['loot-tables/plain-loot.json']);
    expect(finished.version).toEqual({ from: version, to: version + 1 });
    expect(readFileSync(file(dir, 'plain-loot'), 'utf8')).toBe(formatJson(plain));
    expect(lines(dir)).toEqual([' M content/version.json', '?? content/loot-tables/plain-loot.json']);
  });

  test('changes a row in its own file alone, keeping its layout where its value is unchanged', async () => {
    const dir = scratch();
    const entries = (JSON.parse(readFileSync(file(dir, 'greater-loot'), 'utf8')) as { entries: Row[] }).entries;

    await holding(dir, [{ op: 'change', list: 'loot', key: 'greater-loot', fields: { entries: [...entries.slice(0, -1), { ...entries.at(-1), weight: 7 }] } }]).finish({ runTests: passing });

    expect(lines(dir)).toEqual([' M content/loot-tables/greater-loot.json', ' M content/version.json']);
    expect(git(dir, 'diff', '--numstat', '--', 'content/loot-tables/greater-loot.json').trim()).toBe('1\t1\tcontent/loot-tables/greater-loot.json');
  });

  test('removes a row by deleting its file', async () => {
    const dir = scratch();
    await withPlain(dir);

    const finished = await holding(dir, [{ op: 'remove', list: 'loot', key: 'plain-loot' }]).finish({ runTests: passing });

    expect(finished.changed).toEqual(['loot-tables/plain-loot.json']);
    expect(existsSync(file(dir, 'plain-loot'))).toBe(false);
    expect(lines(dir)).toEqual([' D content/loot-tables/plain-loot.json', ' M content/version.json']);
  });

  test('renames a row, removed and added under another key, by deleting its file and making the other', async () => {
    const dir = scratch();
    await withPlain(dir);

    await holding(dir, [
      { op: 'remove', list: 'loot', key: 'plain-loot' },
      { op: 'add', list: 'loot', key: 'common-loot', row: plain },
    ]).finish({ runTests: passing });

    expect(existsSync(file(dir, 'plain-loot'))).toBe(false);
    expect(readFileSync(file(dir, 'common-loot'), 'utf8')).toBe(formatJson(plain));
    expect(lines(dir)).toEqual([' D content/loot-tables/plain-loot.json', ' M content/version.json', '?? content/loot-tables/common-loot.json']);
  });

  test('a test that fails puts every file back: the file made goes and the file deleted comes back, byte for byte', async () => {
    const dir = scratch();
    await withPlain(dir);
    const before = readFileSync(file(dir, 'plain-loot'));
    const session = holding(dir, [
      { op: 'remove', list: 'loot', key: 'plain-loot' },
      { op: 'add', list: 'loot', key: 'common-loot', row: plain },
    ]);

    const undone = await session.finish({ runTests: failing }).catch((error: unknown) => error);

    expect(undone).toBeInstanceOf(Undone);
    expect(readFileSync(file(dir, 'plain-loot'))).toEqual(before);
    expect(existsSync(file(dir, 'common-loot'))).toBe(false);
    expect(status(dir)).toBe('');
    expect(session.edits()).toHaveLength(2);
  });

  test('a "Finish" cut off, its row files made and deleted, is put back by the next call', async () => {
    const dir = scratch();
    await withPlain(dir);
    const before = readFileSync(file(dir, 'plain-loot'));
    // The disk as a kill leaves it while the tests run: the journal, whose process is gone, the new
    // row's file made and the old one's deleted.
    let journal: string | undefined;
    await holding(dir, [
      { op: 'remove', list: 'loot', key: 'plain-loot' },
      { op: 'add', list: 'loot', key: 'common-loot', row: plain },
    ])
      .finish({
        runTests: (root) => {
          journal = readFileSync(journalPath(root), 'utf8');
          return failing(root, () => {});
        },
      })
      .catch(() => {});
    if (journal === undefined) throw new Error('the tests never ran');
    writeAtomically(journalPath(dir), JSON.stringify({ ...(JSON.parse(journal) as object), pid: gonePid }));
    writeFileSync(file(dir, 'common-loot'), formatJson(plain));
    rmSync(file(dir, 'plain-loot'));
    expect(journalState(dir)).toBe('cut-off');

    const next = new EditSession(dir, contentFiles(lootTables));

    expect(next.edits()).toHaveLength(2);
    expect(next.recovered.map((each) => path.relative(dir, each).replace(/\\/g, '/')).sort()).toEqual([
      'content/loot-tables/common-loot.json',
      'content/loot-tables/plain-loot.json',
      'content/version.json',
    ]);
    expect(readFileSync(file(dir, 'plain-loot'))).toEqual(before);
    expect(existsSync(file(dir, 'common-loot'))).toBe(false);
    expect(status(dir)).toBe('');
  });
});
