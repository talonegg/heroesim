import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { Deps } from './cli.js';
import { ConfigEditor, configPath } from './config-kind.js';
import { Editor, pendingPath } from './editor.js';
import { journalPath, journalState, writeAtomically } from './finish-journal.js';
import { command, git, json, plantOutcome, scratchRepository, status } from './test-support.js';

// The editor's config kind (DL-186 item 15, DL-204), each command driven on a scratch
// copy of the repository, its `engine/src/config.json` committed, never the real file.

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});
function scratch(): string {
  const { dir, remove } = scratchRepository();
  scratches.push(remove);
  return dir;
}

type ConfigFile = { version: number; changelog: string[]; sections: Record<string, Record<string, unknown>> };
const readConfig = (dir: string): ConfigFile => JSON.parse(readFileSync(configPath(dir), 'utf8')) as ConfigFile;
type Failure = { ok: false; kind: string; problems: string[] };

/** "Finish"'s test run, `npm test` in the scratch copy: the planted script, passing or failing as planted. */
const planted: Deps = {
  runTests: async (root) => {
    const outcome = readFileSync(path.join(root, 'test-outcome.txt'), 'utf8').trim();
    return outcome === 'pass'
      ? { ok: true, exitCode: 0, failures: [], tail: [] }
      : { ok: false, exitCode: 1, failures: ['FAIL  |content| src/planted.test.ts > a planted test fails'], tail: [] };
  },
};

describe('show', () => {
  test('gives every section and its settings, as the file holds them', async () => {
    const dir = scratch();
    const { code, json: shown } = await json<{ sections: { section: string; settings: { setting: string; value: unknown; pending: boolean }[] }[]; pending: number }>(dir, 'config', 'show');

    expect(code).toBe(0);
    const file = readConfig(dir);
    expect(shown.sections.map((view) => view.section)).toEqual(Object.keys(file.sections));
    expect(shown.sections.flatMap((view) => view.settings)).toHaveLength(Object.values(file.sections).flatMap((section) => Object.keys(section)).length);
    expect(shown.sections.find((view) => view.section === 'guilds')?.settings).toContainEqual({ setting: 'wagePerLevel', value: 20, pending: false });
    expect(shown.pending).toBe(0);

    const text = await command(['config', 'show', 'transfers', '--root', dir]);
    expect(text.out.split('\n')).toEqual(['transfers:', ...Object.entries(file.sections.transfers ?? {}).map(([setting, value]) => `  ${setting} ${typeof value === 'string' ? value : JSON.stringify(value)}`)]);
    expect(text.out).toContain('  transferRegardBand warm');
  });

  test('refuses a section the file lacks, naming those it has', async () => {
    const dir = scratch();
    const { code, json: failure } = await json<Failure>(dir, 'config', 'show', 'weather');
    expect(code).toBe(1);
    expect(failure.problems[0]).toMatch(/^"weather" is not a section of config.json: world, heroes, /);
  });
});

