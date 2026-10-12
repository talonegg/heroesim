// `facilities doctor` (DL-297): the Facilities and their grades held to what a Hall reads,
// beside the content's checks, and the pending edits held to both. Every grade names a Facility and
// each Facility's grades run 1 to n with no gap, each holding exactly its Facility's effects; each
// grade costs more than the one below; every Disposition that writes a `buildOrder` lists each
// Facility once. It notes, without failing, a grade that does no more than the one below (DL-53) and
// content with no Facility that heals, which the harness's policy builds first. Like every command it
// first puts back the files of a "Finish" cut off, and says so; while one runs it says that, and
// checks no edit. docs/agents/facilities.md has it run before and after a change, and at the close of each story
// that touches the engine or the content's checks.

import { placeOf } from '@heroesim/content';
import type { ContentJson } from '@heroesim/content/uses';
import { contentChecks } from '@heroesim/content/write';
import { facilityEffectKinds } from '@heroesim/engine/content';
import { readContentFiles } from './content-files.js';
import { FacilitiesEditor } from './facilities-editor.js';
import { gradesOf, isObject, rowsOf } from './facilities-kind.js';
import { Busy } from './finish-journal.js';
import type { Row } from './kind.js';

/** One of the doctor's checks: whether it passed, what it counted, and each problem. */
export interface FacilityCheck {
  ok: boolean;
  count: number;
  problems: string[];
}

/** The doctor's checks of the Facilities on one state of the content. */
export interface FacilityChecks {
  facilities: number;
  /** Every grade names a Facility; each Facility's grades run 1 to n; each holds exactly its Facility's effects. */
  grades: FacilityCheck;
  /** Each grade costs more than the one below. */
  costs: FacilityCheck;
  /** Each Disposition's `buildOrder`, where it writes one, lists each Facility once. */
  orders: FacilityCheck;
  /** Noted, not failed: a grade that does no more than the one below, and no Facility that heals. */
  notes: string[];
}

export interface FacilitiesDoctor {
  ok: boolean;
  content: { ok: boolean; problems: string[] };
  facilities: FacilityChecks;
  pending: { ok: boolean; edits: number; problems: string[] };
  finish: { running: boolean; recovered: string[] };
}

const check = (count: number, problems: string[]): FacilityCheck => ({ ok: problems.length === 0, count, problems });
const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
const effectsOf = (row: Row): Row => (isObject(row.effects) ? row.effects : {});
const list = (words: readonly string[]): string => (words.length === 0 ? 'none' : words.join(', '));

/** The doctor's checks of the Facilities and grades in `content`, each row read as far as it is of its shape: the content's checks name the rest. */
export function facilityChecks(content: ContentJson): FacilityChecks {
  const facilities = rowsOf(content, 'facilities');
  const grades = rowsOf(content, 'grades');
  const keys = facilities.map(([key]) => key);
  const at = (key: string): string => placeOf('improvements.json', [key]);

  const gradeProblems: string[] = [];
  for (const [key, row] of grades) {
    if (typeof row.facility !== 'string' || !keys.includes(row.facility)) gradeProblems.push(`${at(key)}: facility ${JSON.stringify(row.facility)} is not a Facility (${list(keys)})`);
  }
  const costProblems: string[] = [];
  const notes: string[] = [];
  for (const [facility, row] of facilities) {
    const mine = gradesOf(content, facility);
    const numbers = mine.map((each) => each.grade);
    if (numbers.some((grade, index) => grade !== index + 1)) gradeProblems.push(`improvements.json: the grades of ${facility} are ${list(numbers.map(String))}; they run 1 to ${numbers.length}, each once`);
    const kinds = Object.keys(effectsOf(row));
    for (const { key, row: grade } of mine) {
      const held = Object.keys(effectsOf(grade));
      if (kinds.length !== held.length || kinds.some((kind) => !held.includes(kind))) gradeProblems.push(`${at(key)}: its effects are ${list(held)}; ${facility} has ${list(kinds)}`);
    }
    // From grade 0 up: each costs more than the one below (grade 0 costs nothing), and does more (DL-53).
    mine.forEach(({ key, row: grade }, index) => {
      const below = mine[index - 1];
      if (below !== undefined && typeof grade.cost === 'number' && typeof below.row.cost === 'number' && grade.cost <= below.row.cost) {
        costProblems.push(`${at(key)}: costs ${grade.cost}, no more than ${below.key}'s ${below.row.cost}`);
      }
      const underneath = below === undefined ? row : below.row;
      const underneathKey = below === undefined ? `${facility} at grade 0` : below.key;
      for (const kind of facilityEffectKinds) {
        const now = effectsOf(grade)[kind];
        const was = effectsOf(underneath)[kind];
        if (typeof now !== 'number' || typeof was !== 'number') continue;
        // A heal factor multiplies an Injury's Days, so it falls; the others add, so they rise.
        if (kind === 'healFactor' ? now >= was : now <= was) notes.push(`${at(key)}: ${kind} is ${now}, ${kind === 'healFactor' ? 'no lower' : 'no higher'} than ${underneathKey}'s ${was}`);
      }
    });
  }
  const orderProblems: string[] = [];
  let ordered = 0;
  const dispositions = isObject(content['dispositions.json']) ? Object.entries(content['dispositions.json']) : [];
  for (const [name, row] of dispositions) {
    if (!isObject(row) || row.buildOrder === undefined) continue;
    ordered += 1;
    const order = Array.isArray(row.buildOrder) ? row.buildOrder.map(String) : [];
    if (order.length !== keys.length || keys.some((key) => order.filter((each) => each === key).length !== 1)) {
      orderProblems.push(`${placeOf('dispositions.json', [name, 'buildOrder'])}: it lists ${list(order)}; it lists each of ${list(keys)} once`);
    }
  }
  if (!facilities.some(([, row]) => Object.hasOwn(effectsOf(row), 'healFactor'))) {
    notes.push('No Facility has the healFactor effect: the harness policy builds the first that has it, and with none it builds nothing (DL-297)');
  }
  return { facilities: facilities.length, grades: check(grades.length, gradeProblems), costs: check(grades.length, costProblems), orders: check(ordered, orderProblems), notes };
}

