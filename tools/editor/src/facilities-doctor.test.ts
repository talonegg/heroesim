import type { ContentJson } from '@heroesim/content/uses';
import { describe, expect, test } from 'vitest';
import { facilityChecks, facilitiesDoctorText, type FacilitiesDoctor } from './facilities-doctor.js';
import { serve } from './server.js';
import { command, json, plantedGrades, plantedFacilities, plantedTests, plantFacilities, readContentJson, scratch, writeContentJson } from './test-support.js';

// `facilities doctor` (DL-297): its checks of what a Hall reads, each problem named, on
// content made for each; and the report through both adapters, the command line and the page's API, on
// a scratch copy, its pending edits held to the checks too.

/** Content of Facilities, grades and, where given, Dispositions, each by key, as the doctor reads it. */
function content(facilities: Record<string, Record<string, unknown>>, grades: Record<string, Record<string, unknown>>, dispositions: Record<string, Record<string, unknown>> = {}): ContentJson {
  return { 'facilities.json': facilities, 'improvements.json': grades, 'dispositions.json': dispositions };
}

describe("the doctor's checks", () => {
  test('pass content whose every grade names a Facility, runs 1 to n, holds its Facility’s effects and costs more than the one below', () => {
    const checks = facilityChecks(content(plantedFacilities, plantedGrades, { steady: { buildOrder: ['quarters', 'infirmary', 'training-yard'] }, miserly: {} }));
    expect(checks).toEqual({
      facilities: 3,
      grades: { ok: true, count: 9, problems: [] },
      costs: { ok: true, count: 9, problems: [] },
      orders: { ok: true, count: 1, problems: [] },
      notes: [],
    });
  });

  test('name a grade of no Facility, a gap in the grades, and effects other than its Facility’s', () => {
    const checks = facilityChecks(
      content(plantedFacilities, {
        ...plantedGrades,
        'library-1': { facility: 'library', grade: 1, cost: 100, name: 'Shelves', effects: { healFactor: 0.9 } },
        'quarters-5': { facility: 'quarters', grade: 5, cost: 2000, name: 'Hall', effects: { moraleBaseline: 20, fatigueFall: 9 } },
        'infirmary-3': { facility: 'infirmary', grade: 3, cost: 1000, name: "Physicians' wing", effects: { healFactor: 0.2, trainingXp: 1 } },
      }),
    );
    expect(checks.grades.problems).toEqual([
      'improvements.json: library-1: facility "library" is not a Facility (infirmary, training-yard, quarters)',
      'improvements.json: infirmary-3: its effects are healFactor, trainingXp; infirmary has healFactor',
      'improvements.json: the grades of quarters are 1, 2, 3, 5; they run 1 to 4, each once',
    ]);
  });

  test('name a grade that costs no more than the one below', () => {
    const checks = facilityChecks(content(plantedFacilities, { ...plantedGrades, 'infirmary-2': { ...plantedGrades['infirmary-2'], cost: 200 } }));
    expect(checks.costs).toEqual({ ok: false, count: 9, problems: ['improvements.json: infirmary-2: costs 200, no more than infirmary-1\'s 200'] });
  });

  test('name a build order that lists a Facility twice, or not at all', () => {
    const checks = facilityChecks(content(plantedFacilities, plantedGrades, { steady: { buildOrder: ['quarters', 'quarters', 'infirmary'] }, reckless: { buildOrder: ['library'] } }));
    expect(checks.orders).toEqual({
      ok: false,
      count: 2,
      problems: [
        'dispositions.json: steady.buildOrder: it lists quarters, quarters, infirmary; it lists each of infirmary, training-yard, quarters once',
        'dispositions.json: reckless.buildOrder: it lists library; it lists each of infirmary, training-yard, quarters once',
      ],
    });
  });

  // DL-53: each grade heals faster, trains more, lifts Morale further or lets Fatigue fall faster.
  test('note, without failing, a grade that does no more than the one below, and content with no Facility that heals', () => {
    const checks = facilityChecks(
      content(
        { quarters: plantedFacilities.quarters ?? {}, infirmary: plantedFacilities.infirmary ?? {} },
        {
          'infirmary-1': { facility: 'infirmary', grade: 1, cost: 200, name: 'A', effects: { healFactor: 1 } },
          'quarters-1': { facility: 'quarters', grade: 1, cost: 200, name: 'B', effects: { moraleBaseline: 0, fatigueFall: 6 } },
        },
      ),
    );
    expect(checks.notes).toEqual([
      "improvements.json: quarters-1: moraleBaseline is 0, no higher than quarters at grade 0's 0",
      "improvements.json: infirmary-1: healFactor is 1, no lower than infirmary at grade 0's 1",
    ]);
    expect([checks.grades, checks.costs, checks.orders].every((each) => each.ok)).toBe(true);
    const noHeal = facilityChecks(content({ quarters: plantedFacilities.quarters ?? {} }, {}));
    expect(noHeal.notes).toEqual(['No Facility has the healFactor effect: the harness policy builds the first that has it, and with none it builds nothing (DL-297)']);
    expect(noHeal.grades.ok).toBe(true);
  });

  test('read content with no Facility and no Improvement as it is: nothing to check', () => {
    expect(facilityChecks({})).toMatchObject({ facilities: 0, grades: { ok: true, count: 0 }, costs: { ok: true }, orders: { ok: true, count: 0 } });
  });
});

