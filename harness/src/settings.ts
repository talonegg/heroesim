// A harness run's settings (v1.1.6-S2, DL-186 item 13): every `HEROESIM_*` variable a run reads,
// parsed here and nowhere else, each bad value refused by its name, so a mistyped value fails the run
// rather than playing something else. Which run plays is decided here too: a probe, a module run or
// the milestone's, with the profile and the defaults of each (`profiles`).
//
// `HEROESIM_SEEDS` means four things, named apart in the settings: the worlds a creation sweep creates
// (`worlds`), the games a play sweep, a module run or the Succession probe plays (`games`), the seeds
// each of the estimate's samples is resolved for (`resolutions`), and the seeds of each of the
// calibration's spot-check samples (`spotSeeds`).
//
// The command line (`npm run harness -- gate <milestone>`, `harness/src/main.ts`) reaches a run through
// these variables too: a profile through `HEROESIM_PROFILE`, a probe through `HEROESIM_PROBE`.
//
// The harness may read the environment: it is not the engine (ADR-0001 binds the engine only).

import { availableParallelism } from 'node:os';
import { configProblems, defaultConfig, type GameConfig } from '@heroesim/engine';
import { defaultCalibration } from './calibrate.js';
import { defaultEstimateRuns, defaultEstimateSamples } from './estimate.js';
import { defaultModuleSeedCount, harnessModules } from './modules.js';
import { defaultYears } from './play.js';
import { defaultPolicyConfig, type PolicyConfig } from './policy.js';
import { defaultProbeSeedCount, defaultProbeYears } from './succession.js';

/** The environment a run's settings are read from: `process.env`, or a test's own. */
export type Env = Readonly<Record<string, string | undefined>>;

/** The probes, by the name `HEROESIM_PROBE` gives, each run in place of the milestone's runs. */
export const probeNames = ['succession', 'estimate', 'calibrate'] as const;
export type ProbeName = (typeof probeNames)[number];

/**
 * The named play sweeps (DL-186 items 13 and 30), by the name `HEROESIM_PROFILE` or the command line
 * gives: `gate`, a release's Gate, and `neutral`, the proof a play-neutral story plays the same games.
 */
export const profileNames = ['gate', 'neutral'] as const;
export type ProfileName = (typeof profileNames)[number];

/**
 * Each run's own values when no variable sets them. The milestone's run plays on half the logical
 * processors (`null`); the profiles on 8, the most a 27.6 GB machine holds of 20-year games (DL-174).
 * A variable set overrides its profile's value.
 */
export const profiles = Object.freeze({
  /** INPUTS 4.13: 1,000 worlds created (M1-S10) and 200 games of 20 years (DL-34 item 7). */
  milestone: { worlds: 1000, games: 200, years: defaultYears, workers: null },
  /** A release's Gate (DL-186 item 13): 50 games of 20 years in 8 processes, the replay played. */
  gate: { games: 50, years: defaultYears, workers: 8 },
  /** A play-neutral story's proof (DL-186 item 30): 10 games of 20 years in 8 processes, about 7 minutes. */
  neutral: { games: 10, years: defaultYears, workers: 8 },
  /** M8-S3 (DL-78): 50 games, each with the modules and with none. */
  modules: { games: defaultModuleSeedCount, workers: null },
  /** M9-F1 (DL-113 item 7): 50 games of 12 years. */
  succession: { games: defaultProbeSeedCount, years: defaultProbeYears, workers: null },
  /** v1.1.4-S5 (DL-156): 200 Parties and Quests, each resolved for 20,000 seeds. */
  estimate: { samples: defaultEstimateSamples, resolutions: defaultEstimateRuns },
  /** v1.1.4-S9 (DL-162): 120 random Parties a cell, and 4,000 seeds a spot-check sample. */
  calibrate: { parties: defaultCalibration.parties, spotSeeds: defaultCalibration.spotSeeds },
});

