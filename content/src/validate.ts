// The content schema's rules across rows: what a single row's shape cannot show (M1-S4).
// `parseContent` runs this on every set it builds; a set assembled in memory, by a test or a
// later module, runs it directly. Since v1.1.4-S1 it holds every Query, an Encounter's Checks'
// scores and a Synergy's requirements, to its types, its keys and its size (ADR-0010).

import type {
  Consequence,
  ConsumableEffect,
  ContentSet,
  Descriptions,
  EncounterKind,
  FacilityKey,
  PortraitAppearance,
  PortraitRole,
  Sex,
  SlotKey,
} from '@heroesim/engine';

/**
 * Content that breaks the schema. The message lists every problem found, one per line, and
 * each names the file or table and the offending key, so an author can go straight to it.
 */
export class ContentError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`The content is invalid:\n  ${problems.join('\n  ')}`);
    this.name = 'ContentError';
    this.problems = problems;
  }
}

/**
 * How far a Class's growth weights may sum from 1. Weights are written by hand to four places,
 * and 2:1 splits do not terminate in decimals (INPUTS 5.3), so the sum is near 1, not exact; a
 * rule draws in proportion to the weights and so is indifferent to the difference.
 */
export const growthSumTolerance = 0.001;

/**
 * How far a Quest template's, or an Encounter's, demand weights may sum from 1 (M2-S3, M4-S1):
 * written by hand, like growth, and read as proportions, so near 1 is as good as exactly 1.
 */
export const demandSumTolerance = 0.001;

/** The Hall's facilities an Improvement may raise (`FacilityKey`): the compiler holds it to the union. */
const facilities: Readonly<Record<FacilityKey, true>> = { infirmary: true, trainingYard: true, quarters: true };

/** The kinds of Encounter a Synergy may name (`EncounterKind`): the compiler holds it to the union. */
const encounterKinds: Readonly<Record<EncounterKind, true>> = { combat: true, travel: true, social: true, arcane: true, stealth: true };

/** The gear slots an Item may be made for (`SlotKey`, the engine's `gearSlotKeys`): the compiler holds it to the union. */
const gearSlots: Readonly<Record<SlotKey, true>> = { weapon: true, armour: true, trinket: true };

/** Lower-case letters and digits in words joined by single hyphens, starting with a letter. */
const kebabCase = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Check a content set against the rules no single row can break alone. Returns the set it was
 * given when it passes.
 *
 * @throws ContentError naming every offending key
 */
export function validateContent(set: ContentSet): ContentSet {
  const problems: string[] = [];

  const tables = {
    stats: set.stats,
    classes: set.classes,
    skills: set.skills,
    traits: set.traits,
    backgrounds: set.backgrounds,
    spheres: set.spheres,
    questTemplates: set.questTemplates,
    injuries: set.injuries,
    dispositions: set.dispositions,
    improvements: set.improvements,
    encounters: set.encounters,
    synergies: set.synergies,
    items: set.items,
    lootTables: set.lootTables,
  };
  for (const [table, rows] of Object.entries(tables)) {
    for (const [key, row] of Object.entries(rows)) {
      if (!kebabCase.test(key)) problems.push(`${table}: "${key}" is not kebab-case`);
      if (row.key !== key) {
        problems.push(`${table}.${key}: its key is "${row.key}", not the key it is stored under`);
      }
    }
  }

  for (const [key, stat] of Object.entries(set.stats)) {
    if (stat.min > stat.max) {
      problems.push(`stats.${key}: min ${stat.min} is greater than max ${stat.max}`);
    } else if (stat.default < stat.min || stat.default > stat.max) {
      problems.push(`stats.${key}: default ${stat.default} is outside ${stat.min} to ${stat.max}`);
    }
    // An Encounter's old `best` read Math.max(0, …) of a Stat and loads as `max` (v1.1.4-S1): the two
    // agree only while no Hero's effective value is below 0, which a least value of 0 or more holds.
    if (stat.owner === 'hero' && !(stat.min >= 0)) {
      problems.push(`stats.${key}.min is ${stat.min}; a Hero Stat's least value is 0 or more, as a Check reads it (DL-151)`);
    }
  }

  const heroStats = new Set(
    Object.entries(set.stats)
      .filter(([, stat]) => stat.owner === 'hero')
      .map(([key]) => key),
  );
  const skills = new Set(Object.keys(set.skills));
  for (const [key, it] of Object.entries(set.classes)) {
    const where = `classes.${key}`;
    checkReferences(`${where}.leadingStats`, it.leadingStats, heroStats, 'a Hero Stat', problems);
    checkReferences(`${where}.gatedSkills`, it.gatedSkills, skills, 'a Skill', problems);
    checkReferences(`${where}.growth`, Object.keys(it.growth), heroStats, 'a Hero Stat', problems);
    checkGrowth(`${where}.growth`, it.growth, problems);
  }

  const spheres = new Set(Object.keys(set.spheres));
  const classes = new Set(Object.keys(set.classes));
  const served = new Set<string>();
  for (const [key, template] of Object.entries(set.questTemplates)) {
    const where = `questTemplates.${key}`;
    if (template.sphereKeys.length === 0) problems.push(`${where}.sphereKeys is empty: no Patron offers it`);
    checkReferences(`${where}.sphereKeys`, template.sphereKeys, spheres, 'a Sphere', problems);
    for (const sphereKey of template.sphereKeys) served.add(sphereKey);
    for (const tag of template.tags) {
      if (!kebabCase.test(tag)) problems.push(`${where}.tags: "${tag}" is not kebab-case`);
    }
    for (const tag of repeated(template.tags)) problems.push(`${where}.tags: "${tag}" is listed twice`);
    checkRange(where, 'difficulty', template.difficultyMin, template.difficultyMax, 1, problems);
    checkRange(where, 'durationDays', template.durationDaysMin, template.durationDaysMax, 1, problems);
    checkRange(where, 'partySize', template.partySizeMin, template.partySizeMax, 1, problems);
    if (!(template.rewardPerDifficulty >= 0)) {
      problems.push(`${where}.rewardPerDifficulty is ${template.rewardPerDifficulty}; it is a number of 0 or more`);
    }
    if (!(template.fameEffect >= 0)) {
      problems.push(`${where}.fameEffect is ${template.fameEffect}; it is a whole number of 0 or more`);
    }
    checkDemands(`${where}.demands`, template.demands, heroStats, problems);
    checkReferences(`${where}.skillKeys`, template.skillKeys, skills, 'a Skill', problems);
    const { classKey, skillKey } = template.requires;
    if (classKey !== undefined && !classes.has(classKey)) {
      problems.push(`${where}.requires.classKey: "${classKey}" is not a Class`);
    }
    if (skillKey !== undefined && !skills.has(skillKey)) {
      problems.push(`${where}.requires.skillKey: "${skillKey}" is not a Skill`);
    }
    checkEncounterDraw(where, template, set.encounters, problems);
    const { lootTableKey } = template;
    if (lootTableKey !== null && !Object.hasOwn(set.lootTables, lootTableKey)) {
      problems.push(`${where}.lootTableKey: "${lootTableKey}" is not a Loot table`);
    }
  }
  // A Patron's Quests are found by Sphere when the Board is drawn (pre-M0 review D3): a Sphere no
  // template serves would leave its Patrons offering nothing.
  for (const sphereKey of spheres) {
    if (!served.has(sphereKey)) problems.push(`spheres.${sphereKey}: no Quest template names it in sphereKeys`);
  }

  // The types an Encounter's injury consequence names (M2-S5, M4-S1): at least one, each healing in
  // a Day or more, and leaving no Trait or a Hero Trait content defines.
  if (Object.keys(set.injuries).length === 0) problems.push('injuries is empty: the Quest Engine inflicts one of its types');
  for (const [key, type] of Object.entries(set.injuries)) {
    const where = `injuries.${key}`;
    checkRange(where, 'healDays', type.healDaysMin, type.healDaysMax, 1, problems);
    const trait = type.leavesTrait;
    const row = trait === null || !Object.hasOwn(set.traits, trait) ? undefined : set.traits[trait];
    if (trait !== null && row?.owner !== 'hero') {
      problems.push(`${where}.leavesTrait: "${trait}" is not a Hero Trait`);
    }
  }

  checkDispositions(set.dispositions, problems);
  checkImprovements(set.improvements, problems);
  const keys = queryKeys(set);
  checkEncounters(set, keys, problems);
  checkTraitEffects(set.traits, classes, heroStats, problems);
  checkTraitCosts(set.traits, problems);
  checkSynergies(set.synergies, keys, problems);
  checkItems(set.items, heroStats, problems);
  checkLootTables(set, problems);

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

  checkPortraits(set.portraits, problems);
  checkPortraitAppearances(set, problems);
  checkDescriptions(set, problems);

  if (problems.length > 0) throw new ContentError(problems);
  return set;
}

