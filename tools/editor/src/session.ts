// The content editor's edit session (DL-244), the same for every kind it edits: the pending edits,
// held between commands in `.editor/<kind>.json` under the root (which git ignores), written whole or
// not at all; each list of them checked with the kind's checks before it is saved; and "Finish", which
// writes the files in their own layout (`editJson`), raises a version by one with a line of its
// changelog saying why, runs `npm test`, and puts every file back if any test fails (DL-150 item 11).
// It never commits.
//
// "Finish"'s journal (`finish-journal.ts`, DL-161) is its lock: while one runs, every call of every
// session at that root refuses with `Busy`, whatever its kind, and one cut off is put back by the
// next call, before anything else.
//
// The seam is `SessionAdapter`: what a kind's edits are made on, its checks, and what its "Finish"
// writes. Two adapters fill it: the content files (`contentFiles`, a content kind's rows, with the
// uses of their keys in other content as its extension) and the config file (`configFile`).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { editJson, NotUndone, raisedVersion, readContentVersion, transaction, Undone } from '@heroesim/content/write';
import { beginJournal, Busy, busyProblems, clearPending, endJournal, finishingHere, journalState, markJournalDone, releaseJournal, restoreJournal, type Done } from './finish-journal.js';
import type { Use } from './kind.js';
import { npmTest, type TestResult, type TestRunner } from './tests-run.js';

/** A change the editor will not make: each problem, and for a removal the uses that refuse it. */
export class Refused extends Error {
  constructor(
    readonly problems: readonly string[],
    readonly uses: readonly Use[] = [],
  ) {
    super(problems.join('\n'));
    this.name = 'Refused';
  }
}

/** Where a kind's pending edits are held under a root. */
export function pendingPath(root: string, kind: string): string {
  return path.join(root, '.editor', `${kind}.json`);
}

/** One file a "Finish" writes: its text now, its value after, and whether a row on one line stays on one (`editJson`'s `keepLines`). */
export interface Written {
  text: string;
  value: unknown;
  keepLines: boolean;
}

/** What a "Finish" writes, as an adapter gives it. */
export interface Finishing {
  /** Each file written, by its full path, or `null` for a file it removes, a folder's row's (DL-260). */
  files: Record<string, Written | null>;
  /** What the result names as changed: the content's files, or the settings. */
  changed: string[];
  /** The files written, as the run's first line names them. */
  wrote: string;
  /**
   * The versioned file, holding `version` and `changelog`, whose version is raised by one with the
   * line `<version> from <why>.`, and its name in words; `null` where none is (nothing written). It is
   * one of `files`, or another file, read as it is.
   */
  version: { file: string; name: string; why: string } | null;
}

/**
 * A kind of edit the session holds: what the edits are made on, the kind's checks, and what its
 * "Finish" writes. `W` is the working state, the files on disk with the edits made.
 */
export interface SessionAdapter<E, W> {
  /** The kind's name: its edits are held in `.editor/<name>.json`, and its commands are `<name> …`. */
  readonly name: string;
  /**
   * The files at `root` as they are on disk, with `edits` made in order; refused where one does not
   * apply, naming it, and the way out, where it is among the first `held`, those already pending.
   */
  replay(root: string, edits: readonly E[], held: number): W;
  /** Each problem the kind's checks find with the edits made. */
  problems(root: string, working: W): string[];
  /** What a "Finish" of `edits` writes, `working` being the files with them made; `reason` is why, where the kind asks for one. */
  finishing(root: string, working: W, edits: readonly E[], reason: string): Finishing;
}

/** How "Finish" ended: the edits it read, what it changed, the version raised and the tests' run; none of them with nothing pending. */
export interface SessionFinished {
  ok: true;
  edits: number;
  changed: string[];
  version: { from: number; to: number } | null;
  tests: TestResult | null;
}