/** The milestone's runs: the creation sweep and the play sweep, or the play sweep alone under a profile. */
export interface MilestoneSettings {
  run: 'milestone';
  /** `HEROESIM_PROFILE`: the named sweep this is, which plays the play sweep alone; `null` for none. */
  profile: ProfileName | null;
  /** `HEROESIM_MILESTONE`: the report's name, `m8` unless set. */
  milestone: string;
  /** `HEROESIM_EXPECT`: the fingerprint the run must play, for a play-neutral story; `null` for none. */
  expect: string | null;
  /** `HEROESIM_SEEDS`, as the creation sweep reads it: the worlds it creates. */
  worlds: number;
  /** `HEROESIM_SEEDS`, as the play sweep reads it: the games it plays. */
  games: number;
  /** `HEROESIM_YEARS`: the years each game is played unless it ends first. */
  years: number;
  /** `HEROESIM_WORKERS`: the child processes, at most that many at once. */
  workers: number;
  /** `HEROESIM_VALIDATE`: validate after every `advance`. */
  validate: boolean;
  /** `HEROESIM_REPLAY`: replay one seed after the sweep. */
  replay: boolean;
  /** `HEROESIM_DRAFTS`: a directory of draft content files played in place of the core's; `null` for none. */
  drafts: string | null;
  /** `HEROESIM_CONFIG`: config values played in place of `defaultConfig`'s. */
  config: Partial<GameConfig>;
  /** `HEROESIM_POLICY`: the automatic policy's values played in place of `defaultPolicyConfig`'s. */
  policy: Partial<PolicyConfig>;
}

/** M8-S3's module run (DL-78): the games played with the modules installed and with none. */
export interface ModulesSettings {
  run: 'modules';
  /** `HEROESIM_MODULES`: the modules installed, by id, in the order their hooks run. */
  modules: string[];
  /** `HEROESIM_SEEDS`: the games played, each twice. */
  games: number;
  workers: number;
  validate: boolean;
}

/** M9-F1's Succession probe (DL-113 item 7). */
export interface SuccessionSettings {
  run: 'succession';
  /** `HEROESIM_SEEDS`: the games played. */
  games: number;
  years: number;
  workers: number;
  validate: boolean;
}

/** v1.1.4-S5's estimate probe (DL-156). */
export interface EstimateSettings {
  run: 'estimate';
  /** `HEROESIM_MILESTONE`: the report's name, `m9-estimate` unless set. */
  milestone: string;
  /** `HEROESIM_SAMPLES`: the Parties and Quests drawn. */
  samples: number;
  /** `HEROESIM_SEEDS`, as the estimate reads it: the seeds each sample is resolved for. */
  resolutions: number;
}

/** v1.1.4-S9's calibration (DL-162). */
export interface CalibrateSettings {
  run: 'calibrate';
  /** `HEROESIM_DRAFTS`: the draft directory calibrated; `null`, unset, blank or `none`, the content alone (v1.1.4-S14). */
  drafts: string | null;
  config: Partial<GameConfig>;
  /** `HEROESIM_PARTIES`: random Parties a cell. */
  parties: number;
  /** `HEROESIM_SEEDS`, as the calibration reads it: the seeds of each spot-check sample. */
  spotSeeds: number;
  /** `HEROESIM_TUNE`: the chance every Check of the drafts is tuned to first; `null` for no tuning. */
  tune: number | null;
  /** `HEROESIM_FLAT`: the share of each tuned target put in the Check's flat term. */
  flat: number;
  /** `HEROESIM_CALIBRATION_OUT`: where the calibration is written; `null` for beside the drafts' directory. */
  out: string | null;
}

export type RunSettings = MilestoneSettings | ModulesSettings | SuccessionSettings | EstimateSettings | CalibrateSettings;
export type RunKind = RunSettings['run'];

/**
 * Every variable a harness run reads, and the runs that read it: the list a variable is checked
 * against, and the harness's documentation of them (INPUTS §9).
 */
