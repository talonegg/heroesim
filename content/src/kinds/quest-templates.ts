// The Quest templates (`quest-templates/`, a file each): the kinds of Quest the Patrons offer, found by
// Sphere when the Board is drawn (DL-20), each with the Tiers of the config's ladder it offers, its
// reward and Fame, what it requires, its Loot table, its Beats, each a line and a pool of Encounters,
// its Finale, named rather than drawn (DL-160), and the ladder's figures it overrides (DL-257, DL-262).

import type { EncounterKind, QuestBeat, QuestBeatPool, QuestTemplate, QuestTemplateRequires, TierRow } from '@heroesim/engine/content';
import { encounterKinds, inBeatPool, shortBeats, tierLadder, tierRowProblems } from '@heroesim/engine/content';
import {
  boolean,
  byKey,
  choicesOf,
  integer,
  listOfRows,
  number,
  object,
  oneOfEach,
  optional,
  optionalText,
  rowOf,
  strings,
  table,
  text,
  textOrNull,
} from './read.js';
import { checkRange, checkReferences, checkRowKeys, checkTags, checkWeight, own, repeated, type KindRules } from './rules.js';

const encounterKindChoices: Record<EncounterKind, true> = choicesOf(encounterKinds);

/** A Beat's pool: by kind, by tag and by name, each optional, at least one given (`checkBeats`). */
const beatPool = { kinds: optional(oneOfEach(encounterKindChoices)), tags: optional(strings), encounters: optional(strings) };

/**
 * A Tier's override: any of a Tier row's fields, the rest the ladder's. Each number is read as a number,
 * whole or not, and the row it makes is held to the ladder's rules (`tierRowProblems`), which name a
 * count that is not whole as the config's check does.
 */
const tierOverride = {
  difficultyMin: optional(number),
  difficultyMax: optional(number),
  daysMin: optional(number),
  daysMax: optional(number),
  beats: optional(number),
  loot: optional(boolean),
  rewardFactor: optional(number),
  xpFactor: optional(number),
  deathScale: optional(number),
  fameMinimum: optional(number),
};

export const questTemplatesKind = table<'questTemplates', QuestTemplate>(
  'questTemplates',
  'quest-templates/',
  {
    name: text,
    sphereKeys: strings,
    tags: strings,
    tierMin: integer,
    tierMax: integer,
    rewardPerDifficulty: number,
    fameEffect: integer,
    partySizeMin: integer,
    partySizeMax: integer,
    skillKeys: strings,
    // An optional Class and an optional Skill, and nothing else.
    requires: object<QuestTemplateRequires>({ classKey: optionalText, skillKey: optionalText }, 'what a Quest template requires'),
    lootTableKey: textOrNull,
    beats: listOfRows(rowOf<QuestBeat>({ line: text, pool: object<QuestBeatPool>(beatPool, "a Beat's pool") }, 'a Beat')),
    // Its Finale, none when absent (DL-160), and its line, given together.
    finale: optionalText,
    finaleLine: optionalText,
    overrides: optional(byKey(object<Partial<TierRow>>(tierOverride, "a Tier's override"))),
    weight: optional(number),
  },
  'a Quest template',
);

export const questTemplatesRules: KindRules = {
  key: 'questTemplates',
  check(set, problems, known) {
    checkRowKeys('questTemplates', set.questTemplates, problems);
    const spheres = new Set(Object.keys(set.spheres));
    for (const [key, template] of Object.entries(set.questTemplates)) {
      const where = `questTemplates.${key}`;
      checkWeight('questTemplates', key, template.weight, problems);
      if (template.sphereKeys.length === 0) problems.push(`${where}.sphereKeys is empty: no Patron offers it`);
      checkReferences(`${where}.sphereKeys`, template.sphereKeys, spheres, 'a Sphere', problems);
      checkTags(`${where}.tags`, template.tags, problems);
      checkRange(where, 'partySize', template.partySizeMin, template.partySizeMax, 1, problems);
      if (!(template.rewardPerDifficulty >= 0)) {
        problems.push(`${where}.rewardPerDifficulty is ${template.rewardPerDifficulty}; it is a number of 0 or more`);
      }
      if (!(template.fameEffect >= 0)) {
        problems.push(`${where}.fameEffect is ${template.fameEffect}; it is a whole number of 0 or more`);
      }
      checkReferences(`${where}.skillKeys`, template.skillKeys, known.skills, 'a Skill', problems);
      const { classKey, skillKey } = template.requires;
      if (classKey !== undefined && !known.classes.has(classKey)) {
        problems.push(`${where}.requires.classKey: "${classKey}" is not a Class`);
      }
      if (skillKey !== undefined && !known.skills.has(skillKey)) {
        problems.push(`${where}.requires.skillKey: "${skillKey}" is not a Skill`);
      }
      checkBeats(where, template, set, problems);
      const { lootTableKey } = template;
      if (lootTableKey !== null && !Object.hasOwn(set.lootTables, lootTableKey)) {
        problems.push(`${where}.lootTableKey: "${lootTableKey}" is not a Loot table`);
      }
    }
  },
};

