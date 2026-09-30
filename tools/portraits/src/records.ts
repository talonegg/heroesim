// The records the tool writes from the agents' drafts (v1.1.3-S2): an intake report,
// `docs/portraits/intake/<run>.md`, and an analysis run, `docs/portraits/analysis/<run>.md` with the
// folder `<run>/` beside it. A run is named by its date, `2026-10-02`, and a second run on a day is
// `2026-10-02-2`.

import { existsSync } from 'node:fs';
import path from 'node:path';

/** A date as a run names it. */
export const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** A run's name: a date, with `-<n>` for the n-th run of a day. */
export const runPattern = /^\d{4}-\d{2}-\d{2}(-[2-9]|-[1-9]\d+)?$/;

/** Today's date, where the tool runs. */
export function today(now: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function intakeDir(root: string): string {
  return path.join(root, 'docs', 'portraits', 'intake');
}

export function analysisDir(root: string): string {
  return path.join(root, 'docs', 'portraits', 'analysis');
}

/**
 * The first free run name of a date in a folder: the date itself, then `-2`, `-3` and on. A name is
 * taken if its report (`<name>.md`) or its folder (`<name>/`) exists.
 */
export function nextRun(dir: string, date: string): string {
  if (!datePattern.test(date)) throw new Error(`${date}: a date is written YYYY-MM-DD`);
  const taken = (name: string): boolean => existsSync(path.join(dir, `${name}.md`)) || existsSync(path.join(dir, name));
  if (!taken(date)) return date;
  for (let count = 2; ; count += 1) {
    const name = `${date}-${count}`;
    if (!taken(name)) return name;
  }
}
