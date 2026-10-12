import { describe, expect, expectTypeOf, test } from 'vitest';
import { advance } from './advance.js';
import type { EngineDeps, GameConfig } from './config.js';
import { createWorld } from './create.js';
import { makeId, type Guild, type Guildmaster, type Hero, type HeroId, type WorldDocument } from './document.js';
import type { TurnEvent } from './events.js';
import * as engine from './index.js';
import { nightOf } from './time.js';
import { testDeps, withFacilityUpkeep } from './world.test-support.js';
import {
  bankruptcyCountdown,
  baseStat,
  cheapestUnattached,
  offeredQuests,
  playerGuild,
  rankingPlaces,
  rankings,
  signingFee,
  signingRefusal,
  unattachedHeroes,
  unsignableHeroes,
  hallUpkeepParts,
  nextHallUpkeepDay,
  nextWagesDay,
  upkeep,
  wages,
} from './selectors.js';

const setup = { guildmasterName: 'Aldith Barrowby', guildName: 'The Salt Road Guild', createdAt: 'test' };

describe('playerGuild', () => {
  test("is the one Guild the player controls, whatever the Guilds' order", () => {
    const { document } = createWorld('selectors', setup, testDeps());
    const { world } = document;

    expect(playerGuild(world)?.name).toBe('The Salt Road Guild');

    const reordered = Object.fromEntries(Object.entries(world.guilds).reverse());
    expect(playerGuild({ guilds: reordered })?.id).toBe(makeId('guilds', 1));
  });

  test('is undefined in a world without one', () => {
    expect(playerGuild({ guilds: {} })).toBeUndefined();
  });
});

describe('unattachedHeroes', () => {
  test('lists the Heroes on no Roster, in id order', () => {
    const deps = testDeps({ unattachedPoolSize: 5 });
    const { document } = createWorld('selectors', setup, deps);
    const { world } = document;

    const pool = unattachedHeroes(world);
    const onRosters = new Set(Object.values(world.guilds).flatMap((guild) => guild.rosterIds));

    expect(pool).toHaveLength(5);
    expect(pool.every((hero) => hero.guildId === null && !onRosters.has(hero.id))).toBe(true);
    expect(pool.map((hero) => hero.id)).toEqual(pool.map((hero) => hero.id).sort());

    const reversed = Object.fromEntries(Object.entries(world.heroes).reverse()) as Record<string, Hero>;
    expect(unattachedHeroes({ heroes: reversed })).toEqual(pool);
  });

  test('leaves out a Hero on no Roster who has left the pool and whose row stayed (DL-27)', () => {
    const { document } = createWorld('selectors', setup, testDeps({ unattachedPoolSize: 3 }));
    const [first, ...rest] = unattachedHeroes(document.world);
    if (first === undefined) throw new Error('The pool is empty');

    Object.assign(first, { unattachedSince: null, leftPoolOnTurn: 32 });

    expect(unattachedHeroes(document.world)).toEqual(rest);
  });
});

describe('signingFee', () => {
  const deps = testDeps();
  const heroStats = Object.values(deps.content.stats).filter((stat) => stat.owner === 'hero');

  /** A Hero of `level` with every Hero Stat at `value`, and `extra` on top. */
  function hero(level: number, value: number, extra: Record<string, number> = {}): Pick<Hero, 'level' | 'stats'> {
    return { level, stats: { ...Object.fromEntries(heroStats.map((stat) => [stat.key, value])), ...extra } };
  }

  test('rounds down to a whole number, once, at the end', () => {
    const fees = [0, 1, 2, 3, 4].map((more) => signingFee(hero(1, 8, { strength: 8 + more }), deps));
    // The sum is 160 to 164: a quarter of it is 40, 40.25, 40.5, 40.75, 41.
    expect(fees).toEqual([115, 115, 115, 115, 116]);
    expect(fees.every(Number.isInteger)).toBe(true);
  });

  test('reads every number from config', () => {
    const tuned = testDeps({ signingFeeBase: 10, signingFeePerLevel: 7, signingFeeStatDivisor: 3 });
    // 10 + 2 × 7 + floor(20 × 5 / 3) = 10 + 14 + 33.
    expect(signingFee(hero(2, 5), tuned)).toBe(57);
  });

  test("ignores a Stat content lacks, and reads one the Hero lacks as content's default (rule 5)", () => {
    const withUnknown = hero(1, 8, { luck: 100 });
    expect(signingFee(withUnknown, deps)).toBe(115);

    const lacking = hero(1, 8);
    Reflect.deleteProperty(lacking.stats, 'strength');
    // Strength reads as its default, 10: the sum is 162, a quarter 40.5.
    expect(signingFee(lacking, deps)).toBe(115);
    Reflect.deleteProperty(lacking.stats, 'dexterity');
    expect(signingFee(lacking, deps)).toBe(116);
  });
});

