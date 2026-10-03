// The content editor's core (v1.1.4-S12, DL-150 items 7 to 12), the same for every kind: the pending
// edits, each checked with the content's checks as it is made; the rows with their uses, found through
// the register; and "Finish", which writes the files, raises the content version by one and runs
// `npm test`, putting every file back if any test fails. It never commits (item 11).
//
// The pending edits are held between commands in `.editor/<kind>.json` under the root, which git
// ignores, written whole or not at all: each edit as it was made, a row added whole, a change as the
// fields it gave, a removal by its key, and a use assigned or unassigned in other content by its
// register entry and its target or place (v1.1.4-S13, DL-150 item 13). They are made again on the content as it is on disk whenever
// they are read, so the page and the commands share them, a session may span several commands,
// nothing in the content's own files changes before "Finish", and a change never carries what another
// edit wrote beside it (an exclusion written into the other Trait, say). Every list of edits is checked
// with the content's checks before it is saved.
//
// While "Finish" runs, its journal (`finish-journal.ts`) is a lock: every call refuses with `Busy`.
// A journal left by a "Finish" cut off is restored by the next call, before anything else.

import { existsSync, readFileSync, rmSync } from 'node:fs';
import type { ContentJson } from '@heroesim/content/uses';
import { NotUndone, raiseContentVersion, readContentVersion, textChecks, transaction, Undone, versionFiles } from '@heroesim/portraits';
import { changedTexts, contentPath, readContentFiles, textsWith } from './content-files.js';
import { beginJournal, Busy, busyProblems, endJournal, finishingHere, journalState, releaseJournal, restoreJournal, writeAtomically } from './finish-journal.js';
import type { Kind, Row, Rule, Use } from './kind.js';
import { traitsKind } from './traits-kind.js';
import { npmTest, type TestResult, type TestRunner } from './tests-run.js';
import path from 'node:path';

/**
 * An edit held until "Finish": a row added whole, the fields a change gave, a row removed, or a use of
 * a row's key added in other content (its register entry and target) or taken out (its entry and place).
 */
export type Edit =
  | { op: 'add'; list: string; key: string; row: Row }
  | { op: 'change'; list: string; key: string; fields: Row }
  | { op: 'remove'; list: string; key: string }
  | { op: 'assign'; list: string; key: string; entry: string; target: Row }
  | { op: 'unassign'; list: string; key: string; entry: string; at: string };

/** What the pending file holds. */
interface PendingFile {
  kind: string;
  edits: readonly Edit[];
}

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

/** A row as the table shows it: its list, fields, effects in words, uses, the rules that read it, and whether an edit is pending. */
export interface RowView {
  key: string;
  list: string;
  row: Row;
  effects: string[];
  uses: Use[];
  rules: Rule[];
  pending: 'added' | 'changed' | null;
}

/** How "Finish" ended. */
export interface Finished {
  ok: true;
  edits: number;
  changed: string[];
  contentVersion: { from: number; to: number } | null;
  tests: TestResult | null;
}

/** Where a kind's pending edits are held under a root. */
export function pendingPath(root: string, kind: string): string {
  return path.join(root, '.editor', `${kind}.json`);
}

const keyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * `why` for the content version's comment, wrapped to the source's 100 columns: its first line after
 * ` * <n> from `, the rest each a line of the comment, in the file's own line ends.
 */
