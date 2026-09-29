import { describe, expect, test } from 'vitest';
import type { Controller, Guild, World } from '../document.js';
import { next, type StreamName } from '../rng.js';
import { dealtDisposition, generateGuild, generateRival, type GuildOptions } from './guilds.js';
import { testDeps, testWorld } from '../world.test-support.js';

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

  test("draws a name no Guild has had over a folded Guild's while one is left (DL-28)", () => {
    const deps = testDeps();
    const names = deps.content.names.guild;
    for (let round = 0; round < 20; round += 1) {
      const world = testWorld(`fresh-${round}`, deps);
      for (let i = 0; i < names.length - 1; i += 1) generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 0 });
      for (const guild of Object.values(world.guilds).slice(0, 3)) guild.foldedOnTurn = 2;
      const [unused] = names.filter((name) => !Object.values(world.guilds).some((guild) => guild.name === name));

      expect(generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 0 }).guild.name).toBe(unused);
    }
  });

  test("once every name has been used, reuses a folded Guild's, never a name a Guild in play has (DL-28)", () => {
    const deps = testDeps();
    const world = testWorld('reused', deps);
    const names = deps.content.names.guild;
    for (let i = 0; i < names.length; i += 1) generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 0 });
    const [first, second] = Object.values(world.guilds);
    if (first === undefined || second === undefined) throw new Error('Too few Guilds');
    first.foldedOnTurn = 2;
    second.foldedOnTurn = 5;

    const reused = [0, 1].map(() => generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 0 }).guild.name);

    expect(reused.sort()).toEqual([first.name, second.name].sort());
    // Every name is a Guild in play's again: nothing is left to draw.
    expect(() => generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 0 })).toThrow(/Guild name/);
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

    // Any core stream the caller names: `rivals` (M2-S9) here.
    const stream: StreamName = 'rivals';
    const { guild } = generateGuild(named, deps, { controller: rival, rosterSize: 8, wealth: 0, stream });
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

describe("a drawn Guildmaster's Traits on the budget (M9-S2, DL-100 item 3)", () => {
  /** `count` Guildmasters generated under `deps`, eight to a world as the Guild names allow. */
  function guildmasters(deps: ReturnType<typeof testDeps>, count: number) {
    const drawn = [];
    for (let round = 0; drawn.length < count; round += 1) {
      const world = testWorld(`budget-${round}`, deps);
      for (let i = 0; i < 8 && drawn.length < count; i += 1) {
        drawn.push(generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 0 }).guildmaster);
      }
    }
    return drawn;
  }

  const costOf = (deps: ReturnType<typeof testDeps>, keys: readonly string[]): number =>
    keys.reduce((sum, key) => sum + (deps.content.traits[key]?.cost ?? Number.NaN), 0);

  test('the budget is guildmasterTraitBudget, 1 by default, under configVersion 11', () => {
    expect(testDeps().config).toMatchObject({ guildmasterTraitBudget: 1, guildmasterTraitsMin: 0, guildmasterTraitsMax: 2 });
    expect(testDeps().config.configVersion).toBe(11);
  });

  test('every drawn Guildmaster keeps within the budget and holds no excluded pair, and 0, 1 and 2 Traits are all drawn', () => {
    const deps = testDeps();
    const drawn = guildmasters(deps, 400);
    const held = new Set<string>();

    for (const { traits } of drawn) {
      expect(costOf(deps, traits), traits.join(' ')).toBeLessThanOrEqual(1);
      for (const key of traits) {
        expect(deps.content.traits[key]?.owner).toBe('guildmaster');
        for (const other of traits) expect(deps.content.traits[key]?.excludes, `${key} and ${other}`).not.toContain(other);
      }
      expect(new Set(traits).size).toBe(traits.length);
      held.add([...traits].sort().join(' '));
    }

    expect(new Set(drawn.map(({ traits }) => traits.length))).toEqual(new Set([0, 1, 2]));
    // The dearer buffs come only beside a penalty drawn before them: a running cost within the budget.
    expect(held).toContain('miser thrifty');
    expect(held).toContain('spendthrift well-liked');
    expect(held).not.toContain('thrifty');
    expect(held).not.toContain('well-liked');
    expect(held).not.toContain('miser spendthrift');
  });

  test('each draw is among the Traits that keep the running cost within the budget, and a draw with none eligible stops short', () => {
    // At a budget of −2 the first draw can take only Miser or Spendthrift, and the second only
    // Mistrusts magic: the other penalty is excluded, and every buff would pass −2.
    const tight = testDeps({ guildmasterTraitBudget: -2, guildmasterTraitsMin: 2, guildmasterTraitsMax: 2 });
    const pairs = new Set(guildmasters(tight, 60).map(({ traits }) => traits.join(' ')));
    expect(pairs).toEqual(new Set(['miser mistrusts-magic', 'spendthrift mistrusts-magic']));

    // Below every cost, no Trait is ever eligible: the draw stops at none.
    const none = testDeps({ guildmasterTraitBudget: -3, guildmasterTraitsMin: 2, guildmasterTraitsMax: 2 });
    for (const { traits } of guildmasters(none, 40)) expect(traits).toEqual([]);
  });

  test("the draw takes the draws DL-19's shuffle took, one for the count and one for each Guildmaster Trait but the last, so nothing after it moves", () => {
    const deps = testDeps();
    const world = testWorld('draw-count', deps);
    const twin = structuredClone(world.rng.generation);
    generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 0 });

    // The Guild's name and Background (2), then the Guildmaster's sex (1), name (2), age (1), five
    // Stats (5), the count (1) and five of the six Guildmaster Traits (5): 17 draws.
    for (let draw = 0; draw < 17; draw += 1) next(twin);
    expect(world.rng.generation).toEqual(twin);
  });

  test('the draw takes a fixed number of draws: the costs and exclusions move no later draw', () => {
    const deps = testDeps();
    const free = testDeps({}, {
      ...deps.content,
      traits: Object.fromEntries(Object.entries(deps.content.traits).map(([key, trait]) => [key, { ...trait, cost: 0, excludes: [] }])),
    });
    const priced = testWorld('fixed', deps);
    const unpriced = testWorld('fixed', free);
    for (let i = 0; i < 8; i += 1) {
      generateGuild(priced, deps, { controller: rival, rosterSize: 0, wealth: 0 });
      generateGuild(unpriced, free, { controller: rival, rosterSize: 0, wealth: 0 });
      expect(priced.rng.generation).toEqual(unpriced.rng.generation);
    }
  });
});

