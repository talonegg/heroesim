import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { Encounter } from '../content-types.js';
import type { Hero, World } from '../document.js';
import { streamOf } from '../generators/draw.js';
import { generateHero } from '../generators/heroes.js';
import { next } from '../rng.js';
import { heroStatKeys, testContent, testDeps, testWorld } from '../world.test-support.js';
import { capability, check } from './check.js';

// M4-S2: the Check (INPUTS 6.2, DL-42). Heroes are generated, then given the Stats and Skills a test
// needs; the config values a test relies on are pinned.

const deps = testDeps({ checkVariance: 0, skillBonusPerRating: 2 });

/** An Encounter from the test content, with `fields` changed. */
function encounterWith(fields: Partial<Encounter> = {}): Encounter {
  return { ...structuredClone(testContent.encounters['hold-the-line'] as Encounter), ...fields };
}

/** A world holding `count` Heroes, every Hero Stat at `value` and no Skill, for a test to change. */
function party(seed: string, count: number, value = 8): { world: World; heroes: Hero[] } {
  const world = testWorld(seed, deps);
  const heroes = Array.from({ length: count }, () => {
    const { hero } = generateHero(world, deps);
    hero.stats = Object.fromEntries(heroStatKeys.map((key) => [key, value]));
    hero.skills = {};
    return hero;
  });
  return { world, heroes };
}

describe('capability', () => {
  const twoStats = encounterWith({ demands: [['strength', 0.5], ['courage', 0.5]], skillKeys: [] });

  test("with `best`, weighs the best member's value of each Stat", () => {
    const { world, heroes } = party('best', 3);
    const [a, b, c] = heroes as [Hero, Hero, Hero];
    a.stats['strength'] = 14;
    b.stats['courage'] = 12;
    c.stats['strength'] = 3;

    expect(capability(heroes, { ...twoStats, aggregate: 'best' }, world, deps)).toBe(0.5 * 14 + 0.5 * 12);
  });

  test("with `sum`, weighs the members' sum of each Stat", () => {
    const { world, heroes } = party('sum', 3);
    const [a, b] = heroes as [Hero, Hero, Hero];
    a.stats['strength'] = 14;
    b.stats['courage'] = 12;

    expect(capability(heroes, { ...twoStats, aggregate: 'sum' }, world, deps)).toBe(0.5 * (14 + 8 + 8) + 0.5 * (8 + 12 + 8));
  });

  test("adds skillBonusPerRating times the best rating any member holds, for each of the Encounter's Skills", () => {
    const { world, heroes } = party('skills', 2);
    const [a, b] = heroes as [Hero, Hero];
    const skilled = { ...twoStats, aggregate: 'best' as const, skillKeys: ['shieldwork', 'tactics', 'stealth'] };
    const bare = capability(heroes, skilled, world, deps);
    a.skills = { shieldwork: 2, tactics: 1, lockpicking: 5 };
    b.skills = { shieldwork: 3 };

    expect(capability(heroes, skilled, world, deps) - bare).toBe(2 * (3 + 1));
    expect(capability(heroes, skilled, world, testDeps({ skillBonusPerRating: 5 })) - bare).toBe(5 * (3 + 1));
  });

  test('counts a demand on a Stat, or a Skill, that content no longer defines for nothing (rule 5)', () => {
    const { world, heroes } = party('unknown', 1);
    const [hero] = heroes as [Hero];
    hero.skills = { tactics: 3 };
    const odd = encounterWith({ demands: [['strength', 0.5], ['luck', 0.5]], aggregate: 'best', skillKeys: ['tactics', 'juggling'] });

    expect(capability(heroes, odd, world, deps)).toBe(0.5 * 8 + 2 * 3);
  });

  test('is nothing for no members', () => {
    const { world } = party('none', 0);
    expect(capability([], twoStats, world, deps)).toBe(0);
  });
});

describe('check', () => {
  // M4-S2's first box.
  test("a Party lacking the Encounter's Skills is beaten by one holding them at rating 3 on the same Stats, with variance 0", () => {
    const { world, heroes } = party('beaten', 4);
    const [a, b, c, d] = heroes as [Hero, Hero, Hero, Hero];
    c.skills = { shieldwork: 3 };
    d.skills = { tactics: 3 };
    const encounter = encounterWith({ demands: [['strength', 0.5], ['constitution', 0.5]], aggregate: 'sum', skillKeys: ['shieldwork', 'tactics'], difficultyFactor: 1 });
    const lacking = [a, b];
    const holding = [c, d];
    // Between the two: 16 on the Stats alone, and 16 + 2 × 3 × 2 = 28 with the Skills.
    const quest = { difficulty: 20 };

    const without = check(lacking, encounter, quest, world, deps);
    const withSkills = check(holding, encounter, quest, world, deps);

    expect(without).toMatchObject({ capability: 16, roll: 16, target: 20, margin: -4, outcome: 'failure' });
    expect(withSkills).toMatchObject({ capability: 28, roll: 28, target: 20, margin: 8, outcome: 'success' });
  });

  test("succeeds when the roll reaches difficultyFactor × the Quest's difficulty, and not below it", () => {
    const { world, heroes } = party('edge', 1);
    const encounter = encounterWith({ demands: [['strength', 1]], aggregate: 'best', skillKeys: [], difficultyFactor: 0.5 });

    expect(check(heroes, encounter, { difficulty: 16 }, world, deps)).toMatchObject({ target: 8, margin: 0, outcome: 'success' });
    expect(check(heroes, encounter, { difficulty: 17 }, world, deps)).toMatchObject({ target: 8.5, outcome: 'failure' });
  });

  test('rolls the capability by 1 + a draw from −checkVariance to +checkVariance, one draw from quests', () => {
    const { world, heroes } = party('roll', 2);
    const encounter = encounterWith();
    const varied = testDeps({ checkVariance: 0.2, skillBonusPerRating: 2 });
    const twin = structuredClone(streamOf(world, 'quests'));

    const results = Array.from({ length: 200 }, () => check(heroes, encounter, { difficulty: 30 }, world, varied));

    const cap = capability(heroes, encounter, world, varied);
    for (const result of results) {
      const r = (next(twin) * 2 - 1) * 0.2;
      expect(result.roll).toBeCloseTo(cap * (1 + r), 10);
      expect(result.capability).toBe(cap);
    }
    expect(streamOf(world, 'quests')).toEqual(twin);
    expect(Math.min(...results.map((it) => it.roll))).toBeLessThan(cap * 0.85);
    expect(Math.max(...results.map((it) => it.roll))).toBeGreaterThan(cap * 1.15);
  });

  test('draws from the quests stream alone', () => {
    const { world, heroes } = party('streams', 2);
    const before = structuredClone(world.rng) as Record<string, unknown>;

    check(heroes, encounterWith(), { difficulty: 30 }, world, testDeps({ checkVariance: 0.2 }));

    const after = world.rng as Record<string, unknown>;
    for (const name of Object.keys(before)) {
      if (name === 'quests') expect(after[name], name).not.toEqual(before[name]);
      else expect(after[name], name).toEqual(before[name]);
    }
  });
});

// M4's third risk: the Guildmaster's rules are Guild-side, never in the Check.
describe('check.ts', () => {
  test('never mentions the Guildmaster', () => {
    const source = readFileSync(fileURLToPath(new URL('./check.ts', import.meta.url)), 'utf8');
    expect(source.toLowerCase()).not.toContain('guildmaster');
  });
});
