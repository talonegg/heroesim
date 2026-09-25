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

/**
 * How far a Quest template's demand weights may sum from 1 (M2-S3): written by hand, like growth,
 * and read by the stub as proportions (M2-S5), so near 1 is as good as exactly 1.
 */
export const demandSumTolerance = 0.001;

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
  }
  // A Patron's Quests are found by Sphere when the Board is drawn (pre-M0 review D3): a Sphere no
  // template serves would leave its Patrons offering nothing.
  for (const sphereKey of spheres) {
    if (!served.has(sphereKey)) problems.push(`spheres.${sphereKey}: no Quest template names it in sphereKeys`);
  }

  // The stub Quest Engine draws an Injury's type from these (M2-S5): at least one, each healing in
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