export const variables: Readonly<Record<string, { readBy: readonly (RunKind | 'vitest')[]; means: string }>> = Object.freeze({
  HEROESIM_HARNESS: { readBy: ['vitest'], means: 'set by `npm run harness`: the harness-run Vitest project exists (vitest.config.ts)' },
  HEROESIM_PROFILE: { readBy: ['milestone'], means: '`gate` or `neutral`: a named play sweep, its own seeds, years and processes' },
  HEROESIM_PROBE: { readBy: ['succession', 'estimate', 'calibrate'], means: 'a probe run in place of the milestone\'s runs' },
  HEROESIM_MODULES: { readBy: ['modules'], means: 'module ids, comma-separated: a module run in place of the milestone\'s runs' },
  HEROESIM_MILESTONE: { readBy: ['milestone', 'estimate'], means: "the report's name, `m<n>` or `m<n>-<name>`" },
  HEROESIM_EXPECT: { readBy: ['milestone'], means: "the fingerprint of every seed's last save the run must play" },
  HEROESIM_SEEDS: { readBy: ['milestone', 'modules', 'succession', 'estimate', 'calibrate'], means: 'worlds, games, resolutions or spot-check seeds, by the run' },
  HEROESIM_YEARS: { readBy: ['milestone', 'succession'], means: 'the years each game is played unless it ends first' },
  HEROESIM_WORKERS: { readBy: ['milestone', 'modules', 'succession'], means: 'the child processes a sweep plays in, at most that many at once' },
  HEROESIM_VALIDATE: { readBy: ['milestone', 'modules', 'succession'], means: '1 or 0: validate after every advance' },
  HEROESIM_REPLAY: { readBy: ['milestone'], means: "1 or 0: replay one seed once, alone, after the play sweep, and compare its last save with its shard's record" },
  HEROESIM_DRAFTS: { readBy: ['milestone', 'calibrate'], means: 'a directory of draft content files, each in place of the core file of its name' },
  HEROESIM_CONFIG: { readBy: ['milestone', 'calibrate'], means: 'a JSON object of config values played in place of the defaults' },
  HEROESIM_POLICY: { readBy: ['milestone'], means: "a JSON object of the automatic policy's values played in place of its defaults" },
  HEROESIM_SAMPLES: { readBy: ['estimate'], means: 'the Parties and Quests the estimate draws' },
  HEROESIM_PARTIES: { readBy: ['calibrate'], means: 'random Parties a calibration cell' },
  HEROESIM_TUNE: { readBy: ['calibrate'], means: "a chance from 0 to 1: tune the drafts' Checks to it first" },
  HEROESIM_FLAT: { readBy: ['calibrate'], means: "a share from 0 to below 1 of each tuned target in the Check's flat term" },
  HEROESIM_CALIBRATION_OUT: { readBy: ['calibrate'], means: 'where the calibration is written' },
});

/** Variables of the same prefix that other packages read, which a harness run leaves alone (INPUTS §9). */
const elsewhere: readonly string[] = ['HEROESIM_SAVE_DIR', 'HEROESIM_LIVE_URL', 'HEROESIM_DEPLOY_RECORD', 'HEROESIM_OWNER_PICTURES'];

/** `value` trimmed, or `null` when unset or blank. */
function given(env: Env, name: string): string | null {
  const value = env[name]?.trim() ?? '';
  return value === '' ? null : value;
}

/** A whole number from 1, or `fallback` when unset or blank. */
function count(env: Env, name: string, fallback: number): number {
  const value = given(env, name);
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError(`${name} must be a whole number from 1, not ${JSON.stringify(env[name])}`);
  return n;
}

/** `1` or `true`, `0` or `false`, whatever its case; `fallback` when unset or blank. */
function flag(env: Env, name: string, fallback: boolean): boolean {
  const value = given(env, name)?.toLowerCase() ?? null;
  if (value === null) return fallback;
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  throw new RangeError(`${name} is 1 or 0, not ${JSON.stringify(env[name])}`);
}

/** One of `names`, whatever its case; `null` when unset or blank. */
function oneOf<Name extends string>(env: Env, name: string, names: readonly Name[]): Name | null {
  const value = given(env, name)?.toLowerCase() ?? null;
  if (value === null) return null;
  const known = names.find((it) => it === value);
  if (known === undefined) throw new RangeError(`${name} names one of ${names.join(', ')}, not ${JSON.stringify(env[name])}`);
  return known;
}

