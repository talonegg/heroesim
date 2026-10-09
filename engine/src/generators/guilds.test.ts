import { describe, expect, test } from 'vitest';
import type { Controller, Guild, World } from '../document.js';
import { next, type StreamName } from '../rng.js';
import { dealtDisposition, generateGuild, generateRival, generateSuccessor, type GuildOptions } from './guilds.js';
import { ageIntoPortrait, ageSpanOf, guildmasterPortraitsInUse, portraitRowOf, portraitSexOf } from '../portraits.js';
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
        for (const key of guildmaster.traits) expect(Object.keys(deps.content.guildmasterTraits)).toContain(key);
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

  test("guild.founded carries the Guild's founding Wealth (DL-120 item 4)", () => {
    const deps = testDeps();
    const world = testWorld('founding-wealth', deps);
    const { guild, events } = generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 1_234 });

    expect(guild.wealth).toBe(1_234);
    expect(events[0]?.payload).toEqual({ guildId: guild.id, guildmasterId: guild.guildmasterId, wealth: 1_234 });
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
      payload: { guildId: guild.id, guildmasterId: guildmaster.id, wealth: 0 },
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

    // Any core stream the caller names: `rivals` here.
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

describe("a drawn Guildmaster's Traits on the budget (DL-100 item 3; DL-109 item 1)", () => {
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
    keys.reduce((sum, key) => sum + (deps.content.guildmasterTraits[key]?.cost ?? Number.NaN), 0);

  test('the budget is guildmasterTraitBudget, 1 by default (DL-102, DL-113)', () => {
    expect(testDeps().config).toMatchObject({ guildmasterTraitBudget: 1, guildmasterTraitsMin: 0, guildmasterTraitsMax: 2 });
  });

  test('every drawn Guildmaster keeps within the budget and holds no excluded pair, and 0, 1 and 2 Traits are all drawn', () => {
    const deps = testDeps();
    const drawn = guildmasters(deps, 400);
    const held = new Set<string>();

    for (const { traits } of drawn) {
      expect(costOf(deps, traits), traits.join(' ')).toBeLessThanOrEqual(1);
      for (const key of traits) {
        expect(Object.keys(deps.content.guildmasterTraits)).toContain(key);
        for (const other of traits) expect(deps.content.guildmasterTraits[key]?.excludes, `${key} and ${other}`).not.toContain(other);
      }
      expect(new Set(traits).size).toBe(traits.length);
      held.add([...traits].sort().join(' '));
    }

    expect(new Set(drawn.map(({ traits }) => traits.length))).toEqual(new Set([0, 1, 2]));
    // The dearer buffs come only beside a penalty: a set's cost within the budget.
    expect(held).toContain('miser thrifty');
    expect(held).toContain('spendthrift well-liked');
    expect(held).not.toContain('thrifty');
    expect(held).not.toContain('well-liked');
    expect(held).not.toContain('miser spendthrift');
  });

  test('the Traits are one set drawn uniformly from every legal set of the count drawn (DL-109 item 1)', () => {
    // At the core's costs and a budget of 1, nine pairs are legal: no excluded pair, costing at most 1.
    const legalPairs = [
      'miser mistrusts-magic',
      'miser old-soldier',
      'miser thrifty',
      'mistrusts-magic old-soldier',
      'mistrusts-magic spendthrift',
      'mistrusts-magic thrifty',
      'mistrusts-magic well-liked',
      'old-soldier spendthrift',
      'spendthrift well-liked',
    ];
    const pairs = guildmasters(testDeps({ guildmasterTraitsMin: 2, guildmasterTraitsMax: 2 }), 1800).map(({ traits }) => traits.join(' '));
    const counts = tally(pairs);

    expect(Object.keys(counts).sort()).toEqual(legalPairs);
    // Each is drawn about one time in nine: 200 of 1,800, which a Trait at a time never gave
    // (Mistrusts magic beside Thrifty came one time in twenty).
    for (const pair of legalPairs) {
      expect(counts[pair], pair).toBeGreaterThan(140);
      expect(counts[pair], pair).toBeLessThan(260);
    }
  });

  test("a set's Traits are held in the content's Trait order, whichever were drawn", () => {
    const deps = testDeps();
    const order = Object.keys(deps.content.guildmasterTraits).sort();
    for (const { traits } of guildmasters(deps, 200)) {
      expect(traits).toEqual([...traits].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    }
  });

  test('a count no legal set has falls to the largest smaller size that has one, and the empty set is always legal', () => {
    // No five of the six are free of an excluded pair, so a count of six draws one of the two legal fours.
    const six = guildmasters(testDeps({ guildmasterTraitsMin: 6, guildmasterTraitsMax: 6 }), 60).map(({ traits }) => traits.join(' '));
    expect(new Set(six)).toEqual(new Set(['miser mistrusts-magic old-soldier thrifty', 'mistrusts-magic old-soldier spendthrift well-liked']));

    // At a budget of −3 no three are cheap enough, and no one Trait alone: two penalties together are.
    const tight = testDeps({ guildmasterTraitBudget: -3, guildmasterTraitsMin: 3, guildmasterTraitsMax: 3 });
    const pairs = new Set(guildmasters(tight, 60).map(({ traits }) => traits.join(' ')));
    expect(pairs).toEqual(new Set(['miser mistrusts-magic', 'mistrusts-magic spendthrift']));

    // Below every set's cost, only the empty set is left, whatever the count.
    const none = testDeps({ guildmasterTraitBudget: -4, guildmasterTraitsMin: 2, guildmasterTraitsMax: 2 });
    for (const { traits } of guildmasters(none, 40)) expect(traits).toEqual([]);
  });

  test("the draw takes the draws DL-19's shuffle took, one for the count and one for each Guildmaster Trait but the last, so nothing after it moves", () => {
    // At the defaults; a count that falls to four; and a budget that leaves only the empty set.
    for (const overrides of [{}, { guildmasterTraitsMin: 6, guildmasterTraitsMax: 6 }, { guildmasterTraitBudget: -4 }]) {
      const deps = testDeps(overrides);
      const world = testWorld('draw-count', deps);
      const twin = structuredClone(world.rng.generation);
      generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 0 });

      // The Guild's name and Background (2), then the Guildmaster's sex (1), name (2), age (1), five
      // Stats (5), the count (1) and five of the six Guildmaster Traits (5): 17 draws.
      for (let draw = 0; draw < 17; draw += 1) next(twin);
      expect(world.rng.generation, JSON.stringify(overrides)).toEqual(twin);
    }
  });

  test('content with one Guildmaster Trait takes no draw past the count, as the shuffle of one took none', () => {
    const base = testDeps();
    const deps = testDeps({ guildmasterTraitsMin: 1, guildmasterTraitsMax: 1 }, {
      ...base.content,
      guildmasterTraits: Object.fromEntries(Object.entries(base.content.guildmasterTraits).filter(([key]) => key === 'old-soldier')),
    });
    const world = testWorld('draw-count', deps);
    const twin = structuredClone(world.rng.generation);
    const { guildmaster } = generateGuild(world, deps, { controller: rival, rosterSize: 0, wealth: 0 });

    expect(guildmaster.traits).toEqual(['old-soldier']);
    // The Guild's 2, the Guildmaster's sex, name, age and Stats (9), and the count (1): 12 draws.
    for (let draw = 0; draw < 12; draw += 1) next(twin);
    expect(world.rng.generation).toEqual(twin);
  });

  test('the draw takes a fixed number of draws: the costs and exclusions move no later draw', () => {
    const deps = testDeps();
    const free = testDeps({}, {
      ...deps.content,
      guildmasterTraits: Object.fromEntries(Object.entries(deps.content.guildmasterTraits).map(([key, trait]) => [key, { ...trait, cost: 0, excludes: [] }])),
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

describe('dealtDisposition (DL-56)', () => {
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

// DL-113 item 4: a replacement Rival's Guildmaster and a successor are drawn 21 to 50, as a
// founder is.
describe("the drawn Guildmasters' ages, 21 to 50", () => {
  test("replacements' and successors' span 21 to 50 over a thousand draws each", () => {
    const deps = testDeps();
    const replacements = new Set<number>();
    const successors = new Set<number>();
    for (let round = 0; round < 125; round += 1) {
      const world = testWorld(`drawn-ages-${round}`, deps);
      for (let i = 0; i < 8; i += 1) {
        const { guild } = generateRival(world, deps, { controller: rival });
        replacements.add((world.guildmasters[guild.guildmasterId] as { ageAtEntry: number }).ageAtEntry);
        successors.add(generateSuccessor(world, deps, guild).ageAtEntry);
      }
    }
    for (const ages of [replacements, successors]) {
      expect([Math.min(...ages), Math.max(...ages), ages.size]).toEqual([21, 50, 30]);
    }
  });
});

// DL-134 item 5, DL-135 items 3 and 4: every Guildmaster, the player's, a founding or
// replacing Rival's and a successor's, is given a Portrait that fits them as they enter play, in one
// draw from `gm-portraits`; no two living Guildmasters share one, and one whom nothing fits shows the
// Silhouette. `portraits.test.ts` holds the choice itself.
describe("every Guildmaster's Portrait, chosen as they enter play", () => {
  /** Whether `key` is a Guildmaster picture of `sex` whose ages reach the band of `age`. */
  function fits(deps: ReturnType<typeof testDeps>, key: string, sex: string, age: number): boolean {
    const row = portraitRowOf(deps.content, key);
    const band = ageSpanOf(deps.content.descriptions.ageBands, age);
    return (
      row !== undefined &&
      portraitSexOf(deps.content, 'guildmaster', key) === sex &&
      row.apparentAge[0] <= band.to &&
      row.apparentAge[1] >= band.from
    );
  }

  test('a Rival, a replacement and a successor each take one draw from gm-portraits, and a picture that fits them or the Silhouette', () => {
    const deps = testDeps();
    let pictured = 0;
    for (let n = 0; n < 30; n += 1) {
      const world = testWorld(`portraits-${n}`, deps);
      const before = structuredClone(world.rng['gm-portraits']);
      const { guild, guildmaster } = generateRival(world, deps, { controller: rival });
      const successor = generateSuccessor(world, deps, guild);
      const twice = structuredClone(before);
      next(twice);
      next(twice);
      expect(world.rng['gm-portraits']).toEqual(twice);
      for (const { portraitKey, sex, ageAtEntry } of [guildmaster, successor]) {
        if (portraitKey === null) continue;
        pictured += 1;
        expect(fits(deps, portraitKey, sex, ageAtEntry), `${portraitKey} for a ${sex} of ${ageAtEntry}`).toBe(true);
      }
      // The successor chose while the Guildmaster they succeed was still in the chair.
      if (successor.portraitKey !== null) expect(successor.portraitKey).not.toBe(guildmaster.portraitKey);
    }
    expect(pictured).toBeGreaterThan(30);
  });

  test('no two living Guildmasters share a picture: once every one that fits is in use, the Silhouette', () => {
    const deps = testDeps();
    const world = testWorld('portraits-in-use', deps);
    const keys: (string | null)[] = [];
    for (let i = 0; i < 8; i += 1) keys.push(generateRival(world, deps, { controller: rival }).guildmaster.portraitKey);
    const pictured = keys.filter((key) => key !== null);
    expect(new Set(pictured).size).toBe(pictured.length);
    expect(keys).toContain(null);
    expect(guildmasterPortraitsInUse(world)).toEqual(new Set(pictured));
  });

  // DL-144 item 1: "in use" is every living Guildmaster's picture, retired or in office. No
  // Guildmaster's death is recorded in the World State (a Guildmaster's row is kept for good, with
  // `retiredOnTurn` once they retire), so every Guildmaster ever in play is living, and their picture
  // is never freed: a retired one's, and a folded Guild's Guildmaster's, stay held.

  /** The test content with only `keys` as Guildmaster pictures, each reaching every age (both bands). */
  function heldContent(keys: readonly string[]): ReturnType<typeof testDeps> {
    const base = testDeps();
    const rows = base.content.portraitAppearances.portraits;
    const sexOf = (sex: string) => keys.filter((key) => key.split('-')[1] === sex);
    return testDeps({}, {
      ...base.content,
      portraits: { ...base.content.portraits, guildmaster: { female: sexOf('female'), male: sexOf('male') } },
      portraitAppearances: {
        ...base.content.portraitAppearances,
        portraits: Object.fromEntries(
          Object.entries(rows).map(([key, row]) => [key, keys.includes(key) ? { ...row, apparentAge: [21, 70] as [number, number] } : row]),
        ),
      },
    });
  }

  /** `guild`'s Guildmaster retires, as the endings phase does it: a successor, then `retiredOnTurn`. */
  function retire(world: World, deps: ReturnType<typeof testDeps>, guild: Guild) {
    const retiring = world.guildmasters[guild.guildmasterId];
    const successor = generateSuccessor(world, deps, guild);
    if (retiring !== undefined) retiring.retiredOnTurn = world.turn;
    guild.guildmasterId = successor.id;
    return successor;
  }

  test("a retired Guildmaster's picture stays in use while they live: no successor, nor a new Rival's Guildmaster, is given it", () => {
    const deps = heldContent(['gm-female-01', 'gm-male-01']);
    for (let n = 0; n < 10; n += 1) {
      const world = testWorld(`portraits-retired-${n}`, deps);
      const first = generateRival(world, deps, { controller: rival });
      first.guildmaster.portraitKey = 'gm-female-01';
      first.guildmaster.sex = 'female';
      const second = generateRival(world, deps, { controller: rival });
      second.guildmaster.portraitKey = 'gm-male-01';
      second.guildmaster.sex = 'male';
      retire(world, deps, first.guild);
      retire(world, deps, second.guild);
      expect(guildmasterPortraitsInUse(world)).toEqual(new Set(['gm-female-01', 'gm-male-01']));

      // Entrants after the Retirements: Successions in both Guilds again, and new Rivals.
      const entrants = [retire(world, deps, first.guild), retire(world, deps, second.guild)];
      for (let i = 0; i < 4; i += 1) entrants.push(generateRival(world, deps, { controller: rival }).guildmaster);
      for (const entrant of entrants) expect(entrant.portraitKey, `seed ${n}: ${entrant.id}`).toBeNull();
    }
  });

  test("a folded Guild's Guildmaster lives on, and keeps their picture from every later entrant", () => {
    const deps = heldContent(['gm-female-01']);
    const world = testWorld('portraits-folded', deps);
    const first = generateRival(world, deps, { controller: rival });
    first.guildmaster.portraitKey = 'gm-female-01';
    first.guild.foldedOnTurn = world.turn;
    expect(guildmasterPortraitsInUse(world).has('gm-female-01')).toBe(true);
    for (let i = 0; i < 6; i += 1) expect(generateRival(world, deps, { controller: rival }).guildmaster.portraitKey).toBeNull();
  });

  test('with every fitting picture held by the living, retired and in office, the Silhouette; a free one is still given, once', () => {
    const deps = heldContent(['gm-female-01', 'gm-female-02', 'gm-male-01']);
    let females = 0;
    let males = 0;
    let maleGiven = 0;
    for (let n = 0; n < 10; n += 1) {
      const world = testWorld(`portraits-held-${n}`, deps);
      const first = generateRival(world, deps, { controller: rival });
      first.guildmaster.portraitKey = 'gm-female-01';
      const second = generateRival(world, deps, { controller: rival });
      second.guildmaster.portraitKey = 'gm-female-02';
      retire(world, deps, first.guild);
      // gm-female-01's holder retired and gm-female-02's is in office: no female entrant has either.
      const given: (string | null)[] = [];
      for (let i = 0; i < 6; i += 1) {
        const { portraitKey, sex } = generateRival(world, deps, { controller: rival }).guildmaster;
        if (sex === 'female') {
          females += 1;
          expect(portraitKey).toBeNull();
        } else {
          males += 1;
          given.push(portraitKey);
        }
      }
      // The one male picture is free until a man takes it, and held from then on.
      const holders = Object.values(world.guildmasters).filter((guildmaster) => guildmaster.portraitKey === 'gm-male-01');
      expect(holders.length).toBeLessThanOrEqual(1);
      if (given.includes('gm-male-01')) maleGiven += 1;
    }
    expect(females).toBeGreaterThan(0);
    expect(males).toBeGreaterThan(0);
    expect(maleGiven).toBeGreaterThan(0);
  });

  test("a retiring Guildmaster's picture is in use while their successor is chosen", () => {
    // The one picture reaches every age, so a female successor would take it were it free: the core's content
    // let a male successor pass whatever the rule.
    const deps = heldContent(['gm-female-01']);
    let females = 0;
    for (let n = 0; n < 12; n += 1) {
      const world = testWorld(`portraits-retiring-${n}`, deps);
      const first = generateRival(world, deps, { controller: rival });
      Object.assign(first.guildmaster, { portraitKey: 'gm-female-01', sex: 'female' });
      const successor = generateSuccessor(world, deps, first.guild);
      if (successor.sex === 'female') females += 1;
      expect(successor.portraitKey, `seed ${n}: a ${successor.sex} successor`).toBeNull();
    }
    expect(females).toBeGreaterThan(0);
  });

  test("the player's chosen picture is theirs whatever it fits, before the texts are written, in one draw", () => {
    const deps = testDeps();
    for (let n = 0; n < 20; n += 1) {
      const world = testWorld(`portrait-given-${n}`, deps);
      const before = structuredClone(world.rng['gm-portraits']);
      const { guildmaster } = generateGuild(world, deps, {
        controller: player,
        name: 'The Test Guild',
        rosterSize: 0,
        wealth: 0,
        guildmaster: { sex: 'female', age: 48, traitKeys: ['mistrusts-magic'] },
        portraitKey: 'gm-female-01',
      });
      // Chosen for a woman of 48, though its ages are 22 to 30: the age chosen is kept.
      expect(guildmaster).toMatchObject({ portraitKey: 'gm-female-01', ageAtEntry: 48 });
      expect(guildmaster.appearance).toBe(deps.content.portraitAppearances.portraits['gm-female-01']?.narrative.trim());
      const once = structuredClone(before);
      next(once);
      expect(world.rng['gm-portraits']).toEqual(once);
    }
  });

  test("with the age not chosen, the age drawn is moved into the chosen picture's ages, and every other draw is as without it", () => {
    const deps = testDeps();
    const ages = new Set<number>();
    for (let n = 0; n < 40; n += 1) {
      const options = { controller: player, name: 'The Test Guild', rosterSize: 2, wealth: 0, guildmaster: { sex: 'male' as const } };
      const drawn = testWorld(`age-moved-${n}`, deps);
      const chosen = testWorld(`age-moved-${n}`, deps);
      const plain = generateGuild(drawn, deps, options).guildmaster;
      const moved = generateGuild(chosen, deps, { ...options, portraitKey: 'gm-male-01' }).guildmaster;
      // gm-male-01 looks 40 to 50, within the starting ages 21 to 50.
      expect(moved.ageAtEntry).toBe(ageIntoPortrait(plain.ageAtEntry, [40, 50], 21, 50));
      expect(moved.ageAtEntry).toBeGreaterThanOrEqual(40);
      ages.add(moved.ageAtEntry);
      expect({ ...moved, ageAtEntry: 0, portraitKey: null, appearance: '', biography: '' }).toEqual({
        ...plain,
        ageAtEntry: 0,
        portraitKey: null,
        appearance: '',
        biography: '',
      });
      for (const name of ['generation', 'gm-portraits', 'descriptions'] as const) expect(chosen.rng[name], name).toEqual(drawn.rng[name]);
    }
    expect(ages.size).toBeGreaterThan(5);
  });
});

// A successor's Biography says they came to the chair, not that they
// founded the Guild, whatever its Background.
describe("a successor's Biography", () => {
  test("has a successor's sentence where a founder's has the Background's", () => {
    const deps = testDeps();
    const world = testWorld('successor-biography', deps);
    for (let i = 0; i < 6; i += 1) {
      const { guild } = generateRival(world, deps, { controller: rival });
      const successor = generateSuccessor(world, deps, guild);
      expect(successor.biography).toMatch(/(He|She) took the chair\./);
      expect(successor.biography).not.toMatch(/took the old charter|broke away/);
    }
  });
});
