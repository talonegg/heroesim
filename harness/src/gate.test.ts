import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { estimateMoraleTolerance, estimateTolerance } from './estimate.js';
import { checkGate, gatePrinted, gateSection, gateSpecProblems, parseGateSpec, readGateSpec, type GateSpec } from './gate.js';
import { machine } from './report.js';
import { runReport, type RunReport } from './run-report.js';
import { seedNames } from './seeds.js';
import { sweepPlay } from './sweep.js';

// DL-186 items 13 and 21: the Gate's spec, `harness/gate.json`, and a run checked against
// it line by line; the spec as the owner approved it (DL-188).

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };
const spec = readGateSpec();
const mebibyte = 1024 * 1024;

/** Two short games' report, as a run of the spec's shape: 2 games of 1 year, its saves after the year given. */
const sweep = await sweepPlay(seedNames(2), deps, { years: 60 / deps.config.turnsPerYear });
const played = runReport(sweep, { milestone: 'm9-gate-test', startedAt: new Date(2026, 9, 5), machine: machine(), config: deps.config, content });
const shaped: GateSpec = { ...spec, run: { ...spec.run, games: 2, years: 1 }, lines: { ...spec.lines, copyShare: { ...spec.lines.copyShare, baselineShare: 0.2 } } };

/** A passing run of `shaped`'s shape, then `change` applied to a copy of it. */
function passing(change: (run: RunReport) => void = () => {}): RunReport {
  const run = structuredClone(played);
  run.years = 1;
  run.totals.saves = [{ lengths: [140 * mebibyte, 146 * mebibyte], heroFields: [0, 0], gzipped: [27 * mebibyte, 31 * mebibyte] }];
  const rows = { live: [1, 1], writeOnce: [0, 0] };
  // The copy's mean 0.95 ms over `advance`'s 4 ms: a share of 0.2375, under the shaped spec's limit, 0.25.
  run.totals.worlds = [{ characters: [1, 1], heroes: rows, guildmasters: rows, guilds: rows, otherRows: [1, 1], copyMs: [0.9, 1] }];
  run.timings.advance = { ...run.timings.advance, count: 1000, mean: 4 };
  change(run);
  return run;
}

const verdicts = (run: RunReport, expect_: string | null = null): Record<string, string> =>
  Object.fromEntries(checkGate(shaped, run, expect_).lines.map((line) => [line.line, line.verdict]));

