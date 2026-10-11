import { describe, expect, test } from 'vitest';
import { defaultConfig, type GameConfig } from '../config.js';
import { turnsPerDay } from '../time.js';
import { questClock } from './clock.js';

// The Quest clock (DL-280 item 2, the architecture review's candidate 2; DL-282): the Day of the Quest
// each Encounter falls on, spread evenly over its Days, and a Hero's Fatigue on it, from the Fatigue
// their Party recorded at dispatch. A pure module: the resolver and the estimate read it, since the
// resolver meets the Party on the return night, after every night away has moved its stored Fatigue.

const config: Pick<GameConfig, 'fatigueMax' | 'fatigueRiseByTier'> = { fatigueMax: 100, fatigueRiseByTier: [4, 5, 6, 7, 8] };

/** A Quest of `days` Days at `tier`. */
const quest = (days: number, tier = 1) => ({ tier, durationTurns: days * turnsPerDay });

/** The Day of each of `encounters` Encounters on a Quest of `days` Days. */
const daysOf = (days: number, encounters: number): number[] => {
  const clock = questClock(quest(days), encounters, config);
  return Array.from({ length: encounters }, (_, index) => clock.encounterDay(index));
};

describe("an Encounter's Day", () => {
  test('the first falls on Day 1 and the last on the last Day, the rest evenly between, rounded half up', () => {
    expect(daysOf(6, 3)).toEqual([1, 4, 6]);
    expect(daysOf(5, 3)).toEqual([1, 3, 5]);
    expect(daysOf(12, 4)).toEqual([1, 5, 8, 12]);
    expect(daysOf(20, 5)).toEqual([1, 6, 11, 15, 20]);
    expect(daysOf(3, 2)).toEqual([1, 3]);
  });

  test('as many Encounters as Days fall one a Day', () => {
    expect(daysOf(4, 4)).toEqual([1, 2, 3, 4]);
  });

  test('more Encounters than Days share them, in order', () => {
    expect(daysOf(2, 5)).toEqual([1, 1, 2, 2, 2]);
    expect(daysOf(1, 3)).toEqual([1, 1, 1]);
  });

  test('a lone Encounter, the Quest\'s last, falls on its last Day', () => {
    expect(daysOf(5, 1)).toEqual([5]);
    expect(daysOf(1, 1)).toEqual([1]);
  });

  test("on every Tier's Days and Beats, first on Day 1, last on the last Day, never falling back", () => {
    for (const { daysMin, daysMax, beats } of defaultConfig.tiers) {
      for (let days = daysMin; days <= daysMax; days += 1) {
        for (const encounters of [1, beats, beats + 1]) {
          const met = daysOf(days, encounters);
          if (encounters > 1) expect(met[0]).toBe(1);
          expect(met.at(-1)).toBe(days);
          expect(met.every((day, index) => index === 0 || day >= (met[index - 1] as number))).toBe(true);
        }
      }
    }
  });

  test('the clock knows the Quest\'s Days', () => {
    expect(questClock(quest(7), 3, config).days).toBe(7);
  });

  test('a Quest of no Days, which only a hand-made row could hold, is met in one Day', () => {
    const clock = questClock(quest(0), 2, config);
    expect([clock.days, clock.encounterDay(0), clock.encounterDay(1)]).toEqual([1, 1, 1]);
  });

  test('an Encounter outside the sequence, or a sequence of none, is a programming error', () => {
    const clock = questClock(quest(6), 3, config);
    for (const index of [-1, 3, 1.5]) expect(() => clock.encounterDay(index)).toThrow(RangeError);
    expect(() => questClock(quest(6), 0, config)).toThrow(RangeError);
  });
});

describe('a Hero\'s Fatigue on an Encounter\'s Day', () => {
  test("is their Fatigue at dispatch, risen by the Quest's Tier for each Day before it", () => {
    for (const [tier, rise] of [[1, 4], [3, 6], [5, 8], [6, 8]] as const) {
      const clock = questClock(quest(6, tier), 3, config);
      expect([0, 1, 2].map((index) => clock.fatigueAt(index, 10))).toEqual([10, 10 + 3 * rise, 10 + 5 * rise]);
    }
  });

  test('the first Encounter is met at the Fatigue the Hero set out with', () => {
    expect(questClock(quest(20, 5), 5, config).fatigueAt(0, 42)).toBe(42);
  });

  test('is held at fatigueMax', () => {
    const clock = questClock(quest(20, 5), 5, config);
    expect(clock.fatigueAt(4, 50)).toBe(100);
    expect(clock.fatigueAt(1, 50)).toBe(90);
  });
});
