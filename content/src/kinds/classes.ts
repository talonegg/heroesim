// The Classes (R9; `classes.json`), and their order (`class-order.json`, DL-186 item 24): a Class's
// leading Stats and the Skills it gates, its growth weights, its draw weight, its icon and its mark
// as a Class that relieves the hurt (DL-285).

import type { Class, ClassKey } from '@heroesim/engine/content';
import { classIcons, isClassIcon } from '@heroesim/engine/content';
import { boolean, numbers, optional, strings, table, text, number, type KindReader } from './read.js';
import { checkReferences, checkRowKeys, checkWeight, type KindRules } from './rules.js';

/**
 * How far a Class's growth weights may sum from 1. Weights are written by hand to four places,
 * and 2:1 splits do not terminate in decimals (INPUTS 5.3), so the sum is near 1, not exact; a
 * rule draws in proportion to the weights and so is indifferent to the difference.
 */
export const growthSumTolerance = 0.001;

export const classesKind = table<'classes', Class>(
  'classes',
  'classes.json',
  {
    name: text,
    leadingStats: strings,
    gatedSkills: strings,
    growth: numbers,
    weight: optional(number),
    // One the page draws (DL-206 item 22, DL-212); that it is one is the rules'.
    icon: optional(text),
    // The Healer's mark (DL-285; the architecture review's candidate 5): true or false on the Class's
    // own row, so it can name no other Class; absent, false.
    relievesHurt: optional(boolean),
  },
  'a Class',
);

export const classesRules: KindRules = {
  key: 'classes',
  check(set, problems, known) {
    checkRowKeys('classes', set.classes, problems);
    for (const [key, it] of Object.entries(set.classes)) {
      const where = `classes.${key}`;
      checkWeight('classes', key, it.weight, problems);
      // A Class with no icon shows the plain mark (DL-212).
      if (it.icon !== undefined && !isClassIcon(it.icon)) {
        problems.push(`${where}.icon is ${JSON.stringify(it.icon)}; it is one of ${classIcons.join(', ')}, or absent for the plain mark`);
      }
      checkReferences(`${where}.leadingStats`, it.leadingStats, known.heroStats, 'a Hero Stat', problems);
      checkReferences(`${where}.gatedSkills`, it.gatedSkills, known.skills, 'a Skill', problems);
      checkReferences(`${where}.growth`, Object.keys(it.growth), known.heroStats, 'a Hero Stat', problems);
      checkGrowth(`${where}.growth`, it.growth, problems);
    }
  },
};

/** Growth weights are numbers of 0 or more summing to 1, within the tolerance. */
function checkGrowth(where: string, growth: Readonly<Record<string, number>>, problems: string[]): void {
  let sum = 0;
  for (const [key, weight] of Object.entries(growth)) {
    if (Number.isFinite(weight)) sum += weight;
    if (!(Number.isFinite(weight) && weight >= 0)) {
      problems.push(`${where}: "${key}" has weight ${weight}; a weight is a number of 0 or more`);
    }
  }
  if (Math.abs(sum - 1) > growthSumTolerance) {
    problems.push(`${where}: weights sum to ${Number(sum.toFixed(4))}, not 1`);
  }
}

/** The Classes' order: a list of Class keys; that each Class is listed once is the rules'. */
export const classOrderKind: KindReader<'classOrder', ClassKey[]> = {
  key: 'classOrder',
  source: 'class-order.json',
  read(json, problems) {
    if (json === undefined) return [];
    if (!Array.isArray(json) || !json.every((key) => typeof key === 'string')) {
      problems.push('class-order.json: must be a list of Class keys');
      return [];
    }
    return json;
  },
  holds: [],
};

/** The Classes' order lists each Class once (DL-186 item 24). */
export const classOrderRules: KindRules = {
  key: 'classOrder',
  check(set, problems) {
    const listed = new Set<string>();
    for (const classKey of set.classOrder) {
      if (!Object.hasOwn(set.classes, classKey)) problems.push(`classOrder: "${classKey}" is not a Class`);
      else if (listed.has(classKey)) problems.push(`classOrder: "${classKey}" is listed twice; list each Class once`);
      listed.add(classKey);
    }
    for (const classKey of Object.keys(set.classes)) {
      if (!listed.has(classKey)) problems.push(`classOrder: "${classKey}" is a Class and is not in the order; list each Class once`);
    }
  },
};