function commentLines(parseFile: string, why: string): string {
  const eol = existsSync(parseFile) && readFileSync(parseFile, 'utf8').includes('\r\n') ? '\r\n' : '\n';
  const lines: string[] = [];
  let line = '';
  for (const word of why.split(' ')) {
    const room = 100 - (lines.length === 0 ? ' * 999 from '.length : ' * '.length) - 1;
    if (line !== '' && line.length + 1 + word.length > room) {
      lines.push(line);
      line = word;
    } else line = line === '' ? word : `${line} ${word}`;
  }
  lines.push(line);
  return lines.join(`${eol} * `);
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export class Editor {
  /** The files the last call put back from a "Finish" cut off, if any. */
  recovered: string[] = [];

  constructor(
    readonly root: string,
    readonly kind: Kind = traitsKind,
  ) {}

  // ── The lock ──────────────────────────────────────────────────────────────────────────────

  /** Refuses while "Finish" runs; puts back the files of one cut off. Every call begins here. */
  #guard(): void {
    const state = journalState(this.root);
    if (state === 'live') throw new Busy(busyProblems(this.root));
    if (state === 'cut-off') this.recovered = [...this.recovered, ...restoreJournal(this.root)];
  }

  /**
   * Puts back the files of a "Finish" cut off; none where there is none. Refused while one runs; with
   * `force`, the journal is taken as cut off whatever its process number says, since another process
   * may hold that number now (v1.1.4-S14). Never while this process itself finishes.
   */
  recover(options: { force?: boolean } = {}): string[] {
    if (options.force === true && !finishingHere(this.root)) this.recovered = [...this.recovered, ...restoreJournal(this.root)];
    else this.#guard();
    return this.recovered;
  }

  /** The pending edits, after the lock's guard: what `pending` shows (v1.1.4-S14). */
  pending(): Edit[] {
    this.#guard();
    return this.edits();
  }

  // ── The pending edits ─────────────────────────────────────────────────────────────────────

  /** The pending edits, as made; refused, naming the way out, where the file cannot be read. */
  edits(): Edit[] {
    const file = pendingPath(this.root, this.kind.name);
    if (!existsSync(file)) return [];
    try {
      const held = JSON.parse(readFileSync(file, 'utf8')) as PendingFile;
      if (!Array.isArray(held.edits)) throw new Error('it holds no list of edits');
      return [...held.edits];
    } catch (error) {
      throw new Refused([`.editor/${this.kind.name}.json cannot be read (${error instanceof Error ? error.message : String(error)}); \`traits discard\` drops it`]);
    }
  }

  #save(edits: readonly Edit[]): void {
    const file = pendingPath(this.root, this.kind.name);
    if (edits.length === 0) rmSync(file, { force: true });
    else writeAtomically(file, `${JSON.stringify({ kind: this.kind.name, edits } satisfies PendingFile, null, 2)}\n`);
  }

  /** The list holding `key` in `content`, or `null`. */
  #listOf(content: ContentJson, key: string): string | null {
    for (const list of this.kind.lists) {
      const rows = content[list.file];
      if (typeof rows === 'object' && rows !== null && Object.hasOwn(rows, key)) return list.id;
    }
    return null;
  }

  #rowOf(content: ContentJson, list: string, key: string): Row | undefined {
    const file = this.kind.lists.find((each) => each.id === list)?.file;
    const rows = file === undefined ? undefined : (content[file] as Record<string, Row> | undefined);
    return rows !== undefined && Object.hasOwn(rows, key) ? rows[key] : undefined;
  }

  /** `edit` made on `content`, or a refusal naming why. */
  #apply(content: ContentJson, edit: Edit): ContentJson {
    const held = this.#listOf(content, edit.key);
    switch (edit.op) {
      case 'add':
        if (held !== null) throw new Refused([`"${edit.key}" is a key already, in ${held}`]);
        return this.kind.put(content, edit.list, edit.key, edit.row);
      case 'change': {
        const previous = held === edit.list ? this.#rowOf(content, edit.list, edit.key) : undefined;
        if (previous === undefined) throw new Refused([`"${edit.key}" is not a key of ${edit.list}`]);
        const { row, problems } = this.kind.rowFrom(edit.list, edit.fields, previous);
        if (problems.length > 0) throw new Refused(problems);
        return this.kind.put(content, edit.list, edit.key, row);
      }
      case 'remove': {
        if (held !== edit.list) throw new Refused([`"${edit.key}" is not a key of ${edit.list}`]);
        const blocking = this.kind.uses(content, edit.key).filter((use) => use.blocksRemoval);
        if (blocking.length > 0) {
          throw new Refused([`"${edit.key}" is used, and is not removed while it is: change or unassign each use first`, ...blocking.map((use) => `used at ${use.at}`)], blocking);
        }
        return this.kind.put(content, edit.list, edit.key, null);
      }
      case 'assign':
      case 'unassign': {
        if (held !== edit.list) throw new Refused([`"${edit.key}" is not a key of ${edit.list}`]);
        const made = edit.op === 'assign' ? this.kind.assign(content, edit.key, edit.entry, edit.target) : this.kind.unassign(content, edit.key, edit.entry, edit.at);
        if (made.content === null) throw new Refused(made.problems);
        return made.content;
      }
    }
  }

  /** The content on disk with `edits` made, in order; refused where one does not apply, naming it when it is one held. */
  #replay(edits: readonly Edit[], held: number): ContentJson {
    let content = readContentFiles(this.root).values;
    for (const [index, edit] of edits.entries()) {
      try {
        content = this.#apply(content, edit);
      } catch (error) {
        if (index < held && error instanceof Refused) {
          throw new Refused([`The pending edit ${index + 1} (${edit.op} ${edit.key}) no longer applies; discard it with \`traits discard ${edit.key}\``, ...error.problems], error.uses);
        }
        throw error;
      }
    }
    return content;
  }

  /** The content with every pending edit made. */
  working(): ContentJson {
    this.#guard();
    const edits = this.edits();
    return this.#replay(edits, edits.length);
  }

  /** The content's checks on `content`: refused, each problem named, where it fails them. */
  #check(content: ContentJson): void {
    const disk = readContentFiles(this.root);
    const checks = textChecks(textsWith(disk, changedTexts(disk, content)));
    if (!checks.ok) throw new Refused(checks.problems);
  }

  /** The content with `edits` made, refused unless it passes the content's checks. */
  #checked(edits: readonly Edit[], held: number): ContentJson {
    const content = this.#replay(edits, held);
    this.#check(content);
    return content;
  }

  /** The problems of the pending edits: one that no longer applies, or content that fails its checks with them made. */
  pendingProblems(): string[] {
    try {
      const edits = this.edits();
      this.#checked(edits, edits.length);
      return [];
    } catch (error) {
      if (error instanceof Refused) return [...error.problems];
      throw error;
    }
  }

  /** Makes `edit` pending once the edits with it pass the content's checks; gives the content with it. */
  #make(edit: Edit): ContentJson {
    this.#guard();
    const edits = this.edits();
    const content = this.#checked([...edits, edit], edits.length);
    this.#save([...edits, edit]);
    return content;
  }

  // ── Reading ───────────────────────────────────────────────────────────────────────────────

  /** Every row of every list, with the pending edits made. */
  rows(): RowView[] {
    const content = this.working();
    const edits = this.edits();
    return this.kind.lists.flatMap((list) =>
      Object.entries((content[list.file] ?? {}) as Record<string, Row>).map(([key, row]) => this.#view(content, edits, list.id, key, row)),
    );
  }

  #view(content: ContentJson, edits: readonly Edit[], list: string, key: string, row: Row): RowView {
    const mine = edits.filter((edit) => edit.key === key);
    const pending = mine.some((edit) => edit.op === 'add') ? 'added' : mine.length > 0 ? 'changed' : null;
    return { key, list, row, effects: this.kind.words(list, row), uses: this.kind.uses(content, key), rules: this.kind.rules(list, row), pending };
  }

  /** One row, by key. */
  show(key: string): RowView {
    const content = this.working();
    const list = this.#listOf(content, key);
    const row = list === null ? undefined : this.#rowOf(content, list, key);
    if (list === null || row === undefined) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    return this.#view(content, this.edits(), list, key, row);
  }

  /** The rows whose key, name, effects or uses hold `text`, ignoring case, each with what matched. */
  find(text: string): { key: string; list: string; name: unknown; matched: string[] }[] {
    const needle = text.toLowerCase();
    const holds = (value: string): boolean => value.toLowerCase().includes(needle);
    return this.rows().flatMap((view) => {
      const matched = [
        ...(holds(view.key) ? ['key'] : []),
        ...(typeof view.row.name === 'string' && holds(view.row.name) ? ['name'] : []),
        ...(view.effects.some(holds) || holds(JSON.stringify(view.row.effects ?? [])) ? ['effects'] : []),
        ...(view.uses.some((use) => holds(use.at)) ? ['uses'] : []),
      ];
      return matched.length > 0 ? [{ key: view.key, list: view.list, name: view.row.name, matched }] : [];
    });
  }

  /** Every use of `key`, and the rules that read it. */
  uses(key: string): { key: string; list: string; uses: Use[]; rules: Rule[] } {
    const view = this.show(key);
    return { key, list: view.list, uses: view.uses, rules: view.rules };
  }

  // ── Editing ───────────────────────────────────────────────────────────────────────────────

  /** Adds a row to `list` under a new `key`, fixed from now on (DL-150 item 9). */
  add(list: string, key: string, values: Readonly<Record<string, unknown>>): RowView {
    this.#guard();
    if (!this.kind.lists.some((each) => each.id === list)) throw new Refused([`"${list}" is not a list of ${this.kind.title}: ${this.kind.lists.map((each) => each.id).join(' or ')}`]);
    if (!keyPattern.test(key)) throw new Refused([`"${key}" is not a key: lower case letters and digits, joined by hyphens`]);
    const { row, problems } = this.kind.rowFrom(list, values, undefined);
    if (problems.length > 0) throw new Refused(problems);
    const content = this.#make({ op: 'add', list, key, row });
    return this.#view(content, this.edits(), list, key, this.#rowOf(content, list, key) ?? row);
  }

  /** Changes the fields given of a row; its key stays, and the rest of it is as other edits leave it. */
  change(key: string, values: Readonly<Record<string, unknown>>): RowView & { unchanged?: true } {
    if (Object.hasOwn(values, 'key') && values.key !== key) throw new Refused(['a key is fixed once made: add a new row instead']);
    const { key: _key, ...fields } = values;
    void _key;
    const before = this.working();
    const list = this.#listOf(before, key);
    const previous = list === null ? undefined : this.#rowOf(before, list, key);
    if (list === null || previous === undefined) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    const { row, problems } = this.kind.rowFrom(list, fields, previous);
    if (problems.length > 0) throw new Refused(problems);
    // A change that changes nothing is not held (the verification of v1.1.4-S13).
    if (JSON.stringify(this.kind.put(before, list, key, row)) === JSON.stringify(before)) return { ...this.#view(before, this.edits(), list, key, previous), unchanged: true };
    const content = this.#make({ op: 'change', list, key, fields });
    return this.#view(content, this.edits(), list, key, this.#rowOf(content, list, key) ?? previous);
  }

  /**
   * Removes a row; refused while it is used, naming every use. A row added in this session goes with
   * its edits, as if never made, where the edits left pass the content's checks; else its removal is
   * held after them.
   */
  remove(key: string): { key: string; list: string; stripped: Use[] } {
    const before = this.working();
    const list = this.#listOf(before, key);
    if (list === null) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    const stripped = this.kind.uses(before, key).filter((use) => !use.blocksRemoval);
    const edits = this.edits();
    const appended = [...edits, { op: 'remove', list, key } satisfies Edit];
    // Refused here, naming every use, before anything is saved.
    this.#checked(appended, edits.length);
    let saved = appended;
    if (edits.some((each) => each.op === 'add' && each.key === key)) {
      const without = edits.filter((each) => each.key !== key);
      try {
        this.#checked(without, without.length);
        saved = without;
      } catch (error) {
        if (!(error instanceof Refused)) throw error;
      }
    }
    this.#save(saved);
    return { key, list, stripped };
  }

  /**
   * Adds a use of `key` in other content (v1.1.4-S13): in the register's `entry`, at `target`, the
   * fields the entry names. Held as pending, checked with the content's checks as every edit is.
   */
  assign(key: string, entry: string, target: Readonly<Record<string, unknown>>): { key: string; list: string; entry: string; added: Use[]; uses: Use[] } {
    const before = this.working();
    const list = this.#listOf(before, key);
    if (list === null) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    const content = this.#make({ op: 'assign', list, key, entry, target: { ...target } });
    // The use the entry says it added, where it stands: a filter wrapped round an older one moves that one.
    const made = this.kind.assign(before, key, entry, target);
    return { key, list, entry, added: made.content === null || made.added === undefined ? [] : [made.added], uses: this.kind.uses(content, key) };
  }

  /**
   * Takes out a use of `key` (v1.1.4-S13): the one of the register's `entry` at `at`, a use's `at` as
   * `uses` gives it (`injuries.json: deep-cut.leavesTrait`) or its path alone (`deep-cut.leavesTrait`).
   * Refused, naming the key's uses, where it has none there.
   */
  unassign(key: string, entry: string, at: string): { key: string; list: string; entry: string; at: string; uses: Use[] } {
    const before = this.working();
    const list = this.#listOf(before, key);
    if (list === null) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    const uses = this.kind.uses(before, key);
    const use = uses.find((each) => each.entry === entry && (each.at === at.trim() || each.path.join('.') === at.trim()));
    if (use === undefined) {
      throw new Refused([`"${key}" has no use in ${entry} at ${at}; its uses:`, ...(uses.length === 0 ? ['none'] : uses.map((each) => `${each.entry} at ${each.at}`))]);
    }
    const content = this.#make({ op: 'unassign', list, key, entry, at: use.at });
    return { key, list, entry, at: use.at, uses: this.kind.uses(content, key) };
  }

  /** Drops the pending edits of `key`, or every one, where those left pass the content's checks. A file that cannot be read is dropped whole. */
  discard(key?: string): { discarded: number; left: number; unreadable?: true } {
    this.#guard();
    let edits: Edit[];
    try {
      edits = this.edits();
    } catch {
      this.#save([]);
      return { discarded: 0, left: 0, unreadable: true };
    }
    const left = key === undefined ? [] : edits.filter((edit) => edit.key !== key);
    if (left.length > 0) this.#checked(left, 0);
    this.#save(left);
    return { discarded: edits.length - left.length, left: left.length };
  }

  /**
   * The pending edits in a few words, for the content version's comment (the verification of
   * v1.1.4-S13): the rows added, changed and removed by key, and the uses assigned and unassigned
   * counted, with their keys.
   */
  summary(edits: readonly Edit[] = this.edits()): string {
    const keys = (op: Edit['op']): string[] => [...new Set(edits.filter((edit) => edit.op === op).map((edit) => edit.key))];
    const rows = (['add', 'change', 'remove'] as const).flatMap((op) => (keys(op).length === 0 ? [] : [`${{ add: 'added', change: 'changed', remove: 'removed' }[op]} ${keys(op).join(', ')}`]));
    const uses = (['assign', 'unassign'] as const).flatMap((op) => {
      const count = edits.filter((edit) => edit.op === op).length;
      return count === 0 ? [] : [`${count} ${count === 1 ? 'use' : 'uses'} ${op}ed, of ${keys(op).join(', ')}`];
    });
    return [...rows, ...uses].join('; ');
  }

  // ── Finish ────────────────────────────────────────────────────────────────────────────────

  /**
   * Writes the pending edits into the content's files, raises the content version by one and runs
   * the tests (DL-150 item 11). If any test fails every file is put back and the edits stay pending;
   * on success the edits it read are cleared. Never commits. The journal holds the lock throughout,
   * and every file's bytes before, for a "Finish" cut off.
   */
  async finish(runTests: TestRunner = npmTest, onLine: (line: string) => void = () => {}): Promise<Finished> {
    this.#guard();
    const edits = this.edits();
    if (edits.length === 0) return { ok: true, edits: 0, changed: [], contentVersion: null, tests: null };
    const content = this.#checked(edits, edits.length);
    const disk = readContentFiles(this.root);
    const changed = changedTexts(disk, content);
    const files = Object.keys(changed) as (keyof typeof changed)[];
    const { parse, test } = versionFiles(this.root);
    const before = (file: string): string | null => (existsSync(file) ? readFileSync(file).toString('base64') : null);
    const written = [...files.map((file) => contentPath(this.root, file)), parse, test];
    beginJournal(this.root, { contentVersion: readContentVersion(this.root), edits: edits.length, files: Object.fromEntries(written.map((file) => [file, before(file)])) });
    try {
      const finished = await transaction(async (transaction) => {
        for (const file of files) transaction.write(contentPath(this.root, file), changed[file] ?? '');
        const contentVersion = files.length === 0 ? null : raiseContentVersion(this.root, transaction, commentLines(parse, `the content editor's Finish of ${today()} (${this.summary(edits)})`));
        onLine(`Wrote ${files.join(', ') || 'nothing'}${contentVersion === null ? '' : `; content version ${contentVersion.from} → ${contentVersion.to}`}. Running the tests…`);
        const tests = await runTests(this.root, onLine);
        if (!tests.ok) {
          throw new Undone(tests.failures.length > 0 ? tests.failures : [`the tests failed, exit code ${tests.exitCode}`, ...tests.tail.slice(-10)], 'Finish');
        }
        return { ok: true as const, edits: edits.length, changed: files, contentVersion, tests };
      });
      // Only the edits it read: none can be made while it runs, but any after them stay.
      this.#save(this.edits().slice(edits.length));
      endJournal(this.root);
      return finished;
    } catch (error) {
      // A file not put back keeps the journal, the only copy of its bytes before: this process lets
      // its lock go, and the next command puts the files back from it (v1.1.4-S14).
      if (error instanceof NotUndone) releaseJournal(this.root);
      else endJournal(this.root);
      throw error;
    }
  }
}
