import { describe, expect, test } from 'vitest';
import type { Encounter } from '../content-types.js';
import type { Hero, World } from '../document.js';
import { generateHero } from '../generators/heroes.js';
import { relationship } from '../hero-regard.js';
import { regardBand } from '../regard.js';
import {
  demandsCheck,
  encounterCapability as capability,
  encounterCheck as check,
  heroStatKeys,
  testContent,
  testDeps,
  testWorld,
} from '../world.test-support.js';
import { teamwork } from './teamwork.js';

// M4-S4: the teamwork scalar M4-S2's Check multiplies capability by (DL-42's seam, DL-46): 1 plus
// `teamworkRange` times the Party's mean pairwise Relationship as a share of the scale's reach. The
// config values these tests rely on are pinned.

const deps = testDeps({
  checkVariance: 0,
  skillBonusPerRating: 2,
  teamworkRange: 0.1,
  regardMin: -20,
  regardMax: 20,
  regardBands: { hostile: -20, cool: -12, neutral: -4, warm: 4, close: 12 },
});

/** A world holding `count` Heroes, every Hero Stat at `value`, no Skill and no Regard. */
function party(seed: string, count: number, value = 8): { world: World; heroes: Hero[] } {
  const world = testWorld(seed, deps);
  const heroes = Array.from({ length: count }, () => {
    const { hero } = generateHero(world, deps);
    hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, value]));
    hero.skills = {};
    hero.regard = {};
    return hero;
  });
  return { world, heroes };
}

/** Sets every Hero of `heroes`' Regard for each other to `value`. */
function regardAll(heroes: readonly Hero[], value: number): void {
  for (const hero of heroes) {
    for (const other of heroes) {
      if (other.id !== hero.id) hero.regard[other.id] = { value, since: 0, reason: 'quest.resolved' };
    }
  }
}

describe('teamwork', () => {
  test('is 1 for a Party at neutral, and for a Party of one, who has no pair (DL-46)', () => {
    const { world, heroes } = party('neutral', 3);
    const [alone] = heroes as [Hero];
    alone.regard[(heroes[1] as Hero).id] = { value: 20, since: 0, reason: 'quest.resolved' };

    expect(teamwork(heroes.slice(1), world, deps)).toBe(1);
    expect(teamwork([alone], world, deps)).toBe(1);
    expect(teamwork([], world, deps)).toBe(1);
  });

  test('runs from 1 − teamworkRange at the bottom of the Relationship range to 1 + teamworkRange at its top (INPUTS 6.3)', () => {
    const { world, heroes } = party('range', 3);

    regardAll(heroes, 20);
    expect(teamwork(heroes, world, deps)).toBeCloseTo(1.1, 12);
    regardAll(heroes, -20);
    expect(teamwork(heroes, world, deps)).toBeCloseTo(0.9, 12);
    regardAll(heroes, 10);
    expect(teamwork(heroes, world, deps)).toBeCloseTo(1.05, 12);
    expect(teamwork(heroes, world, testDeps({ ...deps.config, teamworkRange: 0.3 }))).toBeCloseTo(1.15, 12);
    expect(teamwork(heroes, world, testDeps({ ...deps.config, teamworkRange: 0 }))).toBe(1);
  });

  test('reads the mean pairwise Relationship, each the mean of two Regards', () => {
    const { world, heroes } = party('mean', 3);
    const [a, b, c] = heroes as [Hero, Hero, Hero];
    // a–b: 20 one way and nothing back, 10; a–c: −20 both ways; b–c: nothing. Mean (10 − 20 + 0) / 3.
    a.regard[b.id] = { value: 20, since: 0, reason: 'quest.resolved' };
    a.regard[c.id] = { value: -20, since: 0, reason: 'quest.resolved' };
    c.regard[a.id] = { value: -20, since: 0, reason: 'quest.resolved' };

    expect(teamwork(heroes, world, deps)).toBeCloseTo(1 + 0.1 * (-10 / 3 / 20), 12);
    expect(teamwork([a, b], world, deps)).toBeCloseTo(1.05, 12);
  });
});

describe('the Check with teamwork', () => {
  // M4-S4's third box.
  test('a close Party out-scores a hostile one on identical Stats, with variance 0', () => {
    const { world, heroes } = party('close-and-hostile', 4);
    const [a, b, c, d] = heroes as [Hero, Hero, Hero, Hero];
    const close = [a, b];
    const hostile = [c, d];
    regardAll(close, 20);
    regardAll(hostile, -20);
    const encounter: Encounter = {
      ...structuredClone(testContent.encounters['hold-the-line'] as Encounter),
      checks: [demandsCheck('hold-the-line', 'Hold the line', 'sum', [['strength', 0.5], ['constitution', 0.5]], [], 1)],
    };
    const quest = { difficulty: 16 };

    expect(regardBand(relationship(a.id, b.id, world, deps.config), deps.config)).toBe('close');
    expect(regardBand(relationship(c.id, d.id, world, deps.config), deps.config)).toBe('hostile');
    // 16 on the Stats alone, the same for both: × 1.1 and × 0.9.
    expect(capability(close, encounter, world, deps)).toBeCloseTo(17.6, 12);
    expect(capability(hostile, encounter, world, deps)).toBeCloseTo(14.4, 12);

    const together = check(close, encounter, quest, world, deps);
    const apart = check(hostile, encounter, quest, world, deps);

    expect(together.roll).toBeGreaterThan(apart.roll);
    expect(together).toMatchObject({ target: 16, outcome: 'success' });
    expect(apart).toMatchObject({ target: 16, outcome: 'failure' });
  });
});
