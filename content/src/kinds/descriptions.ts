// What a person's descriptive Attributes are written from (DL-125 item 6, DL-127 item 2, DL-134 items
// 4 and 6, DL-135 item 6; `descriptions.json`): the age bands, the pronouns by sex, the Birthplaces,
// the Stations, the Tempers, the Callings with the Traits each suits and clashes with, the
// Appearance's phrases by sex, age band and slot, the Guildmaster's Biography's sentences by part and
// by a picture's Station, Callings and band, and Temper, and a Hero's Biography's sentences.

import type { AppearancePhrases, ContentSet, Descriptions, PortraitAppearance, Sex } from '@heroesim/engine/content';
import { biographyTraitSentences, descriptiveAttributeMaxLength, heroBiographyTraitSentences, sexes } from '@heroesim/engine/content';
import { byKey, integer, listOfRows, object, optional, rowOf, single, strings, text, type Fields } from './read.js';
import { checkReferences, lowerAndHyphens, own, repeated, type KindRules } from './rules.js';

const sentencesByKey = byKey(strings);
const sentencesByKeyAndBand = byKey(byKey(strings));

export const descriptionsKind = single<'descriptions', Descriptions>(
  'descriptions',
  'descriptions.json',
  {
    ageBands: listOfRows(rowOf({ key: text, from: integer }, 'an age band')),
    pronouns: object(Object.fromEntries(sexes.map((sex) => [sex, byKey(text)])) as Fields<Descriptions['pronouns']>, 'the pronouns by sex'),
    birthplaces: strings,
    stations: strings,
    tempers: strings,
    callings: byKey(object({ suits: strings, clashes: strings }, 'a calling')),
    appearance: object(
      Object.fromEntries(
        sexes.map((sex) => [
          sex,
          byKey(
            object<AppearancePhrases>(
              { build: strings, face: strings, hair: strings, eyes: strings, mark: strings, bearing: strings, facialHair: optional(strings) },
              "an age band's Appearance phrases",
            ),
          ),
        ]),
      ) as Fields<Descriptions['appearance']>,
      'the Appearances by sex',
    ),
    biography: object(
      {
        origins: sentencesByKey,
        careers: sentencesByKey,
        backgrounds: sentencesByKey,
        traits: sentencesByKey,
        closings: sentencesByKey,
        successors: strings,
        stationOrigins: sentencesByKey,
        callingCareers: sentencesByKeyAndBand,
        temperClosings: sentencesByKey,
      },
      "the Biography's sentences",
    ),
    heroBiography: object(
      { backgrounds: sentencesByKey, classes: sentencesByKeyAndBand, traits: sentencesByKey, closings: sentencesByKey },
      "a Hero's Biography sentences",
    ),
  },
  'the descriptions',
  'must be an object of the age bands, pronouns, Birthplaces, Appearances and Biographies',
  () => ({
    ageBands: [],
    pronouns: { female: {}, male: {} },
    birthplaces: [],
    stations: [],
    tempers: [],
    callings: {},
    appearance: { female: {}, male: {} },
    biography: {
      origins: {},
      careers: {},
      backgrounds: {},
      traits: {},
      closings: {},
      successors: [],
      stationOrigins: {},
      callingCareers: {},
      temperClosings: {},
    },
    heroBiography: { backgrounds: {}, classes: {}, traits: {}, closings: {} },
  }),
);

/** A text's length as the engine counts it: Unicode code points, so an accented letter counts once. */
export function lengthOf(text: string): number {
  return [...text].length;
}

/** A slot in a Biography's sentence: `{he}`, `{birthplace}`. */
const slotPattern = /\{([^{}]*)\}/g;

/** The slot a Guildmaster's Biography sentence may use beside the pronouns: the Guildmaster's Birthplace. */
const birthplaceSlot = 'birthplace';

/** `text` with each pronoun's slot `words`' word and `{birthplace}` `birthplace`; any other slot as it stands. */
export function filledWith(text: string, words: Readonly<Record<string, string>>, birthplace: string): string {
  return text.replace(slotPattern, (slot, name: string) => (name === birthplaceSlot ? birthplace : (own(words, name) ?? slot)));
}

