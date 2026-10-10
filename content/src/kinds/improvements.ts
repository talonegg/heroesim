// The Hall Improvements (`improvements.json`): each raises a Hall facility, costs a whole number
// of Wealth above 0, and each facility's grades run 1, 2, 3, … once each, with no gap, so that `build`
// finds the next grade of any facility by its number. A facility no row names cannot be built; none
// need be.

import type { FacilityKey, Improvement } from '@heroesim/engine/content';
import { facilityKeys } from '@heroesim/engine/content';
import { choicesOf, integer, oneOf, table, text } from './read.js';
import { checkRowKeys, type KindRules } from './rules.js';

const facilities: Record<FacilityKey, true> = choicesOf(facilityKeys);

export const improvementsKind = table<'improvements', Improvement>(
  'improvements',
  'improvements.json',
  { name: text, facility: oneOf(facilities), grade: integer, cost: integer }, 'an Improvement',
);

export const improvementsRules: KindRules = {
  key: 'improvements',
  check(set, problems) {
    checkRowKeys('improvements', set.improvements, problems);
    const grades = new Map<string, number[]>();
    for (const [key, improvement] of Object.entries(set.improvements)) {
      const where = `improvements.${key}`;
      const { facility, grade, cost } = improvement;
      if (!(facilityKeys as readonly string[]).includes(facility)) {
        problems.push(`${where}.facility: "${facility}" is not a Hall facility (${facilityKeys.join(', ')})`);
      } else {
        grades.set(facility, [...(grades.get(facility) ?? []), grade]);
      }
      if (!(Number.isInteger(grade) && grade >= 1)) problems.push(`${where}.grade is ${grade}; it is a whole number from 1`);
      if (!(Number.isInteger(cost) && cost > 0)) problems.push(`${where}.cost is ${cost}; it is a whole number above 0`);
    }
    for (const [facility, listed] of grades) {
      const sorted = [...listed].sort((a, b) => a - b);
      const expected = sorted.map((_, index) => index + 1);
      if (sorted.some((grade, index) => grade !== expected[index])) {
        problems.push(`improvements: the grades of ${facility} are ${sorted.join(', ')}; they run 1 to ${sorted.length}, each once`);
      }
    }
  },
};
