import { describe, expect, test } from 'vitest';
import type { Controller, Guild, World } from '../document.js';
import type { StreamName } from '../rng.js';
import { generateGuild, type GuildOptions } from './guilds.js';
import { testDeps, testWorld } from './test-content.js';

const player: Controller = { kind: 'player' };
const rival: Controller = { kind: 'rival', disposition: 'steady' };

function rosterClasses(world: World, guild: Guild): string[] {
  return guild.rosterIds.map((id) => world.heroes[id]?.classKey ?? 'missing');
}

function tally(keys: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}

describe('generateGuild', () => {
  test('makes a Guild at Fame 0 with an unimproved Hall, its Guildmaster, and its Roster', () => {
    const deps = testDeps();
    const world = testWorld('guild', deps);
    world.turn = 5;
    const { guild, guildmaster } = generateGuild(world, deps, { controller: rival, rosterSize: 6, wealth: 450 });

    expect(guild).toMatchObject({
      id: 'guild-000001',
      guildmasterId: 'guildmaster-000001',
      foundedTurn: 5,
      wealth: 450,
      fame: 0,
      belowFloorSince: null,
      foldedOnTurn: null,
      hall: { infirmary: 0, trainingYard: 0, quarters: 0 },
      controller: rival,
      regard: {},
    });
    expect(guild.controller).not.toBe(rival);
    expect(deps.content.names.guild).toContain(guild.name);
    expect(deps.content.backgrounds[guild.backgroundKey]?.owner).toBe('guild');
    expect(world.guilds[guild.id]).toBe(guild);
    expect(world.guildmasters[guildmaster.id]).toBe(guildmaster);
    expect(guildmaster).toMatchObject({ guildId: guild.id, enteredTurn: 5, regard: {} });

    expect(guild.rosterIds).toHaveLength(6);
    for (const id of guild.rosterIds) expect(world.heroes[id]?.guildId).toBe(guild.id);
  });

  test("the Guildmaster has the five Guildmaster Stats, an age and 0–2 Guildmaster Traits from the config's ranges", () => {
    const deps = testDeps();
    const world = testWorld('guildmasters', deps);
    const guildmasterStats = Object.values(deps.content.stats).filter((stat) => stat.owner === 'guildmaster');
    const traitCounts = new Set<number>();

    // Every Guild name is taken by the eighth Guild, so each round starts a fresh world.
    for (let round = 0; round < 40; round += 1) {
      const roundWorld = round === 0 ? world : testWorld(`guildmasters-${round}`, deps);
      for (let i = 0; i < 8; i += 1) {
        const { guildmaster } = generateGuild(roundWorld, deps, { controller: rival, rosterSize: 0, wealth: 0 });

        expect(Object.keys(guildmaster.stats).sort()).toEqual(guildmasterStats.map((stat) => stat.key).sort());
        for (const [key, value] of Object.entries(guildmaster.stats)) {
          expect(value, key).toBeGreaterThanOrEqual(deps.config.guildmasterStatMin);
          expect(value, key).toBeLessThanOrEqual(deps.config.guildmasterStatMax);
        }
        expect(guildmaster.ageAtEntry).toBeGreaterThanOrEqual(deps.config.guildmasterStartingAgeMin);
        expect(guildmaster.ageAtEntry).toBeLessThanOrEqual(deps.config.guildmasterStartingAgeMax);
        expect(new Set(guildmaster.traits).size).toBe(guildmaster.traits.length);
        for (const key of guildmaster.traits) expect(deps.content.traits[key]?.owner).toBe('guildmaster');
        traitCounts.add(guildmaster.traits.length);
      }
    }

    expect([...traitCounts].sort()).toEqual([0, 1, 2]);
  });

  test('deals Classes evenly: four Heroes are one per Class, eight are two per Class', () => {
    const deps = testDeps();
    const world = testWorld('classes', deps);
    const classKeys = Object.keys(deps.content.classes).sort();

    for (let i = 0; i < 4; i += 1) {
      const four = generateGuild(world, deps, { controller: rival, rosterSize: 4, wealth: 0 }).guild;
      expect(rosterClasses(world, four).sort()).toEqual(classKeys);
    }
    const eight = generateGuild(world, deps, { controller: rival, rosterSize: 8, wealth: 0 }).guild;
    expect(tally(rosterClasses(world, eight))).toEqual(Object.fromEntries(classKeys.map((key) => [key, 2])));
    const six = generateGuild(world, deps, { controller: rival, rosterSize: 6, wealth: 0 }).guild;
    expect(Object.values(tally(rosterClasses(world, six))).sort()).toEqual([1, 1, 2, 2]);
  });

  test("a player's Guild and a Rival's from the same seed and parameters differ only in controller (ADR-0002)", () => {
    const deps = testDeps();
    const parameters: Omit<GuildOptions, 'controller'> = { rosterSize: 6, wealth: 500 };
    const playerWorld = testWorld('adr-0002', deps);
    const rivalWorld = testWorld('adr-0002', deps);
    const asPlayer = generateGuild(playerWorld, deps, { ...parameters, controller: player });
    const asRival = generateGuild(rivalWorld, deps, { ...parameters, controller: rival });

    expect(asPlayer.guild.controller).toEqual(player);
    expect(asRival.guild.controller).toEqual(rival);
    // Put the player's controller on the Rival: the two worlds, rows and events are then identical.
    rivalWorld.guilds[asRival.guild.id] = { ...asRival.guild, controller: player };
    expect(rivalWorld).toEqual(playerWorld);
    expect(asRival.guildmaster).toEqual(asPlayer.guildmaster);
    expect(asRival.events).toEqual(asPlayer.events);
  });

  test('takes the name, Background and Guildmaster name it is given', () => {
    const deps = testDeps();
    const world = testWorld('given', deps);
    const { guild, guildmaster } = generateGuild(world, deps, {
      controller: player,
      rosterSize: 0,
      wealth: 0,
      name: 'The Salt Road Company',
      backgroundKey: 'old-charter',
      guildmasterName: 'Mildrith Scarth',
    });

    expect(guild.name).toBe('The Salt Road Company');
    expect(guild.backgroundKey).toBe('old-charter');
    expect(guildmaster.name).toBe('Mildrith Scarth');
  });

  test('never draws a Guild name another Guild has, and throws once every name is taken', () => {
    const deps = testDeps();
    const world = testWorld('names', deps);
    const names = deps.content.names.guild;
    // The first Guild takes a content name as its own, as a player might.
    generateGuild(world, deps, { controller: player, rosterSize: 0, wealth: 0, name: names[3] ?? '' });
    for (let i = 1; i < names.length; i += 1) {
      generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 0 });
    }

    expect(Object.values(world.guilds).map((guild) => guild.name).sort()).toEqual([...names].sort());
    const before = structuredClone(world);
    expect(() => generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 0 })).toThrow(/Guild name/);
    expect(world).toEqual(before);
  });

  test('emits guild.founded as a Milestone, guildmaster.generated, then hero.generated per Roster Hero', () => {
    const deps = testDeps();
    const world = testWorld('events', deps);
    const { guild, guildmaster, events } = generateGuild(world, deps, { controller: rival, rosterSize: 2, wealth: 0 });
    const labels = { [guild.id]: guild.name, [guildmaster.id]: guildmaster.name };

    expect(events.map((event) => event.type)).toEqual([
      'guild.founded',
      'guildmaster.generated',
      'hero.generated',
      'hero.generated',
    ]);
    expect(events[0]).toEqual({
      turn: 0,
      type: 'guild.founded',
      participants: [guild.id, guildmaster.id],
      labels,
      milestone: true,
      payload: { guildId: guild.id, guildmasterId: guildmaster.id },
    });
    expect(events[1]).toEqual({
      turn: 0,
      type: 'guildmaster.generated',
      participants: [guildmaster.id, guild.id],
      labels,
      milestone: false,
      payload: { guildmasterId: guildmaster.id, guildId: guild.id },
    });
    for (const [index, heroId] of guild.rosterIds.entries()) {
      expect(events[index + 2]?.participants).toEqual([heroId, guild.id]);
    }
  });

  test('draws everything, its Roster included, from generation unless its caller names another stream', () => {
    const deps = testDeps();
    const streams = ['generation', 'rivals'];
    const byDefault = testWorld('stream', deps, streams);
    const named = testWorld('stream', deps, streams);
    const before = structuredClone(byDefault.rng);
    const rivalsStream = (world: World): unknown => (world.rng as Record<string, unknown>).rivals;

    generateGuild(byDefault, deps, { controller: rival, rosterSize: 8, wealth: 0 });
    expect(rivalsStream(byDefault)).toEqual((before as Record<string, unknown>).rivals);
    expect(byDefault.rng.generation).not.toEqual(before.generation);

    // `rivals` joins `streamNames` in the milestone that first draws from it.
    const { guild } = generateGuild(named, deps, {
      controller: rival,
      rosterSize: 8,
      wealth: 0,
      stream: 'rivals' as string as StreamName,
    });
    expect(named.rng.generation).toEqual(before.generation);
    expect(rivalsStream(named)).not.toEqual((before as Record<string, unknown>).rivals);
    expect(guild.rosterIds).toHaveLength(8);
  });

  test('throws, changing nothing, on a blank name, a Background that is not a Guild one, or a bad Roster size or Wealth', () => {
    const deps = testDeps();
    const world = testWorld('refusals', deps);
    const before = structuredClone(world);
    const base: GuildOptions = { controller: player, rosterSize: 4, wealth: 0 };

    expect(() => generateGuild(world, deps, { ...base, name: '  ' })).toThrow(RangeError);
    expect(() => generateGuild(world, deps, { ...base, guildmasterName: '' })).toThrow(RangeError);
    expect(() => generateGuild(world, deps, { ...base, backgroundKey: 'farm-born' })).toThrow(/farm-born/);
    expect(() => generateGuild(world, deps, { ...base, backgroundKey: 'moon-born' })).toThrow(/moon-born/);
    expect(() => generateGuild(world, deps, { ...base, rosterSize: -1 })).toThrow(RangeError);
    expect(() => generateGuild(world, deps, { ...base, rosterSize: 2.5 })).toThrow(RangeError);
    expect(() => generateGuild(world, deps, { ...base, wealth: Number.NaN })).toThrow(RangeError);
    expect(world).toEqual(before);
  });
});
