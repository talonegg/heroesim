import { describe, expect, test } from 'vitest';
import { defaultConfig } from './config.js';
import { ageOf, dayOf, nightOf, timeOfDay, timesOfDay, turnsPerDay, yearOf } from './time.js';

describe('Days and times of day', () => {
  test('a Day is three Turns, morning, afternoon and night, counted from Turn 0', () => {
    expect(turnsPerDay).toBe(3);
    expect(timesOfDay).toEqual(['morning', 'afternoon', 'night']);
    expect([0, 1, 2, 3, 4, 5, 6].map(dayOf)).toEqual([0, 0, 0, 1, 1, 1, 2]);
    expect([0, 1, 2, 3, 4, 5].map(timeOfDay)).toEqual(['morning', 'afternoon', 'night', 'morning', 'afternoon', 'night']);
  });

  test('the night of a Day is its third Turn, whatever Turn of the Day it is reached from', () => {
    expect(nightOf(0)).toBe(2);
    expect(nightOf(13)).toBe(41);
    for (const turn of [39, 40, 41]) {
      expect(timeOfDay(nightOf(dayOf(turn) + 4))).toBe('night');
      expect(dayOf(nightOf(dayOf(turn) + 4))).toBe(17);
    }
  });

  test('refuses a Turn or a Day that is not a whole number from 0', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => dayOf(bad)).toThrow(RangeError);
      expect(() => timeOfDay(bad)).toThrow(RangeError);
      expect(() => yearOf(bad, defaultConfig)).toThrow(RangeError);
      expect(() => nightOf(bad)).toThrow(RangeError);
    }
  });
});

describe('yearOf', () => {
  test('counts whole years of the config it is given, from Year 0', () => {
    expect(yearOf(0, defaultConfig)).toBe(0);
    expect(yearOf(defaultConfig.turnsPerYear - 1, defaultConfig)).toBe(0);
    expect(yearOf(defaultConfig.turnsPerYear, defaultConfig)).toBe(1);
    expect(yearOf(25, { turnsPerYear: 12 })).toBe(2);
  });
});

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
