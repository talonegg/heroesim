import { type LootTable } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { parse, withJson, refusalOf, withoutLoot, type Files } from './content.test-support.js';

// The Loot tables' refusals (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

// A Loot table's refusals (DL-52).
describe('a Loot table', () => {
  type Entry = LootTable['entries'][number];
  const lesser = (json: Files['loot-tables.json']) => json['lesser-loot'] as Omit<LootTable, 'key'>;
  const first = (json: Files['loot-tables.json']) => lesser(json).entries[0] as Entry;
  const unique = (json: Files['loot-tables.json']) =>
    lesser(json).entries.find((entry) => entry.definitionKey === 'barrow-kings-blade') as Entry;

  test.each<[string, (json: Files['loot-tables.json']) => void, RegExp]>([
    ['an Item content lacks', (json) => void (first(json).definitionKey = 'rope'), /lootTables\.lesser-loot\.entries\.0\.definitionKey: "rope" is not an Item/],
    ['a weight of 0', (json) => void (first(json).weight = 0), /lootTables\.lesser-loot\.entries\.0\.weight is 0; it is a number above 0/],
    ['a negative weight', (json) => void (first(json).weight = -2), /lootTables\.lesser-loot\.entries\.0\.weight is -2; it is a number above 0/],
    ['a quantity of 0', (json) => void (first(json).quantityMin = 0), /lootTables\.lesser-loot\.entries\.0\.quantityMin is 0; it is a whole number from 1/],
    ['a quantity range upside down', (json) => void Object.assign(first(json), { quantityMin: 3, quantityMax: 2 }), /lootTables\.lesser-loot\.entries\.0\.quantityMin 3 is greater than quantityMax 2/],
    ['a quantity that is not whole', (json) => void (first(json).quantityMax = 2.5), /loot-tables\.json: lesser-loot\.entries\.0\.quantityMax is 2\.5; expected a whole number/],
    ['a unique Item more than one at a time', (json) => void (unique(json).quantityMax = 2), /lootTables\.lesser-loot\.entries\.9: barrow-kings-blade is unique, so its quantityMin and quantityMax are 1/],
    ['an Item listed twice', (json) => void lesser(json).entries.push({ ...first(json) }), /lootTables\.lesser-loot\.entries: "whetstone" is listed twice/],
    ['no entries', (json) => void (lesser(json).entries = []), /lootTables\.lesser-loot\.entries is empty/],
    ['a field an entry lacks', (json) => void Object.assign(first(json), { chance: 0.5 }), /loot-tables\.json: lesser-loot\.entries\.0\.chance is not a field of a Loot table entry/],
    ['a field a table lacks', (json) => void Object.assign(lesser(json), { name: 'Lesser loot' }), /loot-tables\.json: lesser-loot\.name is not a field of a Loot table/],
  ])('with %s is refused, naming the table', (_, change, problem) => {
    expect(refusalOf(() => parse(withJson('loot-tables.json', change))).message).toMatch(problem);
  });

  test('the file may hold none when no template names one', () => {
    expect(parse(withoutLoot()).lootTables).toEqual({});
  });
});
