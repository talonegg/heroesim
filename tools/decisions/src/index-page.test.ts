import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { repositoryRoot } from './cli.js';
import { indexFreshness, renderIndex, titleLength, writeIndex } from './index-page.js';
import { indexPath, readLog } from './log.js';
import { scratchRepository, smallLog } from './test-support.js';

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});
function scratch(files: Readonly<Record<string, string>>): string {
  const { dir, remove } = scratchRepository(files);
  scratches.push(remove);
  return dir;
}

describe('renderIndex', () => {
  test('one row an entry: its date, title, what superseded it and its file, from the index\'s folder', () => {
    const page = renderIndex(readLog(scratch(smallLog)));
    expect(page).toContain('| DL-01 | 2026-09-25 | The first | item 2 by DL-02; item 4 in part by DL-03 | [DL-001-002-first](archive/DL-001-002-first.md) |');
    expect(page).toContain('| DL-02 | 2026-09-25 | The second \\| with a bar | in part by DL-03 | [DL-001-002-first](archive/DL-001-002-first.md) |');
    expect(page).toContain('| DL-03 | 2026-10-08 | The open one |  | [decision-log](../decision-log.md) |');
    expect(page).toContain('- D3: in part by DL-02');
  });

  test('cuts a long title at a word', () => {
    const long = `${'word '.repeat(40)}end`;
    const page = renderIndex({ entries: [{ id: 'DL-01', number: 1, title: long, date: null, file: 'docs/decision-log.md' }], supersessions: [], problems: [] });
    const title = page.split('\n').find((line) => line.startsWith('| DL-01'))?.split(' | ')[2] ?? '';
    expect(title.endsWith('word …')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(titleLength + 2);
  });
});

describe('the index on disk', () => {
  test('is missing, then written, then current; stale once a heading changes', () => {
    const dir = scratch(smallLog);
    expect(indexFreshness(dir)).toEqual({ ok: false, problems: [`${indexPath} is missing: run \`npm run decisions -- index\``] });
    expect(writeIndex(dir)).toEqual({ ok: true, changed: true });
    expect(writeIndex(dir)).toEqual({ ok: true, changed: false });
    expect(indexFreshness(dir).ok).toBe(true);

    const log = path.join(dir, 'docs/decision-log.md');
    writeFileSync(log, readFileSync(log, 'utf8').replace('The open one', 'The open one, renamed'));
    expect(indexFreshness(dir)).toEqual({ ok: false, problems: [`${indexPath} is stale: run \`npm run decisions -- index\``] });
  });

  test('is current with CRLF endings, as git checks it out on Windows', () => {
    const dir = scratch(smallLog);
    writeIndex(dir);
    const file = path.join(dir, indexPath);
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
    expect(indexFreshness(dir)).toEqual({ ok: true, problems: [] });
    expect(writeIndex(dir)).toEqual({ ok: true, changed: false });
  });

  test("is not written from a log with a problem", () => {
    const dir = scratch({ ...smallLog, 'docs/decisions/archive/superseded/DL-02.md': '## A stray heading\n' });
    expect(writeIndex(dir).ok).toBe(false);
  });

  // Reads the whole decision log and its archives, which takes seconds beside the whole suite's other workers (DL-304).
  test("this repository's index is the one its log makes", { timeout: 30_000 }, () => {
    expect(indexFreshness(repositoryRoot)).toEqual({ ok: true, problems: [] });
  });
});