/** The prefix each role's Portrait keys begin with, so a key is unique across the roles (DL-126 item 2). */
const portraitPrefixes: Readonly<Record<keyof ContentSet['portraits'], string>> = Object.freeze({
  guildmaster: 'gm-',
  hero: 'hero-',
  patron: 'patron-',
});

/** A picture's name: lower-case letters and digits in words joined by hyphens (DL-125 item 11). */
const lowerAndHyphens = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The Portraits (v1.1.2-S3, DL-125 items 3 and 11, DL-126 item 2): any role and sex may have none;
 * each key is lower case and hyphens, begins with its role's prefix, and is listed once in the whole
 * file, so a key names one picture of one role and sex. That each names a file in `media/` is the
 * page's test to hold (`web/src/media.test.ts`), since content reads no files.
 */
function checkPortraits(portraits: ContentSet['portraits'], problems: string[]): void {
  const keys: string[] = [];
  for (const [role, bySex] of Object.entries(portraits) as [keyof ContentSet['portraits'], ContentSet['portraits']['hero']][]) {
    for (const [sex, list] of Object.entries(bySex)) {
      const where = `portraits.${role}.${sex}`;
      for (const key of list) {
        if (!lowerAndHyphens.test(key)) problems.push(`${where}: "${key}" is not lower case and hyphens`);
        else if (!key.startsWith(portraitPrefixes[role])) problems.push(`${where}: "${key}" does not begin "${portraitPrefixes[role]}"`);
        keys.push(key);
      }
    }
  }
  for (const key of repeated(keys)) problems.push(`portraits: "${key}" is listed twice`);
}

/**
 * The most characters (Unicode code points, once trimmed) each descriptive Attribute holds: the
 * engine's `descriptiveAttributeMaxLength` (M9-S2, DL-102), which this package, importing only the
 * engine's types, repeats. A test beside both holds them equal (`cli/src/descriptions.test.ts`).
 */
export const descriptionBounds = Object.freeze({ birthplace: 60, appearance: 280, biography: 1000 });

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

/**
 * How many of a Guildmaster's Traits the Biography gives a sentence, the first in their order: the
 * engine's `biographyTraitSentences` (v1.1.2-S5), repeated here as the bounds are.
 */
export const biographyTraitSentences = 2;

/**
 * How many of a Hero's Traits their Biography gives a sentence, the first in their order (v1.1.3-S1):
 * as many as a Guildmaster's. v1.1.3-S6's `describeHero` repeats it, or changes it here with itself.
 */
export const heroBiographyTraitSentences = 2;

/** A text's length as the engine counts it: Unicode code points, so an accented letter counts once. */
function lengthOf(text: string): number {
  return [...text].length;
}

/** The value `record` holds under `key`, its own and not its prototype's; `undefined` for none. */
function own<Value>(record: Readonly<Record<string, Value>>, key: string | undefined): Value | undefined {
  return key !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}

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
 * The rows of the pictures (v1.1.2-S4 and S5, v1.1.3-S1; DL-126 item 2, DL-127, DL-134 items 3 and 10,
 * DL-135 item 2), each problem named by its path:
 * - each feature's key is lower case and hyphens, and the Traits it shows are Hero Traits, each once;
 * - every Guildmaster's and Hero's picture `portraits.json` lists has a row, and every row names a
 *   picture; a Patron's picture has no row yet (DL-135 item 10);
 * - a row has its role's fields and no other's: a Guildmaster's one or two callings, a Hero's one or
 *   more classes;
 * - its station, temper, callings, classes and features are defined, each once, and a `maleOnly`
 *   feature is on a male picture's only;
 * - its `apparentAge` is two whole numbers from 0, the first no greater than the second;
 * - its narrative is written, at most 260 characters, with no slot or brace, since it is shown as
 *   written (v1.1.3-S5);
 * - it has at most two hooks, each a sentence with no slot but the pronouns', at most 160 characters
 *   with its picture's sex's pronouns.
 * A feature no picture uses is allowed.
 */
function checkPortraitAppearances(
  set: Pick<ContentSet, 'portraits' | 'portraitAppearances' | 'descriptions' | 'classes' | 'traits'>,
  problems: string[],
): void {
  const { features, portraits: rows } = set.portraitAppearances;
  const { descriptions } = set;
  const heroTraits = new Set(Object.values(set.traits).filter((trait) => trait.owner === 'hero').map((trait) => trait.key));
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
    // Shown as written (DL-127 item 4), never filled: a slot would show as braces (v1.1.3-S5).
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
}

/**
 * The warnings a content set passes with (v1.1.3-S1, DL-134 item 10): each sex and age band with fewer
 * than `picturesWanted` Guildmaster pictures whose `apparentAge` touches the band, and each Class and
 * sex with fewer Hero pictures of the Class. A person with no picture that fits shows the Silhouette
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

/** A slot in a Biography's sentence: `{he}`, `{birthplace}`. */
const slotPattern = /\{([^{}]*)\}/g;

/** The slot a Guildmaster's Biography sentence may use beside the pronouns: the Guildmaster's Birthplace. */
const birthplaceSlot = 'birthplace';

/** `text` with each pronoun's slot `words`' word and `{birthplace}` `birthplace`; any other slot as it stands. */
function filledWith(text: string, words: Readonly<Record<string, string>>, birthplace: string): string {
  return text.replace(slotPattern, (slot, name: string) => (name === birthplaceSlot ? birthplace : (own(words, name) ?? slot)));
}

/**
 * Refuses an empty list, unless it `mayBeEmpty`, and each text that is no sentence: trimmed, a capital
 * first and a full stop last. With `slots`, each slot is one of them and a `{birthplace}` is followed
 * by a comma or a full stop, since a Birthplace may hold a comma ("Scarrow, a fishing village"); with
 * none, a text has no slot. `fill` is the pronouns' words a sentence is read with.
 */
function checkSentences(
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
  /** A Hero's Biography, with a picture or without (v1.1.3-S1, DL-135 item 6). */
  heroBiography: number;
}

