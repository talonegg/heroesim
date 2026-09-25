import { expect, test } from 'vitest';
import { table } from './render.js';

test('a table aligns its columns, numbers to the right, and leaves no trailing space', () => {
  const lines = table(
    [{ heading: 'Name' }, { heading: 'Level', align: 'right' }, { heading: 'Class' }],
    [
      ['Ada', '1', 'Warrior'],
      ['Brand Ironside', '12', ''],
    ],
  );

  expect(lines).toEqual([
    'Name            Level  Class',
    '--------------  -----  -------',
    'Ada                 1  Warrior',
    'Brand Ironside     12',
  ]);
});

test('a table with no rows is its heading', () => {
  expect(table([{ heading: 'Turn', align: 'right' }, { heading: 'Event' }], [])).toEqual(['Turn  Event', '----  -----']);
});
