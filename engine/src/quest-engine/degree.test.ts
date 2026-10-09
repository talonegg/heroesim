import { describe, expect, test } from 'vitest';
import { defaultConfig } from '../config.js';
import { degrees, type Degree, type PassFormula } from '../content-types.js';
import { degreeOf, passDegree, passOf, succeeded } from './degree.js';

// Degrees (DL-148 items 7 and 8). A Check's from its roll against its target; an
// Encounter's from its Checks' by its pass formula.

/** Every list of `n` Degrees, the first Check's varying slowest. */
function combinations(n: number): Degree[][] {
  if (n === 0) return [[]];
  return degrees.flatMap((degree) => combinations(n - 1).map((rest) => [degree, ...rest]));
}

/** `degree`'s place from the worst. */
const rank = (degree: Degree): number => degrees.indexOf(degree);

describe('degreeOf', () => {
  const config = { checkDegrees: { triumph: 1.25, success: 1, setback: 0.75 } };

  test('reads the roll against the target: a Triumph from 1.25 times it, a Success from it, a Setback from 0.75 times it, else a Failure', () => {
    expect([200, 125, 124.99, 100, 99.99, 75, 74.99, 0].map((roll) => degreeOf(roll, 100, config))).toEqual([
      'triumph',
      'triumph',
      'success',
      'success',
      'setback',
      'setback',
      'failure',
      'failure',
    ]);
  });

  test('a Success is exactly a roll that reaches the target, as the Check succeeded before', () => {
    for (const [roll, target] of [[0.30000000000000004, 0.3], [0.3, 0.30000000000000004], [16, 16], [1e-9, 1e-9]] as const) {
      expect(succeeded(degreeOf(roll, target, config)), `${roll} against ${target}`).toBe(roll >= target);
    }
  });

  // The Triumph at 1.35 (DL-166).
  test('reads checkDegrees, whose defaults are 1.35, 1 and 0.75', () => {
    expect(defaultConfig.checkDegrees).toEqual({ triumph: 1.35, success: 1, setback: 0.75 });
    const strict = { checkDegrees: { triumph: 2, success: 1.1, setback: 1 } };
    expect([150, 105, 100].map((roll) => degreeOf(roll, 100, strict))).toEqual(['success', 'setback', 'setback']);
    expect(degreeOf(99, 100, strict)).toBe('failure');
  });

  test('a Success and a Triumph succeed; a Setback and a Failure do not', () => {
    expect(degrees.map(succeeded)).toEqual([false, false, true, true]);
  });
});

describe('passDegree', () => {
  // The first acceptance box.
  test('`(a and b) or c` takes the Degree its formula says for each of the 64 combinations of three Checks\' Degrees', () => {
    const pass: PassFormula = ['or', ['and', 'a', 'b'], 'c'];
    const all = combinations(3);
    expect(all).toHaveLength(64);
    for (const [a, b, c] of all as [Degree, Degree, Degree][]) {
      const both = rank(a) <= rank(b) ? { degree: a, decidedBy: 'a' } : { degree: b, decidedBy: 'b' };
      const expected = rank(c) > rank(both.degree) ? { degree: c, decidedBy: 'c' } : both;
      expect(passDegree(pass, { a, b, c }), `${a}, ${b}, ${c}`).toEqual(expected);
    }
  });

  test('`and` takes the worst, `or` the best, and `at-least` k the k-th best, over every combination of four', () => {
    for (const listed of combinations(4)) {
      const byKey = { a: listed[0], b: listed[1], c: listed[2], d: listed[3] } as Record<string, Degree>;
      const best = [...listed].sort((x, y) => rank(y) - rank(x));
      expect(passDegree(['and', 'a', 'b', 'c', 'd'], byKey).degree).toBe(best[3]);
      expect(passDegree(['or', 'a', 'b', 'c', 'd'], byKey).degree).toBe(best[0]);
      for (const k of [1, 2, 3, 4]) expect(passDegree(['at-least', k, 'a', 'b', 'c', 'd'], byKey).degree).toBe(best[k - 1]);
    }
  });

  test('the Check that decides is the one whose Degree the Encounter takes, the first listed on a tie', () => {
    const byKey: Record<string, Degree> = { a: 'success', b: 'failure', c: 'success', d: 'triumph' };
    expect(passDegree(['and', 'a', 'b', 'c', 'd'], byKey)).toEqual({ degree: 'failure', decidedBy: 'b' });
    expect(passDegree(['or', 'a', 'b', 'c', 'd'], byKey)).toEqual({ degree: 'triumph', decidedBy: 'd' });
    expect(passDegree(['at-least', 2, 'a', 'b', 'c', 'd'], byKey)).toEqual({ degree: 'success', decidedBy: 'a' });
    expect(passDegree(['at-least', 3, 'd', 'c', 'b', 'a'], byKey)).toEqual({ degree: 'success', decidedBy: 'c' });
    expect(passDegree(['and', 'c', 'a'], byKey)).toEqual({ degree: 'success', decidedBy: 'c' });
    expect(passDegree('d', byKey)).toEqual({ degree: 'triumph', decidedBy: 'd' });
  });

  test('throws on a Check not rolled, or an operator no formula has: content validation refuses both', () => {
    expect(() => passDegree(['and', 'a', 'z'], { a: 'success' })).toThrow(/"z"/);
    expect(() => passDegree(['xor', 'a', 'b'] as unknown as PassFormula, { a: 'success', b: 'failure' })).toThrow(/"xor"/);
  });
});

describe('passOf', () => {
  const check = (key: string) => ({ key, name: key, score: 1, skills: [], difficultyFactor: 1 });

  test("is the Encounter's pass, or its one Check's key when it has none", () => {
    expect(passOf({ key: 'e', checks: [check('only')] })).toBe('only');
    expect(passOf({ key: 'e', checks: [check('a'), check('b')], pass: ['or', 'a', 'b'] })).toEqual(['or', 'a', 'b']);
  });

  test('throws for several Checks and no pass, or none at all', () => {
    expect(() => passOf({ key: 'e', checks: [check('a'), check('b')] })).toThrow(/2 Checks and no pass formula/);
    expect(() => passOf({ key: 'e', checks: [] })).toThrow(/0 Checks/);
  });
});
