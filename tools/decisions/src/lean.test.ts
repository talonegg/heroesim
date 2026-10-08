import { describe, expect, test } from 'vitest';
import { repositoryRoot } from './cli.js';
import { leanBytes, leanProblems, leanProblemsInLog } from './lean.js';

const lean = (number: number, body = 'Text.'): string =>
  [
    `## DL-${number} — A decision`,
    '',
    '**Status:** Accepted · **Date:** 2026-10-08 · **Decided by:** the owner ("yes", with a reason that',
    'wraps)',
    '',
    `**Context.** ${body}`,
    '',
    '**Decision.** Text.',
    '',
    '**Consequences.** Text.',
    '',
    '**Evidence.** Text.',
    '',
  ].join('\n');

describe('the lean entry', () => {
  test('takes an entry of the template, its Status line wrapped, and none before DL-215', () => {
    const text = `# Decision log\n\n## DL-214 — Old\n\nA journal of any length.\n\n${lean(215)}\n${lean(216)}`;
    expect(leanProblems(text)).toEqual([]);
  });

  test('finds an entry over the cap, one without its Status line and one without a paragraph', () => {
    const big = lean(215, 'x'.repeat(leanBytes));
    const noStatus = lean(216).replace(/\*\*Status:\*\*[^\n]*\nwraps\)/, '2026-10-08 · the owner');
    const noEvidence = lean(217).replace('**Evidence.** Text.', 'Checks: 6,086 tests.');
    expect(leanProblems(`${big}\n${noStatus}\n${noEvidence}`)).toEqual([
      expect.stringMatching(/^DL-215 is \d+ bytes; an entry holds at most 6144$/),
      'DL-216 has no **Status:** · **Date:** · **Decided by:** line under its heading',
      'DL-217 has no **Evidence.** paragraph',
    ]);
  });

  test('finds a heading begun as an entry that is not one, rather than leaving its entry unread', () => {
    expect(leanProblems(`${lean(215)}\n## DL-216 - A hyphen for the dash\n\n${'x'.repeat(leanBytes)}\n## DL-217 — \n`)).toEqual([
      '"## DL-216 - A hyphen for the dash" is not an entry\'s heading ("## DL-nn — title")',
      '"## DL-217 — " is not an entry\'s heading ("## DL-nn — title")',
    ]);
  });

  test("this repository's open log keeps to it", () => {
    expect(leanProblemsInLog(repositoryRoot)).toEqual([]);
  });
});
