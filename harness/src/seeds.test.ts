import { describe, expect, test } from 'vitest';
import { configChanges, defaultPlaySeedCount, defaultSeedCount, seedCount, seedNames, yearCount } from './seeds.js';

describe('seedCount', () => {
  test('is 1,000 when HEROESIM_SEEDS is unset or blank (INPUTS §9)', () => {
    expect(defaultSeedCount).toBe(1000);
    expect(seedCount(undefined)).toBe(1000);
    expect(seedCount(' ')).toBe(1000);
  });

  test("is the play sweep's 200 when that is the fallback (INPUTS 4.13)", () => {
    expect(defaultPlaySeedCount).toBe(200);
    expect(seedCount(undefined, defaultPlaySeedCount)).toBe(200);
    expect(seedCount('7', defaultPlaySeedCount)).toBe(7);
  });

  test('reads a whole number from 1', () => {
    expect(seedCount('200')).toBe(200);
    expect(seedCount(' 1 ')).toBe(1);
  });

  test.each(['0', '-5', '2.5', 'ten', '1e400'])('refuses %j rather than playing none', (value) => {
    expect(() => seedCount(value)).toThrow(/HEROESIM_SEEDS/);
  });

  // v1.1.4-S9's verification (DL-162): a count read of another variable names that variable.
  test('names the variable it read, when told it', () => {
    expect(() => seedCount('ten', 200, 'HEROESIM_SAMPLES')).toThrow(/^HEROESIM_SAMPLES must be a whole number from 1, not "ten"$/);
    expect(seedCount('', 200, 'HEROESIM_SAMPLES')).toBe(200);
  });
});

describe('yearCount (M9-S2)', () => {
  test("is the twenty-year slice when HEROESIM_YEARS is unset or blank (DL-83 item 18)", () => {
    expect(yearCount(undefined)).toBe(20);
    expect(yearCount(' ')).toBe(20);
  });

  test('reads a whole number of years from 1, for a run past the slice such as a whole game of 35', () => {
    expect(yearCount('35')).toBe(35);
    expect(yearCount(' 1 ')).toBe(1);
  });

  test.each(['0', '-5', '2.5', 'ten'])('refuses %j rather than playing no year', (value) => {
    expect(() => yearCount(value)).toThrow(/HEROESIM_YEARS/);
  });
});

test('seedNames numbers from seed-0001, four digits at least', () => {
  expect(seedNames(3)).toEqual(['seed-0001', 'seed-0002', 'seed-0003']);
  expect(seedNames(10_000).at(-1)).toBe('seed-10000');
  expect(seedNames(0)).toEqual([]);
});

// v1.1.4-S9's verification (DL-162): a play sweep under config other than the defaults, for trials of
// values S10 would tune, never changed in engine/src/config.ts to try them.
describe('configChanges', () => {
  test('is no change when HEROESIM_CONFIG is unset or blank', () => {
    expect(configChanges('')).toEqual({});
    expect(configChanges('  ')).toEqual({});
  });

  test('reads a JSON object of config keys, checked as the Quest Engine checks the config', () => {
    expect(configChanges('{"checkVariance":0.4,"marketSize":14}')).toEqual({ checkVariance: 0.4, marketSize: 14 });
  });

  test.each([
    ['[1]', /HEROESIM_CONFIG is "\[1\]"; expected a JSON object of config keys/],
    ['{', /HEROESIM_CONFIG is "\{"; expected a JSON object of config keys/],
    ['{"noSuchKey":1}', /HEROESIM_CONFIG: "noSuchKey" is not a config key/],
    ['{"checkVariance":2}', /HEROESIM_CONFIG: checkVariance is 2; it is a share from 0 to 1/],
  ])('refuses %s', (value, problem) => {
    expect(() => configChanges(value)).toThrow(problem);
  });
});
