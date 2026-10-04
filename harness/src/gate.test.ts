import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { estimateMoraleTolerance, estimateTolerance } from './estimate.js';
import { checkGate, gatePrinted, gateSection, gateSpecProblems, parseGateSpec, readGateSpec, type GateSpec } from './gate.js';
import { machine } from './report.js';
import { runReport, type RunReport } from './run-report.js';
import { seedNames } from './seeds.js';
import { sweepPlay } from './sweep.js';

// v1.1.6-S2 (DL-186 items 13 and 21): the Gate's spec, `harness/gate.json`, and a run checked against
// it line by line.

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };
const spec = readGateSpec();
const mebibyte = 1024 * 1024;

/** Two short games' report, as a run of the spec's shape: 2 games of 1 year, its saves after the year given. */
const sweep = sweepPlay(seedNames(2), deps, { years: 60 / deps.config.turnsPerYear });
const played = runReport(sweep, { milestone: 'm9-gate-test', startedAt: new Date(2026, 9, 5), machine: machine(), config: deps.config, content });
const shaped: GateSpec = { ...spec, run: { ...spec.run, games: 2, years: 1 } };

/** A passing run of `shaped`'s shape, then `change` applied to a copy of it. */
function passing(change: (run: RunReport) => void = () => {}): RunReport {
  const run = structuredClone(played);
  run.years = 1;
  run.totals.traitsGained.player = 218;
  run.totals.questingHeroes.player = 100;
  run.totals.saves = [{ lengths: [140 * mebibyte, 146 * mebibyte], heroFields: [0, 0], gzipped: [17 * mebibyte, 21 * mebibyte] }];
  change(run);
  return run;
}

const verdicts = (run: RunReport, expect_: string | null = null): Record<string, string> =>
  Object.fromEntries(checkGate(shaped, run, expect_).lines.map((line) => [line.line, line.verdict]));

