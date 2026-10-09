import { createWorld, defaultConfig, playerGuild, type ContentSet, type PortraitAppearance, type WorldDocument } from '@heroesim/engine';
import { describe, expect, test, vi } from 'vitest';
import { exitCodes, playground, type Run } from './play.test-support.js';

// `new --portrait` and `show guildmaster` over content with pictures (DL-125 item 3): the
// core with a third Guildmaster picture, a young man's, beside its two (DL-141, so that a man of
// either band has one that fits); `main.test.ts` holds the refusal the core itself gives.

const pictures: ContentSet['portraits']['guildmaster'] = { female: ['gm-female-01'], male: ['gm-male-01', 'gm-male-02'] };

vi.mock('@heroesim/content/node', async (original) => {
  const actual = await original<typeof import('@heroesim/content/node')>();
  const loadContent = (): ContentSet => {
    const core = actual.loadContent();
    const young = { ...(core.portraitAppearances.portraits['gm-male-01'] as PortraitAppearance), apparentAge: [21, 32] as [number, number] };
    return {
      ...core,
      portraits: { ...core.portraits, guildmaster: pictures },
      portraitAppearances: { ...core.portraitAppearances, portraits: { ...core.portraitAppearances.portraits, 'gm-male-02': young } },
    };
  };
  return { ...actual, loadContent };
});

const { loadContent } = await import('@heroesim/content/node');
const content = loadContent();
const clock = new Date('2026-09-30T09:30:00.000Z');

const { play: playAt, document: saved } = playground('heroesim-cli-portrait-', content);

/** A command line, on the day these tests were written. */
function play(argv: string[]): Run {
  return playAt(argv, { now: () => clock });
}

function playerGuildmaster(document: WorldDocument) {
  const guild = playerGuild(document.world);
  return guild === undefined ? undefined : document.world.guildmasters[guild.guildmasterId];
}

describe('new --portrait', () => {
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

  test("with --portrait and no --age, draws the age within the picture's (DL-134 item 7)", () => {
    // The core's gm-male-01 looks 45 to 55, held to the starting ages' 50.
    expect(newGame('--portrait', 'gm-male-01').code).toBe(exitCodes.ok);
    const age = playerGuildmaster(saved())?.ageAtEntry ?? 0;
    expect(age).toBeGreaterThanOrEqual(45);
    expect(age).toBeLessThanOrEqual(50);
    // An age given is kept, whatever the picture looks.
    expect(newGame('--portrait', 'gm-male-01', '--age', '25', '--force').code).toBe(exitCodes.ok);
    expect(playerGuildmaster(saved())).toMatchObject({ portraitKey: 'gm-male-01', ageAtEntry: 25 });
  });

  test('chooses the Portrait to fit them from the pictures of the sex when none is given, as the engine does', () => {
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
      "That Portrait is of a male Guildmaster, and your Guildmaster's Sex is female: choose a Portrait of that Sex, or leave out --sex.",
    );

    const unknown = newGame('--portrait', 'gm-male-09');
    expect(unknown.code).toBe(exitCodes.usage);
    expect(unknown.err).toContain(
      'No Guildmaster Portrait is called "gm-male-09". Choose from: gm-female-01 (female), gm-male-01 (male), gm-male-02 (male).',
    );
    expect(play(['show']).code).toBe(exitCodes.refused);
  });
});
