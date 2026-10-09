import { execFileSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { citationsIn, unknownCitations, unknownInRepository } from './citations.js';
import { repositoryRoot } from './cli.js';
import { scratchRepository, smallLog } from './test-support.js';

// An id no entry holds, built so that this file cites none.
const planted = `DL-${9}${9}${9}`;

describe('citations', () => {
  test('finds each cited id by line, two- and three-digit, and no placeholder', () => {
    expect(citationsIn('see DL-07 item 2 and DL-214\nDL-nn, DL-NNN\n(DL-99)', 'f.ts')).toEqual([
      { number: 7, file: 'f.ts', line: 1 },
      { number: 214, file: 'f.ts', line: 1 },
      { number: 99, file: 'f.ts', line: 3 },
    ]);
  });

  test('an id no entry holds is unknown', () => {
    const files = [{ file: 'a.ts', text: `// DL-07, and ${planted}` }];
    expect(unknownCitations(files, new Set([7]))).toEqual([{ number: 999, file: 'a.ts', line: 1 }]);
  });

  test('reads .mts files and the ignore files, which cite entries too', () => {
    const { dir, remove } = scratchRepository({
      ...smallLog,
      '.gitignore': `# ${planted}\n`,
      'docs/.rgignore': `# ${planted}\n`,
      'web/a.d.mts': `// ${planted}\n`,
    });
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      expect(unknownInRepository(dir).map(({ file }) => file)).toEqual(['.gitignore', 'docs/.rgignore', 'web/a.d.mts']);
    } finally {
      remove();
    }
  });

  test('every DL-nn this repository cites is an entry', () => {
    expect(unknownInRepository(repositoryRoot)).toEqual([]);
  });
});