describe("the Gate's spec", () => {
  // The owner's answers (DL-188): the fixed lines as drafted; no band on the Traits a career; the
  // Bankruptcies at most 3 of 50; the save's gzipped mean under 30 MiB, no guard on its uncompressed size.
  test("the spec as shipped is whole and approved by the owner, its baseline v1.1.8's closing full gate (DL-229)", () => {
    expect(gateSpecProblems(spec)).toEqual([]);
    expect(spec.status).toBe('approved');
    expect(spec.run).toMatchObject({ games: 50, years: 20 });
    expect(spec.baseline).toMatchObject({
      release: 'v1.1.8',
      report: 'harness/reports/v1.1.8-gate-2026-10-09.md',
      fingerprint: '5dbfdaf460aea084ea1e6a37de78b44f74f32803ab98626ffed4a127b786e62b',
    });
    expect(spec.lines.saveGzipped).toMatchObject({ baselineMeanMiB: 17.51, baselineMaxMiB: 20.64 });
    expect(spec.lines.playerBankruptcies.baseline).toBe(0);
    expect(Object.keys(spec.lines)).toEqual(['refusals', 'invalid', 'stopped', 'unfinished', 'roundTrips', 'replay', 'playerBankruptcies', 'saveGzipped', 'copyShare']);
    // The owner's answers (DL-203 answer 3, DL-206 item 17): the copy's share of a Turn at most 25%
    // over its baseline, 0.847 ms over 3.346 ms at S17's full gate, kept as the anchor by the owner (DL-229).
    expect(spec.lines.copyShare).toMatchObject({ growth: 0.25, baselineShare: 0.253 });
    expect(spec.lines.playerBankruptcies.max).toBe(3);
    expect(spec.lines.saveGzipped.meanMiB).toBe(30);
    expect(spec.estimate.noOneFalls.within).toBe(0.02);
    expect(spec.estimate.moraleInQuest.within).toBe(0.03);
  });

  test("the estimate's two limits are the spec's", () => {
    expect(estimateTolerance).toBe(spec.estimate.noOneFalls.within);
    expect(estimateMoraleTolerance).toBe(spec.estimate.moraleInQuest.within);
  });

  test('refuses a spec with a line missing, a line it does not know or a value of the wrong kind', () => {
    const without = structuredClone(spec) as unknown as { lines: Record<string, unknown> };
    delete without.lines['replay'];
    expect(gateSpecProblems(without)).toEqual(['gate.lines.replay is missing']);
    expect(gateSpecProblems({ ...spec, lines: { ...spec.lines, copyTime: { max: 1, source: 'S17' } } })).toEqual(['gate.lines.copyTime is not a line of the spec']);
    expect(gateSpecProblems({ ...spec, status: 'binding' })).toEqual(['gate.status is one of drafted, approved, not "binding"']);
    expect(gateSpecProblems({ ...spec, lines: { ...spec.lines, refusals: { max: '0', source: 'x' } } })).toEqual(['gate.lines.refusals.max is a number from 0, not "0"']);
    expect(gateSpecProblems({ ...spec, lines: { ...spec.lines, refusals: { max: 0 } } })).toEqual(['gate.lines.refusals.source is missing']);
    // The two lines the owner took out (DL-188) are lines the spec no longer knows.
    expect(gateSpecProblems({ ...spec, lines: { ...spec.lines, traitsPerCareer: { min: 2, max: 2.3, baseline: 2.178, source: 'x' } } })).toEqual([
      'gate.lines.traitsPerCareer is not a line of the spec',
    ]);
    expect(gateSpecProblems({ ...spec, lines: { ...spec.lines, saveGrowth: { baselineMeanBytes: 1, growth: 0.1, source: 'x' } } })).toEqual([
      'gate.lines.saveGrowth is not a line of the spec',
    ]);
    expect(() => parseGateSpec('{"status":"approved"}')).toThrow(/harness\/gate.json: gate.decided is missing/);
    // The copy's baseline is a share, a number from 0 (DL-207).
    const copyShare = (baselineShare: unknown): unknown => ({ ...spec, lines: { ...spec.lines, copyShare: { ...spec.lines.copyShare, baselineShare } } });
    expect(gateSpecProblems(copyShare(0.25))).toEqual([]);
    expect(gateSpecProblems(copyShare(null))).toEqual(['gate.lines.copyShare.baselineShare is a number from 0, not null']);
    expect(gateSpecProblems(copyShare(-1))).toEqual(['gate.lines.copyShare.baselineShare is a number from 0, not -1']);
    expect(gateSpecProblems({ ...spec, lines: { ...spec.lines, copyMs: { growth: 0.25, baselineMeanMs: 1, source: 'S17' } } })).toContain('gate.lines.copyMs is not a line of the spec');
  });
});

