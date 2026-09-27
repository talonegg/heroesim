import { loadContent } from '@heroesim/content/node';
import { advance, createProbe, createWorld, defaultConfig, isModuleEvent, probe, type EngineDeps } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { countGame, effectEventTypes, moduleCounters } from './counters.js';
import { harnessSetup } from './creation.js';
import { defaultModuleSeedCount, harnessModules, idsOf, moduleIds, modulesFor } from './modules.js';
import { playGame } from './play.js';
import { runShard } from './shard.js';
import { seedNames } from './seeds.js';
import { sweepPlay, sweepPlayInParallel, sweepTotals, type PlaySweep } from './sweep.js';

// M8-S3 (DL-78): the modules a harness run installs, their counters, and a sweep with them.

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };
const years = 60 / deps.config.turnsPerYear;

describe('HEROESIM_MODULES', () => {
  test('unset or blank installs no module; a module run plays 50 seeds unless HEROESIM_SEEDS says otherwise', () => {
    expect(moduleIds(undefined)).toEqual([]);
    expect(moduleIds('  ')).toEqual([]);
    expect(defaultModuleSeedCount).toBe(50);
  });

  test('names modules by id, comma-separated, spaces around each ignored', () => {
    expect(moduleIds('probe')).toEqual(['probe']);
    expect(moduleIds(' probe ')).toEqual(['probe']);
    expect(modulesFor(['probe'])).toEqual([probe]);
    expect(harnessModules).toEqual({ probe });
  });

  test.each(['random-events', 'probe,probe', 'probe,', 'Probe'])('refuses %j: a mistyped list fails the run', (value) => {
    expect(() => moduleIds(value)).toThrow(RangeError);
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

  test('are empty for a game with no module', () => {
    const { document } = playGame('modules-a', deps, { years });

    expect(moduleCounters(document)).toEqual({ moduleEvents: {}, moduleEffects: {} });
  });
});

describe('a sweep with a module installed', () => {
  const seeds = seedNames(2);
  const sweep = sweepPlay(seeds, { ...deps, modules: [probe] }, { years, validate: true });

  test('plays with the probe: its slice in every save, the counters summed, the replay identical', () => {
    expect(sweep.games.every((game) => game.invalid === null && game.refusals.length === 0 && game.measures.roundTrips)).toBe(true);
    expect(sweep.replay?.identical).toBe(true);
    const totals = sweepTotals(sweep, deps.config.turnsPerYear);
    const fired = sweep.games.reduce((sum, game) => sum + (game.counters.moduleEvents['probe.fired'] ?? 0), 0);
    expect(totals.moduleEvents).toEqual(fired === 0 ? {} : { 'probe.fired': fired });
  });

  test('a child process installs the module its job names and plays the same games', { timeout: 120_000 }, async () => {
    const parallel = await sweepPlayInParallel(seeds, { ...deps, modules: [probe] }, { years, validate: true, workers: 2 });
    const played = (of: PlaySweep) => of.games.map(({ seed, counters, measures }) => ({ seed, counters, fingerprint: measures.fingerprint }));

    expect(played(parallel)).toEqual(played(sweep));
    const shard = runShard({ seeds: ['seed-0001'], config: deps.config, years, validate: false, policy: sweep.policy, modules: ['probe'] });
    expect(shard.games[0]?.measures.fingerprint).toBe(sweep.games[0]?.measures.fingerprint);
  });

  test('differs from the same seeds with no module, whose saves hold no slice', () => {
    const none = sweepPlay(seeds, deps, { years });
    const fingerprints = (of: PlaySweep) => of.games.map((game) => game.measures.fingerprint);

    expect(fingerprints(none)).not.toEqual(fingerprints(sweep));
  });

  test("refuses, before any child starts, a module that is not the harness's own", async () => {
    await expect(sweepPlayInParallel(seeds, { ...deps, modules: [createProbe({ probeFireBelow: 1 })] }, { years, workers: 2 })).rejects.toThrow(
      RangeError,
    );
  });
});
