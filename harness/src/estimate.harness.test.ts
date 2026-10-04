import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { estimateChecks, estimateProbe, estimateReport, widest } from './estimate.js';
import { machine, print, reportPath, writeReport } from './report.js';
import { runSettings } from './settings.js';

// v1.1.4-S5's estimate probe (DL-156), collected only by the harness-run project and run only when
// HEROESIM_PROBE names it (`npm run harness -- estimate`), in place of the milestone's creation and
// play runs: HEROESIM_SAMPLES Parties and Quests (200 by default), drawn from the core content and
// `defaultConfig` with no one falling, each resolved for HEROESIM_SEEDS seeds (20,000 by default);
// each Encounter's chance of each Degree and of Success or better, and the Quest's of each band and of
// success, held within 2 points of the resolver's rate (the epic's S5). v1.1.5-S7 (DL-173, DL-168
// item 7) measures the same samples, seeds and estimate again with Morale's consequences left in,
// Injuries and Deaths still taken out. Held within `estimateMoraleTolerance`, 3 points, are the Quest's
// chances only, its bands and success (the owner's answer of 2026-10-04, DL-173); each Encounter's gaps
// there are written to the report, "reported, not held", and do not fail. Both limits are the Gate's
// (`harness/gate.json`, v1.1.6-S2). The report, both measures, is written to
// harness/reports/<milestone>-<date>.md, the milestone HEROESIM_MILESTONE's or `m9-estimate`, so that
// a story's run need not overwrite an earlier one's.

const settings = runSettings();
const probe = settings.run === 'estimate' ? settings : null;
const samples = probe?.samples ?? 0;
const runs = probe?.resolutions ?? 0;

test.runIf(probe !== null)(`${samples} Parties and Quests, each estimated within 2 points of ${runs} seeds resolved, and the Quest's within 3 with Morale in`, { timeout: 24 * 60 * 60_000 }, () => {
  if (probe === null) return;
  const startedAt = new Date();
  const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };
  const probed = estimateProbe(samples, runs, deps);
  const seconds = (Date.now() - startedAt.getTime()) / 1000;
  const path = writeReport(reportPath(probe.milestone, startedAt), estimateReport(probed, { runs, machine: machine(), startedAt, seconds }));

  // The report is written before anything is asserted, so a failing run leaves it to read.
  const most = widest(probed);
  const moraleMost = widest(probed, 'moraleIn', 'quest');
  const encounterMost = widest(probed, 'moraleIn', 'encounters');
  const points = (gap: number | undefined): string => ((gap ?? 0) * 100).toFixed(2);
  // The two checks (`estimateChecks`, tested in estimate.test.ts): every chance strictly within 2 points
  // with no one falling, and the Quest's within 3 with Morale in; a failure prints the gap and its limit.
  const checks = estimateChecks(probed);
  const verdict = (within: boolean): string => (within ? 'PASS' : 'FAIL');
  print(
    [
      `${samples} samples × ${runs} seeds in ${seconds.toFixed(1)} s; the widest gap ${points(most?.gap)} points, with Morale in the Quest's ${points(moraleMost?.gap)} (held) and an Encounter's ${points(encounterMost?.gap)} (reported)`,
      `Report: ${path}`,
      "The Gate's estimate lines (harness/gate.json):",
      `  ${verdict(checks.noOneFalls.within)}  No one falling, every chance: ${points(checks.noOneFalls.gap)} points (within ${points(checks.noOneFalls.limit)})`,
      `  ${verdict(checks.moraleIn.within)}  Morale in, the Quest's bands and success: ${points(checks.moraleIn.gap)} points (within ${points(checks.moraleIn.limit)})`,
    ].join('\n'),
  );
  expect(probed).toHaveLength(samples);
  expect(checks.noOneFalls).toMatchObject({ within: true });
  expect(checks.moraleIn).toMatchObject({ within: true });
});
