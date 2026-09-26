import { describe, expect, test } from 'vitest';
import { dispatch } from '../actions/dispatch.js';
import { advance } from '../advance.js';
import { defaultConfig, type EngineDeps, type GameConfig } from '../config.js';
import { createWorld } from '../create.js';
import type { Guild, Hero, HeroId, Quest, World, WorldDocument } from '../document.js';
import type { EngineEvent, EngineEventOf, EngineEventType } from '../events.js';
import { generateHero } from '../generators/heroes.js';
import { append } from '../history.js';
import { xpForLevel } from '../progression.js';
import { createStreams, next, streamNames } from '../rng.js';
import { playerGuild, upkeep } from '../selectors.js';
import { nightOf, timeOfDay } from '../time.js';
import { testDeps, withValid } from '../world.test-support.js';
import { levelUps } from './level-ups.js';
import { phaseContext } from './phase.js';

// M3-S1: the night phase `levelUps` (DL-36). Worlds are created and played through `advance`, each
// document held to the validator; a test of the rule alone runs the phase on a world moved to a
// night.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

/**
 * INPUTS 5.2 and 5.3's curve and growth, and M2's wage, pinned: these tests are written against
 * them. No Rivals, whose Parties would blur what a test watches (DL-30 item 11).
 */
function soloDeps(overrides: Partial<GameConfig> = {}): EngineDeps {
  return testDeps({
    rivalCount: 0,
    xpCurveBase: 100,
    xpCurveExponent: 2,
    levelCap: 20,
    growthPointsPerLevel: 3,
    wagePerLevel: 70,
    ...overrides,
  });
}

const ofType = <Type extends EngineEventType>(events: readonly EngineEvent[], type: Type): EngineEventOf<Type>[] =>
  events.filter((event): event is EngineEventOf<Type> => event.type === type);

const hero = (world: World, id: HeroId): Hero => world.heroes[id] as Hero;
const player = (world: World): Guild => playerGuild(world) as Guild;

/** Advances to Turn `turn`, validating every document, and returns the events of the Turns played. */
function playTo(document: WorldDocument, turn: number, deps: EngineDeps): { document: WorldDocument; events: EngineEvent[] } {
  let current = document;
  const events: EngineEvent[] = [];
  while (current.world.turn < turn) {
    const result = advance(current, deps);
    current = withValid(result.document, deps);
    events.push(...result.events);
  }
  return { document: current, events };
}

/** A created world played to the afternoon of Day 0, the eve of its first night. */
function eve(seed: string, deps: EngineDeps): WorldDocument {
  return playTo(createWorld(seed, setup, deps).document, nightOf(0) - 1, deps).document;
}

/** Runs the phase alone on `world` on the night of Day `day`. */
function night(world: World, day: number, deps: EngineDeps): EngineEvent[] {
  world.turn = nightOf(day);
  return levelUps(world, phaseContext(world, deps));
}

/** The sum of a Hero's base Stats. */
const statSum = (row: Hero): number => Object.values(row.stats).reduce((sum, value) => sum + value, 0);

