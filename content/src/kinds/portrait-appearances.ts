// The rows of the pictures (DL-126 item 2, DL-127, DL-134 items 3 and 10, DL-135 item 2;
// `portrait-appearances.json`): `features`, each `maleOnly` or not and with the Hero Traits it
// `shows`, both optional; and `portraits`, each picture's row by its key: its `apparentAge`,
// `station`, `temper` and `narrative`, and optionally its `features`, `hooks`, and either role's
// `callings` or `classes`. A person with no picture that fits shows the Silhouette (DL-135 item 3), so
// fewer pictures than wanted is a warning, never a refusal (`contentWarnings`).

import type { ContentSet, Feature, PortraitAppearance, PortraitAppearances, PortraitRole, Sex } from '@heroesim/engine/content';
import { boolean, numberList, optional, rowOf, rowsByKey, single, strings, text, withDefault, type Field } from './read.js';
import { checkReferences, lowerAndHyphens, own, type KindRules } from './rules.js';
import { checkSentences, filledWith, lengthOf } from './descriptions.js';

/** A picture's `apparentAge`, read as a list of numbers; that it is two, in order, is the rules'. */
const apparentAge: Field<PortraitAppearance['apparentAge']> = {
  read: (row, field) => numberList.read(row, field) as PortraitAppearance['apparentAge'],
  holds: [],
};

export const portraitAppearancesKind =single<'portraitAppearances', PortraitAppearances>(
  'portraitAppearances',
  'portrait-appearances.json',
  {
    features: rowsByKey(rowOf<Feature>({ maleOnly: withDefault(boolean, () => false), shows: withDefault(strings, () => []) }, 'a feature')),
    portraits: rowsByKey(
      rowOf<PortraitAppearance>(
        {
          apparentAge,
          station: text,
          temper: text,
          features: withDefault(strings, () => []),
          narrative: text,
          hooks: withDefault(strings, () => []),
          callings: optional(strings),
          classes: optional(strings),
        },
        "a picture's row",
      ),
    ),
  },
  'the Appearances mapped to pictures',
  'must be an object of the features and the pictures',
  () => ({ features: {}, portraits: {} }),
);


/** The most characters a picture's narrative holds (DL-134 items 3 and 9): within an Appearance's 280. */
export const narrativeMaxLength = 260;

/** The most characters a picture's hook holds, written with its picture's sex's pronouns (DL-134 items 3 and 9). */
export const hookMaxLength = 160;

/** The most hooks a picture has (DL-134 item 3, DL-135 item 2). */
export const hooksMax = 2;

/**
 * How many pictures content is wanted to hold of each sex and age band of Guildmasters, and of each
 * Class and sex of Heroes: fewer is warned of, never refused (DL-134 item 10), since a person with no
 * picture that fits shows the Silhouette (DL-135 item 3).
 */
export const picturesWanted = 3;

/** Each picture `portraits.json` lists, by key, with its role and sex. */
function picturesOf(portraits: ContentSet['portraits']): Map<string, { role: PortraitRole; sex: Sex }> {
  const pictures = new Map<string, { role: PortraitRole; sex: Sex }>();
  for (const [role, bySex] of Object.entries(portraits) as [PortraitRole, ContentSet['portraits']['hero']][]) {
    for (const [sex, list] of Object.entries(bySex) as [Sex, string[]][]) {
      for (const key of list) pictures.set(key, { role, sex });
    }
  }
  return pictures;
}

/**
 * The pictures' rows' rules, each problem named by its path:
 * - each feature's key is lower case and hyphens, and the Traits it shows are Hero Traits, each once;
 * - every Guildmaster's and Hero's picture `portraits.json` lists has a row, and every row names a
 *   picture; a Patron's picture has no row yet (DL-135 item 10);
 * - a row has its role's fields and no other's: a Guildmaster's one or two callings, a Hero's one or
 *   more classes;
 * - its station, temper, callings, classes and features are defined, each once, and a `maleOnly`
 *   feature is on a male picture's only;
 * - its `apparentAge` is two whole numbers from 0, the first no greater than the second;
 * - its narrative is written, at most 260 characters, with no slot or brace, since it is shown as
 *   written (DL-127 item 4);
 * - it has at most two hooks, each a sentence with no slot but the pronouns', at most 160 characters
 *   with its picture's sex's pronouns.
 * A feature no picture uses is allowed.
 */
