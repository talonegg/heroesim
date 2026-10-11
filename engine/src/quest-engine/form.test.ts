import { describe, expect, test } from 'vitest';
import { defaultConfig } from '../config.js';
import type { StatArea } from '../content-types.js';
import { testContent } from '../world.test-support.js';
import {
  fatigueFactor,
  fatigueHarm,
  formEffect,
  formedStats,
  formFigure,
  hurtFactor,
  meanForm,
  moraleFactor,
  workingMorale,
  type FormEffect,
} from './form.js';

// DL-148 items 9 to 12, DL-154, DL-283, DL-284: the form module's factors, each by its own formula, and
// the Party builder's one line from the Party's mean form. The formed Stats a Check reads are held
// through `queryParty`'s members (query.test.ts), the one place a member is built.

const config = defaultConfig;

/** The owner's figures (DL-280 items 2 to 4): the Morale scale 0 to 100, the baseline 50, the low band from 11, FS 0.4, the hurt 0.6. */
const owners = {
  ...defaultConfig,
  moraleMin: 0,
  moraleMax: 100,
  moraleBaseline: 50,
  moraleBands: { wretched: 0, low: 11, steady: 35, high: 66, elated: 90 },
  fatigueMax: 100,
  fatigueScaling: 0.4,
  hurtCheckFactor: 0.6,
};

const areas: readonly StatArea[] = ['physical', 'magical', 'mental', 'social'];

describe('workingMorale', () => {
  test('is the Morale as they set out plus the consequences so far, held to the scale', () => {
    expect(workingMorale(60, 0, config)).toBe(60);
    expect(workingMorale(60, -25, config)).toBe(35);
    expect(workingMorale(60, 55, config)).toBe(config.moraleMax);
    expect(workingMorale(10, -30, config)).toBe(config.moraleMin);
  });
});

describe("Morale's factor, a line through the baseline (DL-283)", () => {
  test('is 1 + (m − moraleBaseline) ÷ (2 × (moraleMax − moraleMin)): 0.75 at 0, 1 at the baseline, 1.25 at 100', () => {
    expect(moraleFactor(0, owners)).toBe(0.75);
    expect(moraleFactor(50, owners)).toBe(1);
    expect(moraleFactor(100, owners)).toBe(1.25);
  });

  test("at a band's start, the line's value there: the low band's 0.805, the high band's 1.08", () => {
    expect(moraleFactor(owners.moraleBands.low, owners)).toBeCloseTo(0.805, 12);
    expect(moraleFactor(owners.moraleBands.high, owners)).toBeCloseTo(1.08, 12);
  });

  test('reads the scale and the baseline it is given: 1 at any baseline, half the scale above it a quarter more', () => {
    const scale = { moraleMin: -20, moraleMax: 60, moraleBaseline: 10 };
    expect(moraleFactor(10, scale)).toBe(1);
    expect(moraleFactor(50, scale)).toBe(1.25);
    expect(moraleFactor(-20, scale)).toBeCloseTo(0.8125, 12);
  });

  test('rises with Morale, a fraction of a point too, with no step at a band', () => {
    const factors = [10, 10.5, 11, 11.5, 34.5, 35, 35.5].map((morale) => moraleFactor(morale, owners));
    factors.forEach((factor, index) => index > 0 && expect(factor).toBeGreaterThan(factors[index - 1] as number));
    expect(moraleFactor(11, owners) - moraleFactor(10.5, owners)).toBeCloseTo(moraleFactor(10.5, owners) - moraleFactor(10, owners), 12);
  });
});

