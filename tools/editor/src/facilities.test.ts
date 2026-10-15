import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadContent } from '@heroesim/content/node';
import { readContentVersion } from '@heroesim/content/write';
import { afterEach, describe, expect, test } from 'vitest';
import { journalPath, writeAtomically } from './finish-journal.js';
import { serve } from './server.js';
import { pendingPath } from './session.js';
import { command, json, plantedGrades, plantFacilities, plantOutcome, plantedFacilities, plantedTests, readContentJson, scratch, scratchRepository, status, writeContentJson } from './test-support.js';

// The Facilities' and their grades' commands (DL-297), each driven through both of their
// adapters, the command line (`npm run edit -- facilities …`) and the page's API (`/api/facilities/…`),
// on two scratch copies of the repository side by side: the same JSON from each, the same answer's kind,
// and the same pending edits left behind. A refused change names its reason and holds nothing. The rows
// the tests read are planted (`plantedFacilities`, DL-272).

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/* eslint-disable @typescript-eslint/no-explicit-any -- the commands' JSON, read by the test as it stands */
type Json = any;

/** The answer's kind the API gives for a command line's exit code and JSON. */
function statusOf(code: number, answer: Json): number {
  if (code === 0) return 200;
  if (code === 2) return 400;
  // The doctor's report is an answer, whatever it finds.
  if (answer !== null && typeof answer === 'object' && 'facilities' in answer && 'content' in answer) return 200;
  return answer?.kind === 'busy' || (answer?.kind === 'refused' && Array.isArray(answer.uses)) ? 409 : 422;
}

/**
 * Two scratch copies, one driven by the command line and one served and driven through the API:
 * `both` runs a command through each, holds their JSON, answers and pending edits the same, and gives
 * the command line's.
 */
