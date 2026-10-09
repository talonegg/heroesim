// The harness's Gate (v1.1.6-S2, DL-186 items 13 and 21): `harness/gate.json` declares what a release's
// closing sweep must meet, line by line, and each line's source; `checkGate` checks a run's JSON report
// against it and gives each line's verdict, which a `gate` run prints and writes into its report. The
// estimate probe reads its two limits from the same file. The spec is data: its baselines change only
// with a DL entry.
//
// Its lines are of two kinds. The invariants hold on any run: no policy action refused, no game invalid,
// stopped, unfinished or failing its round trip, and the replay identical: one seed played once more,
// alone, its last save's length and fingerprint the same as its shard recorded (v1.1.6-S3, DL-189).
// The bands, the player's Bankruptcies, the save's gzipped mean and the per-Turn copy's share of a Turn, are
// set on the spec's run, 50 games of 20 years: on a run of another shape (the `neutral` profile's 10, a
// short trial) they read "not comparable", neither passing nor failing. The Traits a career and the
// save's uncompressed size are the report's to print, not the Gate's to hold (the owner's answers,
// DL-188). The copy's line holds the mean of the copy times the sweep took as each year ended over the
// mean of `advance`, within `growth` of its baseline share, a share so that the machine's speed cancels
// (the owner's answers, DL-203 answer 3 and DL-206 item 17); a run with no copy times or no `advance`
// times reads "not comparable".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixed, markdownTable, whole } from './report.js';
import type { RunReport } from './run-report.js';
import type { WorldYear } from './game-counters.js';

/** `harness/gate.json`. */
export const gatePath = fileURLToPath(new URL('../gate.json', import.meta.url));

/** A line held at most at `max`. */
export interface AtMost {
  max: number;
  source: string;
}

/** The spec: `harness/gate.json`'s shape. */
export interface GateSpec {
  /** Whether the spec binds: `drafted` until the owner approves it, then `approved` (DL-186 item 13). */
  status: 'drafted' | 'approved';
  /** The DL entry that set the spec as it stands. */
  decided: string;
  /** The release whose closing sweep the bands are read from. */
  baseline: { release: string; report: string; fingerprint: string; source: string };
  /** The run the bands are set on: a run of another shape reads them "not comparable". */
  run: { games: number; years: number; source: string };
  lines: {
    refusals: AtMost;
    invalid: AtMost;
    stopped: AtMost;
    unfinished: AtMost;
    roundTrips: AtMost;
    replay: { identical: true; source: string };
    playerBankruptcies: { max: number; baseline: number; source: string };
    saveGzipped: { meanMiB: number; baselineMeanMiB: number; baselineMaxMiB: number; source: string };
    /**
     * The per-Turn copy's share of a Turn: the mean time of `copyWorld` (timed as each year ended) over
     * the mean time of `advance`, at most `baselineShare × (1 + growth)`. A share, not milliseconds, so
     * the machine's speed cancels (DL-203, DL-206 item 17).
     */
    copyShare: { growth: number; baselineShare: number; source: string };
  };
  /** The estimate probe's two limits, in chance (`estimate.ts`), checked by `npm run harness -- estimate`. */
  estimate: { noOneFalls: { within: number; source: string }; moraleInQuest: { within: number; source: string } };
  notes: string[];
}

type Shape = 'number' | 'number or null' | 'string' | 'true' | readonly string[] | { readonly [key: string]: Shape } | 'strings';

const line = (fields: Record<string, Shape>): Record<string, Shape> => ({ ...fields, source: 'string' });
const atMost = line({ max: 'number' });