describe('baseStat', () => {
  const strength = { key: 'strength', default: 10 };

  test("reads a Hero's stored value", () => {
    expect(baseStat({ strength: 14 }, strength)).toBe(14);
  });

  test("reads a Stat the Hero lacks as the content's default (data-model rule 5)", () => {
    expect(baseStat({ dexterity: 6 }, strength)).toBe(10);
  });

  test("never reads a key of Object.prototype as a Stat's value", () => {
    expect(baseStat({}, { key: 'constructor', default: 7 })).toBe(7);
  });
});

// DL-298: the two charges, the wages and the Hall's upkeep, their parts and their Days, which the Guild
// State Engine charges and the Treasury shows, from one rule each (ADR-0007).
describe('wages, hallUpkeepParts and their Days (DL-298)', () => {
  /** The test content with each Facility's upkeep a month at grade 1 as given. */
  const priced = withFacilityUpkeep({ infirmary: 15, 'training-yard': 20, quarters: 10 });
  /** A Guild of four Heroes at Level 1 and a Guildmaster with no Trait, its Hall unbuilt, its own base 40. */
  function hallOf(seed: string, overrides: Partial<GameConfig> = {}) {
    const deps = testDeps(
      { startingRosterSize: 4, wagePerLevel: 5, hallUpkeepPerHero: 5, hallUpkeepHeroExponent: 1, improvementUpkeepGradeFactor: 1.73, ...overrides },
      priced,
    );
    const { world } = createWorld(seed, setup, deps).document;
    const guild = playerGuild(world) as Guild;
    (world.guildmasters[guild.guildmasterId] as Guildmaster).traits = [];
    guild.hallBaseUpkeep = 40;
    return { deps, world, guild };
  }

  test("are exported from the engine's index, for the page", () => {
    expect(engine.wages).toBe(wages);
    expect(engine.hallUpkeepParts).toBe(hallUpkeepParts);
    expect(engine.nextWagesDay).toBe(nextWagesDay);
    expect(engine.nextHallUpkeepDay).toBe(nextHallUpkeepDay);
  });

  test('the wages are wagePerLevel × Level over the living Roster: a Hero away counts, the dead and the retired do not', () => {
    const { deps, world, guild } = hallOf('wages');
    const [first, second, third, fourth] = guild.rosterIds as [HeroId, HeroId, HeroId, HeroId];
    (world.heroes[first] as Hero).level = 3;
    (world.heroes[second] as Hero).partyId = makeId('parties', 1);
    expect(wages(guild, world, deps.config)).toBe(5 * (3 + 1 + 1 + 1));
    (world.heroes[third] as Hero).diedOnTurn = 5;
    (world.heroes[fourth] as Hero).retiredOnTurn = 5;
    expect(wages(guild, world, deps.config)).toBe(5 * (3 + 1));
  });

  test("the Hall's upkeep: the Guild's own base, the Heroes' share on its curve, and each built Facility's upkeep × the grade factor ^ (grade − 1), each part rounded", () => {
    const { deps, world, guild } = hallOf('hall-parts', { hallUpkeepHeroExponent: 1.2 });
    guild.hall = { infirmary: 1, 'training-yard': 3, quarters: 0 };
    // 5 × 4 ^ 1.2 is 26.39; 20 × 1.73² is 59.86. The quarters, at grade 0, cost nothing and are not listed.
    expect(hallUpkeepParts(guild, world, deps.config, deps.content)).toEqual({
      base: 40,
      heroCount: 4,
      heroes: 26,
      facilities: { infirmary: 15, 'training-yard': 60 },
      traitFactor: 1,
      total: 40 + 26 + 15 + 60,
    });
  });

  test('a new Guild pays its base and its Heroes alone, and a Hero away is counted, the dead and the retired not', () => {
    const { deps, world, guild } = hallOf('hall-new');
    expect(hallUpkeepParts(guild, world, deps.config, deps.content)).toMatchObject({ heroCount: 4, heroes: 20, facilities: {}, total: 60 });
    const [away, dead, retired] = guild.rosterIds as [HeroId, HeroId, HeroId];
    (world.heroes[away] as Hero).partyId = makeId('parties', 1);
    (world.heroes[dead] as Hero).diedOnTurn = 5;
    (world.heroes[retired] as Hero).retiredOnTurn = 5;
    expect(hallUpkeepParts(guild, world, deps.config, deps.content)).toMatchObject({ heroCount: 2, heroes: 10, total: 50 });
  });

  test("Thrifty and Spendthrift scale the Hall's upkeep alone, its parts summed and the factor rounded once; the wages not", () => {
    const { deps, world, guild } = hallOf('hall-traits');
    guild.hall = { infirmary: 2, 'training-yard': 0, quarters: 1 };
    const listed = 40 + 20 + Math.round(15 * 1.73) + 10;
    const plainWages = wages(guild, world, deps.config);
    for (const [trait, factor] of [
      ['thrifty', 0.9],
      ['spendthrift', 1.1],
    ] as const) {
      (world.guildmasters[guild.guildmasterId] as Guildmaster).traits = [trait];
      const parts = hallUpkeepParts(guild, world, deps.config, deps.content);
      expect(parts, trait).toMatchObject({ base: 40, heroes: 20, facilities: { infirmary: 26, quarters: 10 }, traitFactor: factor });
      expect(parts.total, trait).toBe(Math.round(listed * factor));
      expect(wages(guild, world, deps.config), trait).toBe(plainWages);
    }
  });

  test("over seeded worlds, every Guild's total is its parts summed, times its factor, rounded once", () => {
    const deps = testDeps({ startingWealth: 100_000 });
    const factors = new Set<number>();
    for (const seed of ['parts-a', 'parts-b', 'parts-c', 'parts-d']) {
      const { world } = createWorld(seed, setup, deps).document;
      Object.values(world.guilds).forEach((guild, guildIndex) => {
        guild.hall = { infirmary: guildIndex % 4, 'training-yard': (guildIndex + 1) % 4, quarters: (guildIndex + 2) % 4 };
      });
      for (const guild of Object.values(world.guilds)) {
        const parts = hallUpkeepParts(guild, world, deps.config, deps.content);
        factors.add(parts.traitFactor);
        const listed = parts.base + parts.heroes + Object.values(parts.facilities).reduce((sum, each) => sum + each, 0);
        expect(parts.total, guild.id).toBe(Math.round(listed * parts.traitFactor));
        expect(Number.isSafeInteger(parts.total), guild.id).toBe(true);
      }
    }
    // The seeded Guildmasters' Traits give more than one factor.
    expect(factors.size).toBeGreaterThan(1);
  });

  test('a Hall key content does not define is charged nothing (data-model rule 5)', () => {
    const { deps, world, guild } = hallOf('hall-unknown');
    guild.hall = { infirmary: 0, 'training-yard': 0, quarters: 0, chapel: 2 };
    expect(hallUpkeepParts(guild, world, deps.config, deps.content)).toMatchObject({ facilities: {}, total: 60 });
  });

  test('nextWagesDay gives Days 9, 19, 29 and nextHallUpkeepDay Days 29, 59, 89, each the next after the Turn given has been played (DL-26)', () => {
    const { config } = testDeps({ upkeepEveryDays: 10, hallUpkeepEveryDays: 30 });
    expect(nextWagesDay(0, config)).toBe(9);
    expect(nextWagesDay(nightOf(9) - 1, config)).toBe(9);
    expect(nextWagesDay(nightOf(9), config)).toBe(19);
    expect(nextWagesDay(nightOf(9) + 1, config)).toBe(19);
    expect(nextWagesDay(nightOf(19), config)).toBe(29);
    expect(nextHallUpkeepDay(0, config)).toBe(29);
    expect(nextHallUpkeepDay(nightOf(29) - 1, config)).toBe(29);
    expect(nextHallUpkeepDay(nightOf(29), config)).toBe(59);
    expect(nextHallUpkeepDay(nightOf(59), config)).toBe(89);
    const weekly = testDeps({ upkeepEveryDays: 7, hallUpkeepEveryDays: 14 }).config;
    expect(nextWagesDay(0, weekly)).toBe(6);
    expect(nextWagesDay(nightOf(6), weekly)).toBe(13);
    expect(nextHallUpkeepDay(0, weekly)).toBe(13);
    expect(nextHallUpkeepDay(nightOf(13), weekly)).toBe(27);
  });
});

