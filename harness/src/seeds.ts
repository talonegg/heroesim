// Which seeds a harness run plays: named `seed-0001` onward, so run N's worlds are run M's first N and
// a seed in a report can be replayed by name. How many, and for how many years, are the run's settings
// (`settings.ts`, v1.1.6-S2).

/** `seed-0001` to `seed-<count>`, four digits at least. */
export function seedNames(count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError(`Cannot name ${count} seeds`);
  return Array.from({ length: count }, (_, i) => `seed-${String(i + 1).padStart(4, '0')}`);
}
