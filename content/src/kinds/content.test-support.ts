// For the content kinds' tests (DL-243): the shipped files read once, and content built from them in
// memory with one thing broken, read and checked as `parseContent` reads and checks the files. Only
// the kinds whose files a test changes are read again; the rest stand as shipped. A folder's rows are
// changed as one object by key, as a file's are, and written back a file a row (DL-260).

import type {
  Background,
  Class,
  ContentSet,
  Descriptions,
  Disposition,
  Encounter,
  GuildmasterTrait,
  HeroTrait,
  InjuryType,
  LootTable,
  Names,
  PortraitAppearances,
  Portraits,
  QuestTemplate,
  Skill,
  Sphere,
  Stat,
  Synergy,
} from '@heroesim/engine/content';
import { readContentDir } from '../node.js';
import { isFolder, parseContent, readKind, rowFile, sourceFiles, type ContentSource } from '../parse.js';
import { validateContent } from '../validate.js';
import { ContentError } from './error.js';
import { contentKinds } from './index.js';

export type Rows<Row> = Record<string, Omit<Row, 'key'>>;

/** Each content source as its JSON is written: a folder's, its rows by key. */
export interface Files {
  'stats.json': Rows<Stat>;
  'classes.json': Rows<Class>;
  'class-order.json': string[];
  'skills.json': Rows<Skill>;
  'guildmaster-traits.json': Rows<GuildmasterTrait>;
  'hero-traits.json': Rows<HeroTrait>;
  'backgrounds.json': Rows<Background>;
  'spheres.json': Rows<Sphere>;
  'names.json': Names;
  'quest-templates/': Rows<QuestTemplate>;
  'injuries.json': Rows<InjuryType>;
  'dispositions.json': Rows<Disposition>;
  'encounters/': Record<string, EncounterRow>;
  'synergies.json': Record<string, SynergyRow>;
  /** Written loosely: a row is gear or a consumable, and the tests give one the other's fields. */
  'items/': Record<string, Record<string, unknown>>;
  'loot-tables/': Rows<LootTable>;
  'portraits.json': Portraits;
  'portrait-appearances.json': PortraitAppearances;
  'descriptions.json': Descriptions;
  'version.json': { version: unknown; changelog: unknown; [field: string]: unknown };
}

/** An Encounter as its file in `encounters/` writes it. */
export type EncounterRow = Omit<Encounter, 'key'>;

/** A Synergy as `synergies.json` writes it: its requirement as conditions on the Party. */
export type SynergyRow = Omit<Synergy, 'key'>;

export type Template = Omit<QuestTemplate, 'key'>;

/** The shipped files' text, by their path in the content directory, read once. */
export const shippedTexts: Readonly<Record<string, string>> = Object.freeze(readContentDir());

/** The shipped content, read and checked once; a test takes a copy (`structuredClone`) to change. */
export const shipped: ContentSet = parseContent(shippedTexts);

/** The shipped files' text, a copy a test may change. */
export function realFiles(): Record<string, string> {
  return { ...shippedTexts };
}

/**
 * The content set of `files`, read and checked as `parseContent` reads and checks them, every problem
 * of shape first and then every rule's, but reading only the files that differ from the shipped.
 *
 * @throws ContentError naming every problem
 */
export function parse(files: Readonly<Record<string, string>>): ContentSet {
  const problems: string[] = [];
  const set: Record<string, unknown> = structuredClone(shipped) as unknown as Record<string, unknown>;
  for (const kind of contentKinds) {
    const same = JSON.stringify(sourceFiles(kind.source, files)) === JSON.stringify(sourceFiles(kind.source, shippedTexts));
    if (!same) set[kind.key] = readKind(kind, files, problems);
  }
  if (problems.length > 0) throw new ContentError(problems);
  return validateContent(set as unknown as ContentSet);
}

/** The real files with one of them changed as JSON. */
export function withJson<File extends keyof Files>(file: File, change: (json: Files[File]) => void): Record<string, string> {
  return changed(realFiles(), file, change);
}

/** `files` with one of them changed as JSON, so that several may be changed in turn: a folder's rows as one object by key. */
export function changed<File extends keyof Files>(files: Record<string, string>, file: File, change: (json: Files[File]) => void): Record<string, string> {
  const json = sourceJson(files, file) as Files[File];
  change(json);
  return withSourceJson(files, file, json);
}