/**
 * The longest Birthplace, Appearance and Biography the engine can write from `set.descriptions` and
 * the pictures' rows, in characters (v1.1.2-S5, DL-125 item 6; v1.1.3-S1, DL-134 items 6 and 9), by the
 * way the engine writes them (`engine/src/descriptions.ts`):
 * - an Appearance is one phrase of each slot of the sex's age band, `facialHair` a male's only, and
 *   `mark` or `bearing`, in that order, joined by spaces;
 * - a Guildmaster's Biography is an origin, a career, the Guild Background's sentence, one for each of
 *   the first `biographyTraitSentences` Traits, and a closing, those there are joined by spaces, each
 *   pronoun slot the sex's word and `{birthplace}` the Birthplace, which may be as long as its bound.
 *   With a picture of the sex (DL-134 item 6), whatever its band, since the player may choose any: the
 *   origin is its Station's, the career its Callings' at the band or one of its hooks, and the closing
 *   its Temper's, each the band's where its own list is empty;
 * - a Hero's Biography, which v1.1.3-S6 writes and which this assumes it writes so (DL-135 item 6; a
 *   change there is a change here): a sentence of their Background; one of their Class at their band,
 *   or with a picture one of its Classes' at the band or one of its hooks; one for each of the first
 *   `heroBiographyTraitSentences` Hero Traits; and a closing, the band's, or with a picture its
 *   Temper's, the band's where the Temper has none; joined by spaces, with the sex's pronouns.
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
    const sentence = (text: string): number => lengthOf(filledWith(text, words, 'x'.repeat(descriptionBounds.birthplace)));
    const longest = (texts: readonly string[] | undefined): number => most((texts ?? []).map(sentence));
    for (const phrases of Object.values(descriptions.appearance[sex])) {
      const slot = (name: (typeof appearanceSlots)[number]): number => most((phrases[name] ?? []).map((phrase) => lengthOf(phrase)));
      appearance = Math.max(
        appearance,
        joined([slot('build'), slot('face'), slot('hair'), slot('facialHair'), slot('eyes'), Math.max(slot('mark'), slot('bearing'))]),
      );
    }

    const parts = descriptions.biography;
    // A successor's sentence stands in the Background's place (v1.1.2-S6).
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
 * What a Guildmaster's descriptive Attributes are written from (v1.1.2-S5; DL-125 item 6, DL-127
 * item 2), each problem named by its path:
 * - the age bands: at least one, the first from 0, then rising, each key lower case and hyphens;
 * - the pronouns: the same slots, each a word of letters, for every sex, none called `birthplace`;
 * - the Birthplaces: at least one, each written, trimmed, beginning with a capital, listed once;
 * - the Appearance: every sex has a phrase list for each age band and slot, `facialHair` a male's
 *   only; each phrase is a sentence, beginning with a capital and ending with a full stop, with no slot;
 * - the Biography: its origins, careers and closings have every age band; its backgrounds are Guild
 *   Backgrounds and its traits Guildmaster Traits, each optional; a successor's sentences are at least
 *   one (v1.1.2-S6); each sentence begins with a capital and ends with a full stop, its slots are the
 *   pronouns' and `{birthplace}`, and `{birthplace}` is followed by a comma or a full stop, since a
 *   Birthplace may hold a comma of its own ("Scarrow, a fishing village"; v1.1.2-S6);
 * - the vocabulary a picture is read in (v1.1.3-S1, DL-134 item 4): the Stations and the Tempers, at
 *   least one of each, each lower case and hyphens and listed once; the Callings, at least one, each
 *   keyed so, suiting and clashing with Guildmaster Traits, none both; and each Hero Background's
 *   Station, one of them, where a Guild Background has none (DL-135 item 5);
 * - the Biography by a picture (v1.1.3-S1): `stationOrigins` by Station, `callingCareers` by Calling
 *   and then by age band, and `temperClosings` by Temper, each key optional and defined, each list at
 *   least one sentence; a Temper's closing names no Birthplace, since it closes a Hero's too;
 * - a Hero's Biography (v1.1.3-S1, DL-135 item 6): its sentences by Hero Background, by Class and
 *   then by age band, and by Hero Trait, each key optional and defined, and its closings for every
 *   age band; no sentence names a Birthplace, since a Hero has none;
 * - and the longest Birthplace, Appearance and Biography they can make (`longestDescriptions`), a
 *   Guildmaster's and a Hero's, hooks included, are within 60, 280 and 1,000 characters.
 */
