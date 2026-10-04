import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { contentEntries, usesOf } from '@heroesim/content/uses';
import { readContentVersion } from '@heroesim/content/write';
import { afterEach, describe, expect, test } from 'vitest';
import { readContentFiles } from './content-files.js';
import type { Deps } from './cli.js';
import { pendingPath } from './editor.js';
import { command, git, json, plantOutcome, plantQueries, readContentJson, scratchRepository, status, writeContentJson } from './test-support.js';

// The editor's commands (v1.1.4-S12, DL-150 items 7 to 12), each driven on a scratch copy of the
// repository, made a git repository so that `git status` shows what each left behind. Separate
// command lines share the pending edits through `.editor/traits.json`, as the skills' calls will.

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});
/** A scratch copy; with `engine`, its engine/src/ too, for a test that runs the doctor. */
function scratch(options: { engine?: boolean } = {}): string {
  const { dir, remove } = scratchRepository(options);
  scratches.push(remove);
  return dir;
}

type Row = { key: string; list: string; row: Record<string, unknown>; uses: { at: string; blocksRemoval: boolean }[]; rules: { id: string }[]; pending: string | null };
type Failure = { ok: false; kind: string; problems: string[]; uses?: { at: string; entry: string }[] };

const brave = ['--name', 'Brave', '--effects', '[{"kind":"statModifiers","modifiers":{"courage":2}}]'];

describe('reading', () => {
  test('list gives every Trait of both lists, with its uses', async () => {
    const dir = scratch();
    const { code, json: listed } = await json<{ rows: Row[]; pending: number }>(dir, 'traits', 'list');

    expect(code).toBe(0);
    // Every Trait of the content, in its files' order: the owner's to add to (the verification of v1.1.4-S13).
    expect(listed.rows.map((row) => `${row.list}:${row.key}`)).toEqual([
      ...Object.keys(readContentJson(dir, 'guildmaster-traits.json')).map((key) => `guildmaster:${key}`),
      ...Object.keys(readContentJson(dir, 'hero-traits.json')).map((key) => `hero:${key}`),
    ]);
    expect(listed.rows.map((row) => row.key)).toEqual(expect.arrayContaining(['old-soldier', 'mistrusts-magic', 'scarred', 'short-winded']));
    expect(listed.rows.find((row) => row.key === 'thrifty')?.uses.map((use) => use.at)).toEqual([
      'guildmaster-traits.json: spendthrift.excludes.0',
      'descriptions.json: biography.traits.thrifty.0',
      'descriptions.json: biography.traits.thrifty.1',
      'descriptions.json: biography.traits.thrifty.2',
      'descriptions.json: callings.merchant.suits.0',
      'descriptions.json: callings.lawyer.suits.0',
    ]);
    expect(listed.pending).toBe(0);

    const text = await command(['traits', 'list', '--root', dir]);
    expect(text.out).toContain('Guildmaster Traits:');
    expect(text.out).toContain('lame — Lame: -2 dexterity, -1 endurance; 4 uses');
  });

  test('show gives one Trait, its uses and the rules that read it; an unknown key is refused', async () => {
    const dir = scratch();
    const { code, json: shown } = await json<Row>(dir, 'traits', 'show', 'scarred');

    expect(code).toBe(0);
    expect(shown.row).toEqual({ name: 'Scarred', excludes: [], effects: [{ kind: 'statModifiers', modifiers: { courage: 1, charisma: -1 } }] });
    expect(shown.uses.map((use) => use.at)).toEqual([
      'injuries.json: deep-cut.leavesTrait',
      'descriptions.json: heroBiography.traits.scarred.0',
      'descriptions.json: heroBiography.traits.scarred.1',
      'descriptions.json: heroBiography.traits.scarred.2',
      'portrait-appearances.json: features.scar.shows.0',
    ]);
    expect(shown.rules.map((rule) => rule.id)).toEqual(expect.arrayContaining(['effective-stats', 'injury-traits', 'earned-trait']));
    expect(shown.rules.map((rule) => rule.id)).not.toContain('encounter-bonus');

    const unknown = await json<Failure>(dir, 'traits', 'show', 'brave');
    expect(unknown.code).toBe(1);
    expect(unknown.json).toEqual({ ok: false, kind: 'refused', problems: ['"brave" is not a key of Traits'] });
  });

  test('find searches the keys, names, effects and uses', async () => {
    const dir = scratch();
    const find = async (text: string) => (await json<{ found: { key: string; matched: string[] }[] }>(dir, 'traits', 'find', text)).json.found;

    expect(await find('morale')).toEqual([
      { key: 'well-liked', list: 'guildmaster', name: 'Well liked', matched: ['effects'] },
      { key: 'miser', list: 'guildmaster', name: 'Miser', matched: ['effects'] },
    ]);
    expect((await find('deep-cut')).map((each) => each.key)).toEqual(['scarred']);
    expect((await find('SOLDIER')).map((each) => [each.key, each.matched])).toEqual([['old-soldier', ['key', 'name', 'uses']]]);
    expect((await find('eye')).map((each) => each.key)).toEqual(['one-eyed']);
    expect(await find('nothing like it')).toEqual([]);
  });

  test('uses gives every use in content, and the rules', async () => {
    const dir = scratch();
    const { json: found } = await json<{ uses: { at: string; blocksRemoval: boolean }[] }>(dir, 'traits', 'uses', 'well-liked');

    expect(found.uses).toEqual([
      expect.objectContaining({ at: 'guildmaster-traits.json: miser.excludes.0', blocksRemoval: false }),
      expect.objectContaining({ at: 'descriptions.json: biography.traits.well-liked.0', blocksRemoval: true }),
      expect.objectContaining({ at: 'descriptions.json: biography.traits.well-liked.1', blocksRemoval: true }),
      expect.objectContaining({ at: 'descriptions.json: biography.traits.well-liked.2', blocksRemoval: true }),
    ]);
  });

  test('a command line it cannot read exits 2, with the usage', async () => {
    const dir = scratch();
    expect((await command(['traits', 'frobnicate', '--root', dir])).code).toBe(2);
    expect((await command(['portraits', 'list', '--root', dir])).code).toBe(2);
    expect((await command(['traits', 'show', '--root', dir])).code).toBe(2);
    expect((await command(['traits', 'list', '--root', path.join(dir, 'not-there')])).code).toBe(2);
    const usage = await command(['traits', 'list', '--sideways']);
    expect(usage.code).toBe(2);
    expect(usage.err).toContain('Usage: npm run edit');
  });
});

