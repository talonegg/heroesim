import { describe, expect, test } from 'vitest';
import type { ContentSet } from '../content-types.js';
import { createWorld, type WorldSetup } from '../create.js';
import { pick } from '../rng.js';
import { dealByWeight, dealEvenly, drawPersonName, pickByWeight, sexes, sortedKeys, streamOf } from './draw.js';
import { generateGuild, type GuildOptions } from './guilds.js';
import { generateHero } from './heroes.js';
import { generatePatron } from './patrons.js';
import { generateQuest } from './quests.js';
import { testContent, testDeps, testWorld } from '../world.test-support.js';

// Draw weights (DL-186 item 16, DL-202): a Class, Background, Quest template or Sphere with no
// `weight` is drawn as it was by `pick`, and every Hero's sex by `heroSexWeights`, equal by default.

/** `content` with every row of its four weighted tables given `weight`, or given the weights `by` names by key. */
function weighted(weight: number, by: Readonly<Record<string, number>> = {}): ContentSet {
  const give = <Row extends object>(table: Record<string, Row>): Record<string, Row> =>
    Object.fromEntries(Object.entries(table).map(([key, row]) => [key, { ...row, weight: by[key] ?? weight }]));
  return {
    ...testContent,
    classes: give(testContent.classes),
    backgrounds: give(testContent.backgrounds),
    spheres: give(testContent.spheres),
    questTemplates: give(testContent.questTemplates),
  };
}

describe('a Hero is drawn as pick draws it when no row has a weight, or every weight is 1', () => {
  test.each([
    ['no weight', testContent],
    ['every weight 1', weighted(1)],
  ])('sex, Background and Class, with %s', (_what, content) => {
    const deps = testDeps({}, content);
    const world = testWorld('weights-hero', deps);
    for (let index = 0; index < 400; index += 1) {
      // What the Hero Generator drew before weights: `pick` from a copy of the stream, in its order.
      const state = structuredClone(streamOf(world));
      const sex = pick(state, sexes);
      drawPersonName(state, content.names, sex);
      const backgroundKey = pick(state, sortedKeys(content.backgrounds, (row) => row.owner === 'hero'));
      const classKey = pick(state, sortedKeys(content.classes));

      const { hero } = generateHero(world, deps);

      expect([hero.sex, hero.backgroundKey, hero.classKey]).toEqual([sex, backgroundKey, classKey]);
    }
  });

  test('a Guild is given the Background pick gives it', () => {
    const deps = testDeps({}, weighted(1));
    const world = testWorld('weights-guild', deps);
    const state = structuredClone(streamOf(world));
    // The Guild's name is the draw before it (`drawGuildName`); a Guild given its name takes none.
    const guild = generateGuild(world, deps, { controller: { kind: 'player' }, rosterSize: 0, wealth: 0, name: 'The Test Guild' }).guild;

    expect(guild.backgroundKey).toBe(pick(state, sortedKeys(testContent.backgrounds, (row) => row.owner === 'guild')));
  });
});

