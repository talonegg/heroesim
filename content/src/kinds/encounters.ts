// The Encounters (M4-S1; `encounters.json`): an Encounter's kind and tags (DL-160), its one to four
// Checks, each scored by a Num Query (ADR-0010, DL-148 item 7), the pass formula that combines them,
// and its consequences by Degree, each one of a closed union of kinds with exactly its fields (DL-148
// items 14 and 25). The old form is no longer read (DL-192).

import type { Consequence, Degree, Encounter, EncounterCheck, EncounterKind, HarmReads, NumQuery, PassFormula, SetQuery } from '@heroesim/engine/content';
import { degrees, encounterKinds, queryProblems, type QueryKeys } from '@heroesim/engine/content';
import {
  anything,
  boolean,
  choicesOf,
  integer,
  listOfRows,
  number,
  object,
  oneOf,
  optional,
  rowOf,
  rowOfKinds,
  strings,
  table,
  text,
  type Fields,
  type Union,
} from './read.js';
import { checkReferences, checkRowKeys, checkTags, kebabCase, repeated, type KindRules } from './rules.js';

const encounterKindChoices: Record<EncounterKind, true> = choicesOf(encounterKinds);

/** What an Injury or a Death reads to fall on someone (DL-148 item 14): `among`, `exposedBy` and `guardedBy`, each optional. */
const harmReads: Fields<HarmReads> = { among: optional(anything<SetQuery>()), exposedBy: optional(strings), guardedBy: optional(strings) };

/** One consequence: its `kind`, then the fields that kind has, and no others. */
const consequence: Union<Consequence['kind'], Consequence> = {
  by: 'kind',
  kinds: {
    injury: { typeKey: text, chance: number, count: integer, ...harmReads },
    death: { chance: number, ...harmReads },
    morale: { delta: integer, steadiedBy: optional(strings) },
    regard: { between: oneOf({ party: true }), delta: number },
    xp: { factor: number },
    wealth: { factor: number },
    fame: { delta: integer },
    // An earned Trait; its `among` a Set Query, held as harm's is (DL-148 item 25).
    trait: { traitKey: text, chance: number, among: optional(anything<SetQuery>()) },
  },
  what: (kind) => `a consequence of kind ${kind}`,
};
const consequences = listOfRows(rowOfKinds(consequence));

export const encountersKind = table<'encounters', Encounter>(
  'encounters',
  'encounters.json',
  {
    name: text,
    kind: oneOf(encounterKindChoices),
    tags: optional(strings),
    // Its Checks: a `score` (a Query, held by the rules), `skills` and `difficultyFactor`, and optionally `flat`, `variance` and `raw` (DL-152).
    checks: listOfRows(
      rowOf<EncounterCheck>(
        {
          key: text,
          name: text,
          score: anything<NumQuery>(),
          skills: strings,
          difficultyFactor: number,
          flat: optional(number),
          variance: optional(number),
          raw: optional(boolean),
        },
        "an Encounter's Check",
      ),
    ),
    pass: optional(anything<PassFormula>()),
    // A list for each outcome, `success` and `failure`, and optionally `triumph` and `setback`.
    consequences: object<Encounter['consequences']>(
      { success: consequences, failure: consequences, triumph: optional(consequences), setback: optional(consequences) },
      "an Encounter's consequences",
    ),
  },
  'an Encounter',
);

/** How many Checks an Encounter has at most (DL-148 item 7). */
export const encounterChecksMax = 4;

/**
 * The Encounters' rules: tags, if any, in kebab-case, none twice; one to four Checks, each keyed in
 * kebab-case once, named, scored by a Num Query (`queryProblems`), helped by Skills that exist, and
 * aimed at a target above 0 (`checkTarget`); a pass formula naming every Check once (`checkPass`),
 * which one Check may leave out; and consequences by Degree, each within its kind's bounds, an Injury
 * naming a type content defines. An unknown Stat, Skill or Injury type is refused (M4-S1).
 */
