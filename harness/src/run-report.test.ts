import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import { checkGate, readGateSpec } from './gate.js';
import { content, coreDeps, twentyDays } from './harness.test-support.js';
import { defaultPolicyConfig } from './policy.js';
import { coreCounters } from './module-report.js';
import { machine, whole } from './report.js';
import { addCommand, compareRuns, jsonPathOf, parseRunReport, readRunReport, reportAt, runReport, runReportJson, writeRunReport, type RunReport } from './run-report.js';
import { seedNames } from './seeds.js';
import { sweepTotals } from './counter.js';
import { sweepFingerprint, sweepPlay, type PlaySweep } from './sweep.js';
import { targetsOf } from './targets.js';

// DL-186 item 13: a play sweep's JSON report beside its Markdown, and two runs compared.

const deps = coreDeps;
const years = twentyDays;
const sweep = await sweepPlay(seedNames(2), deps, { years, validate: true });
const context = { milestone: 'm9-v116-s2', profile: 'neutral' as const, startedAt: new Date(2026, 9, 5, 12), settings: ['HEROESIM_SEEDS=2'], machine: machine(), config: deps.config, content };
const report = runReport(sweep, context);

const scratch = mkdtempSync(join(tmpdir(), 'heroesim-run-report-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("a play sweep's JSON report", () => {
  test('holds the totals, the fingerprint, the config and the policy, and each game', () => {
    expect(report.totals).toEqual(sweepTotals(sweep, deps.config.turnsPerYear));
    expect(report.fingerprint).toBe(sweepFingerprint(sweep.games));
    expect(report.config).toEqual(deps.config);
    expect(report.policy).toEqual(defaultPolicyConfig);
    expect(report).toMatchObject({ format: 1, milestone: 'm9-v116-s2', profile: 'neutral', startedAt: new Date(2026, 9, 5, 12).toISOString(), settings: ['HEROESIM_SEEDS=2'] });
    expect(report.seeds).toEqual(['seed-0001', 'seed-0002']);
    expect(report.content).toEqual({ id: 'core', version: content.version, drafted: [] });
    expect(report.replay).toEqual({ seed: 'seed-0001', identical: true, length: sweep.replay?.length });
    expect(report.games[0]).toEqual({
      seed: 'seed-0001',
      fingerprint: sweep.games[0]?.measures.fingerprint,
      serialisedLength: sweep.games[0]?.measures.serialisedLength,
      turnsPlayed: 60,
      ranFullLength: true,
      ending: null,
      roundTrips: true,
      invalid: false,
      stopped: false,
      refusals: 0,
    });
    expect(report.gate).toBeNull();
  });

  test('round-trips through its JSON, the numbers JSON cannot hold included', () => {
    const checked: RunReport = { ...report, gate: checkGate(readGateSpec(), report) };
    // An empty series' mean, spread and percentiles are NaN; an infinity is as unwritable.
    const withNaN: RunReport = { ...checked, timings: { ...checked.timings, replayAdvance: { count: 0, mean: Number.NaN, sd: Number.NaN, min: Number.NaN, max: Number.NaN, p50: Number.POSITIVE_INFINITY, p99: Number.NEGATIVE_INFINITY } } };
    const text = runReportJson(withNaN);
    expect(text).toContain('"mean": "NaN"');
    expect(parseRunReport(text)).toEqual(withNaN);
    const path = writeRunReport(join(scratch, 'm9-v116-s2-2026-10-05.json'), withNaN);
    expect(readRunReport(path)).toEqual(withNaN);
    expect(readRunReport(join(scratch, 'm9-v116-s2-2026-10-05.md'))).toEqual(withNaN);
    expect(readFileSync(path, 'utf8').endsWith('}\n')).toBe(true);
  });

  test('holds the Targets, set against the baseline given (DL-259)', () => {
    expect(report.targets).toEqual(targetsOf(sweep, deps.config.turnsPerYear, null));
    const against = runReport(sweep, { ...context, baseline: { path: 'x.json', run: report } });
    expect(against.targets?.baseline).toEqual({ report: 'x.json', milestone: 'm9-v116-s2', games: 2, years, fingerprint: report.fingerprint });
  });

  test('finds a report by its path, or its name in harness/reports/, with or without .json', () => {
    expect(reportAt('v1.1.9-gate-2026-10-10').replaceAll('\\', '/')).toMatch(/harness\/reports\/v1\.1\.9-gate-2026-10-10\.json$/);
    expect(reportAt('harness/reports/v1.1.9-gate-2026-10-10.json')).toBe('harness/reports/v1.1.9-gate-2026-10-10.json');
    expect(() => reportAt('no-such-report')).toThrow('No report at no-such-report');
  });

  test('refuses what is not a run report of its format', () => {
    expect(() => parseRunReport('{"format":2,"totals":{}}', 'old.json')).toThrow("old.json is not a play sweep's JSON report of format 1");
    expect(() => parseRunReport('[]')).toThrow(RangeError);
  });

  test("sits beside its Markdown report, and both are committed by one line", () => {
    expect(jsonPathOf('/r/v1.1.9-s3-2026-10-20.md')).toBe('/r/v1.1.9-s3-2026-10-20.json');
    const markdown = join(scratch, '..', 'x.md');
    expect(addCommand(markdown)).toMatch(/^git add -f \S+x\.md \S+x\.json$/);
    expect(addCommand(fileURLToPath(new URL('../reports/v1.1.9-s3-2026-10-20.md', import.meta.url)))).toBe(
      'git add -f harness/reports/v1.1.9-s3-2026-10-20.md harness/reports/v1.1.9-s3-2026-10-20.json',
    );
  });
});