function checkDescriptions(
  set: Pick<ContentSet, 'descriptions' | 'backgrounds' | 'traits' | 'classes' | 'portraits' | 'portraitAppearances'>,
  problems: string[],
): void {
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

  const sexes = Object.keys(pronouns) as (keyof Descriptions['pronouns'])[];
  const slotSets = sexes.map((sex) => Object.keys(pronouns[sex]).sort().join(' '));
  if (new Set(slotSets).size > 1) {
    problems.push(`descriptions.pronouns: every sex has the same slots; they have ${slotSets.map((it) => `[${it}]`).join(' and ')}`);
  }
  for (const sex of sexes) {
    for (const [slot, word] of Object.entries(pronouns[sex])) {
      const where = `descriptions.pronouns.${sex}.${slot}`;
      if (!/^[A-Za-z]+$/.test(slot) || slot === birthplaceSlot) {
        problems.push(`${where}: a pronoun's slot is a word of letters, and not "${birthplaceSlot}"`);
      }
      if (word.trim() === '' || word !== word.trim()) problems.push(`${where} is ${JSON.stringify(word)}; it is a word, trimmed`);
    }
  }
  const pronounSlots = new Set(sexes.flatMap((sex) => Object.keys(pronouns[sex])));
  const slots = new Set([birthplaceSlot, ...pronounSlots]);

  if (birthplaces.length === 0) problems.push('descriptions.birthplaces is empty');
  birthplaces.forEach((place, index) => {
    const where = `descriptions.birthplaces.${index}`;
    if (!written(place) || /[{}]/.test(place)) {
      problems.push(`${where} is ${JSON.stringify(place)}; it is a place's name, trimmed, beginning with a capital`);
    }
    if (lengthOf(place) > descriptionBounds.birthplace) {
      problems.push(`${where} is ${lengthOf(place)} characters; a Birthplace holds at most ${descriptionBounds.birthplace}`);
    }
  });
  for (const place of repeated(birthplaces)) problems.push(`descriptions.birthplaces: "${place}" is listed twice`);

  /** Refuses a band missing from `byBand`, and a key there that is no band. */
  const everyBand = (byBand: Readonly<Record<string, unknown>>, where: string): void => {
    for (const band of bands) if (!Object.hasOwn(byBand, band)) problems.push(`${where}: the age band "${band}" is missing`);
    onlyBands(byBand, where);
  };
  /** Refuses a key of `byBand` that is no band. */
  const onlyBands = (byBand: Readonly<Record<string, unknown>>, where: string): void => {
    for (const key of Object.keys(byBand)) if (!bands.includes(key)) problems.push(`${where}: "${key}" is not an age band`);
  };
  const fill = pronouns.female;
  /** Refuses an empty list and each text that is no sentence, with a Guildmaster's slots, a Hero's, or none. */
  const sentences = (texts: readonly string[], where: string, slotted: 'guildmaster' | 'hero' | false): void =>
    checkSentences(texts, where, slotted === false ? null : slotted === 'hero' ? pronounSlots : slots, fill, problems);

  for (const [sex, byBand] of Object.entries(appearance) as [keyof Descriptions['appearance'], Descriptions['appearance']['male']][]) {
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
    if (own(set.traits, key)?.owner !== 'guildmaster') problems.push(`descriptions.biography.traits: "${key}" is not a Guildmaster Trait`);
    sentences(texts, `descriptions.biography.traits.${key}`, 'guildmaster');
  }
  sentences(biography.successors, 'descriptions.biography.successors', 'guildmaster');

  // The vocabulary a picture is read in (v1.1.3-S1, DL-134 item 4).
  for (const [name, list] of [['stations', stations], ['tempers', tempers]] as const) {
    if (list.length === 0) problems.push(`descriptions.${name} is empty`);
    for (const key of list) if (!lowerAndHyphens.test(key)) problems.push(`descriptions.${name}: "${key}" is not lower case and hyphens`);
    for (const key of repeated(list)) problems.push(`descriptions.${name}: "${key}" is listed twice`);
  }
  const guildmasterTraits = new Set(Object.values(set.traits).filter((trait) => trait.owner === 'guildmaster').map((trait) => trait.key));
  if (Object.keys(callings).length === 0) problems.push('descriptions.callings is empty');
  for (const [key, calling] of Object.entries(callings)) {
    const where = `descriptions.callings.${key}`;
    if (!lowerAndHyphens.test(key)) problems.push(`descriptions.callings: "${key}" is not lower case and hyphens`);
    checkReferences(`${where}.suits`, calling.suits, guildmasterTraits, 'a Guildmaster Trait', problems);
    checkReferences(`${where}.clashes`, calling.clashes, guildmasterTraits, 'a Guildmaster Trait', problems);
    for (const trait of new Set(calling.suits)) if (calling.clashes.includes(trait)) problems.push(`${where}: "${trait}" both suits and clashes`);
  }
  const stationSet = new Set(stations);
  for (const [key, background] of Object.entries(set.backgrounds)) {
    const where = `backgrounds.${key}.station`;
    if (background.owner === 'guild') {
      if (background.station !== undefined) problems.push(`${where}: a Guild Background has none`);
    } else if (background.station === undefined) problems.push(`${where} is missing: a Hero Background has one`);
    else if (!stationSet.has(background.station)) {
      problems.push(`${where}: "${background.station}" is not a station defined in descriptions.stations`);
    }
  }

  // The Biography by a picture (v1.1.3-S1, DL-134 items 4 and 6).
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

  // A Hero's Biography (v1.1.3-S1, DL-135 item 6).
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
    if (own(set.traits, key)?.owner !== 'hero') problems.push(`descriptions.heroBiography.traits: "${key}" is not a Hero Trait`);
    sentences(texts, `descriptions.heroBiography.traits.${key}`, 'hero');
  }
  everyBand(heroBiography.closings, 'descriptions.heroBiography.closings');
  for (const [band, texts] of Object.entries(heroBiography.closings)) sentences(texts, `descriptions.heroBiography.closings.${band}`, 'hero');

  const longest = longestDescriptions(set);
  const names = { appearance: 'Appearance', biography: 'Biography', heroBiography: "Hero's Biography" } as const;
  for (const [attribute, bound] of [
    ['appearance', descriptionBounds.appearance],
    ['biography', descriptionBounds.biography],
    ['heroBiography', descriptionBounds.biography],
  ] as const) {
    if (longest[attribute] > bound) {
      problems.push(`descriptions.${attribute}: the longest ${names[attribute]} it can write is ${longest[attribute]} characters; it holds at most ${bound}`);
    }
  }
}

/** Whether `text` is written: trimmed, not empty, and beginning with a capital letter. */
function written(text: string): boolean {
  return text !== '' && text === text.trim() && /^\p{Lu}/u.test(text);
}

/**
 * The Dispositions (M2-S9, M6-S1, DL-56): at least one, since the Guild Generator deals one to
 * every Rival; each appetite a fraction from 0 to 1, and each threshold a multiple of 0 or more.
 */
function checkDispositions(dispositions: ContentSet['dispositions'], problems: string[]): void {
  if (Object.keys(dispositions).length === 0) {
    problems.push('dispositions is empty: the Guild Generator deals one to every Rival');
  }
  for (const [key, disposition] of Object.entries(dispositions)) {
    const where = `dispositions.${key}`;
    for (const field of ['questRiskAppetite', 'transferAppetite'] as const) {
      const value = disposition[field];
      if (!(value >= 0 && value <= 1)) problems.push(`${where}.${field} is ${value}; it is a number from 0 to 1`);
    }
    for (const field of ['recruitThreshold', 'buildThreshold', 'gearThreshold'] as const) {
      const value = disposition[field];
      if (!(value >= 0)) problems.push(`${where}.${field} is ${value}; it is a number of 0 or more`);
    }
  }
}

/**
 * The Hall Improvements (M3-S6): each raises a Hall facility, costs a whole number of Wealth above
 * 0, and each facility's grades run 1, 2, 3, … once each, with no gap, so that `build` finds the
 * next grade of any facility by its number. A facility no row names cannot be built; none need be.
 */
function checkImprovements(improvements: ContentSet['improvements'], problems: string[]): void {
  const grades = new Map<string, number[]>();
  for (const [key, improvement] of Object.entries(improvements)) {
    const where = `improvements.${key}`;
    const { facility, grade, cost } = improvement;
    if (!Object.hasOwn(facilities, facility)) {
      problems.push(`${where}.facility: "${facility}" is not a Hall facility (${Object.keys(facilities).join(', ')})`);
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
      problems.push(
        `improvements: the grades of ${facility} are ${sorted.join(', ')}; they run 1 to ${sorted.length}, each once`,
      );
    }
  }
}

/**
 * What a Quest template's Encounter sequence is drawn by (M4-S1): at least one kind, none twice,
 * each with an Encounter in content to draw, and a count range from 1 that is not upside down.
 */
function checkEncounterDraw(
  where: string,
  template: ContentSet['questTemplates'][string],
  encounters: ContentSet['encounters'],
  problems: string[],
): void {
  if (template.encounterKinds.length === 0) problems.push(`${where}.encounterKinds is empty: a Quest is drawn with Encounters`);
  for (const kind of repeated(template.encounterKinds)) problems.push(`${where}.encounterKinds: "${kind}" is listed twice`);
  for (const kind of new Set(template.encounterKinds)) {
    if (!Object.values(encounters).some((encounter) => encounter.kind === kind)) {
      problems.push(`${where}.encounterKinds: no Encounter is of kind "${kind}"`);
    }
  }
  checkRange(where, 'encounters', template.encountersMin, template.encountersMax, 1, problems);
}

/** How many Checks an Encounter has (v1.1.4-S1): one, loaded from the old form, until v1.1.4-S2 allows up to four. */
export const encounterChecksMax = 1;

/**
 * The Encounters (M4-S1): Checks (v1.1.4-S1), one, each keyed in kebab-case once, named, scored by a
 * Num Query (`checkQuery`), helped by Skills that exist and aimed at a difficulty factor above 0;
 * and consequences each within its kind's bounds, an Injury naming a type content defines. The
 * epic's first box: an unknown Stat, Skill or Injury type is refused. The old form's demands are
 * held as they load (`parseContent`).
 */