export const encountersRules: KindRules = {
  key: 'encounters',
  check(set, problems, known) {
    checkRowKeys('encounters', set.encounters, problems);
    for (const [key, encounter] of Object.entries(set.encounters)) {
      const where = `encounters.${key}`;
      checkTags(`${where}.tags`, encounter.tags ?? [], problems);
      const { checks } = encounter;
      if (checks.length === 0) problems.push(`${where}.checks is empty: an Encounter is resolved by a Check`);
      if (checks.length > encounterChecksMax) {
        problems.push(`${where}.checks has ${checks.length}; an Encounter has at most ${encounterChecksMax}`);
      }
      for (const repeat of repeated(checks.map((it) => it.key))) problems.push(`${where}.checks: "${repeat}" is listed twice`);
      checks.forEach((it, index) => {
        const at = `${where}.checks.${index}`;
        if (!kebabCase.test(it.key)) problems.push(`${at}.key: "${it.key}" is not kebab-case`);
        if (it.name.trim() === '') problems.push(`${at}.name is empty: a Check is named for the narration and the Board`);
        problems.push(...queryProblems(it.score, it.raw === true ? 'raw score' : 'score', known.query, `${at}.score`));
        checkReferences(`${at}.skills`, it.skills, known.query.skills, 'a Skill', problems);
        checkTarget(at, it, problems);
        if (it.raw === true && it.skills.length > 0) {
          problems.push(`${at}.skills lists ${it.skills.length}; a raw Check is its score alone, and lists no Skills`);
        }
      });
      if (encounter.pass !== undefined) checkPass(`${where}.pass`, encounter.pass, checks.map((it) => it.key), problems);
      else if (checks.length > 1) problems.push(`${where}.pass is missing: an Encounter of several Checks combines them by a pass formula`);
      for (const degree of degrees) {
        encounter.consequences[degree]?.forEach((each, index, list) => {
          const at = `${where}.consequences.${degree}.${index}`;
          checkConsequence(at, each, set, known.query, problems);
          if (each.kind === 'trait') checkEarnedTraitPlace(at, degree, list.slice(0, index), problems);
        });
      }
    }
  },
};

/**
 * Where an earned Trait stands (DL-148 item 25): its list says what it is, so it stands in an
 * Encounter's `triumph` list, a positive Trait granted on a strong success, or its `failure` list, a
 * negative one; never in `success`, which a Triumph without a list of its own reads too, nor in
 * `setback`. A negative Trait falls only among the Heroes the same Encounter injured, so an Injury
 * comes before it in its list.
 */
function checkEarnedTraitPlace(at: string, degree: Degree, before: readonly Consequence[], problems: string[]): void {
  if (degree === 'success' || degree === 'setback') {
    problems.push(`${at}: an earned Trait stands in the triumph list, a positive one, or the failure list, a negative one; not in ${degree}`);
  } else if (degree === 'failure' && !before.some((it) => it.kind === 'injury')) {
    problems.push(`${at}: a negative Trait falls only among the Heroes this Encounter injured, so an Injury comes before it in the failure list`);
  }
}

/**
 * A Check's target and spread (DL-148 item 7): a difficulty factor above 0, or of 0 beside a `flat`
 * above 0, which then ignores the difficulty; a `flat`, if it has one, of 0 or more; and a
 * `variance`, if it has one, from 0, a gate with no luck in it, to 1.
 */
function checkTarget(at: string, check: EncounterCheck, problems: string[]): void {
  const { difficultyFactor, flat, variance } = check;
  if (flat !== undefined && !(Number.isFinite(flat) && flat >= 0)) problems.push(`${at}.flat is ${flat}; it is a number of 0 or more`);
  const flatAbove0 = flat !== undefined && flat > 0;
  if (!(Number.isFinite(difficultyFactor) && (difficultyFactor > 0 || (flatAbove0 && difficultyFactor === 0)))) {
    const why = flatAbove0 ? 'it is a number of 0 or more' : 'it is a number above 0, or 0 beside a flat above 0';
    problems.push(`${at}.difficultyFactor is ${difficultyFactor}; ${why}`);
  }
  if (variance !== undefined && !(variance >= 0 && variance <= 1)) problems.push(`${at}.variance is ${variance}; it is a number from 0 to 1`);
}

/** The pass formula's operators (DL-148 item 7). */
const passOperators: readonly string[] = ['and', 'or', 'at-least'];

/**
 * An Encounter's pass formula (DL-148 item 7), each refusal naming its path: a Check's key, or `and`
 * or `or` of two or more parts, or `at-least` k of two or more parts, k a whole number from 1 to
 * their number; naming every one of `checkKeys` once, and nothing else.
 */
