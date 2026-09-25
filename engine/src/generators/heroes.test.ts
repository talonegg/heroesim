import { describe, expect, test } from 'vitest';
import { facilityKeys, makeId, type Guild, type Hall, type Hero, type World } from '../document.js';
import type { StreamName } from '../rng.js';
import { generateHero } from './heroes.js';
import { plannedStreams, testDeps, testWorld } from '../world.test-support.js';

function heroes(world: World, deps = testDeps(), count: number, classKey?: string): Hero[] {
  const made: Hero[] = [];
  for (let i = 0; i < count; i += 1) {
    made.push(generateHero(world, deps, classKey === undefined ? {} : { classKey }).hero);
  }
  return made;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** A Guild row to put Heroes on, without the Guild Generator. */
function bareGuild(world: World): Guild {
  const guild: Guild = {
    id: makeId('guilds', 1),
    name: 'The Test Guild',
    backgroundKey: 'breakaway',
    foundedTurn: 0,
    guildmasterId: makeId('guildmasters', 1),
    rosterIds: [],
    wealth: 0,
    fame: 0,
    belowFloorSince: null,
    foldedOnTurn: null,
    hall: Object.fromEntries(facilityKeys.map((key) => [key, 0])) as Hall,
    controller: { kind: 'player' },
    regard: {},
  };
  world.guilds[guild.id] = guild;
  return guild;
}

describe('generateHero', () => {
  test('makes an Unattached Level 1 Hero with no XP, Injury, Traits or Regard, at the Morale baseline', () => {
    const deps = testDeps();
    const world = testWorld('fresh', deps);
    world.turn = 7;
    const { hero } = generateHero(world, deps);

    expect(hero).toMatchObject({
      guildId: null,
      partyId: null,
      xp: 0,
      level: 1,
      injury: null,
      traits: [],
      morale: deps.config.moraleBaseline,
      diedOnTurn: null,
      retiredOnTurn: null,
      regard: {},
      enteredTurn: 7,
    });
    expect(world.heroes[hero.id]).toBe(hero);
    expect(['female', 'male']).toContain(hero.sex);
    expect(deps.content.backgrounds[hero.backgroundKey]?.owner).toBe('hero');
    expect(Object.keys(deps.content.classes)).toContain(hero.classKey);
  });

  test("takes its id from world.counters and advances the counter", () => {
    const deps = testDeps();
    const world = testWorld('ids', deps);
    const [first, second] = heroes(world, deps, 2);

    expect(first?.id).toBe('hero-000001');
    expect(second?.id).toBe('hero-000002');
    expect(world.counters.heroes).toBe(3);
    expect(world.counters.guilds).toBe(1);
  });

  test('over 10,000 Heroes every Stat stays in its content range and Potential is at least the base', () => {
    const deps = testDeps();
    const world = testWorld('ranges', deps);
    const heroStats = Object.values(deps.content.stats).filter((stat) => stat.owner === 'hero');

    for (const hero of heroes(world, deps, 10_000)) {
      expect(Object.keys(hero.stats).sort()).toEqual(heroStats.map((stat) => stat.key).sort());
      expect(Object.keys(hero.potential).sort()).toEqual(Object.keys(hero.stats).sort());
      for (const { key, min, max } of heroStats) {
        const base = hero.stats[key] ?? Number.NaN;
        const potential = hero.potential[key] ?? Number.NaN;
        if (!(Number.isInteger(base) && base >= min && base <= max)) {
          expect.fail(`${hero.id}'s ${key} is ${base}, outside ${min}–${max}`);
        }
        if (!(Number.isInteger(potential) && potential >= base && potential <= max)) {
          expect.fail(`${hero.id}'s ${key} Potential is ${potential} against a base of ${base}`);
        }
      }
    }
  });

  test("a Warrior's mean Strength exceeds a Mage's by at least the minimum bias", () => {
    const deps = testDeps();
    const world = testWorld('bias', deps);
    const warriors = heroes(world, deps, 5000, 'warrior');
    const mages = heroes(world, deps, 5000, 'mage');
    const strength = (hero: Hero): number => hero.stats.strength ?? Number.NaN;

    expect(deps.content.classes.warrior?.leadingStats).toContain('strength');
    expect(deps.content.classes.mage?.leadingStats).not.toContain('strength');
    expect(mean(warriors.map(strength)) - mean(mages.map(strength))).toBeGreaterThanOrEqual(
      deps.config.statBiasMin,
    );
  });

  test("holds only Skills its Class gates, as many and as highly rated as the config allows", () => {
    const deps = testDeps();
    const world = testWorld('skills', deps);
    const counts = new Set<number>();
    const ratings = new Set<number>();

    for (const hero of heroes(world, deps, 2000)) {
      const gated = deps.content.classes[hero.classKey]?.gatedSkills ?? [];
      const held = Object.keys(hero.skills);
      for (const key of held) expect(gated).toContain(key);
      counts.add(held.length);
      for (const rating of Object.values(hero.skills)) ratings.add(rating);
    }

    expect([...counts].sort()).toEqual([deps.config.startingSkillsMin, deps.config.startingSkillsMax]);
    expect([...ratings].sort()).toEqual([1, deps.config.startingSkillRatingMax]);
  });

  test('draws only from generation: every other planned stream is unchanged', () => {
    const deps = testDeps();
    const world = testWorld('streams', deps, plannedStreams);
    const before = structuredClone(world.rng);
    heroes(world, deps, 1000);

    const others = plannedStreams.filter((name) => name !== 'generation');
    expect(others).toHaveLength(8);
    for (const name of others) {
      expect((world.rng as Record<string, unknown>)[name], name).toEqual(
        (before as Record<string, unknown>)[name],
      );
    }
    expect(world.rng.generation).not.toEqual(before.generation);
  });

  test('draws from the stream its caller names instead (M2-S8 names pool)', () => {
    const deps = testDeps();
    const fromPool = testWorld('named-stream', deps, plannedStreams);
    const fromGeneration = testWorld('named-stream', deps, plannedStreams);
    const before = structuredClone(fromPool.rng);
    const { hero } = generateHero(fromPool, deps, { stream: 'pool' });

    expect(fromPool.rng.generation).toEqual(before.generation);
    expect(fromPool.rng.pool).not.toEqual(before.pool);
    expect(hero).not.toEqual(generateHero(fromGeneration, deps).hero);
  });

  test('throws on a stream the world does not have, changing nothing', () => {
    const deps = testDeps();
    const world = testWorld('missing-stream', deps);
    const before = structuredClone(world);
    // A name no core stream has, so the world lacks it whatever streams later milestones add.
    const missing = 'no-such-stream' as string as StreamName;

    expect(() => generateHero(world, deps, { stream: missing })).toThrow(/no-such-stream/);
    expect(world).toEqual(before);
  });

  test('is the same Hero from the same seed, and another from another', () => {
    const deps = testDeps();
    const one = heroes(testWorld('same', deps), deps, 20);
    const two = heroes(testWorld('same', deps), deps, 20);
    const other = heroes(testWorld('other', deps), deps, 20);

    expect(two).toEqual(one);
    expect(other).not.toEqual(one);
  });

  test('reads its ranges from the config it is given, not from literals', () => {
    const deps = testDeps({
      heroStartingAgeMin: 25,
      heroStartingAgeMax: 25,
      statBaseMin: 7,
      statBaseMax: 7,
      statBiasMin: 3,
      statBiasMax: 3,
      potentialGapMin: 5,
      potentialGapMax: 5,
      startingSkillsMin: 3,
      startingSkillsMax: 3,
      startingSkillRatingMax: 1,
      moraleBaseline: 42,
    });
    const world = testWorld('config', deps);
    const { hero } = generateHero(world, deps, { classKey: 'rogue' });
    const leading = deps.content.classes.rogue?.leadingStats ?? [];

    expect(hero.ageAtEntry).toBe(25);
    expect(hero.morale).toBe(42);
    for (const [key, value] of Object.entries(hero.stats)) {
      expect(value, key).toBe(leading.includes(key) ? 10 : 7);
      expect(hero.potential[key], key).toBe(value + 5);
    }
    expect(hero.skills).toEqual({ lockpicking: 1, stealth: 1, trapcraft: 1 });
  });

  test('clamps a Stat and its Potential to the content range', () => {
    const deps = testDeps({ statBaseMin: 19, statBaseMax: 19, statBiasMin: 4, statBiasMax: 4 });
    const world = testWorld('clamp', deps);
    const { hero } = generateHero(world, deps, { classKey: 'warrior' });

    expect(hero.stats.strength).toBe(20);
    expect(hero.potential.strength).toBe(20);
    expect(hero.stats.dexterity).toBe(19);
    expect(hero.potential.dexterity).toBe(20);
  });

  test('takes the Class and Level it is given', () => {
    const deps = testDeps();
    const world = testWorld('given', deps);
    const { hero } = generateHero(world, deps, { classKey: 'healer', level: 4 });

    expect(hero.classKey).toBe('healer');
    expect(hero.level).toBe(4);
    expect(hero.xp).toBe(0);
  });

  test('emits hero.generated naming the Hero, and the Guild of a Hero put on its Roster', () => {
    const deps = testDeps();
    const world = testWorld('events', deps);
    world.turn = 3;
    const unattached = generateHero(world, deps);

    expect(unattached.events).toEqual([
      {
        turn: 3,
        type: 'hero.generated',
        participants: [unattached.hero.id],
        labels: { [unattached.hero.id]: unattached.hero.name },
        milestone: false,
        payload: { heroId: unattached.hero.id, guildId: null, classKey: unattached.hero.classKey },
      },
    ]);

    const guild = bareGuild(world);
    const rostered = generateHero(world, deps, { guildId: guild.id });

    expect(rostered.hero.guildId).toBe(guild.id);
    expect(guild.rosterIds).toEqual([rostered.hero.id]);
    expect(rostered.events).toEqual([
      {
        turn: 3,
        type: 'hero.generated',
        participants: [rostered.hero.id, guild.id],
        labels: { [rostered.hero.id]: rostered.hero.name, [guild.id]: guild.name },
        milestone: false,
        payload: { heroId: rostered.hero.id, guildId: guild.id, classKey: rostered.hero.classKey },
      },
    ]);
  });

  test('throws, changing nothing, on an unknown Class, a missing Guild, a Level below 1 or a rating off the Skill scale', () => {
    const deps = testDeps();
    const world = testWorld('refusals', deps);
    const before = structuredClone(world);

    expect(() => generateHero(world, deps, { classKey: 'bard' })).toThrow(/bard/);
    expect(() => generateHero(world, deps, { guildId: makeId('guilds', 9) })).toThrow(/guild-000009/);
    expect(() => generateHero(world, deps, { level: 0 })).toThrow(RangeError);
    expect(() => generateHero(world, deps, { level: 1.5 })).toThrow(RangeError);
    expect(() => generateHero(world, testDeps({ startingSkillRatingMax: 6 }))).toThrow(/startingSkillRatingMax/);
    expect(() => generateHero(world, testDeps({ startingSkillRatingMax: 0 }))).toThrow(/startingSkillRatingMax/);
    expect(world).toEqual(before);
  });
});
