import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { defaultEstimateRuns, defaultEstimateSamples, estimateMoraleTolerance, estimateProbe, estimateReport, estimateTolerance, widest } from './estimate.js';
import { machine, reportPath, writeReport } from './report.js';
import { seedCount } from './seeds.js';
import { probeName } from './succession.js';

// v1.1.4-S5's estimate probe (DL-156), collected only by the harness-run project and run only when
// HEROESIM_PROBE names it (`HEROESIM_PROBE=estimate npm run harness`), in place of the milestone's
// creation and play runs: HEROESIM_SAMPLES Parties and Quests (200 by default), drawn from the core
// content and `defaultConfig` with no one falling, each resolved for HEROESIM_SEEDS seeds (20,000 by
// default); each Encounter's chance of each Degree and of Success or better, and the Quest's of each
// band and of success, held within 2 points of the resolver's rate (the epic's S5). v1.1.5-S7 (DL-173,
// DL-168 item 7) measures the same samples, seeds and estimate again with Morale's consequences left in,
// Injuries and Deaths still taken out, every chance held within `estimateMoraleTolerance`, 3 points.
// The report, both measures, is written to harness/reports/<milestone>-<date>.md, the milestone
// HEROESIM_MILESTONE's or `m9-estimate`, so that a story's run need not overwrite an earlier one's.

const samples = seedCount(process.env.HEROESIM_SAMPLES ?? '', defaultEstimateSamples, 'HEROESIM_SAMPLES');
const runs = seedCount(process.env.HEROESIM_SEEDS, defaultEstimateRuns);
const milestone = process.env.HEROESIM_MILESTONE?.trim() || 'm9-estimate';

test.runIf(probeName() === 'estimate')(`${samples} Parties and Quests, each estimated within 2 points of ${runs} seeds resolved, and within 3 with Morale in`, { timeout: 24 * 60 * 60_000 }, () => {
  const startedAt = new Date();
  const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };
  const probed = estimateProbe(samples, runs, deps);
  const seconds = (Date.now() - startedAt.getTime()) / 1000;
  const path = writeReport(reportPath(milestone, startedAt), estimateReport(probed, { runs, machine: machine(), startedAt, seconds }));

  // The report is written before anything is asserted, so a failing run leaves it to read.
  const most = widest(probed);
  const moraleMost = widest(probed, 'moraleIn');
  const points = (gap: number | undefined): string => ((gap ?? 0) * 100).toFixed(2);
  console.log(`${samples} samples × ${runs} seeds in ${seconds.toFixed(1)} s; the widest gap ${points(most?.gap)} points, with Morale in ${points(moraleMost?.gap)}\nReport: ${path}`);
  expect(probed).toHaveLength(samples);
  expect(most?.gap ?? 0).toBeLessThan(estimateTolerance);
  expect(moraleMost?.gap ?? 0).toBeLessThan(estimateMoraleTolerance);
});