export const portraitAppearancesRules: KindRules = {
  key: 'portraitAppearances',
  check(set, problems) {
    const { features, portraits: rows } = set.portraitAppearances;
    const { descriptions } = set;
    const heroTraits = new Set(Object.keys(set.heroTraits));
    for (const [key, feature] of Object.entries(features)) {
      if (!lowerAndHyphens.test(key)) problems.push(`portraitAppearances.features: "${key}" is not lower case and hyphens`);
      checkReferences(`portraitAppearances.features.${key}.shows`, feature.shows, heroTraits, 'a Hero Trait', problems);
    }

    const pictures = picturesOf(set.portraits);
    for (const [key, { role }] of pictures) {
      if (role !== 'patron' && !Object.hasOwn(rows, key)) {
        problems.push(`portraitAppearances.portraits: "${key}", a picture in portraits.json, has no row`);
      }
    }

    const stations = new Set(descriptions.stations);
    const tempers = new Set(descriptions.tempers);
    const callings = new Set(Object.keys(descriptions.callings));
    const classes = new Set(Object.keys(set.classes));
    const featureKeys = new Set(Object.keys(features));
    const pronounSlots = new Set(Object.values(descriptions.pronouns).flatMap((words) => Object.keys(words)));
    for (const [key, row] of Object.entries(rows)) {
      const where = `portraitAppearances.portraits.${key}`;
      const picture = pictures.get(key);
      if (picture === undefined) problems.push(`portraitAppearances.portraits: "${key}" names no picture in portraits.json`);
      else if (picture.role === 'patron') {
        problems.push(`${where}: a Patron's picture has no row yet (DL-135 item 10)`);
        continue;
      }

      const [from, to, ...more] = row.apparentAge;
      const whole = (age: number | undefined): age is number => Number.isSafeInteger(age) && (age ?? -1) >= 0;
      if (!whole(from) || !whole(to) || more.length > 0 || from > to) {
        problems.push(`${where}.apparentAge is ${JSON.stringify(row.apparentAge)}; it is two whole numbers from 0, the first no greater than the second`);
      }
      if (!stations.has(row.station)) problems.push(`${where}.station: "${row.station}" is not a station defined in descriptions.stations`);
      if (!tempers.has(row.temper)) problems.push(`${where}.temper: "${row.temper}" is not a temper defined in descriptions.tempers`);

      if (picture?.role === 'guildmaster') {
        if (row.callings === undefined) problems.push(`${where}.callings is missing: a Guildmaster's picture has one or two`);
        else if (row.callings.length < 1 || row.callings.length > 2) {
          problems.push(`${where}.callings has ${row.callings.length}; a Guildmaster's picture has one or two`);
        }
        if (row.classes !== undefined) problems.push(`${where}.classes: a Guildmaster's picture has callings, not classes`);
      } else if (picture?.role === 'hero') {
        if (row.classes === undefined) problems.push(`${where}.classes is missing: a Hero's picture has one or more`);
        else if (row.classes.length < 1) problems.push(`${where}.classes has ${row.classes.length}; a Hero's picture has one or more`);
        if (row.callings !== undefined) problems.push(`${where}.callings: a Hero's picture has classes, not callings`);
      }
      checkReferences(`${where}.callings`, row.callings ?? [], callings, 'a calling defined in descriptions.callings', problems);
      checkReferences(`${where}.classes`, row.classes ?? [], classes, 'a Class', problems);

      checkReferences(`${where}.features`, row.features, featureKeys, 'a feature defined under features', problems);
      if (picture !== undefined && picture.sex !== 'male') {
        for (const feature of new Set(row.features)) {
          if (own(features, feature)?.maleOnly === true) problems.push(`${where}.features: "${feature}" is maleOnly, and this is a ${picture.sex} picture`);
        }
      }

      if (row.narrative.trim() === '') problems.push(`${where}.narrative is empty`);
      const length = lengthOf(row.narrative.trim());
      if (length > narrativeMaxLength) problems.push(`${where}.narrative is ${length} characters; a narrative holds at most ${narrativeMaxLength}`);
      // Shown as written (DL-127 item 4), never filled: a slot would show as braces.
      const brace = /[{}]/.exec(row.narrative)?.[0];
      if (brace !== undefined) problems.push(`${where}.narrative holds "${brace}"; a narrative is shown as written, so it has no slot and no brace`);

      if (row.hooks.length > hooksMax) problems.push(`${where}.hooks has ${row.hooks.length}; a picture has at most two`);
      checkSentences(row.hooks, `${where}.hooks`, pronounSlots, descriptions.pronouns.female, problems, { mayBeEmpty: true });
      const words = picture === undefined ? {} : descriptions.pronouns[picture.sex];
      row.hooks.forEach((hook, index) => {
        const written = lengthOf(filledWith(hook, words, ''));
        if (written > hookMaxLength) problems.push(`${where}.hooks.${index} is ${written} characters; a hook holds at most ${hookMaxLength}`);
      });
    }
  },
};

/**
 * The warnings a content set passes with (DL-134 item 10): each sex and age band with fewer than
 * `picturesWanted` Guildmaster pictures whose `apparentAge` touches the band, and each Class and sex
 * with fewer Hero pictures of the Class. A person with no picture that fits shows the Silhouette
 * (DL-135 item 3), so these are never refusals. Each names its role, sex, and band or Class. Pure; a
 * set that has passed `validateContent` is expected.
 */
export function contentWarnings(set: Pick<ContentSet, 'portraits' | 'portraitAppearances' | 'descriptions' | 'classes'>): string[] {
  const warnings: string[] = [];
  const rows = set.portraitAppearances.portraits;
  const { ageBands } = set.descriptions;
  const counted = (count: number): string => `${count} ${count === 1 ? 'picture' : 'pictures'}`;
  for (const [sex, keys] of Object.entries(set.portraits.guildmaster)) {
    ageBands.forEach((band, index) => {
      const next = ageBands[index + 1]?.from ?? Number.POSITIVE_INFINITY;
      const count = keys.filter((key) => {
        const age = own(rows, key)?.apparentAge;
        return age !== undefined && age[0] < next && age[1] >= band.from;
      }).length;
      if (count < picturesWanted) {
        warnings.push(`portraits.guildmaster.${sex}: ${counted(count)} in the ${band.key} band, fewer than ${picturesWanted}`);
      }
    });
  }
  for (const [sex, keys] of Object.entries(set.portraits.hero)) {
    for (const classKey of Object.keys(set.classes)) {
      const count = keys.filter((key) => own(rows, key)?.classes?.includes(classKey) === true).length;
      if (count < picturesWanted) {
        warnings.push(`portraits.hero.${sex}: ${counted(count)} of the Class ${classKey}, fewer than ${picturesWanted}`);
      }
    }
  }
  return warnings;
}
