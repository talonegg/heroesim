// Text in, content out (M1-S4). Pure: no file system, so a browser bundle can use it (M7-S1).
// Each file is an object keyed by content key; a row does not repeat its key, which it takes
// from the key it is stored under. Every file is checked for shape — each field present, of its
// type, and no field the schema does not know — then the whole set is validated.

import type {
  AgeBand,
  AppearancePhrases,
  Background,
  BackgroundOwner,
  Calling,
  Class,
  ConsumableDefinition,
  ConsumableEffect,
  ConsumableEffectKind,
  ContentSet,
  Consequence,
  ConsequenceKind,
  Descriptions,
  Disposition,
  Encounter,
  EncounterCheck,
  EncounterKind,
  FacilityKey,
  Feature,
  GearDefinition,
  GuildmasterTrait,
  GuildmasterTraitEffect,
  GuildmasterTraitEffectKind,
  HarmReads,
  HeroBiographySentences,
  HeroTrait,
  HeroTraitEffect,
  HeroTraitEffectKind,
  Improvement,
  InjuryType,
  ItemDefinition,
  ItemKind,
  LootEntry,
  LootTable,
  Names,
  NumQuery,
  PartyCondition,
  PassFormula,
  PatronName,
  PortraitAppearance,
  PortraitAppearances,
  PortraitRole,
  Portraits,
  QuestTemplate,
  QuestTemplateRequires,
  SetQuery,
  Skill,
  Sex,
  SlotKey,
  Sphere,
  Stat,
  StatArea,
  StatOwner,
  Synergy,
  SynergyBonus,
  SynergyRequires,
} from '@heroesim/engine';
import { encounterKinds as encounterKindList, facilityKeys, gearSlotKeys, sexes } from '@heroesim/engine';
import { findDuplicateKeys } from './duplicate-keys.js';
import { ContentError, validateContent } from './validate.js';

/** The content set this package holds, as `meta.content` records it. */
export const contentSetId = 'core';

/** The files of a content set, named as they sit in the content directory; the last holds its version (v1.1.6-S4). */
export const contentFiles = [
  'stats.json',
  'classes.json',
  'skills.json',
  'guildmaster-traits.json',
  'hero-traits.json',
  'backgrounds.json',
  'spheres.json',
  'names.json',
  'quest-templates.json',
  'dispositions.json',
  'injuries.json',
  'improvements.json',
  'encounters.json',
  'synergies.json',
  'items.json',
  'loot-tables.json',
  'portraits.json',
  'portrait-appearances.json',
  'descriptions.json',
  'version.json',
] as const;

export type ContentFileName = (typeof contentFiles)[number];

/** The engine's list of a union's members as the choices of a field (DL-186 item 6: content repeats none). */
function choicesOf<Choice extends string>(list: readonly Choice[]): Record<Choice, true> {
  return Object.fromEntries(list.map((choice) => [choice, true])) as Record<Choice, true>;
}

// The choices for each enumerated field. Keyed by the engine's union, so the compiler refuses
// a list that misses or invents a member; where the engine lists the union's members, its list.
const statAreas: Record<StatArea, true> = { physical: true, mental: true, magical: true, social: true };
const statOwners: Record<StatOwner, true> = { hero: true, guildmaster: true };
const guildmasterTraitEffectKinds: Record<GuildmasterTraitEffectKind, true> = { classStatBonus: true, guildMoraleShift: true, upkeepFactor: true };
const heroTraitEffectKinds: Record<HeroTraitEffectKind, true> = { statModifiers: true, encounterBonus: true };
const backgroundOwners: Record<BackgroundOwner, true> = { hero: true, guild: true };
const facilities: Record<FacilityKey, true> = choicesOf(facilityKeys);
const encounterKinds: Record<EncounterKind, true> = choicesOf(encounterKindList);
const consequenceKinds: Record<ConsequenceKind, true> = {
  injury: true,
  death: true,
  morale: true,
  regard: true,
  xp: true,
  wealth: true,
  fame: true,
  trait: true,
};
const regardBetween: Record<'party', true> = { party: true };
const itemKinds: Record<ItemKind, true> = { gear: true, consumable: true };
const gearSlots: Record<SlotKey, true> = choicesOf(gearSlotKeys);
const consumableEffectKinds: Record<ConsumableEffectKind, true> = { reroll: true, bonus: true, heal: true };
const sexChoices: Record<Sex, true> = choicesOf(sexes);
const portraitRoles: Record<PortraitRole, true> = { guildmaster: true, hero: true, patron: true };

/**
 * Parse and validate a content set from the text of its files.
 *
 * @param files each file's text by its name in the content directory (`stats.json`); files
 *   that are not content files are ignored, so a whole directory's JSON may be passed
 * @throws ContentError naming the file and key of every problem found
 */
export function parseContent(files: Readonly<Record<string, string>>): ContentSet {
  return validateContent(readContent(files));
}

/**
 * Parse a content set from the text of its files, checking each row's shape but not the rules
 * across rows (`validateContent`). Only for text already validated: the page's build runs
 * `parseContent` on the same files and fails on any problem, so the script need not carry the
 * checks (v1.1.4-S2's verification, DL-152). Everything else calls `parseContent`.
 *
 * @throws ContentError naming the file and key of every problem of shape found
 */