/** The spec's shape, key by key: a key missing or one not in it is a problem. */
const specShape: { readonly [key: string]: Shape } = {
  status: ['drafted', 'approved'],
  decided: 'string',
  baseline: line({ release: 'string', report: 'string', fingerprint: 'string' }),
  run: line({ games: 'number', years: 'number' }),
  lines: {
    refusals: atMost,
    invalid: atMost,
    stopped: atMost,
    unfinished: atMost,
    roundTrips: atMost,
    replay: line({ identical: 'true' }),
    playerBankruptcies: line({ max: 'number', baseline: 'number' }),
    saveGzipped: line({ meanMiB: 'number', baselineMeanMiB: 'number', baselineMaxMiB: 'number' }),
    copyShare: line({ growth: 'number', baselineShare: 'number' }),
  },
  estimate: { noOneFalls: line({ within: 'number' }), moraleInQuest: line({ within: 'number' }) },
  notes: 'strings',
};

/** What is wrong with `value` against `shape`, each problem by its path. */
function shapeProblems(value: unknown, shape: Shape, path: string): string[] {
  if (shape === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? [] : [`${path} is a number from 0, not ${JSON.stringify(value)}`];
  if (shape === 'number or null') return value === null ? [] : shapeProblems(value, 'number', path).map((problem) => problem.replace(' is a number from 0,', ' is a number from 0 or null,'));
  if (shape === 'string') return typeof value === 'string' && value.trim() !== '' ? [] : [`${path} is a text, not ${JSON.stringify(value)}`];
  if (shape === 'true') return value === true ? [] : [`${path} is true, not ${JSON.stringify(value)}`];
  if (shape === 'strings') return Array.isArray(value) && value.every((it) => typeof it === 'string') ? [] : [`${path} is a list of texts`];
  if (Array.isArray(shape)) return shape.includes(value as string) ? [] : [`${path} is one of ${shape.join(', ')}, not ${JSON.stringify(value)}`];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path} is an object`];
  const fields = shape as { readonly [key: string]: Shape };
  return [
    ...Object.keys(value).filter((key) => !Object.hasOwn(fields, key)).map((key) => `${path}.${key} is not a line of the spec`),
    ...Object.entries(fields).flatMap(([key, inner]) =>
      Object.hasOwn(value, key) ? shapeProblems((value as Record<string, unknown>)[key], inner, `${path}.${key}`) : [`${path}.${key} is missing`],
    ),
  ];
}

/** What is wrong with `value` as a Gate spec: its shape, a fingerprint not one, a limit not a chance. */
export function gateSpecProblems(value: unknown): string[] {
  const problems = shapeProblems(value, specShape, 'gate');
  if (problems.length > 0) return problems;
  const spec = value as GateSpec;
  return [
    ...(/^[0-9a-f]{64}$/.test(spec.baseline.fingerprint) ? [] : ['gate.baseline.fingerprint is 64 hexadecimal digits']),
    ...(spec.estimate.noOneFalls.within >= 1 || spec.estimate.moraleInQuest.within >= 1 ? ['gate.estimate: a limit is a chance, below 1'] : []),
  ];
}

/** The spec in `text`; throws listing every problem. */
export function parseGateSpec(text: string, source = 'harness/gate.json'): GateSpec {
  const value: unknown = JSON.parse(text);
  const problems = gateSpecProblems(value);
  if (problems.length > 0) throw new RangeError(`${source}: ${problems.join('; ')}`);
  return value as GateSpec;
}

/** The spec at `path`, `harness/gate.json` unless given. */
export function readGateSpec(path: string = gatePath): GateSpec {
  return parseGateSpec(readFileSync(path, 'utf8'), path);
}

export type Verdict = 'pass' | 'fail' | 'not comparable';

/** One line of the Gate, checked. */
export interface GateLine {
  line: string;
  verdict: Verdict;
  measured: string;
  limit: string;
  source: string;
}

export interface GateResult {
  /** No line failed. */
  pass: boolean;
  status: GateSpec['status'];
  lines: GateLine[];
}

const mebibyte = 1024 * 1024;
const yearsOf = (n: number): string => `${n} ${n === 1 ? 'year' : 'years'}`;
const mean = (values: readonly number[]): number => (values.length === 0 ? Number.NaN : values.reduce((sum, n) => sum + n, 0) / values.length);

/** A number as `fixed` printed it, read back. */
const shownAs = (text: string): number => Number(text.replaceAll(',', ''));

/** The copy's limit to the fewest places, from 3, that print it as it is applied: `0.31625`, not `0.316` (DL-207). */
function limitText(most: number): string {
  for (let digits = 3; digits <= 12; digits += 1) {
    const text = fixed(most, digits);
    if (Math.abs(shownAs(text) - most) <= 1e-12) return text;
  }
  return String(most);
}

/**
 * A share to the fewest places, from 4, at which it reads as it was judged against the limit printed,
 * `limit`: a failing share above it, a passing one at or under it, so that no failing share prints as
 * its limit (DL-207).
 */
function shareText(share: number, most: number, limit: string): string {
  const pass = share <= most;
  for (let digits = 4; digits <= 12; digits += 1) {
    const text = fixed(share, digits);
    if ((shownAs(text) <= shownAs(limit)) === pass) return text;
  }
  return String(share);
}

/** Every copy timed as the years ended, over the games: the per-Turn copy's time (v1.1.6-S17, DL-203). */
export function copyTimes(worlds: readonly WorldYear[]): number[] {
  return worlds.flatMap((year) => year.copyMs);
}

/**
 * `run` checked against `spec`, line by line, and its fingerprint against `expect` when given (the
 * `neutral` profile's `--expect`). An invariant passes or fails; a band reads "not comparable" on a run
 * of another shape than the spec's; the run passes when no line fails.
 */
export function checkGate(spec: GateSpec, run: RunReport, expect: string | null = null): GateResult {
  const { lines } = spec;
  const { totals, games } = run;
  const checked: GateLine[] = [];
  const add = (label: string, pass: boolean, measured: string, limit: string, source: string): void => {
    checked.push({ line: label, verdict: pass ? 'pass' : 'fail', measured, limit, source });
  };
  const atMostLine = (label: string, n: number, held: AtMost, measured = whole(n)): void => add(label, n <= held.max, measured, `at most ${whole(held.max)}`, held.source);

  if (expect !== null) add("The fingerprint of every seed's last save", run.fingerprint === expect, run.fingerprint, `--expect ${expect}`, 'the run, a play-neutral story playing the games it played before');
  atMostLine('Policy actions the rules refused', totals.refusals, lines.refusals);
  atMostLine('Games the validator refused', totals.invalidGames, lines.invalid, run.validated ? whole(totals.invalidGames) : `${whole(totals.invalidGames)} (not validated after every advance)`);
  atMostLine('Games a harness assertion stopped', totals.assertionGames, lines.stopped);
  atMostLine('Games neither ended nor played to their last Turn', games.filter((game) => game.ending === null && !game.ranFullLength).length, lines.unfinished);
  atMostLine('Saves that fail their round trip', games.filter((game) => !game.roundTrips).length, lines.roundTrips);
  add(
    'One seed replayed alone, its last save the same as its shard recorded',
    run.replay?.identical === true,
    run.replay === null ? 'not replayed' : `\`${run.replay.seed}\`: ${run.replay.identical ? 'identical' : 'DIFFERENT'}`,
    'identical',
    lines.replay.source,
  );

  const comparable = games.length === spec.run.games && run.years === spec.run.years;
  const band = (label: string, limit: string, source: string, check: () => { pass: boolean; measured: string }): void => {
    if (!comparable) {
      checked.push({ line: label, verdict: 'not comparable', measured: `this run played ${whole(games.length)} games of ${yearsOf(run.years)}`, limit, source });
    } else {
      const { pass, measured } = check();
      add(label, pass, measured, limit, source);
    }
  };
  const { playerBankruptcies, saveGzipped, copyShare } = lines;
  band("The player's Bankruptcies", `at most ${whole(playerBankruptcies.max)} of ${whole(spec.run.games)}`, playerBankruptcies.source, () => {
    const bankrupt = totals.endings['bankruptcy'] ?? 0;
    return { pass: bankrupt <= playerBankruptcies.max, measured: `${whole(bankrupt)} of ${whole(games.length)}` };
  });
  const last = totals.saves[spec.run.years - 1];
  band(`The save after ${yearsOf(spec.run.years)}, gzipped`, `mean under ${fixed(saveGzipped.meanMiB, 2)} MiB`, saveGzipped.source, () => {
    const gzipped = last?.gzipped ?? [];
    const meanMiB = mean(gzipped) / mebibyte;
    return { pass: meanMiB < saveGzipped.meanMiB, measured: `mean ${fixed(meanMiB, 2)} MiB, max ${fixed(Math.max(...gzipped) / mebibyte, 2)} MiB, over ${whole(gzipped.length)} games` };
  });
  // A run with no copy times, or no `advance` mean above 0, has no share to read: the line names the half
  // missing and prints the half measured (DL-207).
  const copies = copyTimes(totals.worlds ?? []);
  const copyMean = mean(copies);
  const copied = copies.length === 0 ? null : `copy mean ${fixed(copyMean, 3)} ms over ${whole(copies.length)} copies`;
  const advance = run.timings.advance;
  const advanced = advance.count > 0 && Number.isFinite(advance.mean) ? `advance mean ${fixed(advance.mean, 3)} ms` : null;
  const copyLine = "The per-Turn copy's share of a Turn";
  const most = copyShare.baselineShare * (1 + copyShare.growth);
  const mostText = limitText(most);
  const copyLimit = `share at most ${mostText} (${fixed(copyShare.baselineShare, 3)} + ${fixed(copyShare.growth * 100, 0)}%)`;
  const unread =
    copied === null
      ? advanced === null
        ? 'copy and advance times not measured'
        : `copy times not measured; ${advanced}`
      : advanced === null
        ? `advance times not measured; ${copied}`
        : advance.mean <= 0
          ? `${advanced}, no share to read; ${copied}`
          : null;
  if (unread !== null) {
    checked.push({ line: copyLine, verdict: 'not comparable', measured: unread, limit: copyLimit, source: copyShare.source });
  } else {
    const share = copyMean / advance.mean;
    band(copyLine, copyLimit, copyShare.source, () => ({
      pass: share <= most,
      measured: `share ${shareText(share, most, mostText)}: ${copied}, ${advanced}`,
    }));
  }
  return { pass: checked.every((it) => it.verdict !== 'fail'), status: spec.status, lines: checked };
}

