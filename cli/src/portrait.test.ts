import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorld, defaultConfig, deserialise, playerGuild, type ContentSet, type WorldDocument } from '@heroesim/engine';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { exitCodes, main } from './main.js';

// `new --portrait` and `show guildmaster` over content with pictures (v1.1.2-S3, DL-125 item 3). The
// core lists none until v1.1.2-S4, so the content the CLI loads is the core with three Guildmaster
// pictures added; `main.test.ts` holds the refusal the core itself gives.

const pictures: ContentSet['portraits']['guildmaster'] = { female: ['gm-female-01'], male: ['gm-male-01', 'gm-male-02'] };

vi.mock('@heroesim/content/node', async (original) => {
  const actual = await original<typeof import('@heroesim/content/node')>();
  const loadContent = (): ContentSet => {
    const core = actual.loadContent();
    return { ...core, portraits: { ...core.portraits, guildmaster: pictures } };
  };
  return { ...actual, loadContent };
});

const { loadContent } = await import('@heroesim/content/node');
const content = loadContent();
const clock = new Date('2026-09-30T09:30:00.000Z');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'heroesim-cli-portrait-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function play(argv: string[]): { code: number; out: string; err: string } {
  let out = '';
  let err = '';
  const code = main(argv, {
    stdout: (text) => (out += text),
    stderr: (text) => (err += text),
    cwd: dir,
    env: {},
    now: () => clock,
    random: () => 0,
  });
  return { code, out, err };
}

function saved(): WorldDocument {
  const loaded = deserialise(readFileSync(join(dir, '.saves', 'current.json'), 'utf8'), { config: defaultConfig, content });
  if (!loaded.ok) throw new Error(loaded.reason.message);
  return loaded.document;
}

function playerGuildmaster(document: WorldDocument) {
  const guild = playerGuild(document.world);
  return guild === undefined ? undefined : document.world.guildmasters[guild.guildmasterId];
}

describe('new --portrait (v1.1.2-S3)', () => {
  const newGame = (...more: string[]) => play(['new', '--seed', 'portrait', '--guild', 'The Test', '--master', 'Ada', ...more]);

  test('keeps the Portrait given, and show guildmaster names it after the sex', () => {
    expect(newGame('--sex', 'male', '--portrait', 'gm-male-02')).toMatchObject({ code: exitCodes.ok, err: '' });

    expect(playerGuildmaster(saved())).toMatchObject({ sex: 'male', portraitKey: 'gm-male-02' });
    const lines = play(['show', 'guildmaster']).out.split('\n');
    expect(lines[lines.findIndex((line) => line.startsWith('Sex')) + 1]).toMatch(/^Portrait\s+gm-male-02$/);
  });

  test("makes the Guildmaster of the Portrait's sex when --sex is left out", () => {
    expect(newGame('--portrait', 'gm-female-01').code).toBe(exitCodes.ok);

    expect(playerGuildmaster(saved())).toMatchObject({ sex: 'female', portraitKey: 'gm-female-01' });
  });

  test('draws the Portrait from the pictures of the sex when none is given, as the engine does', () => {
    expect(newGame('--sex', 'male').code).toBe(exitCodes.ok);

    const expected = createWorld(
      'portrait',
      { guildName: 'The Test', guildmasterName: 'Ada', guildmasterSex: 'male', createdAt: clock.toISOString() },
      { config: defaultConfig, content },
    ).document;
    const drawn = playerGuildmaster(saved())?.portraitKey;
    expect(pictures.male).toContain(drawn);
    expect(drawn).toBe(playerGuildmaster(expected)?.portraitKey);
  });

  test('refuses a Portrait of the other sex, or one content lacks, naming the pictures, and writes nothing', () => {
    const other = newGame('--sex', 'female', '--portrait', 'gm-male-01');
    expect(other.code).toBe(exitCodes.usage);
    expect(other.err).toContain(
      "--portrait gm-male-01 is a male Guildmaster's Portrait, and --sex is female: choose a Portrait of that sex, or leave out --sex.",
    );

    const unknown = newGame('--portrait', 'gm-male-09');
    expect(unknown.code).toBe(exitCodes.usage);
    expect(unknown.err).toContain(
      'No Guildmaster Portrait is keyed "gm-male-09". Choose from: gm-female-01 (female), gm-male-01 (male), gm-male-02 (male).',
    );
    expect(play(['show']).code).toBe(exitCodes.refused);
  });
});
