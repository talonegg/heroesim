import { describe, expect, test } from 'vitest';
import type { NumQuery, PredQuery, QueryComparison } from '../../content-types.js';
import type { QueryContent, QueryMember, QueryParty } from '../query.js';
import { holds, is, operators } from './operators.js';

// v1.1.6-S10 (DL-186 item 6): the five comparisons share one row of each type, a Pred's of two Vals and
// a condition's of two Nums; each comparison is held here on a number less than, equal to and greater
// than another, which query.test.ts reads only in part. Every other row's evaluation is held by
// query.test.ts, as it was before the table.

const content: QueryContent = { skills: {}, classes: {}, backgrounds: {}, heroTraits: {} };
const party: QueryParty = { members: [], content };
/** A member no Val of a number reads. */
const anyone = {} as QueryMember;

const comparisons: [QueryComparison, [less: boolean, equal: boolean, greater: boolean]][] = [
  ['>=', [false, true, true]],
  ['>', [false, false, true]],
  ['<', [true, false, false]],
  ['<=', [true, true, false]],
  ['=', [false, true, false]],
];

describe.each(comparisons)('"%s"', (comparison, [less, equal, greater]) => {
  test('in a Pred, compares two Vals of the current Hero', () => {
    expect([1, 2, 3].map((left) => is([comparison, left, 2] as PredQuery, anyone, content))).toEqual([less, equal, greater]);
  });

  test('in a condition on the Party, compares two Nums', () => {
    expect([1, 2, 3].map((left) => holds([comparison, left, 2] as [QueryComparison, NumQuery, NumQuery], party))).toEqual([less, equal, greater]);
  });

  test('is one row in each, a Pred and a condition', () => {
    expect(operators.pred[comparison]).toBe(operators.pred['>=']);
    expect(operators.condition[comparison]).toBe(operators.condition['>=']);
  });
});

test('an operator of another type, or of none, is not a row of the type: the evaluator throws on it', () => {
  expect(() => holds(['count', 'party'] as unknown as [QueryComparison, NumQuery, NumQuery], party)).toThrow(/is not a condition on the Party Query/);
  expect(() => is(['constructor'] as unknown as PredQuery, anyone, content)).toThrow(/is not a Pred Query/);
});