describe('upkeep, the measure the readers of Upkeeps count in (DL-298)', () => {
  test("is the wages and the Hall's upkeep for the wages' span: its total × upkeepEveryDays ÷ hallUpkeepEveryDays, the sum rounded", () => {
    const deps = testDeps({ startingRosterSize: 4, wagePerLevel: 5, hallUpkeepPerHero: 5, hallUpkeepHeroExponent: 1, upkeepEveryDays: 10, hallUpkeepEveryDays: 30 });
    const { world } = createWorld('upkeep-measure', setup, deps).document;
    const guild = playerGuild(world) as Guild;
    (world.guildmasters[guild.guildmasterId] as Guildmaster).traits = [];
    guild.hallBaseUpkeep = 41;
    // Wages 20; the Hall's 41 + 20 = 61 for 30 Days, 20.33 for 10.
    expect(upkeep(guild, world, deps.config, deps.content)).toBe(20 + 20);
    guild.hallBaseUpkeep = 42;
    expect(upkeep(guild, world, deps.config, deps.content)).toBe(Math.round(20 + 62 / 3));
    const weekly = { ...deps.config, upkeepEveryDays: 7, hallUpkeepEveryDays: 28 };
    expect(upkeep(guild, world, weekly, deps.content)).toBe(Math.round(20 + 62 / 4));
  });

  test('is a selector: no `upkeep` field on the Guild row, at the type level or in a created world', () => {
    expectTypeOf<Guild>().not.toHaveProperty('upkeep');

    const { document } = createWorld('upkeep-no-field', setup, testDeps());
    for (const guild of Object.values(document.world.guilds)) {
      expect(Object.hasOwn(guild, 'upkeep')).toBe(false);
    }
  });
});

