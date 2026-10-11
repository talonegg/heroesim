import { describe, expect, test } from 'vitest';
import { defaultConfig } from '../config.js';
import { formEffect, formOf, meanForm, moraleFactor, workingMorale, type FormEffect } from './form.js';

// DL-148 items 9 to 12, DL-154, DL-283: a Hero's form, from Morale's line through their Morale on the
// Quest and whether they are hurt on it; and the Party builder's one line, from the Party's mean form.

const config = defaultConfig;

/** The owner's Morale (DL-280 item 3): the scale 0 to 100, the baseline 50, the low band from 11. */
const owners = {
  ...defaultConfig,
  moraleMin: 0,
  moraleMax: 100,
  moraleBaseline: 50,
  moraleBands: { wretched: 0, low: 11, steady: 35, high: 66, elated: 90 },
  hurtCheckFactor: 0.6,
};

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

describe('formOf', () => {
  test.each([0, 10.5, 11, 35, 50, 66, 90, 100])("at Morale %d is Morale's factor, and hurtCheckFactor times it when hurt", (morale) => {
    expect(formOf(morale, false, owners)).toBe(moraleFactor(morale, owners));
    expect(formOf(morale, true, owners)).toBe(moraleFactor(morale, owners) * owners.hurtCheckFactor);
  });

  test('is 1 at the baseline unhurt, under the defaults too', () => {
    expect(formOf(config.moraleBaseline, false, config)).toBe(1);
  });
});

describe('the Party builder\'s line, from the mean form', () => {
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
    const at = (morale: number) => formEffect(meanForm([morale, morale].map((it) => formOf(it, false, config))), config);
    expect(at(config.moraleBands.low)).toBe('lowers-a-little');
    expect(at(config.moraleBands.low - 1)).toBe('lowers-badly');
    expect(at(config.moraleBaseline)).toBe('none');
  });
});
