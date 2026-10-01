// An analysis run (DL-135 item 11, v1.1.3-S2): `analyse` changes nothing in play, and writes a report,
// `docs/portraits/analysis/<run>.md`, and beside it the folder `<run>/` holding its recommended
// `portraits.json`, `portrait-appearances.json` and `descriptions.json`.
// - `write-run <draft.json>` writes a run from the agents' draft.
// - `apply <run>` puts a run's JSON in place, raises the content version and runs the content's
//   checks and `check`, undone as a whole on failure.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { check } from './check.js';
import { contentChecks, contentTexts, textChecks } from './content-checks.js';
import { DraftError, Undone } from './errors.js';
import { raiseContentVersion } from './content-version.js';
import { editJson } from './json-edit.js';
import { formatJson } from './json-format.js';
import { analysisDir, datePattern, nextRun, runPattern, today } from './records.js';
import { transaction } from './transaction.js';

/** A run's three files, by the draft's field that holds each. */
export const runFiles = {
  portraits: 'portraits.json',
  portraitAppearances: 'portrait-appearances.json',
  descriptions: 'descriptions.json',
} as const;

type RunField = keyof typeof runFiles;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `value` as JSON with every object's fields in one order, so two values equal but for order are one text. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, each: unknown) =>
    isObject(each) ? Object.fromEntries(Object.keys(each).sort().map((key) => [key, each[key]])) : each,
  );
}

function shown(root: string, file: string): string {
  return path.relative(root, file).replace(/\\/g, '/');
}

export interface WrittenRun {
  run: string;
  report: string;
  files: string[];
}

/**
 * Writes an analysis run from the agents' draft: `{ date?, report, portraits,
 * portraitAppearances, descriptions }`. Nothing live changes.
 *
 * @throws DraftError before anything is written, for a draft of the wrong shape, or whose recommended
 *   files fail the content's checks or the tool's `check`, and so could not be applied
 */
export async function writeRun(root: string, json: unknown, options: { date?: string } = {}): Promise<WrittenRun> {
  const problems: string[] = [];
  if (!isObject(json)) throw new DraftError(['the draft is not an object']);
  if (json.date !== undefined && (typeof json.date !== 'string' || !datePattern.test(json.date))) problems.push('date: not YYYY-MM-DD');
  if (typeof json.report !== 'string' || json.report.trim().length === 0) problems.push("report: the report's text is wanted");
  for (const field of Object.keys(runFiles) as RunField[]) {
    if (!isObject(json[field])) problems.push(`${field}: the recommended ${runFiles[field]}, an object, is wanted`);
  }
  if (problems.length > 0) throw new DraftError(problems);
  // A run that could not be applied is refused before it is written (v1.1.3-S3).
  const instead = Object.fromEntries((Object.keys(runFiles) as RunField[]).map((field) => [runFiles[field], JSON.stringify(json[field])]));
  const content = textChecks(contentTexts(root, instead));
  if (!content.ok) throw new DraftError(content.problems.map((problem) => `the recommended content fails its checks: ${problem}`));
  // And the tool's own check, which `apply` runs too (v1.1.3-S8).
  const tool = check(root, instead);
  if (!tool.ok) throw new DraftError(tool.failures.map((failure) => `the recommended content fails the tool's check: ${failure.message}`));
  const date = options.date ?? (typeof json.date === 'string' ? json.date : today());
  const run = nextRun(analysisDir(root), date);
  const report = path.join(analysisDir(root), `${run}.md`);
  return transaction(async (files) => {
    const text = (json.report as string).trim();
    files.write(report, `${/^# /.test(text) ? '' : `# Portrait analysis ${run}\n\n`}${text}\n`);
    const written = [shown(root, report)];
    for (const field of Object.keys(runFiles) as RunField[]) {
      const file = path.join(analysisDir(root), run, runFiles[field]);
      // In the live file's layout where there is one, so the run differs from it only where it changes.
      const live = path.join(root, 'content', runFiles[field]);
      files.write(file, existsSync(live) ? editJson(readFileSync(live, 'utf8'), json[field]) : formatJson(json[field]));
      written.push(shown(root, file));
    }
    return { run, report: shown(root, report), files: written };
  });
}

export interface Applied {
  run: string;
  /** The content files the run changed. */
  changed: string[];
  contentVersion: { from: number; to: number } | null;
}

/**
 * Puts an analysis run's JSON in place, as one transaction: the content version is raised where a
 * file changed, and the content's checks and `check` must pass.
 *
 * @throws Undone after undoing every change, naming each problem
 */
export async function apply(root: string, run: string): Promise<Applied> {
  if (!runPattern.test(run)) throw new DraftError([`${run}: a run is named by its date, YYYY-MM-DD, or YYYY-MM-DD-<n>`]);
  const dir = path.join(analysisDir(root), run);
  const problems: string[] = [];
  const texts: Partial<Record<RunField, string>> = {};
  for (const field of Object.keys(runFiles) as RunField[]) {
    const file = path.join(dir, runFiles[field]);
    if (!existsSync(file)) {
      problems.push(`${shown(root, file)} does not exist`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    try {
      JSON.parse(text);
      texts[field] = text;
    } catch (error) {
      problems.push(`${shown(root, file)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (problems.length > 0) throw new DraftError(problems);
  try {
    return await transaction(async (files) => {
      const changed: string[] = [];
      for (const field of Object.keys(runFiles) as RunField[]) {
        const target = path.join(root, 'content', runFiles[field]);
        const text = texts[field] ?? '';
        const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
        // Equal whatever the order of an object's fields, as `diff` compares them (v1.1.3-S8).
        if (current !== null && canonical(JSON.parse(current)) === canonical(JSON.parse(text))) continue;
        // The run's value written into the live file's own layout, whatever the run's (v1.1.3-S3), so
        // `git diff` shows only what the run changes.
        files.write(target, current === null ? text : editJson(current, JSON.parse(text)));
        changed.push(shown(root, target));
      }
      if (changed.length === 0) return { run, changed, contentVersion: null };
      const contentVersion = raiseContentVersion(root, files, `the portrait tool's apply of analysis run ${run} (\`docs/portraits/analysis/${run}.md\`)`);
      const content = contentChecks(root);
      const tool = check(root);
      const failed = [...content.problems, ...tool.failures.map((failure) => failure.message)];
      if (failed.length > 0) throw new Undone(failed, `Applying ${run}`);
      return { run, changed, contentVersion };
    });
  } catch (error) {
    if (error instanceof Undone) throw error;
    throw new Undone([error instanceof Error ? error.message : String(error)], `Applying ${run}`);
  }
}
