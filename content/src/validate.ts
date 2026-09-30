// The content schema's rules across rows: what a single row's shape cannot show (M1-S4).
// `parseContent` runs this on every set it builds; a set assembled in memory, by a test or a
// later module, runs it directly.

import type { Consequence, ConsumableEffect, ContentSet, Descriptions, EncounterKind, FacilityKey, SlotKey } from '@heroesim/engine';

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
  checkEncounters(set, heroStats, skills, problems);
  checkTraitEffects(set.traits, classes, heroStats, problems);
  checkTraitCosts(set.traits, problems);
  checkSynergies(set.synergies, classes, skills, problems);
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

/** The most characters a keyword's word holds (DL-127 item 4). */
export const keywordWordMaxLength = 24;

/**
 * How many of a Guildmaster's Traits the Biography gives a sentence, the first in their order: the
 * engine's `biographyTraitSentences` (v1.1.2-S5), repeated here as the bounds are.
 */
export const biographyTraitSentences = 2;

/** A text's length as the engine counts it: Unicode code points, so an accented letter counts once. */
function lengthOf(text: string): number {
  return [...text].length;
}

/**
 * The Appearances mapped to pictures (v1.1.2-S4 and S5; DL-126 item 2, DL-127 items 3 and 4):
 * - each keyword's key is lower case and hyphens, and its word is written, at most 24 characters;
 * - each row's key names a picture `portraits.json` lists, of any role, since the file will serve
 *   Heroes' and Patrons' pictures too;
 * - a row's keywords are defined, each once, and a `facialHair` keyword is on a male picture's only;
 * - its narrative is written, at most the Appearance's 280 characters.
 * A keyword no picture uses is allowed, and so is a picture with no row.
 */
function checkPortraitAppearances(set: Pick<ContentSet, 'portraits' | 'portraitAppearances'>, problems: string[]): void {
  const { keywords, portraits } = set.portraitAppearances;
  for (const [key, { word }] of Object.entries(keywords)) {
    const where = `portraitAppearances.keywords.${key}`;
    if (!lowerAndHyphens.test(key)) problems.push(`portraitAppearances.keywords: "${key}" is not lower case and hyphens`);
    if (word.trim() === '' || word !== word.trim()) problems.push(`${where}.word is ${JSON.stringify(word)}; it is a word, trimmed`);
    if (lengthOf(word) > keywordWordMaxLength) {
      problems.push(`${where}.word is ${lengthOf(word)} characters; it holds at most ${keywordWordMaxLength}`);
    }
  }
  const pictures = new Set(Object.values(set.portraits).flatMap((bySex) => Object.values(bySex).flat()));
  const male = new Set(Object.values(set.portraits).flatMap((bySex) => bySex.male));
  for (const [key, row] of Object.entries(portraits)) {
    const where = `portraitAppearances.portraits.${key}`;
    if (!pictures.has(key)) problems.push(`portraitAppearances.portraits: "${key}" names no picture in portraits.json`);
    for (const keyword of row.keywords) {
      const defined = Object.hasOwn(keywords, keyword) ? keywords[keyword] : undefined;
      if (defined === undefined) problems.push(`${where}.keywords: "${keyword}" is not a keyword defined under keywords`);
      else if (defined.slot === 'facialHair' && pictures.has(key) && !male.has(key)) {
        problems.push(`${where}.keywords: "${keyword}" is facialHair, which only a male picture's may use`);
      }
    }
    for (const keyword of repeated(row.keywords)) problems.push(`${where}.keywords: "${keyword}" is listed twice`);
    if (row.narrative.trim() === '') problems.push(`${where}.narrative is empty`);
    const length = lengthOf(row.narrative.trim());
    if (length > descriptionBounds.appearance) {
      problems.push(`${where}.narrative is ${length} characters; an Appearance holds at most ${descriptionBounds.appearance}`);
    }
  }
}

/** A slot in a Biography's sentence: `{he}`, `{birthplace}`. */
const slotPattern = /\{([^{}]*)\}/g;

/** The slot every Biography sentence may use beside the pronouns: the Guildmaster's Birthplace. */
const birthplaceSlot = 'birthplace';

