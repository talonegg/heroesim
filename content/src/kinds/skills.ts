// The Skills (R10; `skills.json`): a name, by key, which a Class gates and a Check is helped by.

import type { Skill } from '@heroesim/engine/content';
import { table, text } from './read.js';
import { checkRowKeys, type KindRules } from './rules.js';

export const skillsKind = table<'skills', Skill>('skills', 'skills.json', { name: text }, 'a Skill');

export const skillsRules: KindRules = {
  key: 'skills',
  check(set, problems) {
    checkRowKeys('skills', set.skills, problems);
  },
};