describe('set', () => {
  test('holds a value as pending, the file unchanged, and show gives it beside the value in the file', async () => {
    const dir = scratch();
    const set = await json<{ ok: true; setting: string; section: string; value: unknown; was: unknown; pending: number }>(dir, 'config', 'set', 'wagePerLevel', '25');

    expect(set).toEqual({ code: 0, json: { ok: true, setting: 'wagePerLevel', section: 'guilds', value: 25, was: 20, pending: 1 } });
    expect(status(dir)).toBe('');
    expect(JSON.parse(readFileSync(pendingPath(dir, 'config'), 'utf8'))).toEqual({ kind: 'config', edits: [{ setting: 'wagePerLevel', value: 25 }] });
    const text = await command(['config', 'show', 'guilds', '--root', dir]);
    expect(text.out).toContain('  wagePerLevel 25 (pending; 20 in the file)');
    expect((await command(['config', 'pending', '--root', dir])).out).toBe('1. wagePerLevel 25');
  });

  test('reads a value as JSON where it is JSON and as text where not', async () => {
    const dir = scratch();
    expect((await json(dir, 'config', 'set', 'transferRegardBand', 'close')).code).toBe(0);
    expect((await json(dir, 'config', 'set', 'heroSexWeights', '{"female":1,"male":3}')).code).toBe(0);
    expect((await json(dir, 'config', 'set', 'lootOnBands', '["success","strong"]')).code).toBe(0);
    expect((await json<{ edits: unknown[] }>(dir, 'config', 'pending')).json.edits).toEqual([
      { setting: 'transferRegardBand', value: 'close' },
      { setting: 'heroSexWeights', value: { female: 1, male: 3 } },
      { setting: 'lootOnBands', value: ['success', 'strong'] },
    ]);
  });

  // DL-204: an object's keys given in another order are the same value,
  // and are held in the file's order, so that a reordering alone neither raises the version nor
  // rewrites the file.
  test("reads an object's keys in the file's order, whatever order they are given in", async () => {
    const dir = scratch();
    const same = await json<{ unchanged?: true; pending: number }>(dir, 'config', 'set', 'heroSexWeights', '{"male":1,"female":1}');
    expect(same.json).toMatchObject({ unchanged: true, pending: 0 });

    expect((await json(dir, 'config', 'set', 'heroSexWeights', '{"male":3,"female":1}')).code).toBe(0);
    const [edit] = (await json<{ edits: { setting: string; value: Record<string, number> }[] }>(dir, 'config', 'pending')).json.edits;
    expect(edit?.setting).toBe('heroSexWeights');
    expect(Object.entries(edit?.value ?? {})).toEqual([
      ['female', 1],
      ['male', 3],
    ]);
  });

  test("refuses a value checkConfig refuses, naming the setting, and holds nothing", async () => {
    const dir = scratch();
    const negative = await json<Failure>(dir, 'config', 'set', 'boardSizeStart', '-1');
    expect(negative).toEqual({ code: 1, json: { ok: false, kind: 'refused', problems: ['boardSizeStart is -1; it is a whole number, at least 0'] } });

    // A setting another's rule reads: a Max below its Min names the Max.
    const below = await json<Failure>(dir, 'config', 'set', 'rivalRosterMin', '9');
    expect(below.json.problems).toEqual(['rivalRosterMax is 8; it is a whole number, at least rivalRosterMin (9)']);

    const word = await command(['config', 'set', 'transferRegardBand', 'friendly', '--root', dir]);
    expect(word.code).toBe(1);
    expect(word.err).toBe('transferRegardBand is "friendly"; it is one of hostile, cool, neutral, warm, close');

    expect((await json<{ edits: unknown[] }>(dir, 'config', 'pending')).json.edits).toEqual([]);
    expect(status(dir)).toBe('');
  });

  // The ladder is read by the content's Quest templates too (DL-262), so a ladder they cannot play is
  // refused as it is set, not by "Finish"'s tests (DL-270).
  test('refuses a Tier ladder the Quest templates cannot play, naming each, and holds nothing', async () => {
    const dir = scratch();
    const tiers = readConfig(dir).sections.questTiers?.tiers as Record<string, unknown>[];
    const longer = tiers.map((row, index) => (index === 0 ? { ...row, beats: 4 } : row));
    const refused = await json<Failure>(dir, 'config', 'set', 'tiers', JSON.stringify(longer));
    expect(refused.code).toBe(1);
    expect(refused.json.problems).toContain('questTemplates.escort-the-tithe: Tier 1 plays 4 Beats, more than its 3 Beats');
    expect(refused.json.problems.every((problem) => problem.startsWith('questTemplates.'))).toBe(true);
    expect((await json<{ edits: unknown[] }>(dir, 'config', 'pending')).json.edits).toEqual([]);

    const fewer = tiers.slice(0, 4);
    expect((await json<Failure>(dir, 'config', 'set', 'tiers', JSON.stringify(fewer))).json.problems).toContain('questTemplates.break-the-sealed-vault.tierMax is 5; the ladder has 4 Tiers');
    expect(status(dir)).toBe('');
  });

  test('refuses a setting the file lacks', async () => {
    const dir = scratch();
    const unknown = await json<Failure>(dir, 'config', 'set', 'gearSlots', '3');
    expect(unknown.code).toBe(1);
    expect(unknown.json.problems).toEqual(['"gearSlots" is not a setting of config.json; `config show` lists them by section']);
  });

  test('a setting set again replaces its edit; set back to the file\'s value, it is no longer pending; as it is, nothing is held', async () => {
    const dir = scratch();
    await json(dir, 'config', 'set', 'wagePerLevel', '25');
    await json(dir, 'config', 'set', 'wagePerLevel', '30');
    expect((await json<{ edits: unknown[] }>(dir, 'config', 'pending')).json.edits).toEqual([{ setting: 'wagePerLevel', value: 30 }]);
    const same = await json<{ unchanged?: true; pending: number }>(dir, 'config', 'set', 'wagePerLevel', '30');
    expect(same.json).toMatchObject({ unchanged: true, pending: 1 });
    await json(dir, 'config', 'set', 'wagePerLevel', '20');
    expect((await json<{ edits: unknown[] }>(dir, 'config', 'pending')).json.edits).toEqual([]);
  });

  test('discard drops one setting\'s edit, or all', async () => {
    const dir = scratch();
    await json(dir, 'config', 'set', 'wagePerLevel', '25');
    await json(dir, 'config', 'set', 'boardSizeMax', '7');
    expect((await json(dir, 'config', 'discard', 'boardSizeMax')).json).toEqual({ ok: true, discarded: 1, left: 1 });
    expect((await json(dir, 'config', 'discard')).json).toEqual({ ok: true, discarded: 1, left: 0 });
  });
});