/** Whether `text` is written: trimmed, not empty, and beginning with a capital letter. */
function written(text: string): boolean {
  return text !== '' && text === text.trim() && /^\p{Lu}/u.test(text);
}

/**
 * Refuses an empty list, unless it `mayBeEmpty`, and each text that is no sentence: trimmed, a capital
 * first and a full stop last. With `slots`, each slot is one of them and a `{birthplace}` is followed
 * by a comma or a full stop, since a Birthplace may hold a comma ("Scarrow, a fishing village"); with
 * none, a text has no slot. `fill` is the pronouns' words a sentence is read with.
 */
export function checkSentences(
  texts: readonly string[],
  where: string,
  slots: ReadonlySet<string> | null,
  fill: Readonly<Record<string, string>>,
  problems: string[],
  options: { mayBeEmpty?: boolean } = {},
): void {
  if (texts.length === 0 && options.mayBeEmpty !== true) problems.push(`${where} is empty`);
  texts.forEach((text, index) => {
    const at = `${where}.${index}`;
    const filled = text.replace(slotPattern, (slot, name: string) => {
      if (slots === null) return slot;
      if (!slots.has(name)) problems.push(`${at}: {${name}} is not a slot; the slots are ${[...slots].map((it) => `{${it}}`).join(', ')}`);
      return name === birthplaceSlot ? 'Place' : (own(fill, name) ?? name);
    });
    if (/[{}]/.test(filled)) problems.push(`${at} has a brace that is no slot${slots !== null ? '' : ': an Appearance has no slot'}`);
    if (slots?.has(birthplaceSlot) === true && new RegExp(`\\{${birthplaceSlot}\\}(?![,.])`).test(text)) {
      problems.push(`${at}: {${birthplaceSlot}} is followed by a comma or a full stop, since a Birthplace may hold a comma`);
    }
    if (!written(filled) || !filled.endsWith('.')) problems.push(`${at} is no sentence: trimmed, a capital first and a full stop last`);
  });
}

/** The Appearance's slots, in the order a drawn Appearance is written, `mark` and `bearing` one of the two. */
const appearanceSlots = ['build', 'face', 'hair', 'facialHair', 'eyes', 'mark', 'bearing'] as const;

/** The Biography's parts that are by age band. */
const bandedParts = ['origins', 'careers', 'closings'] as const;

/** The longest text each descriptive Attribute can be written as from a content set's descriptions. */
export interface LongestDescriptions {
  birthplace: number;
  appearance: number;
  /** A Guildmaster's Biography, with a picture or without. */
  biography: number;
  /** A Hero's Biography, with a picture or without (DL-135 item 6). */
  heroBiography: number;
}

/**
 * The longest Birthplace, Appearance and Biography the engine can write from `set.descriptions` and
 * the pictures' rows, in characters (DL-125 item 6, DL-134 items 6 and 9), by the way the engine
 * writes them (`engine/src/descriptions.ts`):
 * - an Appearance is one phrase of each slot of the sex's age band, `facialHair` a male's only, and
 *   `mark` or `bearing`, in that order, joined by spaces;
 * - a Guildmaster's Biography is an origin, a career, the Guild Background's sentence, one for each of
 *   the first `biographyTraitSentences` Traits, and a closing, those there are joined by spaces, each
 *   pronoun slot the sex's word and `{birthplace}` the Birthplace, which may be as long as its bound.
 *   With a picture of the sex (DL-134 item 6), whatever its band, since the player may choose any: the
 *   origin is its Station's, the career its Callings' at the band or one of its hooks, and the closing
 *   its Temper's, each the band's where its own list is empty;
 * - a Hero's Biography (DL-135 item 6; a change in how the engine writes it is a change here): a
 *   sentence of their Background; one of their Class at their band, or with a picture one of its
 *   Classes' at the band or one of its hooks; one for each of the first `heroBiographyTraitSentences`
 *   Hero Traits; and a closing, the band's, or with a picture its Temper's, the band's where the Temper
 *   has none; joined by spaces, with the sex's pronouns.
 * The longest of every combination, not of samples: each part at its longest, for each sex, band and
 * picture. A picture's narrative is not among them; it is checked alone.
 */
