import { describe, expect, test } from 'vitest';
import type { GameConfig } from './config.js';
import type { Hero } from './document.js';
import { generateHero } from './generators/heroes.js';
import { growOneLevel, levelsDue, xpForLevel, xpToNextLevel } from './progression.js';
import { createStreams, next } from './rng.js';
import { heroStatKeys, testContent, testDeps, testWorld } from './world.test-support.js';

// M3-S1: the XP curve and one Level's growth (INPUTS 5.2, 5.3, DL-36). The night phase that applies
// them is tested in phases/level-ups.test.ts.

/** INPUTS 5.2 and 5.3's values, pinned: these tests are written against them, not the defaults. */
const curve: Pick<GameConfig, 'xpCurveBase' | 'xpCurveExponent' | 'levelCap' | 'growthPointsPerLevel'> = {
  xpCurveBase: 100,
  xpCurveExponent: 2,
  levelCap: 20,
  growthPointsPerLevel: 3,
};
const deps = testDeps(curve);

/** A fresh `progression` stream from `seed`. */
function stream(seed: string) {
  return createStreams(seed, ['progression']).progression;
}

/** A generated Hero of `classKey` with every Stat at `stat` and every Potential at `potential`. */
function heroWith(classKey: string, stat: number, potential: number): Hero {
  const { hero } = generateHero(testWorld(`hero-${classKey}`, deps), deps, { classKey });
  hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, stat]));
  hero.potential = Object.fromEntries(heroStatKeys.map((key) => [key, potential]));
  return hero;
}

describe('the XP curve', () => {
  test('takes xpCurveBase × Level^xpCurveExponent to go from a Level to the next: 100 × Level²', () => {
    expect([1, 2, 3, 10, 19].map((level) => xpToNextLevel(level, curve))).toEqual([100, 400, 900, 10_000, 36_100]);
  });

  test('xpForLevel is the XP earned on reaching a Level: 0 at the first, then the steps below it summed', () => {
    expect([1, 2, 3, 4, 5].map((level) => xpForLevel(level, curve))).toEqual([0, 100, 500, 1400, 3000]);
    // 100 × (1² + … + 19²) = 100 × 2,470.
    expect(xpForLevel(20, curve)).toBe(247_000);
    for (let level = 1; level < 30; level += 1) {
      expect(xpForLevel(level + 1, curve) - xpForLevel(level, curve)).toBe(xpToNextLevel(level, curve));
    }
  });

  test('rounds each step to the nearest whole XP under a curve that does not give whole numbers', () => {
    const odd = { xpCurveBase: 10, xpCurveExponent: 1.5 };

    // 10 × 2^1.5 = 28.28…, 10 × 3^1.5 = 51.96…
    expect([1, 2, 3].map((level) => xpToNextLevel(level, odd))).toEqual([10, 28, 52]);
    expect(xpForLevel(4, odd)).toBe(90);
  });

  test('refuses a Level that is not a whole number from 1', () => {
    for (const level of [0, -1, 1.5, Number.NaN]) {
      expect(() => xpForLevel(level, curve)).toThrow(RangeError);
      expect(() => xpToNextLevel(level, curve)).toThrow(RangeError);
    }
  });
});

describe('levelsDue', () => {
  test('counts every Level whose XP the Hero has reached, one short of a threshold counting nothing', () => {
    expect(levelsDue({ level: 1, xp: 99 }, curve)).toBe(0);
    expect(levelsDue({ level: 1, xp: 100 }, curve)).toBe(1);
    expect(levelsDue({ level: 1, xp: 1399 }, curve)).toBe(2);
    expect(levelsDue({ level: 1, xp: 1400 }, curve)).toBe(3);
    expect(levelsDue({ level: 3, xp: 1400 }, curve)).toBe(1);
  });

  test('never counts past levelCap, however much XP the Hero holds', () => {
    const capped = { ...curve, levelCap: 5 };

    expect(levelsDue({ level: 1, xp: 10_000_000 }, capped)).toBe(4);
    expect(levelsDue({ level: 5, xp: 10_000_000 }, capped)).toBe(0);
    // A Hero already past a lowered cap gains nothing and loses nothing.
    expect(levelsDue({ level: 7, xp: 10_000_000 }, capped)).toBe(0);
  });

  test('counts from the Level the Hero holds: a Level set above its XP waits for the next threshold', () => {
    expect(levelsDue({ level: 5, xp: 0 }, curve)).toBe(0);
    expect(levelsDue({ level: 5, xp: xpForLevel(6, curve) }, curve)).toBe(1);
  });
});