/** Each problem of `checks`. */
function problemsOf(checks: FacilityChecks): string[] {
  return [checks.grades, checks.costs, checks.orders].flatMap((each) => each.problems);
}

export function facilitiesDoctor(root: string): FacilitiesDoctor {
  const editor = new FacilitiesEditor(root);
  let finish: FacilitiesDoctor['finish'];
  let pending: FacilitiesDoctor['pending'];
  try {
    finish = { running: false, recovered: editor.recover() };
    let edits = 0;
    try {
      edits = editor.edits().length;
    } catch {
      // Named among the problems below.
    }
    const problems = editor.pendingProblems();
    // The pending edits held to the doctor's checks too, where they apply and pass the content's.
    const held = problems.length === 0 && edits > 0 ? problemsOf(facilityChecks(editor.working())) : [];
    pending = { ok: problems.length === 0 && held.length === 0, edits, problems: [...problems, ...held] };
  } catch (error) {
    if (!(error instanceof Busy)) throw error;
    finish = { running: true, recovered: [] };
    pending = { ok: false, edits: 0, problems: [...error.problems] };
  }
  const content = contentChecks(root);
  const facilities = facilityChecks(readContentFiles(root).values);
  return { ok: content.ok && problemsOf(facilities).length === 0 && pending.ok, content, facilities, pending, finish };
}

/** The doctor's report in lines for a person. */
export function facilitiesDoctorText(report: FacilitiesDoctor): string[] {
  const line = (ok: boolean, passed: string, failed: string, problems: readonly string[]): string[] => (ok ? [`✓ ${passed}`] : [`✗ ${failed}`, ...problems.map((problem) => `    ${problem}`)]);
  const { facilities } = report;
  const counted = `${plural(facilities.facilities, 'Facility', 'Facilities')}, ${plural(facilities.grades.count, 'grade')}`;
  return [
    ...(report.finish.recovered.length > 0 ? [`! A "Finish" was cut off: ${report.finish.recovered.length} files are put back as they were`] : []),
    ...line(report.content.ok, `The content passes its checks: ${counted}`, 'The content fails its checks', report.content.problems),
    ...line(facilities.grades.ok, `Every grade names a Facility, the grades run 1 to n with no gap and hold exactly its Facility's effects: ${counted}`, 'A Facility has a grade it should not or lacks one', facilities.grades.problems),
    ...line(facilities.costs.ok, `Each grade costs more than the one below: ${plural(facilities.costs.count, 'grade')}`, 'A grade costs no more than the one below', facilities.costs.problems),
    ...line(
      facilities.orders.ok,
      `Every build order lists each Facility once: ${plural(facilities.orders.count, 'Disposition')} write${facilities.orders.count === 1 ? 's' : ''} one`,
      'A build order does not list each Facility once',
      facilities.orders.problems,
    ),
    ...facilities.notes.map((note) => `! ${note}`),
    ...line(
      report.pending.ok,
      report.pending.edits === 0 ? 'No pending edits' : `${plural(report.pending.edits, 'pending edit')}, passing the content's checks and these`,
      report.finish.running ? '"Finish" is running' : 'The pending edits fail',
      report.pending.problems,
    ),
  ];
}