describe('rankings (pulled forward from DL-28)', () => {
  /** Five Guilds whose Fame and Wealth order them differently, with a tie in each. */
  function ranked() {
    const { document } = createWorld('rankings', setup, testDeps());
    const guilds = Object.values(document.world.guilds);
    const measures: [fame: number, wealth: number][] = [
      [3, 100],
      [7, 900],
      [7, 400],
      [1, 900],
      [5, 50],
    ];
    guilds.forEach((guild, index) => {
      const [fame, wealth] = measures[index] ?? [0, 0];
      Object.assign(guild, { fame, wealth });
    });
    return { world: document.world, ids: guilds.map((guild) => guild.id) };
  }

  test('orders every Guild in play by Fame or by Wealth, highest first, ties by Guild id, ranked from 1', () => {
    const { world, ids } = ranked();
    const [g1, g2, g3, g4, g5] = ids;

    expect(rankings(world, 'fame')).toEqual([
      { guildId: g2, value: 7, rank: 1 },
      { guildId: g3, value: 7, rank: 2 },
      { guildId: g5, value: 5, rank: 3 },
      { guildId: g1, value: 3, rank: 4 },
      { guildId: g4, value: 1, rank: 5 },
    ]);
    expect(rankings(world, 'wealth').map((ranking) => ranking.guildId)).toEqual([g2, g4, g3, g1, g5]);
    // The player's Guild, guild-000001, is ranked like any other.
    expect(g1).toBe(makeId('guilds', 1));
  });

  test('no rank is stored: the Guild row has no rank, and the Rankings follow Fame as it moves', () => {
    const { world } = ranked();
    const player = playerGuild(world) as Guild;
    expectTypeOf<Guild>().not.toHaveProperty('rank');
    expect(Object.hasOwn(player, 'rank')).toBe(false);

    player.fame = 0;

    expect(rankings(world, 'fame').at(-1)?.guildId).toBe(player.id);
  });

  test("leaves out a folded Guild, and does not depend on the Guilds' order in the table", () => {
    const { world, ids } = ranked();
    const [, g2, g3] = ids;
    const folded = world.guilds[g2 ?? makeId('guilds', 0)] as Guild;
    folded.foldedOnTurn = 8;

    const byFame = rankings(world, 'fame');
    expect(byFame.map((ranking) => ranking.guildId)).not.toContain(g2);
    expect(byFame).toHaveLength(ids.length - 1);
    expect(byFame[0]).toEqual({ guildId: g3, value: 7, rank: 1 });

    const reversed = Object.fromEntries(Object.entries(world.guilds).reverse()) as typeof world.guilds;
    expect(rankings({ guilds: reversed }, 'fame')).toEqual(byFame);
  });
});

