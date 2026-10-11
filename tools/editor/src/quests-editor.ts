// The Quest templates and Encounters on the edit session (`session.ts`, DL-244) through the content
// files' adapter (`content-files.ts`), as the Traits are (DL-257 item 8, DL-267): each edit checked
// with the content's checks as it is made and held as pending in `.editor/quests.json`, the two
// lists' edits together, and "Finish", the session's, which writes each row's file, raises the
// content version and runs the tests. It never commits.
//
// A change of a part of a row (a Beat, an override, the Finale, a Check, a consequence) is held as a
// change of the fields it touched, made on the row as the pending edits leave it.

import type { ContentJson } from '@heroesim/content/uses';
import { kebabCase } from '@heroesim/content/write';
import { contentFiles, type Edit } from './content-files.js';
import type { Row, Use } from './kind.js';
import { beatsOf, encounterUses, finalesOf, playedBeats, poolDraws, questsKind, rowIn, rowsOf, rowWord, tiersOf, type QuestList, type TierView } from './quests-kind.js';
import { EditSession, Refused } from './session.js';
import { npmTest, type TestRunner } from './tests-run.js';
import type { Finished } from './editor.js';

/** A Beat as `show` gives it: its place, line and pool, and the Encounters its pool may draw. */
export interface BeatView {
  at: string;
  line: string;
  pool: Row;
  draws: string[];
}

/** A row as the commands give it: its list and fields, whether an edit of it is pending, and what it plays or where it is used. */
export interface QuestView {
  key: string;
  list: QuestList;
  row: Row;
  pending: 'added' | 'changed' | null;
  /** A template's: each Tier it offers as it plays, and its Beats. */
  tiers?: TierView[];
  beats?: BeatView[];
  /** An Encounter's: where a pool names it or a template names it as its Finale, which refuse its removal, and the Beats some Tier plays whose pools may draw it (`playedBeats`). */
  uses?: Use[];
  drawnBy?: string[];
}


export class QuestsEditor {
  readonly #session: EditSession<Edit, ContentJson>;

  constructor(readonly root: string) {
    this.#session = new EditSession(root, contentFiles(questsKind));
  }

  /** The files this editor's calls put back from a "Finish" cut off, if any. */
  get recovered(): string[] {
    return this.#session.recovered;
  }

  set recovered(files: string[]) {
    this.#session.recovered = files;
  }

  /** Puts back the files of a "Finish" cut off; with `force`, whatever its journal's process number says. */
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
  working(): ContentJson {
    const edits = this.edits();
    return this.#session.replay(edits, edits.length);
  }