export function readContent(files: Readonly<Record<string, string>>): ContentSet {
  const problems: string[] = [];
  const json = (file: ContentFileName): unknown => readJson(file, files[file], problems);

  const stats = table<Stat>('stats.json', json('stats.json'), problems, 'a Stat', (row) => ({
    name: row.string('name'),
    area: row.oneOf('area', statAreas),
    min: row.integer('min'),
    max: row.integer('max'),
    default: row.integer('default'),
    owner: row.oneOf('owner', statOwners),
  }));
  const classes = table<Class>('classes.json', json('classes.json'), problems, 'a Class', (row) => ({
    name: row.string('name'),
    leadingStats: row.strings('leadingStats'),
    gatedSkills: row.strings('gatedSkills'),
    growth: row.numbers('growth'),
  }));
  const skills = table<Skill>('skills.json', json('skills.json'), problems, 'a Skill', (row) => ({
    name: row.string('name'),
  }));
  const set: ContentSet = {
    id: contentSetId,
    version: contentVersion(json('version.json'), problems),
    stats,
    classes,
    skills,
    // The two lists of Traits (v1.1.4-S7, DL-150 item 1); that a key is in one list only is `validateContent`'s rule.
    guildmasterTraits: table<GuildmasterTrait>('guildmaster-traits.json', json('guildmaster-traits.json'), problems, 'a Guildmaster Trait', (row) => ({
      name: row.string('name'),
      cost: row.integer('cost'),
      excludes: row.strings('excludes'),
      effects: row.children('effects').map(guildmasterTraitEffect),
    })),
    heroTraits: table<HeroTrait>('hero-traits.json', json('hero-traits.json'), problems, 'a Hero Trait', (row) => ({
      name: row.string('name'),
      excludes: row.strings('excludes'),
      effects: row.children('effects').map(heroTraitEffect),
    })),
    backgrounds: table<Background>(
      'backgrounds.json',
      json('backgrounds.json'),
      problems,
      'a Background',
      (row) => {
        const shape = { name: row.string('name'), owner: row.oneOf('owner', backgroundOwners) };
        // A Hero Background's Station (v1.1.3-S1, DL-135 item 5): which owner has one is `validateContent`'s rule.
        const station = row.optional('station', (field) => row.string(field));
        return station === undefined ? shape : { ...shape, station };
      },
    ),
    spheres: table<Sphere>('spheres.json', json('spheres.json'), problems, 'a Sphere', (row) => ({
      name: row.string('name'),
    })),
    names: names(json('names.json'), problems),
    questTemplates: table<QuestTemplate>(
      'quest-templates.json',
      json('quest-templates.json'),
      problems,
      'a Quest template',
      (row) => {
        // v1.1.4-S8: its Finale, none when absent.
        const finale = row.optionalString('finale');
        return {
          name: row.string('name'),
          sphereKeys: row.strings('sphereKeys'),
          tags: row.strings('tags'),
          difficultyMin: row.integer('difficultyMin'),
          difficultyMax: row.integer('difficultyMax'),
          durationDaysMin: row.integer('durationDaysMin'),
          durationDaysMax: row.integer('durationDaysMax'),
          rewardPerDifficulty: row.number('rewardPerDifficulty'),
          fameEffect: row.integer('fameEffect'),
          partySizeMin: row.integer('partySizeMin'),
          partySizeMax: row.integer('partySizeMax'),
          demands: row.weightedKeys('demands'),
          skillKeys: row.strings('skillKeys'),
          requires: requires(row.child('requires')),
          lootTableKey: row.stringOrNull('lootTableKey'),
          encounterKinds: row.oneOfEach('encounterKinds', encounterKinds),
          encountersMin: row.integer('encountersMin'),
          encountersMax: row.integer('encountersMax'),
          ...(finale === undefined ? {} : { finale }),
        };
      },
    ),
    dispositions: table<Disposition>('dispositions.json', json('dispositions.json'), problems, 'a Disposition', (row) => ({
      name: row.string('name'),
      questRiskAppetite: row.number('questRiskAppetite'),
      recruitThreshold: row.number('recruitThreshold'),
      buildThreshold: row.number('buildThreshold'),
      gearThreshold: row.number('gearThreshold'),
      transferAppetite: row.number('transferAppetite'),
      partyMargin: row.number('partyMargin'),
    })),
    injuries: table<InjuryType>('injuries.json', json('injuries.json'), problems, 'an Injury type', (row) => ({
      name: row.string('name'),
      healDaysMin: row.integer('healDaysMin'),
      healDaysMax: row.integer('healDaysMax'),
      leavesTrait: row.stringOrNull('leavesTrait'),
    })),
    improvements: table<Improvement>(
      'improvements.json',
      json('improvements.json'),
      problems,
      'an Improvement',
      (row) => ({
        name: row.string('name'),
        facility: row.oneOf('facility', facilities),
        grade: row.integer('grade'),
        cost: row.integer('cost'),
      }),
    ),
    encounters: table<Encounter>('encounters.json', json('encounters.json'), problems, 'an Encounter', (row) => {
      const name = row.string('name');
      // v1.1.4-S8: its tags, none when absent.
      const tags = row.optional('tags', (field) => row.strings(field));
      const shape = { name, kind: row.oneOf('kind', encounterKinds), ...(tags === undefined ? {} : { tags }) };
      // v1.1.4-S2: its `checks` and `pass`; the old form is no longer read (DL-192).
      const checks = row.children('checks').map(encounterCheck);
      const pass = row.optional('pass', (field) => row.value(field) as PassFormula);
      return { ...shape, checks, ...(pass === undefined ? {} : { pass }), consequences: outcomes(row.child('consequences')) };
    }),
    synergies: table<Synergy>('synergies.json', json('synergies.json'), problems, 'a Synergy', (row) => {
      const shape = {
        name: row.string('name'),
        requires: synergyRequires(row),
        bonus: synergyBonus(row.child('bonus')),
      };
      const kinds = row.optional('kinds', (field) => row.oneOfEach(field, encounterKinds));
      return kinds === undefined ? shape : { ...shape, kinds };
    }),
    items: table<ItemDefinition>('items.json', json('items.json'), problems, 'an Item', itemDefinition),
    lootTables: table<LootTable>('loot-tables.json', json('loot-tables.json'), problems, 'a Loot table', (row) => ({
      entries: row.children('entries').map(lootEntry),
    })),
    portraits: portraits(json('portraits.json'), problems),
    portraitAppearances: portraitAppearances(json('portrait-appearances.json'), problems),
    descriptions: descriptions(json('descriptions.json'), problems),
  };

  if (problems.length > 0) throw new ContentError(problems);
  return set;
}