describe("Fatigue's factor by Stat area (DL-280 item 2, DL-284)", () => {
  test("the owner's table: Physical and Magical × 1, 0.8 and 0.6 at f 0, 50 and 100; Mental and Social × 1, 0.9 and 0.8", () => {
    for (const area of ['physical', 'magical'] as const) {
      expect([0, 50, 100].map((f) => fatigueFactor(area, f, owners))).toEqual([1, expect.closeTo(0.8, 12), expect.closeTo(0.6, 12)]);
    }
    for (const area of ['mental', 'social'] as const) {
      expect([0, 50, 100].map((f) => fatigueFactor(area, f, owners))).toEqual([1, expect.closeTo(0.9, 12), expect.closeTo(0.8, 12)]);
    }
  });

  test('is 1 − FS·f ÷ fatigueMax on the Physical and Magical, 1 − (FS ÷ 2)·f ÷ fatigueMax on the others, whatever FS and the scale', () => {
    const scaled = { fatigueScaling: 0.7, fatigueMax: 200 };
    expect(fatigueFactor('physical', 120, scaled)).toBeCloseTo(1 - (0.7 * 120) / 200, 12);
    expect(fatigueFactor('magical', 120, scaled)).toBeCloseTo(1 - (0.7 * 120) / 200, 12);
    expect(fatigueFactor('mental', 120, scaled)).toBeCloseTo(1 - (0.35 * 120) / 200, 12);
    expect(fatigueFactor('social', 120, scaled)).toBeCloseTo(1 - (0.35 * 120) / 200, 12);
  });

  test('is exactly 1 at no Fatigue, and at an FS of 0 at any Fatigue', () => {
    for (const area of areas) {
      expect(fatigueFactor(area, 0, owners)).toBe(1);
      expect(fatigueFactor(area, 100, { ...owners, fatigueScaling: 0 })).toBe(1);
    }
  });
});

describe("the hurt's factor by Stat area (DL-280 item 4, DL-284)", () => {
  test('the Physical Stats take the gap whole, every other area half: 0.6 and 0.8 at hurtCheckFactor 0.6', () => {
    expect(hurtFactor('physical', true, owners)).toBe(0.6);
    for (const area of ['magical', 'mental', 'social'] as const) expect(hurtFactor(area, true, owners)).toBeCloseTo(0.8, 12);
  });

  test('is 1 on every area for a Hero unhurt', () => {
    for (const area of areas) expect(hurtFactor(area, false, owners)).toBe(1);
  });
});

describe('formedStats', () => {
  const stats = { strength: 12, arcana: 9, wits: 15, charisma: 7 };
  const deps = { config: owners, content: testContent };
  const areaOf = (key: string): StatArea => testContent.stats[key]?.area as StatArea;

  test("each Stat times Morale's, Fatigue's and the hurt's factors by its area in content, multiplied, no floor", () => {
    for (const [morale, fatigue, hurt] of [[50, 0, false], [20, 50, false], [80, 100, true], [0, 100, true]] as const) {
      const formed = formedStats(stats, { morale, fatigue, hurt }, deps);
      for (const [key, value] of Object.entries(stats)) {
        const area = areaOf(key);
        expect(formed[key], `${key} at ${morale}, ${fatigue}, ${hurt}`).toBeCloseTo(
          value * moraleFactor(morale, owners) * fatigueFactor(area, fatigue, owners) * hurtFactor(area, hurt, owners),
          12,
        );
      }
    }
    // Wretched, exhausted to the full and hurt: a Physical Stat keeps 0.75 × 0.6 × 0.6 of itself.
    expect(formedStats(stats, { morale: 0, fatigue: 100, hurt: true }, deps)['strength']).toBeCloseTo(12 * 0.75 * 0.6 * 0.6, 12);
  });

  test('every Stat as it is at the baseline, rested and unhurt', () => {
    expect(formedStats(stats, { morale: owners.moraleBaseline, fatigue: 0, hurt: false }, deps)).toEqual(stats);
  });

  test("a Stat content does not define is times Morale's factor alone", () => {
    expect(formedStats({ grace: 10 }, { morale: 100, fatigue: 100, hurt: true }, deps)).toEqual({ grace: 12.5 });
  });
});

