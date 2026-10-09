import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { creationReport, sweepCreation } from './creation.js';
import { expectChosenAsNone } from './guildmaster-chosen.test-support.js';
import { machine, print, reportPath, writeReport } from './report.js';
import { seedNames } from './seeds.js';
import { runSettings } from './settings.js';

// The creation harness run, collected only by the harness-run project, which exists when
// HEROESIM_HARNESS is set (`npm run harness`): create HEROESIM_SEEDS worlds (1,000 by default)
// from `seed-0001` onward with the core content and `defaultConfig`, validate each, create each
// again and compare the two serialisations byte for byte, and write the report to
// harness/reports/creation-<date>.md. The determinism measure is recorded in DL-13. Not run when
// HEROESIM_MODULES names modules: that run is modules.harness.test.ts's (DL-78); nor when
// HEROESIM_PROBE names a probe (succession.harness.test.ts, DL-113); nor under a profile, which plays
// the play sweep alone.

const settings = runSettings();
const creating = settings.run === 'milestone' && settings.profile === null;
const seeds = seedNames(settings.run === 'milestone' ? settings.worlds : 0);

test.runIf(creating)(`${seeds.length} worlds are valid, and byte-identical when created again`, { timeout: 30 * 60_000 }, () => {
  const startedAt = new Date();
  const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };

  const sweep = sweepCreation(seeds, deps);
  const path = writeReport(reportPath('creation', startedAt), creationReport(sweep, { deps, machine: machine(), startedAt }));

  // The report is written before anything is asserted, so a failing run leaves it to read.
  print(
    `${sweep.identical} of ${seeds.length} worlds byte-identical; creation ${sweep.firstCreation.mean.toFixed(3)} ms ` +
      `mean, ${sweep.firstCreation.p99.toFixed(3)} ms p99; ${(sweep.totalMs / 1000).toFixed(2)} s in all; ` +
      `fingerprint ${sweep.fingerprint}\nReport: ${path}`,
  );
  expect(sweep.refused).toEqual([]);
  expect(sweep.mismatches).toEqual([]);
  expect(sweep.identical).toBe(seeds.length);
  expect(sweep.outOfRange).toEqual([]);
});

// DL-149: every attribute of the player's Guildmaster chosen leaves the rest of the world
// as none chosen, over the same seeds; `npm test` holds it over 60 (creation.test.ts, DL-164).
test.runIf(creating)(`${seeds.length} worlds with every Guildmaster attribute chosen are those with none, but for the Guildmaster`, { timeout: 30 * 60_000 }, () => {
  const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };
  expect(expectChosenAsNone(seeds, deps).rivalPictureMoved).toBeGreaterThan(0);
});
