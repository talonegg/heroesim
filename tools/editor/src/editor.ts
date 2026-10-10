// The content editor's Traits, a content kind's rows and their uses in other content, on the edit
// session (`session.ts`, DL-244) through the content files' adapter (`content-files.ts`): each edit
// checked with the content's checks as it is made and held as pending, the rows read with their uses,
// found through the register, and "Finish", the session's (DL-150 items 7 to 12). It never commits.
//
// The pending edits are made again on the content as it is on disk whenever they are read, so the
// page and the commands share them, a session may span several commands, nothing in the content's
// own files changes before "Finish", and a change never carries what another edit wrote beside it (an
// exclusion written into the other Trait, say).

import type { ContentJson } from '@heroesim/content/uses';
import { contentFiles, listOf, rowOf, type Edit } from './content-files.js';
import type { Kind, Row, Rule, Use, UseKind } from './kind.js';
import { EditSession, Refused } from './session.js';
import { npmTest, type TestResult, type TestRunner } from './tests-run.js';
import { traitsKind } from './traits-kind.js';

export type { Edit } from './content-files.js';
export { pendingPath, Refused } from './session.js';

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

const keyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class Editor {
  readonly #session: EditSession<Edit, ContentJson>;

  constructor(
    readonly root: string,
    readonly kind: Kind & UseKind = traitsKind,
  ) {
    this.#session = new EditSession(root, contentFiles(kind, kind));
  }

  /** The files this editor's calls put back from a "Finish" cut off, if any. */
  get recovered(): string[] {
    return this.#session.recovered;
  }

  set recovered(files: string[]) {
    this.#session.recovered = files;
  }

  /** Puts back the files of a "Finish" cut off; with `force`, whatever its journal's process number says (the session's `recover`). */
  recover(options: { force?: boolean } = {}): string[] {
    return this.#session.recover(options);
  }

  /** The pending edits, as made. */
  edits(): Edit[] {
    return this.#session.edits();
  }

  /** The problems of the pending edits: one that no longer applies, or content that fails its checks with them made. */
  pendingProblems(): string[] {
    return this.#session.problems();
  }

  /** The content with every pending edit made. */
  #working(): ContentJson {
    const edits = this.edits();
    return this.#session.replay(edits, edits.length);
  }

  /** Makes `edit` pending once the edits with it pass the content's checks; gives the content with it. */
  #make(edit: Edit): ContentJson {
    const edits = this.edits();
    return this.#session.hold([...edits, edit], edits.length);
  }

  // ── Reading ───────────────────────────────────────────────────────────────────────────────

  /** Every row of every list, with the pending edits made. */
  rows(): RowView[] {
    const content = this.#working();
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
    const content = this.#working();
    const list = listOf(this.kind, content, key);
    const row = list === null ? undefined : rowOf(this.kind, content, list, key);
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
    // Refused while "Finish" runs, and one cut off put back, before anything else.
    this.recover();
    if (!this.kind.lists.some((each) => each.id === list)) throw new Refused([`"${list}" is not a list of ${this.kind.title}: ${this.kind.lists.map((each) => each.id).join(' or ')}`]);
    if (!keyPattern.test(key)) throw new Refused([`"${key}" is not a key: lower case letters and digits, joined by hyphens`]);
    const { row, problems } = this.kind.rowFrom(list, values, undefined);
    if (problems.length > 0) throw new Refused(problems);
    const content = this.#make({ op: 'add', list, key, row });
    return this.#view(content, this.edits(), list, key, rowOf(this.kind, content, list, key) ?? row);
  }

  /** Changes the fields given of a row; its key stays, and the rest of it is as other edits leave it. */
  change(key: string, values: Readonly<Record<string, unknown>>): RowView & { unchanged?: true } {
    if (Object.hasOwn(values, 'key') && values.key !== key) throw new Refused(['a key is fixed once made: add a new row instead']);
    const { key: _key, ...fields } = values;
    void _key;
    const before = this.#working();
    const list = listOf(this.kind, before, key);
    const previous = list === null ? undefined : rowOf(this.kind, before, list, key);
    if (list === null || previous === undefined) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    const { row, problems } = this.kind.rowFrom(list, fields, previous);
    if (problems.length > 0) throw new Refused(problems);
    // A change that changes nothing is not held (DL-163).
    if (JSON.stringify(this.kind.put(before, list, key, row)) === JSON.stringify(before)) return { ...this.#view(before, this.edits(), list, key, previous), unchanged: true };
    const content = this.#make({ op: 'change', list, key, fields });
    return this.#view(content, this.edits(), list, key, rowOf(this.kind, content, list, key) ?? previous);
  }

  /**
   * Removes a row; refused while it is used, naming every use. A row added in this session goes with
   * its edits, as if never made, where the edits left pass the content's checks; else its removal is
   * held after them.
   */
  remove(key: string): { key: string; list: string; stripped: Use[] } {
    const before = this.#working();
    const list = listOf(this.kind, before, key);
    if (list === null) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    const stripped = this.kind.uses(before, key).filter((use) => !use.blocksRemoval);
    const edits = this.edits();
    const appended = [...edits, { op: 'remove', list, key } satisfies Edit];
    // Refused here, naming every use, before anything is saved.
    this.#session.checked(appended, edits.length);
    if (edits.some((each) => each.op === 'add' && each.key === key)) {
      const without = edits.filter((each) => each.key !== key);
      try {
        this.#session.hold(without, without.length);
        return { key, list, stripped };
      } catch (error) {
        if (!(error instanceof Refused)) throw error;
      }
    }
    this.#session.hold(appended, edits.length);
    return { key, list, stripped };
  }

  /**
   * Adds a use of `key` in other content (DL-150 item 13): in the register's `entry`, at `target`, the
   * fields the entry names. Held as pending, checked with the content's checks as every edit is.
   */
  assign(key: string, entry: string, target: Readonly<Record<string, unknown>>): { key: string; list: string; entry: string; added: Use[]; uses: Use[] } {
    const before = this.#working();
    const list = listOf(this.kind, before, key);
    if (list === null) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    const content = this.#make({ op: 'assign', list, key, entry, target: { ...target } });
    // The use the entry says it added, where it stands: a filter wrapped round an older one moves that one.
    const made = this.kind.assign(before, key, entry, target);
    return { key, list, entry, added: made.content === null || made.added === undefined ? [] : [made.added], uses: this.kind.uses(content, key) };
  }

  /** The use of `key` in the register's `entry` at `at`, a use's `at` as `uses` gives it or its path alone; refused, naming the key's uses, where it has none there. */
  #useAt(before: ContentJson, key: string, entry: string, at: string): Use {
    const uses = this.kind.uses(before, key);
    const use = uses.find((each) => each.entry === entry && (each.at === at.trim() || each.path.join('.') === at.trim()));
    if (use === undefined) {
      throw new Refused([`"${key}" has no use in ${entry} at ${at}; its uses:`, ...(uses.length === 0 ? ['none'] : uses.map((each) => `${each.entry} at ${each.at}`))]);
    }
    return use;
  }

  /**
   * Takes out a use of `key` (DL-150 item 13): the one of the register's `entry` at `at`, a use's `at`
   * as `uses` gives it (`injuries.json: deep-cut.leavesTrait`) or its path alone (`deep-cut.leavesTrait`).
   */
  unassign(key: string, entry: string, at: string): { key: string; list: string; entry: string; at: string; uses: Use[] } {
    const before = this.#working();
    const list = listOf(this.kind, before, key);
    if (list === null) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    const use = this.#useAt(before, key, entry, at);
    const content = this.#make({ op: 'unassign', list, key, entry, at: use.at });
    return { key, list, entry, at: use.at, uses: this.kind.uses(content, key) };
  }

  /**
   * Changes a use of `key` in place (DL-186 item 14): the one of the register's `entry` at `at`, as
   * `unassign` finds it, given `values`, the values its entry changes (a trait consequence's `chance`,
   * say). Held as pending, checked with the content's checks as every edit is. One that changes
   * nothing is not held.
   */
  update(key: string, entry: string, at: string, values: Readonly<Record<string, unknown>>): { key: string; list: string; entry: string; at: string; uses: Use[]; unchanged?: true } {
    const before = this.#working();
    const list = listOf(this.kind, before, key);
    if (list === null) throw new Refused([`"${key}" is not a key of ${this.kind.title}`]);
    const use = this.#useAt(before, key, entry, at);
    const made = this.kind.update(before, key, entry, use.at, values);
    if (made.content === null) throw new Refused(made.problems);
    if (JSON.stringify(made.content) === JSON.stringify(before)) return { key, list, entry, at: use.at, uses: this.kind.uses(before, key), unchanged: true };
    const content = this.#make({ op: 'update', list, key, entry, at: use.at, values: { ...values } });
    return { key, list, entry, at: use.at, uses: this.kind.uses(content, key) };
  }

  /** Drops the pending edits of `key`, or every one, where those left pass the content's checks. A file that cannot be read is dropped whole. */
  discard(key?: string): { discarded: number; left: number; unreadable?: true } {
    return this.#session.discard(key === undefined ? undefined : (edit) => edit.key === key);
  }

  // ── Finish ────────────────────────────────────────────────────────────────────────────────

  /** The session's "Finish": writes the pending edits, raises the content version by one and runs the tests, putting every file back if any fails. */
  async finish(runTests: TestRunner = npmTest, onLine: (line: string) => void = () => {}): Promise<Finished> {
    const { ok, edits, changed, version, tests } = await this.#session.finish({ runTests, onLine });
    return { ok, edits, changed, contentVersion: version, tests };
  }
}
