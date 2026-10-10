import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { contentEntries, usesOf } from '@heroesim/content/uses';
import { describe, expect, test } from 'vitest';
import { readContentFiles } from './content-files.js';
import type { Deps } from './cli.js';
import { pendingPath } from './editor.js';
import { command, git, json, plantQueries, readContentJson, scratch, status, writeContentJson, type Failure, type Row } from './test-support.js';

// The editor's commands on a Trait's uses in other content, each driven on a scratch copy of the
// repository as `cli.test.ts` drives the rest: a removal refused while a use stands, and `assign` and
// `unassign`; a file of their own, so that the limited group runs them beside the others (DL-234).

describe('a refused removal names every use', () => {
  // For each content entry of the register: a new Trait with no use, given one use of that entry
  // through the register's own `add`. Removing it is refused naming that use; for other Traits'
  // `excludes` it is not, and the editor takes the key out itself (DL-150 item 10).
  const targets: Record<string, { list: 'guildmaster' | 'hero'; target: Record<string, unknown> }> = {
    excludes: { list: 'hero', target: { trait: 'lame' } },
    'injury-leaves-trait': { list: 'hero', target: { injury: 'broken-arm' } },
    'encounter-trait': { list: 'hero', target: { encounter: 'ambush-on-the-road', degree: 'triumph', chance: 0.05 } },
    'encounter-has-trait': { list: 'hero', target: { encounter: 'ambush-on-the-road', path: 'checks.0.score.1' } },
    'synergy-has-trait': { list: 'hero', target: { synergy: 'shield-wall' } },
    'biography-sentences': { list: 'guildmaster', target: { sentence: '{He} is easy company.' } },
    'portrait-callings': { list: 'guildmaster', target: { calling: 'explorer', side: 'suits' } },
    'portrait-features': { list: 'hero', target: { feature: 'grey-hair' } },
  };

  test('the table covers every content entry', () => {
    expect(Object.keys(targets).sort()).toEqual(contentEntries().map((entry) => entry.id).sort());
  });

  /** A scratch copy holding `fresh`, a Trait of `list` with no use, and `uses` of it added through the register; committed. */
  function planted(list: 'guildmaster' | 'hero', ids: readonly string[]): string {
    const dir = scratch();
    plantQueries(dir);
    const file = list === 'hero' ? 'hero-traits.json' : 'guildmaster-traits.json';
    const rows = readContentJson(dir, file);
    rows.fresh = list === 'hero' ? { name: 'Fresh', excludes: [], effects: [] } : { name: 'Fresh', cost: 0, excludes: [], effects: [{ kind: 'guildMoraleShift', delta: 1 }] };
    writeContentJson(dir, file, rows);
    for (const id of ids) {
      const entry = contentEntries().find((each) => each.id === id);
      const change = entry?.add?.apply(readContentFiles(dir).values, 'fresh', targets[id]?.target ?? {}).change ?? {};
      for (const [changed, value] of Object.entries(change)) writeContentJson(dir, changed as 'hero-traits.json', value);
    }
    git(dir, 'add', '--all');
    git(dir, 'commit', '--quiet', '-m', 'fresh and its uses');
    return dir;
  }

  test.each(Object.entries(targets))('%s', async (id, { list }) => {
    const dir = planted(list, [id]);
    const expected = usesOf(readContentFiles(dir).values, 'fresh');
    expect(expected.map((use) => use.entry)).toEqual(id === 'excludes' ? ['excludes'] : [id]);
    const removed = await json<Failure & { stripped?: { at: string }[] }>(dir, 'traits', 'remove', 'fresh');

    if (id === 'excludes') {
      expect(removed.code).toBe(0);
      expect(removed.json.stripped?.map((use) => use.at)).toEqual(['hero-traits.json: lame.excludes.0']);
      expect((await json<Row>(dir, 'traits', 'show', 'lame')).json.row.excludes).toEqual([]);
    } else {
      expect(removed.code).toBe(1);
      expect(removed.json.kind).toBe('refused');
      expect(removed.json.uses?.map((use) => use.at)).toEqual(expected.map((use) => use.at));
      expect(removed.json.problems).toEqual(['"fresh" is used, and is not removed while it is: change or unassign each use first', ...expected.map((use) => `used at ${use.at}`)]);
      expect(existsSync(pendingPath(dir, 'traits'))).toBe(false);
    }
  });

  test('a Trait used in several places is refused naming each, and the text says the same', async () => {
    const dir = planted('hero', ['excludes', 'injury-leaves-trait', 'encounter-trait', 'encounter-has-trait', 'synergy-has-trait', 'portrait-features']);
    const removed = await json<Failure>(dir, 'traits', 'remove', 'fresh');

    expect(removed.json.uses?.map((use) => use.entry)).toEqual(['injury-leaves-trait', 'encounter-trait', 'encounter-has-trait', 'synergy-has-trait', 'portrait-features']);
    const text = await command(['traits', 'remove', 'fresh', '--root', dir]);
    expect(text.code).toBe(1);
    expect(text.err).toContain('used at injuries.json: broken-arm.leavesTrait');
    expect(text.err).toContain('used at encounters.json: ambush-on-the-road.consequences.triumph.1');
    expect(text.err).toContain('used at synergies.json: shield-wall.requires.1.1.1.2');
  });
});

