import { describe, expect, expectTypeOf, test } from 'vitest';
import { createWorld } from './create.js';
import { makeId, type Guild, type Hero } from './document.js';
import { testDeps } from './world.test-support.js';
import { baseStat, playerGuild, unattachedHeroes, upkeep } from './selectors.js';

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

describe('upkeep', () => {
  test('sums wagePerLevel × Level over the Roster, plus hallMaintenancePerGrade × the summed Hall grades', () => {
    const deps = testDeps({ wagePerLevel: 5, hallMaintenancePerGrade: 10 });
    const { document } = createWorld('upkeep-wages', setup, deps);
    const { world } = document;
    const guild = playerGuild(world) as Guild;
    const [first, second] = guild.rosterIds;
    if (first === undefined || second === undefined) throw new Error('need two Heroes on the Roster');
    (world.heroes[first] as Hero).level = 3;
    (world.heroes[second] as Hero).level = 2;
    guild.hall = { infirmary: 1, trainingYard: 2, quarters: 0 };

    const wages = guild.rosterIds.reduce((total, id) => total + 5 * (world.heroes[id] as Hero).level, 0);

    expect(upkeep(guild, world, deps.config)).toBe(wages + 10 * (1 + 2 + 0));
  });

  test('a fresh Guild has no Hall grade, so Upkeep is wages alone: every Hero starts at Level 1', () => {
    const deps = testDeps({ wagePerLevel: 5, hallMaintenancePerGrade: 10 });
    const { document } = createWorld('upkeep-fresh', setup, deps);
    const { world } = document;
    const guild = playerGuild(world) as Guild;

    expect(upkeep(guild, world, deps.config)).toBe(5 * guild.rosterIds.length);
  });

  test('counts a Hero away on a Quest the same as any other on the Roster: leaving is what removes one', () => {
    const deps = testDeps({ wagePerLevel: 5, hallMaintenancePerGrade: 10 });
    const { document } = createWorld('upkeep-away', setup, deps);
    const { world } = document;
    const guild = playerGuild(world) as Guild;
    const [awayId] = guild.rosterIds;
    if (awayId === undefined) throw new Error('no Hero on the Roster');
    const home = upkeep(guild, world, deps.config);
    (world.heroes[awayId] as Hero).partyId = makeId('parties', 1);

    expect(upkeep(guild, world, deps.config)).toBe(home);
  });

  test('excludes a dead or retired Hero even if their id is still on the Roster', () => {
    const deps = testDeps({ wagePerLevel: 5, hallMaintenancePerGrade: 0 });
    const { document } = createWorld('upkeep-dead', setup, deps);
    const { world } = document;
    const guild = playerGuild(world) as Guild;
    const [deadId, retiredId] = guild.rosterIds;
    if (deadId === undefined || retiredId === undefined) throw new Error('need two Heroes on the Roster');
    (world.heroes[deadId] as Hero).diedOnTurn = 5;
    (world.heroes[retiredId] as Hero).retiredOnTurn = 5;

    const living = guild.rosterIds.filter((id) => id !== deadId && id !== retiredId);
    const expected = living.reduce((total, id) => total + 5 * (world.heroes[id] as Hero).level, 0);
    expect(upkeep(guild, world, deps.config)).toBe(expected);
  });

  test('is a selector: no `upkeep` field on the Guild row, at the type level or in a created world', () => {
    expectTypeOf<Guild>().not.toHaveProperty('upkeep');

    const { document } = createWorld('upkeep-no-field', setup, testDeps());
    for (const guild of Object.values(document.world.guilds)) {
      expect(Object.hasOwn(guild, 'upkeep')).toBe(false);
    }
  });
});