describe('levelUps', () => {
  test('a Hero with XP for three Levels gains three in one night, with three hero.levelled Milestones', () => {
    const deps = soloDeps();
    const document = eve('three-levels', deps);
    const [heroId, other] = player(document.world).rosterIds as [HeroId, HeroId];
    const before = structuredClone(hero(document.world, heroId));
    hero(document.world, heroId).xp = xpForLevel(4, deps.config);
    hero(document.world, other).xp = xpForLevel(2, deps.config) - 1;

    const { document: after, events } = playTo(document, nightOf(0), deps);

    const levelled = ofType(events, 'hero.levelled');
    expect(levelled.map((event) => event.payload.level)).toEqual([2, 3, 4]);
    const guildId = player(after.world).id;
    for (const event of levelled) {
      expect(event).toMatchObject({ turn: nightOf(0), participants: [heroId, guildId], milestone: true });
      expect(event.payload).toMatchObject({ heroId, guildId });
      const risen = Object.values(event.payload.statDeltas).reduce((sum, delta) => sum + delta, 0);
      expect(risen + event.payload.pointsLost).toBe(3);
    }
    const levelledHero = hero(after.world, heroId);
    expect(levelledHero.level).toBe(4);
    // Level-ups spend no XP.
    expect(levelledHero.xp).toBe(xpForLevel(4, deps.config));
    const risen = levelled.flatMap((event) => Object.values(event.payload.statDeltas)).reduce((sum, delta) => sum + delta, 0);
    expect(statSum(levelledHero)).toBe(statSum(before) + risen);
    // One XP short of Level 2 is not Level 2.
    expect(hero(after.world, other).level).toBe(1);
    // The History keeps them as Milestones, indexed by the Hero.
    const milestones = after.history.milestones.map((position) => after.history.entries[position]);
    expect(milestones.filter((entry) => entry?.type === 'hero.levelled')).toEqual(levelled);
  });

  test('no Stat exceeds its Potential after 10,000 Level-ups over random Heroes', () => {
    const deps = soloDeps({ levelCap: 21 });
    const { document } = createWorld('ten-thousand', setup, deps);
    const { world, history } = document;
    const guild = player(world);
    const heroIds: HeroId[] = [];
    for (let n = 0; n < 500; n += 1) {
      const { hero: row, events } = generateHero(world, deps, { guildId: guild.id });
      for (const event of events) append(history, event);
      row.xp = xpForLevel(21, deps.config);
      heroIds.push(row.id);
    }
    const before = new Map(heroIds.map((id) => [id, structuredClone(hero(world, id))]));
    world.turn = nightOf(0);

    const events = levelUps(world, phaseContext(world, deps, history));
    for (const event of events) append(history, event);

    const levelled = ofType(events, 'hero.levelled').filter((event) => heroIds.includes(event.payload.heroId));
    expect(levelled).toHaveLength(10_000);
    let lost = 0;
    for (const heroId of heroIds) {
      const row = hero(world, heroId);
      const start = before.get(heroId) as Hero;
      expect(row.level).toBe(21);
      for (const [key, value] of Object.entries(row.stats)) {
        expect(value).toBeLessThanOrEqual(row.potential[key] ?? Number.NaN);
        expect(value).toBeGreaterThanOrEqual(start.stats[key] ?? Number.NaN);
      }
      expect(row.potential).toEqual(start.potential);
    }
    for (const event of levelled) lost += event.payload.pointsLost;
    // Potential binds: 30,000 points were more than these Heroes' headroom.
    expect(lost).toBeGreaterThan(0);
    withValid({ ...document, world }, deps);
  });

  test('Level never exceeds levelCap, and XP still accrues past it', () => {
    const deps = soloDeps({ levelCap: 3 });
    const start = eve('cap', deps);
    const [heroId] = player(start.world).rosterIds as [HeroId];
    hero(start.world, heroId).xp = xpForLevel(10, deps.config);

    const capped = playTo(start, nightOf(0), deps);
    expect(ofType(capped.events, 'hero.levelled').map((event) => event.payload.level)).toEqual([2, 3]);
    expect(hero(capped.document.world, heroId)).toMatchObject({ level: 3, xp: xpForLevel(10, deps.config) });

    // Sent on a Quest on the morning of Day 1, the capped Hero comes home with more XP and no Level.
    const morning = playTo(capped.document, nightOf(0) + 1, deps).document;
    const open = morning.world.board
      .map((id) => morning.world.quests[id] as Quest)
      .find(({ requirements: { classKey, skillKey, partySizeMin } }) => classKey === undefined && skillKey === undefined && partySizeMin <= 1);
    if (open === undefined) throw new Error('No Quest a lone Hero may take on the Board');
    const guildId = player(morning.world).id;
    const sent = dispatch(morning, { guildId, questId: open.id, heroIds: [heroId] }, deps);
    if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
    const returnsOnTurn = Object.values(sent.document.world.parties)[0]?.returnsOnTurn ?? Number.NaN;
    expect(timeOfDay(returnsOnTurn)).toBe('night');

    const home = playTo(withValid(sent.document, deps), returnsOnTurn, deps);

    const [gained] = ofType(home.events, 'hero.xp-gained');
    expect(gained?.payload.amount).toBeGreaterThan(0);
    expect(hero(home.document.world, heroId)).toMatchObject({
      level: 3,
      xp: xpForLevel(10, deps.config) + (gained?.payload.amount ?? Number.NaN),
    });
    expect(ofType(home.events, 'hero.levelled')).toEqual([]);
  });

  test("Upkeep rises by wagePerLevel for each Level gained (M2's wage now has an effect)", () => {
    const deps = soloDeps();
    const document = eve('upkeep', deps);
    const [heroId] = player(document.world).rosterIds as [HeroId];
    hero(document.world, heroId).xp = xpForLevel(4, deps.config);
    const upkeepBefore = upkeep(player(document.world), document.world, deps.config);

    const { document: after } = playTo(document, nightOf(0), deps);

    expect(hero(after.world, heroId).level).toBe(4);
    expect(upkeep(player(after.world), after.world, deps.config) - upkeepBefore).toBe(3 * 70);
  });

  test("the default wage is 20 a Level since Heroes gain Levels (DL-36), kept by M3's run (DL-41), the Quest Engine (DL-42), M3's verification (DL-53) and M6-S1 (DL-56), under configVersion 9 (DL-55, DL-61, DL-62, DL-63)", () => {
    expect(defaultConfig).toMatchObject({ wagePerLevel: 20, configVersion: 9 });
  });

  test('moves the progression stream alone, growthPointsPerLevel draws a Level, and none on a night no one levels', () => {
    const deps = soloDeps({ growthPointsPerLevel: 4 });
    const { world } = createWorld('streams', setup, deps).document;
    const [heroId] = player(world).rosterIds as [HeroId];

    const quiet = structuredClone(world.rng);
    expect(night(world, 0, deps)).toEqual([]);
    expect(world.rng).toEqual(quiet);

    hero(world, heroId).xp = xpForLevel(3, deps.config);
    const before = structuredClone(world.rng);
    const events = night(world, 1, deps);

    expect(events).toHaveLength(2);
    const expected = structuredClone(before.progression);
    for (let draw = 0; draw < 2 * 4; draw += 1) next(expected);
    expect(world.rng.progression).toEqual(expected);
    for (const name of streamNames) if (name !== 'progression') expect(world.rng[name]).toEqual(before[name]);
  });

  test("covers every Guild's Roster alike, and Heroes away on a Quest, but not a folded Guild or the Unattached pool", () => {
    const deps = testDeps({ rivalCount: 2, xpCurveBase: 100, xpCurveExponent: 2, levelCap: 20 });
    const { world } = createWorld('who', setup, deps).document;
    const [rival, folded] = Object.values(world.guilds).filter((guild) => guild.controller.kind === 'rival') as [Guild, Guild];
    folded.foldedOnTurn = 0;
    const [playerHero] = player(world).rosterIds as [HeroId];
    const [rivalHero] = rival.rosterIds as [HeroId];
    const [foldedHero] = folded.rosterIds as [HeroId];
    const pooled = Object.values(world.heroes).find((row) => row.unattachedSince !== null) as Hero;
    for (const id of [playerHero, rivalHero, foldedHero, pooled.id]) hero(world, id).xp = xpForLevel(2, deps.config);
    // Away on a Quest: Level follows XP wherever the Hero is.
    hero(world, rivalHero).partyId = 'party-000099' as Hero['partyId'];

    const events = night(world, 0, deps);

    expect(ofType(events, 'hero.levelled').map((event) => event.payload.heroId).sort()).toEqual([playerHero, rivalHero].sort());
    expect(hero(world, foldedHero).level).toBe(1);
    expect(pooled.level).toBe(1);
  });

  test('an old save without the progression stream gains it, seeded as a new world would have it', () => {
    const deps = soloDeps();
    const document = eve('old-save', deps);
    const [heroId] = player(document.world).rosterIds as [HeroId];
    hero(document.world, heroId).xp = xpForLevel(2, deps.config);
    const fresh = structuredClone(document);
    delete (document.world.rng as Partial<World['rng']>).progression;

    const old = advance(document, deps);
    const current = advance(fresh, deps);

    expect(old.document.world).toEqual(current.document.world);
    expect(old.document.world.rng.progression).not.toEqual(createStreams(document.meta.seed, ['progression']).progression);
  });
});
