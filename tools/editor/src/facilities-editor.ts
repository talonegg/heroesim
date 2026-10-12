// The Facilities and their grades on the edit session (`session.ts`, DL-244) through the content files'
// adapter (`content-files.ts`), as the Quest templates and Encounters are (DL-297): each edit checked
// with the content's checks as it is made and held as pending in `.editor/facilities.json`, the two
// lists' edits together, and "Finish", the session's, which writes the two files, raises the content
// version and runs the tests. It never commits.
//
// An effect added to or taken from a Facility goes with its grades' values in one hold (`effectAdd`,
// `effectRemove`): the content's checks require a value at every grade, so no edit alone could make it.

import { facilityEffects } from '@heroesim/content';
import type { ContentJson } from '@heroesim/content/uses';
import { kebabCase } from '@heroesim/content/write';
import { facilityEffectKinds, type FacilityEffectKind } from '@heroesim/engine/content';
import { contentFiles, type Edit } from './content-files.js';
import type { Finished } from './editor.js';
import { effectsOrdered, facilitiesKind, facilityUses, gradeKey, gradesOf, isObject, rowIn, rowsOf, rowWord, type FacilityList } from './facilities-kind.js';
import type { ListForm, Row, Use } from './kind.js';
import { EditSession, Refused } from './session.js';
import { npmTest, type TestRunner } from './tests-run.js';

/** A grade row as `show` gives it. */
export interface GradeView {
  key: string;
  grade: number;
  row: Row;
}

/** A row as the commands give it: its list and fields, whether an edit of it is pending, and for a Facility its grades and where it is used. */
export interface FacilityView {
  key: string;
  list: FacilityList;
  row: Row;
  pending: 'added' | 'changed' | null;
  /** A Facility's grade rows, lowest first. */
  grades?: GradeView[];
  /** A Facility's: where a grade names it or a Disposition's `buildOrder` lists it, which refuse its removal. */
  uses?: Use[];
}

/** `kind` as a Facility effect, or refused naming the kinds there are. */
function effectKindOf(kind: string | undefined): FacilityEffectKind {
  if (kind === undefined || !(facilityEffectKinds as readonly string[]).includes(kind)) {
    throw new Refused([`"${String(kind)}" is not an effect of a Facility: ${facilityEffectKinds.join(', ')}`]);
  }
  return kind as FacilityEffectKind;
}

/** A value an effect holds, refused where it is none of the kind's type, before the content's checks name its bounds. */
function valueOf(kind: FacilityEffectKind, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Refused([`${kind} is a number: ${facilityEffects[kind].label}, not ${JSON.stringify(value)}`]);
  return value;
}

export class FacilitiesEditor {
  readonly #session: EditSession<Edit, ContentJson>;

  constructor(readonly root: string) {
    this.#session = new EditSession(root, contentFiles(facilitiesKind));
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

  /** Makes `added` pending, together, once the edits with them pass the content's checks; gives the content with them. */
  #make(...added: Edit[]): ContentJson {
    const edits = this.edits();
    return this.#session.hold([...edits, ...added], edits.length);
  }

  // ── Reading ───────────────────────────────────────────────────────────────────────────────

  /** Every Facility, in content's order, with its grades and the pending edits made. */
  rows(): FacilityView[] {
    const content = this.working();
    const edits = this.edits();
    return rowsOf(content, 'facilities').map(([key, row]) => this.#view(content, edits, 'facilities', key, row));
  }

  /** One row of `list`, by key. */
  show(list: FacilityList, key: string): FacilityView {
    const content = this.working();
    return this.#view(content, this.edits(), list, key, this.#row(content, list, key));
  }

  /** The Facilities' keys, as content has them with the pending edits made. */
  facilityKeys(): string[] {
    return rowsOf(this.working(), 'facilities').map(([key]) => key);
  }

  /** The forms of both lists, their choices read from the content with the pending edits made. */
  forms(): ListForm[] {
    return facilitiesKind.forms(this.working());
  }

  #row(content: ContentJson, list: FacilityList, key: string): Row {
    const row = rowIn(content, list, key);
    if (row === undefined) {
      const keys = rowsOf(content, list).map(([each]) => each);
      throw new Refused([`"${key}" is not ${rowWord(list)}${keys.length === 0 ? '' : `: ${keys.join(', ')}`}`]);
    }
    return row;
  }

