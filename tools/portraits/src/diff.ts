// `diff <run>` (v1.1.3-S3): what applying an analysis run would change, by the JSON's paths rather
// than its lines, so the owner reads each row, term and sentence the run adds, removes or changes,
// whatever the files' layout. It changes nothing. The `portrait-apply` skill shows it before `apply`.
// - An object is compared key by key.
// - A list of strings or numbers is compared by its items: each one added or removed is named, and a
//   list holding the same items in another order is `reordered`, since the order of a picture list
//   chooses which picture a draw gives.
// - Any other value that differs is `changed`, whole.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DraftError } from './errors.js';
import { analysisDir, runPattern } from './records.js';
import { runFiles } from './runs.js';

/** One difference: its path in the file, as `portraits.gm-male-01.narrative`. */
export interface Change {
  path: string;
  kind: 'added' | 'removed' | 'changed' | 'reordered';
  before?: unknown;
  after?: unknown;
}

export interface FileDiff {
  /** The live file, relative to the root. */
  file: string;
  /** The run's file it would be replaced by. */
  from: string;
  changes: Change[];
}

export interface RunDiff {
  run: string;
  files: FileDiff[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function joined(at: string, key: string): string {
  return at === '' ? key : `${at}.${key}`;
}

/** The differences between two JSON values, by path. */
export function diffJson(before: unknown, after: unknown, at = ''): Change[] {
  if (isObject(before) && isObject(after)) {
    const changes: Change[] = [];
    for (const key of Object.keys(before)) {
      if (!Object.hasOwn(after, key)) changes.push({ path: joined(at, key), kind: 'removed', before: before[key] });
      else changes.push(...diffJson(before[key], after[key], joined(at, key)));
    }
    for (const key of Object.keys(after)) {
      if (!Object.hasOwn(before, key)) changes.push({ path: joined(at, key), kind: 'added', after: after[key] });
    }
    return changes;
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (Array.isArray(before) && Array.isArray(after) && before.every(isScalar) && after.every(isScalar)) {
    const left = before.map((each) => JSON.stringify(each));
    const right = after.map((each) => JSON.stringify(each));
    const removed = [...left];
    const added: string[] = [];
    for (const item of right) {
      const index = removed.indexOf(item);
      if (index >= 0) removed.splice(index, 1);
      else added.push(item);
    }
    if (removed.length === 0 && added.length === 0) return [{ path: at, kind: 'reordered', before, after }];
    return [
      ...removed.map((item) => ({ path: at, kind: 'removed' as const, before: JSON.parse(item) as unknown })),
      ...added.map((item) => ({ path: at, kind: 'added' as const, after: JSON.parse(item) as unknown })),
    ];
  }
  return [{ path: at, kind: 'changed', before, after }];
}

function shown(root: string, file: string): string {
  return path.relative(root, file).replace(/\\/g, '/');
}

/**
 * What applying `run` would change in each of the content's three files.
 *
 * @throws DraftError naming a run that is not there, or a file that is not JSON
 */
export function diffRun(root: string, run: string): RunDiff {
  if (!runPattern.test(run)) throw new DraftError([`${run}: a run is named by its date, YYYY-MM-DD, or YYYY-MM-DD-<n>`]);
  const problems: string[] = [];
  const files: FileDiff[] = [];
  for (const name of Object.values(runFiles)) {
    const live = path.join(root, 'content', name);
    const recommended = path.join(analysisDir(root), run, name);
    const read = (file: string): unknown => {
      if (!existsSync(file)) {
        problems.push(`${shown(root, file)} does not exist`);
        return undefined;
      }
      try {
        return JSON.parse(readFileSync(file, 'utf8'));
      } catch (error) {
        problems.push(`${shown(root, file)}: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
      }
    };
    const before = read(live);
    const after = read(recommended);
    files.push({ file: shown(root, live), from: shown(root, recommended), changes: diffJson(before, after) });
  }
  if (problems.length > 0) throw new DraftError(problems);
  return { run, files };
}

/** A value for a line, as JSON. */
function valueText(value: unknown): string {
  return JSON.stringify(value);
}

/** The diff as lines for a person: `+` added, `-` removed, `~` changed, `↕` reordered. */
export function diffText(diff: RunDiff): string[] {
  const lines: string[] = [];
  for (const file of diff.files) {
    lines.push(`${file.file} ← ${file.from}: ${file.changes.length === 0 ? 'no change' : `${file.changes.length} ${file.changes.length === 1 ? 'change' : 'changes'}`}`);
    for (const change of file.changes) {
      if (change.kind === 'added') lines.push(`  + ${change.path}: ${valueText(change.after)}`);
      else if (change.kind === 'removed') lines.push(`  - ${change.path}: ${valueText(change.before)}`);
      else if (change.kind === 'reordered') lines.push(`  ↕ ${change.path}: ${valueText(change.before)} → ${valueText(change.after)}`);
      else lines.push(`  ~ ${change.path}: ${valueText(change.before)} → ${valueText(change.after)}`);
    }
  }
  return lines;
}
