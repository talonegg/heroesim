import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { defaultEstimateRuns, defaultEstimateSamples, estimateProbe, estimateReport, estimateTolerance, widest } from './estimate.js';
import { machine, reportPath, writeReport } from './report.js';
import { seedCount } from './seeds.js';
import { probeName } from './succession.js';

// v1.1.4-S5's estimate probe (DL-156), collected only by the harness-run project and run only when
// HEROESIM_PROBE names it (`HEROESIM_PROBE=estimate npm run harness`), in place of the milestone's
// creation and play runs: HEROESIM_SAMPLES Parties and Quests (200 by default), drawn from the core
// content and `defaultConfig` with no one falling, each resolved for HEROESIM_SEEDS seeds (20,000 by
// default); each Encounter's chance of each Degree and of Success or better, and the Quest's of each
// band and of success, held within 2 points of the resolver's rate (the epic's S5); the report written
// to harness/reports/m9-estimate-<date>.md.

const samples = seedCount(process.env.HEROESIM_SAMPLES, defaultEstimateSamples);
const runs = seedCount(process.env.HEROESIM_SEEDS, defaultEstimateRuns);

test.runIf(probeName() === 'estimate')(`${samples} Parties and Quests, each estimated within 2 points of ${runs} seeds resolved`, { timeout: 24 * 60 * 60_000 }, () => {
  const startedAt = new Date();
  const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };
  const probed = estimateProbe(samples, runs, deps);
  const seconds = (Date.now() - startedAt.getTime()) / 1000;
  const path = writeReport(reportPath('m9-estimate', startedAt), estimateReport(probed, { runs, machine: machine(), startedAt, seconds }));

  // The report is written before anything is asserted, so a failing run leaves it to read.
  const most = widest(probed);
  console.log(`${samples} samples × ${runs} seeds in ${seconds.toFixed(1)} s; the widest gap ${((most?.gap ?? 0) * 100).toFixed(2)} points\nReport: ${path}`);
  expect(probed).toHaveLength(samples);
  expect(most?.gap ?? 0).toBeLessThan(estimateTolerance);
});
