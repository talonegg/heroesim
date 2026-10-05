import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createWorld, defaultConfig, probe, schemaVersion, serialise, type WorldDocument } from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { openSave, readSave, saveDir, savePath, writeSave } from './saves.js';

const content = loadContent();
const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: '2026-09-26T00:00:00.000Z' };

function newDocument(): WorldDocument {
  return createWorld('saves', setup, { config: defaultConfig, content }).document;
}

/** A document's save text after `change` has been made to a plain copy of it. */
function edited(change: (saved: { meta: Record<string, unknown> & { config: Record<string, unknown> } }) => void): string {
  const saved = JSON.parse(serialise(newDocument())) as Parameters<typeof change>[0];
  change(saved);
  return JSON.stringify(saved);
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'heroesim-saves-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('where a save lives', () => {
  test('a bare name is a file in .saves under the working directory', () => {
    expect(saveDir(dir, {})).toBe(join(dir, '.saves'));
    expect(savePath('current', dir, {})).toBe(join(dir, '.saves', 'current.json'));
  });

  test('HEROESIM_SAVE_DIR moves the directory, relative to the working directory or absolute', () => {
    expect(savePath('demo', dir, { HEROESIM_SAVE_DIR: 'games' })).toBe(join(dir, 'games', 'demo.json'));
    const elsewhere = join(dir, 'elsewhere');
    expect(savePath('demo', dir, { HEROESIM_SAVE_DIR: elsewhere })).toBe(join(elsewhere, 'demo.json'));
    expect(saveDir(dir, { HEROESIM_SAVE_DIR: '' })).toBe(join(dir, '.saves'));
  });

  test('a name with a slash or ending in .json is a path from the working directory', () => {
    expect(savePath('backup.json', dir, {})).toBe(resolve(dir, 'backup.json'));
    expect(savePath('old/backup', dir, {})).toBe(resolve(dir, 'old/backup'));
    expect(savePath(join(dir, 'x.json'), '/elsewhere', {})).toBe(join(dir, 'x.json'));
  });
});

describe('opening a save', () => {
  test('gives back the document and the deps to play it under', () => {
    const document = newDocument();
    const opened = openSave(serialise(document), content);

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(serialise(opened.document)).toBe(serialise(document));
    expect(opened.deps.config).toEqual(document.meta.config);
    expect(opened.deps.content).toBe(content);
  });

  test("compares meta.version with the engine's schemaVersion, never with the save's own config", () => {
    // The schema's version is the engine's since v1.1.6-S7, no setting (DL-193); a save's config that
    // holds one is not read for it (DL-20 item 11).
    const text = edited((saved) => {
      saved.meta.version = 999;
      saved.meta.config.schemaVersion = 7;
    });

    const opened = openSave(text, content);

    expect(opened).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-version', documentVersion: 999, schemaVersion },
    });
  });

  test('refuses a save whose config breaks a rule, naming the setting (DL-193)', () => {
    const text = edited((saved) => {
      saved.meta.config.boardSize = -2;
    });

    const opened = openSave(text, content);

    expect(opened).toMatchObject({ ok: false, reason: { kind: 'unsound-config', problems: [{ setting: 'boardSize' }] } });
    expect(!opened.ok && opened.reason.message).toBe("The game's config is unsound: boardSize is -2; it is a whole number, at least 0");
  });

  test("plays under the save's own config, filled forward with the current defaults", () => {
    const text = edited((saved) => {
      saved.meta.config.turnsPerYear = 30;
      delete saved.meta.config.startingWealth;
      saved.meta.config.retiredField = 7;
    });

    const opened = openSave(text, content);

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.deps.config.turnsPerYear).toBe(30);
    expect(opened.deps.config.startingWealth).toBe(defaultConfig.startingWealth);
    // The save itself is left as it was: only `rebase` rewrites meta.config.
    expect(opened.document.meta.config).not.toHaveProperty('startingWealth');
  });

  test('the play deps copy: changing the play config leaves the document and the defaults alone', () => {
    const document = newDocument();
    const opened = openSave(serialise(document), content);
    if (!opened.ok) throw new Error(opened.reason.message);
    opened.deps.config.turnsPerYear = 1;

    expect(opened.document.meta.config.turnsPerYear).toBe(defaultConfig.turnsPerYear);
    expect(defaultConfig.turnsPerYear).not.toBe(1);
  });

  test('opens a save under the modules given: its slice checked by its own module, and its deps installing them (M8-S4)', () => {
    const text = serialise(createWorld('saves', setup, { config: defaultConfig, content, modules: [probe] }).document);

    const installed = openSave(text, content, [probe]);
    const not = openSave(text, content);

    expect(installed).toMatchObject({ ok: true, warnings: [] });
    expect(installed.ok && installed.deps.modules).toEqual([probe]);
    expect(not.ok && not.warnings.map((warning) => warning.check)).toEqual(['unknown-module']);
    expect(not.ok && not.deps).not.toHaveProperty('modules');
  });

  test('refuses a missing file and a corrupted one with a reason', () => {
    expect(readSave(join(dir, 'none.json'), content)).toMatchObject({ ok: false, reason: { kind: 'missing' } });
    expect(openSave('{"meta":', content)).toMatchObject({ ok: false, reason: { kind: 'malformed-json' } });
  });
});

describe('writing a save', () => {
  test('writes canonical JSON, creating the directory, and reads back byte for byte', () => {
    const document = newDocument();
    const path = join(dir, 'deep', 'er', 'save.json');

    writeSave(path, document);

    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, 'utf8');
    expect(text).toBe(serialise(document));
    const read = readSave(path, content);
    expect(read.ok && serialise(read.document)).toBe(text);
  });
});
