import { afterEach, describe, expect, test } from 'vitest';
import { entriesIn, readLog, supersessionsIn } from './log.js';
import { entry, scratchRepository, smallLog } from './test-support.js';

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});
function scratch(files: Readonly<Record<string, string>>): string {
  const { dir, remove } = scratchRepository(files);
  scratches.push(remove);
  return dir;
}

describe('entriesIn', () => {
  test('reads the id, number, title and the date on the Status line', () => {
    expect(entriesIn(entry('DL-07', 'A title — with a dash', '2026-09-26'), 'f.md')).toEqual([
      { id: 'DL-07', number: 7, title: 'A title — with a dash', date: '2026-09-26', file: 'f.md' },
    ]);
  });

  test('reads a bare date under the heading, as from DL-189, and none when there is none', () => {
    const text = '## DL-189 — Bare\n\n2026-10-05 · the owner\n\n## DL-190 — Undated\n\nText.\n';
    expect(entriesIn(text, 'f.md').map(({ id, date }) => [id, date])).toEqual([
      ['DL-189', '2026-10-05'],
      ['DL-190', null],
    ]);
  });

  test('takes no other heading for an entry', () => {
    expect(entriesIn('## Pre-M0 review decisions\n\n### D3 — x\n\n## DL-1 Not an entry\n', 'f.md')).toEqual([]);
  });
});

describe('supersessionsIn', () => {
  test('reads an item in full, an item in part, a whole entry and a Pre-M0 item', () => {
    const text = [
      '# DL-88 — superseded items',
      '## DL-88 item 7 — superseded by DL-92',
      '## DL-88 item 5 — in part, by DL-99',
      '## DL-12 — superseded by DL-40',
      '## D3 — in part, by DL-84',
      '## DL-198 item call 1 — in part, by DL-206',
    ].join('\n');
    expect(supersessionsIn(text, 's.md')).toEqual({
      supersessions: [
        { target: 'DL-88', item: '7', by: 'DL-92', full: true, file: 's.md' },
        { target: 'DL-88', item: '5', by: 'DL-99', full: false, file: 's.md' },
        { target: 'DL-12', item: null, by: 'DL-40', full: true, file: 's.md' },
        { target: 'D3', item: null, by: 'DL-84', full: false, file: 's.md' },
        { target: 'DL-198', item: 'call 1', by: 'DL-206', full: false, file: 's.md' },
      ],
      problems: [],
    });
  });

  test('says which heading it does not understand', () => {
    expect(supersessionsIn('## DL-88 item 7 superseded by DL-92\n', 's.md').problems).toEqual([
      's.md: "## DL-88 item 7 superseded by DL-92" is not a record\'s heading ("## DL-nn item N — superseded by DL-nn" or "— in part, by DL-nn")',
    ]);
  });
});

describe('readLog', () => {
  test('reads the log and the archive in id order, and every record of superseded/', () => {
    const log = readLog(scratch(smallLog));
    expect(log.problems).toEqual([]);
    expect(log.entries.map(({ id, file }) => [id, file])).toEqual([
      ['DL-01', 'docs/decisions/archive/DL-001-002-first.md'],
      ['DL-02', 'docs/decisions/archive/DL-001-002-first.md'],
      ['DL-03', 'docs/decision-log.md'],
    ]);
    expect(log.supersessions.map(({ target, item, by }) => `${target} ${item} ${by}`)).toEqual([
      'DL-01 2 DL-02',
      'DL-01 4 DL-03',
      'DL-02 null DL-03',
      'D3 null DL-02',
    ]);
  });

  test('finds an id held twice, and a record naming no entry', () => {
    const log = readLog(
      scratch({
        ...smallLog,
        'docs/decision-log.md': `# Decision log\n\n${entry('DL-02', 'Again')}`,
        'docs/decisions/archive/superseded/DL-02.md': '## DL-02 item 1 — superseded by DL-09\n',
      }),
    );
    expect(log.problems).toEqual([
      'DL-2 is held twice: in docs/decision-log.md and in docs/decisions/archive/DL-001-002-first.md',
      'docs/decisions/archive/superseded/DL-01.md: DL-03, which supersedes DL-01, is no entry',
      'docs/decisions/archive/superseded/DL-02.md: DL-09, which supersedes DL-02, is no entry',
    ]);
  });
});
