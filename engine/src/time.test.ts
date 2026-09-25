import { describe, expect, test } from 'vitest';
import { defaultConfig } from './config.js';
import { ageOf } from './time.js';

describe('ageOf', () => {
  const year = { turnsPerYear: 12 };

  test('is the age at entry on the Turn of entry', () => {
    expect(ageOf({ ageAtEntry: 24, enteredTurn: 0 }, 0, year)).toBe(24);
    expect(ageOf({ ageAtEntry: 24, enteredTurn: 50 }, 50, year)).toBe(24);
  });

  test('counts whole years since entry, rising on the Turn a year completes', () => {
    const hero = { ageAtEntry: 24, enteredTurn: 5 };

    expect(ageOf(hero, 16, year)).toBe(24);
    expect(ageOf(hero, 17, year)).toBe(25);
    expect(ageOf(hero, 28, year)).toBe(25);
    expect(ageOf(hero, 29, year)).toBe(26);
  });

  test('reads the year length from the config it is given', () => {
    const hero = { ageAtEntry: 30, enteredTurn: 0 };

    expect(ageOf(hero, defaultConfig.turnsPerYear - 1, defaultConfig)).toBe(30);
    expect(ageOf(hero, defaultConfig.turnsPerYear, defaultConfig)).toBe(31);
    expect(ageOf(hero, defaultConfig.turnsPerYear, { turnsPerYear: defaultConfig.turnsPerYear / 2 })).toBe(32);
  });

  test('throws for a Turn before the person entered the world', () => {
    expect(() => ageOf({ ageAtEntry: 24, enteredTurn: 10 }, 9, year)).toThrow(RangeError);
  });
});
