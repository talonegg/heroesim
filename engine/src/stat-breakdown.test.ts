import { describe, expect, test } from 'vitest';
import type { ContentSet, GuildmasterTrait, HeroTrait } from './content-types.js';
import { createWorld } from './create.js';
import type { Guild, Hero, World } from './document.js';
import * as engine from './index.js';
import { addStack, createItem } from './items.js';
import { playerGuild, statBreakdown } from './selectors.js';
import { testContent, testDeps } from './world.test-support.js';

// DL-186 item 3, DL-199: a Stat's breakdown; `effectiveStats` is its effective value read off.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/** A Guildmaster Trait of Class Stat bonuses, for the generated Guildmasters. */
function bonusTrait(key: string, ...bonuses: [classKey: string, statKey: string, delta: number][]): [string, GuildmasterTrait] {
  const effects = bonuses.map(([classKey, statKey, delta]) => ({ kind: 'classStatBonus' as const, classKey, statKey, delta }));
  return [key, { key, name: key, cost: 0, excludes: [], effects }];
}

/** A Hero Trait of Stat changes, for the generated Heroes. */
function markTrait(key: string, ...modifiers: Record<string, number>[]): [string, HeroTrait] {
  const effects = modifiers.map((each) => ({ kind: 'statModifiers' as const, modifiers: each }));
  return [key, { key, name: key, excludes: [], effects }];
}

/**
 * The test content with Traits that move Stats: the Guildmaster's Class bonuses on several Classes
 * and Stats, two on one Stat, and Hero Traits that change Stats, several Stats in one effect, two
 * effects in one Trait, one with no Stat change at all.
 */
const breakdownContent: ContentSet = {
  ...testContent,
  guildmasterTraits: {
    ...testContent.guildmasterTraits,
    ...Object.fromEntries([
      bonusTrait('drillmaster', ['warrior', 'strength', 2], ['rogue', 'dexterity', 1], ['warrior', 'weaponry', 2]),
      bonusTrait('harsh-tutor', ['mage', 'arcana', -3], ['healer', 'spirit', 4], ['mage', 'power', 1]),
    ]),
  },
  heroTraits: {
    ...testContent.heroTraits,
    ...Object.fromEntries([
      markTrait('stalwart', { courage: 2, constitution: -1 }),
      markTrait('frail', { constitution: -3, endurance: -2 }, { strength: -1 }),
      markTrait('gifted', { arcana: 3, power: 2, weaponry: 1 }),
      markTrait('mighty', { strength: 5 }),
    ]),
    keen: { key: 'keen', name: 'Keen', excludes: [], effects: [{ kind: 'encounterBonus', flat: 2, kinds: ['combat'] }] },
  },
};

