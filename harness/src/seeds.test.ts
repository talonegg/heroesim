import { describe, expect, test } from 'vitest';
import { defaultSeedCount, seedCount, seedNames } from './seeds.js';

describe('seedCount', () => {
  test('is 1,000 when HEROESIM_SEEDS is unset or blank (INPUTS §9)', () => {
    expect(defaultSeedCount).toBe(1000);
    expect(seedCount(undefined)).toBe(1000);
    expect(seedCount(' ')).toBe(1000);
  });

  test('reads a whole number from 1', () => {
    expect(seedCount('200')).toBe(200);
    expect(seedCount(' 1 ')).toBe(1);
  });

  test.each(['0', '-5', '2.5', 'ten', '1e400'])('refuses %j rather than playing none', (value) => {
    expect(() => seedCount(value)).toThrow(/HEROESIM_SEEDS/);
  });
});

test('seedNames numbers from seed-0001, four digits at least', () => {
  expect(seedNames(3)).toEqual(['seed-0001', 'seed-0002', 'seed-0003']);
  expect(seedNames(10_000).at(-1)).toBe('seed-10000');
  expect(seedNames(0)).toEqual([]);
});
