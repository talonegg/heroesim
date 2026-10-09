import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readContentVersion } from '@heroesim/content/write';
import { describe, expect, test } from 'vitest';
import { pendingPath } from './editor.js';
import { command, git, json, readContentJson, scratch, status, type Failure } from './test-support.js';

// The editor's `update` (DL-186 item 14): one use of a Trait changed in place, its chance
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
