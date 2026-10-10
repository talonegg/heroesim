import {
  advance,
  createWorld,
  isModuleEvent,
  probe,
  type EngineDeps,
  type HeroId,
  type Module,
  type PatronId,
} from '@heroesim/engine';
import { createProbe } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { effectEventTypes, moduleCounters } from './counters.js';
import { countGame } from './game-counters.js';
import { harnessSetup } from './creation.js';
import { coreDeps as deps, twentyDays as years } from './harness.test-support.js';
import { harnessModules, idsOf, modulesFor } from './modules.js';
import { playGame } from './play.js';
import { seedNames } from './seeds.js';
import { sweepTotals } from './counter.js';
import { sweepPlay, sweepPlayInParallel, type PlaySweep } from './sweep.js';

// DL-78: the modules a harness run installs, their counters, and a sweep with them.


describe("the harness's modules", () => {
  test('are known by id', () => {
    expect(modulesFor(['probe'])).toEqual([probe]);
    expect(harnessModules).toEqual({ probe });
  });

  test("idsOf gives a module list's ids, refusing a module that is not the harness's own of its id", () => {
    expect(idsOf(undefined)).toEqual([]);
    expect(idsOf([probe])).toEqual(['probe']);
    expect(() => idsOf([createProbe({ probeFireBelow: 1 })])).toThrow(RangeError);
    expect(() => modulesFor(['nothing'])).toThrow(RangeError);
  });
});

describe("the modules' counters (M8, DL-78)", () => {
  const firing: EngineDeps = { ...deps, modules: [createProbe({ probeFireBelow: 1 })] };

  test('count each module event type and the core events its effects made, by module and type', () => {
    const game = playGame('modules-a', firing, { years, validate: true });
    const { document } = game;
    expect(game.invalid).toBeNull();

    const counted = moduleCounters(document);

    // The probe fires on each of the 20 nights among Turns 1 to 60 when a Hero on a Roster stands
    // ready, as it does on most: each firing applies each effect once.
    const fired = counted.moduleEvents['probe.fired'] ?? 0;
    expect(fired).toBeGreaterThan(10);
    expect(fired).toBeLessThanOrEqual(20);
    expect(fired).toBe(document.history.byType['probe.fired']?.length);
    expect(Object.keys(counted.moduleEvents)).toEqual(['probe.fired']);
    const effects = counted.moduleEffects.probe ?? {};
    expect(effects).toMatchObject({ 'hero.morale-changed': fired, 'guild.wealth-changed': fired, 'hero.injured': fired, 'quest.offered': fired });
    expect(Object.keys(counted.moduleEffects)).toEqual(['probe']);
    expect(countGame(document, firing)).toMatchObject(counted);
  });

  test("effectEventTypes holds every type of core event the probe's effects make", () => {
    let document = createWorld('modules-types', harnessSetup, firing).document;
    const types = new Set<string>();
    for (let turn = 1; turn <= 30; turn += 1) {
      const played = advance(document, firing);
      document = played.document;
      const fired = played.events.findIndex(isModuleEvent);
      if (fired >= 0) for (const event of played.events.slice(fired + 1)) types.add(event.type);
    }

    expect(types.size).toBeGreaterThan(0);
    expect([...types].filter((type) => !(effectEventTypes as readonly string[]).includes(type))).toEqual([]);
  });

  test('effectEventTypes is every type of core event an effect makes, each Regard holder crossing a band included', () => {
    const types = new Set<string>();
    const everyEffect: Module = {
      id: 'every',
      streamName: 'every',
      createSlice: () => ({}),
      validateSlice: () => [],
      onAfternoon: (world, _slice, ctx) => {
        const guild = Object.values(world.guilds)[0];
        const patronId = Object.keys(world.patrons)[0] as PatronId;
        if (guild === undefined) throw new Error('no Guild');
        const [heroId, otherId] = guild.rosterIds as [HeroId, HeroId];
        const results = [
          ctx.effects.adjustMorale({ heroId, delta: -1 }),
          ctx.effects.adjustWealth({ guildId: guild.id, delta: 1 }),
          ctx.effects.adjustRegard({ holderId: patronId, entityId: guild.id, delta: 50 }),
          ctx.effects.adjustRegard({ holderId: guild.guildmasterId, entityId: heroId, delta: 50 }),
          ctx.effects.adjustRegard({ holderId: heroId, entityId: otherId, delta: 50 }),
          ctx.effects.injure({ heroId, typeKey: Object.keys(ctx.content.injuries)[0] as never, days: 2 }),
          ctx.effects.offerQuest({ patronId }),
        ];
        const events = results.flatMap((result) => (result.ok ? result.events : []));
        for (const event of events) types.add(event.type);
        expect(results.every((result) => result.ok)).toBe(true);
        return { events };
      },
    };
    const every = { ...deps, modules: [everyEffect] };

    advance(createWorld('modules-every-effect', harnessSetup, every).document, every);

    expect([...types].sort()).toEqual([...effectEventTypes].sort());
  });

  test('are empty for a game with no module', () => {
    const { document } = playGame('modules-a', deps, { years });

    expect(moduleCounters(document)).toEqual({ moduleEvents: {}, moduleEffects: {} });
  });
});

const seeds = seedNames(2);
const sweep = await sweepPlay(seeds, { ...deps, modules: [probe] }, { years, validate: true });

describe('a sweep with a module installed', () => {

  test('plays with the probe: its slice in every save, the counters summed, the replay identical', () => {
    expect(sweep.games.every((game) => game.invalid === null && game.refusals.length === 0 && game.measures.roundTrips)).toBe(true);
    expect(sweep.replay?.identical).toBe(true);
    const totals = sweepTotals(sweep, deps.config.turnsPerYear);
    const fired = sweep.games.reduce((sum, game) => sum + (game.counters.moduleEvents['probe.fired'] ?? 0), 0);
    expect(totals.moduleEvents).toEqual(fired === 0 ? {} : { 'probe.fired': fired });
  });

  test('a child process installs the module its job names and plays the same games', { timeout: 120_000 }, async () => {
    const parallel = await sweepPlayInParallel(['seed-0001'], { ...deps, modules: [probe] }, { years, validate: true, workers: 1, replay: false });
    const played = (of: PlaySweep) => of.games.map(({ seed, counters, measures }) => ({ seed, counters, fingerprint: measures.fingerprint }));

    expect(played(parallel)).toEqual(played(sweep).slice(0, 1));
  });

  test('differs from the same seed with no module, whose save holds no slice', async () => {
    const none = await sweepPlay(['seed-0001'], deps, { years, replay: false });

    expect(none.games[0]?.measures.fingerprint).not.toBe(sweep.games[0]?.measures.fingerprint);
  });

  test("refuses, before any child starts, a module that is not the harness's own", async () => {
    await expect(sweepPlayInParallel(seeds, { ...deps, modules: [createProbe({ probeFireBelow: 1 })] }, { years, workers: 2 })).rejects.toThrow(
      RangeError,
    );
  });
});