  /** The Facility `key`'s row, refused, naming the Facilities there are, where there is none. */
  #facility(content: ContentJson, key: string | undefined): Row {
    return this.#row(content, 'facilities', key ?? '');
  }

  #view(content: ContentJson, edits: readonly Edit[], list: FacilityList, key: string, row: Row): FacilityView {
    const mine = edits.filter((edit) => edit.list === list && edit.key === key);
    const pending = mine.some((edit) => edit.op === 'add') ? 'added' : mine.length > 0 ? 'changed' : null;
    if (list === 'grades') return { key, list, row, pending };
    const grades = gradesOf(content, key).map(({ key: name, grade, row: each }) => ({ key: name, grade, row: each }));
    return { key, list, row, pending, grades, uses: facilityUses(content, key) };
  }

  // ── Editing ───────────────────────────────────────────────────────────────────────────────

  /** Adds a Facility under a new `key`, fixed from now on, last in content's order. */
  add(key: string, values: Readonly<Record<string, unknown>>): FacilityView {
    // Refused while "Finish" runs, and one cut off put back, before anything else.
    this.recover();
    if (!kebabCase.test(key)) throw new Refused([`"${key}" is not a key: lower case letters and digits, joined by hyphens, starting with a letter`]);
    if (Object.hasOwn(values, 'key') && values.key !== key) throw new Refused(['a key is given once, as the row is added, not among its fields']);
    const { key: _key, ...fields } = values;
    void _key;
    const { row } = facilitiesKind.rowFrom('facilities', fields, undefined);
    const content = this.#make({ op: 'add', list: 'facilities', key, row });
    return this.#view(content, this.edits(), 'facilities', key, this.#row(content, 'facilities', key));
  }

  /** Changes the fields given of a Facility; its key stays. Its `effects` are given whole (`effectAdd` adds a kind with its grades' values). */
  change(key: string, values: Readonly<Record<string, unknown>>): FacilityView & { unchanged?: true } {
    return this.#change('facilities', key, values);
  }

  #change(list: FacilityList, key: string, values: Readonly<Record<string, unknown>>): FacilityView & { unchanged?: true } {
    if (Object.hasOwn(values, 'key') && values.key !== key) throw new Refused(['a key is fixed once made: add a new row instead']);
    const { key: _key, ...fields } = values;
    void _key;
    const before = this.working();
    const previous = this.#row(before, list, key);
    const { row } = facilitiesKind.rowFrom(list, fields, previous);
    // A change that changes nothing is not held (DL-163), its fields compared in the kind's order.
    if (JSON.stringify(row) === JSON.stringify(facilitiesKind.rowFrom(list, {}, previous).row)) return { ...this.#view(before, this.edits(), list, key, previous), unchanged: true };
    const content = this.#make({ op: 'change', list, key, fields });
    return this.#view(content, this.edits(), list, key, this.#row(content, list, key));
  }

  /** Removes a Facility; refused while a grade or a Disposition's `buildOrder` names it, naming each. */
  remove(key: string): { key: string; list: FacilityList } {
    const before = this.working();
    this.#facility(before, key);
    const uses = facilityUses(before, key);
    if (uses.length > 0) {
      const how = 'take out each grade with `facilities grade remove`, from the top, and the Facility from each `buildOrder`';
      throw new Refused([`"${key}" is used, and is not removed while it is: ${how}`, ...uses.map((use) => `used at ${use.at}`)], uses);
    }
    return this.#removeRow('facilities', key);
  }

  /**
   * Removes a row. A row added in this session goes with its edits, as if never made, where the edits
   * left pass the content's checks; else its removal is held after them.
   */
  #removeRow(list: FacilityList, key: string): { key: string; list: FacilityList } {
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

  // ── Grades ────────────────────────────────────────────────────────────────────────────────

  /** The grade `grade` of `facility`: its key and row, or a refusal naming the grades there are. */
  #grade(content: ContentJson, facility: string | undefined, grade: number | undefined): { key: string; row: Row } {
    this.#facility(content, facility);
    const grades = gradesOf(content, facility ?? '');
    const found = grades.find((each) => each.grade === grade);
    if (found === undefined) throw new Refused([`${facility ?? ''} has no grade ${String(grade)}: ${grades.length === 0 ? 'it has none' : `its grades are ${grades.map((each) => each.grade).join(', ')}`}`]);
    return found;
  }

  /** Adds the next grade of a Facility, 1 above its top, as the Improvement `<facility>-<n>`. */
  gradeAdd(facility: string, values: Readonly<Record<string, unknown>>): FacilityView {
    this.recover();
    const content = this.working();
    this.#facility(content, facility);
    const grades = gradesOf(content, facility);
    const next = Math.max(0, ...grades.map((each) => each.grade).filter(Number.isFinite)) + 1;
    const key = gradeKey(facility, next);
    if (rowIn(content, 'grades', key) !== undefined) throw new Refused([`"${key}" is a grade already`]);
    if (values.facility !== undefined && values.facility !== facility) throw new Refused([`a grade of ${facility} names ${facility}, not ${JSON.stringify(values.facility)}`]);
    if (values.grade !== undefined && values.grade !== next) throw new Refused([`the next grade of ${facility} is ${next}, not ${JSON.stringify(values.grade)}: the grades run 1 to n with no gap`]);
    const { facility: _facility, grade: _grade, key: _key, ...rest } = values;
    void _facility;
    void _grade;
    void _key;
    const { row } = facilitiesKind.rowFrom('grades', { facility, grade: next, ...rest }, undefined);
    const made = this.#make({ op: 'add', list: 'grades', key, row });
    return this.#view(made, this.edits(), 'grades', key, this.#row(made, 'grades', key));
  }

  /** Changes the fields given of a grade: its cost, name or effects (given whole); its Facility and number are fixed. */
  gradeChange(facility: string, grade: number, values: Readonly<Record<string, unknown>>): FacilityView & { unchanged?: true } {
    const { key } = this.#grade(this.working(), facility, grade);
    if ((values.facility !== undefined && values.facility !== facility) || (values.grade !== undefined && values.grade !== grade)) {
      throw new Refused(["a grade's Facility and number are fixed once made: add the grade to the Facility you mean"]);
    }
    const { facility: _facility, grade: _grade, ...rest } = values;
    void _facility;
    void _grade;
    return this.#change('grades', key, rest);
  }

  /** Removes the top grade of a Facility; a lower one would leave a gap in the grades. */
  gradeRemove(facility: string, grade: number): { key: string; list: FacilityList } {
    const content = this.working();
    const { key } = this.#grade(content, facility, grade);
    const top = Math.max(...gradesOf(content, facility).map((each) => each.grade));
    if (grade !== top) throw new Refused([`only the top grade of ${facility}, ${top}, is removed: the grades run 1 to n with no gap`]);
    return this.#removeRow('grades', key);
  }

  // ── Effects ───────────────────────────────────────────────────────────────────────────────

  /** `rows` of `facility`'s: the Facility's own, then its grades', as (list, key, row) in grade order. */
  #chain(content: ContentJson, facility: string): { list: FacilityList; key: string; row: Row }[] {
    return [{ list: 'facilities', key: facility, row: this.#facility(content, facility) }, ...gradesOf(content, facility).map((each) => ({ list: 'grades' as const, key: each.key, row: each.row }))];
  }

  /** `row`'s effects as written. */
  static #effectsOf(row: Row): Row {
    return isObject(row.effects) ? row.effects : {};
  }

  /** Adds an effect to a Facility with its value at grade 0 and at each of its grades, in one hold: `amounts` are the values from grade 0 up. */
  effectAdd(facility: string, kind: string | undefined, amounts: readonly unknown[]): FacilityView {
    this.recover();
    const named = effectKindOf(kind);
    const content = this.working();
    const chain = this.#chain(content, facility);
    if (Object.hasOwn(FacilitiesEditor.#effectsOf(chain[0]?.row ?? {}), named)) throw new Refused([`${facility} has the ${named} effect already: \`facilities effect set\` changes a value`]);
    if (amounts.length !== chain.length) {
      const where = chain.length === 1 ? 'grade 0, it has no grade' : `grade 0 and each of its ${chain.length - 1} ${chain.length === 2 ? 'grade' : 'grades'}`;
      throw new Refused([`${named} wants a value at ${where}: ${chain.length} ${chain.length === 1 ? 'value' : 'values'}, from grade 0 up, not ${amounts.length}`]);
    }
    const edits: Edit[] = chain.map(({ list, key, row }, index) => ({
      op: 'change',
      list,
      key,
      fields: { effects: effectsOrdered({ ...FacilitiesEditor.#effectsOf(row), [named]: valueOf(named, amounts[index]) }) },
    }));
    const made = this.#make(...edits);
    return this.#view(made, this.edits(), 'facilities', facility, this.#row(made, 'facilities', facility));
  }

  /** Sets the value of an effect a Facility has, at grade 0 (the Facility's row) or at a grade (its row). */
  effectSet(facility: string, kind: string | undefined, grade: number | undefined, value: unknown): FacilityView & { unchanged?: true } {
    this.recover();
    const named = effectKindOf(kind);
    const content = this.working();
    this.#facility(content, facility);
    if (grade === undefined || !Number.isSafeInteger(grade) || grade < 0) throw new Refused([`${String(grade)} is not a grade: a whole number from 0, the Facility's own`]);
    const at = grade === 0 ? { list: 'facilities' as const, key: facility, row: this.#facility(content, facility) } : { list: 'grades' as const, ...this.#grade(content, facility, grade) };
    const effects = FacilitiesEditor.#effectsOf(at.row);
    if (!Object.hasOwn(effects, named)) throw new Refused([`${facility} has no ${named} effect${grade === 0 ? '' : ` at grade ${grade}`}: \`facilities effect add\` gives it with a value at each grade`]);
    const changed = this.#change(at.list, at.key, { effects: effectsOrdered({ ...effects, [named]: valueOf(named, value) }) });
    return { ...this.#view(this.working(), this.edits(), 'facilities', facility, this.#facility(this.working(), facility)), ...(changed.unchanged === true ? { unchanged: true as const } : {}) };
  }

  /** Takes an effect from a Facility and from each of its grades, in one hold; refused where it would leave the Facility none. */
  effectRemove(facility: string, kind: string | undefined): FacilityView {
    this.recover();
    const named = effectKindOf(kind);
    const content = this.working();
    const chain = this.#chain(content, facility);
    if (!Object.hasOwn(FacilitiesEditor.#effectsOf(chain[0]?.row ?? {}), named)) throw new Refused([`${facility} has no ${named} effect`]);
    const edits: Edit[] = chain.map(({ list, key, row }) => {
      const { [named]: _gone, ...left } = FacilitiesEditor.#effectsOf(row);
      void _gone;
      return { op: 'change', list, key, fields: { effects: left } };
    });
    const made = this.#make(...edits);
    return this.#view(made, this.edits(), 'facilities', facility, this.#row(made, 'facilities', facility));
  }

  /** Drops the pending edits of both lists, or of the Facility `key` and its grades. */
  discard(key?: string): { discarded: number; left: number; unreadable?: true } {
    return this.#session.discard((edit) => key === undefined || edit.key === key || (edit.list === 'grades' && edit.key.startsWith(`${key}-`) && /^\d+$/.test(edit.key.slice(key.length + 1))));
  }

  // ── Finish ────────────────────────────────────────────────────────────────────────────────

  /** The session's "Finish": writes every pending edit of both lists, raises the content version by one and runs the tests, putting every file back if any fails. */
  async finish(runTests: TestRunner = npmTest, onLine: (line: string) => void = () => {}): Promise<Finished> {
    const { ok, edits, changed, version, tests } = await this.#session.finish({ runTests, onLine });
    return { ok, edits, changed, contentVersion: version, tests };
  }
}