/** The spec's state, as a heading reads it. */
const statusText = (status: GateSpec['status']): string => (status === 'approved' ? 'approved' : "drafted, awaiting the owner's approval");

/** The result as lines to print, one a Gate line, then the verdict. */
export function gatePrinted(result: GateResult): string[] {
  const width = Math.max(...result.lines.map((it) => it.verdict.length));
  return [
    `The Gate (harness/gate.json, ${statusText(result.status)}):`,
    ...result.lines.map((it) => `  ${it.verdict.toUpperCase().padEnd(width)}  ${it.line}: ${it.measured} (${it.limit})`),
    `The Gate: ${result.pass ? 'PASS' : 'FAIL'}`,
  ];
}

/** The result as the Markdown report's section. */
export function gateSection(result: GateResult): string[] {
  return [
    '## The Gate',
    '',
    `Checked against \`harness/gate.json\` (${statusText(result.status)}), line by line: **${result.pass ? 'pass' : 'fail'}**. ` +
      'A band set on the spec\'s run reads "not comparable" on a run of another shape.',
    '',
    markdownTable(
      ['Line', 'Verdict', 'Measured', 'Limit', 'Source'],
      result.lines.map((it) => [it.line, it.verdict, it.measured, it.limit, it.source]),
    ),
    '',
  ];
}