export function longestDescriptions(set: Pick<ContentSet, 'descriptions' | 'portraits' | 'portraitAppearances'>): LongestDescriptions {
  const { descriptions } = set;
  const rows = set.portraitAppearances.portraits;
  const most = (values: readonly number[]): number => values.reduce((max, value) => Math.max(max, value), 0);
  const joined = (lengths: readonly number[]): number => {
    const present = lengths.filter((length) => length > 0);
    return present.reduce((sum, length) => sum + length, 0) + Math.max(0, present.length - 1);
  };
  /** The rows of the pictures of `role` and `sex`, with `null` first for a person with none. */
  const picturesFor = (role: 'guildmaster' | 'hero', sex: Sex): (PortraitAppearance | null)[] => [
    null,
    ...set.portraits[role][sex].flatMap((key) => own(rows, key) ?? []),
  ];
  const birthplace = most(descriptions.birthplaces.map((place) => lengthOf(place.trim())));
  let appearance = 0;
  let biography = 0;
  let heroBiography = 0;
  for (const sex of Object.keys(descriptions.appearance) as Sex[]) {
    const words = descriptions.pronouns[sex];
    const sentence = (text: string): number => lengthOf(filledWith(text, words, 'x'.repeat(descriptiveAttributeMaxLength.birthplace)));
    const longest = (texts: readonly string[] | undefined): number => most((texts ?? []).map(sentence));
    for (const phrases of Object.values(descriptions.appearance[sex])) {
      const slot = (name: (typeof appearanceSlots)[number]): number => most((phrases[name] ?? []).map((phrase) => lengthOf(phrase)));
      appearance = Math.max(
        appearance,
        joined([slot('build'), slot('face'), slot('hair'), slot('facialHair'), slot('eyes'), Math.max(slot('mark'), slot('bearing'))]),
      );
    }

    const parts = descriptions.biography;
    // A successor's sentence stands in the Background's place.
    const background = Math.max(most(Object.values(parts.backgrounds).map(longest)), longest(parts.successors));
    const traits = Object.values(parts.traits)
      .map(longest)
      .sort((a, b) => b - a)
      .slice(0, biographyTraitSentences);
    /** The longest of a picture's own list, or of the band's where its own is empty. */
    const ownElseBand = (ownList: readonly string[], band: readonly string[] | undefined): number =>
      ownList.length > 0 ? longest(ownList) : longest(band);
    for (const band of descriptions.ageBands) {
      for (const picture of picturesFor('guildmaster', sex)) {
        const bandOrigins = own(parts.origins, band.key);
        const bandCareers = own(parts.careers, band.key);
        const bandClosings = own(parts.closings, band.key);
        if (picture === null) {
          biography = Math.max(biography, joined([longest(bandOrigins), longest(bandCareers), background, ...traits, longest(bandClosings)]));
          continue;
        }
        const callingCareers = (picture.callings ?? []).flatMap((calling) => own(own(parts.callingCareers, calling) ?? {}, band.key) ?? []);
        const career = Math.max(longest(callingCareers), longest(picture.hooks), callingCareers.length > 0 ? 0 : longest(bandCareers));
        biography = Math.max(
          biography,
          joined([
            ownElseBand(own(parts.stationOrigins, picture.station) ?? [], bandOrigins),
            career,
            background,
            ...traits,
            ownElseBand(own(parts.temperClosings, picture.temper) ?? [], bandClosings),
          ]),
        );
      }
    }

    const hero = descriptions.heroBiography;
    const heroBackground = most(Object.values(hero.backgrounds).map(longest));
    const heroTraits = Object.values(hero.traits)
      .map(longest)
      .sort((a, b) => b - a)
      .slice(0, heroBiographyTraitSentences);
    for (const band of descriptions.ageBands) {
      const atBand = (classKey: string): readonly string[] => own(own(hero.classes, classKey) ?? {}, band.key) ?? [];
      const bandClosings = own(hero.closings, band.key);
      for (const picture of picturesFor('hero', sex)) {
        const classSentence =
          picture === null
            ? most(Object.keys(hero.classes).map((classKey) => longest(atBand(classKey))))
            : Math.max(most((picture.classes ?? []).map((classKey) => longest(atBand(classKey)))), longest(picture.hooks));
        const closing = picture === null ? longest(bandClosings) : ownElseBand(own(parts.temperClosings, picture.temper) ?? [], bandClosings);
        heroBiography = Math.max(heroBiography, joined([heroBackground, classSentence, ...heroTraits, closing]));
      }
    }
  }
  return { birthplace, appearance, biography, heroBiography };
}