describe('a weight changes the odds', () => {
  const draws = 600;

  test("a Class weighted 0 is never a Hero's, and one weighted above the rest is the likeliest", () => {
    const deps = testDeps({}, weighted(1, { warrior: 0, rogue: 0, mage: 0 }));
    const world = testWorld('weights-class', deps);
    for (let index = 0; index < draws; index += 1) expect(generateHero(world, deps).hero.classKey).toBe('healer');

    const heavy = testDeps({}, weighted(1, { mage: 9 }));
    const counts: Record<string, number> = {};
    const second = testWorld('weights-class-heavy', heavy);
    for (let index = 0; index < draws; index += 1) {
      const { classKey } = generateHero(second, heavy).hero;
      counts[classKey] = (counts[classKey] ?? 0) + 1;
    }
    expect((counts['mage'] ?? 0) / draws).toBeGreaterThan(0.6);
  });

  test("a Background weighted 0 is never a Hero's", () => {
    const heroBackgrounds = sortedKeys(testContent.backgrounds, (row) => row.owner === 'hero');
    const [kept, ...rest] = heroBackgrounds;
    const deps = testDeps({}, weighted(1, Object.fromEntries(rest.map((key) => [key, 0]))));
    const world = testWorld('weights-background', deps);
    for (let index = 0; index < 100; index += 1) expect(generateHero(world, deps).hero.backgroundKey).toBe(kept);
  });

  test("a Sphere weighted 0 is never a Patron's", () => {
    const [, ...others] = sortedKeys(testContent.spheres);
    const deps = testDeps({}, weighted(1, Object.fromEntries(others.map((key) => [key, 0]))));
    const world = testWorld('weights-sphere', deps);
    const spheres = new Set<string>();
    for (let index = 0; index < 8; index += 1) spheres.add(generatePatron(world, deps).patron.sphereKey);

    expect([...spheres]).toEqual([sortedKeys(testContent.spheres)[0]]);
  });

  test("a Quest template weighted 0 is never offered by a Patron who could offer it", () => {
    const deps = testDeps({}, weighted(1, { 'hold-the-border-fort': 0 }));
    const world = testWorld('weights-template', deps);
    const { patron } = generatePatron(world, deps, { sphereKey: 'crown' });
    for (let index = 0; index < 80; index += 1) expect(generateQuest(world, patron, deps).quest.templateKey).toBe('clear-the-barrow');
  });

  test("a sex weighted 0 is never a Hero's, and the weights are read from the config", () => {
    for (const [weights, only] of [
      [{ female: 0, male: 1 }, 'male'],
      [{ female: 2, male: 0 }, 'female'],
    ] as const) {
      const deps = testDeps({ heroSexWeights: weights });
      const world = testWorld(`weights-sex-${only}`, deps);
      for (let index = 0; index < 100; index += 1) expect(generateHero(world, deps).hero.sex).toBe(only);
    }
    const skewed = testDeps({ heroSexWeights: { female: 1, male: 3 } });
    const world = testWorld('weights-sex-skew', skewed);
    const males = Array.from({ length: draws }, () => generateHero(world, skewed).hero.sex).filter((sex) => sex === 'male').length;
    expect(Math.abs(males / draws - 0.75)).toBeLessThan(0.06);
  });
});

// The deals at creation (DL-206 item 1, DL-208): a Guild's starting Roster and the Patrons'
// Spheres are dealt evenly, as `dealEvenly` deals, while every weight is 1, and by weight otherwise; a
// Guildmaster's sex is drawn by `guildmasterSexWeights`.

describe('dealByWeight', () => {
  const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  test.each([
    ['no weight', (key: string): { key: string; weight?: number } => ({ key })],
    ['every weight 1', (key: string): { key: string; weight?: number } => ({ key, weight: 1 })],
  ])('with %s, deals what dealEvenly deals and leaves the stream where it leaves it', (_what, row) => {
    const world = testWorld('deal-even', testDeps());
    for (let size = 1; size <= letters.length; size += 1) {
      const rows = letters.slice(0, size).map(row);
      for (let count = 0; count <= 12; count += 1) {
        const even = structuredClone(streamOf(world));
        const weighed = structuredClone(streamOf(world));

        expect(dealByWeight(weighed, rows, count)).toEqual(dealEvenly(even, rows, count));
        expect(weighed).toEqual(even);
        // The next round starts from where this one left the stream.
        Object.assign(streamOf(world), even);
      }
    }
  });

  test('with any weight not 1, draws each place by pickByWeight, one draw each', () => {
    const world = testWorld('deal-weighed', testDeps());
    const rows = [{ key: 'a', weight: 2 }, { key: 'b' }, { key: 'c', weight: 0 }];
    for (let count = 0; count <= 12; count += 1) {
      const one = structuredClone(streamOf(world));
      const dealt = structuredClone(streamOf(world));
      const expected = Array.from({ length: count }, () => pickByWeight(one, rows));

      expect(dealByWeight(dealt, rows, count)).toEqual(expected);
      expect(dealt).toEqual(one);
      expect(expected.some((row) => row.key === 'c')).toBe(false);
      Object.assign(streamOf(world), one);
    }
  });

  test('refuses what dealEvenly refuses', () => {
    const state = structuredClone(streamOf(testWorld('deal-refused', testDeps())));
    for (const rows of [[{ key: 'a' }], [{ key: 'a', weight: 2 }]] as { key: string; weight?: number }[][]) {
      expect(() => dealByWeight(state, rows, -1)).toThrow(RangeError);
      expect(() => dealByWeight(state, rows, 1.5)).toThrow(RangeError);
    }
    expect(() => dealByWeight(state, [], 1)).toThrow(RangeError);
    expect(dealByWeight(state, [], 0)).toEqual([]);
  });
});

