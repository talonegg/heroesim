import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { createProbe } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { coreCounters, counterDeltas, moduleReport, nightsPlayed } from './module-report.js';
import { fixed, machine } from './report.js';
import { seedNames } from './seeds.js';
import { sweepFingerprint, sweepPlay, sweepTotals, type SweepTotals } from './sweep.js';

// M8-S3 (DL-78): the report of a module run, on two short sweeps of the same seeds.

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };
const years = 60 / deps.config.turnsPerYear;
const seeds = seedNames(2);

describe('coreCounters', () => {
  test("gives every number by its path, a list's entries summed at its path and [], the modules' own and the worlds' measures left out", () => {
    const totals = {
      games: 2,
      heroesInjured: { player: 3, rival: 4 },
      levelsGained: { player: [1, 2, 3], rival: [] },
      rosters: [
        { games: 2, player: { wealth: 10 } },
        { games: 1, player: { wealth: 5 } },
      ],
      moduleEvents: { 'probe.fired': 9 },
      moduleEffects: { probe: { 'hero.injured': 9 } },
      // v1.1.6-S17 (DL-203): the copy's time differs between two runs of one game, so `compare` leaves it out.
      worlds: [{ characters: [10], heroes: { live: [1], writeOnce: [1] }, copyMs: [1.5] }],
    } as unknown as SweepTotals;

    expect([...coreCounters(totals)]).toEqual([
      ['games', 2],
      ['heroesInjured.player', 3],
      ['heroesInjured.rival', 4],
      ['levelsGained.player[]', 6],
      ['rosters[].games', 3],
      ['rosters[].player.wealth', 15],
    ]);
  });
});

describe('counterDeltas', () => {
  test('lists the counters that differ, a counter one sweep lacks counting 0 there, and counts the rest', () => {
    const without = { games: 2, heroesInjured: { player: 3, rival: 4 }, loot: { player: { common: 1 } } } as unknown as SweepTotals;
    const installed = { games: 2, heroesInjured: { player: 5, rival: 4 }, loot: { player: { rare: 2 } } } as unknown as SweepTotals;

    expect(counterDeltas(without, installed)).toEqual({
      moved: [
        { counter: 'heroesInjured.player', without: 3, with: 5 },
        { counter: 'loot.player.common', without: 1, with: 0 },
        { counter: 'loot.player.rare', without: 0, with: 2 },
      ],
      unchanged: 2,
    });
  });
});

test('nightsPlayed counts the nights among Turns 1 to n, Turn 2 the first', () => {
  expect([0, 1, 2, 3, 4, 5, 6, 60].map(nightsPlayed)).toEqual([0, 0, 1, 1, 1, 2, 2, 20]);
});

describe('moduleReport', () => {
  const installed = sweepPlay(seeds, { ...deps, modules: [createProbe({ probeFireBelow: 1 })] }, { years, validate: true });
  const without = sweepPlay(seeds, deps, { years, validate: true });
  const context = { deps, moduleIds: ['probe'], machine: machine(), startedAt: new Date(2026, 8, 27, 12, 0, 0) };
  const report = moduleReport(installed, without, context);

  test("states each module event, with how often it came, and the core events the module's effects made", () => {
    // Two games of 60 Turns, 20 nights each, the probe firing on each night a Hero stands ready.
    const { moduleEvents, moduleEffects } = sweepTotals(installed, deps.config.turnsPerYear);
    const fired = moduleEvents['probe.fired'] ?? 0;
    expect(fired).toBeGreaterThan(20);
    expect(moduleEffects.probe?.['hero.injured']).toBe(fired);
    const cells = `${fired} | ${fixed(fired / 2, 2)} |`;
    expect(report).toContain('# M8 harness report: `probe` against no module');
    expect(report).toContain(`| \`probe.fired\` | ${cells} ${fixed(fired / 40, 4)} |`);
    expect(report).toContain(`| \`probe\` | \`hero.injured\` | ${cells}`);
    expect(report).toContain(`| \`probe\` | \`guild.wealth-changed\` | ${cells}`);
    expect(report).toContain('With no module installed the History held 0 module event types and effects (0 is right).');
  });

  test('gives the delta on each core counter the module moved, and how many did not move', () => {
    const { moved, unchanged } = counterDeltas(sweepTotals(without, deps.config.turnsPerYear), sweepTotals(installed, deps.config.turnsPerYear));
    const injured = moved.find(({ counter }) => counter === 'heroesInjured.player' || counter === 'heroesInjured.rival');

    expect(moved.length).toBeGreaterThan(0);
    expect(injured).toBeDefined();
    expect(report).toContain(`**${moved.length} of ${moved.length + unchanged} core counters moved; ${unchanged} did not.**`);
    for (const { counter } of moved) expect(report).toContain(`| \`${counter}\` |`);
    // Each row: the two values, the signed delta, and the change as a share of the first, to one place.
    const deltas = report.slice(report.indexOf('## Every core counter the modules moved'));
    const rows = deltas.split('\n').filter((line) => line.startsWith('| `'));
    expect(rows).toHaveLength(moved.length);
    for (const row of rows) expect(row).toMatch(/^\| `[^`]+` \| [\d,]+(\.\d\d)? \| [\d,]+(\.\d\d)? \| [+−][\d,.]+ \| (—|[+−][\d,]+\.\d%) \|$/);
    expect(report).not.toContain('`moduleEvents');
  });

  test('sets the two sweeps side by side: both fingerprints, both validated, neither refused', () => {
    expect(report).toContain(`| Fingerprint of every seed's last save | \`${sweepFingerprint(installed.games)}\` | \`${sweepFingerprint(without.games)}\` |`);
    expect(report).toContain('validated after every advance: yes');
    expect(report).toContain('| Games the validator refused | 0 | 0 |');
  });

  test('refuses two sweeps of different seeds', () => {
    const other = sweepPlay(seedNames(1), deps, { years });

    expect(() => moduleReport(installed, other, context)).toThrow(RangeError);
  });

  test('refuses two sweeps of the same seeds played for different years', () => {
    expect(() => moduleReport(installed, { ...without, years: without.years * 2 }, context)).toThrow(RangeError);
    expect(() => moduleReport(installed, without, context)).not.toThrow();
  });
});
