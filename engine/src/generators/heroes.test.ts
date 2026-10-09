import { describe, expect, test } from 'vitest';
import type { ContentSet } from '../content-types.js';
import { heroDescriptionDraws } from '../descriptions.js';
import { descriptiveAttributeMaxLength, facilityKeys, makeId, type Guild, type Hall, type Hero, type World } from '../document.js';
import { heroPortraitsInUse } from '../portraits.js';
import { createStreams, next, type StreamName } from '../rng.js';
import { generateHero } from './heroes.js';
import { plannedStreams, testDeps, testWorld, withoutPortraits } from '../world.test-support.js';

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

  // 10,000 Heroes generated: about 0.65 s alone, 1.7 s in a full `npm test` on a busy machine; the
  // timeout bounds a hang with room for a busier one, not the speed.
  test('over 10,000 Heroes every Stat stays in its content range and Potential is at least the base', { timeout: 30_000 }, () => {
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
    // No Hero picture: ten thousand Heroes in one pool would each read every other for the
    // pictures in use, which no Stat reads.
    const deps = testDeps({}, withoutPortraits());
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

  test("draws only from generation, and the Hero's own two streams: every other planned stream is unchanged", () => {
    const deps = testDeps();
    const world = testWorld('streams', deps, plannedStreams);
    const before = structuredClone(world.rng);
    heroes(world, deps, 1000);

    const own = ['generation', 'hero-portraits', 'hero-descriptions'];
    for (const name of own) expect((world.rng as Record<string, unknown>)[name], name).not.toEqual((before as Record<string, unknown>)[name]);
    const others = plannedStreams.filter((name) => !own.includes(name));
    expect(others).toHaveLength(10);
    for (const name of others) {
      expect((world.rng as Record<string, unknown>)[name], name).toEqual(
        (before as Record<string, unknown>)[name],
      );
    }
    expect(world.rng.generation).not.toEqual(before.generation);
  });

  test('draws from the stream its caller names instead (pool)', () => {
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

  test('takes the Class and Level it is given, with the XP that Level takes (DL-36)', () => {
    const deps = testDeps({ xpCurveBase: 100, xpCurveExponent: 2 });
    const world = testWorld('given', deps);
    const { hero } = generateHero(world, deps, { classKey: 'healer', level: 4 });
    const { hero: first } = generateHero(world, deps);

    expect(hero.classKey).toBe('healer');
    expect(hero.level).toBe(4);
    // 100 + 400 + 900: the steps from Level 1 to 4.
    expect(hero.xp).toBe(1400);
    expect(first).toMatchObject({ level: 1, xp: 0 });
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

// ── A Hero's Portrait and texts (DL-135 items 3 to 6) ─────────────────────────────

describe("generateHero gives each Hero a Portrait and their texts", () => {
  /** The test content with Hero pictures of `female`: each a Warrior's from 18 to 30, as `hero-female-01` is. */
  const withHeroPictures = (female: string[]): ContentSet => {
    const row = testDeps().content.portraitAppearances.portraits['hero-female-01'];
    if (row === undefined) throw new Error('No hero-female-01');
    const content = testDeps().content;
    return {
      ...content,
      portraits: { ...content.portraits, hero: { female, male: [] } },
      portraitAppearances: {
        ...content.portraitAppearances,
        portraits: { ...content.portraitAppearances.portraits, ...Object.fromEntries(female.map((key) => [key, row])) },
      },
    };
  };
  const fields = ['portraitKey', 'appearance', 'biography'] as const;
  const aside = (hero: Hero) => ({ ...hero, portraitKey: null, appearance: '', biography: '' });

  test("a Hero of the picture's Class, sex and band gets it, and a Hero of another Class, sex or band does not", () => {
    // hero-female-01 is a Warrior's, looking 18 to 30: the test content's young band, to 35.
    const deps = testDeps();
    const world = testWorld('hero-picture', deps);
    const made = heroes(world, deps, 400);
    const femaleWarriors = made.filter((hero) => hero.sex === 'female' && hero.classKey === 'warrior');
    expect(femaleWarriors.length).toBeGreaterThan(20);
    for (const hero of femaleWarriors) expect(hero.portraitKey, `${hero.id} at ${hero.ageAtEntry}`).toBe(hero.ageAtEntry <= 35 ? 'hero-female-01' : null);
    expect(femaleWarriors.some((hero) => hero.ageAtEntry > 35)).toBe(true);
    for (const hero of made.filter((it) => it.sex === 'male' || it.classKey !== 'warrior')) expect(hero.portraitKey, hero.id).toBeNull();

    // An older band's female Warrior: the picture reaches no age of it.
    const older = testDeps({ heroStartingAgeMin: 40, heroStartingAgeMax: 45 });
    for (const hero of heroes(testWorld('older', older), older, 40, 'warrior')) expect(hero.portraitKey).toBeNull();
  });

  test('with no Hero picture in content, as this release ships, every Hero has the Silhouette, an Appearance and a Biography', () => {
    const deps = testDeps({}, withoutPortraits());
    for (const hero of heroes(testWorld('silhouettes', deps), deps, 200)) {
      expect(hero.portraitKey).toBeNull();
      expect(hero.appearance).toMatch(/^Build .*\.$/);
      expect(hero.biography).not.toBe('');
      expect([...hero.appearance].length).toBeLessThanOrEqual(descriptiveAttributeMaxLength.appearance);
      expect([...hero.biography].length).toBeLessThanOrEqual(descriptiveAttributeMaxLength.biography);
    }
  });

  test("a Hero with a picture has its narrative for their Appearance, and their Biography closes with its Temper's", () => {
    const deps = testDeps({ heroStartingAgeMin: 20, heroStartingAgeMax: 30 });
    const pictured = heroes(testWorld('narrative', deps), deps, 60, 'warrior').filter((hero) => hero.portraitKey !== null);
    expect(pictured.length).toBeGreaterThan(10);
    for (const hero of pictured) {
      expect(hero.appearance).toBe('A scarred young face in a picture.');
      expect(hero.biography).toMatch(/ She is stern\.$/);
    }
  });

  test('prefers a picture no Hero on a Roster or in the pool has, and repeats one once every one that fits is in use', () => {
    const deps = testDeps({ heroStartingAgeMin: 20, heroStartingAgeMax: 30 }, withHeroPictures(['hero-female-01', 'hero-female-02', 'hero-female-03']));
    const world = testWorld('in-use', deps);
    const pictured: string[] = [];
    for (const hero of heroes(world, deps, 80, 'warrior')) if (hero.portraitKey !== null) pictured.push(hero.portraitKey);
    expect(pictured.length).toBeGreaterThan(6);
    // The first three are the three pictures, each once; after them, each repeats.
    expect(new Set(pictured.slice(0, 3)).size).toBe(3);
    expect(new Set(pictured).size).toBe(3);
  });

  test("a Hero who has left the pool, died or retired frees their picture; one on a Roster or in the pool holds it", () => {
    const deps = testDeps({ heroStartingAgeMin: 20, heroStartingAgeMax: 30 });
    const world = testWorld('freed', deps);
    const guild = bareGuild(world);
    const [pooled, rostered] = [0, 1].map(() => heroes(world, deps, 1, 'warrior')[0] as Hero);
    if (pooled === undefined || rostered === undefined) throw new Error('No Heroes');
    Object.assign(pooled, { portraitKey: 'hero-female-01' });
    Object.assign(rostered, { portraitKey: 'hero-female-02', guildId: guild.id, unattachedSince: null });
    guild.rosterIds.push(rostered.id);
    expect(heroPortraitsInUse(world)).toEqual(new Set(['hero-female-01', 'hero-female-02']));

    Object.assign(pooled, { unattachedSince: null, leftPoolOnTurn: 3 });
    guild.rosterIds = [];
    Object.assign(rostered, { diedOnTurn: 3 });
    expect(heroPortraitsInUse(world)).toEqual(new Set());
  });

  test(`takes exactly one draw of hero-portraits and ${heroDescriptionDraws} of hero-descriptions a Hero, whatever content lists, and nothing else moves with them`, () => {
    const seed = 'draws-a-hero';
    const count = 120;
    const contents = [testDeps().content, withoutPortraits(), withHeroPictures(['hero-female-01', 'hero-female-02'])];
    const made = contents.map((content) => {
      const deps = testDeps({}, content);
      const world = testWorld(seed, deps, plannedStreams);
      return { world, heroes: heroes(world, deps, count) };
    });
    const expected = createStreams(seed, ['hero-portraits', 'hero-descriptions']);
    for (let hero = 0; hero < count; hero += 1) {
      next(expected['hero-portraits']);
      for (let draw = 0; draw < heroDescriptionDraws; draw += 1) next(expected['hero-descriptions']);
    }
    const [first] = made;
    if (first === undefined) throw new Error('No worlds');
    for (const { world, heroes: row } of made) {
      expect(world.rng['hero-portraits']).toEqual(expected['hero-portraits']);
      expect(world.rng['hero-descriptions']).toEqual(expected['hero-descriptions']);
      expect(world.rng).toEqual(first.world.rng);
      // The Heroes are the same Heroes, but for their Portraits and texts.
      expect(row.map(aside)).toEqual(first.heroes.map(aside));
    }
    // And the pictures did change them.
    const pictured = (index: number) => made[index]?.heroes.filter((hero) => hero.portraitKey !== null).length;
    expect(pictured(0)).toBeGreaterThan(0);
    expect(pictured(1)).toBe(0);
    for (const field of fields) expect(made[0]?.heroes.map((hero) => hero[field])).not.toEqual(made[1]?.heroes.map((hero) => hero[field]));
  });
});
