import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { moduleReport } from './module-report.js';
import { defaultModuleSeedCount, moduleIds, modulesFor } from './modules.js';
import { validatingEveryTurn } from './play.js';
import { machine, reportPath, writeReport } from './report.js';
import { seedCount, seedNames } from './seeds.js';
import { defaultWorkers, sweepFingerprint, sweepPlayInParallel, sweepTotals, type PlaySweep } from './sweep.js';

// M8-S3's module run (DL-78), collected only by the harness-run project and run only when
// HEROESIM_MODULES names modules (`HEROESIM_MODULES=probe npm run harness`), in place of the
// milestone's creation and play runs: play HEROESIM_SEEDS games (50 by default) from `seed-0001` for
// 20 years or to their ending under the automatic policy, the core content and `defaultConfig`, once
// with the modules installed and once with none, shared among child processes; with
// HEROESIM_VALIDATE=1, validate after every advance; and write what the modules did and the delta on
// each core counter they moved to harness/reports/m8-<module ids>-<date>.md.

const ids = moduleIds();
const seeds = seedNames(seedCount(process.env.HEROESIM_SEEDS, defaultModuleSeedCount));
const validate = validatingEveryTurn();

test.runIf(ids.length > 0)(
  `${seeds.length} games of 20 years with ${ids.join(', ') || 'no module'} installed, and with none`,
  { timeout: 24 * 60 * 60_000 },
  async () => {
    const startedAt = new Date();
    const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };
    const workers = defaultWorkers();

    // One heavy sweep at a time: the modules' first, then none.
    const installed = await sweepPlayInParallel(seeds, { ...deps, modules: modulesFor(ids) }, { validate, workers });
    const without = await sweepPlayInParallel(seeds, deps, { validate, workers });
    const report = moduleReport(installed, without, { deps, moduleIds: ids, machine: machine(), startedAt });
    const path = writeReport(reportPath(`m8-${ids.join('-')}`, startedAt), report);

    // The report is written before anything is asserted, so a failing run leaves it to read.
    const totals = sweepTotals(installed, deps.config.turnsPerYear);
    console.log(
      `${seeds.length} games with ${ids.join(', ')}: module events ${JSON.stringify(totals.moduleEvents)}; ` +
        `validated: ${validate}; ${((installed.totalMs + without.totalMs) / 1000).toFixed(1)} s in all\n` +
        `Fingerprint with the modules: ${sweepFingerprint(installed.games)}\n` +
        `Fingerprint with none: ${sweepFingerprint(without.games)}\nReport: ${path}`,
    );
    for (const sweep of [installed, without] satisfies PlaySweep[]) {
      expect(sweep.games).toHaveLength(seeds.length);
      for (const game of sweep.games) expect(game.counters.ending !== null || game.ranFullLength, game.seed).toBe(true);
      expect(sweep.games.filter((game) => game.refusals.length > 0).map((game) => game.seed)).toEqual([]);
      expect(sweep.games.filter((game) => game.invalid !== null).map((game) => game.seed)).toEqual([]);
      expect(sweep.games.filter((game) => game.assertion !== null).map((game) => game.seed)).toEqual([]);
      expect(sweep.games.filter((game) => !game.measures.roundTrips).map((game) => game.seed)).toEqual([]);
      expect(sweep.replay?.identical).toBe(true);
    }
    expect(sweepTotals(without, deps.config.turnsPerYear).moduleEvents).toEqual({});
    expect(Object.keys(totals.moduleEvents).length).toBeGreaterThan(0);
  },
);
