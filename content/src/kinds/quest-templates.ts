// The Quest templates (M2-S3; `quest-templates.json`): the kinds of Quest the Patrons offer, found by
// Sphere when the Board is drawn (DL-20), each with its ranges, its reward and Fame, what it requires,
// its Loot table, the kinds and count of Encounters it is drawn with (M4-S1), and its Finale, named
// rather than drawn (DL-160).

import type { EncounterKind, QuestTemplate, QuestTemplateRequires } from '@heroesim/engine/content';
import { encounterKinds } from '@heroesim/engine/content';
import { choicesOf, integer, number, object, oneOfEach, optional, optionalText, strings, table, text, textOrNull } from './read.js';
import { checkRange, checkReferences, checkRowKeys, checkTags, checkWeight, repeated, type KindRules } from './rules.js';

const encounterKindChoices: Record<EncounterKind, true> = choicesOf(encounterKinds);

export const questTemplatesKind = table<'questTemplates', QuestTemplate>(
  'questTemplates',
  'quest-templates.json',
  {
    name: text,
    sphereKeys: strings,
    tags: strings,
    difficultyMin: integer,
    difficultyMax: integer,
    durationDaysMin: integer,
    durationDaysMax: integer,
    rewardPerDifficulty: number,
    fameEffect: integer,
    partySizeMin: integer,
    partySizeMax: integer,
    skillKeys: strings,
    // An optional Class and an optional Skill, and nothing else.
    requires: object<QuestTemplateRequires>({ classKey: optionalText, skillKey: optionalText }, 'what a Quest template requires'),
    lootTableKey: textOrNull,
    encounterKinds: oneOfEach(encounterKindChoices),
    encountersMin: integer,
    encountersMax: integer,
    // Its Finale, none when absent (DL-160).
    finale: optionalText,
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
      checkRange(where, 'difficulty', template.difficultyMin, template.difficultyMax, 1, problems);
      checkRange(where, 'durationDays', template.durationDaysMin, template.durationDaysMax, 1, problems);
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
      checkEncounterDraw(where, template, set, problems);
      const { lootTableKey } = template;
      if (lootTableKey !== null && !Object.hasOwn(set.lootTables, lootTableKey)) {
        problems.push(`${where}.lootTableKey: "${lootTableKey}" is not a Loot table`);
      }
    }
  },
};

/**
 * What a Quest template's Encounter sequence is drawn by (M4-S1): at least one kind, none twice,
 * each with an Encounter in content to draw, and a count range from 1 that is not upside down. An
 * Encounter some template names as its Finale is never drawn, so a kind needs one that is no Finale;
 * and a Finale, if the template names one, is an Encounter content defines, of any kind, since it is
 * named rather than drawn (DL-160).
 */
function checkEncounterDraw(where: string, template: QuestTemplate, set: Parameters<KindRules['check']>[0], problems: string[]): void {
  if (template.encounterKinds.length === 0) problems.push(`${where}.encounterKinds is empty: a Quest is drawn with Encounters`);
  for (const kind of repeated(template.encounterKinds)) problems.push(`${where}.encounterKinds: "${kind}" is listed twice`);
  const finales = new Set(Object.values(set.questTemplates).flatMap((it) => (it.finale === undefined ? [] : [it.finale])));
  for (const kind of new Set(template.encounterKinds)) {
    const ofKind = Object.values(set.encounters).filter((encounter) => encounter.kind === kind);
    if (ofKind.length === 0) problems.push(`${where}.encounterKinds: no Encounter is of kind "${kind}"`);
    else if (ofKind.every((encounter) => finales.has(encounter.key))) {
      problems.push(`${where}.encounterKinds: every Encounter of kind "${kind}" is a Finale, which is never drawn`);
    }
  }
  checkRange(where, 'encounters', template.encountersMin, template.encountersMax, 1, problems);
  const { finale } = template;
  if (finale !== undefined && !Object.hasOwn(set.encounters, finale)) problems.push(`${where}.finale: "${finale}" is not an Encounter`);
}
