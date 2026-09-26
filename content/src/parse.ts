// Text in, content out (M1-S4). Pure: no file system, so a browser bundle can use it (M7-S1).
// Each file is an object keyed by content key; a row does not repeat its key, which it takes
// from the key it is stored under. Every file is checked for shape — each field present, of its
// type, and no field the schema does not know — then the whole set is validated.

import type {
  Background,
  BackgroundOwner,
  Class,
  ContentSet,
  Consequence,
  ConsequenceKind,
  Disposition,
  Encounter,
  EncounterAggregate,
  EncounterKind,
  FacilityKey,
  Improvement,
  InjuryType,
  Names,
  QuestTemplate,
  QuestTemplateRequires,
  Skill,
  Sphere,
  Stat,
  StatArea,
  StatOwner,
  Synergy,
  SynergyBonus,
  SynergyRequires,
  Trait,
  TraitEffect,
  TraitEffectKind,
  TraitOwner,
} from '@heroesim/engine';
import { findDuplicateKeys } from './duplicate-keys.js';
import { ContentError, validateContent } from './validate.js';

/** The content set this package holds, as `meta.content` records it. */
export const contentSetId = 'core';
/**
 * Raised whenever the content changes, so a document says which content it was created under:
 * 2 from M2-S3, which added the Quest templates; 3 from M2-S9, which added the Dispositions; 4
 * from M2-S5, which added the Injury types; 5 from M3-S6, which added the Hall Improvements; 6 from
 * M4-S1, which added the Encounters and each Quest template's Encounter kinds and counts, and, on
 * a parallel branch, from M4-S5, which gave the Guildmaster Traits their effects (DL-43); 7 from
 * their merge, which holds both (DL-44); 8 from M4-S3, which added the Synergies (DL-45).
 */
export const contentVersion = 8;

/** The files of a content set, named as they sit in the content directory. */
export const contentFiles = [
  'stats.json',
  'classes.json',
  'skills.json',
  'traits.json',
  'backgrounds.json',
  'spheres.json',
  'names.json',
  'quest-templates.json',
  'dispositions.json',
  'injuries.json',
  'improvements.json',
  'encounters.json',
  'synergies.json',
] as const;

export type ContentFileName = (typeof contentFiles)[number];

// The choices for each enumerated field. Keyed by the engine's union, so the compiler refuses
// a list that misses or invents a member.
const statAreas: Record<StatArea, true> = { physical: true, mental: true, magical: true, social: true };
const statOwners: Record<StatOwner, true> = { hero: true, guildmaster: true };
const traitOwners: Record<TraitOwner, true> = { hero: true, guildmaster: true };
const traitEffectKinds: Record<TraitEffectKind, true> = { classStatBonus: true, guildMoraleShift: true, upkeepFactor: true };
const backgroundOwners: Record<BackgroundOwner, true> = { hero: true, guild: true };
const facilities: Record<FacilityKey, true> = { infirmary: true, trainingYard: true, quarters: true };
const encounterKinds: Record<EncounterKind, true> = { combat: true, travel: true, social: true, arcane: true, stealth: true };
const aggregates: Record<EncounterAggregate, true> = { best: true, sum: true };
const consequenceKinds: Record<ConsequenceKind, true> = {
  injury: true,
  death: true,
  morale: true,
  regard: true,
  xp: true,
  wealth: true,
  fame: true,
};
const regardBetween: Record<'party', true> = { party: true };

/**
 * Parse and validate a content set from the text of its files.
 *
 * @param files each file's text by its name in the content directory (`stats.json`); files
 *   that are not content files are ignored, so a whole directory's JSON may be passed
 * @throws ContentError naming the file and key of every problem found
 */
