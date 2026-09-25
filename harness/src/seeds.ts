// Which seeds a harness run plays: `HEROESIM_SEEDS` of them (INPUTS §9), named `seed-0001`
// onward, so run N's worlds are run M's first N and a seed in a report can be replayed by name.

/** Seeds in a harness run when `HEROESIM_SEEDS` is unset (INPUTS §9, 4.13). */
export const defaultSeedCount = 1000;

/**
 * Seeds in a play sweep when `HEROESIM_SEEDS` is unset: INPUTS 4.13's per-milestone run of 200
 * seeds × 20 years. The tagged run sets `HEROESIM_SEEDS=1000` (M2-S12, DL-34).
 */
export const defaultPlaySeedCount = 200;

/**
 * The seed count `value` asks for: a whole number from 1, or `fallback` when it is unset or
 * blank. Throws on anything else, so a mistyped count fails the run rather than playing none.
 */
export function seedCount(
  value: string | undefined = process.env.HEROESIM_SEEDS,
  fallback: number = defaultSeedCount,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const count = Number(value.trim());
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new RangeError(`HEROESIM_SEEDS must be a whole number from 1, not ${JSON.stringify(value)}`);
  }
  return count;
}

/** `seed-0001` to `seed-<count>`, four digits at least. */
export function seedNames(count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError(`Cannot name ${count} seeds`);
  return Array.from({ length: count }, (_, i) => `seed-${String(i + 1).padStart(4, '0')}`);
}
