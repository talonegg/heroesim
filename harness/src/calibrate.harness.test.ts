import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { calibrate, calibrationReport, defaultCalibration, defaultTuningAim, draftsDir, heroPool, loadDrafts, tunedFactors, writeTunedEncounters, type TuningAim } from './calibrate.js';
import { runConfig } from './play.js';
import { machine, print, writeReport } from './report.js';
import { runSettings, settingsSet } from './settings.js';

// The calibration (DL-162), collected only by the harness-run project and run only when
// HEROESIM_PROBE names it: `npm run harness -- calibrate` (main.ts sets the probe from the word), or
// `HEROESIM_PROBE=calibrate npm run harness`. It calibrates the shipped content, or that content with
// the drafts of HEROESIM_DRAFTS (a directory of content files and folders, each in place of the core's
// of its name, a folder whole (DL-260), such as `docs/quests/drafts`; unset, blank or `none`, the content alone),
// HEROESIM_PARTIES random Parties a cell (120 by default) and HEROESIM_SEEDS seeds a spot-check sample (4,000 by default), and writes
// `calibration.md` and `calibration.json` beside the drafts' directory (`docs/quests/`), or into
// HEROESIM_CALIBRATION_OUT.
//
// With HEROESIM_TUNE set to a chance (`0.44`), beside HEROESIM_DRAFTS, it first sets every Check's
// difficulty factor in the drafts' `encounters/` so that at `defaultTuningAim` (Level 5, difficulty 60) random Parties of 3
// succeed at each Encounter with that chance (`tunedFactors`), and writes each file back, then
// calibrates it; each Finale at the middle of its template's difficulties (`aimOf`). HEROESIM_FLAT, a
// share from 0 to 1, puts that share of each target at the aim into the Check's flat term (DL-162
// verification). HEROESIM_CONFIG plays config values in place of the defaults, as a play sweep does.
// Each variable is read, and a bad value refused, by `settings.ts`, which also refuses
// HEROESIM_TUNE without HEROESIM_DRAFTS (tuning writes the drafts' files, never the
// content's). The drafts' tuning is in docs/quests/calibration.md's command line.

const run = runSettings();
const probe = run.run === 'calibrate' ? run : null;

test.runIf(probe !== null)('the content is calibrated, and the estimate holds to the resolver', { timeout: 24 * 60 * 60_000 }, () => {
  if (probe === null) return;
  const { drafts: draftDir, config: configured } = probe;
  const out = probe.out ?? join(draftsDir, '..');
  const settings = { ...defaultCalibration, parties: probe.parties, spotSeeds: probe.spotSeeds };
  const startedAt = new Date();
  const aim: TuningAim | undefined = probe.tune === null ? undefined : { ...defaultTuningAim, chance: probe.tune, flatShare: probe.flat };
  if (aim !== undefined && draftDir !== null) {
    const { content } = loadDrafts(draftDir);
    const deps: EngineDeps = { config: runConfig(configured), content };
    const pool = heroPool(`calibrate-level-${aim.level}`, aim.level, settings.pool, deps);
    writeTunedEncounters(draftDir, tunedFactors(pool, aim, settings.parties, deps));
  }

  const { content, drafted } = loadDrafts(draftDir);
  const deps: EngineDeps = { config: runConfig(configured), content };
  const calibration = calibrate(settings, deps, drafted);
  const seconds = (Date.now() - startedAt.getTime()) / 1000;
  const set = settingsSet('calibrate').filter((it) => !it.startsWith('HEROESIM_PROBE=') && !it.startsWith('HEROESIM_CALIBRATION_OUT='));
  const command = [...set, 'npm run harness -- calibrate'].join(' ');
  const label = draftDir === draftsDir ? 'docs/quests/drafts/' : (draftDir ?? 'none');
  const report = calibrationReport(calibration, { machine: machine(), startedAt, seconds, command, drafts: label, ...(aim === undefined ? {} : { tuned: aim }) });
  const path = writeReport(join(out, 'calibration.md'), report);
  // Each rate to four places: the data the review page reads (`npm run quest-review`).
  const rounded = JSON.stringify(calibration, (_, value: unknown) => (typeof value === 'number' ? Math.round(value * 1e4) / 1e4 : value));
  writeFileSync(join(out, 'calibration.json'), `${rounded}\n`, 'utf8');

  // The report is written before anything is asserted, so a failing run leaves it to read.
  print(`Calibrated in ${seconds.toFixed(1)} s; the spot-check's widest gap ${(calibration.spot.widest.gap * 100).toFixed(2)} points\nReport: ${path}`);
  expect(calibration.encounters.length).toBe(Object.keys(content.encounters).length);
  expect(calibration.spot.widestErrors).toBeLessThan(5);
});
