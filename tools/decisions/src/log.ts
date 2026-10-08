// The decision log's entries, read from where they live (DL-215): `docs/decision-log.md` holds the
// open release's entries, `docs/decisions/archive/` one file per closed release, and
// `docs/decisions/archive/superseded/` the items later entries superseded, one file per entry, each
// record headed by what it supersedes and by whom.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const logPath = 'docs/decision-log.md';
export const archiveDir = 'docs/decisions/archive';
export const supersededDir = 'docs/decisions/archive/superseded';
export const indexPath = 'docs/decisions/index.md';

/** One entry, `## DL-nn — title`, as its file holds it. */
export interface Entry {
  /** As the heading writes it: `DL-07`, `DL-215`. */
  id: string;
  number: number;
  title: string;
  /** The first date under the heading, `YYYY-MM-DD`; `null` when there is none. */
  date: string | null;
  /** Repository-relative, with `/`. */
  file: string;
}

/** One record of `superseded/`: an item, or a whole entry, that a later entry superseded. */
export interface Supersession {
  /** The entry superseded, `DL-88`, or a Pre-M0 review item, `D3`. */
  target: string;
  /** The item, `7`; `null` for the whole entry or a Pre-M0 item. */
  item: string | null;
  /** The entry that superseded it. */
  by: string;
  /** Superseded in full: the item's text is in the record, a stub in the archive. */
  full: boolean;
  file: string;
}

export interface Log {
  entries: Entry[];
  supersessions: Supersession[];
  /** What makes the log unreadable as one: an id held twice, a record of `superseded/` not understood. */
  problems: string[];
}

const entryHeading = /^## (DL-(\d+)) — (.+)$/;
/** A heading begun as an entry's, which `entryHeading` must then read, or the entry is left out unseen. */
export const begunAsEntry = /^## DL-/;

/** What is said of a heading begun as an entry's that is not one. */
export const notAnEntryHeading = (line: string): string => `"${line}" is not an entry's heading ("## DL-nn — title")`;
// The item is a number, `7`, a nested one, `1.1`, or a call named in a paragraph, `call 1`.
const supersededHeading = /^## (\S+?)(?: item (.+?))? — (superseded by|in part, by) (DL-\d+)$/;
const isoDate = /\b(\d{4}-\d{2}-\d{2})\b/;

/** How far under a heading its date may be: the Status line, or from DL-189 a bare date. */
const dateWithin = 4;

const posix = (file: string): string => file.split(path.sep).join('/');

function markdownIn(root: string, dir: string): string[] {
  const full = path.join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith('.md'))
    .map((item) => posix(path.join(dir, item.name)))
    .sort();
}

/** The files that hold entries: the log, then the archive's files by name. */
export function entryFiles(root: string): string[] {
  return [logPath, ...markdownIn(root, archiveDir)];
}

/** The entries `text` holds, in its order. */
export function entriesIn(text: string, file: string): Entry[] {
  const lines = text.split(/\r?\n/);
  const entries: Entry[] = [];
  lines.forEach((line, at) => {
    const heading = entryHeading.exec(line);
    if (heading === null) return;
    const [, id = '', number = '', title = ''] = heading;
    let date: string | null = null;
    for (const next of lines.slice(at + 1, at + 1 + dateWithin)) {
      if (next.startsWith('## ')) break;
      const found = isoDate.exec(next);
      if (found !== null) {
        date = found[1] ?? null;
        break;
      }
    }
    entries.push({ id, number: Number(number), title: title.trim(), date, file });
  });
  return entries;
}

/** The headings of `text` begun as an entry's that are not one, each with its file and line. */
export function malformedHeadingsIn(text: string, file: string): string[] {
  return text.split(/\r?\n/).flatMap((line, at) =>
    begunAsEntry.test(line) && !entryHeading.test(line) ? [`${file}:${at + 1}: ${notAnEntryHeading(line)}`] : [],
  );
}

/** The records of a `superseded/` file; a `##` heading not understood is a problem. */
export function supersessionsIn(text: string, file: string): { supersessions: Supersession[]; problems: string[] } {
  const supersessions: Supersession[] = [];
  const problems: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('## ')) continue;
    const heading = supersededHeading.exec(line);
    if (heading === null) {
      problems.push(`${file}: "${line}" is not a record's heading ("## DL-nn item N — superseded by DL-nn" or "— in part, by DL-nn")`);
      continue;
    }
    const [, target = '', item, kind, by = ''] = heading;
    supersessions.push({ target, item: item ?? null, by, full: kind === 'superseded by', file });
  }
  return { supersessions, problems };
}

/** Every entry and every record of `superseded/` under `root`. */
export function readLog(root: string): Log {
  const texts = entryFiles(root)
    .filter((file) => existsSync(path.join(root, file)))
    .map((file) => ({ file, text: readFileSync(path.join(root, file), 'utf8') }));
  const entries = texts.flatMap(({ file, text }) => entriesIn(text, file));
  const problems = texts.flatMap(({ file, text }) => malformedHeadingsIn(text, file));
  const seen = new Map<number, string>();
  const spelt = new Map<number, string>();
  for (const entry of entries) {
    const earlier = seen.get(entry.number);
    if (earlier !== undefined) problems.push(`DL-${entry.number} is held twice: in ${earlier} and in ${entry.file}`);
    seen.set(entry.number, entry.file);
    spelt.set(entry.number, entry.id);
  }
  // A record names its entries as their headings do: the index groups the records by the name.
  const misspelt = (record: Supersession, id: string): string[] => {
    const heading = spelt.get(Number(id.slice(3)));
    return heading !== undefined && heading !== id ? [`${record.file}: ${id} is written ${heading} by its entry`] : [];
  };
  const supersessions: Supersession[] = [];
  for (const file of markdownIn(root, supersededDir)) {
    const read = supersessionsIn(readFileSync(path.join(root, file), 'utf8'), file);
    supersessions.push(...read.supersessions);
    problems.push(...read.problems);
  }
  for (const record of supersessions) {
    if (record.target.startsWith('DL-') && !seen.has(Number(record.target.slice(3)))) {
      problems.push(`${record.file}: ${record.target} is no entry`);
    }
    if (!seen.has(Number(record.by.slice(3)))) problems.push(`${record.file}: ${record.by}, which supersedes ${record.target}, is no entry`);
    if (record.target.startsWith('DL-')) problems.push(...misspelt(record, record.target));
    problems.push(...misspelt(record, record.by));
  }
  entries.sort((a, b) => a.number - b.number);
  return { entries, supersessions, problems };
}
