import { describe, expect, test } from 'vitest';
import type { NumQuery } from '../content-types.js';
import { describeQuery, statsIn, type QueryAccount, type SetAccount, type ValAccount } from './describe.js';

// DL-156: the typed account of a Query, for the front ends to word. Every operator of
// every type (content-types.ts) is accounted for, through a Num that holds it.

const strength: ValAccount = { kind: 'stat', statKey: 'strength' };
const party: SetAccount = { kind: 'party' };
const warriors: SetAccount = { kind: 'where', of: party, filter: { kind: 'class', classKeys: ['warrior'] } };

/** A Num reading `val` as the Party's sum, so that a Val, and a Pred in its Set, can be accounted for. */
const summed = (set: unknown, val: unknown): NumQuery => ['sum', set, val] as NumQuery;

describe('describeQuery', () => {
  test.each<[string, NumQuery, QueryAccount]>([
    ['a number', 12, { kind: 'number', value: 12 }],
    ['sum', ['sum', 'party', ['stat', 'strength']], { kind: 'aggregate', aggregate: 'sum', of: party, value: strength }],
    ['avg', ['avg', 'party', ['stat', 'strength']], { kind: 'aggregate', aggregate: 'avg', of: party, value: strength }],
    ['max', ['max', 'party', ['stat', 'strength']], { kind: 'aggregate', aggregate: 'max', of: party, value: strength }],
    ['min', ['min', 'party', ['stat', 'strength']], { kind: 'aggregate', aggregate: 'min', of: party, value: strength }],
    ['count', ['count', 'party'], { kind: 'count', of: party }],
    ['ranked', ['ranked', 'party', ['stat', 'strength'], [1, 0.5]], { kind: 'ranked', of: party, value: strength, weights: [1, 0.5] }],
    [
      'of best',
      ['of', ['best', ['where', 'party', ['class', 'warrior']], ['stat', 'strength']], ['stat', 'strength']],
      { kind: 'hero', hero: { kind: 'best', of: warriors, by: strength }, value: strength },
    ],
    ['of worst', ['of', ['worst', 'party', ['stat', 'strength']], ['level']], { kind: 'hero', hero: { kind: 'worst', of: party, by: strength }, value: { kind: 'level' } }],
    ...(['+', '-', '*', 'least', 'greatest'] as const).map((operator): [string, NumQuery, QueryAccount] => [
      `the Nums' ${operator}`,
      [operator, ['count', 'party'], 2] as NumQuery,
      { kind: 'arithmetic', operator, operands: [{ kind: 'count', of: party }, { kind: 'number', value: 2 }] },
    ]),
  ])('accounts for %s', (_, query, account) => {
    expect(describeQuery(query)).toEqual(account);
  });

  test.each<[string, unknown, ValAccount]>([
    ['a number', 3, { kind: 'number', value: 3 }],
    ['stat', ['stat', 'wits'], { kind: 'stat', statKey: 'wits' }],
    ['skill', ['skill', 'stealth'], { kind: 'skill', skillKey: 'stealth' }],
    ['level', ['level'], { kind: 'level' }],
    ['morale', ['morale'], { kind: 'morale' }],
    ['age', ['age'], { kind: 'age' }],
    [
      'weighted',
      ['weighted', [['wits', 0.6], ['perception', 0.4]]],
      { kind: 'weighted', stats: [{ statKey: 'wits', weight: 0.6 }, { statKey: 'perception', weight: 0.4 }] },
    ],
    ...(['+', '-', '*'] as const).map((operator): [string, unknown, ValAccount] => [
      `the Vals' ${operator}`,
      [operator, ['stat', 'strength'], 2],
      { kind: 'arithmetic', operator, operands: [strength, { kind: 'number', value: 2 }] },
    ]),
  ])('accounts for the Val %s, with its Stats and their weights', (_, val, account) => {
    expect(describeQuery(summed('party', val))).toEqual({ kind: 'aggregate', aggregate: 'sum', of: party, value: account });
  });

  test.each<[string, unknown, unknown]>([
    ['top', ['top', 'party', 2, ['stat', 'strength']], { kind: 'top', of: party, count: 2, by: strength }],
    ['bottom', ['bottom', 'party', 1, ['stat', 'strength']], { kind: 'bottom', of: party, count: 1, by: strength }],
    ['class', ['where', 'party', ['class', 'mage', 'healer']], { kind: 'where', of: party, filter: { kind: 'class', classKeys: ['mage', 'healer'] } }],
    ['background', ['where', 'party', ['background', 'farm-born']], { kind: 'where', of: party, filter: { kind: 'background', backgroundKeys: ['farm-born'] } }],
    ['sex', ['where', 'party', ['sex', 'female']], { kind: 'where', of: party, filter: { kind: 'sex', sex: 'female' } }],
    ['has-skill', ['where', 'party', ['has-skill', 'stealth']], { kind: 'where', of: party, filter: { kind: 'has-skill', skillKey: 'stealth', atLeast: 1 } }],
    ['has-skill at a rating', ['where', 'party', ['has-skill', 'stealth', 3]], { kind: 'where', of: party, filter: { kind: 'has-skill', skillKey: 'stealth', atLeast: 3 } }],
    ['has-trait', ['where', 'party', ['has-trait', 'scarred']], { kind: 'where', of: party, filter: { kind: 'has-trait', traitKey: 'scarred' } }],
    ['hurt', ['where', 'party', ['hurt']], { kind: 'where', of: party, filter: { kind: 'hurt' } }],
    ...(['>=', '>', '<', '<=', '='] as const).map((comparison): [string, unknown, unknown] => [
      comparison,
      ['where', 'party', [comparison, ['stat', 'strength'], 12]],
      { kind: 'where', of: party, filter: { kind: 'compare', comparison, left: strength, right: { kind: 'number', value: 12 } } },
    ]),
    ...(['and', 'or'] as const).map((kind): [string, unknown, unknown] => [
      kind,
      ['where', 'party', [kind, ['hurt'], ['class', 'warrior']]],
      { kind: 'where', of: party, filter: { kind, operands: [{ kind: 'hurt' }, { kind: 'class', classKeys: ['warrior'] }] } },
    ]),
    ['not', ['where', 'party', ['not', ['hurt']]], { kind: 'where', of: party, filter: { kind: 'not', operand: { kind: 'hurt' } } }],
  ])('accounts for the Set or Pred %s', (_, set, account) => {
    expect(describeQuery(['count', set] as NumQuery)).toEqual({ kind: 'count', of: account });
  });

  test('accounts for a nested Query, the old form of an Encounter among them, whole', () => {
    const oldForm: NumQuery = ['+', ['*', 0.5, ['sum', 'party', ['stat', 'strength']]], ['*', 0.5, ['max', 'party', ['stat', 'wits']]]];
    expect(describeQuery(oldForm)).toEqual({
      kind: 'arithmetic',
      operator: '+',
      operands: [
        { kind: 'arithmetic', operator: '*', operands: [{ kind: 'number', value: 0.5 }, { kind: 'aggregate', aggregate: 'sum', of: party, value: strength }] },
        { kind: 'arithmetic', operator: '*', operands: [{ kind: 'number', value: 0.5 }, { kind: 'aggregate', aggregate: 'max', of: party, value: { kind: 'stat', statKey: 'wits' } }] },
      ],
    });
  });

  // The Stats a Check reads, for the Party builder's rows.
  test('statsIn names every Stat an account reads, once, in the order it names them: values, weightings, rankings, choices and filters', () => {
    const query: NumQuery = [
      '+',
      ['sum', ['where', 'party', ['and', ['>=', ['stat', 'strength'], 12], ['not', ['<', ['level'], 2]]]], ['weighted', [['wits', 0.5], ['perception', 0.5]]]],
      ['of', ['worst', ['top', 'party', 2, ['stat', 'dexterity']], ['-', ['stat', 'courage'], 1]], ['stat', 'wits']],
      ['ranked', 'party', ['stat', 'spirit'], [1, 0.5]],
      ['count', ['where', 'party', ['class', 'mage']]],
      3,
    ];
    expect(statsIn(describeQuery(query))).toEqual(['strength', 'wits', 'perception', 'dexterity', 'courage', 'spirit']);
    expect(statsIn(describeQuery(['count', 'party']))).toEqual([]);
  });

  test('throws on an operator no type has', () => {
    expect(() => describeQuery(['median', 'party', ['stat', 'strength']] as unknown as NumQuery)).toThrow(RangeError);
    expect(() => describeQuery(['count', ['every', 'party']] as unknown as NumQuery)).toThrow(RangeError);
    expect(() => describeQuery(['of', ['middle', 'party', ['level']], ['level']] as unknown as NumQuery)).toThrow(RangeError);
    expect(() => describeQuery(['sum', 'party', ['luck']] as unknown as NumQuery)).toThrow(RangeError);
    expect(() => describeQuery(['count', ['where', 'party', ['lucky']]] as unknown as NumQuery)).toThrow(RangeError);
  });
});