/**
 * The descriptions' rules, each problem named by its path:
 * - the age bands: at least one, the first from 0, then rising, each key lower case and hyphens;
 * - the pronouns: the same slots, each a word of letters, for every sex, none called `birthplace`;
 * - the Birthplaces: at least one, each written, trimmed, beginning with a capital, listed once;
 * - the Appearance: every sex has a phrase list for each age band and slot, `facialHair` a male's
 *   only; each phrase is a sentence, beginning with a capital and ending with a full stop, with no slot;
 * - the Biography: its origins, careers and closings have every age band; its backgrounds are Guild
 *   Backgrounds and its traits Guildmaster Traits, each optional; a successor's sentences are at least
 *   one; each sentence begins with a capital and ends with a full stop, its slots are the pronouns'
 *   and `{birthplace}`, and `{birthplace}` is followed by a comma or a full stop, since a Birthplace
 *   may hold a comma of its own ("Scarrow, a fishing village");
 * - the words a picture is read in (DL-134 item 4): the Stations and the Tempers, at least one of
 *   each, each lower case and hyphens and listed once; the Callings, at least one, each keyed so,
 *   suiting and clashing with Guildmaster Traits, none both;
 * - the Biography by a picture: `stationOrigins` by Station, `callingCareers` by Calling and then by
 *   age band, and `temperClosings` by Temper, each key optional and defined, each list at least one
 *   sentence; a Temper's closing names no Birthplace, since it closes a Hero's too;
 * - a Hero's Biography (DL-135 item 6): its sentences by Hero Background, by Class and then by age
 *   band, and by Hero Trait, each key optional and defined, and its closings for every age band; no
 *   sentence names a Birthplace, since a Hero has none;
 * - and the longest Birthplace, Appearance and Biography they can make (`longestDescriptions`), a
 *   Guildmaster's and a Hero's, hooks included, are within 60, 280 and 1,000 characters.
 */