/** The byte-order mark some Windows editors write at the start of a UTF-8 file; JSON.parse refuses it. */
const byteOrderMark = String.fromCharCode(0xfeff);

/** A file's JSON, or `undefined` with a problem recorded when it is missing, malformed or has a key twice. */
function readJson(file: ContentFileName, text: string | undefined, problems: string[]): unknown {
  if (text === undefined) {
    problems.push(`${file}: missing`);
    return undefined;
  }
  const unmarked = text.startsWith(byteOrderMark) ? text.slice(1) : text;
  let json: unknown;
  try {
    json = JSON.parse(unmarked);
  } catch (cause) {
    problems.push(`${file}: not valid JSON (${cause instanceof Error ? cause.message : String(cause)})`);
    return undefined;
  }
  for (const { key, path, line } of findDuplicateKeys(unmarked)) {
    const where = path.length === 0 ? 'at the top level' : `in ${path.join('.')}`;
    problems.push(`${file}: duplicate key "${key}" ${where} (line ${line})`);
  }
  return json;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A table of rows keyed by content key, each row's key taken from where it is stored. */
function table<Row extends { key: string }>(
  file: ContentFileName,
  json: unknown,
  problems: string[],
  what: string,
  shape: (row: RowReader, key: string) => Omit<Row, 'key'>,
): Record<string, Row> {
  const rows: Record<string, Row> = {};
  if (json === undefined) return rows;
  if (!isObject(json)) {
    problems.push(`${file}: must be an object of rows keyed by content key`);
    return rows;
  }
  for (const [key, raw] of Object.entries(json)) {
    if (!isObject(raw)) {
      problems.push(`${file}: ${key} must be an object`);
      continue;
    }
    const row = new RowReader(file, [key], raw, problems);
    rows[key] = { key, ...shape(row, key) } as Row;
    row.refuseUnknown(what);
  }
  return rows;
}

/**
 * The content version (v1.1.6-S4, DL-186 item 14), raised whenever the content changes, so a document
 * says which content it was created under: `version.json`'s `version`, beside its `changelog`, a
 * sentence for each raise saying why (`<n> from <what raised it>.`). The tools raise it through
 * `@heroesim/content/write`; nothing else writes it.
 */
function contentVersion(json: unknown, problems: string[]): number {
  if (json === undefined) return 0;
  if (!isObject(json)) {
    problems.push('version.json: must be an object of the version and its changelog');
    return 0;
  }
  const top = new RowReader('version.json', [], json, problems);
  const version = top.integer('version');
  if (Number.isInteger(json.version) && version < 1) problems.push(`version.json: version is ${version}; expected a whole number of at least 1`);
  top.strings('changelog');
  top.refuseUnknown('the content version');
  return version;
}

function names(json: unknown, problems: string[]): Names {
  const empty: Names = { given: { female: [], male: [] }, family: [], guild: [], patron: [] };
  if (json === undefined) return empty;
  if (!isObject(json)) {
    problems.push('names.json: must be an object of name lists');
    return empty;
  }
  const top = new RowReader('names.json', [], json, problems);
  const given = new RowReader('names.json', ['given'], top.object('given'), problems);
  const result: Names = {
    given: { female: given.strings('female'), male: given.strings('male') },
    family: top.strings('family'),
    guild: top.strings('guild'),
    patron: top.children('patron').map(patronName),
  };
  top.refuseUnknown('the name lists');
  given.refuseUnknown('the given-name lists');
  return result;
}

/** A Patron's name and its sex (v1.1.2-S3, DL-125 item 5). */
function patronName(row: RowReader): PatronName {
  const name = { name: row.string('name'), sex: row.oneOf('sex', sexChoices) };
  row.refuseUnknown("a Patron's name");
  return name;
}

/**
 * The Portraits (v1.1.2-S3, DL-125 item 3): each role, then each sex, a list of the pictures' keys.
 * Which keys are allowed is `validateContent`'s rule.
 */
function portraits(json: unknown, problems: string[]): Portraits {
  const none = (): Record<Sex, string[]> => ({ female: [], male: [] });
  const empty: Portraits = { guildmaster: none(), hero: none(), patron: none() };
  if (json === undefined) return empty;
  if (!isObject(json)) {
    problems.push('portraits.json: must be an object of the pictures by role and sex');
    return empty;
  }
  const top = new RowReader('portraits.json', [], json, problems);
  const result = Object.fromEntries(
    (Object.keys(portraitRoles) as PortraitRole[]).map((role) => {
      const bySex = top.child(role);
      const lists = Object.fromEntries((Object.keys(sexChoices) as Sex[]).map((sex) => [sex, bySex.strings(sex)]));
      bySex.refuseUnknown(`the ${role}'s pictures by sex`);
      return [role, lists];
    }),
  ) as Portraits;
  top.refuseUnknown('the Portraits');
  return result;
}

/**
 * The rows of the pictures (v1.1.2-S4, v1.1.3-S1; DL-126 item 2, DL-127, DL-134 item 3): `features`,
 * each `maleOnly` or not and with the Hero Traits it `shows`, both optional; and `portraits`, each
 * picture's row by its key: its `apparentAge`, `station`, `temper` and `narrative`, and optionally its
 * `features`, `hooks`, and either role's `callings` or `classes`. Which role's fields a row may have,
 * which keys are allowed and what the values may be are `validateContent`'s rules.
 */
function portraitAppearances(json: unknown, problems: string[]): PortraitAppearances {
  const file = 'portrait-appearances.json';
  const empty: PortraitAppearances = { features: {}, portraits: {} };
  if (json === undefined) return empty;
  if (!isObject(json)) {
    problems.push(`${file}: must be an object of the features and the pictures`);
    return empty;
  }
  const top = new RowReader(file, [], json, problems);
  /** Each row of the object in `field`, by its key, read by `shape`. */
  const rows = <Row>(field: string, what: string, shape: (row: RowReader) => Row): Record<string, Row> =>
    Object.fromEntries(
      Object.entries(top.object(field)).flatMap(([key, raw]): [string, Row][] => {
        if (!isObject(raw)) {
          problems.push(`${file}: ${field}.${key} must be an object`);
          return [];
        }
        const row = new RowReader(file, [field, key], raw, problems);
        const read = shape(row);
        row.refuseUnknown(what);
        return [[key, read]];
      }),
    );
  const result: PortraitAppearances = {
    features: rows('features', 'a feature', (row): Feature => ({
      maleOnly: row.optional('maleOnly', (field) => row.boolean(field)) ?? false,
      shows: row.optional('shows', (field) => row.strings(field)) ?? [],
    })),
    portraits: rows('portraits', "a picture's row", (row): PortraitAppearance => {
      const shape: PortraitAppearance = {
        apparentAge: row.numberList('apparentAge') as PortraitAppearance['apparentAge'],
        station: row.string('station'),
        temper: row.string('temper'),
        features: row.optional('features', (field) => row.strings(field)) ?? [],
        narrative: row.string('narrative'),
        hooks: row.optional('hooks', (field) => row.strings(field)) ?? [],
      };
      const callings = row.optional('callings', (field) => row.strings(field));
      const classes = row.optional('classes', (field) => row.strings(field));
      return { ...shape, ...(callings === undefined ? {} : { callings }), ...(classes === undefined ? {} : { classes }) };
    }),
  };
  top.refuseUnknown('the Appearances mapped to pictures');
  return result;
}

/**
 * What a Guildmaster's descriptive Attributes are written from (v1.1.2-S5, DL-125 item 6): the age
 * bands, the pronouns by sex, the Birthplaces, the Appearance's phrases by sex, age band and slot, and
 * the Biography's sentences by part; and since v1.1.3-S1 (DL-134 item 4, DL-135 item 6) the Stations,
 * the Tempers, the Callings with the Traits each suits and clashes with, the Biography's sentences by
 * a picture's Station, Callings and band, and Temper, and a Hero's Biography's sentences. A field
 * missing, unknown or of the wrong type is refused; which keys, bands and texts are allowed, and how
 * long they may make a text, is `validateContent`'s rule.
 */
function descriptions(json: unknown, problems: string[]): Descriptions {
  const file = 'descriptions.json';
  const none = (): Record<Sex, Record<string, never>> => ({ female: {}, male: {} });
  const empty: Descriptions = {
    ageBands: [],
    pronouns: none(),
    birthplaces: [],
    stations: [],
    tempers: [],
    callings: {},
    appearance: none(),
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
  };
  if (json === undefined) return empty;
  if (!isObject(json)) {
    problems.push(`${file}: must be an object of the age bands, pronouns, Birthplaces, Appearances and Biographies`);
    return empty;
  }
  const top = new RowReader(file, [], json, problems);
  const ageBands = top.children('ageBands').map((row): AgeBand => {
    const band = { key: row.string('key'), from: row.integer('from') };
    row.refuseUnknown('an age band');
    return band;
  });
  /** Each key of the object at `reader`'s `field`, with `read`'s value of it. */
  const byKey = <Value>(reader: RowReader, field: string, read: (child: RowReader, key: string) => Value): Record<string, Value> => {
    const child = reader.child(field);
    const result = Object.fromEntries(child.keys().map((key) => [key, read(child, key)]));
    return result;
  };
  /** An object of lists of strings by key, such as the Biography's sentences by age band. */
  const lists = (reader: RowReader, field: string): Record<string, string[]> => byKey(reader, field, (child, key) => child.strings(key));
  /** An object of such objects by key, such as the Biography's sentences by Calling and then by age band. */
  const listsByKey = (reader: RowReader, field: string): Record<string, Record<string, string[]>> =>
    byKey(reader, field, (child, key) => lists(child, key));

  const pronouns = top.child('pronouns');
  const appearance = top.child('appearance');
  const result: Descriptions = {
    ageBands,
    pronouns: Object.fromEntries(
      (Object.keys(sexChoices) as Sex[]).map((sex) => {
        const words = pronouns.child(sex);
        return [sex, Object.fromEntries(words.keys().map((slot) => [slot, words.string(slot)]))];
      }),
    ) as Descriptions['pronouns'],
    birthplaces: top.strings('birthplaces'),
    stations: top.strings('stations'),
    tempers: top.strings('tempers'),
    callings: byKey(top, 'callings', (child, key): Calling => {
      const row = child.child(key);
      const calling = { suits: row.strings('suits'), clashes: row.strings('clashes') };
      row.refuseUnknown('a calling');
      return calling;
    }),
    appearance: Object.fromEntries(
      (Object.keys(sexChoices) as Sex[]).map((sex) => [
        sex,
        byKey(appearance, sex, (bands, band): AppearancePhrases => {
          const row = bands.child(band);
          const phrases: AppearancePhrases = {
            build: row.strings('build'),
            face: row.strings('face'),
            hair: row.strings('hair'),
            eyes: row.strings('eyes'),
            mark: row.strings('mark'),
            bearing: row.strings('bearing'),
          };
          const facialHair = row.optional('facialHair', (field) => row.strings(field));
          row.refuseUnknown("an age band's Appearance phrases");
          return facialHair === undefined ? phrases : { ...phrases, facialHair };
        }),
      ]),
    ) as Descriptions['appearance'],
    biography: (() => {
      const biography = top.child('biography');
      const sentences = {
        origins: lists(biography, 'origins'),
        careers: lists(biography, 'careers'),
        backgrounds: lists(biography, 'backgrounds'),
        traits: lists(biography, 'traits'),
        closings: lists(biography, 'closings'),
        successors: biography.strings('successors'),
        stationOrigins: lists(biography, 'stationOrigins'),
        callingCareers: listsByKey(biography, 'callingCareers'),
        temperClosings: lists(biography, 'temperClosings'),
      };
      biography.refuseUnknown("the Biography's sentences");
      return sentences;
    })(),
    heroBiography: ((): HeroBiographySentences => {
      const biography = top.child('heroBiography');
      const sentences = {
        backgrounds: lists(biography, 'backgrounds'),
        classes: listsByKey(biography, 'classes'),
        traits: lists(biography, 'traits'),
        closings: lists(biography, 'closings'),
      };
      biography.refuseUnknown("a Hero's Biography sentences");
      return sentences;
    })(),
  };
  pronouns.refuseUnknown('the pronouns by sex');
  appearance.refuseUnknown('the Appearances by sex');
  top.refuseUnknown('the descriptions');
  return result;
}

/**
 * One of a Guildmaster Trait's `effects` (M4-S5, v1.1.4-S7): one of the closed union's kinds with
 * exactly its fields. How many a Trait carries, and the values, are `validateContent`'s rules.
 */
function guildmasterTraitEffect(reader: RowReader): GuildmasterTraitEffect {
  const kind = reader.oneOf('kind', guildmasterTraitEffectKinds);
  let effect: GuildmasterTraitEffect;
  switch (kind) {
    case 'classStatBonus':
      effect = { kind, classKey: reader.string('classKey'), statKey: reader.string('statKey'), delta: reader.integer('delta') };
      break;
    case 'guildMoraleShift':
      effect = { kind, delta: reader.number('delta') };
      break;
    case 'upkeepFactor':
      effect = { kind, factor: reader.number('factor') };
      break;
  }
  reader.refuseUnknown(`a ${kind} effect`);
  return effect;
}

/**
 * One of a Hero Trait's `effects` (v1.1.4-S7, DL-150 item 8): one of the closed union's kinds with
 * exactly its fields, an `encounterBonus`'s `kinds` and `tags` each optional. The values, and that an
 * Encounter bonus names a kind or a tag, are `validateContent`'s rules.
 */
function heroTraitEffect(reader: RowReader): HeroTraitEffect {
  const kind = reader.oneOf('kind', heroTraitEffectKinds);
  let effect: HeroTraitEffect;
  switch (kind) {
    case 'statModifiers':
      effect = { kind, modifiers: reader.numbers('modifiers') };
      break;
    case 'encounterBonus': {
      const kinds = reader.optional('kinds', (field) => reader.oneOfEach(field, encounterKinds));
      const tags = reader.optional('tags', (field) => reader.strings(field));
      effect = { kind, flat: reader.number('flat'), ...(kinds === undefined ? {} : { kinds }), ...(tags === undefined ? {} : { tags }) };
      break;
    }
  }
  reader.refuseUnknown(`a ${kind} effect`);
  return effect;
}

/**
 * An Item definition (M5-S1): the fields every Item has, then its `kind`'s. Gear has a `slot`, one of
 * the three, and `statModifiers`; a consumable an `effect`. A row with the other kind's field is
 * refused here, naming the field and why; gear without a slot is refused as a missing field. What
 * the values may be is `validateContent`'s.
 */
function itemDefinition(row: RowReader): Omit<GearDefinition, 'key'> | Omit<ConsumableDefinition, 'key'> {
  const common = {
    name: row.string('name'),
    unique: row.boolean('unique'),
    buyPrice: row.integerOrNull('buyPrice'),
    tags: row.strings('tags'),
  };
  const kind = row.oneOf('kind', itemKinds);
  switch (kind) {
    case 'gear':
      row.forbid('effect', 'is not a field of gear: only a consumable has an effect');
      return { ...common, kind, slot: row.oneOf('slot', gearSlots), statModifiers: row.numbers('statModifiers') };
    case 'consumable':
      row.forbid('slot', 'is not a field of a consumable: only gear has a slot');
      row.forbid('statModifiers', 'is not a field of a consumable: only gear modifies Stats');
      return { ...common, kind, effect: consumableEffect(row.child('effect')) };
  }
}

/** A consumable's `effect` (M5-S1): one of the closed union's kinds with exactly its fields. */
function consumableEffect(reader: RowReader): ConsumableEffect {
  const kind = reader.oneOf('kind', consumableEffectKinds);
  let effect: ConsumableEffect;
  switch (kind) {
    case 'reroll':
      effect = { kind, kinds: reader.oneOfEach('kinds', encounterKinds) };
      break;
    case 'bonus':
      effect = { kind, flat: reader.number('flat'), kinds: reader.oneOfEach('kinds', encounterKinds) };
      break;
    case 'heal':
      effect = { kind, days: reader.integer('days') };
      break;
  }
  reader.refuseUnknown(`a ${kind} effect`);
  return effect;
}

/**
 * One entry of a Loot table (M5-S5): an Item definition's key, a weight and a whole quantity range,
 * and nothing else. What they may be is `validateContent`'s.
 */
function lootEntry(reader: RowReader): LootEntry {
  const entry = {
    definitionKey: reader.string('definitionKey'),
    weight: reader.number('weight'),
    quantityMin: reader.integer('quantityMin'),
    quantityMax: reader.integer('quantityMax'),
  };
  reader.refuseUnknown('a Loot table entry');
  return entry;
}

/** A Quest template's `requires`: an optional Class and an optional Skill, and nothing else. */
function requires(reader: RowReader): QuestTemplateRequires {
  const classKey = reader.optionalString('classKey');
  const skillKey = reader.optionalString('skillKey');
  reader.refuseUnknown('what a Quest template requires');
  return { ...(classKey === undefined ? {} : { classKey }), ...(skillKey === undefined ? {} : { skillKey }) };
}

/**
 * What a Synergy requires (M4-S3; v1.1.4-S1, DL-148 item 20): a list of Party-level conditions, each
 * a Num compared with another, read as written and held by `validateContent`. The old form, a count
 * for each Class and a list of Skills, is no longer read (DL-192).
 */
function synergyRequires(row: RowReader): SynergyRequires {
  return row.list('requires', 'a list of conditions on the Party') as PartyCondition[];
}

/** A Synergy's bonus (M4-S3): a `flat`, a `factor`, either or both, and nothing else. */
function synergyBonus(reader: RowReader): SynergyBonus {
  const flat = reader.optional('flat', (field) => reader.number(field));
  const factor = reader.optional('factor', (field) => reader.number(field));
  reader.refuseUnknown("a Synergy's bonus");
  return { ...(flat === undefined ? {} : { flat }), ...(factor === undefined ? {} : { factor }) };
}

/**
 * One Check of an Encounter in the new form (v1.1.4-S2): its `key`, `name`, `score` (a Query, held by
 * `validateContent`), `skills` and `difficultyFactor`, and optionally `flat`, `variance` and `raw`
 * (DL-152), and nothing else.
 */
function encounterCheck(reader: RowReader): EncounterCheck {
  const shape: EncounterCheck = {
    key: reader.string('key'),
    name: reader.string('name'),
    score: reader.value('score') as NumQuery,
    skills: reader.strings('skills'),
    difficultyFactor: reader.number('difficultyFactor'),
  };
  const flat = reader.optional('flat', (field) => reader.number(field));
  const variance = reader.optional('variance', (field) => reader.number(field));
  const raw = reader.optional('raw', (field) => reader.boolean(field));
  reader.refuseUnknown("an Encounter's Check");
  return {
    ...shape,
    ...(flat === undefined ? {} : { flat }),
    ...(variance === undefined ? {} : { variance }),
    ...(raw === undefined ? {} : { raw }),
  };
}

/**
 * An Encounter's consequences: a list for each outcome, `success` and `failure`, and optionally
 * `triumph` and `setback` (v1.1.4-S2), and nothing else (M4-S1).
 */
function outcomes(reader: RowReader): Encounter['consequences'] {
  const result = {
    success: reader.children('success').map(consequence),
    failure: reader.children('failure').map(consequence),
  };
  const triumph = reader.optional('triumph', (field) => reader.children(field).map(consequence));
  const setback = reader.optional('setback', (field) => reader.children(field).map(consequence));
  reader.refuseUnknown("an Encounter's consequences");
  return { ...result, ...(triumph === undefined ? {} : { triumph }), ...(setback === undefined ? {} : { setback }) };
}

/**
 * One consequence: its `kind`, then the fields that kind has, and no others (M4-S1). An Injury and a
 * Death may also name `among` (a Set Query, held by `validateContent`), `exposedBy` and `guardedBy`,
 * and a Morale `steadiedBy` (v1.1.4-S4, DL-148 item 14); an earned Trait `among` (v1.1.4-S7).
 */
function consequence(reader: RowReader): Consequence {
  const kind = reader.oneOf('kind', consequenceKinds);
  const read = ((): Consequence => {
    switch (kind) {
      case 'injury':
        return { kind, typeKey: reader.string('typeKey'), chance: reader.number('chance'), count: reader.integer('count'), ...harmReads(reader) };
      case 'death':
        return { kind, chance: reader.number('chance'), ...harmReads(reader) };
      case 'morale': {
        const steadiedBy = reader.optional('steadiedBy', (field) => reader.strings(field));
        return { kind, delta: reader.integer('delta'), ...(steadiedBy === undefined ? {} : { steadiedBy }) };
      }
      case 'regard':
        return { kind, between: reader.oneOf('between', regardBetween), delta: reader.number('delta') };
      case 'xp':
      case 'wealth':
        return { kind, factor: reader.number('factor') };
      case 'fame':
        return { kind, delta: reader.integer('delta') };
      case 'trait': {
        // v1.1.4-S7: an earned Trait; its `among` is a Set Query, held by `validateContent` as harm's is.
        const among = reader.optional('among', (field) => reader.value(field) as SetQuery);
        return { kind, traitKey: reader.string('traitKey'), chance: reader.number('chance'), ...(among === undefined ? {} : { among }) };
      }
    }
  })();
  reader.refuseUnknown(`a consequence of kind ${kind}`);
  return read;
}

/** What an Injury or a Death reads to fall on someone (v1.1.4-S4): `among`, `exposedBy` and `guardedBy`, each optional. */
function harmReads(reader: RowReader): HarmReads {
  const among = reader.optional('among', (field) => reader.value(field) as SetQuery);
  const exposedBy = reader.optional('exposedBy', (field) => reader.strings(field));
  const guardedBy = reader.optional('guardedBy', (field) => reader.strings(field));
  return {
    ...(among === undefined ? {} : { among }),
    ...(exposedBy === undefined ? {} : { exposedBy }),
    ...(guardedBy === undefined ? {} : { guardedBy }),
  };
}

/**
 * Reads a row's fields, recording a problem for each that is missing or of the wrong type and
 * returning a stand-in so reading can go on and every problem be reported at once.
 */
class RowReader {
  private readonly read = new Set<string>();

  constructor(
    private readonly file: ContentFileName,
    private readonly prefix: readonly string[],
    private readonly raw: Record<string, unknown>,
    /** Where the problems found are recorded. */
    private readonly problems: string[],
  ) {}

  /** `field`'s value as it stands, of any type, then counted as read: for a value checked elsewhere. */
  value(field: string): unknown {
    return this.field(field);
  }

  string(field: string): string {
    const value = this.field(field);
    if (typeof value === 'string') return value;
    this.wrong(field, value, 'a string');
    return '';
  }

  /** A finite number, whole or not. */
  number(field: string): number {
    const value = this.field(field);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    this.wrong(field, value, 'a number');
    return 0;
  }

  integer(field: string): number {
    const value = this.field(field);
    if (Number.isInteger(value)) return value as number;
    this.wrong(field, value, 'a whole number');
    return 0;
  }

  oneOf<Choice extends string>(field: string, choices: Record<Choice, true>): Choice {
    const value = this.field(field);
    if (typeof value === 'string' && Object.hasOwn(choices, value)) return value as Choice;
    const listed = Object.keys(choices);
    this.wrong(field, value, listed.length === 0 ? 'none: there is nothing to choose from' : `one of ${listed.join(', ')}`);
    return Object.keys(choices)[0] as Choice;
  }

  strings(field: string): string[] {
    const value = this.field(field);
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
    this.wrong(field, value, 'a list of strings');
    return [];
  }

  boolean(field: string): boolean {
    const value = this.field(field);
    if (typeof value === 'boolean') return value;
    this.wrong(field, value, 'true or false');
    return false;
  }

  /** A whole number, or `null`: present either way. */
  integerOrNull(field: string): number | null {
    const value = this.field(field);
    if (value === null || Number.isInteger(value)) return value as number | null;
    this.wrong(field, value, 'a whole number or null');
    return null;
  }

  /** Record a problem, saying `why`, when the row has `field`, which it must not. */
  forbid(field: string, why: string): void {
    if (this.field(field) !== undefined) this.problems.push(`${this.path(field)} ${why}`);
  }

  /** A string, or `null`: present either way. */
  stringOrNull(field: string): string | null {
    const value = this.field(field);
    if (value === null || typeof value === 'string') return value;
    this.wrong(field, value, 'a string or null');
    return null;
  }

  /** `read`'s value of `field`, or `undefined` when the field is absent: an optional field of any type. */
  optional<Value>(field: string, read: (field: string) => Value): Value | undefined {
    if (this.raw[field] === undefined) {
      this.read.add(field);
      return undefined;
    }
    return read(field);
  }

  /** A string, or `undefined` when the field is absent. */
  optionalString(field: string): string | undefined {
    const value = this.field(field);
    if (value === undefined || typeof value === 'string') return value;
    this.wrong(field, value, 'a string, or no such field');
    return undefined;
  }

  /** A list of strings, each one of `choices`, such as a Quest template's Encounter kinds. */
  oneOfEach<Choice extends string>(field: string, choices: Record<Choice, true>): Choice[] {
    const value = this.field(field);
    const isChoice = (item: unknown): item is Choice => typeof item === 'string' && Object.hasOwn(choices, item);
    if (Array.isArray(value) && value.every(isChoice)) return [...value];
    this.wrong(field, value, `a list, each one of ${Object.keys(choices).join(', ')}`);
    return [];
  }

  /** A list of finite numbers, such as a picture's `apparentAge`; how many, and which, is the validator's. */
  numberList(field: string): number[] {
    const value = this.field(field);
    if (Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))) return [...value];
    this.wrong(field, value, 'a list of numbers');
    return [];
  }

  /** A list of anything, `expected` saying what it is a list of, such as a Synergy's conditions; each item is the validator's. */
  list(field: string, expected: string): unknown[] {
    const value = this.field(field);
    if (Array.isArray(value)) return value;
    this.wrong(field, value, expected);
    return [];
  }

  /** A list of `[key, weight]` pairs, such as a Quest template's demands. */
  weightedKeys(field: string): [string, number][] {
    const value = this.field(field);
    const isPair = (item: unknown): item is [string, number] =>
      Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && typeof item[1] === 'number';
    if (Array.isArray(value) && value.every(isPair)) return value.map(([key, weight]) => [key, weight]);
    this.wrong(field, value, 'a list of [key, weight] pairs');
    return [];
  }

  numbers(field: string): Record<string, number> {
    const value = this.field(field);
    if (isObject(value) && Object.values(value).every((item) => typeof item === 'number')) {
      return value as Record<string, number>;
    }
    this.wrong(field, value, 'an object of numbers');
    return {};
  }

  object(field: string): Record<string, unknown> {
    const value = this.field(field);
    if (isObject(value)) return value;
    this.wrong(field, value, 'an object');
    return {};
  }

  /** A reader for the object in `field`, reporting its problems under this row's path. */
  child(field: string): RowReader {
    return new RowReader(this.file, [...this.prefix, field], this.object(field), this.problems);
  }

  /**
   * A reader for each object in the list in `field`, reporting its problems under this row's path
   * and the item's place in the list; an item that is not an object is a problem of its own.
   */
  children(field: string): RowReader[] {
    const value = this.field(field);
    if (!Array.isArray(value)) {
      this.wrong(field, value, 'a list of objects');
      return [];
    }
    const readers: RowReader[] = [];
    value.forEach((item: unknown, index) => {
      const where = [...this.prefix, field, String(index)];
      if (isObject(item)) readers.push(new RowReader(this.file, where, item, this.problems));
      else this.problems.push(`${this.file}: ${where.join('.')} is ${JSON.stringify(item)}; expected an object`);
    });
    return readers;
  }

  /** Every field of the row, each then counted as read: for an object keyed by content, such as age bands. */
  keys(): string[] {
    const keys = Object.keys(this.raw);
    for (const key of keys) this.read.add(key);
    return keys;
  }

  /** Record a problem for every field of the row that nothing read. */
  refuseUnknown(what: string): void {
    for (const field of Object.keys(this.raw)) {
      if (!this.read.has(field)) {
        this.problems.push(`${this.path(field)} is not a field of ${what}`);
      }
    }
  }

  private field(field: string): unknown {
    this.read.add(field);
    return this.raw[field];
  }

  private wrong(field: string, value: unknown, expected: string): void {
    const found = value === undefined ? 'is missing' : `is ${JSON.stringify(value)}`;
    this.problems.push(`${this.path(field)} ${found}; expected ${expected}`);
  }

  private path(field: string): string {
    return `${this.file}: ${[...this.prefix, field].join('.')}`;
  }
}
