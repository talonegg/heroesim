import { describe, expect, test } from 'vitest';
import { operators, type QueryType } from './operators.js';
import { queryProblems, type QueryKeys, type QueryPlace } from './problems.js';

// DL-186 item 6: each operator's row of the table, read through `queryProblems` as
// content's checks read it. Its signature is written out here, apart from the table, and each operator
// is held to it: a node of sound arguments accepted, one short or one over refused in the words of
// its number, and each argument of another kind refused at its place. Content's own test
// (`content/src/query-refusals.test.ts`) holds every refusal's words.

const keys: QueryKeys = {
  heroStats: new Set(['strength', 'wits']),
  skills: new Set(['tactics']),
  classes: new Set(['warrior', 'mage']),
  heroBackgrounds: new Set(['farm-born']),
  heroTraits: new Set(['scarred']),
};

/** Each operator's arguments by kind, as content-types.ts writes them: `kind?` may be left out, `kind...` is one or more. */
const signatures: Readonly<Record<QueryType, Readonly<Record<string, readonly string[]>>>> = {
  set: { where: ['set', 'pred'], top: ['set', 'heroes', 'val'], bottom: ['set', 'heroes', 'val'] },
  hero: { best: ['set', 'val'], worst: ['set', 'val'] },
  val: {
    stat: ['stat'],
    skill: ['skill'],
    level: [],
    morale: [],
    age: [],
    weighted: ['pairs'],
    '+': ['val...'],
    '-': ['val', 'val'],
    '*': ['val...'],
  },
  pred: {
    class: ['class...'],
    background: ['background...'],
    sex: ['sex'],
    'has-skill': ['skill', 'rating?'],
    'has-trait': ['trait'],
    hurt: [],
    '>=': ['val', 'val'],
    '>': ['val', 'val'],
    '<': ['val', 'val'],
    '<=': ['val', 'val'],
    '=': ['val', 'val'],
    and: ['pred...'],
    or: ['pred...'],
    not: ['pred'],
  },
  num: {
    sum: ['set', 'val'],
    avg: ['set', 'val'],
    max: ['set', 'val'],
    min: ['set', 'val'],
    count: ['set'],
    ranked: ['set', 'val', 'weights'],
    of: ['hero', 'val'],
    '+': ['num...'],
    '-': ['num', 'num'],
    '*': ['num...'],
    least: ['num...'],
    greatest: ['num...'],
  },
  condition: { '>=': ['num', 'num'], '>': ['num', 'num'], '<': ['num', 'num'], '<=': ['num', 'num'], '=': ['num', 'num'] },
};

/**
 * A sound argument of each kind; and one of another kind that stands in its place, with the words it
 * is refused in after its path, `operator` the operator it is an argument of.
 */
const kinds: Readonly<Record<string, { sound: unknown; wrong: unknown; refusal: (operator: string) => string }>> = {
  set: { sound: 'party', wrong: 1, refusal: () => ' is 1; a number stands for a Val or a Num, not a Set' },
  hero: { sound: ['best', 'party', ['level']], wrong: 'party', refusal: () => ' is "party", a Set; a Hero stands here' },
  val: { sound: ['level'], wrong: 'party', refusal: () => ' is "party", a Set; a Val stands here' },
  pred: { sound: ['hurt'], wrong: 1, refusal: () => ' is 1; a number stands for a Val or a Num, not a Pred' },
  num: { sound: 1, wrong: 'party', refusal: () => ' is "party", a Set; a Num stands here' },
  stat: { sound: 'strength', wrong: 'luck', refusal: () => ': "luck" is not a Hero Stat' },
  skill: { sound: 'tactics', wrong: 'luck', refusal: () => ': "luck" is not a Skill' },
  class: { sound: 'warrior', wrong: 'luck', refusal: () => ': "luck" is not a Class' },
  background: { sound: 'farm-born', wrong: 'luck', refusal: () => ': "luck" is not a Hero Background' },
  trait: { sound: 'scarred', wrong: 'luck', refusal: () => ': "luck" is not a Hero Trait' },
  sex: { sound: 'female', wrong: 'luck', refusal: () => ': "luck" is not a sex: female or male' },
  heroes: { sound: 2, wrong: 0, refusal: (operator) => ` is 0; ${operator}'s n is a whole number from 1` },
  rating: { sound: 2, wrong: 0, refusal: () => " is 0; has-skill's least rating is a whole number from 1" },
  weights: { sound: [1, 0.5], wrong: [], refusal: () => " is []; ranked's weights are a list of one or more" },
  pairs: { sound: [['strength', 1]], wrong: [], refusal: () => " is []; weighted's Stats are a list of one or more [Stat, weight] pairs" },
};

/**
 * Where a node of each type is put to be checked: in a place of its own type, or as the one argument
 * of a node that is, read without form so that only its type and arguments are held; and the path of
 * the node within the Query.
 */
