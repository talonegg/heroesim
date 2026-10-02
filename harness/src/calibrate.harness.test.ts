import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { calibrate, calibrationReport, defaultCalibration, defaultTuningAim, draftsDir, formatJson, heroPool, loadDrafts, tunedFactors, type TuningAim } from './calibrate.js';
import { machine, writeReport } from './report.js';
import { configChanges, seedCount } from './seeds.js';
import { probeName } from './succession.js';

// v1.1.4-S9's calibration (DL-162), collected only by the harness-run project and run only when
// HEROESIM_PROBE names it: `npm run harness -- calibrate` (run.mjs sets the probe from the word), or
// `HEROESIM_PROBE=calibrate npm run harness`. It calibrates the content with the drafts of
// HEROESIM_DRAFTS (a directory of content files, each in place of the core file of its name;
// `docs/quests/drafts/` by default, `none` for the core alone), HEROESIM_PARTIES random Parties a
// cell (120 by default) and HEROESIM_SEEDS seeds a spot-check sample (4,000 by default), and writes
// `calibration.md` and `calibration.json` beside the drafts' directory (`docs/quests/`), or into
// HEROESIM_CALIBRATION_OUT.
//
// With HEROESIM_TUNE set to a chance (`0.44`), it first sets every Check's difficulty factor in the
// drafts' `encounters.json` so that at `defaultTuningAim` (Level 5, difficulty 60) random Parties of 3
// succeed at each Encounter with that chance (`tunedFactors`), and writes the file back, then
// calibrates it; each Finale at the middle of its template's difficulties (`aimOf`). HEROESIM_FLAT, a
// share from 0 to 1, puts that share of each target at the aim into the Check's flat term (v1.1.4-S9's
// verification). HEROESIM_CONFIG plays config values in place of the defaults, as a play sweep does
// (`configChanges`). The drafts' tuning is in docs/quests/calibration.md's command line.

const drafts = process.env.HEROESIM_DRAFTS?.trim() || draftsDir;
const draftDir = drafts === 'none' ? null : drafts;
const configured = configChanges();
const out = process.env.HEROESIM_CALIBRATION_OUT?.trim() || join(draftsDir, '..');
const settings = {
  ...defaultCalibration,
  // `?? ''`: seedCount reads HEROESIM_SEEDS when given no value.
  parties: seedCount(process.env.HEROESIM_PARTIES ?? '', defaultCalibration.parties, 'HEROESIM_PARTIES'),
  spotSeeds: seedCount(process.env.HEROESIM_SEEDS ?? '', defaultCalibration.spotSeeds),
};

test.runIf(probeName() === 'calibrate')('the content is calibrated, and the estimate holds to the resolver', { timeout: 24 * 60 * 60_000 }, () => {
  const startedAt = new Date();
  const tune = process.env.HEROESIM_TUNE?.trim();
  const aim: TuningAim | undefined = tune === undefined || tune === '' || draftDir === null ? undefined : { ...defaultTuningAim, chance: Number(tune), flatShare: Number(process.env.HEROESIM_FLAT?.trim() || 0) };
  if (aim !== undefined && draftDir !== null) {
    const { chance } = aim;
    expect(chance > 0 && chance < 1, `HEROESIM_TUNE is a chance between 0 and 1, not ${tune}`).toBe(true);
    expect(aim.flatShare !== undefined && aim.flatShare >= 0 && aim.flatShare < 1, `HEROESIM_FLAT is a share from 0 to below 1, not ${process.env.HEROESIM_FLAT}`).toBe(true);
    const { content } = loadDrafts(draftDir);
    const deps: EngineDeps = { config: { ...defaultConfig, ...configured }, content };
    const pool = heroPool(`calibrate-level-${aim.level}`, aim.level, settings.pool, deps);
    const factors = tunedFactors(pool, aim, settings.parties, deps);
    const path = join(draftDir, 'encounters.json');
    const json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, { checks: { key: string; flat?: number; difficultyFactor: number }[] }>;
    for (const [key, encounter] of Object.entries(json)) {
      encounter.checks = encounter.checks.map((it) => {
        const tuning = factors[key]?.[it.key];
        if (tuning === undefined) return it;
        // The flat term written before the factor, as a target reads: flat + factor × difficulty; the
        // other fields after them, in their own order.
        const after = Object.fromEntries(Object.entries(it).filter(([field]) => !['key', 'name', 'score', 'skills', 'flat', 'difficultyFactor'].includes(field)));
        const { key: checkKey, name, score, skills } = it as typeof it & { name: unknown; score: unknown; skills: unknown };
        return { key: checkKey, name, score, skills, ...(tuning.flat === undefined ? {} : { flat: tuning.flat }), difficultyFactor: tuning.difficultyFactor, ...after };
      });
    }
    writeFileSync(path, `${formatJson(json)}\n`, 'utf8');
  }

  const { content, drafted } = loadDrafts(draftDir);
  const deps: EngineDeps = { config: { ...defaultConfig, ...configured }, content };
  const calibration = calibrate(settings, deps, drafted);
  const seconds = (Date.now() - startedAt.getTime()) / 1000;
  const set = ['HEROESIM_TUNE', 'HEROESIM_FLAT', 'HEROESIM_CONFIG', 'HEROESIM_DRAFTS', 'HEROESIM_PARTIES', 'HEROESIM_SEEDS'].flatMap((name) => (process.env[name]?.trim() ? [`${name}=${process.env[name]?.trim()}`] : []));
  const command = [...set, 'npm run harness -- calibrate'].join(' ');
  const label = draftDir === draftsDir ? 'docs/quests/drafts/' : (draftDir ?? 'none');
  const report = calibrationReport(calibration, { machine: machine(), startedAt, seconds, command, drafts: label, ...(aim === undefined ? {} : { tuned: aim }) });
  const path = writeReport(join(out, 'calibration.md'), report);
  // Each rate to four places: the data the review page reads (`npm run quest-review`).
  const rounded = JSON.stringify(calibration, (_, value: unknown) => (typeof value === 'number' ? Math.round(value * 1e4) / 1e4 : value));
  writeFileSync(join(out, 'calibration.json'), `${rounded}\n`, 'utf8');

  // The report is written before anything is asserted, so a failing run leaves it to read.
  console.log(`Calibrated in ${seconds.toFixed(1)} s; the spot-check's widest gap ${(calibration.spot.widest.gap * 100).toFixed(2)} points\nReport: ${path}`);
  expect(calibration.encounters.length).toBe(Object.keys(content.encounters).length);
  expect(calibration.spot.widestErrors).toBeLessThan(5);
});
