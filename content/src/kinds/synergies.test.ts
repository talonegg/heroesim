import { type Encounter } from '@heroesim/engine/content';
import { describe, expect, test } from 'vitest';
import { validateContent } from '../index.js';
import { shipped, parse, withJson, withText, refusalOf, type Files, type SynergyRow } from './content.test-support.js';

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

  test('the file may hold none', () => {
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
  const at = 'synergies\\.sword-and-salve\\.requires\\.0';
  const path = (rest: string) => new RegExp(`${at}${rest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

  // The parse path reads a requirement through the Query's rules, which the refusals' own tests
  // (query-refusals.test.ts) hold word for word: one refused and one accepted show the wiring.
  test('with a Val where a Num stands is refused, naming its path', () => {
    const condition = ['>=', ['stat', 'strength'], 1];

    expect(refusalOf(() => parse(requiring(condition))).message).toMatch(path('.1: "stat" makes a Val, where a Num is expected'));
  });

  test('with every type in one is accepted', () => {
    const condition = ['>=', ['greatest', ['of', ['worst', ['top', 'party', 2, ['weighted', [['dexterity', 1]]]], ['age']], ['*', ['morale'], 0.1]], ['ranked', ['bottom', 'party', 3, ['skill', 'stealth']], ['-', ['level'], 1], [1, 0.5]]], ['least', 1, 2]];

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
