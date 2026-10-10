// The Synergies (DL-45; `synergies.json`): each requires one or more conditions on the Party,
// each a Query (DL-148 item 20, `queryProblems`); adds a `flat` above 0, a `factor` above 1 or both, a
// Synergy being a bonus and a factor in content a multiplier; and names, if any, one or more Encounter
// kinds, none twice. The old form, a count for each Class and a list of Skills, is no longer read
// (DL-192).

import type { EncounterKind, PartyCondition, Synergy, SynergyBonus } from '@heroesim/engine/content';
import { encounterKinds, queryProblems } from '@heroesim/engine/content';
import { choicesOf, listOf, number, object, oneOfEach, optional, table, text } from './read.js';
import { checkEncounterKinds, checkRowKeys, type KindRules } from './rules.js';

const encounterKindChoices: Record<EncounterKind, true> = choicesOf(encounterKinds);

export const synergiesKind = table<'synergies', Synergy>(
  'synergies',
  'synergies.json',
  {
    name: text,
    // Conditions on the Party, read as written and held by the rules.
    requires: listOf<PartyCondition>('a list of conditions on the Party'),
    bonus: object<SynergyBonus>({ flat: optional(number), factor: optional(number) }, "a Synergy's bonus"),
    kinds: optional(oneOfEach(encounterKindChoices)),
  },
  'a Synergy',
);

export const synergiesRules: KindRules = {
  key: 'synergies',
  check(set, problems, known) {
    checkRowKeys('synergies', set.synergies, problems);
    for (const [key, synergy] of Object.entries(set.synergies)) {
      const where = `synergies.${key}`;
      const { requires, bonus, kinds } = synergy;
      if (!Array.isArray(requires)) {
        problems.push(`${where}.requires is ${JSON.stringify(requires)}; expected a list of conditions on the Party`);
      } else {
        if (requires.length === 0) problems.push(`${where}.requires is empty: a Synergy is for a Party that meets something`);
        requires.forEach((condition, index) => problems.push(...queryProblems(condition, 'requirement', known.query, `${where}.requires.${index}`)));
      }
      if (bonus.flat === undefined && bonus.factor === undefined) {
        problems.push(`${where}.bonus is empty: a Synergy adds a flat, a factor or both`);
      }
      if (bonus.flat !== undefined && !(Number.isFinite(bonus.flat) && bonus.flat > 0)) {
        problems.push(`${where}.bonus.flat is ${bonus.flat}; it is a number above 0`);
      }
      if (bonus.factor !== undefined && !(Number.isFinite(bonus.factor) && bonus.factor > 1)) {
        problems.push(`${where}.bonus.factor is ${bonus.factor}; it multiplies, so it is a number above 1`);
      }
      if (kinds !== undefined) {
        if (kinds.length === 0) problems.push(`${where}.kinds is empty: leave it out for a Synergy on every kind`);
        checkEncounterKinds(`${where}.kinds`, kinds, encounterKinds, problems);
      }
    }
  },
};
