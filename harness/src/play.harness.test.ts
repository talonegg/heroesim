import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { validatingEveryTurn } from './play.js';
import { machine, reportPath, writeReport } from './report.js';
import { defaultPlaySeedCount, seedCount, seedNames } from './seeds.js';
import { defaultWorkers, playReport, sweepPlayInParallel, sweepTotals } from './sweep.js';

// The milestone's harness run (M2-S12, DL-34; M3's counters, DL-40; M4's, DL-55), collected only
// by the harness-run project, which exists when HEROESIM_HARNESS is set (`npm run harness`): play
// HEROESIM_SEEDS games (200 by default, INPUTS 4.13) from `seed-0001` onward for 20 years or to
// their ending, under the automatic policy, the core content and `defaultConfig`, shared among child
// processes (half the logical processors); with HEROESIM_VALIDATE=1, validate after every advance;
// replay the first seed and compare the two games byte for byte; and write the counters and
// measures to harness/reports/m4-<date>.md.

const milestone = 'm4';
const seeds = seedNames(seedCount(process.env.HEROESIM_SEEDS, defaultPlaySeedCount));
const validate = validatingEveryTurn();

test(`${seeds.length} games of 20 years play to an ending or their last Turn`, { timeout: 24 * 60 * 60_000 }, async () => {
  const startedAt = new Date();
  const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };

  const sweep = await sweepPlayInParallel(seeds, deps, { validate, workers: defaultWorkers() });
  const path = writeReport(reportPath(milestone, startedAt), playReport(sweep, { deps, machine: machine(), startedAt, milestone }));
  const totals = sweepTotals(sweep, deps.config.turnsPerYear);

  // The report is written before anything is asserted, so a failing run leaves it to read.
  console.log(
    `${seeds.length} games: ${JSON.stringify(totals.endings)}; years survived mean ` +
      `${totals.yearsSurvived.mean.toFixed(2)}; advance ${sweep.advance.mean.toFixed(3)} ms mean, ` +
      `${sweep.advance.p99.toFixed(3)} ms p99; validated: ${validate}; ${(sweep.totalMs / 1000).toFixed(1)} s in all\nReport: ${path}`,
  );
  expect(sweep.games).toHaveLength(seeds.length);
  for (const game of sweep.games) expect(game.counters.ending !== null || game.ranFullLength, game.seed).toBe(true);
  expect(totals.refusals).toBe(0);
  expect(totals.signingRefused).toBe(0);
  expect(sweep.games.filter((game) => game.invalid !== null).map((game) => game.seed)).toEqual([]);
  expect(sweep.games.filter((game) => !game.measures.roundTrips).map((game) => game.seed)).toEqual([]);
  expect(sweep.replay?.identical).toBe(true);
});