describe('compare', () => {
  test('two runs of the same games: the same fingerprint, no counter moved', () => {
    const again = runReport(sweep, { ...context, startedAt: new Date(2026, 9, 6) });
    const lines = compareRuns(report, again);
    expect(lines).toContain('Fingerprints: the same. Every seed played the same game.');
    expect(lines.find((line) => line.startsWith('Counters:'))).toMatch(/^Counters: 0 moved, [\d,]+ the same\.$/);
    expect(lines.filter((line) => /^(Seeds|Years|Content|Config|Policy|Modules):/.test(line))).toEqual([]);
  });

  test('two runs that differ: the seeds whose saves differ, the config and policy changed, and each counter that moved', () => {
    const b = structuredClone(report);
    const [, second] = b.games as [RunReport['games'][number], RunReport['games'][number]];
    second.fingerprint = 'f'.repeat(64);
    b.fingerprint = 'e'.repeat(64);
    b.config = { ...b.config, marketSize: b.config.marketSize + 1 };
    b.policy = { ...b.policy, rosterLimit: 10 };
    b.totals.heroesDied.player += 2;
    b.totals.refusals = 1;
    const lines = compareRuns(report, b);
    expect(lines).toContain('Fingerprints: different. The last saves of 1 of the 2 seeds both played differ: seed-0002.');
    expect(lines).toContain(`Config: marketSize: ${report.config.marketSize} → ${report.config.marketSize + 1}.`);
    expect(lines).toContain('Policy: rosterLimit: 8 → 10.');
    expect(lines.find((line) => line.startsWith('Counters:'))).toMatch(/^Counters: 2 moved, /);
    expect(lines).toContain(`  heroesDied.player: ${report.totals.heroesDied.player} → ${report.totals.heroesDied.player + 2} (+2)`);
    expect(lines).toContain('  refusals: 0 → 1 (+1)');
    const fewer = structuredClone(b);
    fewer.totals.refusals = 0;
    fewer.years = 2;
    fewer.seeds = ['seed-0001'];
    expect(compareRuns(b, fewer)).toEqual(expect.arrayContaining(['Seeds: 1 only in a, 0 only in b.', `Years: ${years} → 2.`, '  refusals: 1 → 0 (−1)']));
  });

  // DL-205: the save's size as each year ended is a measure, as the worlds are: a change
  // of the save's shape or its config moves it while no play counter moves.
  test("lists the save's sizes moved apart from the counters, as measures", () => {
    // A year's saves, which these games are too short to reach.
    const a: RunReport = { ...report, totals: { ...report.totals, saves: [{ lengths: [900, 950], heroFields: [300, 320], gzipped: [200, 210] }] } };
    const b = structuredClone(a);
    b.totals.saves = [{ lengths: [910, 960], heroFields: [300, 320], gzipped: [200, 210] }];
    b.totals.refusals = 1;
    const lines = compareRuns(a, b);
    expect(lines.filter((line) => line.startsWith('  saves'))).toEqual(['  saves[].lengths[]: 1,850 → 1,870 (+20)']);
    expect(lines.slice(lines.indexOf('  refusals: 0 → 1 (+1)') + 1)).toEqual(["Measures moved, the save's size as each year ended, not play: 1.", '  saves[].lengths[]: 1,850 → 1,870 (+20)']);
    // The counters are the module report's core counters but the save's three sizes.
    const counters = [...coreCounters(a.totals).keys()].filter((counter) => !counter.startsWith('saves'));
    expect(coreCounters(a.totals).size - counters.length).toBe(3);
    expect(lines).toContain(`Counters: 1 moved, ${whole(counters.length - 1)} the same.`);
    const same = compareRuns(a, structuredClone(a));
    expect(same.filter((line) => line.startsWith('Measures'))).toEqual([]);
    expect(same).toContain(`Counters: 0 moved, ${whole(counters.length)} the same.`);
  });

  // DL-188: a seed one run alone played is not a save that differs, and a
  // change of content or of modules is named.
  test('names the content and modules changed, and counts only the seeds both played among the saves that differ', () => {
    const b = structuredClone(report);
    b.seeds = [...b.seeds, 'seed-0003'];
    b.games = [...b.games, { ...(b.games[0] as RunReport['games'][number]), seed: 'seed-0003', fingerprint: 'f'.repeat(64) }];
    b.fingerprint = 'e'.repeat(64);
    b.content = { ...b.content, version: b.content.version + 1 };
    b.modules = ['probe'];
    const lines = compareRuns(report, b);
    expect(lines).toContain('Fingerprints: different. The last saves of 0 of the 2 seeds both played differ.');
    expect(lines).toContain('Seeds: 0 only in a, 1 only in b.');
    expect(lines).toContain(`Content: core ${report.content.version} [] → core ${report.content.version + 1} [].`);
    expect(lines).toContain('Modules: none → probe.');
    const drafted = compareRuns(report, { ...report, content: { ...report.content, drafted: ['quests.json'] } });
    expect(drafted).toContain(`Content: core ${report.content.version} [] → core ${report.content.version} [quests.json].`);
  });
});

// DL-188: each game's line reads its record, an ended, stopped, refused or
// invalid game as such, so that the Gate's invariants are read from the JSON.
test("a game's line reads how it ended, whether it was stopped or invalid, and its refusals", () => {
  const [first, second] = sweep.games as [PlaySweep['games'][number], PlaySweep['games'][number]];
  const marked: PlaySweep = {
    ...sweep,
    games: [
      first,
      {
        ...second,
        ranFullLength: false,
        counters: { ...second.counters, ending: 'bankruptcy' },
        assertion: { turn: 30, check: 'player-transferred', id: 'h-1', detail: 'a test' },
        invalid: { turn: 30, result: { ok: false } } as unknown as NonNullable<typeof second.invalid>,
        refusals: [1, 2].map((turn) => ({ turn, rejection: { reason: 'signing-refused' } })) as unknown as typeof second.refusals,
      },
    ],
  };
  expect(runReport(marked, context).games[1]).toMatchObject({ seed: 'seed-0002', ranFullLength: false, ending: 'bankruptcy', stopped: true, invalid: true, refusals: 2 });
});