/** What a "Finish" is given: the tests it runs, where their lines go, and why it raises the version, where the kind asks. */
export interface FinishOptions {
  runTests?: TestRunner;
  onLine?: (line: string) => void;
  reason?: string;
}

export class EditSession<E, W> {
  /** The files this session's calls put back from a "Finish" cut off, if any. */
  recovered: string[] = [];

  constructor(
    readonly root: string,
    readonly adapter: SessionAdapter<E, W>,
  ) {}

  // ── The lock ──────────────────────────────────────────────────────────────────────────────

  /** Refuses while "Finish" runs; puts back the files of one cut off. Every call begins here. */
  #guard(): void {
    const state = journalState(this.root);
    if (state === 'live') throw new Busy(busyProblems(this.root));
    if (state === 'cut-off') this.recovered = [...this.recovered, ...restoreJournal(this.root)];
  }

  /**
   * Puts back the files of a "Finish" cut off, giving every file this session has put back; none
   * where there is none. Refused while one runs; with `force`, the journal is taken as cut off
   * whatever its process number says, since another process may hold that number now (DL-161).
   * Never while this process itself finishes.
   */
  recover(options: { force?: boolean } = {}): string[] {
    if (options.force === true && !finishingHere(this.root)) this.recovered = [...this.recovered, ...restoreJournal(this.root)];
    else this.#guard();
    return this.recovered;
  }

  // ── The pending edits ─────────────────────────────────────────────────────────────────────

  /** The pending edits, as made; refused, naming the way out, where the file cannot be read. */
  edits(): E[] {
    this.#guard();
    return this.#edits();
  }

  #edits(): E[] {
    const file = pendingPath(this.root, this.adapter.name);
    if (!existsSync(file)) return [];
    try {
      const held = JSON.parse(readFileSync(file, 'utf8')) as { edits?: unknown };
      if (!Array.isArray(held.edits)) throw new Error('it holds no list of edits');
      return [...(held.edits as E[])];
    } catch (error) {
      throw new Refused([`.editor/${this.adapter.name}.json cannot be read (${error instanceof Error ? error.message : String(error)}); \`${this.adapter.name} discard\` drops it`]);
    }
  }

  #save(edits: readonly E[]): void {
    clearPending(this.#pending(edits));
  }

  /** The file of pending edits holding `edits`, and its text: `null` where there are none and it goes. */
  #pending(edits: readonly E[]): Done {
    return { pending: pendingPath(this.root, this.adapter.name), text: edits.length === 0 ? null : `${JSON.stringify({ kind: this.adapter.name, edits }, null, 2)}\n` };
  }

  /** The files with `edits` made, unchecked; refused where one does not apply, naming it where it is among the first `held`. */
  replay(edits: readonly E[], held: number): W {
    this.#guard();
    return this.adapter.replay(this.root, edits, held);
  }

  /** The files with `edits` made, refused, each problem named, unless they pass the kind's checks. */
  checked(edits: readonly E[], held: number): W {
    const working = this.replay(edits, held);
    const problems = this.adapter.problems(this.root, working);
    if (problems.length > 0) throw new Refused(problems);
    return working;
  }

  /** The problems of the pending edits: one that no longer applies, or files that fail their checks with them made. */
  problems(): string[] {
    try {
      const edits = this.edits();
      this.checked(edits, edits.length);
      return [];
    } catch (error) {
      if (error instanceof Refused) return [...error.problems];
      throw error;
    }
  }

  /** Holds `edits` as pending in place of those held, once they pass the kind's checks, the first `held` of them those held already; gives the files with them made. */
  hold(edits: readonly E[], held: number): W {
    const working = this.checked(edits, held);
    this.#save(edits);
    return working;
  }

  /**
   * Drops the pending edits `drop` names, or every one, where those left pass the kind's checks
   * (unless `check` is false). A file that cannot be read is dropped whole, and says so.
   */
  discard(drop: (edit: E) => boolean = () => true, { check = true }: { check?: boolean } = {}): { discarded: number; left: number; unreadable?: true } {
    let edits: E[];
    try {
      edits = this.edits();
    } catch (error) {
      if (!(error instanceof Refused)) throw error;
      this.#save([]);
      return { discarded: 0, left: 0, unreadable: true };
    }
    const left = edits.filter((edit) => !drop(edit));
    if (check && left.length > 0) this.checked(left, 0);
    this.#save(left);
    return { discarded: edits.length - left.length, left: left.length };
  }

  // ── Finish ────────────────────────────────────────────────────────────────────────────────

  /**
   * Writes the pending edits, raises the adapter's version by one and runs the tests (DL-150 item
   * 11). The edits are checked first. If any test fails every file is put back and the edits stay
   * pending (`Undone`); on success the journal is marked done, then the edits it read are cleared.
   * Never commits. The journal holds the lock throughout, and every file's bytes before, for a
   * "Finish" cut off; a file not put back (`NotUndone`) keeps it, for the next call to put back; and
   * one cut off once it is marked done is completed by the next call, its files kept (DL-249).
   */
  async finish({ runTests = npmTest, onLine = () => {}, reason = '' }: FinishOptions = {}): Promise<SessionFinished> {
    const edits = this.edits();
    if (edits.length === 0) return { ok: true, edits: 0, changed: [], version: null, tests: null };
    const working = this.checked(edits, edits.length);
    const plan = this.adapter.finishing(this.root, working, edits, reason);
    const files = { ...plan.files };
    let version: SessionFinished['version'] = null;
    if (plan.version !== null) {
      const { file, why } = plan.version;
      const was: Written = files[file] ?? { text: readFileSync(file, 'utf8'), value: JSON.parse(readFileSync(file, 'utf8')) as unknown, keepLines: false };
      const raised = raisedVersion(was.value, why, file);
      files[file] = { ...was, value: raised.value };
      version = { from: raised.from, to: raised.to };
    }
    const before = (file: string): string | null => (existsSync(file) ? readFileSync(file).toString('base64') : null);
    beginJournal(this.root, { contentVersion: readContentVersion(this.root), edits: edits.length, files: Object.fromEntries(Object.keys(files).map((file) => [file, before(file)])) });
    let finished: SessionFinished;
    try {
      finished = await transaction(async (transaction) => {
        for (const [file, written] of Object.entries(files)) {
          if (written === null) transaction.remove(file);
          else transaction.write(file, editJson(written.text, written.value, { keepLines: written.keepLines }));
        }
        onLine(`Wrote ${plan.wrote}${version === null || plan.version === null ? '' : `; ${plan.version.name} ${version.from} → ${version.to}`}. Running the tests…`);
        const tests = await runTests(this.root, onLine);
        if (!tests.ok) {
          throw new Undone(tests.failures.length > 0 ? tests.failures : [`the tests failed, exit code ${tests.exitCode}`, ...tests.tail.slice(-10)], 'Finish');
        }
        return { ok: true as const, edits: edits.length, changed: plan.changed, version, tests };
      });
    } catch (error) {
      // A file not put back keeps the journal, the only copy of its bytes before: this process lets
      // its lock go, and the next call puts the files back from it (DL-161).
      if (error instanceof NotUndone) releaseJournal(this.root);
      else endJournal(this.root);
      throw error;
    }
    // Passed: the journal is marked done before the edits it read are cleared, so that a "Finish"
    // cut off between the two keeps its files, and the next call clears the edits (DL-249). Only the
    // edits it read: none can be made while it runs, but any after them stay.
    try {
      const done = this.#pending(this.#edits().slice(edits.length));
      markJournalDone(this.root, done);
      clearPending(done);
      endJournal(this.root);
    } catch (error) {
      // The journal kept for the next call: completed once marked done, or else its files put back.
      releaseJournal(this.root);
      throw error;
    }
    return finished;
  }
}