describe('finish', () => {
  // A decision no entry holds, built so that the citation check (tools/decisions, DL-215) reads none here.
  const reason = `the economy pass (DL-${999})`;

  test('writes the values, raises the config version with its reason, and runs the tests', async () => {
    const dir = scratch();
    const before = readConfig(dir);
    await json(dir, 'config', 'set', 'wagePerLevel', '25');
    await json(dir, 'config', 'set', 'transferRegardBand', 'close');

    const finished = await command(['config', 'finish', '--reason', `${reason}.`, '--root', dir], planted);

    expect(finished.code).toBe(0);
    expect(finished.out.split('\n')).toEqual([
      'Finished 2 edits: wagePerLevel, transferRegardBand',
      `Config version ${before.version} → ${before.version + 1}`,
      'The tests passed. Nothing is committed: read `git diff`, and commit it yourself.',
    ]);
    const after = readConfig(dir);
    expect(after.version).toBe(before.version + 1);
    expect(after.changelog).toEqual([...before.changelog, `${before.version + 1} from ${reason}: wagePerLevel 20 to 25, transferRegardBand warm to close.`]);
    expect(after.sections.guilds?.wagePerLevel).toBe(25);
    expect(after.sections.transfers?.transferRegardBand).toBe('close');
    // The file in its own layout: the two values, the version, the changelog's last line's comma and its new line.
    expect(git(dir, 'diff', '--numstat').trim()).toBe('5\t4\tengine/src/config.json');
    expect(status(dir)).toBe(' M engine/src/config.json\n');
    expect((await json<{ edits: unknown[] }>(dir, 'config', 'pending')).json.edits).toEqual([]);
  });

  test('a test that fails puts the file back and keeps the edits pending', async () => {
    const dir = scratch();
    plantOutcome(dir, 'fail');
    const bytes = readFileSync(configPath(dir));
    await json(dir, 'config', 'set', 'wagePerLevel', '25');

    const failed = await json<Failure>(dir, 'config', 'finish', '--reason', 'a trial');

    expect(failed.code).toBe(1);
    expect(failed.json.kind).toBe('undone');
    // Byte for byte, its line ends included (DL-204).
    expect(readFileSync(configPath(dir))).toEqual(bytes);
    expect(status(dir)).toBe('');
    expect((await json<{ edits: unknown[] }>(dir, 'config', 'pending')).json.edits).toEqual([{ setting: 'wagePerLevel', value: 25 }]);
  });

  test('wants a reason, and with nothing pending finishes nothing', async () => {
    const dir = scratch();
    await json(dir, 'config', 'set', 'wagePerLevel', '25');
    const noReason = await command(['config', 'finish', '--root', dir], planted);
    expect(noReason.code).toBe(2);
    expect(noReason.err).toContain('config finish wants --reason <why>');
    expect((await command(['config', 'finish', '--reason', ' ', '--root', dir], planted)).code).toBe(1);
    expect(status(dir)).toBe('');

    await json(dir, 'config', 'discard');
    const nothing = await command(['config', 'finish', '--reason', 'nothing', '--root', dir], planted);
    expect(nothing).toMatchObject({ code: 0, out: 'No pending edits: nothing to finish' });
    expect(status(dir)).toBe('');
  });

  test('checks the settings again as the file is, refusing what checkConfig refuses', async () => {
    const dir = scratch();
    await json(dir, 'config', 'set', 'boardSizeMax', '7');
    // Another hand changes the file under the edit: a Min above its Max.
    const file = readConfig(dir);
    (file.sections.world as Record<string, unknown>).rivalRosterMin = 9;
    const text = readFileSync(configPath(dir), 'utf8').replace('"rivalRosterMin": 4', '"rivalRosterMin": 9');
    expect(JSON.parse(text)).toEqual(file);
    writeFileSync(configPath(dir), text);

    const refused = await json<Failure>(dir, 'config', 'finish', '--reason', 'a trial');
    expect(refused).toEqual({ code: 1, json: { ok: false, kind: 'refused', problems: ['rivalRosterMax is 8; it is a whole number, at least rivalRosterMin (9)'] } });
    expect(readFileSync(configPath(dir), 'utf8')).toBe(text);
  });

  test('--reason is config finish\'s alone', async () => {
    const dir = scratch();
    const misplaced = await command(['traits', 'list', '--reason', 'x', '--root', dir]);
    expect(misplaced.code).toBe(2);
    expect(misplaced.err).toContain("--reason is config finish's alone");
  });
});

