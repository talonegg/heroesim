import { type Encounter } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { validateContent } from '../index.js';
import { shipped, realFiles, parse, withJson, withText, refusalOf, type Files, type SynergyRow } from './content.test-support.js';

// The Synergies' refusals, and a Query's in a Synergy's requirement (DL-243). Each is triggered by content built in memory from the shipped files with one
// thing broken, read and checked as `parseContent` does, and names the offending key, so an author
// can find it.

// A Synergy naming an unknown Class, Skill or Encounter kind is refused, as is a count below
// 1, a bonus that is not one, and a requirement of nothing (DL-45).
describe('a Synergy', () => {
  const salve = (json: Files['synergies.json']) => json['sword-and-salve'] as SynergyRow;

  test.each<[string, (it: SynergyRow) => void, RegExp]>([
    ['no bonus', (it) => (it.bonus = {}), /sword-and-salve\.bonus is empty/],
    ['a flat of 0', (it) => (it.bonus = { flat: 0 }), /sword-and-salve\.bonus\.flat is 0; it is a number above 0/],
    ['a factor of 1', (it) => (it.bonus = { factor: 1 }), /sword-and-salve\.bonus\.factor is 1; it multiplies, so it is a number above 1/],
    ['a factor written as a share', (it) => (it.bonus = { flat: 2, factor: 0.1 }), /sword-and-salve\.bonus\.factor is 0\.1/],
    ['no kinds, listed empty', (it) => (it.kinds = []), /sword-and-salve\.kinds is empty/],
    ['a kind listed twice', (it) => (it.kinds = ['combat', 'combat']), /sword-and-salve\.kinds: "combat" is listed twice/],
  ])('with %s is refused, naming the Synergy', (_, change, problem) => {
    const files = withJson('synergies.json', (json) => change(salve(json)));

    expect(refusalOf(() => parse(files)).message).toMatch(problem);
  });

  test('with a kind that is not one of the six is refused, naming the field and the choices', () => {
    const files = withJson('synergies.json', (json) => {
      Object.assign(salve(json), { kinds: ['combat', 'naval'] });
    });

    expect(refusalOf(() => parse(files)).message).toMatch(
      /synergies\.json: sword-and-salve\.kinds is \["combat","naval"\]; expected a list, each one of combat, travel, social, arcane, stealth, lore/,
    );
  });

  test('with a field its row or bonus lacks is refused, naming it', () => {
    const row = withJson('synergies.json', (json) => void Object.assign(salve(json), { chance: 0.5 }));
    const bonus = withJson('synergies.json', (json) => void Object.assign(salve(json).bonus, { delta: 2 }));

    expect(refusalOf(() => parse(row)).message).toMatch(/synergies\.json: sword-and-salve\.chance is not a field of a Synergy/);
    expect(refusalOf(() => parse(bonus)).message).toMatch(/sword-and-salve\.bonus\.delta is not a field of a Synergy's bonus/);
  });

  test('with no requires or bonus is refused, and without kinds is accepted, for every kind', () => {
    const missing = withJson('synergies.json', (json) => {
      Reflect.deleteProperty(salve(json), 'requires');
      Reflect.deleteProperty(salve(json), 'bonus');
    });
    const everyKind = withJson('synergies.json', (json) => {
      Reflect.deleteProperty(salve(json), 'kinds');
    });

    const { message } = refusalOf(() => parse(missing));
    expect(message).toMatch(/synergies\.json: sword-and-salve\.requires is missing; expected a list of conditions on the Party/);
    expect(message).toMatch(/sword-and-salve\.bonus is missing/);
    expect(parse(everyKind).synergies['sword-and-salve']).not.toHaveProperty('kinds');
  });

  test('with its requirement as conditions on the Party, is read as written; and an empty list is refused', () => {
    const written = [['>=', ['count', ['where', 'party', ['class', 'warrior']]], 2]];
    const files = withJson('synergies.json', (json) => void (salve(json).requires = written as unknown as SynergyRow['requires']));
    const empty = withJson('synergies.json', (json) => void (salve(json).requires = [] as unknown as SynergyRow['requires']));

    expect(parse(files).synergies['sword-and-salve']?.requires).toEqual(written);
    expect(refusalOf(() => parse(empty)).message).toMatch(/synergies\.sword-and-salve\.requires is empty/);
  });

  // DL-192: the old form of a Synergy's requirement, a count for each Class and a list of Skills, is not read.
  test('with its requirement in the old form is refused, as no list of conditions on the Party', () => {
    const files = withJson('synergies.json', (json) => void Object.assign(salve(json), { requires: { classes: { warrior: 1 }, skills: ['tactics'] } }));

    expect(refusalOf(() => parse(files)).message).toContain(
      'synergies.json: sword-and-salve.requires is {"classes":{"warrior":1},"skills":["tactics"]}; expected a list of conditions on the Party',
    );
  });

  test('the file is required, and may hold none', () => {
    const files = realFiles();
    delete files['synergies.json'];

    expect(refusalOf(() => parse(files)).message).toContain('synergies.json: missing');
    expect(parse(withText('synergies.json', '{}')).synergies).toEqual({});
  });
});

// Every refusal of a Query names its path, each argument by its place in its array
// (DL-148 items 4 to 6). A Synergy's requirement, as conditions on the Party, holds each one here; an
// Encounter's Check is held in memory below.
describe('a Query', () => {
  /** The real files with Sword and salve requiring `condition` alone. */
  const requiring = (condition: unknown) =>
    withJson('synergies.json', (json) => void ((json['sword-and-salve'] as SynergyRow).requires = [condition] as SynergyRow['requires']));
  /** `count` of the Set `set`, at least 1: a condition that puts `set` at `requires.0.1.1`. */
  const counted = (set: unknown) => ['>=', ['count', set], 1];
  /** `max` of the Val `val` over the Party, at least 1: a condition that puts `val` at `requires.0.1.2`. */
  const maxOf = (val: unknown) => ['>=', ['max', 'party', val], 1];
  /** `count` of the Party filtered by `pred`: a condition that puts `pred` at `requires.0.1.1.2`. */
  const filtered = (pred: unknown) => counted(['where', 'party', pred]);
  const at = 'synergies\\.sword-and-salve\\.requires\\.0';
  const path = (rest: string) => new RegExp(`${at}${rest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  /** `n` operands under one `+`, and the condition holding them: 1 + 1 + n + 1 nodes. */
  const wide = (n: number) => ['>=', ['+', ...Array.from({ length: n }, () => 1)], 1];
  /** A condition `n` deep: a chain of `+` down to a number, `n - 1` deep, compared with 1. */
  const deep = (n: number): unknown => ['>=', Array.from({ length: n - 3 }).reduce<unknown>((inner) => ['+', inner], ['+', 1]), 1];

  test.each<[string, unknown, RegExp]>([
    // A node of the wrong type.
    ['a Val where a Num stands', ['>=', ['stat', 'strength'], 1], path('.1: "stat" makes a Val, where a Num is expected')],
    ['a Pred where a Num stands', ['>=', ['class', 'warrior'], 1], path('.1: "class" makes a Pred, where a Num is expected')],
    ['a Set where a Num stands', ['>=', 'party', 1], path('.1 is "party", a Set; a Num stands here')],
    ['a Num where a Set stands', counted(['count', 'party']), path('.1.1: "count" makes a Num, where a Set is expected')],
    ['a number where a Set stands', counted(3), path('.1.1 is 3; a number stands for a Val or a Num, not a Set')],
    ['a Num where a Val stands', maxOf(['count', 'party']), path('.1.2: "count" makes a Num, where a Val is expected')],
    ['a Val where a Pred stands', filtered(['level']), path('.1.1.2: "level" makes a Val, where a Pred is expected')],
    ['a Set where a Hero stands', ['>=', ['of', 'party', ['level']], 1], path('.1.1 is "party", a Set; a Hero stands here')],
    ['an operator no type has', ['>=', ['median', 'party', ['level']], 1], path('.1: "median" is not an operator of a Query')],
    ['a string where a condition stands', 'three Warriors', path(' is "three Warriors"; expected a condition on the Party, a list with its operator first')],
    ['a Num where a condition stands', ['count', 'party'], path(': "count" makes a Num, where a condition on the Party is expected')],
    // A node with the wrong number of arguments.
    ['a condition of one Num', ['>=', ['count', 'party']], path(': ">=" takes 2 arguments; it has 1')],
    ['`count` of nothing', ['>=', ['count'], 1], path('.1: "count" takes 1 argument; it has 0')],
    ['`top` without its Val', counted(['top', 'party', 2]), path('.1.1: "top" takes 3 arguments; it has 2')],
    ['`class` naming none', filtered(['class']), path('.1.1.2: "class" takes 1 argument or more; it has 0')],
    ['`has-skill` with two ratings', filtered(['has-skill', 'tactics', 1, 2]), path('.1.1.2: "has-skill" takes 1 or 2 arguments; it has 3')],
    ['`level` with an argument', maxOf(['level', 'warrior']), path('.1.2: "level" takes no arguments; it has 1')],
    ['`+` of nothing', ['>=', ['+'], 1], path('.1: "+" takes 1 argument or more; it has 0')],
    // A key content does not define.
    ['a Stat that does not exist', maxOf(['stat', 'strenght']), path('.1.2.1: "strenght" is not a Hero Stat')],
    ['a Guildmaster Stat', maxOf(['stat', 'judgement']), path('.1.2.1: "judgement" is not a Hero Stat')],
    ['a weighted Stat that does not exist', maxOf(['weighted', [['strength', 1], ['luck', 1]]]), path('.1.2.1.1.0: "luck" is not a Hero Stat')],
    ['a Skill that does not exist', maxOf(['skill', 'axemanship']), path('.1.2.1: "axemanship" is not a Skill')],
    ['a Class that does not exist', filtered(['class', 'warrior', 'paladin']), path('.1.1.2.2: "paladin" is not a Class')],
    ['a Guild Background', filtered(['background', 'old-charter']), path('.1.1.2.1: "old-charter" is not a Hero Background')],
    ['a Guildmaster Trait', filtered(['has-trait', 'thrifty']), path('.1.1.2.1: "thrifty" is not a Hero Trait')],
    ['a sex that is not one', filtered(['sex', 'other']), path('.1.1.2.1: "other" is not a sex: female or male')],
    // `top`, `bottom`, `has-skill` and `ranked`'s numbers.
    ['`top` of 0', counted(['top', 'party', 0, ['level']]), path('.1.1.2 is 0; top\'s n is a whole number from 1')],
    ['`bottom` of 1.5', counted(['bottom', 'party', 1.5, ['level']]), path('.1.1.2 is 1.5; bottom\'s n is a whole number from 1')],
    ['`top` of a word', counted(['top', 'party', 'two', ['level']]), path('.1.1.2 is "two"; top\'s n is a whole number from 1')],
    ['`has-skill` at 0', filtered(['has-skill', 'tactics', 0]), path('.1.1.2.2 is 0; has-skill\'s least rating is a whole number from 1')],
    ['`ranked` with a negative weight', ['>=', ['ranked', 'party', ['level'], [1, -1]], 1], path('.1.3.1 is -1; a weight is a finite number of 0 or more')],
    ['`ranked` with no weights', ['>=', ['ranked', 'party', ['level'], []], 1], path('.1.3 is []; ranked\'s weights are a list of one or more')],
    // Sex: in a filter only, and never counted (DL-148 item 6).
    ['`sex` as a Num', ['>=', ['sex', 'female'], 1], path('.1: ["sex", …] stands only as the Pred of a where filter')],
    ['`sex` as a Val', maxOf(['sex', 'female']), path('.1.2: ["sex", …] stands only as the Pred of a where filter')],
    ['`sex` compared, within a filter', filtered(['>=', ['sex', 'male'], 1]), path('.1.1.2.1: ["sex", …] stands only as the Pred of a where filter')],
    ['a Set filtered by Sex, counted', filtered(['sex', 'female']), path('.1: a Set filtered by Sex is counted; Sex decides who takes part, never a number')],
    ['a Set filtered by Sex within another, counted', counted(['top', ['where', 'party', ['and', ['class', 'mage'], ['not', ['sex', 'male']]]], 2, ['level']]), path('.1: a Set filtered by Sex is counted')],
    ['a Set filtered by Sex, summed as ones', ['>=', ['sum', ['where', 'party', ['sex', 'male']], 1], 1], path('.1: a Set filtered by Sex is counted')],
    ['the Hero of a Set filtered by Sex, read as a number alone', ['>=', ['of', ['best', ['where', 'party', ['sex', 'male']], ['level']], 1], 1], path('.1: a Set filtered by Sex is counted')],
    // A requirement is a gate, so any reading of Sex in it is a value.
    ['Sex in a requirement, in a sum of a Stat', ['>=', ['sum', ['where', 'party', ['sex', 'female']], ['stat', 'strength']], 10], path('.1.1.2: ["sex", …] stands in no Synergy\'s requirement')],
    ['Sex in a requirement, the max of a Level', ['>', ['max', ['where', 'party', ['sex', 'female']], ['level']], 0], path('.1.1.2: ["sex", …] stands in no Synergy\'s requirement')],
    ['Sex in a requirement, a constant disguised as a sum', ['>', ['sum', ['where', 'party', ['sex', 'female']], ['+', 1, ['*', 0, ['level']]]], 0], path('.1.1.2: ["sex", …] stands in no Synergy\'s requirement')],
    ['Sex in a requirement, the best Hero\'s Level', ['>', ['of', ['best', ['where', 'party', ['sex', 'female']], ['level']], ['level']], 0], path('.1.1.1.2: ["sex", …] stands in no Synergy\'s requirement')],
    // Size.
    ['more than 64 nodes', wide(62), path(' has 65 nodes; a Query has at most 64')],
    ['deeper than 12', deep(13), path(' is 13 deep; a Query is at most 12 deep')],
  ])('with %s is refused, naming its path', (_, condition, problem) => {
    expect(refusalOf(() => parse(requiring(condition))).message).toMatch(problem);
  });

  test.each<[string, unknown]>([
    ['64 nodes', wide(61)],
    ['12 deep', deep(12)],
    ['every type in one', ['>=', ['greatest', ['of', ['worst', ['top', 'party', 2, ['weighted', [['dexterity', 1]]]], ['age']], ['*', ['morale'], 0.1]], ['ranked', ['bottom', 'party', 3, ['skill', 'stealth']], ['-', ['level'], 1], [1, 0.5]]], ['least', 1, 2]]],
  ])('with %s is accepted', (_, condition) => {
    expect(parse(requiring(condition)).synergies['sword-and-salve']?.requires).toEqual([condition]);
  });

  test('held in memory, an Encounter\'s Check is held as a Synergy\'s requirement is, and a number or weight that is not finite is refused', () => {
    const content = structuredClone(shipped);
    const ambush = content.encounters['ambush-on-the-road'] as Encounter;
    const [first] = ambush.checks as [Encounter['checks'][number]];
    const reeve = content.encounters['a-hostile-reeve'] as Encounter;
    const steward = content.encounters['the-patrons-steward'] as Encounter;
    Object.assign(first, { score: ['+', ['ranked', 'party', ['stat', 'strength'], [1, Number.POSITIVE_INFINITY, Number.NaN]], Number.NEGATIVE_INFINITY, ['stat', 'wits']] });
    reeve.checks = [];
    const stewardCheck = steward.checks[0] as Encounter['checks'][number];
    steward.checks = [stewardCheck, { ...stewardCheck, key: 'Second', name: ' ' }, ...['third', 'fourth', 'fifth'].map((key) => ({ ...stewardCheck, key }))];

    const { message } = refusalOf(() => validateContent(content));

    expect(message).toMatch(/encounters\.ambush-on-the-road\.checks\.0\.score\.1\.3\.1 is Infinity; a weight is a finite number of 0 or more/);
    expect(message).toMatch(/encounters\.ambush-on-the-road\.checks\.0\.score\.1\.3\.2 is NaN; a weight is a finite number of 0 or more/);
    expect(message).toMatch(/encounters\.ambush-on-the-road\.checks\.0\.score\.2 is -Infinity; a number in a Query is finite/);
    expect(message).toMatch(/encounters\.ambush-on-the-road\.checks\.0\.score\.3: "stat" makes a Val, where a Num is expected/);
    expect(message).toMatch(/encounters\.a-hostile-reeve\.checks is empty: an Encounter is resolved by a Check/);
    expect(message).toMatch(/encounters\.the-patrons-steward\.checks has 5; an Encounter has at most 4/);
    expect(message).toMatch(/encounters\.the-patrons-steward\.checks\.1\.key: "Second" is not kebab-case/);
    expect(message).toMatch(/encounters\.the-patrons-steward\.checks\.1\.name is empty/);
  });

  // In a Check's score, a Set filtered by Sex may be read only by a Val
  // that reads a Hero; one that is constant, or reads a Hero only times a literal 0, counts the Set.
  test.each<[string, unknown, RegExp | null]>([
    ['a constant disguised with × 0', ['sum', ['where', 'party', ['sex', 'female']], ['+', 1, ['*', 0, ['level']]]], /score: a Set filtered by Sex is counted/],
    ['a weighted read of no weight', ['sum', ['where', 'party', ['sex', 'female']], ['weighted', [['strength', 0]]]], /score: a Set filtered by Sex is counted/],
    ['a × 0 nested in a difference', ['avg', ['where', 'party', ['sex', 'male']], ['-', 2, ['*', ['level'], 0]]], /score: a Set filtered by Sex is counted/],
    ['the best Hero read times 0', ['of', ['best', ['where', 'party', ['sex', 'male']], ['level']], ['*', 0, ['stat', 'wits']]], /score: a Set filtered by Sex is counted/],
    ['a Stat summed', ['sum', ['where', 'party', ['sex', 'female']], ['stat', 'strength']], null],
    ['the best Level', ['max', ['where', 'party', ['sex', 'female']], ['level']], null],
  ])('held in memory, a Check scoring a Set filtered by Sex by %s is refused or accepted as the rule says', (_, score, problem) => {
    const content = structuredClone(shipped);
    Object.assign((content.encounters['ambush-on-the-road'] as Encounter).checks[0] ?? {}, { score });

    if (problem === null) expect(validateContent(content).encounters['ambush-on-the-road']?.checks[0]?.score).toEqual(score);
    else expect(refusalOf(() => validateContent(content)).message).toMatch(problem);
  });

  test("held in memory, a Synergy's requirement that is not a list is refused", () => {
    const content = structuredClone(shipped);
    Object.assign(content.synergies['sword-and-salve'] ?? {}, { requires: { classes: { warrior: 1 } } });

    expect(refusalOf(() => validateContent(content)).message).toMatch(
      /synergies\.sword-and-salve\.requires is \{"classes":\{"warrior":1\}\}; expected a list of conditions on the Party/,
    );
  });
});

describe('validateContent on a set built in memory', () => {
  test('refuses a Synergy on a kind of Encounter that is not one, which the parser cannot see in memory', () => {
    const content = structuredClone(shipped);
    const salve = content.synergies['sword-and-salve'];
    if (salve) Object.assign(salve, { kinds: ['naval'] });

    expect(refusalOf(() => validateContent(content)).message).toMatch(/synergies\.sword-and-salve\.kinds: "naval" is not a kind of Encounter/);
  });

});
