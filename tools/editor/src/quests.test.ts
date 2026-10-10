import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readContentVersion } from '@heroesim/content/write';
import { afterEach, describe, expect, test } from 'vitest';
import { journalPath, writeAtomically } from './finish-journal.js';
import { pendingPath } from './session.js';
import { serve } from './server.js';
import { command, json, plantOutcome, plantedTests, readContentJson, scratch, scratchRepository, status } from './test-support.js';

// The Quest templates' and Encounters' commands (DL-257 item 8, DL-267), each driven through both of
// their adapters, the command line (`npm run edit -- quests …`, `encounters …`) and the page's API
// (`/api/quests/…`, `/api/encounters/…`), on two scratch copies of the repository side by side: the
// same JSON from each, the same answer's kind (exit 0, 1 or 2; 200, 422 or 409, or 400), and the same
// pending edits left behind. A refused change names its reason and holds nothing.

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
  if (answer !== null && typeof answer === 'object' && 'quests' in answer && 'content' in answer) return 200;
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
  const page = await serve({ root: apiDir, port: 0, runTests: plantedTests });
  cleanups.push(() => page.close());
  const pending = (dir: string): string | null => (existsSync(pendingPath(dir, 'quests')) ? readFileSync(pendingPath(dir, 'quests'), 'utf8') : null);
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

/** A new Quest template's fields: three Beats, Tiers 1 and 2. */
const crossing = {
  name: 'Cross the river',
  sphereKeys: ['crown'],
  tags: ['water'],
  tierMin: 1,
  tierMax: 2,
  rewardPerDifficulty: 4,
  fameEffect: 1,
  partySizeMin: 2,
  skillKeys: [],
  requires: {},
  lootTableKey: null,
  beats: [
    { line: 'The river.', pool: { kinds: ['travel'] } },
    { line: 'A ferryman.', pool: { kinds: ['social'] } },
    { line: 'The far bank.', pool: { kinds: ['travel'] } },
  ],
};

/** A new Encounter's fields: one Check, tagged as no other is. */
const bridge = {
  name: 'A broken bridge',
  kind: 'travel',
  tags: ['bridge'],
  checks: [{ key: 'cross', name: 'Crossing', score: ['avg', 'party', ['stat', 'dexterity']], skills: [], difficultyFactor: 0.1 }],
  consequences: { success: [], failure: [{ kind: 'morale', delta: -1 }] },
};

const problemsOf = (answer: Json): string => (answer.problems as string[]).join('\n');

