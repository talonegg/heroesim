// `build --facility <facility>` end to end: `main` run in-process against a real save in a
// temporary directory, with the real content set, as main.test.ts runs the other commands.

import { writeFileSync } from 'node:fs';
import { facilityUpkeep, hallUpkeepParts, playerGuild, serialise, wages, type Guild } from '@heroesim/engine';
import { count } from '@heroesim/engine/testing';
import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { coinLetters } from '@heroesim/words';
import { exitCodes, playground, thePlayer } from '../play.test-support.js';

const content = loadContent();

const { play, current, saved, document } = playground('heroesim-build-', content);

/** A new world whose player's Guild holds `wealth`. */
function newWorld(wealth: number): Guild {
  expect(play(['new', '--seed', 'demo', '--guild', 'The Test', '--master', 'Ada']).code).toBe(exitCodes.ok);
  const edited = document();
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
    expect(run.out).toContain("Built Sickroom for 2g: The Test's infirmary is now grade 1.");
    // The Upkeep's two charges after it, each with its Days, the Hall's with the infirmary's (DL-298).
    const { world, meta } = document();
    const built = thePlayer(world);
    const hall = hallUpkeepParts(built, world, meta.config, content);
    expect(hall.facilities).toEqual({ infirmary: content.facilities['infirmary']?.upkeep });
    expect(run.out).toContain(
      `Wealth 8g; wages ${coinLetters(wages(built, world, meta.config))} every ${meta.config.upkeepEveryDays} Days, ` +
        `Hall upkeep ${coinLetters(hall.total)} every ${meta.config.hallUpkeepEveryDays} Days.`,
    );
    expect(run.out).toContain('The next grade, Infirmary ward, costs 5g.');
    const after = document();
    const guild = thePlayer(document().world);
    expect(guild.hall).toEqual({ infirmary: 1, 'training-yard': 0, quarters: 0 });
    expect(guild.wealth).toBe(800);
    expect(count(after.history, 'guild.improved')).toBe(1);
  });

  test('climbs each facility to its top grade, then refuses and writes nothing', () => {
    newWorld(10_000);

    for (const [word, key] of [
      ['infirmary', 'infirmary'],
      ['training-yard', 'training-yard'],
      ['quarters', 'quarters'],
    ] as const) {
      for (const grade of [1, 2, 3]) {
        const run = play(['build', '--facility', word]);
        expect(run.code, `${word} ${grade}`).toBe(exitCodes.ok);
        expect(thePlayer(document().world).hall[key]).toBe(grade);
      }
      expect(play(['build', '--facility', word]).out).toBe('');
    }
    expect(thePlayer(document().world).wealth).toBe(10_000 - 3 * 1_700);

    const before = saved();
    const top = play(['build', '--facility', 'training-yard']);
    expect(top.code).toBe(exitCodes.refused);
    expect(top.err).toContain("The Test's training yard is at grade 3, the highest there is.");
    expect(saved()).toBe(before);
  });

  test('show hall gives each Facility its grade, what is built, its upkeep, and the next grade, its cost and its upkeep, and spends nothing', () => {
    newWorld(10_000);
    const name = (key: string): string => content.improvements[key]?.name ?? key;
    const rowOf = (output: string, facility: string): string =>
      output.split('\n').find((line) => line.startsWith(facility)) ?? `no ${facility} row`;
    // A Facility's upkeep at a grade, as the Hall's upkeep charges it (DL-298, DL-303).
    const upkeepAt = (facility: string, grade: number): string => {
      const def = content.facilities[facility];
      if (def === undefined) throw new Error(`no ${facility}`);
      return coinLetters(facilityUpkeep(def, grade, document().meta.config));
    };

    const unbuilt = play(['show', 'hall']);
    expect(unbuilt).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(unbuilt.out).toContain(`Hall of The Test (${thePlayer(document().world).id})`);
    expect(unbuilt.out.split('\n').find((line) => line.startsWith('Facility'))).toMatch(/^Facility\s+Grade\s+Built\s+Upkeep\s+Next grade\s+Cost\s+Next upkeep$/);
    expect(rowOf(unbuilt.out, 'Infirmary')).toMatch(
      new RegExp(`^Infirmary\\s+0\\s+None\\s+${upkeepAt('infirmary', 0)}\\s+${name('infirmary-1')}\\s+2g\\s+${upkeepAt('infirmary', 1)}$`),
    );
    expect(thePlayer(document().world).wealth).toBe(10_000);

    play(['build', '--facility', 'infirmary']);
    for (let grade = 1; grade <= 3; grade += 1) play(['build', '--facility', 'quarters']);
    const built = play(['show', 'hall']);
    const summary = play(['show']);

    expect(rowOf(built.out, 'Infirmary')).toMatch(
      new RegExp(`^Infirmary\\s+1\\s+${name('infirmary-1')}\\s+${upkeepAt('infirmary', 1)}\\s+${name('infirmary-2')}\\s+5g\\s+${upkeepAt('infirmary', 2)}$`),
    );
    expect(rowOf(built.out, 'Training yard')).toMatch(
      new RegExp(`^Training yard\\s+0\\s+None\\s+${upkeepAt('training-yard', 0)}\\s+${name('training-yard-1')}\\s+2g\\s+${upkeepAt('training-yard', 1)}$`),
    );
    expect(rowOf(built.out, 'Quarters')).toMatch(new RegExp(`^Quarters\\s+3\\s+${name('quarters-3')}\\s+${upkeepAt('quarters', 3)}\\s+None: the top grade$`));
    expect(upkeepAt('infirmary', 2)).not.toBe(upkeepAt('infirmary', 1));
    expect(built.out).toContain('The infirmary shortens the Days an Injury takes to heal');
    expect(built.out.replace(/\s+/g, ' ')).toContain(
      `Each grade does more and costs more to keep, its upkeep paid with the Hall's every ${document().meta.config.hallUpkeepEveryDays} Days.`,
    );
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

    expect(first.out).toContain(`Built ${content.improvements['quarters-1']?.name} for 2g: The Test's quarters are now grade 1.`);
    expect(first.out).toContain(`The next grade, ${content.improvements['quarters-2']?.name}, costs 5g.`);
    expect(top.out).toContain("The Test's quarters are now grade 3.");
    expect(top.out).toContain('The quarters are now at the highest grade.');
    expect(refused.err).toContain("The Test's quarters are at grade 3, the highest there is.");
    expect(infirmary?.out).toContain('The infirmary is now at the highest grade.');
    for (const run of [first, top, refused]) expect(`${run.out}${run.err}`).not.toMatch(/quarters is/);
  });

  test('refuses a grade the Guild cannot pay for, naming the cost, and writes nothing', () => {
    newWorld(199);
    const before = saved();

    const poor = play(['build', '--facility', 'quarters']);

    expect(poor.code).toBe(exitCodes.refused);
    expect(poor.err).toContain("The next grade of The Test's quarters costs 2 Gold; The Test has 1 Gold 99 Silver.");
    expect(saved()).toBe(before);
  });

  // DL-297: the CLI's word is the Facility's key, which the save's content holds to.
  test("refuses a key the save's content defines no Facility by, naming the keys it does, and writes nothing", () => {
    newWorld(10_000);
    const before = saved();

    const stables = play(['build', '--facility', 'stables']);

    expect(stables.code).toBe(exitCodes.refused);
    expect(stables.err).toContain(`--facility takes ${Object.keys(content.facilities).join(', ')}; got "stables"`);
    expect(saved()).toBe(before);
  });
});
