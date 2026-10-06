import { defaultConfig } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { calendarOf, dateOfDay, dateOfTurn, fileDateOfTurn, nightOfDay, nightOfTurn, whenOfTurn } from './calendar.js';

// v1.1.7-S4 (DL-206 items 30 to 33, DL-210): a date as a player reads it, "Year Y Day D", the Year
// from 1 and the Day of the Year from 1, the engine's Turn, Day and Year counting from 0.

const year = { turnsPerYear: defaultConfig.turnsPerYear };

describe('a date from a Turn', () => {
  test('Turn 0 is the morning of Year 1 Day 1', () => {
    expect(whenOfTurn(0, year)).toBe('Year 1 Day 1, morning');
    expect(dateOfTurn(0, year)).toBe('Year 1 Day 1');
    expect(calendarOf(0, year)).toEqual({ year: 1, day: 1, timeOfDay: 'morning' });
  });

  test('the times of a Day', () => {
    expect(whenOfTurn(1, year)).toBe('Year 1 Day 1, afternoon');
    expect(whenOfTurn(2, year)).toBe('Year 1 Day 1, night');
    expect(whenOfTurn(3, year)).toBe('Year 1 Day 2, morning');
  });

  test('the last Turn of Day 360, and the first of the next Year', () => {
    expect(year.turnsPerYear).toBe(1080);
    expect(whenOfTurn(1079, year)).toBe('Year 1 Day 360, night');
    expect(whenOfTurn(1080, year)).toBe('Year 2 Day 1, morning');
    expect(calendarOf(1080, year)).toEqual({ year: 2, day: 1, timeOfDay: 'morning' });
  });

  test('no padding: Year 12 Day 360, and a Day of the Year past 99', () => {
    expect(dateOfTurn(12 * 1080 - 1, year)).toBe('Year 12 Day 360');
    expect(dateOfTurn(1080 + 3 * 44 + 1, year)).toBe('Year 2 Day 45');
    expect(whenOfTurn(1080 + 3 * 44 + 1, year)).toBe('Year 2 Day 45, afternoon');
  });

  test('a year of 6 Turns: two Days', () => {
    const short = { turnsPerYear: 6 };
    expect([0, 2, 3, 5, 6, 8, 9, 12].map((turn) => whenOfTurn(turn, short))).toEqual([
      'Year 1 Day 1, morning',
      'Year 1 Day 1, night',
      'Year 1 Day 2, morning',
      'Year 1 Day 2, night',
      'Year 2 Day 1, morning',
      'Year 2 Day 1, night',
      'Year 2 Day 2, morning',
      'Year 3 Day 1, morning',
    ]);
  });

  test('a year of 21 Turns: seven Days', () => {
    const odd = { turnsPerYear: 21 };
    expect(whenOfTurn(20, odd)).toBe('Year 1 Day 7, night');
    expect(whenOfTurn(21, odd)).toBe('Year 2 Day 1, morning');
    expect(whenOfTurn(41, odd)).toBe('Year 2 Day 7, night');
    expect(whenOfTurn(42, odd)).toBe('Year 3 Day 1, morning');
  });
});

describe('the night', () => {
  test('of the Day a Turn falls in, whichever Turn of it', () => {
    for (const turn of [1080 + 132, 1080 + 133, 1080 + 134]) expect(nightOfTurn(turn, year)).toBe('the night of Year 2 Day 45');
    expect(nightOfTurn(0, year)).toBe('the night of Year 1 Day 1');
  });
});

describe('a date from a Day, the engine counting from 0', () => {
  test('Day 0 is Year 1 Day 1; Day 359 Year 1 Day 360; Day 360 Year 2 Day 1', () => {
    expect(dateOfDay(0, year)).toBe('Year 1 Day 1');
    expect(dateOfDay(359, year)).toBe('Year 1 Day 360');
    expect(dateOfDay(360, year)).toBe('Year 2 Day 1');
    expect(nightOfDay(404, year)).toBe('the night of Year 2 Day 45');
  });

  test('the same date as each Turn of the Day', () => {
    const short = { turnsPerYear: 21 };
    for (let day = 0; day < 30; day += 1) {
      for (const turn of [day * 3, day * 3 + 1, day * 3 + 2]) {
        expect(dateOfDay(day, short)).toBe(dateOfTurn(turn, short));
        expect(nightOfDay(day, short)).toBe(nightOfTurn(turn, short));
      }
    }
  });
});

describe("the save's file name", () => {
  test('year-3-day-12, as the date reads', () => {
    expect(fileDateOfTurn(2 * 1080 + 3 * 11 + 2, year)).toBe('year-3-day-12');
    expect(fileDateOfTurn(0, year)).toBe('year-1-day-1');
  });
});

describe('what no Turn or Day is', () => {
  test('refused as the engine refuses it', () => {
    expect(() => dateOfTurn(-1, year)).toThrow(RangeError);
    expect(() => dateOfTurn(1.5, year)).toThrow(RangeError);
    expect(() => dateOfDay(-1, year)).toThrow(RangeError);
  });
});