export function parseContent(files: Readonly<Record<string, string>>): ContentSet {
  const problems: string[] = [];
  const json = (file: ContentFileName): unknown => readJson(file, files[file], problems);

  const set: ContentSet = {
    id: contentSetId,
    version: contentVersion,
    stats: table<Stat>('stats.json', json('stats.json'), problems, 'a Stat', (row) => ({
      name: row.string('name'),
      area: row.oneOf('area', statAreas),
      min: row.integer('min'),
      max: row.integer('max'),
      default: row.integer('default'),
      owner: row.oneOf('owner', statOwners),
    })),
    classes: table<Class>('classes.json', json('classes.json'), problems, 'a Class', (row) => ({
      name: row.string('name'),
      leadingStats: row.strings('leadingStats'),
      gatedSkills: row.strings('gatedSkills'),
      growth: row.numbers('growth'),
    })),
    skills: table<Skill>('skills.json', json('skills.json'), problems, 'a Skill', (row) => ({
      name: row.string('name'),
    })),
    traits: table<Trait>('traits.json', json('traits.json'), problems, 'a Trait', (row) => ({
      name: row.string('name'),
      owner: row.oneOf('owner', traitOwners),
      effect: traitEffect(row.nullableChild('effect')),
    })),
    backgrounds: table<Background>(
      'backgrounds.json',
      json('backgrounds.json'),
      problems,
      'a Background',
      (row) => ({ name: row.string('name'), owner: row.oneOf('owner', backgroundOwners) }),
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
      (row) => ({
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
        lootTableKey: row.null('lootTableKey'),
        encounterKinds: row.oneOfEach('encounterKinds', encounterKinds),
        encountersMin: row.integer('encountersMin'),
        encountersMax: row.integer('encountersMax'),
      }),
    ),
    dispositions: table<Disposition>('dispositions.json', json('dispositions.json'), problems, 'a Disposition', (row) => ({
      name: row.string('name'),
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
    encounters: table<Encounter>('encounters.json', json('encounters.json'), problems, 'an Encounter', (row) => ({
      name: row.string('name'),
      kind: row.oneOf('kind', encounterKinds),
      demands: row.weightedKeys('demands'),
      aggregate: row.oneOf('aggregate', aggregates),
      skillKeys: row.strings('skillKeys'),
      difficultyFactor: row.number('difficultyFactor'),
      consequences: outcomes(row.child('consequences')),
    })),
    synergies: table<Synergy>('synergies.json', json('synergies.json'), problems, 'a Synergy', (row) => {
      const shape = {
        name: row.string('name'),
        requires: synergyRequires(row.child('requires')),
        bonus: synergyBonus(row.child('bonus')),
      };
      const kinds = row.optional('kinds', (field) => row.oneOfEach(field, encounterKinds));
      return kinds === undefined ? shape : { ...shape, kinds };
    }),
  };

  if (problems.length > 0) throw new ContentError(problems);
  return validateContent(set);
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
  shape: (row: RowReader) => Omit<Row, 'key'>,
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
    rows[key] = { key, ...shape(row) } as Row;
    row.refuseUnknown(what);
  }
  return rows;
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
    patron: top.strings('patron'),
  };
  top.refuseUnknown('the name lists');
  given.refuseUnknown('the given-name lists');
  return result;
}

/**
 * A Trait's `effect` (M4-S5): `null`, or one of the closed union's kinds with exactly its fields.
 * Which owner may carry which is `validateContent`'s rule.
 */
function traitEffect(reader: RowReader | null): TraitEffect | null {
  if (reader === null) return null;
  const kind = reader.oneOf('kind', traitEffectKinds);
  let effect: TraitEffect;
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

/** A Quest template's `requires`: an optional Class and an optional Skill, and nothing else. */
function requires(reader: RowReader): QuestTemplateRequires {
  const classKey = reader.optionalString('classKey');
  const skillKey = reader.optionalString('skillKey');
  reader.refuseUnknown('what a Quest template requires');
  return { ...(classKey === undefined ? {} : { classKey }), ...(skillKey === undefined ? {} : { skillKey }) };
}

/**
 * What a Synergy requires (M4-S3): a count for each Class it names, the Skills it names, either or
 * both, and nothing else. What they must name, and that they name something, is `validateContent`'s.
 */
function synergyRequires(reader: RowReader): SynergyRequires {
  const classes = reader.optional('classes', (field) => reader.numbers(field));
  const skills = reader.optional('skills', (field) => reader.strings(field));
  reader.refuseUnknown('what a Synergy requires');
  return { ...(classes === undefined ? {} : { classes }), ...(skills === undefined ? {} : { skills }) };
}

/** A Synergy's bonus (M4-S3): a `flat`, a `factor`, either or both, and nothing else. */
function synergyBonus(reader: RowReader): SynergyBonus {
  const flat = reader.optional('flat', (field) => reader.number(field));
  const factor = reader.optional('factor', (field) => reader.number(field));
  reader.refuseUnknown("a Synergy's bonus");
  return { ...(flat === undefined ? {} : { flat }), ...(factor === undefined ? {} : { factor }) };
}

/** An Encounter's consequences: a list for each outcome, and nothing else (M4-S1). */
function outcomes(reader: RowReader): Encounter['consequences'] {
  const result = {
    success: reader.children('success').map(consequence),
    failure: reader.children('failure').map(consequence),
  };
  reader.refuseUnknown("an Encounter's consequences");
  return result;
}

/** One consequence: its `kind`, then the fields that kind has, and no others (M4-S1). */
function consequence(reader: RowReader): Consequence {
  const kind = reader.oneOf('kind', consequenceKinds);
  const read = ((): Consequence => {
    switch (kind) {
      case 'injury':
        return { kind, typeKey: reader.string('typeKey'), chance: reader.number('chance'), count: reader.integer('count') };
      case 'death':
        return { kind, chance: reader.number('chance') };
      case 'morale':
        return { kind, delta: reader.integer('delta') };
      case 'regard':
        return { kind, between: reader.oneOf('between', regardBetween), delta: reader.number('delta') };
      case 'xp':
      case 'wealth':
        return { kind, factor: reader.number('factor') };
      case 'fame':
        return { kind, delta: reader.integer('delta') };
    }
  })();
  reader.refuseUnknown(`a consequence of kind ${kind}`);
  return read;
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
    private readonly problems: string[],
  ) {}

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
    this.wrong(field, value, `one of ${Object.keys(choices).join(', ')}`);
    return Object.keys(choices)[0] as Choice;
  }

  strings(field: string): string[] {
    const value = this.field(field);
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
    this.wrong(field, value, 'a list of strings');
    return [];
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

  null(field: string): null {
    const value = this.field(field);
    if (value !== null) this.wrong(field, value, 'null until a rule reads it');
    return null;
  }

  object(field: string): Record<string, unknown> {
    const value = this.field(field);
    if (isObject(value)) return value;
    this.wrong(field, value, 'an object');
    return {};
  }

  /** A reader for the object in `field`, or `null` when the field is `null`: present either way. */
  nullableChild(field: string): RowReader | null {
    const value = this.field(field);
    if (value === null) return null;
    if (isObject(value)) return new RowReader(this.file, [...this.prefix, field], value, this.problems);
    this.wrong(field, value, 'an object or null');
    return null;
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
