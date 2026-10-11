// `captain --hero <heroId>` end to end (DL-287): `main` run in-process against a real save in a
// temporary directory, with the real content set, as main.test.ts runs the other commands.

import type { HeroId } from '@heroesim/engine';
import { count } from '@heroesim/engine/testing';
import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { exitCodes, playground, thePlayer } from '../play.test-support.js';

const content = loadContent();

const { play, document, edit, saved } = playground('heroesim-captain-', content);

/** A new world, its player's Guild's first two Heroes and a Rival's first, the Morale of the player's pinned at 50. */
function newWorld(): { first: string; second: string; theirs: string; names: [string, string] } {
  expect(play(['new', '--seed', 'demo', '--guild', 'The Test', '--master', 'Ada']).code).toBe(exitCodes.ok);
  edit((edited) => {
    for (const heroId of thePlayer(edited.world).rosterIds) Object.assign(edited.world.heroes[heroId] ?? {}, { morale: 50 });
  });
  const { world } = document();
  const [first, second] = thePlayer(world).rosterIds as [HeroId, HeroId];
  const rival = Object.values(world.guilds).find((guild) => guild.id !== thePlayer(world).id);
  const theirs = rival?.rosterIds[0] as string;
  return { first, second, theirs, names: [world.heroes[first]?.name ?? '', world.heroes[second]?.name ?? ''] };
}

describe('captain', () => {
  test('names a Hero Captain, free to an empty post, says it as the History does, and saves', () => {
    const { first, names } = newWorld();

    const run = play(['captain', '--hero', first]);

    expect(run).toMatchObject({ code: exitCodes.ok, err: '' });
    expect(run.out).toBe(`The Test named ${names[0]} (${first}) its Captain.\n`);
    expect(thePlayer(document().world).captainId).toBe(first);
    expect(count(document().history, 'guild.captain-named')).toBe(1);
  });

  test("in another's place, says the Morale it costs and the lock, and refuses another change while it holds, writing nothing", () => {
    const { first, second, names } = newWorld();
    play(['captain', '--hero', first]);

    const run = play(['captain', '--hero', second]);

    expect(run.code).toBe(exitCodes.ok);
    const lines = run.out.trimEnd().split('\n');
    expect(lines[0]).toMatch(new RegExp(`^The Test named ${names[1]} \\(${second}\\) its Captain in place of ${names[0]} \\(${first}\\); the post cannot change again before Year 1 Day 31\\.$`));
    expect(lines[1]).toMatch(new RegExp(`^${names[0]} \\(${first}\\)'s Morale went from 50 to 40`));
    const before = saved();

    const locked = play(['captain', '--hero', first]);
    expect(locked.code).toBe(exitCodes.refused);
    expect(locked.err).toMatch(new RegExp(`^The Captain was last replaced on Year 1 Day 1, and the post cannot change again before Year 1 Day 31\\.`));
    expect(saved()).toBe(before);
  });

  test('refuses the Captain named again, and a Hero of another Roster, in the refusals’ words', () => {
    const { first, theirs, names } = newWorld();
    play(['captain', '--hero', first]);

    expect(play(['captain', '--hero', first]).err).toBe(`${names[0]} (${first}) is already The Test's Captain.\n`);
    expect(play(['captain', '--hero', theirs]).err).toMatch(new RegExp(`\\(${theirs}\\) is not on The Test's Roster \\(show roster\\)\\.\\n$`));
  });

  test('refuses a word that is not a Hero id as a bad command line', () => {
    newWorld();
    const run = play(['captain', '--hero', 'brenna']);
    expect(run.code).toBe(exitCodes.usage);
    expect(run.err).toContain('--hero needs a Hero id such as hero-000001; got "brenna"');
  });
});
