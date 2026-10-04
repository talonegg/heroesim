// A play sweep's JSON report (v1.1.6-S2, DL-186 item 13), written beside its Markdown report: what the
// sweep played (seeds, years, content, config and policy), its fingerprint, each game's line, its
// timings and its totals (`sweepTotals`, S1's one fold), so that the Gate is checked over data
// (`gate.ts`) and two runs are compared by machine (`compareRuns`) rather than by eye.
//
// A number JSON cannot hold (`NaN`, as an empty series' mean is, or an infinity) is written as its name
// in a string and read back as the number, so the report reads back as it was written.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EndingReason, GameConfig } from '@heroesim/engine';
import type { GateResult } from './gate.js';
import type { PolicyConfig } from './policy.js';
import { fixed, whole, type Machine } from './report.js';
import type { ProfileName } from './settings.js';
import type { Summary } from './stats.js';
import { counterDeltas } from './module-report.js';
import { sweepFingerprint, sweepTotals, type PlaySweep, type SweepTotals } from './sweep.js';

/** The report's format: raised when its shape changes, so a reader refuses a report it cannot read. */
export const runReportFormat = 1;

/** One game of the sweep, as its record ended. */
export interface GameLine {
  seed: string;
  /** Its last save's SHA-256 (`DocumentMeasures.fingerprint`). */
  fingerprint: string;
  serialisedLength: number;
  turnsPlayed: number;
  ranFullLength: boolean;
  /** How the player's game ended; `null` when it ran its full length. */
  ending: EndingReason | null;
  roundTrips: boolean;
  /** The validator refused it. */
  invalid: boolean;
  /** A harness assertion stopped it. */
  stopped: boolean;
  /** Policy actions the rules refused. */
  refusals: number;
}

/** A play sweep's JSON report. */
export interface RunReport {
  format: typeof runReportFormat;
  /** The report's name, as its Markdown's: `m9-v116-s3`. */
  milestone: string;
  profile: ProfileName | null;
  /** When the run began, as an ISO 8601 instant. */
  startedAt: string;
  /** The `HEROESIM_*` variables the run was given, as `NAME=value`. */
  settings: string[];
  machine: Machine;
  seeds: string[];
  years: number;
  workers: number;
  validated: boolean;
  content: { id: string; version: number; drafted: string[] };
  /** The config played, every key. */
  config: GameConfig;
  /** The config values played in place of the defaults (`HEROESIM_CONFIG`). */
  configured: Partial<GameConfig>;
  /** The automatic policy played, every key. */
  policy: PolicyConfig;
  /** The policy's values played in place of its defaults (`HEROESIM_POLICY`). */
  policyChanged: Partial<PolicyConfig>;
  modules: string[];
  /** The fingerprint of every seed's last save (`sweepFingerprint`). */
  fingerprint: string;
  replay: { seed: string; identical: boolean; length: number } | null;
  games: GameLine[];
  timings: { totalMs: number; gamesMs: number; advance: Summary; replayAdvance: Summary | null; validation: Summary };
  totals: SweepTotals;
  /** The Gate's lines, when the run was checked against `harness/gate.json`. */
  gate: GateResult | null;
}

export interface RunReportContext {
  milestone: string;
  profile?: ProfileName | null;
  startedAt: Date;
  settings?: readonly string[];
  machine: Machine;
  config: GameConfig;
  content: { id: string; version: number };
  drafted?: readonly string[];
  configured?: Partial<GameConfig>;
  policyChanged?: Partial<PolicyConfig>;
  modules?: readonly string[];
}

/** `sweep` as its JSON report, unchecked against the Gate (`gate` `null`). */
export function runReport(sweep: PlaySweep, context: RunReportContext): RunReport {
  const { milestone, profile = null, startedAt, settings = [], machine, config, content, drafted = [], configured = {}, policyChanged = {}, modules = [] } = context;
  return {
    format: runReportFormat,
    milestone,
    profile,
    startedAt: startedAt.toISOString(),
    settings: [...settings],
    machine,
    seeds: [...sweep.seeds],
    years: sweep.years,
    workers: sweep.workers,
    validated: sweep.validated,
    content: { id: content.id, version: content.version, drafted: [...drafted] },
    config,
    configured,
    policy: { ...sweep.policy },
    policyChanged,
    modules: [...modules],
    fingerprint: sweepFingerprint(sweep.games),
    replay: sweep.replay === null ? null : { seed: sweep.replay.seed, identical: sweep.replay.identical, length: sweep.replay.length },
    games: sweep.games.map((game) => ({
      seed: game.seed,
      fingerprint: game.measures.fingerprint,
      serialisedLength: game.measures.serialisedLength,
      turnsPlayed: game.turnsPlayed,
      ranFullLength: game.ranFullLength,
      ending: game.counters.ending,
      roundTrips: game.measures.roundTrips,
      invalid: game.invalid !== null,
      stopped: game.assertion !== null,
      refusals: game.refusals.length,
    })),
    timings: { totalMs: sweep.totalMs, gamesMs: sweep.gamesMs, advance: sweep.advance, replayAdvance: sweep.replay?.advance ?? null, validation: sweep.validation },
    totals: sweepTotals(sweep, config.turnsPerYear),
    gate: null,
  };
}

/** A number JSON cannot hold, written as its name: `NaN`, `Infinity`, `-Infinity`. */
const unwritable: ReadonlySet<string> = new Set(['NaN', 'Infinity', '-Infinity']);

/** `report` as JSON text, two-space indented, a number JSON cannot hold written as its name. */
export function runReportJson(report: RunReport): string {
  return `${JSON.stringify(report, (_, value: unknown) => (typeof value === 'number' && !Number.isFinite(value) ? String(value) : value), 2)}\n`;
}

