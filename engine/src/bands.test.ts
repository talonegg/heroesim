import { describe, expect, test } from 'vitest';
import { atOrPast, bandOf } from './bands.js';

// The band function and its comparison (DL-280, the architecture review's candidate 6; DL-282): every
// named range a value falls in, Morale's, Regard's, a chance's, a Potential hint's and Fatigue's, is
// read through them.

const names = ['low', 'middle', 'high'] as const;

describe('bandOf', () => {
  const starts = { low: 0, middle: 10, high: 20 };

  test('a value is in the highest band whose start it has reached, a start itself included', () => {
    expect([0, 9.99, 10, 19, 20, 1_000].map((value) => bandOf(names, starts, value))).toEqual([
      'low',
      'low',
      'middle',
      'middle',
      'high',
      'high',
    ]);
  });

  test('a value below every start is in the lowest band', () => {
    expect(bandOf(names, { low: 5, middle: 10, high: 20 }, -3)).toBe('low');
  });

  test('a band with no start, the lowest, holds every value below the next start', () => {
    expect(bandOf(names, { middle: 0.3, high: 0.7 }, 0.29)).toBe('low');
    expect(bandOf(names, { middle: 0.3, high: 0.7 }, 0.3)).toBe('middle');
    expect(bandOf(names, { middle: 0.3, high: 0.7 }, -1)).toBe('low');
  });
});

describe('atOrPast', () => {
  test('a band is at or past each band up to itself, in the names order, and before each above it', () => {
    expect(names.map((threshold) => atOrPast(names, 'middle', threshold))).toEqual([true, true, false]);
    expect(names.map((threshold) => atOrPast(names, 'low', threshold))).toEqual([true, false, false]);
    expect(names.map((threshold) => atOrPast(names, 'high', threshold))).toEqual([true, true, true]);
  });
});
