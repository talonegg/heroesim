// The Hall Improvements (`improvements.json`): each raises one Facility content defines
// (`facilities.json`) a grade, costs a whole number of Wealth above 0, and holds its Facility's effects'
// values at its grade, exactly the kinds its Facility has (DL-294 item 3). Each Facility's grades run
// 1, 2, 3, … once each, with no gap, so that `build` finds the next grade of any Facility by its number;
// a Facility may have any number, and one with none stays at grade 0.

import type { Improvement } from '@heroesim/engine/content';
import { checkFacilityEffects, facilityEffectsField } from './facility-effects.js';
import { integer, table, text } from './read.js';
import { checkRowKeys, type KindRules } from './rules.js';

export const improvementsKind = table<'improvements', Improvement>(
  'improvements',
  'improvements.json',
  { facility: text, grade: integer, cost: integer, name: text, effects: facilityEffectsField },
  'an Improvement',
);

export const improvementsRules: KindRules = {
  key: 'improvements',
  check(set, problems) {
    checkRowKeys('improvements', set.improvements, problems);
    const facilityKeys = Object.keys(set.facilities);
    const grades = new Map<string, number[]>();
    for (const [key, improvement] of Object.entries(set.improvements)) {
      const where = `improvements.${key}`;
      const { facility, grade, cost, effects } = improvement;
      const owner = Object.hasOwn(set.facilities, facility) ? set.facilities[facility] : undefined;
      if (owner === undefined) {
        problems.push(`${where}.facility: "${facility}" is not a Facility (${facilityKeys.join(', ')})`);
      } else {
        grades.set(facility, [...(grades.get(facility) ?? []), grade]);
        for (const kind of Object.keys(owner.effects)) {
          if (!Object.hasOwn(effects, kind)) problems.push(`${where}.effects: ${kind}, an effect of ${facility}, has no value at this grade`);
        }
        for (const kind of Object.keys(effects)) {
          if (!Object.hasOwn(owner.effects, kind)) problems.push(`${where}.effects.${kind}: ${facility} has no ${kind} effect`);
        }
      }
      if (!(Number.isInteger(grade) && grade >= 1)) problems.push(`${where}.grade is ${grade}; it is a whole number from 1`);
      if (!(Number.isInteger(cost) && cost > 0)) problems.push(`${where}.cost is ${cost}; it is a whole number above 0`);
      checkFacilityEffects(`${where}.effects`, effects, problems);
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
