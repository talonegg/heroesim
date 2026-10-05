import { describe, expect, test } from 'vitest';
import type { ContentSet } from '../content-types.js';
import { pick } from '../rng.js';
import { drawPersonName, sexes, sortedKeys, streamOf } from './draw.js';
import { generateGuild } from './guilds.js';
import { generateHero } from './heroes.js';
import { generatePatron } from './patrons.js';
import { generateQuest } from './quests.js';
import { testContent, testDeps, testWorld } from '../world.test-support.js';

// Draw weights (v1.1.6-S16, DL-186 item 16, DL-202): a Class, Background, Quest template or Sphere with no
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