async function pair(): Promise<{
  cliDir: string;
  apiDir: string;
  url: string;
  both: (cli: readonly string[], method: 'GET' | 'POST', route: string, body?: unknown) => Promise<{ code: number; json: Json }>;
}> {
  const cliDir = scratch();
  const { dir: apiDir, remove } = scratchRepository();
  cleanups.push(remove);
  for (const dir of [cliDir, apiDir]) plantFacilities(dir);
  const page = await serve({ root: apiDir, port: 0, runTests: plantedTests });
  cleanups.push(() => page.close());
  const pending = (dir: string): string | null => (existsSync(pendingPath(dir, 'facilities')) ? readFileSync(pendingPath(dir, 'facilities'), 'utf8') : null);
  const both = async (cli: readonly string[], method: 'GET' | 'POST', route: string, body?: unknown): Promise<{ code: number; json: Json }> => {
    const viaCli = await json<Json>(cliDir, ...cli);
    const response = await fetch(new URL(route, page.url), {
      method,
      ...(method === 'GET' ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
    });
    const viaApi = (await response.json()) as Json;
    expect(viaApi, `${cli.join(' ')} through the API`).toEqual(viaCli.json);
    expect(response.status, `${cli.join(' ')}'s answer through the API`).toBe(statusOf(viaCli.code, viaCli.json));
    expect(pending(apiDir)).toBe(pending(cliDir));
    return viaCli;
  };
  return { cliDir, apiDir, url: page.url, both };
}

const problemsOf = (answer: Json): string => (answer.problems as string[]).join('\n');

/** A chapel: a fourth Facility, with a heal factor and a Morale baseline. */
const chapel = { name: 'chapel', plural: false, upkeep: 20, effects: { healFactor: 1, moraleBaseline: 0 } };

describe('reading, through both adapters', () => {
  test('facilities list and show give every Facility in content’s order with its grades, and one with where it is used', async () => {
    const { cliDir, both } = await pair();
    const listed = await both(['facilities', 'list'], 'GET', '/api/facilities/list');
    expect(listed.code).toBe(0);
    expect(listed.json.rows.map((row: Json) => row.key)).toEqual(Object.keys(plantedFacilities));
    expect(listed.json.rows[2].grades.map((grade: Json) => [grade.key, grade.grade])).toEqual([['quarters-1', 1], ['quarters-2', 2], ['quarters-3', 3]]);
    expect(listed.json.pending).toBe(0);

    const shown = await both(['facilities', 'show', 'quarters'], 'GET', '/api/facilities/show?key=quarters');
    expect(shown.json.row).toEqual(plantedFacilities.quarters);
    expect(shown.json.uses.map((use: Json) => use.at)).toEqual(['improvements.json: quarters-1.facility', 'improvements.json: quarters-2.facility', 'improvements.json: quarters-3.facility']);
    const text = await command(['facilities', 'show', 'quarters', '--root', cliDir]);
    expect(text.out.split('\n')).toEqual([
      'quarters — quarters (plural): upkeep 15 Silver; moraleBaseline 0, fatigueFall 5; 3 grades',
      'Grades:',
      "  0 (the Facility's own): moraleBaseline 0, fatigueFall 5",
      '  1 quarters-1 "Dormitory", cost 200 Silver: moraleBaseline 5, fatigueFall 6',
      '  2 quarters-2 "Private rooms", cost 500 Silver: moraleBaseline 10, fatigueFall 7',
      '  3 quarters-3 "Lodgings", cost 1000 Silver: moraleBaseline 15, fatigueFall 8',
      'Uses:',
      '  improvements.json: quarters-1.facility',
      '  improvements.json: quarters-2.facility',
      '  improvements.json: quarters-3.facility',
    ]);

    const unknown = await both(['facilities', 'show', 'library'], 'GET', '/api/facilities/show?key=library');
    expect(unknown).toEqual({ code: 1, json: { ok: false, kind: 'refused', problems: ['"library" is not a Facility: infirmary, training-yard, quarters'] } });
  });

  test('facilities forms gives the fields of a Facility and a grade and each effect with its bounds, derived from content’s description', async () => {
    const { both } = await pair();
    const forms = await both(['facilities', 'forms'], 'GET', '/api/facilities/forms');
    expect(forms.json.forms.map((form: Json) => [form.list, form.fields.map((field: Json) => field.name)])).toEqual([
      ['facilities', ['name', 'plural', 'upkeep', 'effects']],
      ['grades', ['facility', 'grade', 'cost', 'name', 'effects']],
    ]);
    expect(forms.json.forms[1].fields[0].choices).toEqual(['infirmary', 'training-yard', 'quarters']);
    expect(forms.json.forms[0].effects.map((effect: Json) => effect.kind)).toEqual(['healFactor', 'trainingXp', 'moraleBaseline', 'fatigueFall']);
  });
});

describe('adding, changing and removing a Facility, through both adapters', () => {
  test('add holds a fourth Facility, last in content’s order, its fields in the kind’s order, and names it', async () => {
    const { cliDir, both } = await pair();
    const added = await both(['facilities', 'add', 'chapel', '--row', JSON.stringify({ effects: chapel.effects, upkeep: 20, plural: false, name: 'chapel' })], 'POST', '/api/facilities/add', {
      key: 'chapel',
      values: { effects: chapel.effects, upkeep: 20, plural: false, name: 'chapel' },
    });
    expect(added.json).toMatchObject({ ok: true, pending: 1, row: { key: 'chapel', list: 'facilities', row: chapel, pending: 'added', grades: [] } });
    expect(Object.keys(added.json.row.row)).toEqual(['name', 'plural', 'upkeep', 'effects']);
    expect((await both(['facilities', 'list'], 'GET', '/api/facilities/list')).json.rows.map((row: Json) => row.key)).toEqual([...Object.keys(plantedFacilities), 'chapel']);
    const text = await command(['facilities', 'list', '--root', cliDir]);
    expect(text.out).toContain('chapel — chapel: upkeep 20 Silver; healFactor 1, moraleBaseline 0; 0 grades (added, pending)');
  });

  test('add is refused, holding nothing, for a key that is no key or one in use, a field a Facility lacks, an effect it has none of or out of bounds, and a Disposition’s build order it is not in', async () => {
    const { cliDir, apiDir, both } = await pair();
    const refuse = async (key: string, values: unknown, expected: string): Promise<void> => {
      const refused = await both(['facilities', 'add', key, '--row', JSON.stringify(values)], 'POST', '/api/facilities/add', { key, values });
      expect(refused.code, `${key} ${JSON.stringify(values)}`).toBe(1);
      expect(problemsOf(refused.json)).toContain(expected);
    };
    await refuse('Chapel', chapel, '"Chapel" is not a key');
    await refuse('quarters', chapel, '"quarters" is a key already, in facilities');
    await refuse('chapel', { ...chapel, colour: 'grey' }, 'colour');
    await refuse('chapel', { ...chapel, effects: {} }, 'facilities.chapel.effects is empty: a Facility has at least one effect');
    await refuse('chapel', { ...chapel, effects: { healFactor: 0 } }, 'facilities.chapel.effects.healFactor is 0; it is a number above 0');
    await refuse('chapel', { ...chapel, effects: { luck: 1 } }, 'is not a field');
    await refuse('chapel', { ...chapel, upkeep: -1 }, 'facilities.chapel.upkeep is -1; it is a whole number of 0 or more');
    for (const dir of [cliDir, apiDir]) expect(existsSync(pendingPath(dir, 'facilities'))).toBe(false);

    // A Disposition that writes a build order must list the new Facility.
    for (const dir of [cliDir, apiDir]) {
      const dispositions = readContentJson<Record<string, Record<string, unknown>>>(dir, 'dispositions.json');
      writeContentJson(dir, 'dispositions.json', { ...dispositions, steady: { ...dispositions.steady, buildOrder: ['quarters', 'infirmary', 'training-yard'] } });
    }
    await refuse('chapel', chapel, '"chapel" is not in the order');
  });

  test('change sets the fields given, takes effects whole, holds nothing for a change that changes nothing, and refuses a new key and a value out of bounds', async () => {
    const { both } = await pair();
    const changed = await both(['facilities', 'change', 'infirmary', 'upkeep=20', 'name=sickbay'], 'POST', '/api/facilities/change', { key: 'infirmary', values: { upkeep: 20, name: 'sickbay' } });
    expect(changed.json.row.row).toEqual({ name: 'sickbay', plural: false, upkeep: 20, effects: { healFactor: 1 } });
    expect(changed.json.row.pending).toBe('changed');

    const same = await both(['facilities', 'change', 'infirmary', 'upkeep=20'], 'POST', '/api/facilities/change', { key: 'infirmary', values: { upkeep: 20 } });
    expect(same.json).toMatchObject({ ok: true, unchanged: true, pending: 1 });

    const renamed = await both(['facilities', 'change', 'infirmary', 'key=sickbay'], 'POST', '/api/facilities/change', { key: 'infirmary', values: { key: 'sickbay' } });
    expect(problemsOf(renamed.json)).toBe('a key is fixed once made: add a new row instead');
    const bad = await both(['facilities', 'change', 'quarters', 'upkeep=-3'], 'POST', '/api/facilities/change', { key: 'quarters', values: { upkeep: -3 } });
    expect(problemsOf(bad.json)).toContain('facilities.quarters.upkeep is -3');
    // Effects given whole: one a grade holds a value of cannot be dropped alone.
    const dropped = await both(['facilities', 'change', 'quarters', '--effects', '{"moraleBaseline":0}'], 'POST', '/api/facilities/change', { key: 'quarters', values: { effects: { moraleBaseline: 0 } } });
    expect(problemsOf(dropped.json)).toContain('improvements.quarters-1.effects.fatigueFall: quarters has no fatigueFall effect');
    expect((await both(['facilities', 'pending'], 'GET', '/api/facilities/pending')).json.edits).toHaveLength(1);
  });

  test('remove is refused while a grade or a build order names the Facility, naming each use; a Facility added and removed leaves nothing pending', async () => {
    const { cliDir, apiDir, both } = await pair();
    for (const dir of [cliDir, apiDir]) {
      const dispositions = readContentJson<Record<string, Record<string, unknown>>>(dir, 'dispositions.json');
      writeContentJson(dir, 'dispositions.json', { ...dispositions, steady: { ...dispositions.steady, buildOrder: ['quarters', 'infirmary', 'training-yard'] } });
    }
    const refused = await both(['facilities', 'remove', 'infirmary'], 'POST', '/api/facilities/remove', { key: 'infirmary' });
    expect(refused.code).toBe(1);
    expect(refused.json.kind).toBe('refused');
    expect(refused.json.problems).toEqual([
      '"infirmary" is used, and is not removed while it is: take out each grade with `facilities grade remove`, from the top, and the Facility from each `buildOrder`',
      'used at improvements.json: infirmary-1.facility',
      'used at improvements.json: infirmary-2.facility',
      'used at improvements.json: infirmary-3.facility',
      'used at dispositions.json: steady.buildOrder.1',
    ]);
    expect(refused.json.uses).toHaveLength(4);

    for (const dir of [cliDir, apiDir]) {
      const dispositions = readContentJson<Record<string, Record<string, unknown>>>(dir, 'dispositions.json');
      writeContentJson(dir, 'dispositions.json', { ...dispositions, steady: { ...dispositions.steady, buildOrder: undefined } });
    }
    // Neither build order nor grade: a Facility with none is removed, one added in this session goes with its edits.
    await both(['facilities', 'add', 'chapel', '--row', JSON.stringify(chapel)], 'POST', '/api/facilities/add', { key: 'chapel', values: chapel });
    const removed = await both(['facilities', 'remove', 'chapel'], 'POST', '/api/facilities/remove', { key: 'chapel' });
    expect(removed.json).toEqual({ ok: true, key: 'chapel', list: 'facilities', pending: 0 });
    expect((await both(['facilities', 'pending'], 'GET', '/api/facilities/pending')).json).toEqual({ edits: [] });
  });
});

describe('grades, through both adapters', () => {
  test('grade add holds the next grade of a Facility as <facility>-<n>, after its last grade, and refuses what the grades or the rules refuse', async () => {
    const { both } = await pair();
    const fields = { name: 'Chantry', cost: 2000, effects: { healFactor: 0.1 } };
    const added = await both(['facilities', 'grade', 'add', 'infirmary', 'name=Chantry', 'cost=2000', 'effects={"healFactor":0.1}'], 'POST', '/api/facilities/grade/add', { key: 'infirmary', values: fields });
    expect(added.json).toMatchObject({ ok: true, pending: 1, row: { key: 'infirmary-4', list: 'grades', pending: 'added', row: { facility: 'infirmary', grade: 4, cost: 2000, name: 'Chantry', effects: { healFactor: 0.1 } } } });
    expect(Object.keys(added.json.row.row)).toEqual(['facility', 'grade', 'cost', 'name', 'effects']);
    const shown = await both(['facilities', 'show', 'infirmary'], 'GET', '/api/facilities/show?key=infirmary');
    expect(shown.json.grades.map((grade: Json) => grade.key)).toEqual(['infirmary-1', 'infirmary-2', 'infirmary-3', 'infirmary-4']);

    const refuse = async (facility: string, values: unknown, expected: string): Promise<void> => {
      const refused = await both(['facilities', 'grade', 'add', facility, '--row', JSON.stringify(values)], 'POST', '/api/facilities/grade/add', { key: facility, values });
      expect(refused.code, JSON.stringify(values)).toBe(1);
      expect(problemsOf(refused.json)).toContain(expected);
    };
    await refuse('library', fields, '"library" is not a Facility');
    await refuse('quarters', { ...fields, grade: 7 }, 'the next grade of quarters is 4, not 7');
    await refuse('quarters', { ...fields, facility: 'infirmary' }, 'a grade of quarters names quarters');
    await refuse('quarters', { name: 'Hall', cost: 2000, effects: { moraleBaseline: 20 } }, 'improvements.quarters-4.effects: fatigueFall, an effect of quarters, has no value at this grade');
    await refuse('quarters', { name: 'Hall', cost: 2000, effects: { moraleBaseline: 20, fatigueFall: 9, healFactor: 1 } }, 'improvements.quarters-4.effects.healFactor: quarters has no healFactor effect');
    await refuse('quarters', { name: 'Hall', cost: 0, effects: { moraleBaseline: 20, fatigueFall: 9 } }, 'improvements.quarters-4.cost is 0; it is a whole number above 0');
    expect((await both(['facilities', 'pending'], 'GET', '/api/facilities/pending')).json.edits).toHaveLength(1);
  });

  test('grade change sets a grade’s cost, name or effects; its Facility and number are fixed; grade remove takes the top grade alone', async () => {
    const { both } = await pair();
    const changed = await both(['facilities', 'grade', 'change', 'quarters', '2', 'cost=600'], 'POST', '/api/facilities/grade/change', { key: 'quarters', grade: 2, values: { cost: 600 } });
    expect(changed.json.row.row).toEqual({ facility: 'quarters', grade: 2, cost: 600, name: 'Private rooms', effects: { moraleBaseline: 10, fatigueFall: 7 } });

    const fixed = await both(['facilities', 'grade', 'change', 'quarters', '2', 'grade=5'], 'POST', '/api/facilities/grade/change', { key: 'quarters', grade: 2, values: { grade: 5 } });
    expect(problemsOf(fixed.json)).toContain("a grade's Facility and number are fixed once made");
    const none = await both(['facilities', 'grade', 'change', 'quarters', '9', 'cost=600'], 'POST', '/api/facilities/grade/change', { key: 'quarters', grade: 9, values: { cost: 600 } });
    expect(problemsOf(none.json)).toBe('quarters has no grade 9: its grades are 1, 2, 3');

    const gap = await both(['facilities', 'grade', 'remove', 'quarters', '2'], 'POST', '/api/facilities/grade/remove', { key: 'quarters', grade: 2 });
    expect(problemsOf(gap.json)).toBe('only the top grade of quarters, 3, is removed: the grades run 1 to n with no gap');
    const removed = await both(['facilities', 'grade', 'remove', 'quarters', '3'], 'POST', '/api/facilities/grade/remove', { key: 'quarters', grade: 3 });
    expect(removed.json).toEqual({ ok: true, key: 'quarters-3', list: 'grades', pending: 2 });
    const shown = await both(['facilities', 'show', 'quarters'], 'GET', '/api/facilities/show?key=quarters');
    expect(shown.json.grades.map((grade: Json) => grade.key)).toEqual(['quarters-1', 'quarters-2']);
  });

  test('a grade added and removed in one session leaves nothing pending; discard drops a Facility’s edits and its grades’, and with no key every edit', async () => {
    const { both } = await pair();
    await both(['facilities', 'grade', 'add', 'quarters', 'name=Hall', 'cost=2000', 'effects={"moraleBaseline":20,"fatigueFall":9}'], 'POST', '/api/facilities/grade/add', {
      key: 'quarters',
      values: { name: 'Hall', cost: 2000, effects: { moraleBaseline: 20, fatigueFall: 9 } },
    });
    expect((await both(['facilities', 'grade', 'remove', 'quarters', '4'], 'POST', '/api/facilities/grade/remove', { key: 'quarters', grade: 4 })).json.pending).toBe(0);
    await both(['facilities', 'grade', 'change', 'quarters', '1', 'cost=250'], 'POST', '/api/facilities/grade/change', { key: 'quarters', grade: 1, values: { cost: 250 } });
    await both(['facilities', 'change', 'quarters', 'upkeep=30'], 'POST', '/api/facilities/change', { key: 'quarters', values: { upkeep: 30 } });
    await both(['facilities', 'change', 'infirmary', 'upkeep=30'], 'POST', '/api/facilities/change', { key: 'infirmary', values: { upkeep: 30 } });
    const discarded = await both(['facilities', 'discard', 'quarters'], 'POST', '/api/facilities/discard', { key: 'quarters' });
    expect(discarded.json).toEqual({ ok: true, discarded: 2, left: 1 });
    const all = await both(['facilities', 'discard'], 'POST', '/api/facilities/discard', {});
    expect(all.json).toEqual({ ok: true, discarded: 1, left: 0 });
    expect((await both(['facilities', 'pending'], 'GET', '/api/facilities/pending')).json.edits).toEqual([]);
  });
});

describe('effects, through both adapters', () => {
  test('effect add gives a Facility an effect with its value at grade 0 and at each grade, in one hold', async () => {
    const { both } = await pair();
    const added = await both(['facilities', 'effect', 'add', 'infirmary', 'moraleBaseline', '0', '1', '2', '3'], 'POST', '/api/facilities/effect/add', { key: 'infirmary', kind: 'moraleBaseline', amounts: [0, 1, 2, 3] });
    expect(added.json.pending).toBe(4);
    const shown = await both(['facilities', 'show', 'infirmary'], 'GET', '/api/facilities/show?key=infirmary');
    expect(shown.json.row.effects).toEqual({ healFactor: 1, moraleBaseline: 0 });
    expect(shown.json.grades.map((grade: Json) => grade.row.effects)).toEqual([
      { healFactor: 0.5, moraleBaseline: 1 },
      { healFactor: 0.3, moraleBaseline: 2 },
      { healFactor: 0.2, moraleBaseline: 3 },
    ]);

    const few = await both(['facilities', 'effect', 'add', 'training-yard', 'fatigueFall', '5', '6'], 'POST', '/api/facilities/effect/add', { key: 'training-yard', kind: 'fatigueFall', amounts: [5, 6] });
    expect(problemsOf(few.json)).toBe('fatigueFall wants a value at grade 0 and each of its 3 grades: 4 values, from grade 0 up, not 2');
    const has = await both(['facilities', 'effect', 'add', 'infirmary', 'healFactor', '1', '1', '1', '1'], 'POST', '/api/facilities/effect/add', { key: 'infirmary', kind: 'healFactor', amounts: [1, 1, 1, 1] });
    expect(problemsOf(has.json)).toContain('infirmary has the healFactor effect already');
    const unknown = await both(['facilities', 'effect', 'add', 'infirmary', 'luck', '1', '1', '1', '1'], 'POST', '/api/facilities/effect/add', { key: 'infirmary', kind: 'luck', amounts: [1, 1, 1, 1] });
    expect(problemsOf(unknown.json)).toBe('"luck" is not an effect of a Facility: healFactor, trainingXp, moraleBaseline, fatigueFall');
    const bounds = await both(['facilities', 'effect', 'add', 'training-yard', 'healFactor', '1', '0.5', '0', '0.2'], 'POST', '/api/facilities/effect/add', { key: 'training-yard', kind: 'healFactor', amounts: [1, 0.5, 0, 0.2] });
    expect(problemsOf(bounds.json)).toContain('improvements.training-yard-2.effects.healFactor is 0; it is a number above 0');
    expect((await both(['facilities', 'pending'], 'GET', '/api/facilities/pending')).json.edits).toHaveLength(4);
  });

  test('effect set changes one value at a grade, grade 0 being the Facility’s own; effect remove takes a kind from the Facility and every grade', async () => {
    const { both } = await pair();
    const set = await both(['facilities', 'effect', 'set', 'quarters', 'fatigueFall', '2', '9'], 'POST', '/api/facilities/effect/set', { key: 'quarters', kind: 'fatigueFall', grade: 2, value: 9 });
    expect(set.json.row.grades[1].row.effects).toEqual({ moraleBaseline: 10, fatigueFall: 9 });
    const own = await both(['facilities', 'effect', 'set', 'quarters', 'fatigueFall', '0', '4'], 'POST', '/api/facilities/effect/set', { key: 'quarters', kind: 'fatigueFall', grade: 0, value: 4 });
    expect(own.json.row.row.effects).toEqual({ moraleBaseline: 0, fatigueFall: 4 });
    const same = await both(['facilities', 'effect', 'set', 'quarters', 'fatigueFall', '0', '4'], 'POST', '/api/facilities/effect/set', { key: 'quarters', kind: 'fatigueFall', grade: 0, value: 4 });
    expect(same.json).toMatchObject({ ok: true, unchanged: true });
    const lacks = await both(['facilities', 'effect', 'set', 'quarters', 'trainingXp', '1', '1'], 'POST', '/api/facilities/effect/set', { key: 'quarters', kind: 'trainingXp', grade: 1, value: 1 });
    expect(problemsOf(lacks.json)).toContain('quarters has no trainingXp effect at grade 1');
    const text = await both(['facilities', 'effect', 'set', 'quarters', 'fatigueFall', '1', 'many'], 'POST', '/api/facilities/effect/set', { key: 'quarters', kind: 'fatigueFall', grade: 1, value: 'many' });
    expect(problemsOf(text.json)).toBe('fatigueFall is a number: Fatigue fall a night at home, not "many"');

    const removed = await both(['facilities', 'effect', 'remove', 'quarters', 'fatigueFall'], 'POST', '/api/facilities/effect/remove', { key: 'quarters', kind: 'fatigueFall' });
    expect(removed.json.row.grades.map((grade: Json) => Object.keys(grade.row.effects))).toEqual([['moraleBaseline'], ['moraleBaseline'], ['moraleBaseline']]);
    const last = await both(['facilities', 'effect', 'remove', 'infirmary', 'healFactor'], 'POST', '/api/facilities/effect/remove', { key: 'infirmary', kind: 'healFactor' });
    expect(problemsOf(last.json)).toContain('facilities.infirmary.effects is empty: a Facility has at least one effect');
  });
});

describe('finishing, the doctor and recovery, through both adapters', () => {
  test('a fourth Facility with its fourth grade finishes: both files written in their layout, the content version raised, the content loading', async () => {
    const { cliDir, apiDir, both } = await pair();
    const version = readContentVersion(cliDir);
    await both(['facilities', 'add', 'chapel', '--row', JSON.stringify(chapel)], 'POST', '/api/facilities/add', { key: 'chapel', values: chapel });
    const grade = { name: 'Shrine', cost: 300, effects: { healFactor: 0.8, moraleBaseline: 4 } };
    await both(['facilities', 'grade', 'add', 'chapel', '--row', JSON.stringify(grade)], 'POST', '/api/facilities/grade/add', { key: 'chapel', values: grade });
    await both(['facilities', 'grade', 'add', 'infirmary', 'name=Chantry', 'cost=2000', 'effects={"healFactor":0.1}'], 'POST', '/api/facilities/grade/add', {
      key: 'infirmary',
      values: { name: 'Chantry', cost: 2000, effects: { healFactor: 0.1 } },
    });
    const finished = await both(['facilities', 'finish'], 'POST', '/api/facilities/finish', {});
    expect(finished.json).toMatchObject({ ok: true, edits: 3, changed: ['facilities.json', 'improvements.json'], contentVersion: { from: version, to: version + 1 } });
    for (const dir of [cliDir, apiDir]) {
      expect(status(dir).split('\n').filter((line) => line !== '').sort()).toEqual([' M content/facilities.json', ' M content/improvements.json', ' M content/version.json']);
      expect(readFileSync(path.join(dir, 'content', 'facilities.json'), 'utf8')).toContain('  "chapel": { "name": "chapel", "plural": false, "upkeep": 20, "effects": { "healFactor": 1, "moraleBaseline": 0 } }\n');
      // The new grades stand after their Facility's last, one row a line.
      const lines = readFileSync(path.join(dir, 'content', 'improvements.json'), 'utf8').split('\n');
      expect(lines.findIndex((line) => line.includes('"infirmary-4"'))).toBe(lines.findIndex((line) => line.includes('"infirmary-3"')) + 1);
      expect(lines.some((line) => line.includes('"chapel-1": { "facility": "chapel", "grade": 1, "cost": 300, "name": "Shrine", "effects": { "healFactor": 0.8, "moraleBaseline": 4 } }'))).toBe(true);
      const content = loadContent(path.join(dir, 'content'));
      expect(Object.keys(content.facilities)).toEqual(['infirmary', 'training-yard', 'quarters', 'chapel']);
      expect(content.improvements['infirmary-4']?.effects).toEqual({ healFactor: 0.1 });
    }
    expect(readFileSync(path.join(cliDir, 'content', 'version.json'), 'utf8')).toContain('added chapel, chapel-1, infirmary-4');
    expect((await both(['facilities', 'finish'], 'POST', '/api/facilities/finish', {})).json).toMatchObject({ ok: true, edits: 0 });
  });

  test('doctor and recover answer through both', async () => {
    const { both } = await pair();
    const report = await both(['facilities', 'doctor'], 'GET', '/api/facilities/doctor');
    expect(report.code).toBe(0);
    expect(report.json).toMatchObject({ ok: true, content: { ok: true }, pending: { ok: true, edits: 0 }, facilities: { facilities: 3, grades: { ok: true, count: 9 }, costs: { ok: true }, orders: { ok: true, count: 0 } } });
    expect((await both(['facilities', 'recover'], 'POST', '/api/facilities/recover', {})).json).toEqual({ ok: true, recovered: [] });
  });

  test('a test that fails undoes "Finish" through both: every file put back, the edits still pending', async () => {
    const { cliDir, apiDir, both } = await pair();
    for (const dir of [cliDir, apiDir]) plantOutcome(dir, 'fail');
    await both(['facilities', 'add', 'chapel', '--row', JSON.stringify(chapel)], 'POST', '/api/facilities/add', { key: 'chapel', values: chapel });
    await both(['facilities', 'grade', 'change', 'quarters', '1', 'cost=250'], 'POST', '/api/facilities/grade/change', { key: 'quarters', grade: 1, values: { cost: 250 } });
    const undone = await both(['facilities', 'finish'], 'POST', '/api/facilities/finish', {});
    expect(undone).toMatchObject({ code: 1, json: { ok: false, kind: 'undone' } });
    for (const dir of [cliDir, apiDir]) expect(status(dir)).toBe('');
    expect((await both(['facilities', 'pending'], 'GET', '/api/facilities/pending')).json.edits.map((edit: Json) => `${edit.op} ${edit.list} ${edit.key}`)).toEqual(['add facilities chapel', 'change grades quarters-1']);
  });

  test('a "Finish" cut off is put back by the next command through both, which names its files once', async () => {
    const { cliDir, apiDir, url } = await pair();
    const file = (dir: string): string => path.join(dir, 'content', 'facilities.json');
    const before = readFileSync(file(cliDir));
    for (const dir of [cliDir, apiDir]) {
      writeAtomically(journalPath(dir), JSON.stringify({ pid: 2 ** 22 + 7, startedAt: '2026-10-12T00:00:00Z', contentVersion: 46, edits: 1, files: { [file(dir)]: before.toString('base64') } }));
      writeFileSync(file(dir), '{}\n');
    }
    expect((await json(cliDir, 'facilities', 'pending')).json).toEqual({ edits: [], recovered: [file(cliDir)] });
    const viaApi = await (await fetch(new URL('/api/facilities/pending', url))).json();
    expect(viaApi).toEqual({ edits: [], recovered: [file(apiDir)] });
    for (const dir of [cliDir, apiDir]) {
      expect(readFileSync(file(dir))).toEqual(before);
      expect(status(dir)).toBe('');
    }
  });

  test('a pending edit that no longer applies is named with its discard', async () => {
    const { cliDir, apiDir, both } = await pair();
    await both(['facilities', 'change', 'quarters', 'upkeep=30'], 'POST', '/api/facilities/change', { key: 'quarters', values: { upkeep: 30 } });
    for (const dir of [cliDir, apiDir]) {
      const facilities = readContentJson<Record<string, unknown>>(dir, 'facilities.json');
      const { quarters: _gone, ...left } = facilities;
      void _gone;
      writeContentJson(dir, 'facilities.json', left);
    }
    const stale = await both(['facilities', 'list'], 'GET', '/api/facilities/list');
    expect(stale.json.problems[0]).toBe('The pending edit 1 (change quarters) no longer applies; discard it with `facilities discard quarters`');
  });
});

describe('the command line', () => {
  test('refuses what it cannot read with exit 2, and a flag that is not its own', async () => {
    const dir = scratch();
    plantFacilities(dir);
    expect((await command(['facilities', '--root', dir])).code).toBe(2);
    const unknown = await command(['facilities', 'cut', '--root', dir]);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain('cut is not a command of facilities: list, show, add');
    expect((await command(['facilities', 'show', '--root', dir])).err).toContain('facilities show wants a Facility');
    expect((await command(['facilities', 'list', 'upkeep=3', '--root', dir])).err).toContain('facilities list takes no field: upkeep');
    expect((await command(['facilities', 'add', 'chapel', '--tags', 'a', '--root', dir])).err).toContain("--tags and --no-tags are the Quest templates' and Encounters' alone");
    expect((await command(['facilities', 'grade', 'change', 'quarters', 'x', 'cost=1', '--root', dir])).err).toContain('wants the grade\'s number, a whole number, not "x"');
    expect((await command(['facilities', 'effect', 'add', 'quarters', 'fatigueFall', '--root', dir])).err).toContain('wants a value for each grade from 0 up');
  });

  test('lists the planted grades’ costs in the words', async () => {
    const dir = scratch();
    plantFacilities(dir);
    const text = await command(['facilities', 'list', '--root', dir]);
    expect(text.out.split('\n')).toHaveLength(Object.keys(plantedFacilities).length + Object.keys(plantedGrades).length);
    expect(text.out).toContain('1 infirmary-1 "Sickroom", cost 200 Silver: healFactor 0.5');
  });
});
