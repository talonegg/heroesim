import { describe, expect, test } from 'vitest';
import { repositoryRoot } from './cli.js';
import { historyLines, historyPattern, isSource, linesMatching, storyPattern, storyReport } from './stories.js';

// The ids below are built, so that this file cites none (it is a test, which the rule does not read).
const v = (story: string): string => `v1.1.4-${story}`;

describe('story ids in the source', () => {
  test('finds history told by a story, milestone or patch, and a story cited otherwise', () => {
    const text = [
      `// Since ${v('S2')} it holds the Degree.`,
      '// until M7-S3, the page held a copy.',
      `// The Check (${v('S2')}, DL-152).`,
      '// The Check (DL-152), version 1.1.4, M7 and S2 alone.',
      '// Seven views since M9-F2, the report (M9-F5).',
    ].join('\n');
    const files = [{ file: 'engine/src/x.ts', text }];
    expect(linesMatching(files, historyPattern).map(({ line }) => line)).toEqual([1, 2, 5]);
    expect(linesMatching(files, storyPattern).map(({ line }) => line)).toEqual([1, 2, 3, 5]);
  });

  test("finds history told across a comment's line break, once, at the line it begins on", () => {
    const text = [`// the rule, since`, `// ${v('S2')}, reads it.`, ' * from', ` * ${v('S8')} on.`, `// Since ${v('S2')} it holds.`].join('\n');
    expect(historyLines([{ file: 'engine/src/x.ts', text }]).map(({ line }) => line)).toEqual([1, 3, 5]);
  });

  test('reads source, never a test, its support, a spec, a live check or a build', () => {
    expect(['engine/src/a.ts', 'web/src/a.tsx', 'web/scripts/a.mjs', 'vitest.config.ts'].every(isSource)).toBe(true);
    expect(['engine/src/a.test.ts', 'web/src/a.test.tsx', 'engine/src/world.test-support.ts', 'web/src/test-setup.ts', 'web/e2e/a.spec.ts', 'web/e2e/a.live.ts', 'engine/dist/a.js'].some(isSource)).toBe(false);
  });

  test("this repository's source tells no history by a story, and cites stories on no more lines than its baseline", () => {
    const report = storyReport(repositoryRoot);
    expect(report.history).toEqual([]);
    expect(report.cited).toBeLessThanOrEqual(report.baseline);
  });
});
