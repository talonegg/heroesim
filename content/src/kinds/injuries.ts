// The Injury types (M2-S5; `injuries.json`) an Encounter's injury consequence names (M4-S1): at least
// one, each healing in a Day or more, and leaving no Trait or a Hero Trait content defines.

import type { InjuryType } from '@heroesim/engine/content';
import { integer, table, text, textOrNull } from './read.js';
import { checkRange, checkRowKeys, type KindRules } from './rules.js';

export const injuriesKind = table<'injuries', InjuryType>(
  'injuries',
  'injuries.json',
  { name: text, healDaysMin: integer, healDaysMax: integer, leavesTrait: textOrNull }, 'an Injury type',
);

export const injuriesRules: KindRules = {
  key: 'injuries',
  check(set, problems) {
    checkRowKeys('injuries', set.injuries, problems);
    if (Object.keys(set.injuries).length === 0) problems.push('injuries is empty: the Quest Engine inflicts one of its types');
    for (const [key, type] of Object.entries(set.injuries)) {
      const where = `injuries.${key}`;
      checkRange(where, 'healDays', type.healDaysMin, type.healDaysMax, 1, problems);
      const trait = type.leavesTrait;
      if (trait !== null && !Object.hasOwn(set.heroTraits, trait)) problems.push(`${where}.leavesTrait: "${trait}" is not a Hero Trait`);
    }
  },
};