/**
 * What a Quest template's Tiers and Beats are checked by (DL-257 items 1 and 2, DL-262), against the
 * default ladder (`tierLadder`):
 *
 * - its Tiers, from 1 and not upside down, none past the ladder;
 * - its Beats, one or more, each with a line and a pool giving one criterion or more among kinds,
 *   tags and named Encounters, none of them an empty list, a kind or name twice, a tag no Encounter
 *   carries, a name content lacks or a Finale;
 * - each pool able to give its Beat an Encounter whatever the Beats before it drew (`shortBeats`), as
 *   the engine's draw needs, a Finale never in one;
 * - its Finale and its line given together, the Finale an Encounter content defines;
 * - for each Tier it offers, as many Beats as the Tier plays, its Finale counted, and each override
 *   of a Tier it offers, of a sound Tier row once merged with the ladder's (`tierRowProblems`).
 */
function checkBeats(where: string, template: QuestTemplate, set: Parameters<KindRules['check']>[0], problems: string[]): void {
  const { tierMin, tierMax, beats, finale, finaleLine } = template;
  checkRange(where, 'tier', tierMin, tierMax, 1, problems);
  if (tierMax > tierLadder.length) problems.push(`${where}.tierMax is ${tierMax}; the ladder has ${tierLadder.length} Tiers`);

  if (beats.length === 0) problems.push(`${where}.beats is empty: a Quest plays one Beat at least`);
  const finales = new Set(Object.values(set.questTemplates).flatMap((it) => (it.finale === undefined ? [] : [it.finale])));
  const tags = new Set(Object.values(set.encounters).flatMap((encounter) => encounter.tags ?? []));
  const drawable = Object.values(set.encounters).filter((encounter) => !finales.has(encounter.key));
  beats.forEach(({ line, pool }, index) => {
    const at = `${where}.beats.${index}`;
    if (line.trim() === '') problems.push(`${at}.line is empty`);
    const lists = { kinds: pool.kinds, tags: pool.tags, encounters: pool.encounters };
    if (Object.values(lists).every((list) => list === undefined)) problems.push(`${at}.pool names no kind, tag or Encounter`);
    for (const [name, list] of Object.entries(lists)) {
      if (list?.length === 0) problems.push(`${at}.pool.${name} is empty`);
      for (const twice of repeated(list ?? [])) problems.push(`${at}.pool.${name}: "${twice}" is listed twice`);
    }
    for (const tag of pool.tags ?? []) if (!tags.has(tag)) problems.push(`${at}.pool.tags: "${tag}" is no Encounter's tag`);
    for (const key of pool.encounters ?? []) {
      if (!Object.hasOwn(set.encounters, key)) problems.push(`${at}.pool.encounters: "${key}" is not an Encounter`);
      else if (finales.has(key)) problems.push(`${at}.pool.encounters: "${key}" is a Finale, which no Beat draws`);
    }
  });
  const pools = beats.map(({ pool }) => drawable.filter((encounter) => inBeatPool(encounter, pool)).map((encounter) => encounter.key));
  for (const { beat, size, needs } of shortBeats(pools)) {
    const sharing = needs - 1;
    problems.push(
      `${where}.beats.${beat}.pool may draw ${size} Encounter${size === 1 ? '' : 's'}, none a Finale; it needs ${needs}` +
        (sharing === 0 ? '' : `, one for each Beat before it sharing its pool, and one more`),
    );
  }

  if ((finale === undefined) !== (finaleLine === undefined)) problems.push(`${where}: finale and finaleLine are given together or not at all`);
  if (finale !== undefined && !Object.hasOwn(set.encounters, finale)) problems.push(`${where}.finale: "${finale}" is not an Encounter`);
  if (finaleLine?.trim() === '') problems.push(`${where}.finaleLine is empty`);

  const offered = (tier: number): boolean => Number.isSafeInteger(tier) && tier >= Math.max(1, tierMin) && tier <= Math.min(tierMax, tierLadder.length);
  const overrides = template.overrides ?? {};
  for (const key of Object.keys(overrides)) {
    if (!offered(Number(key)) || String(Number(key)) !== key) problems.push(`${where}.overrides.${key}: Tier ${key} is not one it offers, ${tierMin} to ${tierMax}`);
  }
  const f = finale === undefined ? 0 : 1;
  for (let tier = Math.max(1, tierMin); tier <= Math.min(tierMax, tierLadder.length); tier += 1) {
    const override = own(overrides, String(tier));
    const figures = { ...(tierLadder[tier - 1] as TierRow), ...override };
    if (override !== undefined) for (const problem of tierRowProblems(figures)) problems.push(`${where}.overrides.${tier}: ${problem}`);
    if (figures.beats > beats.length + f) {
      problems.push(
        `${where}: Tier ${tier} plays ${figures.beats} Beats, more than its ${beats.length} Beat${beats.length === 1 ? '' : 's'}${f === 1 ? ' and its Finale' : ''}`,
      );
    }
  }
}