function checkPass(where: string, pass: unknown, checkKeys: readonly string[], problems: string[]): void {
  const named: string[] = [];
  const visit = (at: string, part: unknown): void => {
    if (typeof part === 'string') {
      if (checkKeys.includes(part)) named.push(part);
      else problems.push(`${at}: ${JSON.stringify(part)} is not a Check of this Encounter`);
      return;
    }
    if (!Array.isArray(part)) {
      problems.push(`${at} is ${JSON.stringify(part)}; a part of a pass formula is a Check's key or a list`);
      return;
    }
    const [operator, k] = part as unknown[];
    if (typeof operator !== 'string' || !passOperators.includes(operator)) {
      problems.push(`${at}.0 is ${JSON.stringify(operator)}; a pass formula's operator is and, or or at-least`);
      return;
    }
    const counted = operator === 'at-least';
    const parts = part.slice(counted ? 2 : 1);
    if (parts.length < 2) problems.push(`${at} has ${parts.length} part${parts.length === 1 ? '' : 's'}; ${operator} combines two or more`);
    if (counted && !(typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= parts.length)) {
      problems.push(`${at}.1 is ${JSON.stringify(k)}; at-least's k is a whole number from 1 to the number of its parts, ${parts.length}`);
    }
    parts.forEach((each, index) => visit(`${at}.${index + (counted ? 2 : 1)}`, each));
  };
  visit(where, pass);
  for (const twice of repeated(named)) problems.push(`${where}: "${twice}" is named twice; every Check is named once`);
  for (const key of checkKeys) if (!named.includes(key)) problems.push(`${where}: "${key}" is not named; every Check is named once`);
}

/**
 * One consequence's fields, by its kind. An Injury's and a Death's `among` is a Set Query, held as a
 * Check's score is, Sex allowed in its filters; their `exposedBy` and `guardedBy`, and a Morale's
 * `steadiedBy`, list one or more Hero Stats, none twice (DL-148 item 14), and a Morale's `steadiedBy`
 * stands only beside a loss, since a gain is never steadied.
 */
function checkConsequence(where: string, each: Consequence, set: Parameters<KindRules['check']>[0], keys: QueryKeys, problems: string[]): void {
  const probability = (value: number): void => {
    if (!(value >= 0 && value <= 1)) problems.push(`${where}.chance is ${value}; it is a probability from 0 to 1`);
  };
  const factor = (value: number): void => {
    if (!(Number.isFinite(value) && value >= 0)) problems.push(`${where}.factor is ${value}; it is a number of 0 or more`);
  };
  switch (each.kind) {
    case 'injury':
      if (!Object.hasOwn(set.injuries, each.typeKey)) {
        problems.push(`${where}.typeKey: "${each.typeKey}" is not an Injury type`);
      }
      probability(each.chance);
      if (!(Number.isInteger(each.count) && each.count >= 1)) {
        problems.push(`${where}.count is ${each.count}; it is a whole number from 1`);
      }
      checkHarmReads(where, each, keys, problems);
      return;
    case 'death':
      probability(each.chance);
      checkHarmReads(where, each, keys, problems);
      return;
    case 'xp':
    case 'wealth':
      factor(each.factor);
      return;
    case 'morale':
      if (each.steadiedBy !== undefined) {
        checkStatList(`${where}.steadiedBy`, each.steadiedBy, keys, problems);
        if (!(each.delta < 0)) {
          problems.push(`${where}.steadiedBy steadies a loss; delta is ${each.delta}, and a gain is never steadied`);
        }
      }
      return;
    case 'regard':
    case 'fame':
      return;
    case 'trait':
      if (!Object.hasOwn(set.heroTraits, each.traitKey)) problems.push(`${where}.traitKey: "${each.traitKey}" is not a Hero Trait`);
      probability(each.chance);
      if (each.among !== undefined) problems.push(...queryProblems(each.among, 'among', keys, `${where}.among`));
      return;
  }
}

/** An Injury's or a Death's `among`, `exposedBy` and `guardedBy` (DL-148 item 14), each where it stands. */
function checkHarmReads(where: string, each: HarmReads, keys: QueryKeys, problems: string[]): void {
  if (each.among !== undefined) problems.push(...queryProblems(each.among, 'among', keys, `${where}.among`));
  if (each.exposedBy !== undefined) checkStatList(`${where}.exposedBy`, each.exposedBy, keys, problems);
  if (each.guardedBy !== undefined) checkStatList(`${where}.guardedBy`, each.guardedBy, keys, problems);
}

/** A list of the Stats harm reads (DL-148 item 14): one or more Hero Stats, none twice. */
function checkStatList(where: string, statKeys: readonly string[], keys: QueryKeys, problems: string[]): void {
  if (statKeys.length === 0) problems.push(`${where} lists no Stat; leave it out to read none`);
  checkReferences(where, statKeys, keys.heroStats, 'a Hero Stat', problems);
}