function checkEncounters(set: ContentSet, keys: QueryKeys, problems: string[]): void {
  for (const [key, encounter] of Object.entries(set.encounters)) {
    const where = `encounters.${key}`;
    const { checks } = encounter;
    if (checks.length === 0) problems.push(`${where}.checks is empty: an Encounter is resolved by a Check`);
    if (checks.length > encounterChecksMax) {
      problems.push(`${where}.checks has ${checks.length}; an Encounter has at most ${encounterChecksMax}`);
    }
    for (const repeat of repeated(checks.map((it) => it.key))) problems.push(`${where}.checks: "${repeat}" is listed twice`);
    checks.forEach((it, index) => {
      const at = `${where}.checks.${index}`;
      if (!kebabCase.test(it.key)) problems.push(`${at}.key: "${it.key}" is not kebab-case`);
      if (it.name.trim() === '') problems.push(`${at}.name is empty: a Check is named for the narration and the Board`);
      checkQuery(`${at}.score`, it.score, 'num', keys, problems);
      checkReferences(`${at}.skills`, it.skills, keys.skills, 'a Skill', problems);
      if (!(Number.isFinite(it.difficultyFactor) && it.difficultyFactor > 0)) {
        problems.push(`${at}.difficultyFactor is ${it.difficultyFactor}; it is a number above 0`);
      }
    });
    for (const outcome of ['success', 'failure'] as const) {
      encounter.consequences[outcome].forEach((consequence, index) => {
        checkConsequence(`${where}.consequences.${outcome}.${index}`, consequence, set, problems);
      });
    }
  }
}

/** One consequence's fields, by its kind. */
function checkConsequence(where: string, consequence: Consequence, set: ContentSet, problems: string[]): void {
  const probability = (value: number): void => {
    if (!(value >= 0 && value <= 1)) problems.push(`${where}.chance is ${value}; it is a probability from 0 to 1`);
  };
  const factor = (value: number): void => {
    if (!(Number.isFinite(value) && value >= 0)) problems.push(`${where}.factor is ${value}; it is a number of 0 or more`);
  };
  switch (consequence.kind) {
    case 'injury':
      if (!Object.hasOwn(set.injuries, consequence.typeKey)) {
        problems.push(`${where}.typeKey: "${consequence.typeKey}" is not an Injury type`);
      }
      probability(consequence.chance);
      if (!(Number.isInteger(consequence.count) && consequence.count >= 1)) {
        problems.push(`${where}.count is ${consequence.count}; it is a whole number from 1`);
      }
      return;
    case 'death':
      probability(consequence.chance);
      return;
    case 'xp':
    case 'wealth':
      factor(consequence.factor);
      return;
    case 'morale':
    case 'regard':
    case 'fame':
      return;
  }
}

/**
 * Trait effects (M4-S5, pre-M0 review B2, DL-43): a Guildmaster Trait carries one effect of the
 * closed union and a Hero Trait none, since no rule reads a Hero Trait in the first build. A
 * `classStatBonus` names a Class and a Hero Stat and moves it by a whole number other than 0; a
 * `guildMoraleShift` moves the baseline by a number other than 0; an `upkeepFactor` is above 0.
 */
function checkTraitEffects(
  traits: ContentSet['traits'],
  classes: ReadonlySet<string>,
  heroStats: ReadonlySet<string>,
  problems: string[],
): void {
  for (const [key, trait] of Object.entries(traits)) {
    const where = `traits.${key}.effect`;
    const { effect } = trait;
    if (trait.owner === 'hero') {
      if (effect !== null) problems.push(`${where}: a Hero Trait has no effect in the first build; it is null`);
      continue;
    }
    if (effect === null) {
      problems.push(`${where}: a Guildmaster Trait carries one effect (classStatBonus, guildMoraleShift or upkeepFactor)`);
      continue;
    }
    switch (effect.kind) {
      case 'classStatBonus':
        if (!classes.has(effect.classKey)) problems.push(`${where}.classKey: "${effect.classKey}" is not a Class`);
        if (!heroStats.has(effect.statKey)) problems.push(`${where}.statKey: "${effect.statKey}" is not a Hero Stat`);
        if (!(Number.isInteger(effect.delta) && effect.delta !== 0)) {
          problems.push(`${where}.delta is ${effect.delta}; it is a whole number other than 0`);
        }
        break;
      case 'guildMoraleShift':
        if (!(Number.isFinite(effect.delta) && effect.delta !== 0)) {
          problems.push(`${where}.delta is ${effect.delta}; it is a number other than 0`);
        }
        break;
      case 'upkeepFactor':
        if (!(Number.isFinite(effect.factor) && effect.factor > 0)) {
          problems.push(`${where}.factor is ${effect.factor}; it is a number above 0`);
        }
        break;
    }
  }
}

/**
 * The Trait budget's content (M9-S2, DL-100 item 3, DL-102). A Guildmaster Trait's cost is a whole
 * number, a buff's positive and a penalty's negative, though the sign is the author's to choose.
 * Its exclusions name Guildmaster Traits other than itself, each once, and hold both ways, so that
 * the draw and the player's choice read the same pairs from either side. A Hero Trait is never
 * chosen or drawn against the budget: it costs 0 and excludes nothing.
 */
function checkTraitCosts(traits: ContentSet['traits'], problems: string[]): void {
  const guildmasterTraits = new Set(
    Object.entries(traits)
      .filter(([, trait]) => trait.owner === 'guildmaster')
      .map(([key]) => key),
  );
  for (const [key, trait] of Object.entries(traits)) {
    const where = `traits.${key}`;
    if (trait.owner === 'hero') {
      if (trait.cost !== 0) {
        problems.push(`${where}.cost is ${trait.cost}; a Hero Trait is never chosen against the budget, and costs 0`);
      }
      if (trait.excludes.length > 0) problems.push(`${where}.excludes: a Hero Trait excludes nothing`);
      continue;
    }
    if (!Number.isSafeInteger(trait.cost)) problems.push(`${where}.cost is ${trait.cost}; it is a whole number`);
    for (const other of trait.excludes) {
      if (other === key) {
        problems.push(`${where}.excludes: a Trait cannot exclude itself`);
      } else if (!guildmasterTraits.has(other)) {
        problems.push(`${where}.excludes: "${other}" is not a Guildmaster Trait`);
      } else if (!(traits[other]?.excludes.includes(key) ?? false)) {
        problems.push(`${where}.excludes: "${other}" does not exclude "${key}" in return`);
      }
    }
    for (const other of repeated(trait.excludes)) problems.push(`${where}.excludes: "${other}" is listed twice`);
  }
}

/**
 * The Synergies (M4-S3, DL-45): each requires one or more conditions on the Party, each a Query
 * (v1.1.4-S1, DL-148 item 20, `checkQuery`); adds a `flat` above 0, a `factor` above 1 or both, a
 * Synergy being a bonus and a factor in content a multiplier; and names, if any, one or more
 * Encounter kinds, none twice. The old form's Classes and Skills are held as they load
 * (`parseContent`).
 */
