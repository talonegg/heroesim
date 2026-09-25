// Summary statistics for harness reports: plain functions over plain arrays of numbers, so every
// milestone's report (M1-S10's creation sweep, M2-S12's counters and measures) summarises alike.

/** A series of numbers, summarised. Every field is `NaN` for an empty series except `count`. */
export interface Summary {
  count: number;
  mean: number;
  /** Population standard deviation: the spread of the values themselves, not an estimate. */
  sd: number;
  min: number;
  max: number;
  p50: number;
  p99: number;
}

/**
 * The `p`th percentile (0–100) of `sorted`, which must be in ascending order, by the
 * nearest-rank method: the smallest value with at least `p` per cent of the series at or below
 * it, so the answer is always one of the values. `NaN` for an empty series.
 */
export function percentile(sorted: readonly number[], p: number): number {
  if (!(p >= 0 && p <= 100)) throw new RangeError(`A percentile is from 0 to 100, not ${p}`);
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] as number;
}

/** Count, mean, spread and percentiles of `values`, which it leaves unchanged. */
export function summarise(values: readonly number[]): Summary {
  const count = values.length;
  if (count === 0) {
    const nothing = Number.NaN;
    return { count, mean: nothing, sd: nothing, min: nothing, max: nothing, p50: nothing, p99: nothing };
  }
  const sorted = [...values].sort((a, b) => a - b);
  let sum = 0;
  for (const value of values) sum += value;
  const mean = sum / count;
  let squares = 0;
  for (const value of values) squares += (value - mean) ** 2;
  return {
    count,
    mean,
    sd: Math.sqrt(squares / count),
    min: sorted[0] as number,
    max: sorted[count - 1] as number,
    p50: percentile(sorted, 50),
    p99: percentile(sorted, 99),
  };
}

/** Occurrences of each key, in first-seen order. */
export function tally(keys: Iterable<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}