const holders: Readonly<Record<QueryType, { place: QueryPlace; hold: (node: unknown) => unknown; at: string }>> = {
  set: { place: 'among', hold: (node) => node, at: '' },
  hero: { place: 'raw score', hold: (node) => ['of', node, ['level']], at: '.1' },
  val: { place: 'raw score', hold: (node) => ['sum', 'party', node], at: '.2' },
  pred: { place: 'raw score', hold: (node) => ['sum', ['where', 'party', node], ['level']], at: '.1.2' },
  num: { place: 'raw score', hold: (node) => node, at: '' },
  condition: { place: 'requirement', hold: (node) => node, at: '' },
};

const where = 'q';

/** The problems `queryProblems` finds with `node`, a Query of `type`, where it is held. */
function problemsWith(type: QueryType, node: unknown): string[] {
  const { place, hold } = holders[type];
  return queryProblems(hold(node), place, keys, where);
}

/** `signature`'s kinds, and how many arguments it takes at least and at most. */
function read(signature: readonly string[]): { args: string[]; least: number; most: number } {
  const args = signature.map((slot) => slot.replace(/\?$|\.\.\.$/, ''));
  const rest = signature.some((slot) => slot.endsWith('...'));
  const optional = signature.filter((slot) => slot.endsWith('?')).length;
  return { args, least: signature.length - optional, most: rest ? Infinity : signature.length };
}

/** How many arguments an operator takes, in the checker's words. */
function inWords(least: number, most: number): string {
  const count = (n: number): string => (n === 0 ? 'no arguments' : n === 1 ? '1 argument' : `${n} arguments`);
  if (most === Infinity) return `${count(least)} or more`;
  return least === most ? count(least) : `${least} or ${most} arguments`;
}

const rows = (Object.keys(signatures) as QueryType[]).flatMap((type) =>
  Object.entries(signatures[type]).map(([operator, signature]): [QueryType, string, readonly string[]] => [type, operator, signature]),
);

describe('the table', () => {
  test('has a row for each operator of each type, and no other, the types in the order the checker names them', () => {
    expect(Object.keys(operators)).toEqual(Object.keys(signatures));
    for (const type of Object.keys(signatures) as QueryType[]) expect(Object.keys(operators[type]).sort()).toEqual(Object.keys(signatures[type]).sort());
  });
});

describe.each(rows)('the %s operator "%s"', (type, operator, signature) => {
  const { args, least, most } = read(signature);
  const sound = (count: number): unknown[] => [operator, ...Array.from({ length: count }, (_, index) => kinds[args[Math.min(index, args.length - 1)] ?? '']?.sound)];
  const { at } = holders[type];

  test(`takes ${signature.length === 0 ? 'no arguments' : signature.join(', ')}`, () => {
    expect(problemsWith(type, sound(least))).toEqual([]);
    if (most !== least) expect(problemsWith(type, sound(Math.min(most, least + 2)))).toEqual([]);
  });

  test('is refused with one argument short or one over, in the words of its number', () => {
    const words = `"${operator}" takes ${inWords(least, most)}`;
    if (least > 0) {
      expect(problemsWith(type, sound(Math.max(0, least - 1)))).toEqual([`${where}${at}: ${words}; it has ${Math.max(0, least - 1)}`]);
    }
    if (most !== Infinity) expect(problemsWith(type, sound(most + 1))).toEqual([`${where}${at}: ${words}; it has ${most + 1}`]);
  });

  test.each(args.map((kind, index) => [index + 1, kind] as const))('is refused with argument %i, a %s, of another kind, at its place', (place, kind) => {
    const node = sound(Math.max(least, place));
    node[place] = kinds[kind]?.wrong;
    expect(problemsWith(type, node)).toEqual([`${where}${at}.${place}${kinds[kind]?.refusal(operator) ?? ''}`]);
  });
});

describe('a place', () => {
  const subtracted = ['-', 40, ['sum', 'party', ['stat', 'wits']]];
  const bySex = ['where', 'party', ['sex', 'female']];

  test("a Check's score turns no Stat a Hero adds against itself; a raw Check's may", () => {
    expect(queryProblems(subtracted, 'score', keys, where)).toEqual([
      'q.2: "-" subtracts a Stat a Hero adds; form would then raise the score of a hurt or low-spirited Hero',
    ]);
    expect(queryProblems(subtracted, 'raw score', keys, where)).toEqual([]);
  });

  test("a Synergy's requirement is a condition on the Party, and Sex stands nowhere in it", () => {
    expect(queryProblems(['>=', subtracted, 1], 'requirement', keys, where)).toEqual([]);
    expect(queryProblems(subtracted, 'requirement', keys, where)).toEqual(['q: "-" makes a Val or a Num, where a condition on the Party is expected']);
    expect(queryProblems(['>=', ['sum', bySex, ['level']], 1], 'requirement', keys, where)).toEqual([
      'q.1.1.2: ["sex", …] stands in no Synergy\'s requirement: a requirement is a condition on the Party, and Sex decides only who takes part in a Check (DL-148 item 6)',
    ]);
  });

  test('an among is a Set, which Sex may filter', () => {
    expect(queryProblems(bySex, 'among', keys, where)).toEqual([]);
    expect(queryProblems(['count', bySex], 'among', keys, where)).toEqual(['q: "count" makes a Num, where a Set is expected']);
  });
});