function checkSynergies(synergies: ContentSet['synergies'], keys: QueryKeys, problems: string[]): void {
  for (const [key, synergy] of Object.entries(synergies)) {
    const where = `synergies.${key}`;
    const { requires, bonus, kinds } = synergy;
    if (!Array.isArray(requires)) {
      problems.push(`${where}.requires is ${JSON.stringify(requires)}; expected a list of conditions on the Party`);
    } else {
      if (requires.length === 0) problems.push(`${where}.requires is empty: a Synergy is for a Party that meets something`);
      const gate = { ...keys, sexFilters: false };
      requires.forEach((condition, index) => checkQuery(`${where}.requires.${index}`, condition, 'condition', gate, problems));
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
      for (const kind of kinds) {
        if (!Object.hasOwn(encounterKinds, kind)) problems.push(`${where}.kinds: "${kind}" is not a kind of Encounter`);
      }
      for (const kind of repeated(kinds)) problems.push(`${where}.kinds: "${kind}" is listed twice`);
    }
  }
}

/**
 * The Item definitions (M5-S1, DL-48). Every Item: a price that is a whole number above 0, or `null`
 * for Loot only; tags in kebab-case, none twice. Gear: a slot of the three and no effect; Stat
 * modifiers, at least one, each on a Hero Stat, each a whole number other than 0. A consumable: not
 * unique, since it is expended from a stack; no slot and no modifiers; an effect within its kind's
 * bounds. The parser refuses the other kind's fields in a file; these catch them in a set built in
 * memory too.
 */
function checkItems(items: ContentSet['items'], heroStats: ReadonlySet<string>, problems: string[]): void {
  for (const [key, item] of Object.entries(items)) {
    const where = `items.${key}`;
    const { buyPrice } = item;
    if (buyPrice !== null && !(Number.isInteger(buyPrice) && buyPrice > 0)) {
      problems.push(`${where}.buyPrice is ${buyPrice}; it is a whole number above 0, or null for an Item found only as Loot`);
    }
    for (const tag of item.tags) {
      if (!kebabCase.test(tag)) problems.push(`${where}.tags: "${tag}" is not kebab-case`);
    }
    for (const tag of repeated(item.tags)) problems.push(`${where}.tags: "${tag}" is listed twice`);
    switch (item.kind) {
      case 'gear': {
        if (!Object.hasOwn(gearSlots, item.slot)) {
          problems.push(`${where}.slot: "${item.slot}" is not a gear slot (${Object.keys(gearSlots).join(', ')})`);
        }
        if (Reflect.has(item, 'effect')) problems.push(`${where}.effect: gear has no effect; only a consumable has one`);
        const modifiers = Object.entries(item.statModifiers);
        if (modifiers.length === 0) problems.push(`${where}.statModifiers is empty: gear modifies at least one Stat`);
        for (const [statKey, delta] of modifiers) {
          if (!heroStats.has(statKey)) problems.push(`${where}.statModifiers: "${statKey}" is not a Hero Stat`);
          if (!(Number.isInteger(delta) && delta !== 0)) {
            problems.push(`${where}.statModifiers.${statKey} is ${delta}; it is a whole number other than 0`);
          }
        }
        break;
      }
      case 'consumable':
        if (item.unique) problems.push(`${where}.unique is true; a consumable is common, expended from a stack`);
        if (Reflect.has(item, 'slot')) problems.push(`${where}.slot: a consumable has no slot; only gear has one`);
        if (Reflect.has(item, 'statModifiers')) problems.push(`${where}.statModifiers: a consumable modifies no Stat`);
        checkConsumableEffect(`${where}.effect`, item.effect, problems);
        break;
      default:
        problems.push(`${where}.kind is ${JSON.stringify((item as { kind: unknown }).kind)}; it is gear or consumable`);
    }
  }
}

/** A consumable's effect: Encounter kinds named, `flat` above 0, `days` a whole number from 1. */
function checkConsumableEffect(where: string, effect: ConsumableEffect, problems: string[]): void {
  const kinds = (listed: readonly string[]): void => {
    if (listed.length === 0) problems.push(`${where}.kinds is empty: the effect works on the Encounter kinds it names`);
    for (const kind of listed) {
      if (!Object.hasOwn(encounterKinds, kind)) problems.push(`${where}.kinds: "${kind}" is not a kind of Encounter`);
    }
    for (const kind of repeated(listed)) problems.push(`${where}.kinds: "${kind}" is listed twice`);
  };
  switch (effect.kind) {
    case 'reroll':
      kinds(effect.kinds);
      return;
    case 'bonus':
      if (!(Number.isFinite(effect.flat) && effect.flat > 0)) problems.push(`${where}.flat is ${effect.flat}; it is a number above 0`);
      kinds(effect.kinds);
      return;
    case 'heal':
      if (!(Number.isInteger(effect.days) && effect.days >= 1)) problems.push(`${where}.days is ${effect.days}; it is a whole number from 1`);
      return;
    default:
      problems.push(`${where}.kind is ${JSON.stringify((effect as { kind: unknown }).kind)}; it is reroll, bonus or heal`);
  }
}

/**
 * The Loot tables (M5-S5, DL-52): each at least one entry, each entry an Item content defines, listed
 * once in its table, with a weight above 0 and a quantity range of whole numbers from 1, not upside
 * down; a unique Item's quantity is 1, since a unique Item is an individual (data-model §3.3).
 */
function checkLootTables(set: ContentSet, problems: string[]): void {
  for (const [key, table] of Object.entries(set.lootTables)) {
    const where = `lootTables.${key}`;
    if (table.entries.length === 0) problems.push(`${where}.entries is empty: a table awards one of its entries`);
    for (const [index, entry] of table.entries.entries()) {
      const at = `${where}.entries.${index}`;
      const { definitionKey, weight, quantityMin, quantityMax } = entry;
      const item = Object.hasOwn(set.items, definitionKey) ? set.items[definitionKey] : undefined;
      if (item === undefined) problems.push(`${at}.definitionKey: "${definitionKey}" is not an Item`);
      if (!(Number.isFinite(weight) && weight > 0)) problems.push(`${at}.weight is ${weight}; it is a number above 0`);
      for (const [field, value] of [['quantityMin', quantityMin], ['quantityMax', quantityMax]] as const) {
        if (!(Number.isInteger(value) && value >= 1)) problems.push(`${at}.${field} is ${value}; it is a whole number from 1`);
      }
      if (quantityMin > quantityMax) problems.push(`${at}.quantityMin ${quantityMin} is greater than quantityMax ${quantityMax}`);
      if (item?.unique === true && (quantityMin !== 1 || quantityMax !== 1)) {
        problems.push(`${at}: ${definitionKey} is unique, so its quantityMin and quantityMax are 1`);
      }
    }
    const listed = table.entries.map((entry) => entry.definitionKey);
    for (const definitionKey of repeated(listed)) problems.push(`${where}.entries: "${definitionKey}" is listed twice`);
  }
}

// Queries (v1.1.4-S1, DL-148 items 4 to 6, ADR-0010). A Query is held to its type at every node, to
// the keys content defines, and to a size; and Sex is held to filters, so that it decides who takes
// part and never a value. Every problem names the Query's path, each argument by its place in its
// array, as `encounters.<key>.checks.0.score.1.2`.

/** The most nodes a Query may hold: each operator, each number and each `"party"` (v1.1.4-S1). */
export const queryNodesMax = 64;

/** How deep a Query may nest, an operator's node one below it (v1.1.4-S1). */
export const queryDepthMax = 12;

/** The five types of Query, and a condition on the Party, which a Synergy's requirement lists. */
type QueryType = 'set' | 'hero' | 'val' | 'pred' | 'num' | 'condition';

