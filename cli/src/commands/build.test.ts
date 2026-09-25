// `build --facility <facility>` end to end (M3-S6): `main` run in-process against a real save in a
// temporary directory, with the real content set, as main.test.ts runs the other commands.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { count, defaultConfig, deserialise, playerGuild, serialise, type Guild, type WorldDocument } from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { exitCodes, main } from '../main.js';

const content = loadContent();

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'heroesim-build-'));
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
    now: () => new Date('2026-09-26T09:30:00.000Z'),
    random: () => 0,
  });
  return { code, out, err };
}

const current = (): string => join(dir, '.saves', 'current.json');
const saved = (): string => readFileSync(current(), 'utf8');

function document(): WorldDocument {
  const loaded = deserialise(saved(), { config: defaultConfig, content });
  if (!loaded.ok) throw new Error(loaded.reason.message);
  return loaded.document;
}

function player(): Guild {
  const guild = playerGuild(document().world);
  if (guild === undefined) throw new Error("No player's Guild");
  return guild;
}

/** A new world whose player's Guild holds `wealth`, and whose Upkeep figures are pinned. */
function newWorld(wealth: number): Guild {
  expect(play(['new', '--seed', 'demo', '--guild', 'The Test', '--master', 'Ada']).code).toBe(exitCodes.ok);
  const edited = document();
  edited.meta.config.hallMaintenancePerGrade = 10;
  const guild = playerGuild(edited.world);
  if (guild === undefined) throw new Error("No player's Guild");
  guild.wealth = wealth;
  writeFileSync(current(), serialise(edited));
  return guild;
}

describe('build', () => {
  test("build --facility infirmary raises the player's infirmary a grade for its cost, prints it, and saves", () => {
    newWorld(1_000);

    const run = play(['build', '--facility', 'infirmary']);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(run.out).toContain("Built Sickroom for 200 Wealth: The Test's infirmary is now grade 1.");
    expect(run.out).toMatch(/Wealth 800; Upkeep \d+ every 10 Days\./);
    expect(run.out).toContain('The next grade, Infirmary ward, costs 500 Wealth.');
    const after = document();
    const guild = player();
    expect(guild.hall).toEqual({ infirmary: 1, trainingYard: 0, quarters: 0 });
    expect(guild.wealth).toBe(800);
    expect(count(after.history, 'guild.improved')).toBe(1);
  });

  test('climbs each facility to its top grade, then refuses and writes nothing', () => {
    newWorld(10_000);

    for (const [word, key] of [
      ['infirmary', 'infirmary'],
      ['training-yard', 'trainingYard'],
      ['quarters', 'quarters'],
    ] as const) {
      for (const grade of [1, 2, 3]) {
        const run = play(['build', '--facility', word]);
        expect(run.code, `${word} ${grade}`).toBe(exitCodes.ok);
        expect(player().hall[key]).toBe(grade);
      }
      expect(play(['build', '--facility', word]).out).toBe('');
    }
    expect(player().wealth).toBe(10_000 - 3 * 1_700);

    const before = saved();
    const top = play(['build', '--facility', 'training-yard']);
    expect(top.code).toBe(exitCodes.refused);
    expect(top.err).toContain("The Test's training yard is at grade 3, the highest there is.");
    expect(saved()).toBe(before);
  });

  test('refuses a grade the Guild cannot pay for, naming the cost, and writes nothing', () => {
    newWorld(199);
    const before = saved();

    const poor = play(['build', '--facility', 'quarters']);

    expect(poor.code).toBe(exitCodes.refused);
    expect(poor.err).toContain("The next grade of The Test's quarters costs 200 Wealth; The Test has 199.");
    expect(saved()).toBe(before);
  });

  test('refuses a word that is not a facility as a bad command line', () => {
    newWorld(1_000);
    const before = saved();

    expect(play(['build', '--facility', 'stables']).code).toBe(exitCodes.usage);
    expect(play(['build']).code).toBe(exitCodes.usage);
    expect(saved()).toBe(before);
  });
});