/** The Appearance's slots, in the order a drawn Appearance is written, `mark` and `bearing` one of the two. */
const appearanceSlots = ['build', 'face', 'hair', 'facialHair', 'eyes', 'mark', 'bearing'] as const;

/** The Biography's parts that are by age band. */
const bandedParts = ['origins', 'careers', 'closings'] as const;

/** The longest text each descriptive Attribute can be written as from a content set's descriptions. */
export interface LongestDescriptions {
  birthplace: number;
  appearance: number;
  biography: number;
}

/**
 * The longest Birthplace, Appearance and Biography the engine can write from `set.descriptions`,
 * in characters (v1.1.2-S5, DL-125 item 6), by the way the engine writes them
 * (`engine/src/descriptions.ts`):
 * - an Appearance is one phrase of each slot of the sex's age band, `facialHair` a male's only, and
 *   `mark` or `bearing`, in that order, joined by spaces;
 * - a Biography is an origin, a career, the Guild Background's sentence, one for each of the first
 *   `biographyTraitSentences` Traits, and a closing, those there are joined by spaces, each pronoun
 *   slot the sex's word and `{birthplace}` the Birthplace, which may be as long as its bound.
 * The longest of every combination, not of samples: each part at its longest, for each sex and band.
 * A picture's narrative is not among them; it is checked alone.
 */
