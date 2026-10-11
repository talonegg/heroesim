import { describe, expect, test } from 'vitest';
import { captainChoice, captainLock, captaincyScale, captaincyStat, captainScale, leaveRoster } from './captain.js';
import { createWorld } from './create.js';
import type { Guild, Hero, World } from './document.js';
import { playerGuild } from './selectors.js';
import { dayOf, turnsPerDay } from './time.js';
import { testContent, testDeps, withCaptaincy } from './world.test-support.js';

// The Captain's reading of the world (DL-280 item 6, DL-287): the captaincy Stat content marks, a
// Captain's scale on it, the lock a change of Captain sets, a post left empty by a Hero leaving the
// Roster, and the Hero a Guild names to an empty post.

const content = withCaptaincy();
const deps = testDeps({ rivalCount: 0 }, content);

/** A new world, its player's Guild and its Roster's Heroes, each made plain: no Trait, so their Leadership is their own. */
function scene(seed = 'captain'): { world: World; guild: Guild; heroes: Hero[] } {
  const { world } = createWorld(seed, { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps).document;
  const guild = playerGuild(world) as Guild;
  const heroes = guild.rosterIds.map((id) => world.heroes[id] as Hero);
  for (const hero of heroes) hero.traits = [];
  return { world, guild, heroes };
}

describe('the captaincy Stat', () => {
  test('is the Stat content marks, and none where content marks none', () => {
    expect(captaincyStat(content)).toBe('leadership');
    expect(captaincyStat(withCaptaincy(testContent, 'charisma'))).toBe('charisma');
    expect(captaincyStat(testContent)).toBeNull();
  });

  test("scales a Captain from 0 at the Stat's least to 1 at its most, in a line, held there beyond", () => {
    // Leadership runs from 1 to 20 in the test content.
    expect(captaincyScale({ leadership: 1 }, content)).toBe(0);
    expect(captaincyScale({ leadership: 20 }, content)).toBe(1);
    expect(captaincyScale({ leadership: 10.5 }, content)).toBeCloseTo(0.5, 12);
    expect(captaincyScale({ leadership: 5 }, content)).toBeCloseTo(4 / 19, 12);
    expect(captaincyScale({ leadership: 24 }, content)).toBe(1);
    expect(captaincyScale({ leadership: 0 }, content)).toBe(0);
  });

  test('scales by the Stat content marks alone, 0 where it marks none or a Hero lacks it', () => {
    expect(captaincyScale({ leadership: 1, charisma: 20 }, withCaptaincy(testContent, 'charisma'))).toBe(1);
    expect(captaincyScale({ leadership: 20 }, testContent)).toBe(0);
    expect(captaincyScale({}, content)).toBe(0);
  });

  test("reads a Captain's effective Stat: what their Gear and Traits add counts", () => {
    const { world, heroes } = scene();
    const hero = heroes[0] as Hero;
    hero.stats['leadership'] = 20;
    expect(captainScale(hero, world, content)).toBe(1);
    hero.stats['leadership'] = 1;
    expect(captainScale(hero, world, content)).toBe(0);
  });
});

describe("a change of Captain's lock", () => {
  const config = { captainChangeLockDays: 30 };

  test('holds the post from the change to the morning of the Day the lock ends, as a Transfer holds a Hero', () => {
    const changedOnTurn = 5 * turnsPerDay + 1;
    const guild = { captainChangedOnTurn: changedOnTurn };
    const untilTurn = (dayOf(changedOnTurn) + 30) * turnsPerDay;
    expect(captainLock(guild, changedOnTurn, config)).toEqual({ changedOnTurn, untilTurn });
    expect(captainLock(guild, untilTurn - 1, config)).toEqual({ changedOnTurn, untilTurn });
    expect(captainLock(guild, untilTurn, config)).toBeNull();
  });

  test('holds nothing for a post never changed, nor for a lock of 0 Days', () => {
    expect(captainLock({ captainChangedOnTurn: null }, 10, config)).toBeNull();
    expect(captainLock({ captainChangedOnTurn: 10 }, 10, { captainChangeLockDays: 0 })).toBeNull();
  });
});

describe('a Hero leaving the Roster', () => {
  test('leaves it, and empties the post when they were the Captain, keeping the lock as it was', () => {
    const { guild, heroes } = scene();
    const [captain, other] = heroes as [Hero, Hero];
    guild.captainId = captain.id;
    guild.captainChangedOnTurn = 3;

    leaveRoster(guild, other.id);
    expect(guild.rosterIds).not.toContain(other.id);
    expect(guild.captainId).toBe(captain.id);

    leaveRoster(guild, captain.id);
    expect(guild.rosterIds).not.toContain(captain.id);
    expect(guild.captainId).toBeNull();
    expect(guild.captainChangedOnTurn).toBe(3);
  });
});

describe('the Hero a Guild names to an empty post', () => {
  test("is its Hero highest in the captaincy Stat, whoever they are and wherever they are", () => {
    const { world, guild, heroes } = scene();
    heroes.forEach((hero, index) => (hero.stats['leadership'] = 5 + index));
    const best = heroes.at(-1) as Hero;
    best.partyId = null;
    best.injury = { typeKey: 'broken-arm', healsOnTurn: world.turn + 40 };

    expect(captainChoice(world, guild, deps)).toEqual({ kind: 'nameCaptain', guildId: guild.id, heroId: best.id });
  });

  test('takes the first in Roster order among Heroes tied, drawing nothing', () => {
    const { world, guild, heroes } = scene();
    for (const hero of heroes) hero.stats['leadership'] = 12;
    const rng = structuredClone(world.rng);

    expect(captainChoice(world, guild, deps)).toEqual({ kind: 'nameCaptain', guildId: guild.id, heroId: guild.rosterIds[0] });
    expect(world.rng).toEqual(rng);
  });

  test('is none while the post is held, for an empty Roster, for a folded Guild, or where content marks no captaincy Stat', () => {
    const { world, guild, heroes } = scene();
    expect(captainChoice(world, guild, testDeps({ rivalCount: 0 }))).toBeNull();

    guild.captainId = (heroes[0] as Hero).id;
    expect(captainChoice(world, guild, deps)).toBeNull();

    guild.captainId = null;
    expect(captainChoice(world, { ...guild, foldedOnTurn: world.turn }, deps)).toBeNull();
    expect(captainChoice(world, { ...guild, rosterIds: [] }, deps)).toBeNull();
  });
});