describe('rankingPlaces (DL-95)', () => {
  test('five Guilds at Fame 0, as a new game has them, share 1st, in the order rankings gives', () => {
    const { document } = createWorld('places-new', setup, testDeps());
    const { world } = document;
    expect(Object.values(world.guilds).map((guild) => guild.fame)).toEqual([0, 0, 0, 0, 0]);

    const places = rankingPlaces(world, 'fame');

    expect(places).toEqual(rankings(world, 'fame').map(({ guildId, value }) => ({ guildId, value, place: 1, joint: true })));
    expect(places).toHaveLength(5);
  });

  test('Fame 9, 4, 4 and 1 give 1st, joint 2nd, joint 2nd and 4th; a folded Guild is absent', () => {
    const { document } = createWorld('places-tied', setup, testDeps());
    const { world } = document;
    const [g1, g2, g3, g4, g5] = Object.values(world.guilds);
    if (g1 === undefined || g2 === undefined || g3 === undefined || g4 === undefined || g5 === undefined) {
      throw new Error('need five Guilds');
    }
    // Listed out of order, so the places follow the values and not the table; the folded Guild's
    // Fame would lead them all.
    Object.assign(g1, { fame: 4, wealth: 300 });
    Object.assign(g2, { fame: 1, wealth: 300 });
    Object.assign(g3, { fame: 9, wealth: 300 });
    Object.assign(g4, { fame: 4, wealth: 700 });
    Object.assign(g5, { fame: 50, wealth: 900, foldedOnTurn: 8 });

    expect(rankingPlaces(world, 'fame')).toEqual([
      { guildId: g3.id, value: 9, place: 1, joint: false },
      { guildId: g1.id, value: 4, place: 2, joint: true },
      { guildId: g4.id, value: 4, place: 2, joint: true },
      { guildId: g2.id, value: 1, place: 4, joint: false },
    ]);
    // By Wealth, three level behind one: 1st, then joint 2nd three times.
    expect(rankingPlaces(world, 'wealth')).toEqual([
      { guildId: g4.id, value: 700, place: 1, joint: false },
      { guildId: g1.id, value: 300, place: 2, joint: true },
      { guildId: g2.id, value: 300, place: 2, joint: true },
      { guildId: g3.id, value: 300, place: 2, joint: true },
    ]);
  });

  test("gives rankings' rows in its order, and its rank wherever no two Guilds are level", () => {
    const { document } = createWorld('places-apart', setup, testDeps());
    const { world } = document;
    Object.values(world.guilds).forEach((guild, index) => Object.assign(guild, { fame: 10 * index, wealth: 1_000 - index }));

    for (const by of ['fame', 'wealth'] as const) {
      expect(rankingPlaces(world, by)).toEqual(
        rankings(world, by).map(({ guildId, value, rank }) => ({ guildId, value, place: rank, joint: false })),
      );
    }
  });
});

