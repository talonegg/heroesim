// The content schema's rules across rows: what a single row's shape cannot show (M1-S4).
// `parseContent` runs this on every set it builds; a set assembled in memory, by a test or a
// later module, runs it directly.

import type { ContentSet } from '@heroesim/engine';

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

  const lists: [string, string[]][] = [
    ...Object.entries(set.names.given).map(([sex, list]): [string, string[]] => [`given.${sex}`, list]),
    ['family', set.names.family],
    ['guild', set.names.guild],
    ['patron', set.names.patron],
  ];
  for (const [list, names] of lists) {
    if (names.length === 0) problems.push(`names.${list} is empty`);
    for (const name of repeated(names)) problems.push(`names.${list}: "${name}" is listed twice`);
  }

  if (problems.length > 0) throw new ContentError(problems);
  return set;
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
