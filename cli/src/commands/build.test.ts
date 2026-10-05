// `build --facility <facility>` end to end (M3-S6): `main` run in-process against a real save in a
// temporary directory, with the real content set, as main.test.ts runs the other commands.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deserialise, playerGuild, serialise, type Guild, type WorldDocument } from '@heroesim/engine';
import { count } from '@heroesim/engine/testing';
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
  const loaded = deserialise(saved(), { content });
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

  test('show hall gives each facility its grade, what is built and what the next grade costs, and spends nothing', () => {
    newWorld(10_000);
    const name = (key: string): string => content.improvements[key]?.name ?? key;
    const rowOf = (output: string, facility: string): string =>
      output.split('\n').find((line) => line.startsWith(facility)) ?? `no ${facility} row`;

    const unbuilt = play(['show', 'hall']);
    expect(unbuilt).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(unbuilt.out).toContain(`Hall of The Test (${player().id})`);
    expect(rowOf(unbuilt.out, 'Infirmary')).toMatch(new RegExp(`^Infirmary\\s+0\\s+None\\s+${name('infirmary-1')}\\s+200$`));
    expect(player().wealth).toBe(10_000);

    play(['build', '--facility', 'infirmary']);
    for (let grade = 1; grade <= 3; grade += 1) play(['build', '--facility', 'quarters']);
    const built = play(['show', 'hall']);
    const summary = play(['show']);

    expect(rowOf(built.out, 'Infirmary')).toMatch(new RegExp(`^Infirmary\\s+1\\s+${name('infirmary-1')}\\s+${name('infirmary-2')}\\s+500$`));
    expect(rowOf(built.out, 'Training yard')).toMatch(new RegExp(`^Training yard\\s+0\\s+None\\s+${name('training-yard-1')}\\s+200$`));
    expect(rowOf(built.out, 'Quarters')).toMatch(new RegExp(`^Quarters\\s+3\\s+${name('quarters-3')}\\s+None: the top grade$`));
    expect(built.out).toContain('The infirmary shortens the Days an Injury takes to heal');
    expect(summary.out).toContain("The Test's Hall: infirmary grade 1, training yard grade 0, quarters grade 3 (show hall");

    // A Rival's Hall by its id; an id the save lacks is refused.
    const rival = Object.values(document().world.guilds).find((guild) => guild.controller.kind === 'rival') as Guild;
    expect(play(['show', 'hall', rival.id]).out).toContain(`Hall of ${rival.name} (${rival.id})`);
    expect(play(['show', 'hall', 'guild-999999'])).toMatchObject({ code: exitCodes.refused });
  });

  test('speaks of the quarters in the plural, built, at the top grade and refused there', () => {
    newWorld(10_000);

    const first = play(['build', '--facility', 'quarters']);
    play(['build', '--facility', 'quarters']);
    const top = play(['build', '--facility', 'quarters']);
    const refused = play(['build', '--facility', 'quarters']);
    const infirmary = [1, 2, 3].map(() => play(['build', '--facility', 'infirmary'])).at(-1);

    expect(first.out).toContain(`Built ${content.improvements['quarters-1']?.name} for 200 Wealth: The Test's quarters are now grade 1.`);
    expect(first.out).toContain(`The next grade, ${content.improvements['quarters-2']?.name}, costs 500 Wealth.`);
    expect(top.out).toContain("The Test's quarters are now grade 3.");
    expect(top.out).toContain('The quarters are now at the highest grade.');
    expect(refused.err).toContain("The Test's quarters are at grade 3, the highest there is.");
    expect(infirmary?.out).toContain('The infirmary is now at the highest grade.');
    for (const run of [first, top, refused]) expect(`${run.out}${run.err}`).not.toMatch(/quarters is/);
  });

  test('build --facility training-yard, then idle nights: each Hero on the Roster gains xpPerTrainingDay a night', () => {
    // M3-S6's yard half of its second box, with M3-S2's `training`: the grade built through the CLI
    // is the one the night reads. The training XP pinned; a twin world left at grade 0 gains none.
    /** A new world, its training yard built or not, played five Days idle: its Roster's XP after. */
    const idleXp = (withYard: boolean): number[] => {
      rmSync(current(), { force: true });
      newWorld(1_000);
      const edited = document();
      edited.meta.config.xpPerTrainingDay = 2;
      writeFileSync(current(), serialise(edited));
      if (withYard) {
        const built = play(['build', '--facility', 'training-yard']);
        expect(built).toMatchObject({ code: exitCodes.ok, err: '' });
        expect(built.out).toContain("The Test's training yard is now grade 1.");
      }
      // Fifteen Turns from the morning of Day 0: the nights of Days 0 to 4. Nobody is sent anywhere.
      expect(play(['advance', '--turns', '15']).code).toBe(exitCodes.ok);
      const { world } = document();
      const guild = player();
      expect(world.turn).toBe(15);
      expect(guild.hall.trainingYard).toBe(withYard ? 1 : 0);
      return guild.rosterIds.map((id) => world.heroes[id]?.xp ?? Number.NaN);
    };

    const trained = idleXp(true);
    expect(trained).toHaveLength(4);
    expect(trained).toEqual([10, 10, 10, 10]);
    expect(idleXp(false)).toEqual([0, 0, 0, 0]);
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
