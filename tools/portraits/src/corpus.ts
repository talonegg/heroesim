// `corpus [--run <run> | --draft <draft.json>]` (v1.1.3-S3): the whole corpus of pictures and their words, counted, for the
// `portrait-analyse` skill to read. It changes nothing. The agents judge; this counts:
// - every picture the content lists or the register holds live, with its files, its row and the age
//   bands its `apparentAge` touches;
// - the pictures by role, sex and band, and a Hero's by Class too, and each cell short of three;
// - each narrative and hook over its bound, and each picture with more than two hooks;
// - the Stations, Tempers, Callings, Features and Classes no picture uses;
// - the sentence lists S5 and S6 draw from, each key's count, and each key short of three;
// - the pairs of pictures in the register within the fingerprint's distance;
// - the content's own problems and warnings, and the longest texts it can write.
// With `--run <run>`, an analysis run's three recommended files are read in place of the content's,
// so a run can be counted before it is applied; with `--draft <draft.json>`, a `write-run` draft's,
// so it can be counted before it is written.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ContentError,
  contentWarnings,
  descriptionBounds,
  hookMaxLength,
  hooksMax,
  longestDescriptions,
  narrativeMaxLength,
  parseContent,
  picturesWanted,
  type LongestDescriptions,
} from '@heroesim/content';
import { contentTexts } from './content-checks.js';
import { readContentVersion } from './content-version.js';
import { DraftError } from './errors.js';
import { distance } from './fingerprint.js';
import { analysisDir, runPattern } from './records.js';
import { picturePaths, readRegistry, roles, sexes, type Role, type Sex } from './registry.js';
import { runFiles } from './runs.js';

/** How many sentences each key of a list is wanted to hold (v1.1.3-S4's acceptance). */
export const sentencesWanted = 3;

/** One picture of the corpus. */
export interface CorpusPicture {
  key: string;
  role: Role;
  sex: Sex;
  /** Its status in the register, or `unregistered`. */
  status: 'live' | 'retired' | 'unregistered';
  /** Whether `portraits.json` lists it under its role and sex. */
  listed: boolean;
  /** Its picture and thumbnail, relative to the root, and whether each exists. */
  picture: { file: string; exists: boolean };
  thumbnail: { file: string; exists: boolean };
  /** Its row in `portrait-appearances.json`, or `null` for none. */
  row: Record<string, unknown> | null;
  /** The age bands its `apparentAge` touches. */
  bands: string[];
}

/** A cell of the counts with fewer pictures than wanted. */
export interface Gap {
  role: Role;
  sex: Sex;
  band: string;
  /** A Hero's Class, for a Hero's cell. */
  class?: string;
  count: number;
}

/** A text over its bound. */
export interface OverBound {
  key: string;
  field: string;
  length: number;
  limit: number;
}

/** A sentence list's key and how many sentences it holds. */
export interface SentenceCount {
  /** The list, as a path in `descriptions.json`: `biography.callingCareers`. */
  list: string;
  /** The key within it, `soldier.young`; empty for a list with no key. */
  key: string;
  count: number;
}

export interface Corpus {
  /** Where the three files were read: `content/`, the run's folder, or the draft. */
  source: string;
  contentVersion: number;
  bands: { key: string; from: number; to: number | null }[];
  pictures: CorpusPicture[];
  counts: {
    guildmaster: Record<string, Record<string, number>>;
    hero: Record<string, Record<string, Record<string, number>>>;
  };
  gaps: Gap[];
  overBounds: OverBound[];
  vocabulary: Record<'stations' | 'tempers' | 'callings' | 'features' | 'classes', { used: Record<string, string[]>; unused: string[] }>;
  sentences: { wanted: number; lists: SentenceCount[]; short: SentenceCount[] };
  similar: { a: string; b: string; distance: number }[];
  content: { ok: boolean; problems: string[]; warnings: string[]; longest: LongestDescriptions | null; bounds: typeof descriptionBounds };
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : [];
}

function objectAt(value: unknown, ...keys: string[]): Json {
  let at = value;
  for (const key of keys) at = isObject(at) && Object.hasOwn(at, key) ? at[key] : undefined;
  return isObject(at) ? at : {};
}

function shown(root: string, file: string): string {
  return path.relative(root, file).replace(/\\/g, '/');
}

/** A text's length as the content counts it: Unicode code points, once trimmed. */
function lengthOf(text: string): number {
  return [...text.trim()].length;
}

/**
 * The content's files as text, with a run's three, or a `write-run` draft's, in place of their own
 * where one is given.
 *
 * @throws DraftError naming a run or draft that is not there, or a draft not of its shape
 */
