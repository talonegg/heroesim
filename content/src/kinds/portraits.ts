// The Portraits (DL-125 items 3 and 11, DL-126 item 2; `portraits.json`): each role, then each sex, a
// list of the pictures' keys. Any role and sex may have none; each key is lower case and hyphens,
// begins with its role's prefix, and is listed once in the whole file, so a key names one picture of
// one role and sex. That each names a file in `media/` is the page's test to hold
// (`web/src/media.test.ts`), since content reads no files.

import type { PortraitRole, Portraits, Sex } from '@heroesim/engine/content';
import { sexes } from '@heroesim/engine/content';
import { object, single, strings, type Fields } from './read.js';
import { lowerAndHyphens, repeated, type KindRules } from './rules.js';

const bySex = Object.fromEntries(sexes.map((sex) => [sex, strings])) as Fields<Record<Sex, string[]>>;

export const portraitsKind = single<'portraits', Portraits>(
  'portraits',
  'portraits.json',
  {
    guildmaster: object(bySex, "the guildmaster's pictures by sex"),
    hero: object(bySex, "the hero's pictures by sex"),
    patron: object(bySex, "the patron's pictures by sex"),
  },
  'the Portraits',
  'must be an object of the pictures by role and sex',
  () => ({ guildmaster: { female: [], male: [] }, hero: { female: [], male: [] }, patron: { female: [], male: [] } }),
);

/** The prefix each role's Portrait keys begin with, so a key is unique across the roles (DL-126 item 2). */
const portraitPrefixes: Readonly<Record<PortraitRole, string>> = { guildmaster: 'gm-', hero: 'hero-', patron: 'patron-' };

export const portraitsRules: KindRules = {
  key: 'portraits',
  check(set, problems) {
    const keys: string[] = [];
    for (const [role, byRole] of Object.entries(set.portraits) as [PortraitRole, Portraits['hero']][]) {
      for (const [sex, list] of Object.entries(byRole)) {
        const where = `portraits.${role}.${sex}`;
        for (const key of list) {
          if (!lowerAndHyphens.test(key)) problems.push(`${where}: "${key}" is not lower case and hyphens`);
          else if (!key.startsWith(portraitPrefixes[role])) problems.push(`${where}: "${key}" does not begin "${portraitPrefixes[role]}"`);
          keys.push(key);
        }
      }
    }
    for (const key of repeated(keys)) problems.push(`portraits: "${key}" is listed twice`);
  },
};