// DL-204: the config kind's "Finish" and the Traits' share one journal
// and lock, so neither kind writes or reads while the other's tests run, and a "Finish" of either
// kind cut off is put back by the next command of either.
describe("the Traits' journal and lock, shared", () => {
  test("while a config Finish's tests run, every command of either kind is refused as busy", async () => {
    const dir = scratch();
    await json(dir, 'config', 'set', 'wagePerLevel', '25');
    const during: Record<string, string> = {};
    const finished = await new ConfigEditor(dir).finish('a trial', async (root) => {
      during.traits = (await json<Failure>(root, 'traits', 'list')).json.kind;
      during.traitsFinish = (await json<Failure>(root, 'traits', 'finish')).json.kind;
      during.config = (await json<Failure>(root, 'config', 'set', 'boardSizeMax', '7')).json.kind;
      return { ok: true, exitCode: 0, failures: [], tail: [] };
    });
    expect(during).toEqual({ traits: 'busy', traitsFinish: 'busy', config: 'busy' });
    expect(finished.configVersion).toEqual({ from: readConfig(dir).version - 1, to: readConfig(dir).version });
    expect(journalState(dir)).toBe('none');
  });

  test("while a Traits Finish's tests run, the config kind is refused as busy", async () => {
    const dir = scratch();
    await json(dir, 'traits', 'change', 'thrifty', '--cost', '3');
    await json(dir, 'config', 'set', 'wagePerLevel', '25');
    const during: Record<string, string> = {};
    await new Editor(dir).finish(async (root) => {
      during.set = (await json<Failure>(root, 'config', 'set', 'boardSizeMax', '7')).json.kind;
      during.finish = (await json<Failure>(root, 'config', 'finish', '--reason', 'a trial')).json.kind;
      return { ok: true, exitCode: 0, failures: [], tail: [] };
    });
    expect(during).toEqual({ set: 'busy', finish: 'busy' });
    expect(status(dir)).not.toContain('engine/src/config.json');
    expect((await json<{ edits: unknown[] }>(dir, 'config', 'pending')).json.edits).toEqual([{ setting: 'wagePerLevel', value: 25 }]);
  });

  test('a config Finish cut off is put back by the next command of either kind, byte for byte', async () => {
    const dir = scratch();
    const file = configPath(dir);
    const bytes = readFileSync(file);
    const plant = (): void => {
      writeAtomically(journalPath(dir), JSON.stringify({ pid: 2 ** 22 + 7, startedAt: '2026-10-05T00:00:00Z', contentVersion: 36, edits: 1, files: { [file]: bytes.toString('base64') } }));
      writeFileSync(file, '{}\n');
    };
    plant();
    expect((await json<{ recovered: string[] }>(dir, 'traits', 'pending')).json.recovered).toEqual([file]);
    expect(readFileSync(file)).toEqual(bytes);
    plant();
    expect((await json<{ recovered: string[] }>(dir, 'config', 'pending')).json.recovered).toEqual([file]);
    expect(readFileSync(file)).toEqual(bytes);
    expect(status(dir)).toBe('');
  });

  // DL-205: show and set put a cut-off "Finish" back before they read the file, so
  // that what is "in the file" is never the cut-off write.
  test('show and set read the file as put back from a config Finish cut off, never as it was cut off', async () => {
    const dir = scratch();
    const file = configPath(dir);
    const bytes = readFileSync(file);
    await json(dir, 'config', 'set', 'wagePerLevel', '25');
    /** A config Finish cut off after writing the edit and the version raised. */
    const plant = (): void => {
      writeAtomically(journalPath(dir), JSON.stringify({ pid: 2 ** 22 + 7, startedAt: '2026-10-05T00:00:00Z', contentVersion: 36, edits: 1, files: { [file]: bytes.toString('base64') } }));
      const written = readConfig(dir);
      writeFileSync(file, bytes.toString('utf8').replace('"wagePerLevel": 20', '"wagePerLevel": 25').replace(`"version": ${written.version}`, `"version": ${written.version + 1}`));
      expect(readConfig(dir).sections.guilds?.wagePerLevel).toBe(25);
    };

    plant();
    const shown = await json<{ recovered: string[]; sections: { section: string; settings: { setting: string; was?: unknown }[] }[] }>(dir, 'config', 'show', 'guilds');
    expect(shown.json.recovered).toEqual([file]);
    expect(shown.json.sections[0]?.settings.find((view) => view.setting === 'wagePerLevel')).toEqual({ setting: 'wagePerLevel', value: 25, pending: true, was: 20 });

    plant();
    const set = await json<{ recovered: string[]; value: unknown; was: unknown; pending: number }>(dir, 'config', 'set', 'wagePerLevel', '20');
    expect(set.json).toMatchObject({ recovered: [file], value: 20, was: 20, pending: 0 });
    expect(readFileSync(file)).toEqual(bytes);
    expect((await json<{ edits: unknown[] }>(dir, 'config', 'pending')).json.edits).toEqual([]);
    expect(status(dir)).toBe('');
  });
});