describe('editing, held as pending between command lines', () => {
  test('add puts a Trait in a list, pending; the files are untouched and its exclusions are held both ways', async () => {
    const dir = scratch();
    const added = await json<{ ok: boolean; row: Row; pending: number }>(dir, 'traits', 'add', 'hero', 'brave', ...brave, '--excludes', 'scarred');

    expect(added.code).toBe(0);
    expect(added.json.row).toMatchObject({ key: 'brave', list: 'hero', pending: 'added', row: { name: 'Brave', excludes: ['scarred'], effects: [{ kind: 'statModifiers', modifiers: { courage: 2 } }] } });
    expect(added.json.pending).toBe(1);
    expect(status(dir)).toBe('');
    expect(existsSync(pendingPath(dir, 'traits'))).toBe(true);

    // The next command line reads it, and the other side of the exclusion.
    const scarred = await json<Row>(dir, 'traits', 'show', 'scarred');
    expect(scarred.json.row.excludes).toEqual(['brave']);
    expect(scarred.json.pending).toBeNull();
    expect(scarred.json.uses.map((use) => use.at)).toContain('hero-traits.json: brave.excludes.0');

    const guildmaster = await json<{ row: Row }>(dir, 'traits', 'add', 'guildmaster', 'genial', '--row', '{"name":"Genial","cost":1,"effects":[{"kind":"guildMoraleShift","delta":2}]}');
    expect(guildmaster.code).toBe(0);
    expect(guildmaster.json.row.row).toEqual({ name: 'Genial', cost: 1, excludes: [], effects: [{ kind: 'guildMoraleShift', delta: 2 }] });
  });

  test.each([
    ['a key not written in lower case and hyphens', ['hero', 'Brave!', ...brave], '"Brave!" is not a key'],
    ['a key in use', ['guildmaster', 'scarred', '--name', 'Scarred', '--cost', '0', '--effects', '[{"kind":"guildMoraleShift","delta":1}]'], '"scarred" is a key already, in hero'],
    ['a list there is not', ['villain', 'brave', ...brave], '"villain" is not a list of Traits'],
    ['no name', ['hero', 'brave'], 'name: a Trait has a name'],
    ['a Guildmaster Trait with no effect, by the content checks', ['guildmaster', 'genial', '--name', 'Genial', '--cost', '1'], 'guildmasterTraits.genial.effects is empty'],
    ['an effect of the other list', ['hero', 'brave', '--name', 'Brave', '--effects', '[{"kind":"upkeepFactor","factor":0.9}]'], 'hero-traits.json'],
    ['an exclusion of a Trait not there', ['hero', 'brave', ...brave, '--excludes', 'reckless'], 'heroTraits.brave.excludes: "reckless" is not a Hero Trait'],
    ['a field a Trait has not', ['hero', 'brave', ...brave, '--cost', '1'], 'cost: not a field of a Hero Trait'],
  ])('add refuses %s, naming why, and holds nothing', async (_name, args, problem) => {
    const dir = scratch();
    const refused = await json<Failure>(dir, 'traits', 'add', ...args);

    expect(refused.code).toBe(1);
    expect(refused.json.kind).toBe('refused');
    expect(refused.json.problems.join('\n')).toContain(problem);
    expect(existsSync(pendingPath(dir, 'traits'))).toBe(false);
  });

  test('change changes the fields given, keeps the key, and moves an exclusion on both sides', async () => {
    const dir = scratch();
    const changed = await json<{ row: Row }>(dir, 'traits', 'change', 'miser', '--name', 'Skinflint', '--excludes', 'spendthrift');

    expect(changed.code).toBe(0);
    expect(changed.json.row).toMatchObject({ key: 'miser', pending: 'changed', row: { name: 'Skinflint', cost: -2, excludes: ['spendthrift'], effects: [{ kind: 'guildMoraleShift', delta: -5 }] } });
    expect((await json<Row>(dir, 'traits', 'show', 'well-liked')).json.row.excludes).toEqual([]);
    expect((await json<Row>(dir, 'traits', 'show', 'spendthrift')).json.row.excludes).toEqual(['thrifty', 'miser']);

    const rekeyed = await json<Failure>(dir, 'traits', 'change', 'miser', '--row', '{"key":"skinflint"}');
    expect(rekeyed.code).toBe(1);
    expect(rekeyed.json.problems).toEqual(['a key is fixed once made: add a new row instead']);

    const broken = await json<Failure>(dir, 'traits', 'change', 'lame', '--effects', '[{"kind":"statModifiers","modifiers":{"dexterity":0}}]');
    expect(broken.code).toBe(1);
    expect(broken.json.problems).toEqual(['heroTraits.lame.effects.0.modifiers.dexterity is 0; it is a whole number other than 0']);
    expect((await json<{ edits: unknown[] }>(dir, 'traits', 'pending')).json.edits).toHaveLength(1);
  });

  test('remove takes out an unused Trait, and the editor takes it out of the excludes that name it', async () => {
    const dir = scratch();
    await json(dir, 'traits', 'add', 'hero', 'brave', ...brave, '--excludes', 'scarred,lame');
    // Added and removed in one session: as if never made.
    const removedNew = await json<{ stripped: { at: string }[]; pending: number }>(dir, 'traits', 'remove', 'brave');
    expect(removedNew.code).toBe(0);
    expect(removedNew.json.stripped.map((use) => use.at)).toEqual(['hero-traits.json: scarred.excludes.0', 'hero-traits.json: lame.excludes.0']);
    expect(removedNew.json.pending).toBe(0);

    // A Trait the content ships, used by other Traits' excludes alone.
    const content = readContentJson(dir, 'descriptions.json') as { biography: { traits: Record<string, unknown> } };
    delete content.biography.traits['well-liked'];
    writeContentJson(dir, 'descriptions.json', content);
    git(dir, 'commit', '--quiet', '-am', 'well-liked has no sentences');
    const removed = await json<{ stripped: { at: string }[]; pending: number }>(dir, 'traits', 'remove', 'well-liked');
    expect(removed.code).toBe(0);
    expect(removed.json.stripped.map((use) => use.at)).toEqual(['guildmaster-traits.json: miser.excludes.0']);
    expect((await json<Row>(dir, 'traits', 'show', 'miser')).json.row.excludes).toEqual(['spendthrift']);
    expect((await json<Failure>(dir, 'traits', 'show', 'well-liked')).code).toBe(1);
    expect(status(dir)).toBe('');
  });

  test('pending lists the edits, and discard drops one Trait\'s or all', async () => {
    const dir = scratch();
    await json(dir, 'traits', 'add', 'hero', 'brave', ...brave);
    await json(dir, 'traits', 'change', 'lame', '--name', 'Limping');
    expect((await json<{ edits: { op: string; key: string }[] }>(dir, 'traits', 'pending')).json.edits.map((edit) => `${edit.op} ${edit.key}`)).toEqual(['add brave', 'change lame']);

    expect((await json(dir, 'traits', 'discard', 'brave')).json).toEqual({ ok: true, discarded: 1, left: 1 });
    expect((await json<Row>(dir, 'traits', 'show', 'lame')).json.row.name).toBe('Limping');
    expect((await json(dir, 'traits', 'discard')).json).toEqual({ ok: true, discarded: 1, left: 0 });
    expect(existsSync(pendingPath(dir, 'traits'))).toBe(false);
    expect((await json<Row>(dir, 'traits', 'show', 'lame')).json.row.name).toBe('Lame');
  });
});