describe('the report, through both adapters', () => {
  test('is clean on the content, exit 0, its lines like the Quest doctor’s', async () => {
    const dir = scratch();
    plantFacilities(dir);
    const page = await serve({ root: dir, port: 0, runTests: plantedTests });
    try {
      const viaCli = await json<FacilitiesDoctor>(dir, 'facilities', 'doctor');
      const viaApi = (await (await fetch(new URL('/api/facilities/doctor', page.url))).json()) as FacilitiesDoctor;
      expect(viaApi).toEqual(viaCli.json);
      expect(viaCli.code).toBe(0);
      const text = await command(['facilities', 'doctor', '--root', dir]);
      expect(text.out.split('\n')).toEqual([
        '✓ The content passes its checks: 3 Facilities, 9 grades',
        "✓ Every grade names a Facility, the grades run 1 to n with no gap and hold exactly its Facility's effects: 3 Facilities, 9 grades",
        '✓ Each grade costs more than the one below: 9 grades',
        '✓ Every build order lists each Facility once: 0 Dispositions write one',
        '✓ No pending edits',
      ]);
    } finally {
      await page.close();
    }
  });

  test('fails on content its own checks refuse though the content’s pass, with nothing pending, exit 1', async () => {
    const dir = scratch();
    plantFacilities(dir);
    // A grade that costs no more than the one below: no rule of the content, a check of the doctor.
    const grades = readContentJson<Record<string, Record<string, unknown>>>(dir, 'improvements.json');
    writeContentJson(dir, 'improvements.json', { ...grades, 'quarters-2': { ...grades['quarters-2'], cost: 100 } });
    const report = await json<FacilitiesDoctor>(dir, 'facilities', 'doctor');
    expect(report.code).toBe(1);
    expect(report.json).toMatchObject({ ok: false, content: { ok: true }, pending: { ok: true, edits: 0 }, facilities: { costs: { ok: false } } });
    expect(report.json.facilities.costs.problems).toEqual(["improvements.json: quarters-2: costs 100, no more than quarters-1's 200"]);
  });

  test('names a pending edit that passes the content’s checks and fails these, exit 1, the API answering its report', async () => {
    const dir = scratch();
    plantFacilities(dir);
    expect((await json(dir, 'facilities', 'grade', 'change', 'training-yard', '3', 'cost=400')).code).toBe(0);
    const page = await serve({ root: dir, port: 0, runTests: plantedTests });
    try {
      const viaCli = await json<FacilitiesDoctor>(dir, 'facilities', 'doctor');
      const viaApi = (await (await fetch(new URL('/api/facilities/doctor', page.url))).json()) as FacilitiesDoctor;
      expect(viaApi).toEqual(viaCli.json);
      expect(viaCli.code).toBe(1);
      expect(viaCli.json).toMatchObject({ ok: false, content: { ok: true } });
      expect(viaCli.json.pending).toEqual({ ok: false, edits: 1, problems: ["improvements.json: training-yard-3: costs 400, no more than training-yard-2's 500"] });
      expect(facilitiesDoctorText(viaCli.json).at(-2)).toBe('✗ The pending edits fail');
    } finally {
      await page.close();
    }
  });
});
