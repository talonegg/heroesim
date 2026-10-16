import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  fixed,
  localDate,
  localTimestamp,
  markdownTable,
  percent,
  reportPath,
  reportsDir,
  shares,
  upkeepsWords,
  whole,
  writeReport,
} from './report.js';

describe('markdownTable', () => {
  test('writes a header, an alignment rule and a row per row, escaping pipes', () => {
    const table = markdownTable(['Stat', 'Mean'], [['Strength', '9.50'], ['a|b', '1']], ['left', 'right']);
    expect(table).toBe(['| Stat | Mean |', '| --- | ---: |', '| Strength | 9.50 |', '| a\\|b | 1 |'].join('\n'));
  });

  test('refuses a row with the wrong number of cells', () => {
    expect(() => markdownTable(['A', 'B'], [['1']])).toThrow(RangeError);
  });
});

describe('numbers', () => {
  test('fixed rounds and separates thousands; a number that is not finite is a dash', () => {
    expect(fixed(1234.5678)).toBe('1,234.57');
    expect(fixed(0.1234, 3)).toBe('0.123');
    expect(fixed(Number.NaN)).toBe('—');
    expect(whole(1000)).toBe('1,000');
  });

  test('upkeepsWords gives a whole count as it is and a fraction to two places, one Upkeep singular (DL-300)', () => {
    expect(upkeepsWords(1)).toBe('1 Upkeep');
    expect(upkeepsWords(20)).toBe('20 Upkeeps');
    expect(upkeepsWords(20 / 3)).toBe('6.67 Upkeeps');
    expect(upkeepsWords(0.5)).toBe('0.50 Upkeeps');
  });

  // DL-186 item 19, DL-187: one share formatter for the play report and the Succession probe's.
  test('percent gives a share of a whole to one place, a dash of none', () => {
    expect(percent(1, 3)).toBe('33.3%');
    expect(percent(1234, 1000)).toBe('123.4%');
    expect(percent(0, 7)).toBe('0.0%');
    expect(percent(5, 0)).toBe('—');
  });

  // DL-321 (DL-305's note): the shares of one whole are rounded by largest remainder, so that they sum to it.
  test('shares round by largest remainder to one place and sum to 100.0%, where rounding each alone misses it', () => {
    // Each alone is 33.3%, 99.9% in all.
    expect(shares([1, 1, 1])).toEqual(['33.4%', '33.3%', '33.3%']);
    // 48.077, 9.615, 3.846, 19.231, 0, 9.615, 9.615 round alone to 99.9%; the two largest remainders take the tenths.
    expect(shares([1500, 300, 120, 600, 0, 300, 300])).toEqual(['48.1%', '9.6%', '3.9%', '19.2%', '0.0%', '9.6%', '9.6%']);
    // Each alone is 66.7% and 33.3%, 100.0% already: nothing moves.
    expect(shares([2, 1])).toEqual(['66.7%', '33.3%']);
    // Each alone is 16.7%, 100.2% in all: four take the tenth up, two do not.
    expect(shares([1, 1, 1, 1, 1, 1])).toEqual(['16.7%', '16.7%', '16.7%', '16.7%', '16.6%', '16.6%']);
    // A whole of nothing has no shares.
    expect(shares([0, 0])).toEqual(['—', '—']);
  });
});

describe('where a report goes', () => {
  test('a report is <name>-<local date>.md under harness/reports, named by its release or a word, never a milestone', () => {
    const date = new Date(2026, 8, 6, 23, 59, 7);
    expect(localDate(date)).toBe('2026-09-06');
    expect(localTimestamp(date)).toMatch(/^2026-09-06 23:59:07 [+-]\d\d:\d\d$/);
    expect(reportPath('v1.1.9', date)).toBe(join(reportsDir, 'v1.1.9-2026-09-06.md'));
    expect(reportsDir.replaceAll('\\', '/')).toMatch(/\/harness\/reports\/$/);
    expect(reportPath('v1.1.9-s3-neutral', date)).toBe(join(reportsDir, 'v1.1.9-s3-neutral-2026-09-06.md'));
    expect(reportPath('play', date)).toBe(join(reportsDir, 'play-2026-09-06.md'));
    expect(reportPath('modules-probe', date)).toBe(join(reportsDir, 'modules-probe-2026-09-06.md'));
    for (const name of ['m1', 'm8-probe', 'M1', 'V1.1.9', 'v1.1-s3', 'v1.1.9-', 'v1.1.9-S3', 'play-']) {
      expect(() => reportPath(name, date), name).toThrow(RangeError);
    }
  });

  test('writeReport makes the directory and ends the file with a newline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'heroesim-report-'));
    try {
      const path = writeReport(join(dir, 'nested', 'v1.1.9-2026-09-26.md'), '# Report');
      expect(readFileSync(path, 'utf8')).toBe('# Report\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
