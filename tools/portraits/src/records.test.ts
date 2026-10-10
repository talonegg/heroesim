import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { run } from './cli.js';
import { nextRun, today } from './records.js';

// The files the tool writes: runs named by date. JSON written as the content keeps it, and
// every change of a command undone together, are `@heroesim/content/write`'s.

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function scratch(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-records-'));
  made.push(dir);
  return dir;
}

describe('nextRun()', () => {
  test('names a run by its date, and a second run on a day <date>-2, a third -3', () => {
    const dir = scratch();
    expect(nextRun(dir, '2026-10-02')).toBe('2026-10-02');
    writeFileSync(path.join(dir, '2026-10-02.md'), '');
    expect(nextRun(dir, '2026-10-02')).toBe('2026-10-02-2');
    mkdirSync(path.join(dir, '2026-10-02-2'));
    expect(nextRun(dir, '2026-10-02')).toBe('2026-10-02-3');
    expect(nextRun(dir, '2026-10-03')).toBe('2026-10-03');
    expect(() => nextRun(dir, '2 Oct')).toThrow(/YYYY-MM-DD/);
  });

  test("dates a run by the day where the tool runs", () => {
    expect(today(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02');
  });
});

describe('--date', () => {
  test('a date not written YYYY-MM-DD is a command line the tool cannot read, exit 2, before anything is read', async () => {
    let out = '';
    const code = await run(['write-run', 'no-such-draft.json', '--date', '2026-1-2', '--json'], { out: (text) => (out += text), err: () => undefined });
    expect(code).toBe(2);
    expect(JSON.parse(out)).toMatchObject({ ok: false, kind: 'usage' });
  });
});
