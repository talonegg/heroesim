import type { ContentJson } from '@heroesim/content/uses';
import { describe, expect, test } from 'vitest';
import { questChecks, questsDoctorText, type QuestsDoctor } from './quests-doctor.js';
import { serve } from './server.js';
import { command, git, json, plantedTests, readContentJson, scratch, writeContentJson } from './test-support.js';

// `quests doctor` (DL-257 item 8, DL-267): its checks of what a Quest plays, each problem named, on
// content made for each; and the report through both adapters, the command line and the page's API,
// on a scratch copy, its pending edits held to the checks too.

/** A Beat of `pool`. */
const beat = (pool: Record<string, unknown>, line = 'A Beat.'): Record<string, unknown> => ({ line, pool });

/** Content of `templates` and `encounters`, each by key, as the doctor reads it. */
function content(templates: Record<string, Record<string, unknown>>, encounters: Record<string, Record<string, unknown>>): ContentJson {
  return { 'quest-templates/': templates, 'encounters/': encounters };
}

const encounters = {
  fight: { kind: 'combat', tags: ['wilds'] },
  brawl: { kind: 'combat' },
  march: { kind: 'travel' },
  riddle: { kind: 'lore', tags: ['study'] },
  last: { kind: 'combat' },
};

describe("the doctor's checks", () => {
  test('pass content whose every pool may draw, every Tier plays its Beats, every Encounter is met and the Finale is placed', () => {
    const checks = questChecks(
      content(
        {
          hunt: { tierMin: 1, tierMax: 2, beats: [beat({ kinds: ['combat'] }), beat({ kinds: ['travel', 'lore'] })], finale: 'last', finaleLine: 'The end.' },
        },
        encounters,
      ),
    );
    expect(checks).toEqual({
      templates: 1,
      pools: { ok: true, count: 2, problems: [] },
      tiers: { ok: true, count: 2, problems: [] },
      drawn: { ok: true, count: 5, problems: [] },
      finales: { ok: true, count: 1, problems: [] },
      notes: [],
    });
  });

  test("name a pool too small for its draws, as the engine's greedy rule counts them", () => {
    const checks = questChecks(content({ hunt: { tierMin: 1, tierMax: 1, beats: [beat({ kinds: ['combat'] }), beat({ tags: ['wilds'] }), beat({ encounters: ['march', 'riddle'] })] } }, encounters));
    expect(checks.pools.problems).toEqual([
      'quest-templates/hunt.json: beats.1.pool may draw 1 Encounter, none a Finale; it needs 2, one for each Beat before it sharing its pool, and one more',
    ]);
  });

  test('name a Tier the ladder has not, or one playing more Beats than the template has, or none', () => {
    const checks = questChecks(
      content(
        {
          long: { tierMin: 2, tierMax: 6, beats: [beat({ kinds: ['combat'] }), beat({ kinds: ['travel'] })] },
          none: { tierMin: 1, tierMax: 1, beats: [beat({ kinds: ['lore'] })], overrides: { 1: { beats: 0 } } },
        },
        encounters,
      ),
    );
    expect(checks.tiers.problems).toEqual([
      "quest-templates/long.json: Tiers 2 to 6 are not Tiers of the ladder's 1 to 5, the lower first",
      'quest-templates/long.json: Tier 2 plays 3 Beats, more than its 2 Beats',
      'quest-templates/long.json: Tier 3 plays 3 Beats, more than its 2 Beats',
      'quest-templates/long.json: Tier 4 plays 4 Beats, more than its 2 Beats',
      'quest-templates/long.json: Tier 5 plays 5 Beats, more than its 2 Beats',
      'quest-templates/none.json: Tier 1 plays 0 Beats; a Quest plays one at least',
    ]);
    expect(checks.tiers.count).toBe(5);
  });

  test('name an Encounter no pool may draw that is no Finale', () => {
    const checks = questChecks(content({ hunt: { tierMin: 1, tierMax: 1, beats: [beat({ kinds: ['combat'] }), beat({ kinds: ['combat'] })], finale: 'last', finaleLine: 'The end.' } }, encounters));
    expect(checks.drawn.problems).toEqual([
      'encounters/march.json: no Beat a Tier plays may draw it, and it is no Finale, so no Quest meets it',
      'encounters/riddle.json: no Beat a Tier plays may draw it, and it is no Finale, so no Quest meets it',
    ]);
  });

  test('name a Finale with no line, one content lacks, and one a pool names', () => {
    const checks = questChecks(
      content(
        {
          a: { tierMin: 1, tierMax: 1, beats: [beat({ kinds: ['combat'] }), beat({ kinds: ['travel'] })], finale: 'last' },
          b: { tierMin: 1, tierMax: 1, beats: [beat({ kinds: ['lore'] })], finale: 'gone', finaleLine: ' ' },
          c: { tierMin: 1, tierMax: 1, beats: [beat({ encounters: ['last', 'fight'] }), beat({ kinds: ['travel'] })] },
        },
        encounters,
      ),
    );
    expect(checks.finales).toEqual({
      ok: false,
      count: 2,
      problems: [
        'quest-templates/a.json: finale and finaleLine are given together or not at all',
        'quest-templates/b.json: finale: "gone" is not an Encounter',
        'quest-templates/b.json: finaleLine is empty',
        'quest-templates/c.json: beats.0.pool.encounters.0: "last" is a Finale, played last, which no Beat draws',
      ],
    });
  });

  // A Tier of k Beats plays the first k - 1 and the Finale, or the first k (DL-262 item 3), so an
  // Encounter only a trailing Beat's pool draws is met by no Quest.
  test('name an Encounter drawn only by a Beat no Tier of its template plays', () => {
    const checks = questChecks(content({ hunt: { tierMin: 1, tierMax: 1, beats: [beat({ kinds: ['combat'] }), beat({ kinds: ['travel'] }), beat({ kinds: ['lore'] })], finale: 'last', finaleLine: 'The end.' } }, encounters));
    expect(checks.notes).toEqual(['quest-templates/hunt.json: beats.1 to beats.2 are played at no Tier it offers (Tier 1 draws 1 Beat at most)']);
    expect(checks.drawn.problems).toEqual([
      'encounters/march.json: no Beat a Tier plays may draw it, and it is no Finale, so no Quest meets it',
      'encounters/riddle.json: no Beat a Tier plays may draw it, and it is no Finale, so no Quest meets it',
    ]);
  });

  test('note, without failing, a Beat no Tier of its template plays', () => {
    const checks = questChecks(content({ hunt: { tierMin: 1, tierMax: 2, beats: [beat({ kinds: ['combat'] }), beat({ kinds: ['travel'] }), beat({ kinds: ['lore'] }), beat({ kinds: ['combat'] })] } }, encounters));
    expect(checks.notes).toEqual(['quest-templates/hunt.json: beats.3 is played at no Tier it offers (Tiers 1 to 2 draw 3 Beats at most)']);
    expect([checks.pools, checks.tiers, checks.drawn, checks.finales].every((each) => each.ok)).toBe(true);
  });
});

