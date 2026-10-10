// How a content kind's rules are written (DL-243): the checks across rows no single row's shape can
// show, each a kind's, built from this small vocabulary as `configRules` builds the settings' (ADR-0007:
// no library in the engine, and none here). A rule records each problem it finds by its path, so an
// author can go straight to it; the problems of every kind are reported at once.

import type { ContentSet, QueryKeys } from '@heroesim/engine/content';

/** The keys content defines that many rules read, found once a check (`knownOf`). */
export interface Known {
  /** The Hero Stats' keys. */
  heroStats: ReadonlySet<string>;
  skills: ReadonlySet<string>;
  classes: ReadonlySet<string>;
  /** The keys a Query may name: its Hero Stats, Skills, Classes, Hero Backgrounds and Hero Traits (`queryProblems`, DL-186 item 6). */
  query: QueryKeys;
}

/** A kind's rules: the place in the content set it checks, and its check, recording each problem in `problems`. */
export interface KindRules {
  key: keyof ContentSet;
  check(set: ContentSet, problems: string[], known: Known): void;
}

/** The keys `set` defines that the rules read. */
export function knownOf(set: ContentSet): Known {
  const owned = (rows: Readonly<Record<string, { owner: string }>>): Set<string> =>
    new Set(Object.entries(rows).flatMap(([key, row]) => (row.owner === 'hero' ? [key] : [])));
  const heroStats = owned(set.stats);
  const skills = new Set(Object.keys(set.skills));
  const classes = new Set(Object.keys(set.classes));
  return { heroStats, skills, classes, query: { heroStats, skills, classes, heroBackgrounds: owned(set.backgrounds), heroTraits: new Set(Object.keys(set.heroTraits)) } };
}

/** Lower-case letters and digits in words joined by single hyphens, starting with a letter. */
export const kebabCase = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** A picture's name, or a key of the words a picture is read in: lower-case letters and digits in words joined by hyphens (DL-125 item 11). */
export const lowerAndHyphens = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The values that appear more than once, each once, in order of their second appearance. */
export function repeated(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) twice.add(value);
    seen.add(value);
  }
  return [...twice];
}

/** Every key must name a row of the table it refers to, and appear once. */
export function checkReferences(where: string, keys: readonly string[], known: ReadonlySet<string>, what: string, problems: string[]): void {
  for (const key of keys) {
    if (!known.has(key)) problems.push(`${where}: "${key}" is not ${what}`);
  }
  for (const key of repeated(keys)) problems.push(`${where}: "${key}" is listed twice`);
}

/** Each of `tags` in kebab-case, and none twice. */
export function checkTags(where: string, tags: readonly string[], problems: string[]): void {
  for (const tag of tags) if (!kebabCase.test(tag)) problems.push(`${where}: "${tag}" is not kebab-case`);
  for (const tag of repeated(tags)) problems.push(`${where}: "${tag}" is listed twice`);
}

/** Each of `kinds` a kind of Encounter, the engine's list, and none twice. */
export function checkEncounterKinds(where: string, kinds: readonly string[], encounterKinds: readonly string[], problems: string[]): void {
  for (const kind of kinds) if (!encounterKinds.includes(kind)) problems.push(`${where}: "${kind}" is not a kind of Encounter`);
  for (const kind of repeated(kinds)) problems.push(`${where}: "${kind}" is listed twice`);
}

/** `min` and `max` are a range: `floor <= min <= max`. */
export function checkRange(where: string, field: string, min: number, max: number, floor: number, problems: string[]): void {
  if (min < floor) problems.push(`${where}.${field}Min is ${min}; it is at least ${floor}`);
  if (min > max) problems.push(`${where}.${field}Min ${min} is greater than ${field}Max ${max}`);
}

/** Each row of a table keyed in kebab-case, by the key it is stored under. */
export function checkRowKeys(table: string, rows: Readonly<Record<string, { key: string }>>, problems: string[]): void {
  for (const [key, row] of Object.entries(rows)) {
    if (!kebabCase.test(key)) problems.push(`${table}: "${key}" is not kebab-case`);
    if (row.key !== key) problems.push(`${table}.${key}: its key is "${row.key}", not the key it is stored under`);
  }
}

/** A row's draw weight, where it has one, above 0, so that a draw can land on it and the odds are weights (DL-202). */
export function checkWeight(table: string, key: string, weight: number | undefined, problems: string[]): void {
  if (weight !== undefined && !(Number.isFinite(weight) && weight > 0)) {
    problems.push(`${table}.${key}.weight is ${weight}; it is a number above 0, or absent for 1`);
  }
}

/** The value `record` holds under `key`, its own and not its prototype's; `undefined` for none. */
export function own<Value>(record: Readonly<Record<string, Value>>, key: string | undefined): Value | undefined {
  return key !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}
