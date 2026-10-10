// The Loot tables (DL-52; `loot-tables.json`): each at least one entry, each entry an Item
// content defines, listed once in its table, with a weight above 0 and a quantity range of whole
// numbers from 1, not upside down; a unique Item's quantity is 1, since a unique Item is an
// individual (data-model §3.3).

import type { LootEntry, LootTable } from '@heroesim/engine/content';
import { integer, listOfRows, number, rowOf, table, text } from './read.js';
import { checkRowKeys, repeated, type KindRules } from './rules.js';

export const lootTablesKind = table<'lootTables', LootTable>(
  'lootTables',
  'loot-tables.json',
  { entries: listOfRows(rowOf<LootEntry>({ definitionKey: text, weight: number, quantityMin: integer, quantityMax: integer }, 'a Loot table entry')) },
  'a Loot table',
);

export const lootTablesRules: KindRules = {
  key: 'lootTables',
  check(set, problems) {
    checkRowKeys('lootTables', set.lootTables, problems);
    for (const [key, lootTable] of Object.entries(set.lootTables)) {
      const where = `lootTables.${key}`;
      if (lootTable.entries.length === 0) problems.push(`${where}.entries is empty: a table awards one of its entries`);
      for (const [index, entry] of lootTable.entries.entries()) {
        const at = `${where}.entries.${index}`;
        const { definitionKey, weight, quantityMin, quantityMax } = entry;
        const item = Object.hasOwn(set.items, definitionKey) ? set.items[definitionKey] : undefined;
        if (item === undefined) problems.push(`${at}.definitionKey: "${definitionKey}" is not an Item`);
        if (!(Number.isFinite(weight) && weight > 0)) problems.push(`${at}.weight is ${weight}; it is a number above 0`);
        for (const [field, value] of [['quantityMin', quantityMin], ['quantityMax', quantityMax]] as const) {
          if (!(Number.isInteger(value) && value >= 1)) problems.push(`${at}.${field} is ${value}; it is a whole number from 1`);
        }
        if (quantityMin > quantityMax) problems.push(`${at}.quantityMin ${quantityMin} is greater than quantityMax ${quantityMax}`);
        if (item?.unique === true && (quantityMin !== 1 || quantityMax !== 1)) {
          problems.push(`${at}: ${definitionKey} is unique, so its quantityMin and quantityMax are 1`);
        }
      }
      for (const definitionKey of repeated(lootTable.entries.map((entry) => entry.definitionKey))) {
        problems.push(`${where}.entries: "${definitionKey}" is listed twice`);
      }
    }
  },
};