describe('bankruptcyCountdown (DL-95)', () => {
  /** A new game whose player's Guild has `wealth` Wealth. */
  function created(seed: string, deps: EngineDeps, wealth: number): WorldDocument {
    const { document } = createWorld(seed, setup, deps);
    (playerGuild(document.world) as Guild).wealth = wealth;
    return document;
  }

  /** Plays Turn by Turn until Turn `turn` has been played (the world's Turn is `turn`) or the game ends. */
  function playTo(document: WorldDocument, turn: number, deps: EngineDeps): { document: WorldDocument; events: TurnEvent[] } {
    let current = document;
    const events: TurnEvent[] = [];
    while (current.world.turn < turn && current.world.ended === null) {
      const result = advance(current, deps);
      current = result.document;
      events.push(...result.events);
    }
    return { document: current, events };
  }

  const player = (document: WorldDocument): Guild => playerGuild(document.world) as Guild;

  /**
   * Played through the night of Day 3 with Wealth to spare, then put below the floor: the Guild
   * State Engine finds it so on the night of Day 4, the Turn the world is left at.
   */
  function belowSinceDay4(seed: string, deps: EngineDeps): WorldDocument {
    const aboveTheFloor = playTo(created(seed, deps, 1_000), nightOf(3), deps).document;
    player(aboveTheFloor).wealth = deps.config.bankruptcyFloor - 1;
    return playTo(aboveTheFloor, nightOf(4), deps).document;
  }

  test('is none while belowFloorSince is null: a new game, and a Guild at the floor after a night', () => {
    const deps = testDeps();
    const fresh = created('countdown-none', deps, deps.config.bankruptcyFloor);
    expect(player(fresh).belowFloorSince).toBeNull();
    expect(bankruptcyCountdown(player(fresh), deps.config)).toBeNull();

    const night = playTo(fresh, nightOf(0), deps).document;
    expect(player(night).belowFloorSince).toBeNull();
    expect(bankruptcyCountdown(player(night), deps.config)).toBeNull();
  });

  test("runs from the Day it was set to that Day plus the game's grace: 10 gives d + 10", () => {
    const deps = testDeps({ bankruptcyGraceDays: 10 });
    const document = belowSinceDay4('countdown-grace', deps);
    const guild = player(document);
    expect(guild.belowFloorSince).toBe(nightOf(4));

    expect(bankruptcyCountdown(guild, deps.config)).toEqual({ sinceDay: 4, dueDay: 14 });
    // Only the rule's input is read, as a Day: not the Guild's Wealth, nor which Turn of the Day.
    expect(bankruptcyCountdown({ belowFloorSince: nightOf(4) }, { bankruptcyGraceDays: 10 })).toEqual({ sinceDay: 4, dueDay: 14 });
    expect(bankruptcyCountdown({ belowFloorSince: nightOf(4) - 2 }, { bankruptcyGraceDays: 10 })).toEqual({ sinceDay: 4, dueDay: 14 });
  });

  test("still stands after Wealth rises during a Day, until that night's check clears it", () => {
    const deps = testDeps({ bankruptcyGraceDays: 10 });
    const document = structuredClone(belowSinceDay4('countdown-risen', deps));
    // After the night's check, Wealth back above the floor, as a sale would put it.
    player(document).wealth = deps.config.bankruptcyFloor + 500;

    expect(bankruptcyCountdown(player(document), deps.config)).toEqual({ sinceDay: 4, dueDay: 14 });
    const afternoon = playTo(document, nightOf(5) - 1, deps).document;
    expect(bankruptcyCountdown(player(afternoon), deps.config)).toEqual({ sinceDay: 4, dueDay: 14 });

    const cleared = playTo(afternoon, nightOf(5), deps).document;
    expect(player(cleared).belowFloorSince).toBeNull();
    expect(bankruptcyCountdown(player(cleared), deps.config)).toBeNull();
  });

  test('a wages night that keeps the Guild below the floor leaves the countdown as it was', () => {
    const deps = testDeps({ bankruptcyGraceDays: 10, upkeepEveryDays: 10 });
    const below = belowSinceDay4('countdown-upkeep', deps);

    // Day 9 is the first wages Day (DL-26, DL-91 item 1, DL-298).
    const { document, events } = playTo(below, nightOf(9), deps);

    const guildId = player(document).id;
    expect(events).toContainEqual(
      expect.objectContaining({ turn: nightOf(9), type: 'guild.wages-paid', payload: expect.objectContaining({ guildId }) }),
    );
    expect(player(document).wealth).toBeLessThan(deps.config.bankruptcyFloor);
    expect(player(document).belowFloorSince).toBe(nightOf(4));
    expect(bankruptcyCountdown(player(document), deps.config)).toEqual({ sinceDay: 4, dueDay: 14 });
  });

  test("a played Bankruptcy falls on the night of the countdown's due Day, as endings.ts rules, whatever the grace", () => {
    for (const bankruptcyGraceDays of [0, 10]) {
      const deps = testDeps({ bankruptcyGraceDays });
      // The History is appended in place, so each play starts from a game of its own.
      const start = () => created(`countdown-played-${bankruptcyGraceDays}`, deps, deps.config.bankruptcyFloor - 1);
      const first = playTo(start(), nightOf(0), deps).document;
      const countdown = bankruptcyCountdown(player(first), deps.config);
      expect(countdown).toEqual({ sinceDay: 0, dueDay: bankruptcyGraceDays });
      const dueDay = countdown?.dueDay ?? Number.NaN;

      const { document } = playTo(start(), nightOf(dueDay) + 3, deps);

      expect(document.world.ended, `grace ${bankruptcyGraceDays}`).toEqual({ turn: nightOf(dueDay), reason: 'bankruptcy' });
      if (dueDay > 0) {
        const eve = playTo(start(), nightOf(dueDay) - 1, deps).document;
        expect(eve.world.ended, `grace ${bankruptcyGraceDays}`).toBeNull();
        expect(bankruptcyCountdown(player(eve), deps.config)).toEqual(countdown);
      }
    }
  });
});