describe('reading, through both adapters', () => {
  test('quests list and show give every template and one, each Tier it offers as it plays and the Encounters each pool may draw', async () => {
    const { cliDir, both } = await pair();
    const listed = await both(['quests', 'list'], 'GET', '/api/quests/list');
    expect(listed.code).toBe(0);
    expect(listed.json.rows.map((row: Json) => row.key)).toEqual(Object.keys(readContentJson(cliDir, 'quest-templates/')).sort());
    expect(listed.json.pending).toBe(0);

    const shown = await both(['quests', 'show', 'hold-the-border-fort'], 'GET', '/api/quests/show?key=hold-the-border-fort');
    expect(shown.json.row).toEqual(readContentJson<Record<string, unknown>>(cliDir, 'quest-templates/')['hold-the-border-fort']);
    expect(shown.json.tiers.map((tier: Json) => [tier.tier, tier.figures.beats, tier.beats, tier.finale])).toEqual([
      [3, 3, [0, 1], 'the-last-assault'],
      [4, 4, [0, 1, 2], 'the-last-assault'],
    ]);
    expect(shown.json.beats[1]).toEqual({ at: 'beats.1', line: 'A hard road.', pool: { kinds: ['travel'] }, draws: ['lost-in-the-fells', 'short-of-supplies', 'the-flooded-ford', 'the-long-march', 'the-old-shaft'] });

    const text = await command(['quests', 'show', 'hold-the-border-fort', '--root', cliDir]);
    expect(text.out).toContain('Tier 4: difficulty 64 to 82, Days 12 to 16, plays 4 Beats: beats.0, beats.1, beats.2, the Finale the-last-assault');
    expect(text.out).toContain('Finale: the-last-assault "The last of it."');

    const unknown = await both(['quests', 'show', 'cross-the-river'], 'GET', '/api/quests/show?key=cross-the-river');
    expect(unknown).toEqual({ code: 1, json: { ok: false, kind: 'refused', problems: ['"cross-the-river" is not a Quest template'] } });
  });

  test('encounters list and show give every Encounter and one, where a pool or a Finale names it, and the Beats that may draw it', async () => {
    const { cliDir, both } = await pair();
    const listed = await both(['encounters', 'list'], 'GET', '/api/encounters/list');
    expect(listed.json.rows).toHaveLength(Object.keys(readContentJson(cliDir, 'encounters/')).length);

    const finale = await both(['encounters', 'show', 'the-last-rite'], 'GET', '/api/encounters/show?key=the-last-rite');
    expect(finale.json.uses.map((use: Json) => use.at)).toEqual(['quest-templates/lay-the-restless-dead.json: finale']);
    expect(finale.json.drawnBy).toEqual([]);

    const drawn = await both(['encounters', 'show', 'the-flooded-ford'], 'GET', '/api/encounters/show?key=the-flooded-ford');
    expect(drawn.json.uses).toEqual([]);
    expect(drawn.json.drawnBy).toContain('hold-the-border-fort beats.1');

    const text = await command(['encounters', 'show', 'the-last-rite', '--root', cliDir]);
    expect(text.out).toContain('the-last-rite — The last rite: arcane, tagged dark, holy; 3 Checks; 1 use; a Finale');
    expect(text.out).toContain('failure.1 {"kind":"death","chance":0.04,"guardedBy":["constitution"]}');
  });

  test('a command it cannot read is a usage, exit 2 and 400, or 405 sent with the wrong method', async () => {
    const { cliDir, url, both } = await pair();
    const noKey = await both(['quests', 'show'], 'GET', '/api/quests/show');
    expect(noKey).toEqual({ code: 2, json: { ok: false, kind: 'usage', problems: ['quests show wants a key'] } });
    const notIndex = await both(['quests', 'beat', 'remove', 'a-quiet-word', 'first'], 'POST', '/api/quests/beat/remove', { key: 'a-quiet-word', at: 'first' });
    expect(notIndex.json.problems).toEqual(["quests beat remove wants the Beat's index, from 0, a whole number, not \"first\""]);

    // The command line's own: a word, a field or a flag its command does not take.
    const usageOf = async (...argv: string[]): Promise<Json> => {
      const answer = await json<Json>(cliDir, ...argv);
      expect(answer.code, argv.join(' ')).toBe(2);
      return answer.json.problems;
    };
    expect(await usageOf('quests', 'beat', 'add', 'a-quiet-word', '1', 'more', 'line=Late.', 'pool={"kinds":["social"]}')).toEqual(['quests beat add takes 2 words before its fields, not "more"']);
    expect(await usageOf('quests', 'list', 'name=All')).toEqual(['quests list takes no field: name']);
    expect(await usageOf('quests', 'show', 'a-quiet-word', '--pass', 'null')).toEqual(["--pass is encounters check's alone"]);

    // The API's own: a command that changes nothing is a GET, the rest a POST.
    const asPost = await fetch(new URL('/api/quests/list', url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(asPost.status).toBe(405);
    expect(await asPost.json()).toEqual({ ok: false, kind: 'usage', problems: ['quests list is a GET'] });
    const asGet = await fetch(new URL('/api/quests/beat/add?key=a-quiet-word', url));
    expect(asGet.status).toBe(405);
    expect(await asGet.json()).toEqual({ ok: false, kind: 'usage', problems: ['quests beat add is a POST'] });
  });
});

describe('the Quest templates, through both adapters', () => {
  test('add puts a template in its folder, pending, and refuses one the checks refuse, naming why', async () => {
    const { cliDir, both } = await pair();
    const added = await both(['quests', 'add', 'cross-the-river', '--row', JSON.stringify(crossing)], 'POST', '/api/quests/add', { key: 'cross-the-river', values: crossing });
    expect(added.code).toBe(0);
    expect(added.json.row).toMatchObject({ key: 'cross-the-river', list: 'quests', pending: 'added', row: crossing });
    expect(added.json.pending).toBe(1);
    expect(status(cliDir)).toBe('');

    const refusals: [string, Record<string, unknown>, string][] = [
      ['taken', { ...crossing }, '"cross-the-river" is a key already, in quests'],
      ['Cross!', { ...crossing }, '"Cross!" is not a key'],
      ['solo', { ...crossing, partySizeMin: 1 }, 'questTemplates.solo.partySizeMin is 1; it is at least 2'],
      ['capped', { ...crossing, partySizeMax: 4 }, 'quest-templates/capped.json: partySizeMax'],
      ['short', { ...crossing, beats: [{ line: 'The ford.', pool: { tags: ['water'] } }, { line: 'Again.', pool: { tags: ['water'] } }] }, 'questTemplates.short.beats.1.pool may draw 1 Encounter, none a Finale; it needs 2'],
    ];
    for (const [key, row, problem] of refusals) {
      const name = key === 'taken' ? 'cross-the-river' : key;
      const refused = await both(['quests', 'add', name, '--row', JSON.stringify(row)], 'POST', '/api/quests/add', { key: name, values: row });
      expect(refused.code, key).toBe(1);
      expect(problemsOf(refused.json), key).toContain(problem);
    }
    expect((await both(['quests', 'pending'], 'GET', '/api/quests/pending')).json.edits).toHaveLength(1);
  });

  test('change sets the fields given, null taking out one a template may leave out; a change of nothing is not held; the key is fixed', async () => {
    const { both } = await pair();
    const renamed = await both(['quests', 'change', 'a-quiet-word', '--name', 'A word in private', '--tags', 'talk,town,dark'], 'POST', '/api/quests/change', {
      key: 'a-quiet-word',
      values: { name: 'A word in private', tags: ['talk', 'town', 'dark'] },
    });
    expect(renamed.json.row.row).toMatchObject({ name: 'A word in private', tags: ['talk', 'town', 'dark'] });
    expect(renamed.json.row.pending).toBe('changed');

    const weighted = await both(['quests', 'change', 'a-quiet-word', '--row', '{"weight":2}'], 'POST', '/api/quests/change', { key: 'a-quiet-word', values: { weight: 2 } });
    expect(Object.keys(weighted.json.row.row).at(-1)).toBe('weight');
    const unweighted = await both(['quests', 'change', 'a-quiet-word', '--row', '{"weight":null}'], 'POST', '/api/quests/change', { key: 'a-quiet-word', values: { weight: null } });
    expect(unweighted.json.row.row).not.toHaveProperty('weight');

    const same = await both(['quests', 'change', 'a-quiet-word', '--name', 'A word in private'], 'POST', '/api/quests/change', { key: 'a-quiet-word', values: { name: 'A word in private' } });
    expect(same.json).toMatchObject({ ok: true, unchanged: true, pending: 3 });

    const rekeyed = await both(['quests', 'change', 'a-quiet-word', '--row', '{"key":"a-loud-word"}'], 'POST', '/api/quests/change', { key: 'a-quiet-word', values: { key: 'a-loud-word' } });
    expect(rekeyed.json.problems).toEqual(['a key is fixed once made: add a new row instead']);
    const loot = await both(['quests', 'change', 'a-quiet-word', '--row', '{"lootTableKey":"no-such-table"}'], 'POST', '/api/quests/change', { key: 'a-quiet-word', values: { lootTableKey: 'no-such-table' } });
    expect(problemsOf(loot.json)).toContain('questTemplates.a-quiet-word.lootTableKey: "no-such-table" is not a Loot table');

    // A row's discard drops its own edits alone.
    await both(['quests', 'change', 'clear-the-barrow', '--name', 'Clear the old barrow'], 'POST', '/api/quests/change', { key: 'clear-the-barrow', values: { name: 'Clear the old barrow' } });
    expect((await both(['quests', 'discard', 'a-quiet-word'], 'POST', '/api/quests/discard', { key: 'a-quiet-word' })).json).toEqual({ ok: true, discarded: 3, left: 1 });
  });

  test('remove takes a template out, pending, and one added in the session goes with its edits', async () => {
    const { both } = await pair();
    const removed = await both(['quests', 'remove', 'the-sickness-at-the-mill'], 'POST', '/api/quests/remove', { key: 'the-sickness-at-the-mill' });
    expect(removed.json).toEqual({ ok: true, key: 'the-sickness-at-the-mill', list: 'quests', pending: 1 });
    await both(['quests', 'add', 'cross-the-river', '--row', JSON.stringify(crossing)], 'POST', '/api/quests/add', { key: 'cross-the-river', values: crossing });
    await both(['quests', 'remove', 'cross-the-river'], 'POST', '/api/quests/remove', { key: 'cross-the-river' });
    expect((await both(['quests', 'pending'], 'GET', '/api/quests/pending')).json.edits).toEqual([{ op: 'remove', list: 'quests', key: 'the-sickness-at-the-mill' }]);
  });

  test('tiers sets the Tiers a template offers, refusing a range the ladder or its Beats cannot play', async () => {
    const { both } = await pair();
    const set = await both(['quests', 'tiers', 'the-beast-of-the-fells', '2', '3'], 'POST', '/api/quests/tiers', { key: 'the-beast-of-the-fells', tierMin: 2, tierMax: 3 });
    expect(set.json.row.tiers.map((tier: Json) => tier.tier)).toEqual([2, 3]);

    const past = await both(['quests', 'tiers', 'a-quiet-word', '1', '6'], 'POST', '/api/quests/tiers', { key: 'a-quiet-word', tierMin: 1, tierMax: 6 });
    expect(problemsOf(past.json)).toContain('questTemplates.a-quiet-word.tierMax is 6; the ladder has 5 Tiers');
    const long = await both(['quests', 'tiers', 'a-quiet-word', '1', '4'], 'POST', '/api/quests/tiers', { key: 'a-quiet-word', tierMin: 1, tierMax: 4 });
    expect(problemsOf(long.json)).toContain('questTemplates.a-quiet-word: Tier 4 plays 4 Beats, more than its 3 Beats');
    expect((await both(['quests', 'pending'], 'GET', '/api/quests/pending')).json.edits).toHaveLength(1);
  });

  test('beat add, change, move and remove change its Beats, each refusal naming why', async () => {
    const { both } = await pair();
    const route = '/api/quests/beat';
    const added = await both(['quests', 'beat', 'add', 'a-quiet-word', 'line=A door left open.', 'pool={"kinds":["stealth"],"tags":["town"]}'], 'POST', `${route}/add`, {
      key: 'a-quiet-word',
      values: { line: 'A door left open.', pool: { kinds: ['stealth'], tags: ['town'] } },
    });
    expect(added.json.row.beats.map((beat: Json) => beat.line)).toEqual(['Words to be had.', 'Somewhere not to be seen.', 'Words to be had.', 'A door left open.']);
    expect(added.json.row.beats[3].draws).toEqual(['among-the-crowd', 'past-the-watch']);

    const first = await both(['quests', 'beat', 'add', 'a-quiet-word', '0', '--row', '{"line":"A name to find.","pool":{"kinds":["lore"]}}'], 'POST', `${route}/add`, {
      key: 'a-quiet-word',
      at: 0,
      values: { line: 'A name to find.', pool: { kinds: ['lore'] } },
    });
    expect(first.json.row.row.beats[0]).toEqual({ line: 'A name to find.', pool: { kinds: ['lore'] } });

    const changed = await both(['quests', 'beat', 'change', 'a-quiet-word', '0', 'line=A name to learn.'], 'POST', `${route}/change`, { key: 'a-quiet-word', at: 0, values: { line: 'A name to learn.' } });
    expect(changed.json.row.row.beats[0]).toEqual({ line: 'A name to learn.', pool: { kinds: ['lore'] } });

    const moved = await both(['quests', 'beat', 'move', 'a-quiet-word', '0', '2'], 'POST', `${route}/move`, { key: 'a-quiet-word', at: 0, to: 2 });
    expect(moved.json.row.row.beats.map((beat: Json) => beat.line)).toEqual(['Words to be had.', 'Somewhere not to be seen.', 'A name to learn.', 'Words to be had.', 'A door left open.']);

    const removed = await both(['quests', 'beat', 'remove', 'a-quiet-word', '3'], 'POST', `${route}/remove`, { key: 'a-quiet-word', at: 3 });
    expect(removed.json.row.row.beats.map((beat: Json) => beat.line)).toEqual(['Words to be had.', 'Somewhere not to be seen.', 'A name to learn.', 'A door left open.']);

    const refusals: [readonly string[], string, Record<string, unknown>, string][] = [
      [['add', 'a-quiet-word', 'line=Nowhere.', 'pool={"encounters":["no-such-encounter"]}'], 'add', { key: 'a-quiet-word', values: { line: 'Nowhere.', pool: { encounters: ['no-such-encounter'] } } }, 'questTemplates.a-quiet-word.beats.4.pool.encounters: "no-such-encounter" is not an Encounter'],
      [['add', 'a-quiet-word', 'line=The last word.', 'pool={"encounters":["the-last-rite"]}'], 'add', { key: 'a-quiet-word', values: { line: 'The last word.', pool: { encounters: ['the-last-rite'] } } }, '"the-last-rite" is a Finale, which no Beat draws'],
      [['add', 'a-quiet-word', '9', 'line=Late.', 'pool={"kinds":["social"]}'], 'add', { key: 'a-quiet-word', at: 9, values: { line: 'Late.', pool: { kinds: ['social'] } } }, 'beats.9 is not a place for a Beat: beats.0 to beats.4'],
      [['change', 'a-quiet-word', '7', 'line=Who?'], 'change', { key: 'a-quiet-word', at: 7, values: { line: 'Who?' } }, 'beats.7 is not a Beat of it: beats.0 to beats.3'],
      [['change', 'a-quiet-word', '0', 'line='], 'change', { key: 'a-quiet-word', at: 0, values: { line: '' } }, 'questTemplates.a-quiet-word.beats.0.line is empty'],
      [['move', 'a-quiet-word', '0', '4'], 'move', { key: 'a-quiet-word', at: 0, to: 4 }, 'beats.4 is not a place for a Beat among its Beats: beats.0 to beats.3'],
    ];
    for (const [words, verb, body, problem] of refusals) {
      const refused = await both(['quests', 'beat', ...words], 'POST', `${route}/${verb}`, body);
      expect(refused.code, words.join(' ')).toBe(1);
      expect(problemsOf(refused.json), words.join(' ')).toContain(problem);
    }

    // A Beat its Tiers need is not removed: the sickness at the mill plays both its Beats.
    const needed = await both(['quests', 'beat', 'remove', 'the-sickness-at-the-mill', '1'], 'POST', `${route}/remove`, { key: 'the-sickness-at-the-mill', at: 1 });
    expect(problemsOf(needed.json)).toContain('questTemplates.the-sickness-at-the-mill: Tier 1 plays 2 Beats, more than its 1 Beat');
    expect((await both(['quests', 'pending'], 'GET', '/api/quests/pending')).json.edits).toHaveLength(5);
  });

  test('override set and clear change a Tier’s figures for the template, refusing a figure or a Tier it cannot have', async () => {
    const { cliDir, both } = await pair();
    const set = await both(['quests', 'override', 'set', 'a-quiet-word', '2', 'daysMax=9', 'rewardFactor=2'], 'POST', '/api/quests/override/set', { key: 'a-quiet-word', tier: 2, values: { daysMax: 9, rewardFactor: 2 } });
    expect(set.json.row.row.overrides).toEqual({ 2: { daysMax: 9, rewardFactor: 2 } });
    expect(set.json.row.tiers[1]).toMatchObject({ tier: 2, overridden: ['daysMax', 'rewardFactor'], figures: { daysMax: 9, rewardFactor: 2 } });

    const cleared = await both(['quests', 'override', 'clear', 'a-quiet-word', '2', 'rewardFactor'], 'POST', '/api/quests/override/clear', { key: 'a-quiet-word', tier: 2, figures: ['rewardFactor'] });
    expect(cleared.json.row.row.overrides).toEqual({ 2: { daysMax: 9 } });
    const text = await command(['quests', 'show', 'a-quiet-word', '--root', cliDir]);
    expect(text.out).toContain('Tier 2: difficulty 28 to 46, Days 5 to 9, plays 3 Beats: beats.0, beats.1, beats.2 (overrides daysMax)');
    const notOverridden = await both(['quests', 'override', 'clear', 'a-quiet-word', '2', 'rewardFactor'], 'POST', '/api/quests/override/clear', { key: 'a-quiet-word', tier: 2, figures: ['rewardFactor'] });
    expect(notOverridden.json.problems).toEqual(['Tier 2 does not override rewardFactor: it overrides daysMax']);
    const gone = await both(['quests', 'override', 'clear', 'a-quiet-word', '2'], 'POST', '/api/quests/override/clear', { key: 'a-quiet-word', tier: 2 });
    expect(gone.json.row.row).not.toHaveProperty('overrides');
    // A Tier's last figure cleared by name takes its override out with it.
    await both(['quests', 'override', 'set', 'a-quiet-word', '1', 'daysMax=4'], 'POST', '/api/quests/override/set', { key: 'a-quiet-word', tier: 1, values: { daysMax: 4 } });
    const last = await both(['quests', 'override', 'clear', 'a-quiet-word', '1', 'daysMax'], 'POST', '/api/quests/override/clear', { key: 'a-quiet-word', tier: 1, figures: ['daysMax'] });
    expect(last.json.row.row).not.toHaveProperty('overrides');

    const refusals: [readonly string[], string, Record<string, unknown>, string][] = [
      [['set', 'a-quiet-word', '2', 'colour=3'], 'set', { key: 'a-quiet-word', tier: 2, values: { colour: 3 } }, '"colour" is not a figure of a Tier'],
      [['set', 'a-quiet-word', '4', 'daysMax=20'], 'set', { key: 'a-quiet-word', tier: 4, values: { daysMax: 20 } }, 'questTemplates.a-quiet-word.overrides.4: Tier 4 is not one it offers, 1 to 2'],
      [['set', 'a-quiet-word', '2', 'daysMin=9'], 'set', { key: 'a-quiet-word', tier: 2, values: { daysMin: 9 } }, 'questTemplates.a-quiet-word.overrides.2:'],
      [['clear', 'a-quiet-word', '1'], 'clear', { key: 'a-quiet-word', tier: 1 }, 'Tier 1 has no override'],
    ];
    for (const [words, verb, body, problem] of refusals) {
      const refused = await both(['quests', 'override', ...words], 'POST', `/api/quests/override/${verb}`, body);
      expect(refused.code, words.join(' ')).toBe(1);
      expect(problemsOf(refused.json), words.join(' ')).toContain(problem);
    }
  });

  test('finale set and clear give a template its Finale and line, or take them out', async () => {
    const { both } = await pair();
    const set = await both(['quests', 'finale', 'set', 'clear-the-barrow', 'the-last-rite', 'line=The barrow’s last rite.'], 'POST', '/api/quests/finale/set', {
      key: 'clear-the-barrow',
      encounter: 'the-last-rite',
      line: 'The barrow’s last rite.',
    });
    expect(set.json.row.row).toMatchObject({ finale: 'the-last-rite', finaleLine: 'The barrow’s last rite.' });
    expect(set.json.row.tiers.map((tier: Json) => [tier.tier, tier.beats, tier.finale])).toEqual([
      [2, [0, 1], 'the-last-rite'],
      [3, [0, 1], 'the-last-rite'],
    ]);
    const cleared = await both(['quests', 'finale', 'clear', 'clear-the-barrow'], 'POST', '/api/quests/finale/clear', { key: 'clear-the-barrow' });
    expect(cleared.json.row.row).not.toHaveProperty('finale');

    const none = await both(['quests', 'finale', 'clear', 'a-quiet-word'], 'POST', '/api/quests/finale/clear', { key: 'a-quiet-word' });
    expect(none.json.problems).toEqual(['it has no Finale to clear']);
    const noLine = await both(['quests', 'finale', 'set', 'a-quiet-word', 'the-last-rite'], 'POST', '/api/quests/finale/set', { key: 'a-quiet-word', encounter: 'the-last-rite' });
    expect(noLine).toEqual({ code: 2, json: { ok: false, kind: 'usage', problems: ["quests finale set wants the Finale's line, as line=<text>"] } });
    const missing = await both(['quests', 'finale', 'set', 'a-quiet-word', 'no-such-encounter', 'line=Nothing.'], 'POST', '/api/quests/finale/set', { key: 'a-quiet-word', encounter: 'no-such-encounter', line: 'Nothing.' });
    expect(problemsOf(missing.json)).toContain('questTemplates.a-quiet-word.finale: "no-such-encounter" is not an Encounter');
  });
});

describe('the Encounters, through both adapters', () => {
  test('add, change and a Beat that pools it are one session, pending together; remove is refused while a pool or a Finale names it', async () => {
    const { both } = await pair();
    const added = await both(['encounters', 'add', 'a-broken-bridge', '--row', JSON.stringify(bridge)], 'POST', '/api/encounters/add', { key: 'a-broken-bridge', values: bridge });
    expect(added.json.row).toMatchObject({ key: 'a-broken-bridge', list: 'encounters', pending: 'added', uses: [] });
    expect(added.json.row.drawnBy).toContain('hold-the-border-fort beats.1');

    const pooled = await both(['quests', 'beat', 'add', 'a-quiet-word', 'line=A bridge out.', 'pool={"encounters":["a-broken-bridge"]}'], 'POST', '/api/quests/beat/add', {
      key: 'a-quiet-word',
      values: { line: 'A bridge out.', pool: { encounters: ['a-broken-bridge'] } },
    });
    expect(pooled.json.row.beats.at(-1).draws).toEqual(['a-broken-bridge']);
    const tagged = await both(['encounters', 'change', 'a-broken-bridge', '--tags', ' bridge,,water, '], 'POST', '/api/encounters/change', { key: 'a-broken-bridge', values: { tags: ['bridge', 'water'] } });
    expect(tagged.json.row.row.tags).toEqual(['bridge', 'water']);
    const noTags = await both(['encounters', 'change', 'a-broken-bridge', '--no-tags'], 'POST', '/api/encounters/change', { key: 'a-broken-bridge', values: { tags: [] } });
    expect(noTags.json.row.row.tags).toEqual([]);
    const untagged = await both(['encounters', 'change', 'a-broken-bridge', '--row', '{"tags":null}'], 'POST', '/api/encounters/change', { key: 'a-broken-bridge', values: { tags: null } });
    expect(untagged.json.row.row).not.toHaveProperty('tags');

    const used = await both(['encounters', 'remove', 'a-broken-bridge'], 'POST', '/api/encounters/remove', { key: 'a-broken-bridge' });
    expect(used.json).toMatchObject({ ok: false, kind: 'refused', uses: [{ at: 'quest-templates/a-quiet-word.json: beats.3.pool.encounters.0' }] });
    expect(used.json.problems[0]).toBe(
      '"a-broken-bridge" is used, and is not removed while it is: take it out of each pool with `quests beat change`, and each Finale with `quests finale clear` or `set`',
    );
    const finale = await both(['encounters', 'remove', 'the-last-rite'], 'POST', '/api/encounters/remove', { key: 'the-last-rite' });
    expect(finale.json.problems).toContain('used at quest-templates/lay-the-restless-dead.json: finale');

    // The pending edits of both lists, the Encounters' alone discarded by `encounters discard`: refused while the Beat names it.
    const listed = await both(['encounters', 'pending'], 'GET', '/api/encounters/pending');
    expect(listed.json.edits.map((edit: Json) => `${edit.op} ${edit.list} ${edit.key}`)).toEqual([
      'add encounters a-broken-bridge',
      'change quests a-quiet-word',
      'change encounters a-broken-bridge',
      'change encounters a-broken-bridge',
      'change encounters a-broken-bridge',
    ]);
    const stranded = await both(['encounters', 'discard'], 'POST', '/api/encounters/discard', {});
    expect(problemsOf(stranded.json)).toContain('questTemplates.a-quiet-word.beats.3.pool.encounters: "a-broken-bridge" is not an Encounter');
    const quests = await both(['quests', 'discard', 'a-quiet-word'], 'POST', '/api/quests/discard', { key: 'a-quiet-word' });
    expect(quests.json).toEqual({ ok: true, discarded: 1, left: 4 });
    const removed = await both(['encounters', 'remove', 'a-broken-bridge'], 'POST', '/api/encounters/remove', { key: 'a-broken-bridge' });
    expect(removed.json).toEqual({ ok: true, key: 'a-broken-bridge', list: 'encounters', pending: 0 });
  });

  test('are keyed apart from the Quest templates: an Encounter may share a template’s key', async () => {
    const { both } = await pair();
    const added = await both(['encounters', 'add', 'a-quiet-word', '--row', JSON.stringify(bridge)], 'POST', '/api/encounters/add', { key: 'a-quiet-word', values: bridge });
    expect(added.json.row).toMatchObject({ key: 'a-quiet-word', list: 'encounters', pending: 'added' });
    expect((await both(['quests', 'show', 'a-quiet-word'], 'GET', '/api/quests/show?key=a-quiet-word')).json).toMatchObject({ list: 'quests', pending: null, row: { name: 'A quiet word' } });
    const changed = await both(['quests', 'change', 'a-quiet-word', '--name', 'A word aside'], 'POST', '/api/quests/change', { key: 'a-quiet-word', values: { name: 'A word aside' } });
    expect(changed.json.row.row.name).toBe('A word aside');
    expect((await both(['encounters', 'show', 'a-quiet-word'], 'GET', '/api/encounters/show?key=a-quiet-word')).json.row.name).toBe('A broken bridge');
    expect((await both(['quests', 'remove', 'a-quiet-word'], 'POST', '/api/quests/remove', { key: 'a-quiet-word' })).json).toMatchObject({ ok: true, list: 'quests', pending: 3 });
  });

  test('an Encounter whose loss or change leaves a pool short is refused, naming the pool', async () => {
    const { both } = await pair();
    await both(['encounters', 'add', 'a-broken-bridge', '--row', JSON.stringify(bridge)], 'POST', '/api/encounters/add', { key: 'a-broken-bridge', values: bridge });
    await both(['quests', 'beat', 'add', 'a-quiet-word', 'line=A bridge out.', 'pool={"tags":["bridge"]}'], 'POST', '/api/quests/beat/add', { key: 'a-quiet-word', values: { line: 'A bridge out.', pool: { tags: ['bridge'] } } });
    const short = await both(['encounters', 'remove', 'a-broken-bridge'], 'POST', '/api/encounters/remove', { key: 'a-broken-bridge' });
    expect(problemsOf(short.json)).toContain('questTemplates.a-quiet-word.beats.3.pool may draw 0 Encounters, none a Finale; it needs 1');
    const retagged = await both(['encounters', 'change', 'a-broken-bridge', '--tags', 'water'], 'POST', '/api/encounters/change', { key: 'a-broken-bridge', values: { tags: ['water'] } });
    expect(problemsOf(retagged.json)).toContain('questTemplates.a-quiet-word.beats.3.pool may draw 0 Encounters');
    const bad = await both(['encounters', 'add', 'a-wide-river', '--row', JSON.stringify({ ...bridge, kind: 'swimming' })], 'POST', '/api/encounters/add', { key: 'a-wide-river', values: { ...bridge, kind: 'swimming' } });
    expect(problemsOf(bad.json)).toContain('encounters/a-wide-river.json: kind');
  });

  test('check add, change and remove change its Checks, the pass formula given with them', async () => {
    const { both } = await pair();
    await both(['encounters', 'add', 'a-broken-bridge', '--row', JSON.stringify(bridge)], 'POST', '/api/encounters/add', { key: 'a-broken-bridge', values: bridge });
    const second = { key: 'nerve', name: 'Nerve', score: ['min', 'party', ['stat', 'courage']], skills: [], difficultyFactor: 0.05 };
    const lonely = await both(['encounters', 'check', 'add', 'a-broken-bridge', '--row', JSON.stringify(second)], 'POST', '/api/encounters/check/add', { key: 'a-broken-bridge', values: second });
    expect(problemsOf(lonely.json)).toContain('encounters.a-broken-bridge.pass is missing');

    const added = await both(['encounters', 'check', 'add', 'a-broken-bridge', '--row', JSON.stringify(second), '--pass', '["and","cross","nerve"]'], 'POST', '/api/encounters/check/add', {
      key: 'a-broken-bridge',
      values: second,
      pass: ['and', 'cross', 'nerve'],
    });
    expect(added.json.row.row).toMatchObject({ checks: [{ key: 'cross' }, second], pass: ['and', 'cross', 'nerve'] });

    const changed = await both(['encounters', 'check', 'change', 'a-broken-bridge', 'nerve', 'difficultyFactor=0.08', 'flat=1'], 'POST', '/api/encounters/check/change', {
      key: 'a-broken-bridge',
      check: 'nerve',
      values: { difficultyFactor: 0.08, flat: 1 },
    });
    expect(changed.json.row.row.checks[1]).toMatchObject({ difficultyFactor: 0.08, flat: 1 });
    // The pass formula alone changed with a Check named.
    const passed = await both(['encounters', 'check', 'change', 'a-broken-bridge', 'nerve', '--pass', '["or","cross","nerve"]'], 'POST', '/api/encounters/check/change', {
      key: 'a-broken-bridge',
      check: 'nerve',
      pass: ['or', 'cross', 'nerve'],
    });
    expect(passed.json.row.row.pass).toEqual(['or', 'cross', 'nerve']);
    const twice = await both(['encounters', 'check', 'add', 'a-broken-bridge', '--row', JSON.stringify(second)], 'POST', '/api/encounters/check/add', { key: 'a-broken-bridge', values: second });
    expect(twice.json.problems).toEqual(['"nerve" is a Check of it already']);
    const named = await both(['encounters', 'check', 'remove', 'a-broken-bridge', 'nerve'], 'POST', '/api/encounters/check/remove', { key: 'a-broken-bridge', check: 'nerve' });
    expect(problemsOf(named.json)).toContain('"nerve" is not a Check of this Encounter');

    const removed = await both(['encounters', 'check', 'remove', 'a-broken-bridge', 'nerve', '--pass', 'null'], 'POST', '/api/encounters/check/remove', { key: 'a-broken-bridge', check: 'nerve', pass: null });
    expect(removed.json.row.row).toEqual(bridge);
    const unknown = await both(['encounters', 'check', 'change', 'a-broken-bridge', 'leap', 'flat=1'], 'POST', '/api/encounters/check/change', { key: 'a-broken-bridge', check: 'leap', values: { flat: 1 } });
    expect(unknown.json.problems).toEqual(['"leap" is not a Check of it: its Checks are cross']);
  });

  test('consequence add, change and remove change a Degree’s consequences', async () => {
    const { cliDir, both } = await pair();
    const route = '/api/encounters/consequence';
    const added = await both(['encounters', 'consequence', 'add', 'the-flooded-ford', 'triumph', 'kind=fame', 'delta=1'], 'POST', `${route}/add`, {
      key: 'the-flooded-ford',
      degree: 'triumph',
      values: { kind: 'fame', delta: 1 },
    });
    expect(added.json.row.row.consequences.triumph.at(-1)).toEqual({ kind: 'fame', delta: 1 });
    const index = added.json.row.row.consequences.triumph.length - 1;

    const changed = await both(['encounters', 'consequence', 'change', 'the-flooded-ford', 'triumph', String(index), 'delta=2'], 'POST', `${route}/change`, { key: 'the-flooded-ford', degree: 'triumph', at: index, values: { delta: 2 } });
    expect(changed.json.row.row.consequences.triumph[index]).toEqual({ kind: 'fame', delta: 2 });
    const removed = await both(['encounters', 'consequence', 'remove', 'the-flooded-ford', 'triumph', String(index)], 'POST', `${route}/remove`, { key: 'the-flooded-ford', degree: 'triumph', at: index });
    // Each change is held, the last leaving the row as it was.
    expect(removed.json).toMatchObject({ ok: true, pending: 3 });
    expect(removed.json.row.row).toEqual(readContentJson<Record<string, unknown>>(cliDir, 'encounters/')['the-flooded-ford']);

    const refusals: [readonly string[], string, Record<string, unknown>, string][] = [
      [['add', 'the-flooded-ford', 'glory', 'kind=fame', 'delta=1'], 'add', { key: 'the-flooded-ford', degree: 'glory', values: { kind: 'fame', delta: 1 } }, '"glory" is not a Degree: failure, setback, success, triumph'],
      [['add', 'the-flooded-ford', 'failure', 'kind=death', 'chance=2'], 'add', { key: 'the-flooded-ford', degree: 'failure', values: { kind: 'death', chance: 2 } }, 'chance is 2; it is a probability from 0 to 1'],
      [['add', 'the-flooded-ford', 'success', 'kind=trait', 'traitKey=scarred', 'chance=0.1'], 'add', { key: 'the-flooded-ford', degree: 'success', values: { kind: 'trait', traitKey: 'scarred', chance: 0.1 } }, 'an earned Trait stands in the triumph list'],
      [['remove', 'the-flooded-ford', 'failure', '9'], 'remove', { key: 'the-flooded-ford', degree: 'failure', at: 9 }, 'consequences.failure.9 is not a consequence of it'],
    ];
    for (const [words, verb, body, problem] of refusals) {
      const refused = await both(['encounters', 'consequence', ...words], 'POST', `${route}/${verb}`, body);
      expect(refused.code, words.join(' ')).toBe(1);
      expect(problemsOf(refused.json), words.join(' ')).toContain(problem);
    }

    // A consequence added at a place goes there, the rest after it.
    const failures = readContentJson<Record<string, Json>>(cliDir, 'encounters/')['the-flooded-ford'].consequences.failure;
    const first = await both(['encounters', 'consequence', 'add', 'the-flooded-ford', 'failure', '0', 'kind=morale', 'delta=-1'], 'POST', `${route}/add`, {
      key: 'the-flooded-ford',
      degree: 'failure',
      at: 0,
      values: { kind: 'morale', delta: -1 },
    });
    expect(first.json.row.row.consequences.failure).toEqual([{ kind: 'morale', delta: -1 }, ...failures]);
  });
});

describe('finishing, the doctor and recovery, through both adapters', () => {
  test('finish writes every pending edit of both lists to its row’s file, raises the content version and runs the tests', async () => {
    const { cliDir, apiDir, both } = await pair();
    const version = readContentVersion(cliDir);
    await both(['encounters', 'add', 'a-broken-bridge', '--row', JSON.stringify(bridge)], 'POST', '/api/encounters/add', { key: 'a-broken-bridge', values: bridge });
    await both(['quests', 'beat', 'change', 'a-quiet-word', '1', 'line=Somewhere quiet.'], 'POST', '/api/quests/beat/change', { key: 'a-quiet-word', at: 1, values: { line: 'Somewhere quiet.' } });
    const finished = await both(['quests', 'finish'], 'POST', '/api/quests/finish', {});
    expect(finished.json).toMatchObject({ ok: true, edits: 2, changed: ['quest-templates/a-quiet-word.json', 'encounters/a-broken-bridge.json'], contentVersion: { from: version, to: version + 1 } });
    for (const dir of [cliDir, apiDir]) {
      expect(status(dir).split('\n').filter((line) => line !== '').sort()).toEqual([' M content/quest-templates/a-quiet-word.json', ' M content/version.json', '?? content/encounters/a-broken-bridge.json']);
      expect(readContentJson<Record<string, unknown>>(dir, 'encounters/')['a-broken-bridge']).toEqual(bridge);
      // Only the line changed, in the file's own layout.
      expect(readFileSync(path.join(dir, 'content', 'quest-templates', 'a-quiet-word.json'), 'utf8')).toContain('    { "line": "Somewhere quiet.", "pool": { "kinds": ["stealth"] } },\n');
    }
    expect(readFileSync(path.join(cliDir, 'content', 'version.json'), 'utf8')).toContain('added a-broken-bridge; changed a-quiet-word');
    expect((await both(['encounters', 'finish'], 'POST', '/api/encounters/finish', {})).json).toMatchObject({ ok: true, edits: 0 });
  });

  test('doctor and recover answer through both', async () => {
    const { both } = await pair();
    const report = await both(['quests', 'doctor'], 'GET', '/api/quests/doctor');
    expect(report.code).toBe(0);
    expect(report.json).toMatchObject({ ok: true, content: { ok: true }, pending: { ok: true, edits: 0 }, quests: { templates: 12, pools: { ok: true }, tiers: { ok: true }, drawn: { ok: true }, finales: { ok: true, count: 4 } } });
    const recovered = await both(['encounters', 'recover'], 'POST', '/api/encounters/recover', {});
    expect(recovered.json).toEqual({ ok: true, recovered: [] });
    const elsewhere = await both(['encounters', 'doctor'], 'GET', '/api/encounters/doctor');
    expect(elsewhere.code).toBe(2);
    expect(elsewhere.json.problems[0]).toContain('(`quests doctor` checks both)');
  });

  // "Finish", its undoing and a "Finish" cut off, on the edit session's content files' adapter
  // (DL-244), for this kind's two folders.
  test('a test that fails undoes "Finish" through both: every file of both lists put back, the edits still pending', async () => {
    const { cliDir, apiDir, both } = await pair();
    for (const dir of [cliDir, apiDir]) plantOutcome(dir, 'fail');
    await both(['encounters', 'add', 'a-broken-bridge', '--row', JSON.stringify(bridge)], 'POST', '/api/encounters/add', { key: 'a-broken-bridge', values: bridge });
    await both(['quests', 'remove', 'the-sickness-at-the-mill'], 'POST', '/api/quests/remove', { key: 'the-sickness-at-the-mill' });
    const undone = await both(['encounters', 'finish'], 'POST', '/api/encounters/finish', {});
    expect(undone).toMatchObject({ code: 1, json: { ok: false, kind: 'undone' } });
    for (const dir of [cliDir, apiDir]) expect(status(dir)).toBe('');
    const pending = await both(['quests', 'pending'], 'GET', '/api/quests/pending');
    expect(pending.json.edits.map((edit: Json) => `${edit.op} ${edit.list} ${edit.key}`)).toEqual(['add encounters a-broken-bridge', 'remove quests the-sickness-at-the-mill']);
  });

  test('a "Finish" cut off is put back by the next command through both, which names its files once; one held by a live process is busy until recover --force', async () => {
    const { cliDir, apiDir, url } = await pair();
    const template = (dir: string): string => path.join(dir, 'content', 'quest-templates', 'a-quiet-word.json');
    const before = readFileSync(template(cliDir));
    /** A journal the process `pid` left, the file since written over. */
    const plant = (pid: number): void => {
      for (const dir of [cliDir, apiDir]) {
        writeAtomically(journalPath(dir), JSON.stringify({ pid, startedAt: '2026-10-11T00:00:00Z', contentVersion: 39, edits: 1, files: { [template(dir)]: before.toString('base64') } }));
        writeFileSync(template(dir), '{}\n');
      }
    };
    const viaApi = async (method: 'GET' | 'POST', route: string): Promise<{ status: number; json: Json }> => {
      const response = await fetch(new URL(route, url), method === 'GET' ? {} : { method, headers: { 'content-type': 'application/json' }, body: '{}' });
      return { status: response.status, json: await response.json() };
    };
    const putBack = (): void => {
      for (const dir of [cliDir, apiDir]) {
        expect(readFileSync(template(dir))).toEqual(before);
        expect(status(dir)).toBe('');
      }
    };

    // A process long gone.
    plant(2 ** 22 + 7);
    expect((await json(cliDir, 'quests', 'pending')).json).toEqual({ edits: [], recovered: [template(cliDir)] });
    expect((await viaApi('GET', '/api/quests/pending')).json).toEqual({ edits: [], recovered: [template(apiDir)] });
    putBack();
    expect((await json(cliDir, 'encounters', 'recover')).json).toEqual({ ok: true, recovered: [] });
    expect((await viaApi('POST', '/api/encounters/recover')).json).toEqual({ ok: true, recovered: [] });

    // A process alive, this one's parent: read as running, until --force.
    plant(process.ppid);
    expect((await json(cliDir, 'quests', 'pending')).json).toMatchObject({ ok: false, kind: 'busy' });
    expect(await viaApi('GET', '/api/quests/pending')).toMatchObject({ status: 409, json: { ok: false, kind: 'busy' } });
    expect((await json(cliDir, 'encounters', 'recover', '--force')).json).toEqual({ ok: true, recovered: [template(cliDir)] });
    const forced = await fetch(new URL('/api/encounters/recover', url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"force":true}' });
    expect(await forced.json()).toEqual({ ok: true, recovered: [template(apiDir)] });
    putBack();
  });

  test('a pending edit that no longer applies is named with its own family’s discard', async () => {
    const { cliDir, apiDir, both } = await pair();
    await both(['encounters', 'change', 'the-patrons-steward', '--name', 'The steward'], 'POST', '/api/encounters/change', { key: 'the-patrons-steward', values: { name: 'The steward' } });
    for (const dir of [cliDir, apiDir]) rmSync(path.join(dir, 'content', 'encounters', 'the-patrons-steward.json'));
    const stale = await both(['quests', 'list'], 'GET', '/api/quests/list');
    expect(stale.json.problems[0]).toBe('The pending edit 1 (change the-patrons-steward) no longer applies; discard it with `encounters discard the-patrons-steward`');
  });
});