// The verification of v1.1.4-S12: every list of edits saved passes the content's checks, a change
// holds only the fields it gave, and the pending file is written whole and dropped when unreadable.
describe('the pending edits, checked as saved', () => {
  test('a Trait added, excluded by another and removed leaves edits that apply and pass (the verifier\'s case)', async () => {
    const dir = scratch({ engine: true });
    expect((await json(dir, 'traits', 'add', 'hero', 'foo', '--name', 'Foo')).code).toBe(0);
    expect((await json(dir, 'traits', 'change', 'lame', '--excludes', 'foo')).code).toBe(0);
    const removed = await json<{ stripped: { at: string }[] }>(dir, 'traits', 'remove', 'foo');

    expect(removed.code).toBe(0);
    expect(removed.json.stripped.map((use) => use.at)).toEqual(['hero-traits.json: lame.excludes.0']);
    expect((await json<Row>(dir, 'traits', 'show', 'lame')).json.row.excludes).toEqual([]);
    expect((await json<{ ok: boolean; pending: { ok: boolean; problems: string[] } }>(dir, 'traits', 'doctor')).json).toMatchObject({ ok: true, pending: { ok: true, problems: [] } });
    // Its edits could not go as if never made (lame's change names it), so its removal is held after them.
    expect((await json<{ edits: { op: string; key: string }[] }>(dir, 'traits', 'pending')).json.edits.map((edit) => `${edit.op} ${edit.key}`)).toEqual(['add foo', 'change lame', 'remove foo']);
  });

  test('a change holds the fields it gave, not an exclusion another edit wrote beside them', async () => {
    const dir = scratch();
    await json(dir, 'traits', 'add', 'hero', 'brave', ...brave, '--excludes', 'scarred');
    await json(dir, 'traits', 'change', 'scarred', '--name', 'Marked');
    const held = JSON.parse(readFileSync(pendingPath(dir, 'traits'), 'utf8')) as { edits: unknown[] };
    expect(held.edits[1]).toEqual({ op: 'change', list: 'hero', key: 'scarred', fields: { name: 'Marked' } });

    // Dropping brave leaves scarred's change applying, and excluding nothing.
    expect((await json(dir, 'traits', 'discard', 'brave')).json).toEqual({ ok: true, discarded: 1, left: 1 });
    expect((await json<Row>(dir, 'traits', 'show', 'scarred')).json.row).toMatchObject({ name: 'Marked', excludes: [] });
  });

  test('the doctor holds the pending edits to the content\'s checks, and names their problems', async () => {
    const dir = scratch({ engine: true });
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(path.dirname(pendingPath(dir, 'traits')), { recursive: true });
    writeFileSync(pendingPath(dir, 'traits'), JSON.stringify({ kind: 'traits', edits: [{ op: 'change', list: 'hero', key: 'lame', fields: { excludes: ['nobody'] } }] }));
    const report = await json<{ ok: boolean; pending: { ok: boolean; problems: string[] } }>(dir, 'traits', 'doctor');

    expect(report.code).toBe(1);
    expect(report.json.pending.problems).toEqual(['heroTraits.lame.excludes: "nobody" is not a Hero Trait']);
  });

  test('a pending file that cannot be read is named, and discard drops it', async () => {
    const dir = scratch();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(path.dirname(pendingPath(dir, 'traits')), { recursive: true });
    writeFileSync(pendingPath(dir, 'traits'), '{ "kind": "traits", "edits": [');
    const listed = await json<{ kind: string; problems: string[] }>(dir, 'traits', 'list');

    expect(listed.code).toBe(1);
    expect(listed.json.problems[0]).toMatch(/^\.editor\/traits\.json cannot be read \(.*\); `traits discard` drops it$/);
    expect((await json(dir, 'traits', 'discard')).json).toEqual({ ok: true, discarded: 0, left: 0, unreadable: true });
    expect((await json(dir, 'traits', 'list')).code).toBe(0);
  });

  test('a root without a package.json is refused, so that npm test cannot climb above it', async () => {
    const dir = scratch();
    const { rmSync } = await import('node:fs');
    rmSync(path.join(dir, 'package.json'));
    const result = await command(['traits', 'list', '--root', dir]);
    expect(result.code).toBe(2);
    expect(result.err).toContain('holds no package.json');
  });
});

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