/**
 * The report `text` holds, a number written as its name read back as the number. Throws on text that is
 * not a run report of this format.
 */
export function parseRunReport(text: string, source = 'the report'): RunReport {
  const parsed: unknown = JSON.parse(text, (_, value: unknown) => (typeof value === 'string' && unwritable.has(value) ? Number(value) : value));
  if (typeof parsed !== 'object' || parsed === null || (parsed as { format?: unknown }).format !== runReportFormat || !('totals' in parsed)) {
    throw new RangeError(`${source} is not a play sweep's JSON report of format ${runReportFormat}`);
  }
  return parsed as RunReport;
}

/** The JSON report's path beside the Markdown report at `markdown`: `m9-v116-s3-2026-10-05.json`. */
export function jsonPathOf(markdown: string): string {
  return markdown.replace(/\.md$/, '') + '.json';
}

/** Writes `report` to `path`, making its directory, and returns the path. */
export function writeRunReport(path: string, report: RunReport): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, runReportJson(report), 'utf8');
  return path;
}

/** The report at `path`: a JSON report, or the Markdown report a JSON report sits beside. */
export function readRunReport(path: string): RunReport {
  const json = path.endsWith('.md') ? jsonPathOf(path) : path;
  return parseRunReport(readFileSync(json, 'utf8'), json);
}

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * The command that commits a report, its Markdown and its JSON, force-added past `.gitignore`
 * (DL-186 item 28): a report a DL entry or a release's Gate cites is committed.
 */
export function addCommand(markdown: string): string {
  const path = (file: string): string => relative(repositoryRoot, file).replaceAll('\\', '/');
  return `git add -f ${path(markdown)} ${path(jsonPathOf(markdown))}`;
}

// ── compare ──────────────────────────────────────────────────────────────────────────────────

/** The keys whose values differ between `a` and `b`, as `key: a → b`. */
function changedKeys(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
    .map((key) => `${key}: ${JSON.stringify(a[key]) ?? 'absent'} → ${JSON.stringify(b[key]) ?? 'absent'}`);
}

/** A counter's value, whole when it is. */
const valueOf = (n: number): string => (Number.isInteger(n) ? whole(n) : fixed(n, 3));

/**
 * What moved between two runs' reports, `a` then `b` (DL-186 item 13), as lines to print: what each
 * played; whether their fingerprints agree and, if not, the seeds whose last saves differ; the seeds,
 * years, content, config and policy where they differ; and every core counter that moved
 * (`counterDeltas`), with how many did not. Timings are not counters, and are left out.
 */
export function compareRuns(a: RunReport, b: RunReport): string[] {
  const played = (label: string, run: RunReport): string =>
    `${label}: ${run.milestone}, begun ${run.startedAt} · ${whole(run.seeds.length)} seeds × ${run.years} years · ` +
    `content ${run.content.id} ${run.content.version} · config version ${run.config.configVersion} · fingerprint ${run.fingerprint}`;
  const lines = [played('a', a), played('b', b), ''];

  if (a.fingerprint === b.fingerprint) {
    lines.push('Fingerprints: the same. Every seed played the same game.');
  } else {
    const before = new Map(a.games.map((game) => [game.seed, game.fingerprint]));
    const differ = b.games.filter((game) => before.has(game.seed) && before.get(game.seed) !== game.fingerprint).map((game) => game.seed);
    lines.push(`Fingerprints: different. The last saves of ${whole(differ.length)} of the ${whole(b.games.filter((game) => before.has(game.seed)).length)} seeds both played differ${differ.length === 0 ? '' : `: ${differ.join(', ')}`}.`);
  }
  const seedsOnly = (one: RunReport, other: RunReport): string[] => one.seeds.filter((seed) => !other.seeds.includes(seed));
  const onlyA = seedsOnly(a, b);
  const onlyB = seedsOnly(b, a);
  if (onlyA.length > 0 || onlyB.length > 0) lines.push(`Seeds: ${whole(onlyA.length)} only in a, ${whole(onlyB.length)} only in b.`);
  if (a.years !== b.years) lines.push(`Years: ${a.years} → ${b.years}.`);
  if (a.content.id !== b.content.id || a.content.version !== b.content.version || JSON.stringify(a.content.drafted) !== JSON.stringify(b.content.drafted)) {
    lines.push(`Content: ${a.content.id} ${a.content.version} [${a.content.drafted.join(', ')}] → ${b.content.id} ${b.content.version} [${b.content.drafted.join(', ')}].`);
  }
  for (const [what, changes] of [
    ['Config', changedKeys(a.config as unknown as Record<string, unknown>, b.config as unknown as Record<string, unknown>)],
    ['Policy', changedKeys(a.policy as unknown as Record<string, unknown>, b.policy as unknown as Record<string, unknown>)],
    ['Modules', a.modules.join(',') === b.modules.join(',') ? [] : [`${a.modules.join(', ') || 'none'} → ${b.modules.join(', ') || 'none'}`]],
  ] as const) {
    if (changes.length > 0) lines.push(`${what}: ${changes.join('; ')}.`);
  }

  const { moved, unchanged } = counterDeltas(a.totals, b.totals);
  lines.push('', `Counters: ${whole(moved.length)} moved, ${whole(unchanged)} the same.`);
  for (const delta of moved) {
    const change = delta.with - delta.without;
    lines.push(`  ${delta.counter}: ${valueOf(delta.without)} → ${valueOf(delta.with)} (${change > 0 ? '+' : '−'}${valueOf(Math.abs(change))})`);
  }
  return lines;
}
