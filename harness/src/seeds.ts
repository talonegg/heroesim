// Which seeds a harness run plays: `HEROESIM_SEEDS` of them (INPUTS §9), named `seed-0001`
// onward, so run N's worlds are run M's first N and a seed in a report can be replayed by name; and
// for how many years a play sweep plays them, `HEROESIM_YEARS` (M9-S2).

import { configProblems, defaultConfig, type GameConfig } from '@heroesim/engine';
import { defaultYears } from './play.js';

/** Seeds in a harness run when `HEROESIM_SEEDS` is unset (INPUTS §9, 4.13). */
export const defaultSeedCount = 1000;

/**
 * Seeds in a play sweep when `HEROESIM_SEEDS` is unset: INPUTS 4.13's per-milestone run of 200
 * seeds × 20 years. The tagged run sets `HEROESIM_SEEDS=1000` (M2-S12, DL-34).
 */
export const defaultPlaySeedCount = 200;

/**
 * The seed count `value` asks for: a whole number from 1, or `fallback` when it is unset or
 * blank. Throws on anything else, naming `name`, the variable read, so a mistyped count fails the
 * run rather than playing none. A count read of another variable passes it `?? ''`, since an
 * `undefined` value reads `HEROESIM_SEEDS` (v1.1.4-S9's verification, DL-162).
 */
export function seedCount(
  value: string | undefined = process.env.HEROESIM_SEEDS,
  fallback: number = defaultSeedCount,
  name = 'HEROESIM_SEEDS',
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const count = Number(value.trim());
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError(`${name} must be a whole number from 1, not ${JSON.stringify(value)}`);
  }
  return count;
}

/**
 * The years each game of a play sweep lasts at most (M9-S2): `HEROESIM_YEARS`, a whole number from 1,
 * or DL-83's twenty-year slice when it is unset or blank. A longer run reaches what the slice does
 * not, such as the founding Rivals' Guildmasters' Retirement at 65 and so their Succession. Throws
 * on anything else, so a mistyped count fails the run.
 */
export function yearCount(value: string | undefined = process.env.HEROESIM_YEARS, fallback: number = defaultYears): number {
  if (value === undefined || value.trim() === '') return fallback;
  const years = Number(value.trim());
  if (!Number.isSafeInteger(years) || years < 1) {
    throw new RangeError(`HEROESIM_YEARS must be a whole number from 1, not ${JSON.stringify(value)}`);
  }
  return years;
}

/** `seed-0001` to `seed-<count>`, four digits at least. */
export function seedNames(count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError(`Cannot name ${count} seeds`);
  return Array.from({ length: count }, (_, i) => `seed-${String(i + 1).padStart(4, '0')}`);
}

/**
 * The config values a play sweep plays in place of `defaultConfig`'s (v1.1.4-S9's verification,
 * DL-162): `HEROESIM_CONFIG`, a JSON object of config keys, for trials of values a tuning step would
 * set, so that none is changed in engine/src/config.ts to try it; no change when it is unset or
 * blank. Throws on anything else, and on a config the Quest Engine would refuse (`configProblems`).
 */
export function configChanges(value: string | undefined = process.env.HEROESIM_CONFIG): Partial<GameConfig> {
  if (value === undefined || value.trim() === '') return {};
  let changes: unknown;
  try {
    changes = JSON.parse(value);
  } catch {
    changes = undefined;
  }
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) {
    throw new RangeError(`HEROESIM_CONFIG is ${JSON.stringify(value)}; expected a JSON object of config keys`);
  }
  const unknown = Object.keys(changes).filter((key) => !Object.hasOwn(defaultConfig, key));
  if (unknown.length > 0) throw new RangeError(unknown.map((key) => `HEROESIM_CONFIG: "${key}" is not a config key`).join('; '));
  const problems = configProblems({ ...defaultConfig, ...(changes as Partial<GameConfig>) });
  if (problems.length > 0) throw new RangeError(problems.map((problem) => `HEROESIM_CONFIG: ${problem}`).join('; '));
  return changes as Partial<GameConfig>;
}