export const descriptionsRules: KindRules = {
  key: 'descriptions',
  check(set, problems) {
    const { ageBands, pronouns, birthplaces, appearance, biography, stations, tempers, callings, heroBiography } = set.descriptions;

    if (ageBands.length === 0) problems.push('descriptions.ageBands is empty: every age needs a band');
    else if (ageBands[0]?.from !== 0) {
      problems.push(`descriptions.ageBands.0.from is ${ageBands[0]?.from}; the first band is from 0, so every age has one`);
    }
    ageBands.forEach((band, index) => {
      if (!lowerAndHyphens.test(band.key)) problems.push(`descriptions.ageBands.${index}.key "${band.key}" is not lower case and hyphens`);
      const before = ageBands[index - 1];
      if (before !== undefined && !(band.from > before.from)) {
        problems.push(`descriptions.ageBands.${index}.from is ${band.from}; each band begins after the one before, from ${before.from}`);
      }
    });
    const bands = ageBands.map((band) => band.key);
    for (const key of repeated(bands)) problems.push(`descriptions.ageBands: "${key}" is listed twice`);

    const bySex = Object.keys(pronouns) as Sex[];
    const slotSets = bySex.map((sex) => Object.keys(pronouns[sex]).sort().join(' '));
    if (new Set(slotSets).size > 1) {
      problems.push(`descriptions.pronouns: every sex has the same slots; they have ${slotSets.map((it) => `[${it}]`).join(' and ')}`);
    }
    for (const sex of bySex) {
      for (const [slot, word] of Object.entries(pronouns[sex])) {
        const where = `descriptions.pronouns.${sex}.${slot}`;
        if (!/^[A-Za-z]+$/.test(slot) || slot === birthplaceSlot) {
          problems.push(`${where}: a pronoun's slot is a word of letters, and not "${birthplaceSlot}"`);
        }
        if (word.trim() === '' || word !== word.trim()) problems.push(`${where} is ${JSON.stringify(word)}; it is a word, trimmed`);
      }
    }
    const pronounSlots = new Set(bySex.flatMap((sex) => Object.keys(pronouns[sex])));
    const slots = new Set([birthplaceSlot, ...pronounSlots]);

    if (birthplaces.length === 0) problems.push('descriptions.birthplaces is empty');
    birthplaces.forEach((place, index) => {
      const where = `descriptions.birthplaces.${index}`;
      if (!written(place) || /[{}]/.test(place)) {
        problems.push(`${where} is ${JSON.stringify(place)}; it is a place's name, trimmed, beginning with a capital`);
      }
      if (lengthOf(place) > descriptiveAttributeMaxLength.birthplace) {
        problems.push(`${where} is ${lengthOf(place)} characters; a Birthplace holds at most ${descriptiveAttributeMaxLength.birthplace}`);
      }
    });
    for (const place of repeated(birthplaces)) problems.push(`descriptions.birthplaces: "${place}" is listed twice`);

    /** Refuses a key of `byBand` that is no band. */
    const onlyBands = (byBand: Readonly<Record<string, unknown>>, where: string): void => {
      for (const key of Object.keys(byBand)) if (!bands.includes(key)) problems.push(`${where}: "${key}" is not an age band`);
    };
    /** Refuses a band missing from `byBand`, and a key there that is no band. */
    const everyBand = (byBand: Readonly<Record<string, unknown>>, where: string): void => {
      for (const band of bands) if (!Object.hasOwn(byBand, band)) problems.push(`${where}: the age band "${band}" is missing`);
      onlyBands(byBand, where);
    };
    const fill = pronouns.female;
    /** Refuses an empty list and each text that is no sentence, with a Guildmaster's slots, a Hero's, or none. */
    const sentences = (texts: readonly string[], where: string, slotted: 'guildmaster' | 'hero' | false): void =>
      checkSentences(texts, where, slotted === false ? null : slotted === 'hero' ? pronounSlots : slots, fill, problems);

    for (const [sex, byBand] of Object.entries(appearance) as [Sex, Descriptions['appearance']['male']][]) {
      const where = `descriptions.appearance.${sex}`;
      everyBand(byBand, where);
      for (const [band, phrases] of Object.entries(byBand)) {
        for (const slot of appearanceSlots) {
          const list = phrases[slot];
          const at = `${where}.${band}.${slot}`;
          if (slot === 'facialHair' && sex !== 'male') {
            if (list !== undefined) problems.push(`${at}: facialHair is a male's only`);
          } else if (list === undefined) problems.push(`${at} is missing`);
          else sentences(list, at, false);
        }
      }
    }

    for (const part of bandedParts) {
      everyBand(biography[part], `descriptions.biography.${part}`);
      for (const [band, texts] of Object.entries(biography[part])) sentences(texts, `descriptions.biography.${part}.${band}`, 'guildmaster');
    }
    for (const [key, texts] of Object.entries(biography.backgrounds)) {
      if (own(set.backgrounds, key)?.owner !== 'guild') problems.push(`descriptions.biography.backgrounds: "${key}" is not a Guild Background`);
      sentences(texts, `descriptions.biography.backgrounds.${key}`, 'guildmaster');
    }
    for (const [key, texts] of Object.entries(biography.traits)) {
      if (own(set.guildmasterTraits, key) === undefined) problems.push(`descriptions.biography.traits: "${key}" is not a Guildmaster Trait`);
      sentences(texts, `descriptions.biography.traits.${key}`, 'guildmaster');
    }
    sentences(biography.successors, 'descriptions.biography.successors', 'guildmaster');

    for (const [name, list] of [['stations', stations], ['tempers', tempers]] as const) {
      if (list.length === 0) problems.push(`descriptions.${name} is empty`);
      for (const key of list) if (!lowerAndHyphens.test(key)) problems.push(`descriptions.${name}: "${key}" is not lower case and hyphens`);
      for (const key of repeated(list)) problems.push(`descriptions.${name}: "${key}" is listed twice`);
    }
    const guildmasterTraits = new Set(Object.keys(set.guildmasterTraits));
    if (Object.keys(callings).length === 0) problems.push('descriptions.callings is empty');
    for (const [key, calling] of Object.entries(callings)) {
      const where = `descriptions.callings.${key}`;
      if (!lowerAndHyphens.test(key)) problems.push(`descriptions.callings: "${key}" is not lower case and hyphens`);
      checkReferences(`${where}.suits`, calling.suits, guildmasterTraits, 'a Guildmaster Trait', problems);
      checkReferences(`${where}.clashes`, calling.clashes, guildmasterTraits, 'a Guildmaster Trait', problems);
      for (const trait of new Set(calling.suits)) if (calling.clashes.includes(trait)) problems.push(`${where}: "${trait}" both suits and clashes`);
    }

    // The Biography by a picture (DL-134 items 4 and 6).
    const stationSet = new Set(stations);
    for (const [key, texts] of Object.entries(biography.stationOrigins)) {
      if (!stationSet.has(key)) problems.push(`descriptions.biography.stationOrigins: "${key}" is not a station`);
      sentences(texts, `descriptions.biography.stationOrigins.${key}`, 'guildmaster');
    }
    for (const [key, byBand] of Object.entries(biography.callingCareers)) {
      const where = `descriptions.biography.callingCareers`;
      if (!Object.hasOwn(callings, key)) problems.push(`${where}: "${key}" is not a calling`);
      onlyBands(byBand, `${where}.${key}`);
      for (const [band, texts] of Object.entries(byBand)) sentences(texts, `${where}.${key}.${band}`, 'guildmaster');
    }
    const temperSet = new Set(tempers);
    for (const [key, texts] of Object.entries(biography.temperClosings)) {
      if (!temperSet.has(key)) problems.push(`descriptions.biography.temperClosings: "${key}" is not a temper`);
      sentences(texts, `descriptions.biography.temperClosings.${key}`, 'hero');
    }

    // A Hero's Biography (DL-135 item 6).
    for (const [key, texts] of Object.entries(heroBiography.backgrounds)) {
      if (own(set.backgrounds, key)?.owner !== 'hero') problems.push(`descriptions.heroBiography.backgrounds: "${key}" is not a Hero Background`);
      sentences(texts, `descriptions.heroBiography.backgrounds.${key}`, 'hero');
    }
    for (const [key, byBand] of Object.entries(heroBiography.classes)) {
      const where = 'descriptions.heroBiography.classes';
      if (!Object.hasOwn(set.classes, key)) problems.push(`${where}: "${key}" is not a Class`);
      onlyBands(byBand, `${where}.${key}`);
      for (const [band, texts] of Object.entries(byBand)) sentences(texts, `${where}.${key}.${band}`, 'hero');
    }
    for (const [key, texts] of Object.entries(heroBiography.traits)) {
      if (own(set.heroTraits, key) === undefined) problems.push(`descriptions.heroBiography.traits: "${key}" is not a Hero Trait`);
      sentences(texts, `descriptions.heroBiography.traits.${key}`, 'hero');
    }
    everyBand(heroBiography.closings, 'descriptions.heroBiography.closings');
    for (const [band, texts] of Object.entries(heroBiography.closings)) sentences(texts, `descriptions.heroBiography.closings.${band}`, 'hero');

    const longest = longestDescriptions(set);
    const names = { appearance: 'Appearance', biography: 'Biography', heroBiography: "Hero's Biography" } as const;
    for (const [attribute, bound] of [
      ['appearance', descriptiveAttributeMaxLength.appearance],
      ['biography', descriptiveAttributeMaxLength.biography],
      ['heroBiography', descriptiveAttributeMaxLength.biography],
    ] as const) {
      if (longest[attribute] > bound) {
        problems.push(`descriptions.${attribute}: the longest ${names[attribute]} it can write is ${longest[attribute]} characters; it holds at most ${bound}`);
      }
    }
  },
};
