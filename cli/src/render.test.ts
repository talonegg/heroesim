import { advance, createWorld, defaultConfig, playerGuild, rankings, type Guild, type WorldDocument } from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { renderCountdown, renderRankings, renderSummary, table } from './render.js';

test('a table aligns its columns, numbers to the right, and leaves no trailing space', () => {
  const lines = table(
    [{ heading: 'Name' }, { heading: 'Level', align: 'right' }, { heading: 'Class' }],
    [
      ['Ada', '1', 'Warrior'],
      ['Brand Ironside', '12', ''],
    ],
  );

  expect(lines).toEqual([
    'Name            Level  Class',
    '--------------  -----  -------',
    'Ada                 1  Warrior',
    'Brand Ironside     12',
  ]);
});

test('a table with no rows is its heading', () => {
  expect(table([{ heading: 'Turn', align: 'right' }, { heading: 'Event' }], [])).toEqual(['Turn  Event', '----  -----']);
});

const content = loadContent();
const setup = { guildName: 'The Test', guildmasterName: 'Ada', createdAt: '2026-09-28T09:00:00.000Z' };

function newGame(seed = 'render'): WorldDocument {
  return createWorld(seed, setup, { config: defaultConfig, content }).document;
}

/** The deps a save plays under, as `open` gives them: its own config filled forward. */
function playDeps(document: WorldDocument) {
  return { config: { ...defaultConfig, ...document.meta.config }, content };
}

/** The table row of `lines` that names `guildId`. */
function rowFor(lines: readonly string[], guildId: string): string {
  const row = lines.find((line) => line.includes(guildId));
  if (row === undefined) throw new Error(`No row for ${guildId}`);
  return row;
}

describe('renderRankings: shared places (v1.0.1-S4, DL-95)', () => {
  test('a new game, every Guild at Fame 0, marks each Rank joint 1', () => {
    const document = newGame();

    const lines = renderRankings(document, playDeps(document), 'fame');

    expect(lines[2]).toMatch(/^ {3}Rank {2}Id/);
    for (const guild of Object.values(document.world.guilds)) {
      expect(rowFor(lines, guild.id)).toMatch(new RegExp(`^joint 1  ${guild.id}  .* 0$`));
    }
  });

  test('Fame 9, 4, 4 and 1 print 1, joint 2, joint 2 and 4, a folded Guild left out', () => {
    const document = structuredClone(newGame());
    const guilds = Object.values(document.world.guilds);
    [9, 4, 4, 1, 50].forEach((fame, index) => Object.assign(guilds[index] ?? {}, { fame }));
    Object.assign(guilds[4] ?? {}, { foldedOnTurn: 0 });
    const [g1, g2, g3, g4, g5] = guilds.map((guild) => guild.id);

    const lines = renderRankings(document, playDeps(document), 'fame');

    expect(lines.slice(4)).toEqual([
      expect.stringMatching(new RegExp(`^ {6}1  ${g1}  `)),
      expect.stringMatching(new RegExp(`^joint 2  ${g2}  `)),
      expect.stringMatching(new RegExp(`^joint 2  ${g3}  `)),
      expect.stringMatching(new RegExp(`^ {6}4  ${g4}  `)),
    ]);
    expect(lines.some((line) => line.includes(g5 ?? 'none'))).toBe(false);
    // The engine's own ranks stay one to a Guild, ties by Guild id.
    expect(rankings(document.world, 'fame').map(({ rank }) => rank)).toEqual([1, 2, 3, 4]);
  });
});

describe('the Bankruptcy countdown in show (v1.0.1-S4, DL-95)', () => {
  /** The Test below the floor from the start, played through the night of Day 0 under `config`. */
  function belowTheFloor(config: Partial<typeof defaultConfig> = {}): WorldDocument {
    let document = structuredClone(newGame('render-countdown'));
    document.meta.config = { ...document.meta.config, ...config };
    (playerGuild(document.world) as Guild).wealth = document.meta.config.bankruptcyFloor - 1;
    while (document.world.turn < 2) document = advance(document, playDeps(document)).document;
    return document;
  }

  const line = (dueDay: number) =>
    `The Test has been below the Bankruptcy floor since Day 0: Bankruptcy on the night of Day ${dueDay} ` +
    'unless Wealth is back to 0 or more on a night by then, after any Upkeep due.';

  test("show's summary prints it under the Turn while the player's Guild is below the floor, from the save's grace", () => {
    const below = belowTheFloor();
    expect(playerGuild(below.world)?.belowFloorSince).toBe(2);

    const summary = renderSummary(below, playDeps(below));

    expect(summary[0]).toMatch(/^Seed render-countdown, Turn 2 \(Day 0, night, Year 0\)/);
    expect(summary[1]).toBe(line(defaultConfig.bankruptcyGraceDays));
    expect(summary[2]).toBe('');
    // A save playing under a grace of 10 Days, read under its own rules as `open` reads it.
    const ten = belowTheFloor({ bankruptcyGraceDays: 10 });
    expect(renderSummary(ten, playDeps(ten))[1]).toBe(line(10));
  });

  test('prints nothing while belowFloorSince is null, or once the game has ended', () => {
    const fresh = newGame();
    expect(playerGuild(fresh.world)?.belowFloorSince).toBeNull();
    expect(renderCountdown(fresh, playDeps(fresh))).toEqual([]);
    expect(renderSummary(fresh, playDeps(fresh))[1]).toBe('');

    const ended = belowTheFloor();
    ended.world.ended = { turn: 2, reason: 'bankruptcy' };
    expect(renderCountdown(ended, playDeps(ended))).toEqual([]);
  });
});