/** An Encounter planted in a scratch copy: one Check, drawn by no pool that does not name it or its kind. */
const planted = {
  name: 'A planted ward',
  kind: 'arcane',
  checks: [{ key: 'ward', name: 'The ward', score: ['avg', 'party', ['stat', 'arcana']], skills: [], difficultyFactor: 0.1 }],
  consequences: { success: [], failure: [{ kind: 'morale', delta: -1 }] },
};

describe('the report, through both adapters', () => {
  test('is clean on the content, exit 0, its lines like the Traits doctor’s', async () => {
    const dir = scratch();
    const page = await serve({ root: dir, port: 0, runTests: plantedTests });
    try {
      const viaCli = await json<QuestsDoctor>(dir, 'quests', 'doctor');
      const viaApi = (await (await fetch(new URL('/api/quests/doctor', page.url))).json()) as QuestsDoctor;
      expect(viaApi).toEqual(viaCli.json);
      expect(viaCli.code).toBe(0);
      expect(viaCli.json.ok).toBe(true);
      const text = await command(['quests', 'doctor', '--root', dir]);
      expect(text.out.split('\n').filter((line) => !line.startsWith('!'))).toEqual([
        '✓ The content passes its checks',
        `✓ Every Beat's pool may draw its Encounter: ${viaCli.json.quests.pools.count} Beats of ${viaCli.json.quests.templates} Quest templates`,
        `✓ Every Tier offered plays its Beats: ${viaCli.json.quests.tiers.count} Tiers of ${viaCli.json.quests.templates} Quest templates`,
        `✓ Every Encounter is drawn by a Beat a Tier plays or is a Finale: ${viaCli.json.quests.drawn.count} Encounters`,
        `✓ The Finales are placed: ${viaCli.json.quests.finales.count}, each an Encounter with its line, named by no pool, played last`,
        '✓ No pending edits',
      ]);
    } finally {
      await page.close();
    }
  });

  test('fails on content its own checks refuse though the content’s pass, with nothing pending, exit 1', async () => {
    const dir = scratch();
    // An Encounter planted that no pool names, every pool naming the Encounters the content holds, none a
    // Finale: met by no Quest, whatever the content as shipped (DL-272).
    const encounters = readContentJson<Record<string, unknown>>(dir, 'encounters/');
    const templates = readContentJson<Record<string, { finale?: string; beats: { pool: Record<string, unknown> }[] }>>(dir, 'quest-templates/');
    const finales = new Set(Object.values(templates).map((template) => template.finale));
    const named = Object.keys(encounters).filter((key) => !finales.has(key));
    for (const template of Object.values(templates)) for (const each of template.beats) each.pool = { encounters: named };
    writeContentJson(dir, 'quest-templates/', templates);
    writeContentJson(dir, 'encounters/', { ...encounters, 'a-planted-ward': planted });
    const report = await json<QuestsDoctor>(dir, 'quests', 'doctor');
    expect(report.code).toBe(1);
    expect(report.json).toMatchObject({ ok: false, content: { ok: true }, pending: { ok: true, edits: 0 }, quests: { drawn: { ok: false } } });
    expect(report.json.quests.drawn.problems).toContain("encounters/a-planted-ward.json: no Beat a Tier plays may draw it, and it is no Finale, so no Quest meets it");
  });

  test('names a pending edit that leaves an Encounter no Quest meets, exit 1, the API answering its report', async () => {
    const dir = scratch();
    // One template whose Beats reach every kind, its one Tier playing them all, its last the only one to
    // draw the lore Encounters, serving every Sphere.
    const spheres = Object.keys(readContentJson(dir, 'spheres.json'));
    const only = {
      name: 'Every road',
      sphereKeys: spheres,
      tags: ['wilds'],
      tierMin: 1,
      tierMax: 1,
      rewardPerDifficulty: 4,
      fameEffect: 1,
      partySizeMin: 2,
      skillKeys: [],
      requires: {},
      lootTableKey: null,
      beats: ['combat', 'travel', 'social', 'arcane', 'stealth', 'lore'].map((kind) => beat({ kinds: [kind] }, `A ${kind} Beat.`)),
      overrides: { 1: { beats: 6 } },
    };
    writeContentJson(dir, 'quest-templates/', { 'every-road': only });
    git(dir, 'add', '--all');
    git(dir, 'commit', '--quiet', '-m', 'one template');
    expect((await json<QuestsDoctor>(dir, 'quests', 'doctor')).json.ok).toBe(true);

    expect((await json(dir, 'quests', 'beat', 'change', 'every-road', '5', 'pool={"kinds":["combat"]}')).code).toBe(0);
    const page = await serve({ root: dir, port: 0, runTests: plantedTests });
    try {
      const viaCli = await json<QuestsDoctor>(dir, 'quests', 'doctor');
      const viaApi = (await (await fetch(new URL('/api/quests/doctor', page.url))).json()) as QuestsDoctor;
      expect(viaApi).toEqual(viaCli.json);
      expect(viaCli.code).toBe(1);
      expect(viaCli.json.ok).toBe(false);
      expect(viaCli.json.content.ok).toBe(true);
      expect(viaCli.json.pending.problems).toContain("encounters/old-records.json: no Beat a Tier plays may draw it, and it is no Finale, so no Quest meets it");
      expect(questsDoctorText(viaCli.json).at(-1 - viaCli.json.pending.problems.length)).toBe('✗ The pending edits fail');
    } finally {
      await page.close();
    }
  });
});