// The Trait skills' `assign` and `unassign` (DL-150 item 13): a use of a Trait added in
// other content, and taken out, through each content entry of the register, held as pending and
// checked with the content's checks as every edit is.
describe('assign and unassign', () => {
  /**
   * What "Finish" writes, its test run passing without a process: the tests of what it writes run
   * the planted `npm test` elsewhere, and eight more processes here only load the suite.
   */
  async function writes(dir: string): Promise<{ changed: string[]; contentVersion: unknown }> {
    const passing: Deps['runTests'] = async () => ({ ok: true, exitCode: 0, failures: [], tail: [] });
    return JSON.parse((await command(['traits', 'finish', '--root', dir, '--json'], { runTests: passing })).out) as { changed: string[]; contentVersion: unknown };
  }

  type Assigned = { ok: true; key: string; entry: string; at?: string; added: { at: string }[]; uses: { at: string; entry: string }[]; pending: number };

  // For each content entry: a shipped Trait, the words of its target, and the place its new use stands.
  const cases: [string, string, string[], string][] = [
    ['excludes', 'lame', ['trait=one-eyed'], 'hero-traits.json: one-eyed.excludes.0'],
    ['injury-leaves-trait', 'lame', ['injury=broken-arm'], 'injuries.json: broken-arm.leavesTrait'],
    ['encounter-trait', 'one-eyed', ['encounter=ambush-on-the-road', 'degree=failure', 'chance=0.1'], 'encounters.json: ambush-on-the-road.consequences.failure.2'],
    ['encounter-has-trait', 'scarred', ['encounter=ambush-on-the-road', 'path=checks.0.score.1'], 'encounters.json: ambush-on-the-road.checks.0.score.1.2'],
    ['synergy-has-trait', 'scarred', ['synergy=shield-wall'], 'synergies.json: shield-wall.requires.1.1.1.2'],
    ['biography-sentences', 'short-winded', ['sentence={He} wheezes on the stairs.'], 'descriptions.json: heroBiography.traits.short-winded.3'],
    ['portrait-callings', 'well-liked', ['calling=explorer', 'side=suits'], 'descriptions.json: callings.explorer.suits.0'],
    ['portrait-features', 'lame', ['feature=grey-hair'], 'portrait-appearances.json: features.grey-hair.shows.0'],
  ];

  test('the table covers every content entry', () => {
    expect(cases.map(([id]) => id).sort()).toEqual(contentEntries().map((entry) => entry.id).sort());
  });

  /** A scratch copy with the Queries planted, whose Check, harm and Synergy a `has-trait` may filter. */
  function prepared(): string {
    const dir = scratch();
    plantQueries(dir);
    return dir;
  }

  test.each(cases)('%s: a use added, pending, then taken out', async (id, key, words, at) => {
    const dir = prepared();
    const before = (await json<{ uses: { at: string }[] }>(dir, 'traits', 'uses', key)).json.uses.map((use) => use.at);
    const assigned = await json<Assigned>(dir, 'traits', 'assign', key, id, ...words);

    expect(assigned.code).toBe(0);
    expect(assigned.json).toMatchObject({ ok: true, key, entry: id, pending: 1 });
    expect(assigned.json.added.map((use) => use.at)).toEqual([at]);
    expect(assigned.json.uses.map((use) => use.at)).toEqual(expect.arrayContaining([...before, at]));
    // Nothing is written before "Finish"; the next command line reads the use.
    expect(status(dir)).toBe('');
    expect((await json<{ uses: { at: string }[] }>(dir, 'traits', 'uses', key)).json.uses.map((use) => use.at)).toContain(at);
    expect((await json<{ edits: unknown[] }>(dir, 'traits', 'pending')).json.edits).toEqual([{ op: 'assign', list: expect.any(String), key, entry: id, target: expect.any(Object) }]);

    // Taken out again by its place, as `uses` gives it.
    const unassigned = await json<Assigned>(dir, 'traits', 'unassign', key, id, at);
    expect(unassigned.code).toBe(0);
    expect(unassigned.json).toMatchObject({ ok: true, at, pending: 2 });
    expect((await json<{ uses: { at: string }[] }>(dir, 'traits', 'uses', key)).json.uses.map((use) => use.at)).toEqual(before);
    // The two leave the content as it was: "Finish" writes nothing.
    expect(await writes(dir)).toMatchObject({ changed: [], contentVersion: null });
    expect(status(dir)).toBe('');
  });

  test('a shipped use is taken out by its path alone, and the Trait is then removed', async () => {
    const dir = scratch();
    const refused = await json<Failure>(dir, 'traits', 'remove', 'lame');
    const sentences = [0, 1, 2].map((index) => `descriptions.json: heroBiography.traits.lame.${index}`);
    expect(refused.json.uses?.map((use) => use.at)).toEqual(['injuries.json: shattered-knee.leavesTrait', ...sentences]);

    // From the last, since a use taken out of a list moves those after it.
    for (const use of [...(refused.json.uses ?? [])].reverse()) {
      expect((await json(dir, 'traits', 'unassign', 'lame', use.entry, use.at.split(': ')[1] ?? '')).code).toBe(0);
    }
    const removed = await json<{ ok: boolean; pending: number }>(dir, 'traits', 'remove', 'lame');
    expect(removed.json).toMatchObject({ ok: true, pending: 5 });
    expect(readContentJson(dir, 'injuries.json')['shattered-knee']).toMatchObject({ leavesTrait: 'lame' });

    const finished = await json<{ changed: string[] }>(dir, 'traits', 'finish');
    expect(finished.code).toBe(0);
    expect([...finished.json.changed].sort()).toEqual(['descriptions.json', 'hero-traits.json', 'injuries.json']);
    expect(readContentJson(dir, 'injuries.json')['shattered-knee']).toMatchObject({ leavesTrait: null });
    expect(readContentJson(dir, 'hero-traits.json').lame).toBeUndefined();
    // The content version's changelog says it in a few words, a line of `version.json`.
    expect(readContentJson<{ changelog: string[] }>(dir, 'version.json').changelog.at(-1)).toMatch(/ from the content editor's Finish of \d{4}-\d\d-\d\d \(removed lame; 4 uses unassigned, of lame\)\.$/);
  });

  test('"Finish" writes each assignment into its file, changing only those lines', async () => {
    const dir = prepared();
    const among = path.join(dir, 'among.json');
    writeFileSync(among, JSON.stringify({ encounter: 'ambush-on-the-road', degree: 'triumph', chance: 0.05, among: ['where', 'party', ['class', 'warrior']] }));
    expect((await json(dir, 'traits', 'assign', 'scarred', 'encounter-trait', '--target', `@${among}`)).code).toBe(0);
    rmSync(among);
    expect((await json(dir, 'traits', 'assign', 'lame', 'injury-leaves-trait', 'injury=broken-arm')).code).toBe(0);
    expect((await json(dir, 'traits', 'assign', 'lame', 'portrait-features', 'feature=grey-hair')).code).toBe(0);
    expect((await json(dir, 'traits', 'assign', 'miser', 'portrait-callings', 'calling=explorer', 'side=clashes')).code).toBe(0);

    const finished = await json<{ changed: string[]; contentVersion: { from: number; to: number } }>(dir, 'traits', 'finish');
    expect(finished.code).toBe(0);
    expect([...finished.json.changed].sort()).toEqual(['descriptions.json', 'encounters.json', 'injuries.json', 'portrait-appearances.json']);
    expect(finished.json.contentVersion.to).toBe(finished.json.contentVersion.from + 1);
    expect(readContentJson<Record<string, { consequences: { triumph: unknown[] } }>>(dir, 'encounters.json')['ambush-on-the-road']?.consequences.triumph.at(-1)).toEqual({
      kind: 'trait',
      traitKey: 'scarred',
      chance: 0.05,
      among: ['where', 'party', ['class', 'warrior']],
    });
    expect(readContentJson(dir, 'injuries.json')['broken-arm']).toMatchObject({ leavesTrait: 'lame' });
    const numstat = git(dir, 'diff', '--numstat', '--', 'content/injuries.json', 'content/portrait-appearances.json', 'content/descriptions.json');
    expect(numstat.trim().split('\n')).toHaveLength(3);
    for (const line of numstat.trim().split('\n')) expect(Number(line.split('\t')[0])).toBeLessThanOrEqual(3);
  });

  test.each([
    ['an entry the register lacks', ['lame', 'injury', 'injury=broken-arm'], '"injury" is not a use the register lists: excludes, injury-leaves-trait'],
    ['a field its target lacks', ['lame', 'injury-leaves-trait', 'injury=broken-arm', 'wound=deep'], "wound: not a field of injury-leaves-trait's target, which takes injury"],
    ['a Trait of the other list, by the register', ['miser', 'injury-leaves-trait', 'injury=broken-arm'], '"miser" is not a Hero Trait: an Injury leaves a Hero Trait'],
    ['an Injury that leaves another Trait, by the register', ['lame', 'injury-leaves-trait', 'injury=deep-cut'], 'injuries.json: deep-cut leaves "scarred" already'],
    ['a sentence the content checks refuse', ['lame', 'biography-sentences', 'sentence={He} limps'], 'heroBiography.traits.lame'],
    ['a Trait there is not', ['brave', 'injury-leaves-trait', 'injury=broken-arm'], '"brave" is not a key of Traits'],
  ])('assign refuses %s, naming why, and holds nothing', async (_name, args, problem) => {
    const dir = scratch();
    const refused = await json<Failure>(dir, 'traits', 'assign', ...args);

    expect(refused.code).toBe(1);
    expect(refused.json.kind).toBe('refused');
    expect(refused.json.problems.join('\n')).toContain(problem);
    expect(existsSync(pendingPath(dir, 'traits'))).toBe(false);
  });

  test('unassign refuses a place the Trait is not used, naming its uses; a line it cannot read exits 2', async () => {
    const dir = scratch();
    const refused = await json<Failure>(dir, 'traits', 'unassign', 'lame', 'injury-leaves-trait', 'broken-arm.leavesTrait');
    expect(refused.code).toBe(1);
    expect(refused.json.problems).toEqual([
      '"lame" has no use in injury-leaves-trait at broken-arm.leavesTrait; its uses:',
      'injury-leaves-trait at injuries.json: shattered-knee.leavesTrait',
      'biography-sentences at descriptions.json: heroBiography.traits.lame.0',
      'biography-sentences at descriptions.json: heroBiography.traits.lame.1',
      'biography-sentences at descriptions.json: heroBiography.traits.lame.2',
    ]);
    expect(existsSync(pendingPath(dir, 'traits'))).toBe(false);

    expect((await command(['traits', 'unassign', 'lame', 'injury-leaves-trait', '--root', dir])).code).toBe(2);
    expect((await command(['traits', 'assign', 'lame', 'injury-leaves-trait', 'broken-arm', '--root', dir])).code).toBe(2);
    expect((await command(['traits', 'assign', 'lame', '--root', dir])).code).toBe(2);
    expect((await command(['traits', 'assign', 'lame', 'excludes', '--target', '[1]', '--root', dir])).code).toBe(2);
  });

  // The verification (DL-150 item 13).
  test('a Biography sentence unassigned is the one assigned, the others standing', async () => {
    const dir = scratch();
    const before = readContentJson(dir, 'descriptions.json');
    const assigned = await json<Assigned>(dir, 'traits', 'assign', 'lame', 'biography-sentences', 'sentence={He} limps, and does not say why.');
    expect(assigned.json.added.map((use) => use.at)).toEqual(['descriptions.json: heroBiography.traits.lame.3']);
    expect((await json(dir, 'traits', 'unassign', 'lame', 'biography-sentences', 'heroBiography.traits.lame.3')).code).toBe(0);

    expect((await writes(dir)).changed).toEqual([]);
    expect(readContentJson(dir, 'descriptions.json')).toEqual(before);
  });

  test('a has-trait filter assigned twice in one place is refused, and the use added is named where it stands', async () => {
    const dir = prepared();
    const at = ['encounter=ambush-on-the-road', 'path=checks.0.score.1'];
    expect((await json(dir, 'traits', 'assign', 'scarred', 'encounter-has-trait', ...at)).code).toBe(0);
    const twice = await json<Failure>(dir, 'traits', 'assign', 'scarred', 'encounter-has-trait', ...at);
    expect(twice.code).toBe(1);
    expect(twice.json.problems).toEqual(['encounters.json: ambush-on-the-road.checks.0.score.1 is filtered by "scarred" already']);

    // Wrapped round one-eyed's filter, which is wrapped round scarred's: the new one, not the moved one.
    expect((await json(dir, 'traits', 'assign', 'one-eyed', 'encounter-has-trait', ...at)).code).toBe(0);
    const again = await json<Assigned>(dir, 'traits', 'assign', 'scarred', 'encounter-has-trait', ...at);
    expect(again.json.added.map((use) => use.at)).toEqual(['encounters.json: ambush-on-the-road.checks.0.score.1.2']);
    expect(again.json.uses.map((use) => use.at)).toContain('encounters.json: ambush-on-the-road.checks.0.score.1.1.1.2');
  });

  test('a change that changes nothing is not held', async () => {
    const dir = scratch();
    const same = await json<{ ok: boolean; unchanged?: boolean; pending: number }>(dir, 'traits', 'change', 'thrifty', '--cost', '2');
    expect(same.json).toMatchObject({ ok: true, unchanged: true, pending: 0 });
    expect(existsSync(pendingPath(dir, 'traits'))).toBe(false);
    expect((await command(['traits', 'change', 'thrifty', '--name', 'Thrifty', '--root', dir])).out).toContain('Nothing to change, nothing held');
  });

  test("the text says what was assigned, and pending names each edit's entry", async () => {
    const dir = scratch();
    const text = await command(['traits', 'assign', 'lame', 'injury-leaves-trait', 'injury=broken-arm', '--root', dir]);
    expect(text.code).toBe(0);
    expect(text.out).toBe('Assigned, pending: lame in injury-leaves-trait\n  Now used at injuries.json: broken-arm.leavesTrait');
    const unassigned = await command(['traits', 'unassign', 'lame', 'injury-leaves-trait', 'injuries.json:', 'shattered-knee.leavesTrait', '--root', dir]);
    expect(unassigned.out).toBe('Unassigned, pending: lame no longer used at injuries.json: shattered-knee.leavesTrait\n  4 uses left');
    expect((await command(['traits', 'pending', '--root', dir])).out).toBe('1. assign hero lame (injury-leaves-trait)\n2. unassign hero lame (injury-leaves-trait)');
  });
});
