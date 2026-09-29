import { describe, expect, test } from 'vitest';
import { defaultConfig } from './config.js';
import * as engine from './index.js';
import { ageOf, dayOf, durationDaysOf, nightOf, retirementTurn, retiresOn, timeOfDay, timesOfDay, turnsPerDay, yearOf } from './time.js';

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

describe('durationDaysOf', () => {
  test("is a Quest's durationTurns in Days, a part-Day counting as a Day", () => {
    expect([3, 6, 30].map((durationTurns) => durationDaysOf({ durationTurns }))).toEqual([1, 2, 10]);
    expect(durationDaysOf({ durationTurns: 7 })).toBe(3);
  });

  test('refuses a duration that is not a whole number of Turns from 0', () => {
    expect(() => durationDaysOf({ durationTurns: -3 })).toThrow(RangeError);
    expect(() => durationDaysOf({ durationTurns: 1.5 })).toThrow(RangeError);
  });
});

// M9-F1 (DL-113 items 4 and 5): the Turn a Guildmaster retires on, for the endings and the page.
describe('retirementTurn', () => {
  const rules = { turnsPerYear: 1080, guildmasterRetirementAge: 61 };

  test('a Guildmaster founded at 50 on Turn 0 turns 61 on the morning of Turn 11,880 and retires that night, Turn 11,882', () => {
    expect(retirementTurn({ ageAtEntry: 50, enteredTurn: 0 }, rules)).toBe(11_882);
    expect(ageOf({ ageAtEntry: 50, enteredTurn: 0 }, 11_879, rules)).toBe(60);
    expect(ageOf({ ageAtEntry: 50, enteredTurn: 0 }, 11_880, rules)).toBe(61);
  });

  test('one who entered mid-game retires on the night of the Day they turn 61, whichever time of day they entered', () => {
    // A successor at 45 on the night of Day 100, Turn 302: sixteen years on is Turn 17,582, a night.
    expect(retirementTurn({ ageAtEntry: 45, enteredTurn: nightOf(100) }, rules)).toBe(17_582);
    // At 60 on the afternoon of Turn 1: 61 on the afternoon of Turn 1,081, retired that night.
    expect(retirementTurn({ ageAtEntry: 60, enteredTurn: 1 }, rules)).toBe(1_082);
    // At 21, the youngest: forty years.
    expect(retirementTurn({ ageAtEntry: 21, enteredTurn: 0 }, rules)).toBe(40 * 1080 + 2);
  });

  test('one already at the age, as in a save that adopts younger rules, retires on the first night from their entry', () => {
    expect(retirementTurn({ ageAtEntry: 61, enteredTurn: 0 }, rules)).toBe(2);
    expect(retirementTurn({ ageAtEntry: 64, enteredTurn: 0 }, rules)).toBe(2);
    expect(retirementTurn({ ageAtEntry: 63, enteredTurn: nightOf(5) }, rules)).toBe(nightOf(5));
  });

  test("reads the age and the year from the config it is given, and is exported from the engine's index", () => {
    expect(retirementTurn({ ageAtEntry: 50, enteredTurn: 0 }, defaultConfig)).toBe(11_882);
    expect(retirementTurn({ ageAtEntry: 50, enteredTurn: 0 }, { turnsPerYear: 30, guildmasterRetirementAge: 65 })).toBe(15 * 30 + 2);
    expect(engine.retirementTurn).toBe(retirementTurn);
  });
});

describe('retiresOn (M9-F6)', () => {
  const rules = { turnsPerYear: 1080, guildmasterRetirementAge: 61 };

  test("is retirementTurn while that night is still to be played", () => {
    const founder = { ageAtEntry: 50, enteredTurn: 0 };
    expect(retiresOn(founder, 0, rules)).toBe(11_882);
    expect(retiresOn(founder, 11_881, rules)).toBe(11_882);
  });

  test('is the next night to be played once retirementTurn has passed unplayed, as in a save that adopted younger rules on a morning since', () => {
    // Entered at 45 on Turn 0, now 62 on the morning of Day 6,000 (Turn 18,000): 61 a year ago, and
    // the endings, which ask whether a night is at or past retirementTurn, retire them tonight.
    const elder = { ageAtEntry: 45, enteredTurn: 0 };
    expect(retirementTurn(elder, rules)).toBeLessThan(18_000);
    expect(retiresOn(elder, 18_000 - 1, rules)).toBe(nightOf(6000));
    // Once a morning has been played, that Day's night; once a night, the next Day's.
    expect(retiresOn(elder, 18_000, rules)).toBe(nightOf(6000));
    expect(retiresOn(elder, nightOf(6000), rules)).toBe(nightOf(6001));
    expect(engine.retiresOn).toBe(retiresOn);
  });
});