const guildOptions: Omit<GuildOptions, 'rosterSize'> = {
  controller: { kind: 'player' },
  wealth: 0,
  name: 'The Test Guild',
  backgroundKey: 'old-charter',
};

const setup: WorldSetup = {
  guildmasterName: 'Aldith Barrowby',
  guildName: 'The Salt Road Guild',
  backgroundKey: 'old-charter',
  createdAt: 'harness',
};

describe("a starting Roster and the Patrons' Spheres are dealt as dealEvenly deals them when every weight is 1", () => {
  test.each([
    ['no weight', testContent],
    ['every weight 1', weighted(1)],
  ])('a Roster of 1 to 12, with %s', (_what, content) => {
    const deps = testDeps({}, content);
    for (let size = 1; size <= 12; size += 1) {
      // The even deal by hand: the Guild, then `dealEvenly` over the Classes from where that left the
      // stream, then a Hero of each Class dealt, in turn (DL-19 item 7, DL-208).
      const before = testWorld(`deal-roster-${size}`, deps);
      const { guild } = generateGuild(before, deps, { ...guildOptions, rosterSize: 0 });
      const classKeys = dealEvenly(streamOf(before), sortedKeys(content.classes), size);
      for (const classKey of classKeys) generateHero(before, deps, { classKey, guildId: guild.id });

      const world = testWorld(`deal-roster-${size}`, deps);
      const dealt = generateGuild(world, deps, { ...guildOptions, rosterSize: size });

      expect(dealt.guild.rosterIds.map((id) => world.heroes[id]?.classKey)).toEqual(classKeys);
      expect(world).toEqual(before);
    }
  });

  test.each([
    ['no weight', testContent],
    ['every weight 1', weighted(1)],
  ])('the Spheres for 1 to 12 Patrons, with %s', (_what, content) => {
    for (let patrons = 1; patrons <= 12; patrons += 1) {
      // The even deal by hand: the world with no Patron, then `dealEvenly` over the Spheres from where
      // that left the stream, then a Patron of each Sphere dealt, in turn (DL-208).
      const none = testDeps({ patronCount: 0, unattachedPoolSize: 0 }, content);
      const before = createWorld(`deal-spheres-${patrons}`, setup, none).document.world;
      const sphereKeys = dealEvenly(streamOf(before), sortedKeys(content.spheres), patrons);
      for (const sphereKey of sphereKeys) generatePatron(before, none, { sphereKey });

      const deps = testDeps({ patronCount: patrons, unattachedPoolSize: 0 }, content);
      const world = createWorld(`deal-spheres-${patrons}`, setup, deps).document.world;

      expect(Object.values(world.patrons).map((patron) => patron.sphereKey)).toEqual(sphereKeys);
      expect(world.patrons).toEqual(before.patrons);
      expect(world.rng.generation).toEqual(before.rng.generation);
    }
  });

  test("a Guildmaster's sex is the one pick draws, with the weights equal", () => {
    const deps = testDeps({ guildmasterSexWeights: { female: 1, male: 1 } });
    for (let index = 0; index < 200; index += 1) {
      const world = testWorld(`deal-sex-${index}`, deps);
      // With the Guild's name and Background given, the Guildmaster's sex is the stream's first draw.
      const sex = pick(structuredClone(streamOf(world)), sexes);

      expect(generateGuild(world, deps, { ...guildOptions, rosterSize: 0 }).guildmaster.sex).toBe(sex);
    }
  });
});

