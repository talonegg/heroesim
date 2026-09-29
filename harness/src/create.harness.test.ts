import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { creationReport, sweepCreation } from './creation.js';
import { moduleIds } from './modules.js';
import { machine, reportPath, writeReport } from './report.js';
import { probeName } from './succession.js';
import { seedCount, seedNames } from './seeds.js';

// M1-S10's harness run, collected only by the harness-run project, which exists when
// HEROESIM_HARNESS is set (`npm run harness`): create HEROESIM_SEEDS worlds (1,000 by default)
// from `seed-0001` onward with the core content and `defaultConfig`, validate each, create each
// again and compare the two serialisations byte for byte, and write the report to
// harness/reports/m1-<date>.md. The determinism measure is recorded in DL-13. Not run when
// HEROESIM_MODULES names modules: that run is modules.harness.test.ts's (M8-S3, DL-78); nor when
// HEROESIM_PROBE names a probe (M9-F1, succession.harness.test.ts).

const seeds = seedNames(seedCount());

test.skipIf(moduleIds().length > 0 || probeName() !== null)(`${seeds.length} worlds are valid, and byte-identical when created again`, { timeout: 30 * 60_000 }, () => {
  const startedAt = new Date();
  const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };

  const sweep = sweepCreation(seeds, deps);
  const path = writeReport(reportPath('m1', startedAt), creationReport(sweep, { deps, machine: machine(), startedAt }));

  // The report is written before anything is asserted, so a failing run leaves it to read.
  console.log(
    `${sweep.identical} of ${seeds.length} worlds byte-identical; creation ${sweep.firstCreation.mean.toFixed(3)} ms ` +
      `mean, ${sweep.firstCreation.p99.toFixed(3)} ms p99; ${(sweep.totalMs / 1000).toFixed(2)} s in all; ` +
      `fingerprint ${sweep.fingerprint}\nReport: ${path}`,
  );
  expect(sweep.refused).toEqual([]);
  expect(sweep.mismatches).toEqual([]);
  expect(sweep.identical).toBe(seeds.length);
  expect(sweep.outOfRange).toEqual([]);
});