// The Trait skills' `assign` and `unassign` (v1.1.4-S13, DL-150 item 13): a use of a Trait added in
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
  function prepared(options: { engine?: boolean } = {}): string {
    const dir = scratch(options);
    plantQueries(dir);
    return dir;
  }

  test.each(cases)('%s: a use added, pending, then taken out', async (id, key, words, at) => {
    const dir = prepared({ engine: true });
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
    expect((await json<{ ok: boolean }>(dir, 'traits', 'doctor')).json.ok).toBe(true);
    // The two leave the content as it was: "Finish" writes nothing (the verification of the skill runs).
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
    // The content version's changelog says it in a few words, a line of `version.json` (v1.1.6-S4).
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

  // The verification of v1.1.4-S13.
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

  test('an Encounter in the old form is refused, saying so', async () => {
    const dir = scratch();
    // The ambush as content 25 wrote it, in the old form (v1.1.4-S10 wrote the shipped one in Checks).
    const old = JSON.parse(readFileSync(new URL('../../../content/src/old-form/encounters.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    writeContentJson(dir, 'encounters.json', { ...readContentJson<Record<string, unknown>>(dir, 'encounters.json'), 'ambush-on-the-road': old['ambush-on-the-road'] });
    git(dir, 'commit', '--quiet', '-am', 'the old form');
    const refused = await json<Failure>(dir, 'traits', 'assign', 'scarred', 'encounter-has-trait', 'encounter=ambush-on-the-road', 'path=checks.0.score.1');
    expect(refused.json.problems[0]).toMatch(/^encounters\.json: ambush-on-the-road is an Encounter in the old form, with no Query to filter: ask the owner/);
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

// The editor's `update` (v1.1.6-S4, DL-186 item 14): one use of a Trait changed in place, its chance
// or another value of that use, held as pending and checked as every edit is, then "Finish" as ever.
describe('update', () => {
  type Updated = { ok: true; key: string; entry: string; at: string; uses: { at: string; entry: string }[]; pending: number; unchanged?: true };

  /** Where battle-shy's shipped trait consequence stands, as `traits uses` gives it. */
  async function battleShy(dir: string): Promise<string> {
    const uses = (await json<{ uses: { at: string; entry: string }[] }>(dir, 'traits', 'uses', 'battle-shy')).json.uses;
    const at = uses.find((use) => use.entry === 'encounter-trait')?.at;
    if (at === undefined) throw new Error('battle-shy has no trait consequence');
    return at;
  }

  /** The value at a use's place in the scratch copy's encounters.json. */
  function consequenceAt(dir: string, at: string): Record<string, unknown> {
    let here: unknown = readContentJson(dir, 'encounters.json');
    for (const step of (at.split(': ')[1] ?? '').split('.')) here = (here as Record<string, unknown>)[step];
    return here as Record<string, unknown>;
  }

  test('a chance changed in place, pending; "Finish" writes that line alone and raises the version through its file', async () => {
    const dir = scratch();
    const at = await battleShy(dir);
    const before = consequenceAt(dir, at);
    const version = readContentVersion(dir);

    const updated = await json<Updated>(dir, 'traits', 'update', 'battle-shy', 'encounter-trait', at, 'chance=0.12');
    expect(updated.code).toBe(0);
    expect(updated.json).toMatchObject({ ok: true, key: 'battle-shy', entry: 'encounter-trait', at, pending: 1 });
    expect(updated.json.uses.map((use) => use.at)).toContain(at);
    // Nothing is written before "Finish".
    expect(status(dir)).toBe('');
    expect((await json<{ edits: unknown[] }>(dir, 'traits', 'pending')).json.edits).toEqual([{ op: 'update', list: 'hero', key: 'battle-shy', entry: 'encounter-trait', at, values: { chance: 0.12 } }]);

    const finished = await json<{ changed: string[]; contentVersion: { from: number; to: number } }>(dir, 'traits', 'finish');
    expect(finished.code).toBe(0);
    expect(finished.json).toMatchObject({ changed: ['encounters.json'], contentVersion: { from: version, to: version + 1 } });
    expect(consequenceAt(dir, at)).toEqual({ ...before, chance: 0.12 });
    expect(readContentVersion(dir)).toBe(version + 1);
    expect(readContentJson<{ changelog: string[] }>(dir, 'version.json').changelog.at(-1)).toMatch(new RegExp(`^${version + 1} from the content editor's Finish of \\d{4}-\\d\\d-\\d\\d \\(1 use updated, of battle-shy\\)\\.$`));
    expect(status(dir).split('\n').filter((line) => line !== '').sort()).toEqual([' M content/encounters.json', ' M content/version.json']);
    expect(git(dir, 'diff', '--numstat', '--', 'content/encounters.json').trim()).toBe('1\t1\tcontent/encounters.json');
  });

  test("a use that does not exist is refused, naming the Trait's uses, and nothing is held", async () => {
    const dir = scratch();
    const refused = await json<Failure>(dir, 'traits', 'update', 'battle-shy', 'encounter-trait', 'encounters.json: ambush-on-the-road.consequences.failure.9', 'chance=0.1');

    expect(refused.code).toBe(1);
    expect(refused.json.kind).toBe('refused');
    expect(refused.json.problems[0]).toBe('"battle-shy" has no use in encounter-trait at encounters.json: ambush-on-the-road.consequences.failure.9; its uses:');
    expect(refused.json.problems.slice(1)).toContain(`encounter-trait at ${await battleShy(dir)}`);
    expect(existsSync(pendingPath(dir, 'traits'))).toBe(false);
  });

  test.each([
    ['a use whose entry holds the key alone', ['lame', 'injury-leaves-trait', 'shattered-knee.leavesTrait', 'leavesTrait=scarred'], 'the register says of injury-leaves-trait that a use there is the key alone: unassign it and assign another'],
    ['a value its entry does not change', ['battle-shy', 'encounter-trait', '@', 'odds=0.1'], "odds: not a value of encounter-trait's use, which takes chance, among"],
    ['a chance beyond its bound, by the register', ['battle-shy', 'encounter-trait', '@', 'chance=1.5'], 'the chance is 1.5; it is above 0 and at most 1'],
    ['a chance of 0, which the content checks take', ['battle-shy', 'encounter-trait', '@', 'chance=0'], 'the chance is 0; it is above 0 and at most 1'],
    ['an among the content checks refuse', ['battle-shy', 'encounter-trait', '@', 'among=5'], 'among is 5; a number stands for a Val or a Num, not a Set'],
    ['a value of the wrong type, by the register', ['battle-shy', 'encounter-trait', '@', 'chance=often'], 'the chance is wanted: a number'],
    ['a Trait there is not', ['brave', 'encounter-trait', '@', 'chance=0.1'], '"brave" is not a key of Traits'],
  ])('refuses %s, naming why, and holds nothing', async (_name, args, problem) => {
    const dir = scratch();
    const at = await battleShy(dir);
    const refused = await json<Failure>(dir, 'traits', 'update', ...args.map((arg) => (arg === '@' ? at : arg)));

    expect(refused.code).toBe(1);
    expect(refused.json.kind).toBe('refused');
    expect(refused.json.problems.join('\n')).toContain(problem);
    expect(existsSync(pendingPath(dir, 'traits'))).toBe(false);
  });

  test('a value as it is already is not held; a line without a value or a place exits 2', async () => {
    const dir = scratch();
    const at = await battleShy(dir);
    const chance = consequenceAt(dir, at).chance;
    const same = await json<Updated>(dir, 'traits', 'update', 'battle-shy', 'encounter-trait', at, `chance=${String(chance)}`);
    expect(same.json).toMatchObject({ ok: true, unchanged: true, pending: 0 });
    expect(existsSync(pendingPath(dir, 'traits'))).toBe(false);

    expect((await command(['traits', 'update', 'battle-shy', 'encounter-trait', at, '--root', dir])).code).toBe(2);
    expect((await command(['traits', 'update', 'battle-shy', 'encounter-trait', 'chance=0.1', '--root', dir])).code).toBe(2);
  });

  test('a Biography sentence changed in its place, by --target, and the text says what was changed', async () => {
    const dir = scratch();
    const target = path.join(dir, 'sentence.json');
    writeFileSync(target, JSON.stringify({ sentence: '{He} limps, and does not say why.' }));
    const text = await command(['traits', 'update', 'lame', 'biography-sentences', 'heroBiography.traits.lame.1', '--target', `@${target}`, '--root', dir]);
    rmSync(target);

    expect(text.code).toBe(0);
    expect(text.out).toBe('Updated, pending: lame at descriptions.json: heroBiography.traits.lame.1');
    expect((await command(['traits', 'pending', '--root', dir])).out).toBe('1. update hero lame (biography-sentences)');
    const working = await json<{ row: unknown; uses: { at: string }[] }>(dir, 'traits', 'show', 'lame');
    expect(working.json.uses.map((use) => use.at)).toContain('descriptions.json: heroBiography.traits.lame.1');
    expect((await json<{ changed: string[] }>(dir, 'traits', 'finish')).json.changed).toEqual(['descriptions.json']);
    expect(readContentJson<{ heroBiography: { traits: Record<string, string[]> } }>(dir, 'descriptions.json').heroBiography.traits.lame?.[1]).toBe('{He} limps, and does not say why.');
  });
});

describe('finish', () => {
  test('with a failing test planted, puts every file back, reports the failure and keeps the edits pending', async () => {
    const dir = scratch();
    plantOutcome(dir, 'fail');
    await json(dir, 'traits', 'add', 'hero', 'brave', ...brave, '--excludes', 'scarred');
    const version = readContentVersion(dir);
    const finished = await json<Failure>(dir, 'traits', 'finish');

    expect(finished.code).toBe(1);
    expect(finished.json.kind).toBe('undone');
    expect(finished.json.problems).toEqual(['FAIL  |content| src/planted.test.ts > a planted test fails', '× a planted test fails']);
    expect(status(dir)).toBe('');
    expect(readContentVersion(dir)).toBe(version);
    expect((await json<{ edits: unknown[] }>(dir, 'traits', 'pending')).json.edits).toHaveLength(1);
  });

  test('with the tests passing, writes the files in their layout, raises the content version once and clears the edits; never commits', async () => {
    const dir = scratch();
    await json(dir, 'traits', 'add', 'hero', 'brave', ...brave, '--excludes', 'scarred');
    await json(dir, 'traits', 'change', 'thrifty', '--cost', '3');
    const version = readContentVersion(dir);
    const head = git(dir, 'rev-parse', 'HEAD');
    const finished = await json<{ ok: true; edits: number; changed: string[]; contentVersion: { from: number; to: number }; tests: { ok: boolean } }>(dir, 'traits', 'finish');

    expect(finished.code).toBe(0);
    expect(finished.json).toMatchObject({ ok: true, edits: 2, changed: ['guildmaster-traits.json', 'hero-traits.json'], contentVersion: { from: version, to: version + 1 }, tests: { ok: true } });
    expect(readContentVersion(dir)).toBe(version + 1);
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(head);
    expect(status(dir).split('\n').filter((line) => line !== '').sort()).toEqual([
      ' M content/guildmaster-traits.json',
      ' M content/hero-traits.json',
      ' M content/version.json',
    ]);
    // Each file changes only where its value does.
    const numstat = git(dir, 'diff', '--numstat', '--', 'content/guildmaster-traits.json', 'content/hero-traits.json');
    expect(numstat.trim().split('\n')).toEqual(['1\t1\tcontent/guildmaster-traits.json', '3\t2\tcontent/hero-traits.json']);
    expect(readContentJson(dir, 'hero-traits.json').brave).toEqual({ name: 'Brave', excludes: ['scarred'], effects: [{ kind: 'statModifiers', modifiers: { courage: 2 } }] });
    // Raised through its file, `version.json`, a line of whose changelog says why (v1.1.6-S4).
    expect(readContentJson<{ version: number; changelog: string[] }>(dir, 'version.json')).toMatchObject({ version: version + 1 });
    expect(readContentJson<{ changelog: string[] }>(dir, 'version.json').changelog.at(-1)).toMatch(new RegExp(`^${version + 1} from the content editor's Finish of `));
    const raised = git(dir, 'diff', '--numstat', '--', 'content/version.json');
    expect(raised.trim()).toMatch(/^[23]\t[12]\tcontent\/version\.json$/);
    expect(existsSync(pendingPath(dir, 'traits'))).toBe(false);

    // Nothing pending: a second Finish changes nothing, the version included.
    const again = await json<{ edits: number; contentVersion: null }>(dir, 'traits', 'finish');
    expect(again.json).toMatchObject({ edits: 0, contentVersion: null });
    expect(readContentVersion(dir)).toBe(version + 1);
  });
});

describe('doctor and doc', () => {
  test('the doctor passes on the content as shipped, and fails on a planted read, a stale doc and broken content', async () => {
    const dir = scratch({ engine: true });
    const healthy = await json<{ ok: boolean; drift: { ok: boolean; reads: number } }>(dir, 'traits', 'doctor');
    expect(healthy.code).toBe(0);
    expect(healthy.json.ok).toBe(true);
    expect(healthy.json.drift.reads).toBeGreaterThan(50);

    const planted = path.join(dir, 'engine', 'src', 'planted.ts');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(planted, "export function planted(content: { heroTraits: object }): object {\n  return content.heroTraits;\n}\n");
    const docPath = path.join(dir, 'docs', 'agents', 'traits.md');
    writeFileSync(docPath, readFileSync(docPath, 'utf8').replace('## In content', '## In the content'));
    const rows = readContentJson(dir, 'hero-traits.json');
    rows.lame = { ...(rows.lame as object), excludes: ['scarred'] };
    writeContentJson(dir, 'hero-traits.json', rows);

    const sick = await json<{ ok: boolean; drift: { problems: string[] }; freshness: { problems: string[] }; content: { problems: string[] } }>(dir, 'traits', 'doctor');
    expect(sick.code).toBe(1);
    expect(sick.json.drift.problems).toEqual(['engine/src/planted.ts:2: planted reads .heroTraits, which no entry of the register lists']);
    expect(sick.json.freshness.problems).toEqual(["docs/agents/traits.md's register part is not what the register makes now: run `npm run edit -- traits doc`"]);
    expect(sick.json.content.problems.join('\n')).toContain('"scarred" does not exclude "lame" in return');

    const text = await command(['traits', 'doctor', '--root', dir]);
    expect(text.err).toContain('✗ Drift: the register and the code differ');

    const written = await json<{ changed: boolean }>(dir, 'traits', 'doc');
    expect(written.json.changed).toBe(true);
    expect((await json<{ freshness: { ok: boolean } }>(dir, 'traits', 'doctor')).json.freshness.ok).toBe(true);
    expect((await json<{ changed: boolean }>(dir, 'traits', 'doc')).json.changed).toBe(false);
  });
});