export function longestDescriptions(set: Pick<ContentSet, 'descriptions'>): LongestDescriptions {
  const { descriptions } = set;
  const most = (values: readonly number[]): number => values.reduce((max, value) => Math.max(max, value), 0);
  const joined = (lengths: readonly number[]): number => {
    const present = lengths.filter((length) => length > 0);
    return present.reduce((sum, length) => sum + length, 0) + Math.max(0, present.length - 1);
  };
  const birthplace = most(descriptions.birthplaces.map((place) => lengthOf(place.trim())));
  let appearance = 0;
  let biography = 0;
  for (const sex of Object.keys(descriptions.appearance) as (keyof Descriptions['appearance'])[]) {
    const words = descriptions.pronouns[sex];
    const sentence = (text: string): number =>
      lengthOf(
        text.replace(slotPattern, (slot, name: string) =>
          name === birthplaceSlot ? 'x'.repeat(descriptionBounds.birthplace) : (words[name] ?? slot),
        ),
      );
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
    for (const band of descriptions.ageBands) {
      biography = Math.max(
        biography,
        joined([longest(parts.origins[band.key]), longest(parts.careers[band.key]), background, ...traits, longest(parts.closings[band.key])]),
      );
    }
  }
  return { birthplace, appearance, biography };
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
 * - and the longest Birthplace, Appearance and Biography they can make (`longestDescriptions`) are
 *   within 60, 280 and 1,000 characters.
 */
function checkDescriptions(set: Pick<ContentSet, 'descriptions' | 'backgrounds' | 'traits'>, problems: string[]): void {
  const { ageBands, pronouns, birthplaces, appearance, biography } = set.descriptions;

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
  const slots = new Set([birthplaceSlot, ...sexes.flatMap((sex) => Object.keys(pronouns[sex]))]);

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
    for (const key of Object.keys(byBand)) if (!bands.includes(key)) problems.push(`${where}: "${key}" is not an age band`);
  };
  /** Refuses an empty list, and each text that is no sentence: a capital first and a full stop last. */
  const sentences = (texts: readonly string[], where: string, slotted: boolean): void => {
    if (texts.length === 0) problems.push(`${where} is empty`);
    texts.forEach((text, index) => {
      const at = `${where}.${index}`;
      const filled = text.replace(slotPattern, (slot, name: string) => {
        if (!slotted) return slot;
        if (!slots.has(name)) problems.push(`${at}: {${name}} is not a slot; the slots are ${[...slots].map((it) => `{${it}}`).join(', ')}`);
        return name === birthplaceSlot ? 'Place' : (pronouns.female[name] ?? name);
      });
      if (/[{}]/.test(filled)) problems.push(`${at} has a brace that is no slot${slotted ? '' : ': an Appearance has no slot'}`);
      if (slotted && new RegExp(`\\{${birthplaceSlot}\\}(?![,.])`).test(text)) {
        problems.push(`${at}: {${birthplaceSlot}} is followed by a comma or a full stop, since a Birthplace may hold a comma`);
      }
      if (!written(filled) || !filled.endsWith('.')) problems.push(`${at} is no sentence: trimmed, a capital first and a full stop last`);
    });
  };

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
    for (const [band, texts] of Object.entries(biography[part])) sentences(texts, `descriptions.biography.${part}.${band}`, true);
  }
  for (const [key, texts] of Object.entries(biography.backgrounds)) {
    if (set.backgrounds[key]?.owner !== 'guild') problems.push(`descriptions.biography.backgrounds: "${key}" is not a Guild Background`);
    sentences(texts, `descriptions.biography.backgrounds.${key}`, true);
  }
  for (const [key, texts] of Object.entries(biography.traits)) {
    if (set.traits[key]?.owner !== 'guildmaster') problems.push(`descriptions.biography.traits: "${key}" is not a Guildmaster Trait`);
    sentences(texts, `descriptions.biography.traits.${key}`, true);
  }
  sentences(biography.successors, 'descriptions.biography.successors', true);

  const longest = longestDescriptions(set);
  const names = { appearance: 'Appearance', biography: 'Biography' } as const;
  for (const attribute of ['appearance', 'biography'] as const) {
    if (longest[attribute] > descriptionBounds[attribute]) {
      problems.push(
        `descriptions.${attribute}: the longest ${names[attribute]} it can write is ${longest[attribute]} characters; ` +
          `it holds at most ${descriptionBounds[attribute]}`,
      );
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

/**
 * The Encounters (M4-S1): demands on Hero Stats weighted as a Quest template's are, Skills that
 * exist, a difficulty factor above 0, and consequences each within its kind's bounds, an Injury
 * naming a type content defines. The epic's first box: an unknown Stat, Skill or Injury type is
 * refused.
 */
function checkEncounters(
  set: ContentSet,
  heroStats: ReadonlySet<string>,
  skills: ReadonlySet<string>,
  problems: string[],
): void {
  for (const [key, encounter] of Object.entries(set.encounters)) {
    const where = `encounters.${key}`;
    checkDemands(`${where}.demands`, encounter.demands, heroStats, problems);
    checkReferences(`${where}.skillKeys`, encounter.skillKeys, skills, 'a Skill', problems);
    if (!(Number.isFinite(encounter.difficultyFactor) && encounter.difficultyFactor > 0)) {
      problems.push(`${where}.difficultyFactor is ${encounter.difficultyFactor}; it is a number above 0`);
    }
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
 * The Synergies (M4-S3, DL-45): each requires at least one Class or Skill, every Class content
 * defines with a count that is a whole number from 1, every Skill content defines and none twice;
 * adds a `flat` above 0, a `factor` above 1 or both, a Synergy being a bonus and a factor in content
 * a multiplier; and names, if any, one or more Encounter kinds, none twice.
 */
function checkSynergies(
  synergies: ContentSet['synergies'],
  classes: ReadonlySet<string>,
  skills: ReadonlySet<string>,
  problems: string[],
): void {
  for (const [key, synergy] of Object.entries(synergies)) {
    const where = `synergies.${key}`;
    const { requires, bonus, kinds } = synergy;
    const counts = Object.entries(requires.classes ?? {});
    if (counts.length === 0 && (requires.skills ?? []).length === 0) {
      problems.push(`${where}.requires names no Class and no Skill: a Synergy is for a combination of them`);
    }
    for (const [classKey, count] of counts) {
      if (!classes.has(classKey)) problems.push(`${where}.requires.classes: "${classKey}" is not a Class`);
      if (!(Number.isInteger(count) && count >= 1)) {
        problems.push(`${where}.requires.classes.${classKey} is ${count}; a count is a whole number from 1`);
      }
    }
    checkReferences(`${where}.requires.skills`, requires.skills ?? [], skills, 'a Skill', problems);
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

/** Every key must name a row of the table it refers to, and appear once. */
function checkReferences(
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
function checkDemands(
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
