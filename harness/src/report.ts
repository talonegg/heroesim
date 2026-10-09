// Writing a harness report: Markdown tables and numbers, where a report goes, and the machine it
// ran on. Every milestone's report is built from these (M1-S10 creation, M2-S12 play), so reports
// read alike and a run on one machine can be compared with a run on another.
//
// The harness may read the clock and the machine: it is not the engine (ADR-0001 binds the
// engine only). It never reads them into a world.

import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, release, type } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where reports are written: `harness/reports/`. Git ignores it; a report a DL entry or a release's
 * Gate cites is committed, its Markdown and its JSON force-added (`git add -f`, DL-13, DL-186 item 28).
 */
export const reportsDir = fileURLToPath(new URL('../reports/', import.meta.url));

const pad = (n: number): string => String(n).padStart(2, '0');

/** `date` as `YYYY-MM-DD` in the machine's local time zone, as a report's name gives it. */
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `date` as `YYYY-MM-DD HH:MM:SS +HH:MM`, local time and its offset from UTC. */
export function localTimestamp(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const zone = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${localDate(date)} ${time} ${zone}`;
}

/**
 * A report's name: its release, `v1.1.9`, or a word, `play`, each with kebab-case words after it if
 * wanted, `v1.1.9-s3-neutral`. Delivery is tracked by release, so a milestone's `m<n>` names none
 * from v1.1.8 on (DL-228); the reports named so before stay as they are.
 */
export const reportName = /^(?!m\d)(?:v\d+\.\d+\.\d+|[a-z][a-z0-9]*)(?:-[a-z0-9]+)*$/;

/** What is said of a name `reportName` refuses. */
export const reportNameRule = 'v<x>.<y>.<z>, or a word, each with -<name> words after it if wanted, never a milestone';

/** A report for the day of `date`: `reports/v1.1.9-s3-neutral-2026-10-09.md`. */
export function reportPath(name: string, date: Date, dir: string = reportsDir): string {
  if (!reportName.test(name)) throw new RangeError(`A report's name is ${reportNameRule}; not ${JSON.stringify(name)}`);
  return join(dir, `${name}-${localDate(date)}.md`);
}

/**
 * Writes a run's summary to the terminal. Straight to stdout, since Vitest holds back a passing test's
 * console output, so that a run's lines, the Gate's among them, are seen (v1.1.6-S2).
 */
export function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

/** Writes `markdown` to `path`, making its directory, and returns the path. */
export function writeReport(path: string, markdown: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');
  return path;
}

/** The machine and runtime a measure was taken on, for the report and the decision log. */
export interface Machine {
  node: string;
  os: string;
  arch: string;
  cpu: string;
  cores: number;
}

export function machine(): Machine {
  const processors = cpus();
  return {
    node: process.version,
    os: `${type()} ${release()}`,
    arch: process.arch,
    cpu: processors[0]?.model.trim() ?? 'unknown',
    cores: processors.length,
  };
}

/** `value` to `digits` decimal places, with thousands separated; a dash when it is not finite. */
export function fixed(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A whole number with thousands separated: `1,000`. */
export function whole(value: number): string {
  return fixed(value, 0);
}

/** `n` as a share of `of`, to one place: `33.3%`; a dash when `of` is 0 (v1.1.6-S1, DL-186 item 19). */
export function percent(n: number, of: number): string {
  return of === 0 ? '—' : `${fixed((100 * n) / of, 1)}%`;
}

export type Align = 'left' | 'right';

/**
 * A Markdown table. Cells are written as given, with `|` escaped; `align` gives each column's
 * alignment, left by default.
 */
export function markdownTable(header: readonly string[], rows: readonly (readonly string[])[], align: readonly Align[] = []): string {
  for (const row of rows) {
    if (row.length !== header.length) {
      throw new RangeError(`A row has ${row.length} cells where the header has ${header.length}`);
    }
  }
  const cell = (text: string): string => text.replaceAll('|', '\\|');
  const line = (cells: readonly string[]): string => `| ${cells.map(cell).join(' | ')} |`;
  const rule = header.map((_, i) => (align[i] === 'right' ? '---:' : '---'));
  return [line(header), `| ${rule.join(' | ')} |`, ...rows.map(line)].join('\n');
}