describe('signingRefusal (pre-M0 review B4)', () => {
  // Pinned rather than read from the default, which a balance pass may change.
  const config = { fameRequiredPerLevel: 10 };
  const hero = (level: number) => ({ level });

  test('a Level 1 Hero signs for any Guild, at Fame 0 too', () => {
    expect(signingRefusal({ fame: 0 }, hero(1), config)).toBeNull();
  });

  test('a Level 5 Hero refuses a Guild at Fame 0, naming the Fame asked and the shortfall', () => {
    expect(signingRefusal({ fame: 0 }, hero(5), config)).toEqual({ fameRequired: 40, fame: 0, shortfall: 40 });
  });

  test('raising Fame to fameRequiredPerLevel × (Level − 1) flips the refusal', () => {
    expect(signingRefusal({ fame: 39 }, hero(5), config)).toEqual({ fameRequired: 40, fame: 39, shortfall: 1 });
    expect(signingRefusal({ fame: 40 }, hero(5), config)).toBeNull();
    expect(signingRefusal({ fame: 41 }, hero(5), config)).toBeNull();
  });

  test('reads the multiple from the config', () => {
    expect(signingRefusal({ fame: 0 }, hero(3), { fameRequiredPerLevel: 7 })).toMatchObject({ fameRequired: 14 });
    expect(signingRefusal({ fame: 0 }, hero(9), { fameRequiredPerLevel: 0 })).toBeNull();
  });
});

