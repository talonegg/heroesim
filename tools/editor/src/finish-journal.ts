// "Finish"'s journal and lock (v1.1.4-S12's verification, DL-161): before "Finish" writes a file it
// writes `.editor/finish.json`, atomically, holding the bytes every file it will write held before
// (or that it was not there), the content version, the process finishing and how many edits it read.
// While that process lives the journal is a lock: every command, and every call of the page's API,
// refuses with `Busy`. When "Finish" ends, passed or put back, the journal goes. A journal whose
// process is gone is a Finish cut off, by a crash or a kill, with content written and untested: the
// next command restores every file from it before it does anything (`recover`), and says so. Ctrl+C
// and SIGTERM put the files back at once (`onSignals`).

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** What the journal holds. */
export interface Journal {
  pid: number;
  startedAt: string;
  contentVersion: number;
  /** How many of the pending edits "Finish" read. */
  edits: number;
  /** Each file "Finish" writes, by its full path: its bytes before, in base64, or `null` where it was not there. */
  files: Record<string, string | null>;
}

/** A command refused because "Finish" is running. */
export class Busy extends Error {
  constructor(readonly problems: readonly string[]) {
    super(problems.join('\n'));
    this.name = 'Busy';
  }
}

export const busyMessage = '"Finish" is running: nothing is changed or read until its tests end, and the page\'s forms wait for it';

/** The journal's path under a root. */
export function journalPath(root: string): string {
  return path.join(root, '.editor', 'finish.json');
}

/** Writes a file whole or not at all: to a file beside it, then renamed over it. */
export function writeAtomically(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, file);
}

/** The roots this process is finishing now. */
const finishing = new Set<string>();

function same(root: string): string {
  return path.resolve(root).toLowerCase();
}

/** Whether a process runs. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it runs, as another user's.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The journal at a root, or `null`. */
export function readJournal(root: string): Journal | null {
  const file = journalPath(root);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as Journal;
}

/** Whether no "Finish" is under way at a root, one is running, or one was cut off. */
export function journalState(root: string): 'none' | 'live' | 'cut-off' {
  const journal = readJournal(root);
  if (journal === null) return 'none';
  const live = journal.pid === process.pid ? finishing.has(same(root)) : alive(journal.pid);
  return live ? 'live' : 'cut-off';
}

/** Writes the journal and holds the lock for this process. */
export function beginJournal(root: string, journal: Omit<Journal, 'pid' | 'startedAt'>): void {
  finishing.add(same(root));
  writeAtomically(journalPath(root), `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), ...journal } satisfies Journal)}\n`);
}

/** Removes the journal and lets the lock go. */
export function endJournal(root: string): void {
  rmSync(journalPath(root), { force: true });
  finishing.delete(same(root));
}

/** Every file of a root's journal put back as it was, the journal removed; the files put back. None where there is no journal. */
export function restoreJournal(root: string): string[] {
  const journal = readJournal(root);
  if (journal === null) return [];
  for (const [file, bytes] of Object.entries(journal.files)) {
    if (bytes === null) rmSync(file, { force: true });
    else {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(bytes, 'base64'));
    }
  }
  endJournal(root);
  return Object.keys(journal.files);
}

/** Puts back every file of every "Finish" this process is running: what Ctrl+C and SIGTERM do. */
export function restoreRunning(): string[] {
  return [...finishing].flatMap((root) => restoreJournal(root));
}

/** On Ctrl+C or SIGTERM, every running "Finish"'s files are put back, and the process ends. */
export function onSignals(proc: { once(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown; exit(code: number): unknown }, say: (text: string) => void): void {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    proc.once(signal, () => {
      const files = restoreRunning();
      if (files.length > 0) say(`Stopped: "Finish" was cut off, and ${files.length} files are put back as they were.`);
      proc.exit(130);
    });
  }
}
