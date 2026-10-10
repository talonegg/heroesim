// The name lists (`names.json`): given names by sex, family names, Guild names, and the Patrons'
// names, each with its sex (DL-125 item 5). Every list holds at least one name, and none twice.

import type { Names, PatronName, Sex } from '@heroesim/engine/content';
import { sexes } from '@heroesim/engine/content';
import { choicesOf, listOfRows, object, oneOf, rowOf, single, strings, text, type Fields } from './read.js';
import { repeated, type KindRules } from './rules.js';

const givenBySex = Object.fromEntries(sexes.map((sex) => [sex, strings])) as Fields<Record<Sex, string[]>>;

export const namesKind = single<'names', Names>(
  'names',
  'names.json',
  {
    given: object(givenBySex, 'the given-name lists'),
    family: strings,
    guild: strings,
    patron: listOfRows(rowOf<PatronName>({ name: text, sex: oneOf(choicesOf(sexes)) }, "a Patron's name")),
  },
  'the name lists',
  'must be an object of name lists',
  () => ({ given: { female: [], male: [] }, family: [], guild: [], patron: [] }),
);

export const namesRules: KindRules = {
  key: 'names',
  check(set, problems) {
    const lists: [string, string[]][] = [
      ...Object.entries(set.names.given).map(([sex, list]): [string, string[]] => [`given.${sex}`, list]),
      ['family', set.names.family],
      ['guild', set.names.guild],
      ['patron', set.names.patron.map((patron) => patron.name)],
    ];
    for (const [list, names] of lists) {
      if (names.length === 0) problems.push(`names.${list} is empty`);
      for (const name of repeated(names)) problems.push(`names.${list}: "${name}" is listed twice`);
    }
  },
};