describe("the Gate's spec", () => {
  test("the spec as shipped is whole, drafted until the owner approves it, its bands v1.1.5's closing sweep's", () => {
    expect(gateSpecProblems(spec)).toEqual([]);
    expect(spec.status).toBe('drafted');
    expect(spec.run).toMatchObject({ games: 50, years: 20 });
    expect(spec.baseline.fingerprint).toBe('e7ae171001c2c885586893b760678089a7400672568c0f53fa83713e6369f369');
    expect(spec.lines.traitsPerCareer).toMatchObject({ min: 2.078, max: 2.278, baseline: 2.178 });
    expect(spec.lines.saveGzipped.meanMiB).toBe(20);
    expect(spec.lines.saveGrowth).toMatchObject({ baselineMeanBytes: 143_329_439, growth: 0.1 });
  });

  test("the estimate's two limits are the spec's", () => {
    expect(estimateTolerance).toBe(spec.estimate.noOneFalls.within);
    expect(estimateMoraleTolerance).toBe(spec.estimate.moraleInQuest.within);
  });

  test('refuses a spec with a line missing, a line it does not know, a value of the wrong kind or a band upside down', () => {
    const without = structuredClone(spec) as unknown as { lines: Record<string, unknown> };
    delete without.lines['replay'];
    expect(gateSpecProblems(without)).toEqual(['gate.lines.replay is missing']);
    expect(gateSpecProblems({ ...spec, lines: { ...spec.lines, copyTime: { max: 1, source: 'S17' } } })).toEqual(['gate.lines.copyTime is not a line of the spec']);
    expect(gateSpecProblems({ ...spec, status: 'binding' })).toEqual(['gate.status is one of drafted, approved, not "binding"']);
    expect(gateSpecProblems({ ...spec, lines: { ...spec.lines, refusals: { max: '0', source: 'x' } } })).toEqual(['gate.lines.refusals.max is a number from 0, not "0"']);
    expect(gateSpecProblems({ ...spec, lines: { ...spec.lines, refusals: { max: 0 } } })).toEqual(['gate.lines.refusals.source is missing']);
    expect(gateSpecProblems({ ...spec, lines: { ...spec.lines, traitsPerCareer: { ...spec.lines.traitsPerCareer, min: 3 } } })).toEqual([
      'gate.lines.traitsPerCareer: its min 3 is above its max 2.278',
    ]);
    expect(() => parseGateSpec('{"status":"approved"}')).toThrow(/harness\/gate.json: gate.decided is missing/);
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
      ['One seed replayed, its last save identical', 'pass'],
      ["Traits earned a player's Hero career", 'pass'],
      ["The player's Bankruptcies", 'pass'],
      ['The save after 1 year, gzipped', 'pass'],
      ['The save after 1 year, uncompressed', 'pass'],
    ]);
    expect(result.lines.find((line) => line.line.startsWith('Traits'))).toMatchObject({ measured: '2.180 (218 of 100 careers)', limit: '2.078 to 2.278' });
    expect(result.lines.find((line) => line.line.endsWith('gzipped'))).toMatchObject({ measured: 'mean 19.00 MiB, max 21.00 MiB, over 2 games', limit: 'mean under 20.00 MiB' });
    expect(result.lines.find((line) => line.line.endsWith('uncompressed'))).toMatchObject({ measured: 'mean 143.00 MiB (+4.6%), over 2 games', limit: "mean at most 150.36 MiB: 136.69 MiB at v1.1.5, +10%" });
  });

  test.each<[string, (run: RunReport) => void]>([
    ['Policy actions the rules refused', (run) => (run.totals.refusals = 1)],
    ['Games the validator refused', (run) => (run.totals.invalidGames = 1)],
    ['Games a harness assertion stopped', (run) => (run.totals.assertionGames = 1)],
    ['Games neither ended nor played to their last Turn', (run) => ((run.games[0] as RunReport['games'][number]).ranFullLength = false)],
    ['Saves that fail their round trip', (run) => ((run.games[1] as RunReport['games'][number]).roundTrips = false)],
    ['One seed replayed, its last save identical', (run) => (run.replay = { seed: 'seed-0001', identical: false, length: 1 })],
    ['One seed replayed, its last save identical', (run) => (run.replay = null)],
    ["Traits earned a player's Hero career", (run) => (run.totals.traitsGained.player = 228)],
    ["Traits earned a player's Hero career", (run) => (run.totals.traitsGained.player = 207)],
    ["The player's Bankruptcies", (run) => (run.totals.endings['bankruptcy'] = 4)],
    ['The save after 1 year, gzipped', (run) => ((run.totals.saves[0] as { gzipped: number[] }).gzipped = [20 * mebibyte, 20 * mebibyte])],
    ['The save after 1 year, uncompressed', (run) => ((run.totals.saves[0] as { lengths: number[] }).lengths = [150.4 * mebibyte, 150.4 * mebibyte])],
  ])('fails on "%s" alone when its line is not met', (line, change) => {
    const result = checkGate(shaped, passing(change));
    expect(result.pass).toBe(false);
    expect(result.lines.filter((it) => it.verdict === 'fail').map((it) => it.line)).toEqual([line]);
  });

  // v1.1.6-S2's verification (DL-188): a game that ended before its last Turn finished; only a game
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

  test('a band at its edge passes: the Traits at either end, the Bankruptcies at the most, the uncompressed mean at 10%', () => {
    expect(checkGate(shaped, passing((run) => (run.totals.traitsGained.player = 207.8))).pass).toBe(true);
    expect(checkGate(shaped, passing((run) => (run.totals.endings['bankruptcy'] = 3))).pass).toBe(true);
    const most = 143_329_439 * 1.1;
    expect(checkGate(shaped, passing((run) => ((run.totals.saves[0] as { lengths: number[] }).lengths = [most, most]))).pass).toBe(true);
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
    expect(bands.map((line) => line.line)).toEqual(["Traits earned a player's Hero career", "The player's Bankruptcies", 'The save after 20 years, gzipped', 'The save after 20 years, uncompressed']);
    expect(bands[0]?.measured).toBe('this run played 2 games of 1 year');
    expect(checkGate(spec, passing((run) => (run.totals.refusals = 2))).pass).toBe(false);
    // Of the spec's years but not its games, as the neutral profile's 10 of 20 years are, or the other way.
    const games = checkGate({ ...shaped, run: { ...shaped.run, games: 3 } }, passing());
    expect(games.lines.filter((line) => line.verdict === 'not comparable')).toHaveLength(4);
    expect(games.lines.find((line) => line.verdict === 'not comparable')?.measured).toBe('this run played 2 games of 1 year');
    const years = checkGate({ ...shaped, run: { ...shaped.run, years: 2 } }, passing());
    expect(years.lines.filter((line) => line.verdict === 'not comparable')).toHaveLength(4);
  });

  test('prints each line and the verdict, and writes them as a section of the Markdown report', () => {
    const result = checkGate(shaped, passing((run) => (run.totals.refusals = 1)));
    const printed = gatePrinted(result);
    expect(printed[0]).toBe("The Gate (harness/gate.json, drafted, awaiting the owner's approval):");
    expect(printed[1]).toBe('  FAIL  Policy actions the rules refused: 1 (at most 0)');
    expect(printed[2]).toBe('  PASS  Games the validator refused: 0 (not validated after every advance) (at most 0)');
    expect(printed.at(-1)).toBe('The Gate: FAIL');
    const section = gateSection(result).join('\n');
    expect(section).toContain('## The Gate');
    expect(section).toContain("(drafted, awaiting the owner's approval), line by line: **fail**.");
    expect(section).toContain('| Policy actions the rules refused | fail | 1 | at most 0 |');
  });
});