/** A small seeded random source for the generated Heroes (mulberry32). */
function randomOf(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A world of generated Heroes, `seed`'s: every Hero of every Guild and of the pool given random base
 * Stats (some missing, some outside the Stat's range), a random Class (now and then one content
 * lacks), random Hero Traits (now and then a key content lacks), random gear in their slots (now and
 * then in a slot not its own, or of a definition content lacks), and every Guildmaster random Traits.
 */
function generatedHeroes(seed: number): { world: World; heroes: Hero[] } {
  const deps = testDeps({ rivalCount: 2, unattachedPoolSize: 4 }, breakdownContent);
  const { world } = createWorld(`breakdown-${seed}`, setup, deps).document;
  const random = randomOf(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const some = <T>(items: readonly T[], chance: number): T[] => items.filter(() => random() < chance);
  const content = breakdownContent;

  for (const guildmaster of Object.values(world.guildmasters)) {
    guildmaster.traits = some(Object.keys(content.guildmasterTraits), 0.4);
  }
  const statKeys = Object.values(content.stats)
    .filter((stat) => stat.owner === 'hero')
    .map((stat) => stat.key);
  const gear = Object.values(content.items).filter((item) => item.kind === 'gear');
  const heroes = Object.values(world.heroes);
  for (const hero of heroes) {
    hero.stats = {};
    for (const key of statKeys) {
      const roll = random();
      if (roll < 0.1) continue; // missing: the default
      hero.stats[key] = roll < 0.2 ? pick([-4, 0, 1, 20, 21, 27]) : 1 + Math.floor(random() * 20);
    }
    hero.classKey = random() < 0.05 ? 'bard' : pick(Object.keys(content.classes));
    hero.traits = [...some(Object.keys(content.heroTraits), 0.3), ...(random() < 0.05 ? ['forgotten'] : [])];
    for (const slot of ['weapon', 'armour', 'trinket'] as const) {
      if (random() < 0.4) continue;
      const fits = gear.filter((item) => item.kind === 'gear' && item.slot === slot);
      const definition = random() < 0.1 ? pick(gear) : pick(fits);
      const holder = { kind: 'hero' as const, id: hero.id, slot };
      if (random() < 0.03) addStack(world, 'lost-gear', 1, holder);
      else if (definition.unique) createItem(world, definition.key, holder);
      else addStack(world, definition.key, 1 + Math.floor(random() * 2), holder);
    }
  }
  return { world, heroes };
}

/** How many worlds the property test generates; each holds about 17 Heroes. */
const worlds = 30;

/** A world of the breakdown's content, its Guildmasters with no Trait, and a Warrior of the player's Roster with every Stat at 8 and no Trait. */
function scene(seed: string): { world: World; hero: Hero; guild: Guild } {
  const deps = testDeps({ rivalCount: 0 }, breakdownContent);
  const { world } = createWorld(seed, setup, deps).document;
  const guild = playerGuild(world) as Guild;
  for (const guildmaster of Object.values(world.guildmasters)) guildmaster.traits = [];
  const hero = world.heroes[guild.rosterIds[0] as Hero['id']] as Hero;
  hero.stats = Object.fromEntries(Object.keys(hero.stats).map((key) => [key, 8]));
  hero.classKey = 'warrior';
  hero.traits = [];
  return { world, hero, guild };
}

/** Gives the player's Guildmaster `traits`. */
function guildmasterHolds(world: World, guild: Guild, traits: string[]): void {
  const guildmaster = world.guildmasters[guild.guildmasterId];
  if (guildmaster === undefined) throw new Error('No Guildmaster');
  guildmaster.traits = traits;
}

/** A Stat's breakdown: its base, the Class bonus, the Gear and the Traits in that order, its effective value and whether it was held. */
function broken(sources: [classBonus: number, gear: number, traits: number], effective: number, clamped: boolean, base = 8) {
  return {
    base,
    sources: [
      { source: 'classBonus', change: sources[0] },
      { source: 'gear', change: sources[1] },
      { source: 'traits', change: sources[2] },
    ],
    effective,
    clamped,
  };
}

describe('statBreakdown (DL-186 item 3)', () => {
  test("is exported from the engine's entry", () => {
    expect(engine.statBreakdown).toBe(statBreakdown);
  });

  test("gives every Hero Stat content defines, in content's order, at its base with nothing moving it, and no Guildmaster Stat", () => {
    const { world, hero } = scene('breakdown-bare');
    Reflect.deleteProperty(hero.stats, 'wits');
    // A Stat content does not define, which the breakdown leaves out.
    hero.stats['luck'] = 20;

    const breakdown = statBreakdown(hero, world, breakdownContent);

    const heroStats = Object.values(breakdownContent.stats).filter((stat) => stat.owner === 'hero');
    expect(Object.keys(breakdown)).toEqual(heroStats.map((stat) => stat.key));
    expect(breakdown['strength']).toEqual(broken([0, 0, 0], 8, false));
    // A Stat the Hero lacks reads content's default.
    expect(breakdown['wits']).toEqual(broken([0, 0, 0], 10, false, 10));
  });

  test("the Guildmaster's Class bonus: each classStatBonus for the Hero's Class, summed by Stat", () => {
    const { world, hero, guild } = scene('breakdown-class');
    guildmasterHolds(world, guild, ['old-soldier', 'drillmaster']);

    const breakdown = statBreakdown(hero, world, breakdownContent);

    // Old soldier +1 and the drill master +2 on a Warrior's Weaponry; the drill master's Strength +2.
    expect(breakdown['weaponry']).toEqual(broken([3, 0, 0], 11, false));
    expect(breakdown['strength']).toEqual(broken([2, 0, 0], 10, false));
    // A Rogue's bonus is not a Warrior's.
    expect(breakdown['dexterity']).toEqual(broken([0, 0, 0], 8, false));
  });

  test("a Hero on no Roster has no Guildmaster's Class bonus", () => {
    const { world, hero, guild } = scene('breakdown-unattached');
    guildmasterHolds(world, guild, ['old-soldier']);
    expect(statBreakdown({ ...hero, guildId: null }, world, breakdownContent)['weaponry']).toEqual(broken([0, 0, 0], 8, false));
  });

  test('the Gear: the modifiers of what the Hero carries in their own slots, summed by Stat', () => {
    const { world, hero } = scene('breakdown-gear');
    createItem(world, 'barrow-kings-blade', { kind: 'hero', id: hero.id, slot: 'weapon' }); // Weaponry +4, Strength +2, Courage +1
    addStack(world, 'lucky-charm', 1, { kind: 'hero', id: hero.id, slot: 'trinket' }); // Courage +1
    addStack(world, 'mail-shirt', 1, { kind: 'hero', id: hero.id, slot: 'weapon' }); // not its slot: nothing

    const breakdown = statBreakdown(hero, world, breakdownContent);

    expect(breakdown['weaponry']).toEqual(broken([0, 4, 0], 12, false));
    expect(breakdown['courage']).toEqual(broken([0, 2, 0], 10, false));
    expect(breakdown['constitution']).toEqual(broken([0, 0, 0], 8, false));
  });

  test('the Traits: the statModifiers of the Hero Traits the Hero holds, summed by Stat, a key content lacks moving nothing', () => {
    const { world, hero } = scene('breakdown-traits');
    hero.traits = ['frail', 'mighty', 'keen', 'forgotten'];

    const breakdown = statBreakdown(hero, world, breakdownContent);

    // Frail's two effects and Mighty: Strength −1 + 5.
    expect(breakdown['strength']).toEqual(broken([0, 0, 4], 12, false));
    expect(breakdown['constitution']).toEqual(broken([0, 0, -3], 5, false));
    expect(breakdown['endurance']).toEqual(broken([0, 0, -2], 6, false));
  });

  test('the three sources together, in the order they are added: the Class bonus, the Gear, the Traits', () => {
    const { world, hero, guild } = scene('breakdown-all');
    guildmasterHolds(world, guild, ['old-soldier']);
    addStack(world, 'short-sword', 1, { kind: 'hero', id: hero.id, slot: 'weapon' }); // Weaponry +1
    hero.traits = ['gifted']; // Weaponry +1

    const weaponry = statBreakdown(hero, world, breakdownContent)['weaponry'];

    expect(weaponry?.sources.map(({ source }) => source)).toEqual(['classBonus', 'gear', 'traits']);
    expect(weaponry).toEqual(broken([1, 1, 1], 11, false));
  });

  test("the clamp: the sum held inside the Stat's range once, after every source is added", () => {
    const { world, hero, guild } = scene('breakdown-clamp');
    guildmasterHolds(world, guild, ['old-soldier']);
    createItem(world, 'barrow-kings-blade', { kind: 'hero', id: hero.id, slot: 'weapon' }); // Weaponry +4, Strength +2, Courage +1
    hero.traits = ['frail', 'mighty']; // Strength +4, Constitution −3
    hero.stats['weaponry'] = 17;
    hero.stats['strength'] = 20;
    hero.stats['constitution'] = 2;
    hero.stats['courage'] = 25;

    const breakdown = statBreakdown(hero, world, breakdownContent);

    // 17 + 1 + 4 = 22, held at 20.
    expect(breakdown['weaponry']).toEqual(broken([1, 4, 0], 20, true, 17));
    // 20 + 2 + 4 = 26, held at 20.
    expect(breakdown['strength']).toEqual(broken([0, 2, 4], 20, true, 20));
    // 2 − 3 = −1, held at 1.
    expect(breakdown['constitution']).toEqual(broken([0, 0, -3], 1, true, 2));
    // A base beyond the range: 25 + 1 held at 20.
    expect(breakdown['courage']).toEqual(broken([0, 1, 0], 20, true, 25));
  });

  test('the clamp is once, at the end: a sum that leaves the range and comes back is not held', () => {
    const { world, hero, guild } = scene('breakdown-once');
    hero.classKey = 'mage';
    guildmasterHolds(world, guild, ['harsh-tutor']); // a Mage's Arcana −3, Power +1
    addStack(world, 'runed-circlet', 1, { kind: 'hero', id: hero.id, slot: 'trinket' }); // Arcana +3
    hero.traits = ['gifted']; // Arcana +3, Power +2
    hero.stats['arcana'] = 2;
    hero.stats['power'] = 20;

    const breakdown = statBreakdown(hero, world, breakdownContent);

    // 2 − 3 + 3 + 3 = 5; holding 2 − 3 at 1 first would give 7.
    expect(breakdown['arcana']).toEqual(broken([-3, 3, 3], 5, false, 2));
    // 20 + 1 + 2 = 23, held at 20.
    expect(breakdown['power']).toEqual(broken([1, 0, 2], 20, true, 20));
  });

  test('flags a Stat clamped exactly when its sources take its sum out of the range, for every Stat of every generated Hero', () => {
    let clamped = 0;
    for (let seed = 1; seed <= worlds; seed += 1) {
      const { world, heroes } = generatedHeroes(seed);
      for (const hero of heroes) {
        const breakdown = statBreakdown(hero, world, breakdownContent);
        for (const stat of Object.values(breakdown)) {
          const sum = stat.sources.reduce((value, { change }) => value + change, stat.base);
          expect(stat.clamped).toBe(sum !== stat.effective);
          if (stat.clamped) clamped += 1;
        }
      }
    }
    expect(clamped).toBeGreaterThan(200);
  });
});