  /** Makes `edit` pending once the edits with it pass the content's checks; gives the content with it. */
  #make(edit: Edit): ContentJson {
    const edits = this.edits();
    return this.#session.hold([...edits, edit], edits.length);
  }

  // ── Reading ───────────────────────────────────────────────────────────────────────────────

  /** Every row of `list`, with the pending edits made, in key order. */
  rows(list: QuestList): QuestView[] {
    const content = this.working();
    const edits = this.edits();
    return rowsOf(content, list).map(([key, row]) => this.#view(content, edits, list, key, row));
  }

  /** One row of `list`, by key. */
  show(list: QuestList, key: string): QuestView {
    const content = this.working();
    return this.#view(content, this.edits(), list, key, this.#row(content, list, key));
  }

  #row(content: ContentJson, list: QuestList, key: string): Row {
    const row = rowIn(content, list, key);
    if (row === undefined) throw new Refused([`"${key}" is not ${rowWord(list)}`]);
    return row;
  }

  #view(content: ContentJson, edits: readonly Edit[], list: QuestList, key: string, row: Row): QuestView {
    const mine = edits.filter((edit) => edit.list === list && edit.key === key);
    const pending = mine.some((edit) => edit.op === 'add') ? 'added' : mine.length > 0 ? 'changed' : null;
    const finales = finalesOf(content);
    if (list === 'quests') {
      const beats = beatsOf(row).map((beat, index) => ({ at: `beats.${index}`, line: beat.line, pool: beat.pool as Row, draws: poolDraws(content, beat.pool, finales) }));
      return { key, list, row, pending, tiers: tiersOf(row), beats };
    }
    const drawnBy = finales.has(key)
      ? []
      : rowsOf(content, 'quests').flatMap(([template, each]) =>
          beatsOf(each)
            .slice(0, playedBeats(each))
            .flatMap((beat, index) => (poolDraws(content, beat.pool, finales).includes(key) ? [`${template} beats.${index}`] : [])),
        );
    return { key, list, row, pending, uses: encounterUses(content, key), drawnBy };
  }

  // ── Editing ───────────────────────────────────────────────────────────────────────────────

  /** Adds a row to `list` under a new `key`, fixed from now on. */
  add(list: QuestList, key: string, values: Readonly<Record<string, unknown>>): QuestView {
    // Refused while "Finish" runs, and one cut off put back, before anything else.
    this.recover();
    if (!kebabCase.test(key)) throw new Refused([`"${key}" is not a key: lower case letters and digits, joined by hyphens, starting with a letter`]);
    if (Object.hasOwn(values, 'key') && values.key !== key) throw new Refused(['a key is given once, as the row is added, not among its fields']);
    const { key: _key, ...fields } = values;
    void _key;
    const { row } = questsKind.rowFrom(list, fields, undefined);
    const content = this.#make({ op: 'add', list, key, row });
    return this.#view(content, this.edits(), list, key, this.#row(content, list, key));
  }

  /** Changes the fields given of a row, `null` taking out one a row may leave out; its key stays. */
  change(list: QuestList, key: string, values: Readonly<Record<string, unknown>>): QuestView & { unchanged?: true } {
    if (Object.hasOwn(values, 'key') && values.key !== key) throw new Refused(['a key is fixed once made: add a new row instead']);
    const { key: _key, ...fields } = values;
    void _key;
    const before = this.working();
    const previous = this.#row(before, list, key);
    const { row } = questsKind.rowFrom(list, fields, previous);
    // A change that changes nothing is not held (DL-163), its fields compared in the kind's order.
    if (JSON.stringify(row) === JSON.stringify(questsKind.rowFrom(list, {}, previous).row)) return { ...this.#view(before, this.edits(), list, key, previous), unchanged: true };
    const content = this.#make({ op: 'change', list, key, fields });
    return this.#view(content, this.edits(), list, key, this.#row(content, list, key));
  }

  /** Changes a part of a row: `how` gives the fields it touches, from the row as the pending edits leave it, or refuses naming why. */
  alter(list: QuestList, key: string, how: (row: Row) => Row): QuestView & { unchanged?: true } {
    const previous = this.#row(this.working(), list, key);
    return this.change(list, key, how(previous));
  }

  /**
   * Removes a row; refused while it is used, naming every use (an Encounter a pool names, or a
   * Finale). A row added in this session goes with its edits, as if never made, where the edits left
   * pass the content's checks; else its removal is held after them.
   */
  remove(list: QuestList, key: string): { key: string; list: QuestList } {
    const before = this.working();
    this.#row(before, list, key);
    const uses = list === 'encounters' ? encounterUses(before, key) : [];
    if (uses.length > 0) {
      const how = 'take it out of each pool with `quests beat change`, and each Finale with `quests finale clear` or `set`';
      throw new Refused([`"${key}" is used, and is not removed while it is: ${how}`, ...uses.map((use) => `used at ${use.at}`)], uses);
    }
    const edits = this.edits();
    const appended: Edit[] = [...edits, { op: 'remove', list, key }];
    // Refused here, naming each problem, before anything is saved.
    this.#session.checked(appended, edits.length);
    if (edits.some((each) => each.op === 'add' && each.list === list && each.key === key)) {
      const without = edits.filter((each) => !(each.list === list && each.key === key));
      try {
        this.#session.hold(without, without.length);
        return { key, list };
      } catch (error) {
        if (!(error instanceof Refused)) throw error;
      }
    }
    this.#session.hold(appended, edits.length);
    return { key, list };
  }

  /** Drops the pending edits of `list`, or of its row `key`, where those left pass the content's checks. A file that cannot be read is dropped whole. */
  discard(list: QuestList, key?: string): { discarded: number; left: number; unreadable?: true } {
    return this.#session.discard((edit) => edit.list === list && (key === undefined || edit.key === key));
  }

  // ── Finish ────────────────────────────────────────────────────────────────────────────────

  /** The session's "Finish": writes every pending edit of both lists, raises the content version by one and runs the tests, putting every file back if any fails. */
  async finish(runTests: TestRunner = npmTest, onLine: (line: string) => void = () => {}): Promise<Finished> {
    const { ok, edits, changed, version, tests } = await this.#session.finish({ runTests, onLine });
    return { ok, edits, changed, contentVersion: version, tests };
  }
}
