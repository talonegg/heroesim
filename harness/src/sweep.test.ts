import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { machine } from './report.js';
import { seedNames } from './seeds.js';
import { playReport, sweepPlay, sweepPlayInParallel, sweepTotals, type PlaySweep } from './sweep.js';

// The play sweep on a handful of short games, under `npm test`. The full run is
// play.harness.test.ts (M2-S12, DL-34).

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };
const years = 60 / deps.config.turnsPerYear;

/** A clock that advances one millisecond a read, so timings are known. */
function tickingClock(): () => number {
  let t = 0;
  return () => (t += 1);
}

describe('sweepPlay', () => {
  const seeds = seedNames(2);
  const sweep = sweepPlay(seeds, deps, { years, validate: true, now: tickingClock() });
  const totals = sweepTotals(sweep, deps.config.turnsPerYear);

  test('plays every seed, keeping a record of each and no document', () => {
    expect(sweep.games.map((game) => game.seed)).toEqual(seeds);
    expect(sweep.games.every((game) => game.ranFullLength && game.invalid === null && game.refusals.length === 0)).toBe(true);
    expect(sweep.advance).toMatchObject({ count: 120, mean: 1 });
    expect(sweep.validation).toMatchObject({ count: 120, mean: 1 });
  });

  test('plays the first seed twice more and finds the two byte-identical', () => {
    expect(sweep.workers).toBe(1);
    expect(sweep.replay).toMatchObject({ seed: 'seed-0001', identical: true, advance: { count: 60 } });
  });

  test('plays the same games when it shares the seeds among child processes', { timeout: 120_000 }, async () => {
    const parallel = await sweepPlayInParallel(seeds, deps, { years, validate: true, workers: 2 });
    const played = (of: PlaySweep) =>
      of.games.map(({ seed, counters, observations, turnsPlayed, ranFullLength, refusals, invalid, measures }) => ({
        seed,
        counters,
        observations,
        turnsPlayed,
        ranFullLength,
        refusals,
        invalid,
        historyEntries: measures.historyEntries,
        serialisedLength: measures.serialisedLength,
        roundTrips: measures.roundTrips,
      }));
    expect(parallel.workers).toBe(2);
    expect(played(parallel)).toEqual(played(sweep));
    expect(parallel.advance.count).toBe(120);
    expect(parallel.replay).toMatchObject({ seed: 'seed-0001', identical: true, length: sweep.replay?.length });
  });

  test("totals the games' counters", () => {
    expect(totals.games).toBe(2);
    expect(totals.endings).toEqual({ retirement: 0, bankruptcy: 0, 'roster-wiped': 0, survived: 2 });
    const taken = sweep.games.reduce((sum, game) => sum + game.counters.questsTaken.player, 0);
    expect(totals.questsTaken.player).toBe(taken);
    expect(totals.questsTaken.rival).toBeGreaterThan(0);
    expect(totals.yearsSurvived).toMatchObject({ min: years, max: years });
    expect(totals.refusals).toBe(0);
    expect(totals.invalidGames).toBe(0);
  });

  test("totals M3's counters: every Guild's Days in play, the Fame gate each morning, the new worlds' Rosters", () => {
    // Two games of 20 Days: five Guilds each, no year begun after the first, no game at year 10.
    const guildYears = (kind: 'player' | 'rival'): number => totals.guildYears[kind].reduce((a, b) => a + b, 0);
    expect(guildYears('player')).toBeCloseTo(2 * years);
    expect(totals.fameGate.player.guildDays).toBe(2 * 20);
    expect(totals.fameGate.rival.guildDays).toBe(sweep.games.reduce((sum, game) => sum + game.observations.fameGate.rival.guildDays, 0));
    expect(totals.rosters).toHaveLength(1);
    expect(totals.rosters[0]).toMatchObject({ games: 2, player: { heroes: 8, levels: 8 } });
    expect(totals.gamesAtCountedYear).toBe(0);
    expect(totals.signingRefused).toBe(0);
  });

  describe('its report', () => {
    const context = { deps, machine: machine(), startedAt: new Date(2026, 8, 26, 12), milestone: 'm3' };
    const report = playReport(sweep, context);

    test('states the seeds, the endings, byte equality and the measures against the targets', () => {
      expect(report).toContain('2 seeds, `seed-0001` to `seed-0002`');
      expect(report).toContain('ran the full 0.06 years 2');
      expect(report).toContain('Games ending in each year (year 0 is the first): 0: 0.');
      expect(report).toContain('| Games the validator refused | 0 |');
      expect(report).toContain('`seed-0001`: identical');
      expect(report).toContain('| Advance one Turn | under 5 ms |');
      expect(report).toContain('| Save after 20 years | under 20 MiB |');
      expect(report).toContain(`Node ${process.version}`);
    });

    test("names its milestone and gives M3's counters", () => {
      expect(report.startsWith('# M3 harness report: play\n')).toBe(true);
      expect(report).toContain('## Progression, Fame and the Hall (M3)');
      expect(report).toMatch(/\| Guild-years in play \| 0\.1 \| /);
      expect(report).toContain('| Signings refused by Fame | Hero-Days refused |');
      expect(report).toContain('`signing-refused` rejections returned to the automatic policy: 0.');
      expect(report).toContain('No game was in play after 10 years.');
      expect(report).toContain('over the 0 games that reached it');
      expect(report).toContain('| The Rivals: trainingYard | 0 | — | 0 | 0 | 0 | 0 |');
    });

    test('lists refused actions and refused documents when there are any', () => {
      const [first] = sweep.games;
      if (first === undefined) throw new Error('No game');
      const failing: PlaySweep = {
        ...sweep,
        games: [
          {
            ...first,
            refusals: [
              {
                turn: 9,
                action: { kind: 'recruit', guildId: 'guild-000001' as never, heroId: 'hero-000009' as never },
                rejection: { action: 'recruit', reason: 'insufficient-wealth', fee: 90, wealth: 10 },
              },
            ],
            invalid: {
              turn: 12,
              result: { ok: false, failures: [{ check: 'counter-range', id: '$.world.counters.heroes', detail: 'd' }] },
            },
          },
        ],
      };
      const text = playReport(failing, context);
      expect(text).toContain('| `seed-0001` | 9 | recruit | insufficient-wealth |');
      expect(text).toContain('| `seed-0001` | 12 | counter-range | `$.world.counters.heroes` |');
    });
  });
});