/** A report's name, `m<n>` or `m<n>-<name>` (`reportPath`); `fallback` when unset or blank. */
function milestoneOf(env: Env, fallback: string): string {
  const value = given(env, 'HEROESIM_MILESTONE');
  if (value === null) return fallback;
  if (!/^m\d+(?:-[a-z0-9]+)*$/.test(value)) throw new RangeError(`HEROESIM_MILESTONE is m<n>, or m<n>-<name>, not ${JSON.stringify(env['HEROESIM_MILESTONE'])}`);
  return value;
}

/** A number within `within`, which `rule` states; `fallback` when unset or blank. */
function numberOf(env: Env, name: string, rule: string, within: (n: number) => boolean, fallback: number | null): number | null {
  const value = given(env, name);
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !within(n)) throw new RangeError(`${name} is ${rule}, not ${JSON.stringify(env[name])}`);
  return n;
}

/** A JSON object, or `{}` when unset or blank; `what` names what its keys are. */
function jsonObject(env: Env, name: string, what: string): Record<string, unknown> {
  const value = given(env, name);
  if (value === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RangeError(`${name} is ${JSON.stringify(env[name])}; expected a JSON object of ${what}`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * `HEROESIM_CONFIG` (v1.1.4-S9's verification, DL-162): config values for trials of what a tuning step
 * would set, so that none is changed in engine/src/config.ts to try it. Refuses a key that is not a
 * config key, and a config the Quest Engine would refuse (`configProblems`).
 */
function configOf(env: Env): Partial<GameConfig> {
  const changes = jsonObject(env, 'HEROESIM_CONFIG', 'config keys');
  const unknown = Object.keys(changes).filter((key) => !Object.hasOwn(defaultConfig, key));
  if (unknown.length > 0) throw new RangeError(unknown.map((key) => `HEROESIM_CONFIG: "${key}" is not a config key`).join('; '));
  const problems = configProblems({ ...defaultConfig, ...(changes as Partial<GameConfig>) });
  if (problems.length > 0) throw new RangeError(problems.map((problem) => `HEROESIM_CONFIG: ${problem}`).join('; '));
  return changes as Partial<GameConfig>;
}

/** The policy's values that count things, and so are whole numbers. */
const wholePolicyKeys: ReadonlySet<string> = new Set<keyof PolicyConfig>(['rosterLimit', 'consumableStock']);

/**
 * `HEROESIM_POLICY` (DL-186 item 13): the automatic policy's values played in place of its defaults, as
 * `HEROESIM_CONFIG` plays the config's. Refuses a key that is not the policy's, and a value that is not
 * a number from 0, or not whole where the policy counts.
 */
function policyOf(env: Env): Partial<PolicyConfig> {
  const changes = jsonObject(env, 'HEROESIM_POLICY', "the automatic policy's keys");
  const problems = Object.entries(changes).flatMap(([key, value]) => {
    if (!Object.hasOwn(defaultPolicyConfig, key)) return [`"${key}" is not a policy key (${Object.keys(defaultPolicyConfig).join(', ')})`];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return [`${key} is ${JSON.stringify(value)}; it is a number from 0`];
    if (wholePolicyKeys.has(key) && !Number.isSafeInteger(value)) return [`${key} is ${value}; it is a whole number`];
    return [];
  });
  if (problems.length > 0) throw new RangeError(problems.map((problem) => `HEROESIM_POLICY: ${problem}`).join('; '));
  return changes as Partial<PolicyConfig>;
}

/**
 * `HEROESIM_MODULES` (M8-S3, DL-78): module ids, comma-separated, in the order their hooks run; none
 * when unset or blank. Refuses an id the harness does not know, an empty one or one named twice.
 */
function modulesOf(env: Env): string[] {
  const value = given(env, 'HEROESIM_MODULES');
  if (value === null) return [];
  const ids = value.split(',').map((id) => id.trim());
  const known = Object.keys(harnessModules).join(', ');
  for (const id of ids) {
    if (!Object.hasOwn(harnessModules, id)) throw new RangeError(`HEROESIM_MODULES names ${JSON.stringify(id)}, which is not a harness module (${known})`);
  }
  if (new Set(ids).size !== ids.length) throw new RangeError(`HEROESIM_MODULES names a module twice: ${JSON.stringify(env['HEROESIM_MODULES'])}`);
  return ids;
}

/** `HEROESIM_EXPECT`: a sweep's fingerprint, 64 hexadecimal digits; `null` when unset or blank. */
function expectedOf(env: Env): string | null {
  const value = given(env, 'HEROESIM_EXPECT')?.toLowerCase() ?? null;
  if (value === null) return null;
  if (!/^[0-9a-f]{64}$/.test(value)) throw new RangeError(`HEROESIM_EXPECT is a fingerprint of 64 hexadecimal digits, not ${JSON.stringify(env['HEROESIM_EXPECT'])}`);
  return value;
}

/** Half the logical processors, one a core with SMT: a sweep's processes when no profile or variable sets them (v1.1.4-S10). */
export function halfTheProcessors(): number {
  return Math.max(1, Math.floor(availableParallelism() / 2));
}

/** `HEROESIM_WORKERS`, or the profile's, or half the logical processors. */
function workersOf(env: Env, profile: number | null): number {
  return count(env, 'HEROESIM_WORKERS', profile ?? halfTheProcessors());
}

/**
 * The run `env` asks for, with its settings. Throws a `RangeError` naming the variable on a bad value
 * and on a `HEROESIM_*` variable the harness does not know, so that a mistyped name fails the run rather
 * than being ignored; on a profile with a probe or modules, which play other runs; and on
 * `HEROESIM_TUNE` without `HEROESIM_DRAFTS` (v1.1.4-S14: tuning writes the drafts' files, never the
 * content's).
 */
export function runSettings(env: Env = process.env): RunSettings {
  const unknown = Object.keys(env).filter((name) => name.startsWith('HEROESIM_') && !Object.hasOwn(variables, name) && !elsewhere.includes(name));
  if (unknown.length > 0) {
    throw new RangeError(`${unknown.join(', ')}: not a harness setting; the harness reads ${Object.keys(variables).join(', ')}`);
  }

  const probe = oneOf(env, 'HEROESIM_PROBE', probeNames);
  const modules = modulesOf(env);
  const profile = oneOf(env, 'HEROESIM_PROFILE', profileNames);
  if (profile !== null && (probe !== null || modules.length > 0)) {
    throw new RangeError(`HEROESIM_PROFILE ${profile} plays the milestone's play sweep; it cannot be set with ${probe === null ? 'HEROESIM_MODULES' : 'HEROESIM_PROBE'}`);
  }
  const validate = flag(env, 'HEROESIM_VALIDATE', false);

  if (probe === 'succession') {
    const own = profiles.succession;
    return { run: 'succession', games: count(env, 'HEROESIM_SEEDS', own.games), years: count(env, 'HEROESIM_YEARS', own.years), workers: workersOf(env, own.workers), validate };
  }
  if (probe === 'estimate') {
    const own = profiles.estimate;
    return { run: 'estimate', milestone: milestoneOf(env, 'm9-estimate'), samples: count(env, 'HEROESIM_SAMPLES', own.samples), resolutions: count(env, 'HEROESIM_SEEDS', own.resolutions) };
  }
  if (probe === 'calibrate') {
    const own = profiles.calibrate;
    const named = given(env, 'HEROESIM_DRAFTS');
    const drafts = named === null || named === 'none' ? null : named;
    const tune = numberOf(env, 'HEROESIM_TUNE', 'a chance between 0 and 1', (n) => n > 0 && n < 1, null);
    if (tune !== null && drafts === null) throw new RangeError('HEROESIM_TUNE tunes the drafts: name them with HEROESIM_DRAFTS');
    return {
      run: 'calibrate',
      drafts,
      config: configOf(env),
      parties: count(env, 'HEROESIM_PARTIES', own.parties),
      spotSeeds: count(env, 'HEROESIM_SEEDS', own.spotSeeds),
      tune,
      flat: numberOf(env, 'HEROESIM_FLAT', 'a share from 0 to below 1', (n) => n >= 0 && n < 1, 0) ?? 0,
      out: given(env, 'HEROESIM_CALIBRATION_OUT'),
    };
  }
  if (modules.length > 0) {
    const own = profiles.modules;
    return { run: 'modules', modules, games: count(env, 'HEROESIM_SEEDS', own.games), workers: workersOf(env, own.workers), validate };
  }

  const own = profile === null ? profiles.milestone : profiles[profile];
  return {
    run: 'milestone',
    profile,
    milestone: milestoneOf(env, 'm8'),
    expect: expectedOf(env),
    worlds: count(env, 'HEROESIM_SEEDS', profiles.milestone.worlds),
    games: count(env, 'HEROESIM_SEEDS', own.games),
    years: count(env, 'HEROESIM_YEARS', own.years),
    workers: workersOf(env, own.workers),
    validate,
    replay: flag(env, 'HEROESIM_REPLAY', true),
    drafts: given(env, 'HEROESIM_DRAFTS'),
    config: configOf(env),
    policy: policyOf(env),
  };
}

/** The `HEROESIM_*` variables `env` sets for `run`, as `NAME=value`, in `variables`' order: a report's command line. */
export function settingsSet(run: RunKind, env: Env = process.env): string[] {
  return Object.entries(variables).flatMap(([name, { readBy }]) => {
    const value = given(env, name);
    return value === null || !readBy.includes(run) ? [] : [`${name}=${value}`];
  });
}

/** What `npm run harness -- <words>` asks for: a Vitest run with these variables and arguments, or a comparison. */
export type HarnessCommand = { kind: 'vitest'; env: Record<string, string>; args: string[] } | { kind: 'compare'; a: string; b: string };

/**
 * The command line's words (`npm run harness -- <words>`, `main.ts`), read into the variables a run
 * reads (v1.1.6-S2, DL-186 items 13 and 30). The first word may name:
 * - a profile, `gate <milestone>` or `neutral <milestone>`, with `--expect <fingerprint>` after it if
 *   wanted: the play sweep alone (`play.harness`), under `HEROESIM_PROFILE` and `HEROESIM_MILESTONE`;
 * - a probe, `succession`, `estimate` or `calibrate`: its file alone, under `HEROESIM_PROBE`;
 * - `compare <a> <b>`: two runs' reports compared, no Vitest run.
 * Any other words pass through to Vitest, as the words after a profile's or a probe's do. Throws on a
 * profile without a milestone, an `--expect` without a fingerprint, or a `compare` without two reports.
 */
export function commandLine(words: readonly string[]): HarnessCommand {
  const [first, ...rest] = words;
  if (first === 'compare') {
    const [a, b, ...more] = rest;
    if (a === undefined || b === undefined || more.length > 0) throw new RangeError('compare takes two reports: npm run harness -- compare <a> <b>');
    return { kind: 'compare', a, b };
  }
  const profile = profileNames.find((name) => name === first);
  if (profile !== undefined) {
    const [milestone, ...after] = rest;
    if (milestone === undefined || milestone.startsWith('-')) throw new RangeError(`${profile} names its report: npm run harness -- ${profile} <milestone>`);
    const env: Record<string, string> = { HEROESIM_PROFILE: profile, HEROESIM_MILESTONE: milestone };
    const at = after.indexOf('--expect');
    if (at >= 0) {
      const fingerprint = after[at + 1];
      if (fingerprint === undefined || fingerprint.startsWith('-')) throw new RangeError('--expect names a fingerprint: --expect <fingerprint>');
      env['HEROESIM_EXPECT'] = fingerprint;
      after.splice(at, 2);
    }
    return { kind: 'vitest', env, args: ['play.harness', ...after] };
  }
  const probe = probeNames.find((name) => name === first);
  if (probe !== undefined) return { kind: 'vitest', env: { HEROESIM_PROBE: probe }, args: [`${probe}.harness`, ...rest] };
  return { kind: 'vitest', env: {}, args: [...words] };
}