function readFiles(root: string, run: string | null, draft: string | null): { files: Record<string, string>; source: string } {
  if (run !== null && draft !== null) throw new DraftError(['--run and --draft: one or the other']);
  if (draft !== null) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(draft, 'utf8'));
    } catch (error) {
      throw new DraftError([`${draft}: ${error instanceof Error ? error.message : String(error)}`]);
    }
    const problems: string[] = [];
    const instead: Record<string, string> = {};
    for (const [field, name] of Object.entries(runFiles)) {
      const value = isObject(json) ? json[field] : undefined;
      if (isObject(value)) instead[name] = JSON.stringify(value);
      else problems.push(`${field}: the recommended ${name}, an object, is wanted`);
    }
    if (problems.length > 0) throw new DraftError(problems);
    return { files: contentTexts(root, instead), source: draft };
  }
  if (run === null) return { files: contentTexts(root), source: 'content/' };
  if (!runPattern.test(run)) throw new DraftError([`${run}: a run is named by its date, YYYY-MM-DD, or YYYY-MM-DD-<n>`]);
  const dir = path.join(analysisDir(root), run);
  const missing: string[] = [];
  const instead: Record<string, string> = {};
  for (const name of Object.values(runFiles)) {
    const file = path.join(dir, name);
    if (existsSync(file)) instead[name] = readFileSync(file, 'utf8');
    else missing.push(`${shown(root, file)} does not exist`);
  }
  if (missing.length > 0) throw new DraftError(missing);
  return { files: contentTexts(root, instead), source: `${shown(root, dir)}/` };
}

