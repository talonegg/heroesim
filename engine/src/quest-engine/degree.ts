// Degrees (v1.1.4-S2, DL-148 items 7 and 8, `CONTEXT.md` Degree): how a Check came out, read from
// its roll against its target by `checkDegrees`, and how an Encounter came out, read from its
// Checks' Degrees by its pass formula. `and` takes the worst of its parts, `or` the best, and
// `at-least` k the k-th best. The Check that set the Encounter's Degree decides it; on a tie, the
// part listed first in the formula. Pure: it draws nothing and reads only what it is given.

import type { GameConfig } from '../config.js';
import { degrees, type CheckKey, type Degree, type Encounter, type PassFormula } from '../content-types.js';

/**
 * The Degree of a roll against `target` (v1.1.4-S2): a Triumph at `checkDegrees.triumph` times the
 * target or more, a Success at `success` times it, a Setback at `setback` times it, else a Failure.
 * Compared as products, so that a Success is exactly a roll that reaches the target, as before.
 */
export function degreeOf(roll: number, target: number, config: Pick<GameConfig, 'checkDegrees'>): Degree {
  const { triumph, success, setback } = config.checkDegrees;
  if (roll >= triumph * target) return 'triumph';
  if (roll >= success * target) return 'success';
  if (roll >= setback * target) return 'setback';
  return 'failure';
}

/** Whether `degree` is a Success or a Triumph: the Encounter's `outcome` before v1.1.4, and what a band counts. */
export function succeeded(degree: Degree): boolean {
  return degree === 'success' || degree === 'triumph';
}

/** A Degree and the Check that set it. */
export interface Decided {
  degree: Degree;
  decidedBy: CheckKey;
}

/**
 * The Degree `pass` gives the Checks' Degrees, `byKey`, and the Check that set it (v1.1.4-S2). A
 * part that names a Check `byKey` lacks, or an operator no formula has, throws: content validation
 * refuses both.
 */
export function passDegree(pass: PassFormula, byKey: Readonly<Record<CheckKey, Degree>>): Decided {
  if (typeof pass === 'string') {
    const degree = Object.hasOwn(byKey, pass) ? byKey[pass] : undefined;
    if (degree === undefined) throw new RangeError(`The pass formula names ${JSON.stringify(pass)}, which is not a Check rolled`);
    return { degree, decidedBy: pass };
  }
  const operator: string = pass[0];
  if (operator !== 'and' && operator !== 'or' && operator !== 'at-least') {
    throw new RangeError(`The pass formula's ${JSON.stringify(operator)} is not and, or or at-least`);
  }
  const parts = (operator === 'at-least' ? pass.slice(2) : pass.slice(1)) as PassFormula[];
  // Best first, a tie kept in the order listed (a stable sort).
  const ranked = parts.map((part) => passDegree(part, byKey)).sort((a, b) => rank(b.degree) - rank(a.degree));
  const at = operator === 'and' ? ranked.length - 1 : operator === 'or' ? 0 : (pass[1] as number) - 1;
  // The Degree at that place, set by the first part listed that has it.
  const chosen = ranked.find((it) => it.degree === ranked[at]?.degree);
  if (chosen === undefined) throw new RangeError(`The pass formula ${JSON.stringify(pass)} decides nothing`);
  return chosen;
}

/** An Encounter's formula: its `pass`, or its one Check's key when it has none. */
export function passOf(encounter: Pick<Encounter, 'key' | 'checks' | 'pass'>): PassFormula {
  if (encounter.pass !== undefined) return encounter.pass;
  const [only, ...more] = encounter.checks;
  if (only === undefined || more.length > 0) {
    throw new RangeError(`Encounter ${JSON.stringify(encounter.key)} has ${encounter.checks.length} Checks and no pass formula`);
  }
  return only.key;
}

/** `degree`'s place from the worst, 0 for a Failure. */
function rank(degree: Degree): number {
  return degrees.indexOf(degree);
}
