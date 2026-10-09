import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readContentVersion } from '@heroesim/content/write';
import { describe, expect, test } from 'vitest';
import { pendingPath } from './editor.js';
import { command, git, json, plantOutcome, readContentJson, scratch, status, writeContentJson, type Failure, type Row } from './test-support.js';
import { npmTest } from './tests-run.js';

// The editor's commands (v1.1.4-S12, DL-150 items 7 to 12), each driven on a scratch copy of the
// repository, made a git repository so that `git status` shows what each left behind. Separate
// command lines share the pending edits through `.editor/traits.json`, as the skills' calls will.
// The commands on a Trait's uses are `uses.test.ts`'s and `update.test.ts`'s (DL-234).

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

// "Finish" end to end: the scratch copy's planted `npm test` run through npm in a process of its own,
// failing and passing, as the skills' Finish runs the suite; the other tests read it in this process
// (`plantedTests`, DL-234).
describe('finish', () => {
  /** `traits finish --json` with its tests run by `npm test` in the scratch copy. */
  async function finishThroughNpm<T>(dir: string): Promise<{ code: number; json: T }> {
    const result = await command(['traits', 'finish', '--root', dir, '--json'], { runTests: npmTest });
    return { code: result.code, json: JSON.parse(result.out) as T };
  }

  test('with a failing test planted, puts every file back, reports the failure and keeps the edits pending', async () => {
    const dir = scratch();
    plantOutcome(dir, 'fail');
    await json(dir, 'traits', 'add', 'hero', 'brave', ...brave, '--excludes', 'scarred');
    const version = readContentVersion(dir);
    const finished = await finishThroughNpm<Failure>(dir);

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
    const finished = await finishThroughNpm<{ ok: true; edits: number; changed: string[]; contentVersion: { from: number; to: number }; tests: { ok: boolean } }>(dir);

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

  // The lines of the process npm runs are passed on as they come, which the page's "Finish" shows and
  // the in-process runner cannot prove (DL-234).
  test('without --json, passes on the lines of the tests npm runs', async () => {
    const dir = scratch();
    plantOutcome(dir, 'fail');
    await json(dir, 'traits', 'change', 'thrifty', '--cost', '3');
    const finished = await command(['traits', 'finish', '--root', dir], { runTests: npmTest });

    expect(finished.code).toBe(1);
    expect(finished.err).toContain(' RUN  the planted tests');
    expect(finished.err).toContain(' FAIL  |content| src/planted.test.ts > a planted test fails');
    expect(status(dir)).toBe('');
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
    const docPath = path.join(dir, 'docs', 'agents', 'traits-register.md');
    writeFileSync(docPath, readFileSync(docPath, 'utf8').replace('## In content', '## In the content'));
    const rows = readContentJson(dir, 'hero-traits.json');
    rows.lame = { ...(rows.lame as object), excludes: ['scarred'] };
    writeContentJson(dir, 'hero-traits.json', rows);

    const sick = await json<{ ok: boolean; drift: { problems: string[] }; freshness: { problems: string[] }; content: { problems: string[] } }>(dir, 'traits', 'doctor');
    expect(sick.code).toBe(1);
    expect(sick.json.drift.problems).toEqual(['engine/src/planted.ts:2: planted reads .heroTraits, which no entry of the register lists']);
    expect(sick.json.freshness.problems).toEqual(["docs/agents/traits-register.md's register part is not what the register makes now: run `npm run edit -- traits doc`"]);
    expect(sick.json.content.problems.join('\n')).toContain('"scarred" does not exclude "lame" in return');

    const text = await command(['traits', 'doctor', '--root', dir]);
    expect(text.err).toContain('✗ Drift: the register and the code differ');

    const written = await json<{ changed: boolean }>(dir, 'traits', 'doc');
    expect(written.json.changed).toBe(true);
    expect((await json<{ freshness: { ok: boolean } }>(dir, 'traits', 'doctor')).json.freshness.ok).toBe(true);
    expect((await json<{ changed: boolean }>(dir, 'traits', 'doc')).json.changed).toBe(false);
  });
});