describe('generateRival', () => {
  test("draws a Roster size and Wealth from the Rival ranges, then a Rival with the controller given, from the caller's stream", () => {
    const deps = testDeps({ rivalRosterMin: 2, rivalRosterMax: 5, rivalStartingWealthMin: 100, rivalStartingWealthMax: 200 });
    const sizes = new Set<number>();
    for (let round = 0; round < 40; round += 1) {
      const world = testWorld(`rival-${round}`, deps);
      world.turn = 11;
      const before = structuredClone(world.rng);
      const controller: Controller = { kind: 'rival', disposition: round % 2 === 0 ? 'steady' : 'reckless' };
      const { guild, events } = generateRival(world, deps, { controller });

      expect(guild).toMatchObject({ controller, foundedTurn: 11, foldedOnTurn: null });
      expect(guild.controller).not.toBe(controller);
      expect(guild.wealth).toBeGreaterThanOrEqual(100);
      expect(guild.wealth).toBeLessThanOrEqual(200);
      expect(guild.rosterIds.length).toBeGreaterThanOrEqual(2);
      expect(guild.rosterIds.length).toBeLessThanOrEqual(5);
      expect(events[0]).toMatchObject({ type: 'guild.founded', turn: 11, milestone: true });
      expect(world.rng.generation).not.toEqual(before.generation);
      expect(world.rng.pool).toEqual(before.pool);
      sizes.add(guild.rosterIds.length);
    }
    expect(sizes.size).toBeGreaterThan(1);
  });

  test('draws the same whichever Disposition it is given: the controller moves no stream (DL-56)', () => {
    const deps = testDeps();
    const worlds = (['steady', 'reckless', 'unknown-to-content'] as const).map((disposition) => {
      const world = testWorld('rival-controller', deps);
      generateRival(world, deps, { controller: { kind: 'rival', disposition } });
      return world;
    });
    const [first, ...rest] = worlds as [World, ...World[]];
    for (const world of rest) {
      expect(world.rng).toEqual(first.rng);
      expect(Object.values(world.heroes)).toEqual(Object.values(first.heroes));
    }
  });
});

describe('dealtDisposition (M6-S1, DL-56)', () => {
  test("deals content's Dispositions round-robin in key order, starting again after the last", () => {
    const { content } = testDeps();
    const dealt = Array.from({ length: 9 }, (_, index) => dealtDisposition(content, index));

    expect(dealt).toEqual(['ambitious', 'miserly', 'reckless', 'steady', 'ambitious', 'miserly', 'reckless', 'steady', 'ambitious']);
  });

  test('throws on an index that is not a whole number from 0, or content with no Disposition', () => {
    const { content } = testDeps();
    expect(() => dealtDisposition(content, -1)).toThrow(RangeError);
    expect(() => dealtDisposition(content, 1.5)).toThrow(RangeError);
    expect(() => dealtDisposition({ dispositions: {} }, 0)).toThrow(/no Disposition/);
  });
});