/** What an argument of an operator is: a Query of a type, a key, or a number or list of its own. */
type QueryArgument =
  | QueryType
  | 'stat'
  | 'skill'
  | 'class'
  | 'background'
  | 'trait'
  | 'sex'
  | 'heroes'
  | 'rating'
  | 'weights'
  | 'pairs';

/** An operator's arguments: those it always takes, then as many more of `rest` (one at least) or `optional` ones. */
interface Signature {
  args: readonly QueryArgument[];
  rest?: QueryArgument;
  optional?: readonly QueryArgument[];
}

const comparisons = ['>=', '>', '<', '<=', '='] as const;
const arithmetic = (type: 'val' | 'num'): Record<string, Signature> => ({
  '+': { args: [], rest: type },
  '-': { args: [type, type] },
  '*': { args: [], rest: type },
});

/** Every operator of each type (content-types.ts's `SetQuery` to `NumQuery`, and `PartyCondition`). */
const operators: Readonly<Record<QueryType, Readonly<Record<string, Signature>>>> = {
  set: {
    where: { args: ['set', 'pred'] },
    top: { args: ['set', 'heroes', 'val'] },
    bottom: { args: ['set', 'heroes', 'val'] },
  },
  hero: {
    best: { args: ['set', 'val'] },
    worst: { args: ['set', 'val'] },
  },
  val: {
    stat: { args: ['stat'] },
    skill: { args: ['skill'] },
    level: { args: [] },
    morale: { args: [] },
    age: { args: [] },
    weighted: { args: ['pairs'] },
    ...arithmetic('val'),
  },
  pred: {
    class: { args: [], rest: 'class' },
    background: { args: [], rest: 'background' },
    sex: { args: ['sex'] },
    'has-skill': { args: ['skill'], optional: ['rating'] },
    'has-trait': { args: ['trait'] },
    hurt: { args: [] },
    ...Object.fromEntries(comparisons.map((comparison): [string, Signature] => [comparison, { args: ['val', 'val'] }])),
    and: { args: [], rest: 'pred' },
    or: { args: [], rest: 'pred' },
    not: { args: ['pred'] },
  },
  num: {
    ...Object.fromEntries(['sum', 'avg', 'max', 'min'].map((it): [string, Signature] => [it, { args: ['set', 'val'] }])),
    count: { args: ['set'] },
    ranked: { args: ['set', 'val', 'weights'] },
    of: { args: ['hero', 'val'] },
    ...arithmetic('num'),
    least: { args: [], rest: 'num' },
    greatest: { args: [], rest: 'num' },
  },
  condition: Object.fromEntries(comparisons.map((comparison): [string, Signature] => [comparison, { args: ['num', 'num'] }])),
};

const typeNames: Readonly<Record<QueryType, string>> = {
  set: 'a Set',
  hero: 'a Hero',
  val: 'a Val',
  pred: 'a Pred',
  num: 'a Num',
  condition: 'a condition on the Party',
};

/**
 * The keys a Query may name: content's Hero Stats, Skills, Classes, Hero Backgrounds and Hero Traits;
 * and whether Sex may filter it at all. A Check's score may filter by Sex; a Synergy's requirement may
 * not, since it is a gate, so that any reading of Sex in it would be a value (DL-151's verification).
 */
interface QueryKeys {
  heroStats: ReadonlySet<string>;
  skills: ReadonlySet<string>;
  classes: ReadonlySet<string>;
  heroBackgrounds: ReadonlySet<string>;
  heroTraits: ReadonlySet<string>;
  sexFilters: boolean;
}

/** What a Query's node comes to, for the checks above it. */
interface QueryShape {
  nodes: number;
  depth: number;
  /** A Set, or the Hero of one, filtered by Sex somewhere within. */
  bySex: boolean;
  /**
   * A Val that reads something of the Hero: not a number alone, nor a read of the Hero only times a
   * literal 0, nor a `weighted` of no weight but 0.
   */
  readsHero: boolean;
}

const leaf: QueryShape = { nodes: 1, depth: 1, bySex: false, readsHero: false };

/** The keys `set` defines that a Query may name. */
function queryKeys(set: ContentSet): QueryKeys {
  const owned = (rows: Readonly<Record<string, { owner: string }>>): Set<string> =>
    new Set(Object.entries(rows).flatMap(([key, row]) => (row.owner === 'hero' ? [key] : [])));
  return {
    heroStats: owned(set.stats),
    skills: new Set(Object.keys(set.skills)),
    classes: new Set(Object.keys(set.classes)),
    heroBackgrounds: owned(set.backgrounds),
    heroTraits: owned(set.traits),
    sexFilters: true,
  };
}

/**
 * `query`, at `where`, as a Query of `type`: each node an operator of that type with its arguments,
 * or a number where a Val or a Num stands, or `"party"` where a Set does; each key one content
 * defines; at most `queryNodesMax` nodes and `queryDepthMax` deep; `["sex", …]` only as a filter's
 * Pred, and only where `keys.sexFilters` allows it; and no Set filtered by Sex counted, by `count` or
 * by a value that reads nothing of a Hero.
 */
function checkQuery(where: string, query: unknown, type: QueryType, keys: QueryKeys, problems: string[]): void {
  const { nodes, depth } = queryNode(where, query, type, keys, problems);
  if (nodes > queryNodesMax) problems.push(`${where} has ${nodes} nodes; a Query has at most ${queryNodesMax}`);
  if (depth > queryDepthMax) problems.push(`${where} is ${depth} deep; a Query is at most ${queryDepthMax} deep`);
}

/** One node of a Query, and every node below it. */
function queryNode(where: string, query: unknown, type: QueryType, keys: QueryKeys, problems: string[]): QueryShape {
  if (typeof query === 'number') {
    if (type !== 'val' && type !== 'num') problems.push(`${where} is ${query}; a number stands for a Val or a Num, not ${typeNames[type]}`);
    else if (!Number.isFinite(query)) problems.push(`${where} is ${query}; a number in a Query is finite`);
    return leaf;
  }
  if (query === 'party') {
    if (type !== 'set') problems.push(`${where} is "party", a Set; ${typeNames[type]} stands here`);
    return leaf;
  }
  const [operator, ...args] = Array.isArray(query) ? (query as unknown[]) : [];
  if (typeof operator !== 'string') {
    problems.push(`${where} is ${JSON.stringify(query)}; expected ${typeNames[type]}, a list with its operator first`);
    return leaf;
  }
  const signature = Object.hasOwn(operators[type], operator) ? operators[type][operator] : undefined;
  if (signature === undefined) {
    problems.push(`${where}: ${misplaced(operator, type)}`);
    return leaf;
  }
  const fixed = signature.args.length;
  const most = signature.rest === undefined ? fixed + (signature.optional?.length ?? 0) : Infinity;
  const least = signature.rest === undefined ? fixed : fixed + 1;
  if (args.length < least || args.length > most) {
    problems.push(`${where}: "${operator}" takes ${arity(least, most)}; it has ${args.length}`);
    return leaf;
  }
  const shapes = args.map((arg, index) => {
    const kind = signature.args[index] ?? signature.optional?.[index - fixed] ?? signature.rest ?? 'num';
    return queryArgument(`${where}.${index + 1}`, arg, kind, operator, keys, problems);
  });
  const below = shapes.filter((shape): shape is QueryShape => shape !== null);
  const shape: QueryShape = {
    nodes: 1 + below.reduce((total, it) => total + it.nodes, 0),
    depth: 1 + Math.max(0, ...below.map((it) => it.depth)),
    bySex: below.some((it) => it.bySex),
    readsHero: type === 'val' && readsHero(operator, args, below),
  };
  if (operator === 'sex') {
    if (!keys.sexFilters) {
      problems.push(`${where}: ["sex", …] stands in no Synergy's requirement: a requirement is a condition on the Party, and Sex decides only who takes part in a Check (DL-148 item 6)`);
    }
    return { ...shape, bySex: true };
  }
  if (type === 'set' || type === 'hero' || type === 'pred') return shape;
  // A Num of a Set (or of its Hero) filtered by Sex: counted, if it reads nothing of a Hero.
  const [of, value] = below;
  if (type === 'num' && of?.bySex === true && (operator === 'count' || value?.readsHero === false)) {
    problems.push(`${where}: a Set filtered by Sex is counted; Sex decides who takes part, never a number (DL-148 item 6)`);
  }
  return { ...shape, bySex: false };
}