describe("Fatigue's factors on harm (DL-280 item 2, Q13 a; DL-284)", () => {
  test("the owner's table: an Injury's chance × 1, 1.2 and 1.4 at f 0, 50 and 100, a Death's × 1, 1.1 and 1.2", () => {
    expect([0, 50, 100].map((f) => fatigueHarm(f, owners).injury)).toEqual([1, expect.closeTo(1.2, 12), expect.closeTo(1.4, 12)]);
    expect([0, 50, 100].map((f) => fatigueHarm(f, owners).death)).toEqual([1, expect.closeTo(1.1, 12), expect.closeTo(1.2, 12)]);
  });

  test('is 1 + FS·f ÷ fatigueMax and 1 + (FS ÷ 2)·f ÷ fatigueMax whatever FS and the scale', () => {
    const scaled = { fatigueScaling: 0.7, fatigueMax: 200 };
    expect(fatigueHarm(120, scaled).injury).toBeCloseTo(1 + (0.7 * 120) / 200, 12);
    expect(fatigueHarm(120, scaled).death).toBeCloseTo(1 + (0.35 * 120) / 200, 12);
  });
});

describe('formFigure, for the Party builder alone', () => {
  const deps = { config: owners, content: testContent };
  const heroAreas = Object.values(testContent.stats).filter((stat) => stat.owner === 'hero').map((stat) => stat.area);

  test("is Morale's factor when rested and unhurt, exactly", () => {
    for (const morale of [0, 11, 50, 73, 100]) expect(formFigure({ morale, fatigue: 0, hurt: false }, deps)).toBe(moraleFactor(morale, owners));
  });

  test("is Morale's factor times the mean over content's Hero Stats of Fatigue's and the hurt's factors", () => {
    const mean = (fatigue: number, hurt: boolean) =>
      heroAreas.reduce((total, area) => total + fatigueFactor(area, fatigue, owners) * hurtFactor(area, hurt, owners), 0) / heroAreas.length;
    expect(formFigure({ morale: 70, fatigue: 50, hurt: false }, deps)).toBeCloseTo(moraleFactor(70, owners) * mean(50, false), 12);
    expect(formFigure({ morale: 30, fatigue: 100, hurt: true }, deps)).toBeCloseTo(moraleFactor(30, owners) * mean(100, true), 12);
  });
});

describe("the Party builder's line, from the mean form", () => {
  test.each<[number[], FormEffect]>([
    [[1, 1, 1], 'none'],
    [[], 'none'],
    [[1.04, 1], 'raises'],
    [[1.2, 0.85], 'raises'],
    [[1.04, 0.93], 'lowers-a-little'],
    // Every Hero at the low band's start, the line's 0.805 there, lowers it a little; every one
    // wretched, below it, badly.
    [[0.805, 0.805, 0.805], 'lowers-a-little'],
    [[0.8, 0.8, 0.8], 'lowers-badly'],
    [[0.6, 1], 'lowers-badly'],
    [[0.6, 0.6, 1.1], 'lowers-badly'],
  ])('a Party of forms %j: %s', (forms, effect) => {
    expect(formEffect(meanForm(forms), owners)).toBe(effect);
  });

  test("the thresholds: above 1 raises, 1 makes none, down to the line's value at the low band's start a little, below it badly", () => {
    const low = moraleFactor(owners.moraleBands.low, owners);
    expect(formEffect(1.0001, owners)).toBe('raises');
    expect(formEffect(1, owners)).toBe('none');
    expect(formEffect(0.9999, owners)).toBe('lowers-a-little');
    expect(formEffect(low, owners)).toBe('lowers-a-little');
    expect(formEffect(low - 0.0001, owners)).toBe('lowers-badly');
  });

  test("a Party all at the low band's start lowers it a little, and all a point below it badly, whatever the defaults", () => {
    const deps = { config, content: testContent };
    const at = (morale: number) => formEffect(meanForm([morale, morale].map((it) => formFigure({ morale: it, fatigue: 0, hurt: false }, deps))), config);
    expect(at(config.moraleBands.low)).toBe('lowers-a-little');
    expect(at(config.moraleBands.low - 1)).toBe('lowers-badly');
    expect(at(config.moraleBaseline)).toBe('none');
  });
});
