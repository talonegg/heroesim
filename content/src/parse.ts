// Text in, content out (M1-S4). Pure: no file system, so a browser bundle can use it (M7-S1).
// Each file is an object keyed by content key; a row does not repeat its key, which it takes
// from the key it is stored under. Every file is checked for shape — each field present, of its
// type, and no field the schema does not know — then the whole set is validated.

import type {
  Background,
  BackgroundOwner,
  Class,
  ContentSet,
  Names,
  Skill,
  Sphere,
  Stat,
  StatArea,
  StatOwner,
  Trait,
  TraitOwner,
} from '@heroesim/engine';
import { findDuplicateKeys } from './duplicate-keys.js';
import { ContentError, validateContent } from './validate.js';

/** The content set this package holds, as `meta.content` records it. */
export const contentSetId = 'core';
/** Raised whenever the content changes, so a document says which content it was created under. */
export const contentVersion = 1;

/** The files of a content set, named as they sit in the content directory. */
export const contentFiles = [
  'stats.json',
  'classes.json',
  'skills.json',
  'traits.json',
  'backgrounds.json',
  'spheres.json',
  'names.json',
] as const;

export type ContentFileName = (typeof contentFiles)[number];

// The choices for each enumerated field. Keyed by the engine's union, so the compiler refuses
// a list that misses or invents a member.
const statAreas: Record<StatArea, true> = { physical: true, mental: true, magical: true, social: true };
const statOwners: Record<StatOwner, true> = { hero: true, guildmaster: true };
const traitOwners: Record<TraitOwner, true> = { hero: true, guildmaster: true };
const backgroundOwners: Record<BackgroundOwner, true> = { hero: true, guild: true };

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
      effect: row.null('effect'),
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
