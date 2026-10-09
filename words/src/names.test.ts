import { describe, expect, test } from 'vitest';
import { capitalised, listed, nameIn, signed } from './names.js';

// DL-186 item 1: how the CLI and the page name things, one table.

const rows = { warrior: { name: 'Warrior' }, mage: { name: 'Mage' } };

describe('the names', () => {
  test.each([
    ['a row by its name', nameIn(rows, 'warrior'), 'Warrior'],
    ['a key content lacks, as it is (data-model rule 5)', nameIn(rows, 'luck'), 'luck'],
    ["a key Object.prototype lends, as it is", nameIn(rows, 'constructor'), 'constructor'],
    ['a capital for text that stands alone', capitalised('weapon Gear'), 'Weapon Gear'],
    ['a capital already there kept', capitalised('Offer'), 'Offer'],
    ['nothing capitalised to nothing', capitalised(''), ''],
    ['a number left as it is', capitalised('3 new'), '3 new'],
    ['no item', listed([]), ''],
    ['one item', listed(['a']), 'a'],
    ['two items', listed(['a', 'b']), 'a and b'],
    ['three items', listed(['a', 'b', 'c']), 'a, b and c'],
    ['three items with or', listed(['a', 'b', 'c'], 'or'), 'a, b or c'],
    ['a gain signed', signed(2), '+2'],
    ['a loss signed', signed(-1), '-1'],
    ['nothing unsigned', signed(0), '0'],
  ])('%s', (_, words, expected) => {
    expect(words).toBe(expected);
  });
});
