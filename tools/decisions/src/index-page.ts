// The decision index, `docs/decisions/index.md` (DL-215): one row an entry, its date, its title cut
// short, what later entries superseded of it and the file that holds it, made from the log's own
// headings so that it cannot drift. `npm run decisions -- index` writes it; its test holds the
// shipped page to what the log makes.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { indexPath, readLog, type Entry, type Log, type Supersession } from './log.js';

/** A title is cut to about this many characters, at a word. */
export const titleLength = 100;

function shortTitle(title: string): string {
  const escaped = title.replace(/\|/g, '\\|');
  if (escaped.length <= titleLength) return escaped;
  const cut = escaped.slice(0, titleLength);
  const word = cut.lastIndexOf(' ');
  return `${(word > titleLength / 2 ? cut.slice(0, word) : cut).replace(/[\s,;:]+$/, '')} …`;
}

/** A file as a link from the index's own folder. */
function linkTo(file: string): string {
  const name = path.posix.basename(file, '.md');
  return `[${name}](${path.posix.relative(path.posix.dirname(indexPath), file)})`;
}

function supersededWords(records: readonly Supersession[]): string {
  return records
    .map((record) => {
      if (record.item !== null) return `item ${record.item} ${record.full ? 'by' : 'in part by'} ${record.by}`;
      return `${record.full ? 'the whole by' : 'in part by'} ${record.by}`;
    })
    .join('; ');
}

function byTarget(log: Log): Map<string, Supersession[]> {
  const grouped = new Map<string, Supersession[]>();
  for (const record of log.supersessions) grouped.set(record.target, [...(grouped.get(record.target) ?? []), record]);
  return grouped;
}

const row = (entry: Entry, records: readonly Supersession[]): string =>
  `| ${entry.id} | ${entry.date ?? ''} | ${shortTitle(entry.title)} | ${supersededWords(records)} | ${linkTo(entry.file)} |`;

/** The index page `log` makes. */
export function renderIndex(log: Log): string {
  const grouped = byTarget(log);
  const preM0 = [...grouped.entries()].filter(([target]) => !target.startsWith('DL-')).sort(([a], [b]) => a.localeCompare(b));
  const lines = [
    '# Decision index',
    '',
    'Every entry of the decision log: its date, its title cut short, what later entries superseded of it',
    'and the file that holds it (DL-215). An item superseded in full is a one-line stub in its entry, its',
    'text in [`archive/superseded/`](archive/superseded/); an item superseded in part keeps its text and',
    'carries a note. To read an entry, open its file and find `## DL-nn `.',
    '',
    'Made by `npm run decisions -- index` from the entries\' headings; never edited by hand. `npm test`',
    'fails when it is stale, or when a `DL-nn` cited anywhere in the repository is no entry.',
    '',
    '| Entry | Date | Title | Superseded | File |',
    '|---|---|---|---|---|',
    ...log.entries.map((entry) => row(entry, grouped.get(entry.id) ?? [])),
  ];
  if (preM0.length > 0) {
    lines.push(
      '',
      '## Pre-M0 review decisions',
      '',
      'Items A1 to F4, in [pre-m0-review](archive/pre-m0-review.md). Superseded:',
      '',
      ...preM0.map(([target, records]) => `- ${target}: ${supersededWords(records)}`),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** The index as the log under `root` makes it, or the problems that keep it from being made. */
export function indexOf(root: string): { ok: true; text: string } | { ok: false; problems: string[] } {
  const log = readLog(root);
  return log.problems.length > 0 ? { ok: false, problems: log.problems } : { ok: true, text: renderIndex(log) };
}

/** Whether the shipped index is the one the log makes. */
export function indexFreshness(root: string): { ok: boolean; problems: string[] } {
  const made = indexOf(root);
  if (!made.ok) return { ok: false, problems: made.problems };
  const file = path.join(root, indexPath);
  if (!existsSync(file)) return { ok: false, problems: [`${indexPath} is missing: run \`npm run decisions -- index\``] };
  return readFileSync(file, 'utf8') === made.text
    ? { ok: true, problems: [] }
    : { ok: false, problems: [`${indexPath} is stale: run \`npm run decisions -- index\``] };
}

/** Writes the index the log makes; says whether it changed. */
export function writeIndex(root: string): { ok: true; changed: boolean } | { ok: false; problems: string[] } {
  const made = indexOf(root);
  if (!made.ok) return made;
  const file = path.join(root, indexPath);
  const changed = !existsSync(file) || readFileSync(file, 'utf8') !== made.text;
  if (changed) writeFileSync(file, made.text);
  return { ok: true, changed };
}
