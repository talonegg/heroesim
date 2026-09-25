import { describe, expect, test } from 'vitest';
import { percentile, summarise, tally } from './stats.js';

describe('summarise', () => {
  test('gives the count, mean, population sd, extremes and percentiles, leaving its input alone', () => {
    const values = [4, 2, 8, 6];
    const summary = summarise(values);

    expect(summary).toMatchObject({ count: 4, mean: 5, min: 2, max: 8, p50: 4, p99: 8 });
    expect(summary.sd).toBeCloseTo(Math.sqrt(5), 12);
    expect(values).toEqual([4, 2, 8, 6]);
  });

  test('gives NaN for everything but the count of an empty series', () => {
    const summary = summarise([]);
    expect(summary.count).toBe(0);
    for (const field of ['mean', 'sd', 'min', 'max', 'p50', 'p99'] as const) expect(summary[field]).toBeNaN();
  });
});

describe('percentile', () => {
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1);

  test('is the nearest rank, always one of the values', () => {
    expect(percentile(hundred, 99)).toBe(99);
    expect(percentile(hundred, 50)).toBe(50);
    expect(percentile(hundred, 100)).toBe(100);
    expect(percentile(hundred, 0)).toBe(1);
    expect(percentile([7], 99)).toBe(7);
    expect(percentile([1, 2, 3], 99)).toBe(3);
  });

  test('refuses a percentile outside 0 to 100', () => {
    expect(() => percentile(hundred, 101)).toThrow(RangeError);
    expect(() => percentile(hundred, Number.NaN)).toThrow(RangeError);
  });
});

test('tally counts each key', () => {
  expect(tally(['a', 'b', 'a'])).toEqual({ a: 2, b: 1 });
});
