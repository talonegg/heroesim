import { expect, test } from 'vitest';
import { seedNames } from './seeds.js';

test('seedNames numbers from seed-0001, four digits at least', () => {
  expect(seedNames(3)).toEqual(['seed-0001', 'seed-0002', 'seed-0003']);
  expect(seedNames(10_000).at(-1)).toBe('seed-10000');
  expect(seedNames(0)).toEqual([]);
});
