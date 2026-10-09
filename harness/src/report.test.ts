import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  fixed,
  localDate,
  localTimestamp,
  machine,
  markdownTable,
  percent,
  reportPath,
  reportsDir,
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

  // DL-186 item 19, DL-187: one share formatter for the play report and the Succession probe's.
  test('percent gives a share of a whole to one place, a dash of none', () => {
    expect(percent(1, 3)).toBe('33.3%');
    expect(percent(1234, 1000)).toBe('123.4%');
    expect(percent(0, 7)).toBe('0.0%');
    expect(percent(5, 0)).toBe('—');
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

test('machine names the Node version it runs on', () => {
  expect(machine()).toMatchObject({ node: process.version, arch: process.arch });
  expect(machine().cores).toBeGreaterThan(0);
});
