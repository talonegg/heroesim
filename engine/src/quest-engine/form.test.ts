import { describe, expect, test } from 'vitest';
import { configProblems, defaultConfig, moraleBandNames } from '../config.js';
import { formEffect, formOf, meanForm, workingMorale, type FormEffect } from './form.js';

// v1.1.4-S3 (DL-148 items 9 to 12, DL-154): a Hero's form, from the band of their Morale on the Quest
// and whether they are hurt on it; and the Party builder's one line, from the Party's mean form.

const config = defaultConfig;

describe('workingMorale', () => {
  test('is the Morale as they set out plus the consequences so far, held to the scale', () => {
    expect(workingMorale(60, 0, config)).toBe(60);
    expect(workingMorale(60, -25, config)).toBe(35);
    expect(workingMorale(60, 55, config)).toBe(config.moraleMax);
    expect(workingMorale(10, -30, config)).toBe(config.moraleMin);
  });
});

describe('formOf', () => {
  test.each([
    [0, 'wretched'],
    [19, 'wretched'],
    [20, 'low'],
    [40, 'steady'],
    [74, 'steady'],
    [75, 'high'],
    [90, 'elated'],
    [100, 'elated'],
  ] as const)('at Morale %i is the %s band\'s factor, and hurtCheckFactor times it when hurt', (morale, band) => {
    expect(formOf(morale, false, config)).toBe(config.moraleCheckFactor[band]);
    expect(formOf(morale, true, config)).toBe(config.moraleCheckFactor[band] * config.hurtCheckFactor);
  });
});

describe('the Party builder\'s line, from the mean form', () => {
  test.each<[number[], FormEffect]>([
    [[1, 1, 1], 'none'],
    [[], 'none'],
    [[1.04, 1], 'raises'],
    [[1.08, 0.93], 'raises'],
    [[1.04, 0.93], 'lowers-a-little'],
    // Every Hero in low spirits, at the low band's factor (0.93 until v1.1.4-S10, then 0.97, DL-166),
    // lowers it a little; every one wretched (0.93 from v1.1.4-S10), badly.
    [[0.97, 0.97, 0.97], 'lowers-a-little'],
    [[0.93, 0.93, 0.93], 'lowers-badly'],
    [[0.85, 1], 'lowers-badly'],
    [[0.85, 0.85, 1.08], 'lowers-badly'],
  ])('a Party of forms %j: %s', (forms, effect) => {
    expect(formEffect(meanForm(forms), config)).toBe(effect);
  });

  test('the thresholds: above 1 raises, 1 makes none, down to the low band\'s factor a little, below it badly', () => {
    expect(formEffect(1.0001, config)).toBe('raises');
    expect(formEffect(1, config)).toBe('none');
    expect(formEffect(0.9999, config)).toBe('lowers-a-little');
    expect(formEffect(config.moraleCheckFactor.low, config)).toBe('lowers-a-little');
    expect(formEffect(config.moraleCheckFactor.low - 0.0001, config)).toBe('lowers-badly');
  });
});

describe('configProblems', () => {
  const ones = { wretched: 1, low: 1, steady: 1, high: 1, elated: 1 };
  const withFactors = (moraleCheckFactor: Partial<typeof config.moraleCheckFactor>, hurtCheckFactor = config.hurtCheckFactor) =>
    configProblems({ ...config, moraleCheckFactor: moraleCheckFactor as typeof config.moraleCheckFactor, hurtCheckFactor });

  test('finds none in the defaults, nor with every factor 1, the rule before v1.1.4-S3', () => {
    expect(configProblems(config)).toEqual([]);
    expect(withFactors(ones, 1)).toEqual([]);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined])('names a Morale band whose factor is %s', (bad) => {
    for (const band of moraleBandNames) {
      expect(withFactors({ ...config.moraleCheckFactor, [band]: bad })).toContain(`moraleCheckFactor.${band} is ${bad}; it is a finite number above 0`);
    }
  });

  test('names a Morale band missing from moraleCheckFactor', () => {
    const moraleCheckFactor = { ...config.moraleCheckFactor };
    Reflect.deleteProperty(moraleCheckFactor, 'steady');
    expect(withFactors(moraleCheckFactor)).toContain('moraleCheckFactor.steady is undefined; it is a finite number above 0');
  });

  test('refuses a steady band whose factor is not 1, the band that changes nothing', () => {
    expect(withFactors({ ...config.moraleCheckFactor, steady: 1.02 })).toEqual(['moraleCheckFactor.steady is 1.02; it is 1, the band that changes nothing']);
  });

  test.each([
    { wretched: 0.95, low: 0.93 },
    { low: 1.01 },
    { high: 0.99 },
    { elated: 1.02 },
  ])('refuses factors out of the bands\' order, %j: wretched ≤ low ≤ 1 ≤ high ≤ elated', (moved) => {
    const factors = { ...config.moraleCheckFactor, ...moved };
    expect(withFactors(factors)).toEqual([`moraleCheckFactor is ${JSON.stringify(factors)}; wretched ≤ low ≤ steady ≤ high ≤ elated`]);
  });

  test.each([0, -0.5, 1.01, Number.NaN, Number.POSITIVE_INFINITY])('refuses a hurtCheckFactor of %s: above 0 and at most 1, so a wound never helps', (bad) => {
    expect(withFactors(config.moraleCheckFactor, bad)).toEqual([`hurtCheckFactor is ${bad}; it is above 0 and at most 1, so that a wound never helps`]);
  });
});