function parsed(files: Record<string, string>, name: string): Json {
  try {
    const value: unknown = JSON.parse(files[name] ?? '{}');
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

/**
 * Counts the corpus at `root`, or with an analysis run's files, or a `write-run` draft's, in place of
 * the content's.
 */
export function corpus(root: string, options: { run?: string | null; draft?: string | null } = {}): Corpus {
  const { files, source } = readFiles(root, options.run ?? null, options.draft ?? null);
  const portraits = parsed(files, 'portraits.json');
  const appearances = parsed(files, 'portrait-appearances.json');
  const descriptions = parsed(files, 'descriptions.json');
  const classesJson = parsed(files, 'classes.json');
  const guildmasterTraitsJson = parsed(files, 'guildmaster-traits.json');
  const heroTraitsJson = parsed(files, 'hero-traits.json');
  const backgroundsJson = parsed(files, 'backgrounds.json');
  const rows = objectAt(appearances, 'portraits');
  const registry = readRegistry(root);

  const bandList = (Array.isArray(descriptions.ageBands) ? descriptions.ageBands : []).filter(isObject).map((band) => ({
    key: String(band.key),
    from: Number(band.from),
  }));
  const bands = bandList.map((band, index) => {
    const next = bandList[index + 1];
    return { key: band.key, from: band.from, to: next === undefined ? null : next.from - 1 };
  });
  const bandsOf = (row: Json | null): string[] => {
    const age = row === null ? [] : Array.isArray(row.apparentAge) ? row.apparentAge : [];
    const [from, to] = age as [unknown, unknown];
    if (typeof from !== 'number' || typeof to !== 'number') return [];
    return bands.filter((band) => from <= (band.to ?? Number.POSITIVE_INFINITY) && to >= band.from).map((band) => band.key);
  };

  // The pictures: those the content lists, and those the register holds live.
  const keys = new Map<string, { role: Role; sex: Sex; listed: boolean }>();
  for (const role of Object.keys(roles) as Role[]) {
    for (const sex of sexes) {
      for (const key of strings(objectAt(portraits, role)[sex])) keys.set(key, { role, sex, listed: true });
    }
  }
  for (const [key, entry] of Object.entries(registry.portraits)) {
    if (entry.status === 'live' && !keys.has(key)) keys.set(key, { role: entry.role, sex: entry.sex, listed: false });
  }
  const pictures: CorpusPicture[] = [...keys.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { role, sex, listed }]) => {
      const paths = picturePaths(root, role, sex, key);
      const row = isObject(rows[key]) ? (rows[key] as Json) : null;
      return {
        key,
        role,
        sex,
        status: registry.portraits[key]?.status ?? 'unregistered',
        listed,
        picture: { file: shown(root, paths.picture), exists: existsSync(paths.picture) },
        thumbnail: { file: shown(root, paths.thumbnail), exists: existsSync(paths.thumbnail) },
        row,
        bands: bandsOf(row),
      };
    });
  const listed = pictures.filter((picture) => picture.listed);

  // The counts, and the cells short of pictures.
  const classKeys = Object.keys(classesJson);
  const guildmaster: Corpus['counts']['guildmaster'] = {};
  const hero: Corpus['counts']['hero'] = {};
  const gaps: Gap[] = [];
  for (const sex of sexes) {
    guildmaster[sex] = {};
    for (const band of bands) {
      const count = listed.filter((picture) => picture.role === 'guildmaster' && picture.sex === sex && picture.bands.includes(band.key)).length;
      (guildmaster[sex] as Record<string, number>)[band.key] = count;
      if (count < picturesWanted) gaps.push({ role: 'guildmaster', sex, band: band.key, count });
    }
  }
  for (const classKey of classKeys) {
    hero[classKey] = {};
    for (const sex of sexes) {
      const cell: Record<string, number> = {};
      for (const band of bands) {
        const count = listed.filter(
          (picture) => picture.role === 'hero' && picture.sex === sex && picture.bands.includes(band.key) && strings(picture.row?.classes).includes(classKey),
        ).length;
        cell[band.key] = count;
        if (count < picturesWanted) gaps.push({ role: 'hero', sex, band: band.key, class: classKey, count });
      }
      (hero[classKey] as Record<string, Record<string, number>>)[sex] = cell;
    }
  }

  // Texts over their bounds.
  const pronouns = objectAt(descriptions, 'pronouns');
  const overBounds: OverBound[] = [];
  for (const picture of pictures) {
    if (picture.row === null) continue;
    const narrative = typeof picture.row.narrative === 'string' ? picture.row.narrative : '';
    if (lengthOf(narrative) > narrativeMaxLength) {
      overBounds.push({ key: picture.key, field: 'narrative', length: lengthOf(narrative), limit: narrativeMaxLength });
    }
    const hooks = strings(picture.row.hooks);
    if (hooks.length > hooksMax) overBounds.push({ key: picture.key, field: 'hooks', length: hooks.length, limit: hooksMax });
    const words = objectAt(pronouns, picture.sex);
    hooks.forEach((hook, index) => {
      const written = hook.replace(/\{([^{}]*)\}/g, (slot, name: string) => (typeof words[name] === 'string' ? (words[name] as string) : slot));
      if (lengthOf(written) > hookMaxLength) overBounds.push({ key: picture.key, field: `hooks.${index}`, length: lengthOf(written), limit: hookMaxLength });
    });
  }

  // The vocabulary, and what no listed picture uses.
  const usage = (terms: readonly string[], field: string): { used: Record<string, string[]>; unused: string[] } => {
    const used: Record<string, string[]> = {};
    for (const term of terms) used[term] = [];
    for (const picture of listed) {
      const value = picture.row?.[field];
      for (const term of typeof value === 'string' ? [value] : strings(value)) (used[term] ??= []).push(picture.key);
    }
    return { used, unused: terms.filter((term) => (used[term] ?? []).length === 0) };
  };
  const vocabulary: Corpus['vocabulary'] = {
    stations: usage(strings(descriptions.stations), 'station'),
    tempers: usage(strings(descriptions.tempers), 'temper'),
    callings: usage(Object.keys(objectAt(descriptions, 'callings')), 'callings'),
    features: usage(Object.keys(objectAt(appearances, 'features')), 'features'),
    classes: usage(classKeys, 'classes'),
  };

  // The sentence lists, each key the vocabulary or the content defines.
  const bandKeys = bands.map((band) => band.key);
  const ownedBy = (json: Json, owner: string): string[] =>
    Object.entries(json)
      .filter(([, value]) => isObject(value) && value.owner === owner)
      .map(([key]) => key);
  const lists: SentenceCount[] = [];
  const count = (list: string, key: string, value: unknown): void => {
    lists.push({ list, key, count: strings(value).length });
  };
  const biography = objectAt(descriptions, 'biography');
  const heroBiography = objectAt(descriptions, 'heroBiography');
  for (const band of bandKeys) count('biography.origins', band, objectAt(biography, 'origins')[band]);
  for (const band of bandKeys) count('biography.careers', band, objectAt(biography, 'careers')[band]);
  for (const key of ownedBy(backgroundsJson, 'guild')) count('biography.backgrounds', key, objectAt(biography, 'backgrounds')[key]);
  for (const key of Object.keys(guildmasterTraitsJson)) count('biography.traits', key, objectAt(biography, 'traits')[key]);
  for (const band of bandKeys) count('biography.closings', band, objectAt(biography, 'closings')[band]);
  count('biography.successors', '', biography.successors);
  for (const station of strings(descriptions.stations)) count('biography.stationOrigins', station, objectAt(biography, 'stationOrigins')[station]);
  for (const calling of Object.keys(objectAt(descriptions, 'callings'))) {
    for (const band of bandKeys) count('biography.callingCareers', `${calling}.${band}`, objectAt(biography, 'callingCareers', calling)[band]);
  }
  for (const temper of strings(descriptions.tempers)) count('biography.temperClosings', temper, objectAt(biography, 'temperClosings')[temper]);
  for (const key of ownedBy(backgroundsJson, 'hero')) count('heroBiography.backgrounds', key, objectAt(heroBiography, 'backgrounds')[key]);
  for (const classKey of classKeys) {
    for (const band of bandKeys) count('heroBiography.classes', `${classKey}.${band}`, objectAt(heroBiography, 'classes', classKey)[band]);
  }
  for (const key of Object.keys(heroTraitsJson)) count('heroBiography.traits', key, objectAt(heroBiography, 'traits')[key]);
  for (const band of bandKeys) count('heroBiography.closings', band, objectAt(heroBiography, 'closings')[band]);

  // Pairs in the register within the fingerprint's distance.
  const similar: Corpus['similar'] = [];
  const entries = Object.entries(registry.portraits).sort(([a], [b]) => a.localeCompare(b));
  entries.forEach(([a, first], index) => {
    for (const [b, second] of entries.slice(index + 1)) {
      const apart = distance(first, second);
      if (apart <= registry.fingerprint.similarWithin) similar.push({ a, b, distance: apart });
    }
  });

  // The content's own checks, on these files.
  let content: Corpus['content'] = { ok: true, problems: [], warnings: [], longest: null, bounds: descriptionBounds };
  try {
    const set = parseContent(files);
    content = { ...content, warnings: contentWarnings(set), longest: longestDescriptions(set) };
  } catch (error) {
    const problems = error instanceof ContentError ? [...error.problems] : [error instanceof Error ? error.message : String(error)];
    content = { ...content, ok: false, problems };
  }

  return {
    source,
    contentVersion: readContentVersion(root),
    bands,
    pictures,
    counts: { guildmaster, hero },
    gaps,
    overBounds,
    vocabulary,
    sentences: { wanted: sentencesWanted, lists, short: lists.filter((each) => each.count < sentencesWanted) },
    similar,
    content,
  };
}