describe('growOneLevel', () => {
  test('takes exactly growthPointsPerLevel draws from the stream it is given, wherever they land', () => {
    for (const [stat, potential] of [
      [5, 20],
      [12, 12],
    ] as const) {
      for (const points of [0, 1, 3, 7]) {
        const state = stream('draw-count');
        const expected = stream('draw-count');
        for (let draw = 0; draw < points; draw += 1) next(expected);

        const growth = growOneLevel(heroWith('warrior', stat, potential), state, testDeps({ ...curve, growthPointsPerLevel: points }));

        expect(state).toEqual(expected);
        const risen = Object.values(growth.statDeltas).reduce((sum, delta) => sum + delta, 0);
        expect(risen + growth.pointsLost).toBe(points);
      }
    }
  });

  test('raises base Stats by the deltas it reports, and touches nothing else on the Hero', () => {
    const hero = heroWith('mage', 5, 20);
    const before = structuredClone(hero);

    const { statDeltas, pointsLost } = growOneLevel(hero, stream('deltas'), deps);

    expect(pointsLost).toBe(0);
    const expected = { ...before.stats };
    for (const [key, delta] of Object.entries(statDeltas)) expected[key] = (expected[key] ?? 0) + delta;
    expect(hero).toEqual({ ...before, stats: expected });
    expect(Object.values(statDeltas).every((delta) => delta > 0)).toBe(true);
  });

  test("weighs the points by the Class's growth weights: two thirds on its four leading Stats (INPUTS 5.3)", () => {
    const hero = heroWith('rogue', 1, 20);
    const leading = testContent.classes.rogue?.leadingStats ?? [];
    const state = stream('weights');
    let onLeading = 0;
    let total = 0;
    for (let level = 0; level < 20; level += 1) {
      const { statDeltas } = growOneLevel(hero, state, deps);
      for (const [key, delta] of Object.entries(statDeltas)) {
        total += delta;
        if (leading.includes(key)) onLeading += delta;
      }
    }

    // 60 points, none lost with 19 to grow on every Stat; two thirds is 40.
    expect(total).toBe(60);
    expect(onLeading).toBeGreaterThan(30);
    expect(onLeading).toBeLessThan(50);
  });

  test('loses a point that falls on a Stat at its Potential rather than redirecting it', () => {
    // Every Stat at its Potential but Strength, a leading Stat of the Warrior's with a sixth of the weight.
    const hero = heroWith('warrior', 8, 8);
    hero.potential.strength = 20;
    const state = stream('lost');
    let strength = 0;
    let lost = 0;
    for (let level = 0; level < 4; level += 1) {
      const growth = growOneLevel(hero, state, deps);
      expect(Object.keys(growth.statDeltas).every((key) => key === 'strength')).toBe(true);
      strength += growth.statDeltas.strength ?? 0;
      lost += growth.pointsLost;
    }

    expect(strength + lost).toBe(12);
    expect(lost).toBeGreaterThan(strength);
    expect(hero.stats.strength).toBe(8 + strength);
    for (const key of heroStatKeys) if (key !== 'strength') expect(hero.stats[key]).toBe(8);
  });

  test("never raises a Stat past content's maximum, even under a Potential above it", () => {
    const hero = heroWith('healer', 20, 25);

    const growth = growOneLevel(hero, stream('max'), deps);

    expect(growth).toEqual({ statDeltas: {}, pointsLost: 3 });
    expect(Object.values(hero.stats).every((value) => value === 20)).toBe(true);
  });

  test('grows nothing for a Class content no longer defines, still taking its draws (data-model rule 5)', () => {
    const hero = heroWith('warrior', 5, 20);
    hero.classKey = 'bard';
    const state = stream('unknown-class');
    const expected = stream('unknown-class');
    for (let draw = 0; draw < 3; draw += 1) next(expected);

    expect(growOneLevel(hero, state, deps)).toEqual({ statDeltas: {}, pointsLost: 3 });
    expect(state).toEqual(expected);
  });
});
