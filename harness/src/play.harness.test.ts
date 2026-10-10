import { loadContent, loadDrafts } from '@heroesim/content/node';
import type { EngineDeps } from '@heroesim/engine';
import { expect, test } from 'vitest';
import { checkGate, gatePrinted, readGateSpec } from './gate.js';
import { runConfig } from './play.js';
import { defaultPolicyConfig } from './policy.js';
import { machine, print, reportPath, writeReport } from './report.js';
import { addCommand, jsonPathOf, runReport, writeRunReport } from './run-report.js';
import { seedNames } from './seeds.js';
import { runSettings, settingsSet } from './settings.js';
import { playReport } from './play-report.js';
import { sweepPlayInParallel } from './sweep.js';

// The milestone's harness run (DL-34; M3's counters, DL-40; M4's, DL-55; M5's, DL-62;
// M6's, DL-69; M8's, the first build's tagged run with HEROESIM_SEEDS=1000, DL-81), collected only
// by the harness-run project, which exists when HEROESIM_HARNESS is set (`npm run harness`): play
// the games the run's settings name (`settings.ts`: 200 by default, INPUTS 4.13) from `seed-0001`
// onward for 20 years or to their ending, under the automatic policy, the core content and
// `defaultConfig`, shared among child processes; with HEROESIM_VALIDATE=1, validate after every
// advance; check the harness assertion (DL-69), that no `hero.transferred` names the player's Guild;
// replay the first seed and compare the two games byte for byte; and write the counters and measures
// to harness/reports/<milestone>-<date>.md and its JSON beside it. Run only when no probe
// and no module is named: those runs are their own.
//
// Under a profile (`npm run harness -- gate <milestone>` or `neutral`, DL-186 items 13
// and 30) the run checks itself against `harness/gate.json`, line by line, and its fingerprint
// against `--expect` when given; it prints each line's verdict, writes them into both reports, and
// on a pass prints the `git add -f` line that commits them (DL-186 item 28).
//
// HEROESIM_YEARS, HEROESIM_DRAFTS, HEROESIM_CONFIG, HEROESIM_POLICY, HEROESIM_WORKERS and
// HEROESIM_REPLAY change the run as `settings.ts` says; the report says which.

const settings = runSettings();
const run = settings.run === 'milestone' ? settings : null;
const seeds = seedNames(run?.games ?? 0);

test.runIf(run !== null)(`${seeds.length} games of ${run?.years ?? 0} years play to an ending or their last Turn`, { timeout: 24 * 60 * 60_000 }, async () => {
  if (run === null) return;
  const { milestone, profile, expect: expected, years, workers, validate, replay, drafts, config: configured, policy: policyChanged } = run;
  const startedAt = new Date();
  const drafted = drafts === null ? null : loadDrafts(drafts);
  const content = drafted?.content ?? loadContent();
  // Every setting checked before any game, a bad one refused by name (DL-193).
  const deps: EngineDeps = { config: runConfig(configured), content };
  const policy = { ...defaultPolicyConfig, ...policyChanged };

  const sweep = await sweepPlayInParallel(seeds, deps, { validate, replay, workers, years, policy, ...(drafts === null ? {} : { drafts }) });
  const json = runReport(sweep, {
    milestone,
    profile,
    startedAt,
    settings: settingsSet('milestone'),
    machine: machine(),
    config: deps.config,
    content: deps.content,
    drafted: drafted?.drafted ?? [],
    configured,
    policyChanged,
  });
  const spec = readGateSpec();
  json.gate = profile === null && expected === null ? null : checkGate(spec, json, expected);
  const report = playReport(sweep, { deps, machine: machine(), startedAt, milestone, drafted: drafted?.drafted ?? [], configured, policyChanged, spec, gate: json.gate });
  const path = writeReport(reportPath(milestone, startedAt), report);
  writeRunReport(jsonPathOf(path), json);
  const { totals } = json;

  // The report is written before anything is asserted, so a failing run leaves it to read.
  print(
    [
      `${seeds.length} games: ${JSON.stringify(totals.endings)}; Rival folds ${JSON.stringify(totals.rivalFolds)}, ` +
        `Rival Guildmasters succeeded ${totals.rivalSuccessions}; years survived mean ` +
        `${totals.yearsSurvived.mean.toFixed(2)}; advance ${sweep.advance.mean.toFixed(3)} ms mean, ` +
        `${sweep.advance.p99.toFixed(3)} ms p99; validated: ${validate}; ${(sweep.totalMs / 1000).toFixed(1)} s in all`,
      `Fingerprint of every seed's last save (DL-76): ${json.fingerprint}`,
      `Report: ${path}, and its JSON beside it`,
      ...(json.gate === null ? [] : gatePrinted(json.gate)),
      ...(json.gate?.pass === true ? [`Commit the reports when a DL entry or a release's Gate cites them: ${addCommand(path)}`] : []),
    ].join('\n'),
  );
  expect(sweep.games).toHaveLength(seeds.length);
  for (const game of sweep.games) expect(game.counters.ending !== null || game.ranFullLength, game.seed).toBe(true);
  expect(totals.refusals).toBe(0);
  expect(totals.signingRefused).toBe(0);
  expect(sweep.games.filter((game) => game.invalid !== null).map((game) => game.seed)).toEqual([]);
  expect(sweep.games.filter((game) => game.assertion !== null).map((game) => game.seed)).toEqual([]);
  expect(sweep.games.filter((game) => !game.measures.roundTrips).map((game) => game.seed)).toEqual([]);
  if (replay) expect(sweep.replay?.identical).toBe(true);
  if (json.gate !== null) expect(json.gate.lines.filter((line) => line.verdict === 'fail').map((line) => line.line)).toEqual([]);
});
