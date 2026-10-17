// The Dispositions (DL-56; `dispositions.json`): at least one, since the Guild Generator
// deals one to every Rival; each appetite, and the `partyMargin` (DL-157), a fraction from 0 to 1, each
// threshold a multiple of 0 or more, its rest band a Fatigue band or null (DL-286), its Contracts'
// length a whole number of years from 1 (DL-315; the config's lengths are the signing's to hold), and the orders it
// buys and builds in, each when written a permutation of its keys (DL-202): its build order of content's
// Facilities (DL-297).

import type { Disposition, PurchaseStep, SlotKey } from '@heroesim/engine/content';
import { fatigueBandNames, gearSlotKeys, purchaseSteps } from '@heroesim/engine/content';
import { choicesOf, number, oneOfEach, oneOfOrNull, optional, strings, table, text } from './read.js';
import { checkRowKeys, type KindRules } from './rules.js';

const purchaseStepChoices: Record<PurchaseStep, true> = choicesOf(purchaseSteps);
const gearSlots: Record<SlotKey, true> = choicesOf(gearSlotKeys);
const fatigueBands = choicesOf(fatigueBandNames);

export const dispositionsKind = table<'dispositions', Disposition>(
  'dispositions',
  'dispositions.json',
  {
    name: text,
    questRiskAppetite: number,
    recruitThreshold: number,
    buildThreshold: number,
    gearThreshold: number,
    transferAppetite: number,
    partyMargin: number,
    restBand: oneOfOrNull(fatigueBands),
    contractYears: number,
    purchaseOrder: optional(oneOfEach(purchaseStepChoices)),
    gearSlotOrder: optional(oneOfEach(gearSlots)),
    buildOrder: optional(strings),
  },
  'a Disposition',
);

export const dispositionsRules: KindRules = {
  key: 'dispositions',
  check(set, problems) {
    checkRowKeys('dispositions', set.dispositions, problems);
    if (Object.keys(set.dispositions).length === 0) {
      problems.push('dispositions is empty: the Guild Generator deals one to every Rival');
    }
    for (const [key, disposition] of Object.entries(set.dispositions)) {
      const where = `dispositions.${key}`;
      for (const field of ['questRiskAppetite', 'transferAppetite', 'partyMargin'] as const) {
        const value = disposition[field];
        if (!(value >= 0 && value <= 1)) problems.push(`${where}.${field} is ${value}; it is a number from 0 to 1`);
      }
      for (const field of ['recruitThreshold', 'buildThreshold', 'gearThreshold'] as const) {
        const value = disposition[field];
        if (!(value >= 0)) problems.push(`${where}.${field} is ${value}; it is a number of 0 or more`);
      }
      if (!(Number.isSafeInteger(disposition.contractYears) && disposition.contractYears >= 1)) {
        problems.push(`${where}.contractYears is ${disposition.contractYears}; it is a whole number of years from 1`);
      }
      const { restBand } = disposition;
      if (restBand !== null && !(fatigueBandNames as readonly string[]).includes(restBand)) {
        problems.push(`${where}.restBand is ${JSON.stringify(restBand)}; it is a Fatigue band, ${fatigueBandNames.slice(0, -1).join(', ')} or ${fatigueBandNames.at(-1)}, or null`);
      }
      checkOrder(`${where}.purchaseOrder`, disposition.purchaseOrder, purchaseSteps, problems);
      checkOrder(`${where}.gearSlotOrder`, disposition.gearSlotOrder, gearSlotKeys, problems);
      checkOrder(`${where}.buildOrder`, disposition.buildOrder, Object.keys(set.facilities), problems);
    }
  },
};

/** An order, when written, is a permutation of `keys`: each listed once, and none left out. */
function checkOrder(where: string, order: readonly string[] | undefined, keys: readonly string[], problems: string[]): void {
  if (order === undefined) return;
  const listed = new Set<string>();
  for (const key of order) {
    if (!keys.includes(key)) problems.push(`${where}: "${key}" is not one of ${keys.join(', ')}`);
    else if (listed.has(key)) problems.push(`${where}: "${key}" is listed twice; list each of ${keys.join(', ')} once`);
    listed.add(key);
  }
  for (const key of keys) {
    if (!listed.has(key)) problems.push(`${where}: "${key}" is not in the order; list each of ${keys.join(', ')} once`);
  }
}