describe('a run checked against the Gate, line by line', () => {
  test('a run within every line passes, each line passing', () => {
    const result = checkGate(shaped, passing());
    expect(result.pass).toBe(true);
    expect(result.lines.map((line) => [line.line, line.verdict])).toEqual([
      ['Policy actions the rules refused', 'pass'],
      ['Games the validator refused', 'pass'],
      ['Games a harness assertion stopped', 'pass'],
      ['Games neither ended nor played to their last Turn', 'pass'],
      ['Saves that fail their round trip', 'pass'],
      ['One seed replayed alone, its last save the same as its shard recorded', 'pass'],
      ["The player's Bankruptcies", 'pass'],
      ['The save after 1 year, gzipped', 'pass'],
      ["The per-Turn copy's share of a Turn", 'pass'],
    ]);
    expect(result.lines.at(-1)).toMatchObject({
      measured: 'share 0.2375: copy mean 0.950 ms over 2 copies, advance mean 4.000 ms',
      limit: 'share at most 0.250 (0.200 + 25%)',
    });
    // The mean is held, not every save: one of the two above 30 MiB passes (DL-188).
    expect(result.lines.find((line) => line.line.endsWith('gzipped'))).toMatchObject({ measured: 'mean 29.00 MiB, max 31.00 MiB, over 2 games', limit: 'mean under 30.00 MiB' });
  });

  test.each<[string, (run: RunReport) => void]>([
    ['Policy actions the rules refused', (run) => (run.totals.refusals = 1)],
    ['Games the validator refused', (run) => (run.totals.invalidGames = 1)],
    ['Games a harness assertion stopped', (run) => (run.totals.assertionGames = 1)],
    ['Games neither ended nor played to their last Turn', (run) => ((run.games[0] as RunReport['games'][number]).ranFullLength = false)],
    ['Saves that fail their round trip', (run) => ((run.games[1] as RunReport['games'][number]).roundTrips = false)],
    ['One seed replayed alone, its last save the same as its shard recorded', (run) => (run.replay = { seed: 'seed-0001', identical: false, length: 1 })],
    ['One seed replayed alone, its last save the same as its shard recorded', (run) => (run.replay = null)],
    ["The player's Bankruptcies", (run) => (run.totals.endings['bankruptcy'] = 4)],
    ['The save after 1 year, gzipped', (run) => ((run.totals.saves[0] as { gzipped: number[] }).gzipped = [30 * mebibyte, 30 * mebibyte])],
    ['The save after 1 year, gzipped', (run) => ((run.totals.saves[0] as { gzipped: number[] }).gzipped = [29 * mebibyte, 32 * mebibyte])],
    ["The per-Turn copy's share of a Turn", (run) => ((run.totals.worlds[0] as { copyMs: number[] }).copyMs = [1, 1.01])],
  ])('fails on "%s" alone when its line is not met', (line, change) => {
    const result = checkGate(shaped, passing(change));
    expect(result.pass).toBe(false);
    expect(result.lines.filter((it) => it.verdict === 'fail').map((it) => it.line)).toEqual([line]);
  });

  // DL-188: a game that ended before its last Turn finished; only a game
  // neither ended nor at its last Turn is unfinished.
  test('a game that ended early, by a Bankruptcy, is not unfinished', () => {
    const ended = passing((run) => {
      const game = run.games[0] as RunReport['games'][number];
      game.ranFullLength = false;
      game.ending = 'bankruptcy';
      run.totals.endings['bankruptcy'] = 1;
    });
    expect(verdicts(ended)['Games neither ended nor played to their last Turn']).toBe('pass');
    expect(checkGate(shaped, ended).pass).toBe(true);
  });

  // DL-206 item 17: the copy's share of a Turn, the baseline S17's full gate measured,
  // 0.847 ms over 3.346 ms, 0.253, read from the shipped spec; a run at its limit, 0.31625, passes, one
  // over it fails.
  test("the shipped spec's copy line holds the full gate's baseline share and reads it", () => {
    expect(spec.lines.copyShare.baselineShare).toBe(0.253);
    expect(0.847 / 3.346).toBeCloseTo(0.253, 3);
    const shipped: GateSpec = { ...spec, run: shaped.run };
    const copyLine = (copyMs: number[]) => checkGate(shipped, passing((run) => ((run.totals.worlds[0] as { copyMs: number[] }).copyMs = copyMs))).lines.at(-1);
    // `advance`'s mean is 4 ms: the limit, 0.31625, is a copy of 1.265 ms, printed as it is applied.
    expect(copyLine([1.265, 1.265])).toMatchObject({ verdict: 'pass', limit: 'share at most 0.31625 (0.253 + 25%)' });
    expect(copyLine([1.265, 1.265])?.measured).toMatch(/^share 0\.31625: /);
    expect(copyLine([1.2, 1.3])).toMatchObject({ verdict: 'pass' });
    expect(copyLine([1.27, 1.27])).toMatchObject({ verdict: 'fail' });
  });

  // The review of v1.1.7 S1–S4 (DL-207, DL-210): a failing share never prints as the limit it failed.
  test('a failing share prints above its limit, a passing one at or under it, to as many places as that takes', () => {
    const shipped: GateSpec = { ...spec, run: shaped.run };
    const copyLine = (copyMs: number) => checkGate(shipped, passing((run) => ((run.totals.worlds[0] as { copyMs: number[] }).copyMs = [copyMs, copyMs]))).lines.at(-1);
    const shown = (text: string | undefined, pattern: RegExp): number => Number(pattern.exec(text ?? '')?.[1]);
    const read = (copyMs: number) => {
      const line = copyLine(copyMs);
      return { verdict: line?.verdict, share: shown(line?.measured, /^share ([\d.]+):/), limit: shown(line?.limit, /^share at most ([\d.]+) /) };
    };
    // A share of 0.3163 (a copy of 1.2652 ms over 4 ms): over 0.31625, so it fails, and prints so.
    expect(copyLine(1.2652)).toMatchObject({ verdict: 'fail', limit: 'share at most 0.31625 (0.253 + 25%)' });
    expect(copyLine(1.2652)?.measured).toMatch(/^share 0\.3163: /);
    for (const copyMs of [1.2652, 1.26501, 1.265004, 1.2650004, 1.4]) {
      const { verdict, share, limit } = read(copyMs);
      expect(verdict).toBe('fail');
      expect(share).toBeGreaterThan(limit);
    }
    for (const copyMs of [1.265, 1.26499, 1.264996, 1.2649996, 1]) {
      const { verdict, share, limit } = read(copyMs);
      expect(verdict).toBe('pass');
      expect(share).toBeLessThanOrEqual(limit);
    }
  });

  test('a run exactly at the limit passes, one over it fails, a machine twice as slow in both is the same share', () => {
    const copyLine = (copyMs: number, advanceMs = 4) =>
      checkGate(
        shaped,
        passing((run) => {
          (run.totals.worlds[0] as { copyMs: number[] }).copyMs = [copyMs, copyMs];
          run.timings.advance.mean = advanceMs;
        }),
      ).lines.at(-1);
    expect(copyLine(1)).toMatchObject({ verdict: 'pass' });
    expect(copyLine(1.0001)).toMatchObject({ verdict: 'fail' });
    expect(copyLine(2, 8)).toMatchObject({ verdict: 'pass' });
    expect(copyLine(2.0002, 8)).toMatchObject({ verdict: 'fail' });
  });

  test("the copy's line with no copy times, or no advance times, reads not comparable", () => {
    const none = checkGate(shaped, passing((run) => (run.totals.worlds = [])));
    expect(none.pass).toBe(true);
    // The line names the half missing and prints the half measured (the review, DL-207).
    expect(none.lines.at(-1)).toMatchObject({
      line: "The per-Turn copy's share of a Turn",
      verdict: 'not comparable',
      measured: 'copy times not measured; advance mean 4.000 ms',
    });
    const unmeasured = checkGate(shaped, passing((run) => (run.timings.advance = { ...run.timings.advance, count: 0, mean: Number.NaN })));
    expect(unmeasured.lines.at(-1)).toMatchObject({ verdict: 'not comparable', measured: 'advance times not measured; copy mean 0.950 ms over 2 copies' });
    expect(unmeasured.pass).toBe(true);
    const neither = checkGate(
      shaped,
      passing((run) => {
        run.totals.worlds = [];
        run.timings.advance = { ...run.timings.advance, count: 0, mean: Number.NaN };
      }),
    );
    expect(neither.lines.at(-1)).toMatchObject({ verdict: 'not comparable', measured: 'copy and advance times not measured' });
    // A mean of 0 has no share to divide into, and a report read back from JSON holds an unmeasured
    // mean as null (DL-207's verification).
    const advanceMean = (mean: unknown) => checkGate(shaped, passing((run) => (run.timings.advance = { ...run.timings.advance, mean: mean as number }))).lines.at(-1);
    expect(advanceMean(0)).toMatchObject({ verdict: 'not comparable', measured: 'advance mean 0.000 ms, no share to read; copy mean 0.950 ms over 2 copies' });
    expect(advanceMean(null)).toMatchObject({ verdict: 'not comparable', measured: 'advance times not measured; copy mean 0.950 ms over 2 copies' });
  });

  test('a band at its edge passes: the Bankruptcies at the most, the gzipped mean just under 30 MiB', () => {
    expect(checkGate(shaped, passing((run) => (run.totals.endings['bankruptcy'] = 3))).pass).toBe(true);
    const under = 30 * mebibyte - 1;
    expect(checkGate(shaped, passing((run) => ((run.totals.saves[0] as { gzipped: number[] }).gzipped = [under, under]))).pass).toBe(true);
    expect(checkGate(shaped, passing((run) => ((run.totals.worlds[0] as { copyMs: number[] }).copyMs = [1, 1]))).pass).toBe(true);
  });

  // The owner's answers (DL-188): the Traits a career and the save's uncompressed size are printed by
  // the report, not held by the Gate.
  test("neither the Traits a career nor the save's uncompressed size is a line of the Gate", () => {
    const run = passing((it) => {
      it.totals.traitsGained.player = 900;
      it.totals.questingHeroes.player = 100;
      (it.totals.saves[0] as { lengths: number[] }).lengths = [400 * mebibyte, 400 * mebibyte];
    });
    const result = checkGate(shaped, run);
    expect(result.pass).toBe(true);
    expect(result.lines.map((line) => line.line).filter((line) => /Traits|uncompressed/.test(line))).toEqual([]);
  });

  test("the fingerprint is a line only when expected, and fails when the run's differs", () => {
    const run = passing();
    expect(verdicts(run)).not.toHaveProperty("The fingerprint of every seed's last save");
    expect(verdicts(run, run.fingerprint)["The fingerprint of every seed's last save"]).toBe('pass');
    const other = checkGate(shaped, run, 'e7ae171001c2c885586893b760678089a7400672568c0f53fa83713e6369f369');
    expect(other.pass).toBe(false);
    expect(other.lines[0]).toMatchObject({ line: "The fingerprint of every seed's last save", verdict: 'fail', measured: run.fingerprint });
  });

  test("on a run of another shape than the spec's the bands are not comparable, and the invariants still hold", () => {
    const result = checkGate(spec, passing());
    expect(result.pass).toBe(true);
    const bands = result.lines.filter((line) => line.verdict === 'not comparable');
    expect(bands.map((line) => line.line)).toEqual(["The player's Bankruptcies", 'The save after 20 years, gzipped', "The per-Turn copy's share of a Turn"]);
    expect(bands[0]?.measured).toBe('this run played 2 games of 1 year');
    expect(checkGate(spec, passing((run) => (run.totals.refusals = 2))).pass).toBe(false);
    // Of the spec's years but not its games, as the neutral profile's 10 of 20 years are, or the other way.
    const games = checkGate({ ...shaped, run: { ...shaped.run, games: 3 } }, passing());
    expect(games.lines.filter((line) => line.verdict === 'not comparable')).toHaveLength(3);
    expect(games.lines.find((line) => line.verdict === 'not comparable')?.measured).toBe('this run played 2 games of 1 year');
    const years = checkGate({ ...shaped, run: { ...shaped.run, years: 2 } }, passing());
    expect(years.lines.filter((line) => line.verdict === 'not comparable')).toHaveLength(3);
  });

  test('prints each line and the verdict, and writes them as a section of the Markdown report', () => {
    const result = checkGate(shaped, passing((run) => (run.totals.refusals = 1)));
    const printed = gatePrinted(result);
    expect(printed[0]).toBe('The Gate (harness/gate.json, approved):');
    expect(printed[1]).toBe('  FAIL  Policy actions the rules refused: 1 (at most 0)');
    expect(printed[2]).toBe('  PASS  Games the validator refused: 0 (not validated after every advance) (at most 0)');
    expect(printed.at(-1)).toBe('The Gate: FAIL');
    const section = gateSection(result).join('\n');
    expect(section).toContain('## The Gate');
    expect(section).toContain('(approved), line by line: **fail**.');
    expect(gatePrinted(checkGate({ ...shaped, status: 'drafted' }, passing()))[0]).toBe("The Gate (harness/gate.json, drafted, awaiting the owner's approval):");
    expect(section).toContain('| Policy actions the rules refused | fail | 1 | at most 0 |');
  });
});