describe('a weight changes the deals at creation', () => {
  const draws = 600;

  /** The Classes of `guilds` starting Rosters of 12, each a Guild of its own world, counted by Class. */
  function rosterClasses(content: ContentSet, seed: string, guilds: number): Record<string, number> {
    const deps = testDeps({}, content);
    const counts: Record<string, number> = {};
    for (let index = 0; index < guilds; index += 1) {
      const world = testWorld(`${seed}-${index}`, deps);
      const { guild } = generateGuild(world, deps, { ...guildOptions, rosterSize: 12 });
      for (const id of guild.rosterIds) {
        const classKey = world.heroes[id]?.classKey ?? '';
        counts[classKey] = (counts[classKey] ?? 0) + 1;
      }
    }
    return counts;
  }

  /** The Spheres of 12 Patrons in each of `worlds` new worlds, counted by Sphere. */
  function patronSpheres(content: ContentSet, seed: string, worlds: number): Record<string, number> {
    const deps = testDeps({ patronCount: 12, unattachedPoolSize: 0, rivalCount: 0 }, content);
    const counts: Record<string, number> = {};
    for (let index = 0; index < worlds; index += 1) {
      for (const patron of Object.values(createWorld(`${seed}-${index}`, setup, deps).document.world.patrons)) {
        counts[patron.sphereKey] = (counts[patron.sphereKey] ?? 0) + 1;
      }
    }
    return counts;
  }

  /** The key counted most in `counts`. */
  const likeliest = (counts: Record<string, number>): string =>
    Object.entries(counts).reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];

  test('a Class weighted 0 is never in a starting Roster, and one weighted above the rest is the likeliest', () => {
    expect(Object.keys(rosterClasses(weighted(1, { warrior: 0, rogue: 0, mage: 0 }), 'deal-class-0', 20))).toEqual(['healer']);

    const heavy = rosterClasses(weighted(1, { mage: 9 }), 'deal-class-heavy', 20);
    expect(likeliest(heavy)).toBe('mage');
    // 9 of 12: a share of 0.75.
    expect((heavy['mage'] ?? 0) / 240).toBeGreaterThan(0.6);
  });

  test('a Sphere weighted 0 is never dealt to a Patron, and one weighted above the rest is the likeliest', () => {
    const [kept, heavy, ...others] = sortedKeys(testContent.spheres) as [string, string, ...string[]];
    const zeroes = Object.fromEntries([heavy, ...others].map((key) => [key, 0]));
    expect(Object.keys(patronSpheres(weighted(1, zeroes), 'deal-sphere-0', 4))).toEqual([kept]);

    const counts = patronSpheres(weighted(1, { [heavy]: 9 }), 'deal-sphere-heavy', 20);
    expect(likeliest(counts)).toBe(heavy);
    // 9 of 14: a share of about 0.64.
    expect((counts[heavy] ?? 0) / 240).toBeGreaterThan(0.5);
  });

  test("a Guildmaster's sex weighted 0 is never drawn, the weights are read from the config, and a sex chosen replaces the one drawn", () => {
    for (const [weights, only] of [
      [{ female: 0, male: 1 }, 'male'],
      [{ female: 2, male: 0 }, 'female'],
    ] as const) {
      const deps = testDeps({ guildmasterSexWeights: weights });
      for (let index = 0; index < 60; index += 1) {
        const world = testWorld(`deal-gm-sex-${only}-${index}`, deps);
        expect(generateGuild(world, deps, { ...guildOptions, rosterSize: 0 }).guildmaster.sex).toBe(only);
      }
    }
    // A sex chosen at setup replaces the one drawn, after the draw.
    const male = testDeps({ guildmasterSexWeights: { female: 0, male: 1 } });
    const chosen = testWorld('deal-gm-sex-chosen', male);
    expect(generateGuild(chosen, male, { ...guildOptions, rosterSize: 0, guildmaster: { sex: 'female' } }).guildmaster.sex).toBe('female');

    const skewed = testDeps({ guildmasterSexWeights: { female: 1, male: 3 } });
    let males = 0;
    for (let index = 0; index < draws; index += 1) {
      const world = testWorld(`deal-gm-sex-skew-${index}`, skewed);
      if (generateGuild(world, skewed, { ...guildOptions, rosterSize: 0 }).guildmaster.sex === 'male') males += 1;
    }
    expect(Math.abs(males / draws - 0.75)).toBeLessThan(0.06);
  });

  test("a Hero's sex does not read a Guildmaster's weights", () => {
    const deps = testDeps({ guildmasterSexWeights: { female: 0, male: 1 } });
    const world = testWorld('deal-hero-sex', deps);
    const heroSexes = new Set(Array.from({ length: 60 }, () => generateHero(world, deps).hero.sex));
    expect([...heroSexes].sort()).toEqual(['female', 'male']);
  });
});
