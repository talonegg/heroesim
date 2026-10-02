// The content editor's core (v1.1.4-S12, DL-150 items 7 to 12), the same for every kind: the pending
// edits, each checked with the content's checks as it is made; the rows with their uses, found through
// the register; and "Finish", which writes the files, raises the content version by one and runs
// `npm test`, putting every file back if any test fails. It never commits (item 11).
//
// The pending edits are held between commands in `.editor/<kind>.json` under the root, which git
// ignores: each edit as it was made, replayed on the content as it is on disk whenever they are read.
// So the page and the commands share them, a session may span several commands, and nothing in the
// content's own files changes before "Finish".

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ContentJson } from '@heroesim/content/uses';
import { raiseContentVersion, textChecks, transaction, Undone } from '@heroesim/portraits';
import { changedTexts, contentPath, readContentFiles, textsWith } from './content-files.js';
import type { Kind, Row, Rule, Use } from './kind.js';
import { traitsKind } from './traits-kind.js';
import { npmTest, type TestResult, type TestRunner } from './tests-run.js';

/** An edit held until "Finish": a row added or changed, whole, or a row removed. */
export type Edit =
  | { op: 'add'; list: string; key: string; row: Row }
  | { op: 'change'; list: string; key: string; row: Row }
  | { op: 'remove'; list: string; key: string };

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

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export class Editor {
  constructor(
    readonly root: string,
    readonly kind: Kind = traitsKind,
  ) {}

  // ── The pending edits ─────────────────────────────────────────────────────────────────────

  /** The pending edits, as made. */
  edits(): Edit[] {
    const file = pendingPath(this.root, this.kind.name);
    if (!existsSync(file)) return [];
    const held = JSON.parse(readFileSync(file, 'utf8')) as PendingFile;
    return [...held.edits];
  }

  #save(edits: readonly Edit[]): void {
    const file = pendingPath(this.root, this.kind.name);
    if (edits.length === 0) {
      rmSync(file, { force: true });
      return;
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ kind: this.kind.name, edits } satisfies PendingFile, null, 2)}\n`);
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
      case 'change':
        if (held !== edit.list) throw new Refused([`"${edit.key}" is not a key of ${edit.list}`]);
        return this.kind.put(content, edit.list, edit.key, edit.row);
      case 'remove': {
        if (held !== edit.list) throw new Refused([`"${edit.key}" is not a key of ${edit.list}`]);
        const blocking = this.kind.uses(content, edit.key).filter((use) => use.blocksRemoval);
        if (blocking.length > 0) {
          throw new Refused([`"${edit.key}" is used, and is not removed while it is: change each use first`, ...blocking.map((use) => `used at ${use.at}`)], blocking);
        }
        return this.kind.put(content, edit.list, edit.key, null);
      }
    }
  }

  /** The content with every pending edit made, after `more`: refused where an edit no longer applies, or the result fails the content's checks. */
  working(more: readonly Edit[] = []): ContentJson {
    let content = readContentFiles(this.root).values;
    const edits = [...this.edits(), ...more];
    for (const [index, edit] of edits.entries()) {
      try {
        content = this.#apply(content, edit);
      } catch (error) {
        if (index < edits.length - more.length && error instanceof Refused) {
          throw new Refused([`The pending edit ${index + 1} (${edit.op} ${edit.key}) no longer applies; discard it with \`traits discard ${edit.key}\``, ...error.problems], error.uses);
        }
        throw error;
      }
    }
    return content;
  }

  /** The content's checks on `content`: refused, each problem named, where it fails them. */
  #check(content: ContentJson): void {
    const disk = readContentFiles(this.root);
    const checks = textChecks(textsWith(disk, changedTexts(disk, content)));
    if (!checks.ok) throw new Refused(checks.problems);
  }

  /** Makes `edit` pending once it passes the content's checks; gives the content with it. */
  #make(edit: Edit): ContentJson {
    const content = this.working([edit]);
    this.#check(content);
    this.#save([...this.edits(), edit]);
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
    if (!this.kind.lists.some((each) => each.id === list)) throw new Refused([`"${list}" is not a list of ${this.kind.title}: ${this.kind.lists.map((each) => each.id).join(' or ')}`]);
    if (!keyPattern.test(key)) throw new Refused([`"${key}" is not a key: lower case letters and digits, joined by hyphens`]);
    const { row, problems } = this.kind.rowFrom(list, values, undefined);
    if (problems.length > 0) throw new Refused(problems);
    const content = this.#make({ op: 'add', list, key, row });
    return this.#view(content, this.edits(), list, key, this.#rowOf(content, list, key) ?? row);
  }

  /** Changes a row's fields; its key stays. */
  change(key: string, values: Readonly<Record<string, unknown>>): RowView {
    if (Object.hasOwn(values, 'key') && values.key !== key) throw new Refused(['a key is fixed once made: add a new row instead']);
    const { key: _key, ...fields } = values;
    void _key;
    const before = this.working();
    const list = this.#listOf(before, key);
    const previous = list === null ? undefined : this.#rowOf(before, list, key);
    if (list === null || previous === undefined) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    const { row, problems } = this.kind.rowFrom(list, fields, previous);
    if (problems.length > 0) throw new Refused(problems);
    const content = this.#make({ op: 'change', list, key, row });
    return this.#view(content, this.edits(), list, key, this.#rowOf(content, list, key) ?? row);
  }

  /** Removes a row; refused while it is used, naming every use. A pending row's own edits are dropped. */
  remove(key: string): { key: string; list: string; stripped: Use[] } {
    const before = this.working();
    const list = this.#listOf(before, key);
    if (list === null) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    const stripped = this.kind.uses(before, key).filter((use) => !use.blocksRemoval);
    const edit: Edit = { op: 'remove', list, key };
    const content = this.working([edit]);
    this.#check(content);
    const edits = this.edits();
    // A row added in this session goes with its edits, as if never made.
    this.#save(edits.some((each) => each.op === 'add' && each.key === key) ? edits.filter((each) => each.key !== key) : [...edits, edit]);
    return { key, list, stripped };
  }

  /** Drops the pending edits of `key`, or every one; refused where a later edit needs one dropped. */
  discard(key?: string): { discarded: number; left: number } {
    const edits = this.edits();
    const left = key === undefined ? [] : edits.filter((edit) => edit.key !== key);
    if (left.length > 0) {
      let content = readContentFiles(this.root).values;
      for (const edit of left) content = this.#apply(content, edit);
      this.#check(content);
    }
    this.#save(left);
    return { discarded: edits.length - left.length, left: left.length };
  }

  /** The pending edits in words. */
  summary(edits: readonly Edit[] = this.edits()): string {
    const done = { add: 'added', change: 'changed', remove: 'removed' } as const;
    return edits.map((edit) => `${done[edit.op]} ${edit.list} ${edit.key}`).join('; ');
  }

  // ── Finish ────────────────────────────────────────────────────────────────────────────────

  /**
   * Writes the pending edits into the content's files, raises the content version by one and runs
   * the tests (DL-150 item 11). If any test fails every file is put back and the edits stay pending;
   * on success they are cleared. Never commits.
   */
  async finish(runTests: TestRunner = npmTest, onLine: (line: string) => void = () => {}): Promise<Finished> {
    const edits = this.edits();
    if (edits.length === 0) return { ok: true, edits: 0, changed: [], contentVersion: null, tests: null };
    const content = this.working();
    this.#check(content);
    const disk = readContentFiles(this.root);
    const changed = changedTexts(disk, content);
    const files = Object.keys(changed) as (keyof typeof changed)[];
    const finished = await transaction(async (transaction) => {
      for (const file of files) transaction.write(contentPath(this.root, file), changed[file] ?? '');
      const contentVersion = files.length === 0 ? null : raiseContentVersion(this.root, transaction, `the content editor's Finish of ${today()} (${this.summary(edits)})`);
      onLine(`Wrote ${files.join(', ') || 'nothing'}${contentVersion === null ? '' : `; content version ${contentVersion.from} → ${contentVersion.to}`}. Running the tests…`);
      const tests = await runTests(this.root, onLine);
      if (!tests.ok) {
        throw new Undone(tests.failures.length > 0 ? tests.failures : [`the tests failed, exit code ${tests.exitCode}`, ...tests.tail.slice(-10)], 'Finish');
      }
      return { ok: true as const, edits: edits.length, changed: files, contentVersion, tests };
    });
    this.#save([]);
    return finished;
  }
}
