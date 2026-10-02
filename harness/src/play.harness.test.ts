import { loadContent, loadDrafts } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { moduleIds } from './modules.js';
import { replayingAfterSweep, validatingEveryTurn } from './play.js';
import { machine, reportPath, writeReport } from './report.js';
import { probeName } from './succession.js';
import { configChanges, defaultPlaySeedCount, seedCount, seedNames, yearCount } from './seeds.js';
import { defaultWorkers, playReport, sweepFingerprint, sweepPlayInParallel, sweepTotals } from './sweep.js';

// The milestone's harness run (M2-S12, DL-34; M3's counters, DL-40; M4's, DL-55; M5's, DL-62;
// M6's, DL-69; M8's, the first build's tagged run with HEROESIM_SEEDS=1000, DL-81), collected only
// by the harness-run project, which exists when HEROESIM_HARNESS is set
// (`npm run harness`): play HEROESIM_SEEDS games (200 by default, INPUTS 4.13) from `seed-0001`
// onward for 20 years or to their ending, under the automatic policy, the core content and
// `defaultConfig`, shared among child processes (half the logical processors); with
// HEROESIM_VALIDATE=1, validate after every advance; check M6-S3's harness assertion, that no
// `hero.transferred` names the player's Guild; replay the first seed and compare the two games byte
// for byte; and write the counters and measures to harness/reports/m8-<date>.md. Not run when
// HEROESIM_MODULES names modules: that run is modules.harness.test.ts's (M8-S3, DL-78).
// HEROESIM_YEARS plays each game that many years in place of twenty, and HEROESIM_MILESTONE names
// the report in place of the milestone's (M9-S2: a run past the slice to see Succession, DL-102).
// Not run when HEROESIM_PROBE names a probe either: that run is its own (M9-F1, succession.harness.test.ts).
// HEROESIM_DRAFTS plays the content with a directory of draft content files, each in place of the
// core file of its name (v1.1.4-S9, `loadDrafts`), so that drafts can be played before they are
// written into content/; the report says which files were drafts. HEROESIM_CONFIG, a JSON object of
// config keys, plays those values in place of the defaults (v1.1.4-S9's verification, `configChanges`),
// for trials of what a tuning step would set; the report says which. HEROESIM_WORKERS sets the child
// processes, at most that many at once (v1.1.4-S10), and HEROESIM_REPLAY=0 skips the replay, for a
// tuning trial that wants only the counters.

const milestone = process.env.HEROESIM_MILESTONE ?? 'm8';
const drafts = process.env.HEROESIM_DRAFTS?.trim() || undefined;
const configured = configChanges();
const seeds = seedNames(seedCount(process.env.HEROESIM_SEEDS, defaultPlaySeedCount));
const years = yearCount();
const validate = validatingEveryTurn();
const replay = replayingAfterSweep();

test.skipIf(moduleIds().length > 0 || probeName() !== null)(`${seeds.length} games of ${years} years play to an ending or their last Turn`, { timeout: 24 * 60 * 60_000 }, async () => {
  const startedAt = new Date();
  const drafted = drafts === undefined ? null : loadDrafts(drafts);
  const deps: EngineDeps = { config: { ...defaultConfig, ...configured }, content: drafted?.content ?? loadContent() };

  const sweep = await sweepPlayInParallel(seeds, deps, { validate, replay, workers: defaultWorkers(), years, ...(drafts === undefined ? {} : { drafts }) });
  const report = playReport(sweep, { deps, machine: machine(), startedAt, milestone, drafted: drafted?.drafted ?? [], configured });
  const path = writeReport(reportPath(milestone, startedAt), report);
  const totals = sweepTotals(sweep, deps.config.turnsPerYear);

  // The report is written before anything is asserted, so a failing run leaves it to read.
  console.log(
    `${seeds.length} games: ${JSON.stringify(totals.endings)}; Rival folds ${JSON.stringify(totals.rivalFolds)}, ` +
      `Rival Guildmasters succeeded ${totals.rivalSuccessions}; years survived mean ` +
      `${totals.yearsSurvived.mean.toFixed(2)}; advance ${sweep.advance.mean.toFixed(3)} ms mean, ` +
      `${sweep.advance.p99.toFixed(3)} ms p99; validated: ${validate}; ${(sweep.totalMs / 1000).toFixed(1)} s in all\n` +
      `Fingerprint of every seed's last save (DL-76): ${sweepFingerprint(sweep.games)}\nReport: ${path}`,
  );
  expect(sweep.games).toHaveLength(seeds.length);
  for (const game of sweep.games) expect(game.counters.ending !== null || game.ranFullLength, game.seed).toBe(true);
  expect(totals.refusals).toBe(0);
  expect(totals.signingRefused).toBe(0);
  expect(sweep.games.filter((game) => game.invalid !== null).map((game) => game.seed)).toEqual([]);
  expect(sweep.games.filter((game) => game.assertion !== null).map((game) => game.seed)).toEqual([]);
  expect(sweep.games.filter((game) => !game.measures.roundTrips).map((game) => game.seed)).toEqual([]);
  if (replay) expect(sweep.replay?.identical).toBe(true);
});