describe('unsignableHeroes', () => {
  test("is the pool's Heroes who would refuse the Guild's Fame, in id order, whoever the Guild is", () => {
    const deps = testDeps({ fameRequiredPerLevel: 10, unattachedPoolSize: 4 });
    const { document } = createWorld('unsignable', setup, deps);
    const { world } = document;
    const [first, second, third, fourth] = unattachedHeroes(world);
    if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
      throw new Error('A short pool');
    }
    second.level = 3;
    fourth.level = 6;
    const ids = (fame: number) => unsignableHeroes(world, { fame }, deps.config).map((hero) => hero.id);

    expect(ids(0)).toEqual([second.id, fourth.id]);
    expect(ids(20)).toEqual([fourth.id]);
    expect(ids(50)).toEqual([]);
    for (const guild of Object.values(world.guilds)) {
      guild.fame = 0;
      expect(unsignableHeroes(world, guild, deps.config)).toEqual([second, fourth]);
    }
  });
});

describe('cheapestUnattached (DL-38)', () => {
  // Negotiation still: these tests are about who is cheapest and who would sign.
  const deps = testDeps({ fameRequiredPerLevel: 10, unattachedPoolSize: 4, negotiationRange: 0 });

  function pool() {
    const { document } = createWorld('cheapest', setup, deps);
    const heroes = unattachedHeroes(document.world);
    if (heroes.length !== 4) throw new Error('A short pool');
    // Stats that set the fees: 50 + 25 × Level + the Stats' sum ÷ 4 (INPUTS 4.7).
    const statsAt = (value: number) => Object.fromEntries(Object.keys(heroes[0]?.stats ?? {}).map((key) => [key, value]));
    heroes.forEach((hero, index) => (hero.stats = statsAt([12, 8, 8, 10][index] ?? 10)));
    const guildmasterId = playerGuild(document.world)?.guildmasterId ?? makeId('guildmasters', 0);
    return { world: document.world, heroes: heroes as [Hero, Hero, Hero, Hero], guildmasterId };
  }

  test('is the Hero with the lowest fee, the lowest id among equal fees, with that fee', () => {
    const { world, heroes } = pool();
    const [, second] = heroes;

    expect(cheapestUnattached(world, deps)).toEqual({ hero: second, fee: signingFee(second, deps) });
    expect(signingFee(second, deps)).toBe(signingFee(heroes[2], deps));
  });

  test("given a Guild, passes over a Hero who would refuse its Fame, and is null when none would sign", () => {
    const { world, heroes, guildmasterId } = pool();
    const [first, second, third, fourth] = heroes;
    second.level = 2; // asks Fame 10, and now costs 25 more
    third.level = 2;

    expect(cheapestUnattached(world, deps, { fame: 0, guildmasterId })?.hero).toBe(fourth);
    expect(cheapestUnattached(world, deps, { fame: 10, guildmasterId })?.hero).toBe(fourth);
    expect(cheapestUnattached(world, deps)?.hero).toBe(fourth);
    for (const hero of [first, fourth]) hero.level = 3;
    expect(cheapestUnattached(world, deps, { fame: 0, guildmasterId })).toBeNull();
    expect(cheapestUnattached(world, deps, { fame: 10, guildmasterId })?.hero).toBe(second);
    // Without a Guild, Fame is not asked: the cheapest in the pool, whoever they would sign for.
    expect(cheapestUnattached(world, deps)?.hero).toBe(second);
  });

  test('is null for an empty pool', () => {
    expect(cheapestUnattached({ heroes: {}, guildmasters: {} }, deps)).toBeNull();
    expect(cheapestUnattached({ heroes: {}, guildmasters: {} }, deps, { fame: 100, guildmasterId: makeId('guildmasters', 0) })).toBeNull();
  });
});

describe('offeredQuests (DL-38)', () => {
  test("is the Board's Quests on offer, in the Board's order, and no other", () => {
    const { document } = createWorld('offered', setup, testDeps());
    const { world } = document;
    const [first, second, third, ...rest] = world.board;
    if (first === undefined || second === undefined || third === undefined) throw new Error('A short Board');
    world.board = [third, first, second, makeId('quests', 999), ...rest];
    (world.quests[first] as { status: string }).status = 'taken';

    expect(offeredQuests(world).map((quest) => quest.id)).toEqual([third, second, ...rest]);
    expect(offeredQuests({ board: [], quests: world.quests })).toEqual([]);
  });
});