/** The JSON of the source `source` in `files`: its file's, or its folder's rows' by key. */
export function sourceJson(files: Readonly<Record<string, string>>, source: ContentSource): unknown {
  if (!isFolder(source)) return JSON.parse(files[source] ?? '');
  return Object.fromEntries(sourceFiles(source, files).map(([name, text]) => [name.slice(source.length, -'.json'.length), JSON.parse(text)]));
}

/** `files` with the source `source` holding `json`: its file, or its folder a file a row, the rows it no longer holds gone. */
export function withSourceJson(files: Readonly<Record<string, string>>, source: ContentSource, json: unknown): Record<string, string> {
  if (!isFolder(source)) return { ...files, [source]: JSON.stringify(json, null, 2) };
  const kept = Object.fromEntries(Object.entries(files).filter(([name]) => !sourceFiles(source, files).some(([row]) => row === name)));
  const rows = Object.entries(json as Record<string, unknown>).map(([key, row]) => [rowFile(source, key), JSON.stringify(row, null, 2)]);
  return { ...kept, ...Object.fromEntries(rows) };
}

/** The real files with one of them, a source's file or a folder's row's, replaced by raw text. */
export function withText(file: Exclude<keyof Files, `${string}/`> | `${string}/${string}.json`, text: string): Record<string, string> {
  return { ...realFiles(), [file]: text };
}

/** The ContentError `run` throws; it fails the test where `run` throws none. */
export function refusalOf(run: () => unknown): ContentError {
  try {
    run();
  } catch (error) {
    if (error instanceof ContentError) return error;
    throw error;
  }
  throw new Error('expected a ContentError, but the content was accepted');
}

export const warrior = (json: Files['classes.json']) => json['warrior'] as Omit<Class, 'key'>;
export const barrow = (json: Files['quest-templates/']) => json['clear-the-barrow'] as Template;
export const stat = (json: Files['stats.json'], key: string) => json[key] as Omit<Stat, 'key'>;

/** A picture's row, as it is written in `portrait-appearances.json`. */
export type PictureRow = Record<string, unknown>;

/** A Guildmaster's picture's row that passes every check: its role's fields and no other's (DL-134 item 3). */
export const guildmasterRow = (): PictureRow => ({
  apparentAge: [33, 44],
  station: 'trade',
  callings: ['merchant'],
  temper: 'calculating',
  narrative: 'A narrow, clever face.',
});

/** A Hero's picture's row that passes every check: `classes` in the place of `callings` (DL-135 item 2). */
export const heroRow = (): PictureRow => ({
  apparentAge: [24, 32],
  station: 'common',
  temper: 'steady',
  classes: ['warrior'],
  features: ['scar'],
  narrative: 'A plain, open face.',
});

/**
 * `files` with a picture of `role` and `sex` listed in `portraits.json` under `key`, and its row, if
 * one is given, in `portrait-appearances.json`.
 */
export function withPicture(
  files: Record<string, string>,
  role: keyof Portraits,
  sex: 'female' | 'male',
  key: string,
  row: PictureRow | undefined,
): Record<string, string> {
  const listed = changed(files, 'portraits.json', (json) => {
    json[role][sex].push(key);
  });
  if (row === undefined) return listed;
  return changed(listed, 'portrait-appearances.json', (json) => {
    (json.portraits as unknown as Record<string, PictureRow>)[key] = row;
  });
}

/** `files` with the owner's two pictures alone, `gm-female-01` and `gm-male-01`, as the picture tests were written. */
export function ownersTwo(files: Record<string, string>): Record<string, string> {
  const listed = changed(files, 'portraits.json', (json) => {
    json.guildmaster.female = ['gm-female-01'];
    json.guildmaster.male = ['gm-male-01'];
  });
  return changed(listed, 'portrait-appearances.json', (json) => {
    const rows = json.portraits as unknown as Record<string, PictureRow>;
    for (const key of Object.keys(rows)) if (key !== 'gm-female-01' && key !== 'gm-male-01') delete rows[key];
  });
}

/** The row of `key` in a `portrait-appearances.json` being changed, loosely typed, so a test may break it. */
export const pictureRowOf = (json: PortraitAppearances, key: string): PictureRow => (json.portraits as unknown as Record<string, PictureRow>)[key] ?? {};

/** The real files with no Loot table, and no template naming one. */
export function withoutLoot(): Record<string, string> {
  const templates = withJson('quest-templates/', (json) => {
    for (const it of Object.values(json)) it.lootTableKey = null;
  });
  return withSourceJson(templates, 'loot-tables/', {});
}