/**
 * Whether a Val node of `operator` reads something of the Hero: an operand of `+` or `-` that does; a
 * product with one that does and no literal 0 among its factors; a `weighted` with a weight other than
 * 0; and every other operator, which reads the Hero itself.
 */
function readsHero(operator: string, args: readonly unknown[], below: readonly QueryShape[]): boolean {
  switch (operator) {
    case '+':
    case '-':
      return below.some((it) => it.readsHero);
    case '*':
      return !args.includes(0) && below.some((it) => it.readsHero);
    case 'weighted': {
      const [pairs] = args;
      return Array.isArray(pairs) && pairs.some((pair: unknown) => !Array.isArray(pair) || pair[1] !== 0);
    }
    default:
      return true;
  }
}

/** One argument of `operator`: a Query of its type, with its shape, or a key or number checked here, with none. */
function queryArgument(
  where: string,
  arg: unknown,
  kind: QueryArgument,
  operator: string,
  keys: QueryKeys,
  problems: string[],
): QueryShape | null {
  const key = (known: ReadonlySet<string>, what: string): null => {
    if (typeof arg !== 'string' || !known.has(arg)) problems.push(`${where}: ${JSON.stringify(arg)} is not ${what}`);
    return null;
  };
  switch (kind) {
    case 'stat':
      return key(keys.heroStats, 'a Hero Stat');
    case 'skill':
      return key(keys.skills, 'a Skill');
    case 'class':
      return key(keys.classes, 'a Class');
    case 'background':
      return key(keys.heroBackgrounds, 'a Hero Background');
    case 'trait':
      return key(keys.heroTraits, 'a Hero Trait');
    case 'sex':
      return key(new Set<Sex>(['female', 'male']), 'a sex: female or male');
    case 'heroes':
      if (!(Number.isInteger(arg) && (arg as number) >= 1)) {
        problems.push(`${where} is ${JSON.stringify(arg)}; ${operator}'s n is a whole number from 1`);
      }
      return null;
    case 'rating':
      if (!(Number.isInteger(arg) && (arg as number) >= 1)) {
        problems.push(`${where} is ${JSON.stringify(arg)}; has-skill's least rating is a whole number from 1`);
      }
      return null;
    case 'weights':
      if (!Array.isArray(arg) || arg.length === 0) {
        problems.push(`${where} is ${JSON.stringify(arg)}; ranked's weights are a list of one or more`);
        return null;
      }
      arg.forEach((weight: unknown, index) => {
        if (!(typeof weight === 'number' && Number.isFinite(weight) && weight >= 0)) {
          problems.push(`${where}.${index} is ${String(weight)}; a weight is a finite number of 0 or more`);
        }
      });
      return null;
    case 'pairs':
      if (!Array.isArray(arg) || arg.length === 0) {
        problems.push(`${where} is ${JSON.stringify(arg)}; weighted's Stats are a list of one or more [Stat, weight] pairs`);
        return null;
      }
      arg.forEach((pair: unknown, index) => {
        const [statKey, weight, ...more] = Array.isArray(pair) ? (pair as unknown[]) : [];
        if (!Array.isArray(pair) || more.length > 0 || !(typeof weight === 'number' && Number.isFinite(weight))) {
          problems.push(`${where}.${index} is ${JSON.stringify(pair)}; expected a [Stat, weight] pair, the weight a finite number`);
        } else if (typeof statKey !== 'string' || !keys.heroStats.has(statKey)) {
          problems.push(`${where}.${index}.0: ${JSON.stringify(statKey)} is not a Hero Stat`);
        }
      });
      return null;
    default:
      return queryNode(where, arg, kind, keys, problems);
  }
}

/** Why `operator` cannot stand where a Query of `type` is expected. */
function misplaced(operator: string, type: QueryType): string {
  if (operator === 'sex') return '["sex", …] stands only as the Pred of a where filter: Sex decides who takes part, never a value (DL-148 item 6)';
  const types = (Object.keys(operators) as QueryType[]).filter((it) => Object.hasOwn(operators[it], operator));
  if (types.length === 0) return `"${operator}" is not an operator of a Query`;
  return `"${operator}" makes ${types.map((it) => typeNames[it]).join(' or ')}, where ${typeNames[type]} is expected`;
}

/** How many arguments an operator takes, in words. */
function arity(least: number, most: number): string {
  const count = (n: number): string => (n === 0 ? 'no arguments' : n === 1 ? '1 argument' : `${n} arguments`);
  if (most === Infinity) return `${count(least)} or more`;
  return least === most ? count(least) : `${least} or ${most} arguments`;
}

/** Every key must name a row of the table it refers to, and appear once. */
export function checkReferences(
  where: string,
  keys: readonly string[],
  known: ReadonlySet<string>,
  what: string,
  problems: string[],
): void {
  for (const key of keys) {
    if (!known.has(key)) problems.push(`${where}: "${key}" is not ${what}`);
  }
  for (const key of repeated(keys)) problems.push(`${where}: "${key}" is listed twice`);
}

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

/** `min` and `max` are a range: `floor <= min <= max`. */
function checkRange(where: string, field: string, min: number, max: number, floor: number, problems: string[]): void {
  if (min < floor) problems.push(`${where}.${field}Min is ${min}; it is at least ${floor}`);
  if (min > max) problems.push(`${where}.${field}Min ${min} is greater than ${field}Max ${max}`);
}

/**
 * A Quest template's demands: at least one, each a Hero Stat once with a weight above 0, the
 * weights summing to 1 within the tolerance (M2-S3's acceptance).
 */
export function checkDemands(
  where: string,
  demands: readonly (readonly [string, number])[],
  heroStats: ReadonlySet<string>,
  problems: string[],
): void {
  if (demands.length === 0) problems.push(`${where} is empty: a Quest assesses at least one Stat`);
  checkReferences(
    where,
    demands.map(([key]) => key),
    heroStats,
    'a Hero Stat',
    problems,
  );
  let sum = 0;
  for (const [key, weight] of demands) {
    if (Number.isFinite(weight)) sum += weight;
    if (!(Number.isFinite(weight) && weight > 0)) {
      problems.push(`${where}: "${key}" has weight ${weight}; a demand's weight is above 0`);
    }
  }
  if (demands.length > 0 && Math.abs(sum - 1) > demandSumTolerance) {
    problems.push(`${where}: weights sum to ${Number(sum.toFixed(4))}, not 1`);
  }
}

/** The values that appear more than once, each once, in order of their second appearance. */
function repeated(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) twice.add(value);
    seen.add(value);
  }
  return [...twice];
}
