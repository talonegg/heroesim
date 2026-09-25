import { describe, expect, test } from 'vitest';
import { createWorld } from './create.js';
import { makeId, type Hero } from './document.js';
import { testDeps } from './world.test-support.js';
import { baseStat, playerGuild, unattachedHeroes } from './selectors.js';

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