/** The corpus as lines for a person. */
export function corpusText(result: Corpus): string[] {
  const lines = [`Corpus of ${result.source} (content version ${result.contentVersion})`];
  const live = result.pictures.filter((picture) => picture.listed);
  lines.push(`Pictures listed: ${live.length}${live.length === 0 ? '' : `, ${live.map((picture) => picture.key).join(', ')}`}`);
  for (const picture of result.pictures.filter((each) => !each.listed || each.status !== 'live' || each.row === null || !each.picture.exists)) {
    lines.push(`  ${picture.key}: ${picture.status}, ${picture.listed ? 'listed' : 'not listed'}, ${picture.row === null ? 'no row' : 'a row'}, ${picture.picture.exists ? 'a picture' : 'no picture'}`);
  }
  lines.push('Guildmaster pictures by sex and band:');
  for (const [sex, byBand] of Object.entries(result.counts.guildmaster)) {
    lines.push(`  ${sex}: ${Object.entries(byBand).map(([band, count]) => `${band} ${count}`).join(', ')}`);
  }
  lines.push('Hero pictures by Class, sex and band:');
  for (const [classKey, bySex] of Object.entries(result.counts.hero)) {
    for (const [sex, byBand] of Object.entries(bySex)) {
      lines.push(`  ${classKey} ${sex}: ${Object.entries(byBand).map(([band, count]) => `${band} ${count}`).join(', ')}`);
    }
  }
  lines.push(`Cells short of ${picturesWanted} pictures: ${result.gaps.length}`);
  lines.push(
    result.overBounds.length === 0
      ? 'No text over its bound'
      : `Over their bounds: ${result.overBounds.map((each) => `${each.key}.${each.field} ${each.length} of ${each.limit}`).join(', ')}`,
  );
  for (const [kind, { unused }] of Object.entries(result.vocabulary)) {
    if (unused.length > 0) lines.push(`Unused ${kind}: ${unused.join(', ')}`);
  }
  lines.push(`Sentence keys short of ${result.sentences.wanted}: ${result.sentences.short.length} of ${result.sentences.lists.length}`);
  for (const each of result.sentences.short) lines.push(`  ${each.list}${each.key === '' ? '' : `.${each.key}`}: ${each.count}`);
  lines.push(
    result.similar.length === 0
      ? 'No two pictures in the register are similar'
      : `Similar in the register: ${result.similar.map((pair) => `${pair.a} and ${pair.b} (${pair.distance})`).join(', ')}`,
  );
  lines.push(result.content.ok ? `The content's checks pass, with ${result.content.warnings.length} warnings` : `The content's checks fail:`);
  for (const problem of result.content.problems) lines.push(`  ${problem}`);
  return lines;
}

