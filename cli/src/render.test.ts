import { advance, baseStat, createWorld, defaultConfig, playerGuild, rankings, type Guild, type Hero, type TraitEffect, type WorldDocument } from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { renderCountdown, renderGuildmaster, renderGuilds, renderHero, renderRankings, renderSummary, table, traitEffectWords } from './render.js';

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

// v1.1.2-S6 (the review's D): a Rival's Disposition by its name in content, as the page's Guilds' table
// has it (DL-125 item 9), so the two read the same.
describe("a Rival's Disposition by its content name in show guilds and show rankings (v1.1.2-S6)", () => {
  test("names the Disposition as content does, not its key capitalised, and a key content lacks as it is (rule 5)", () => {
    const document = structuredClone(newGame());
    const rivals = Object.values(document.world.guilds).filter((guild) => guild.controller.kind === 'rival');
    const [named, unknown] = rivals;
    if (named?.controller.kind !== 'rival' || unknown === undefined) throw new Error('no Rivals');
    const renamed = { ...content, dispositions: { ...content.dispositions, [named.controller.disposition]: { ...content.dispositions[named.controller.disposition], name: 'Even-handed' } } };
    unknown.controller = { kind: 'rival', disposition: 'cautious-ish' };
    const deps = { config: { ...defaultConfig, ...document.meta.config }, content: renamed as typeof content };

    for (const lines of [renderGuilds(document, deps), renderRankings(document, deps, 'fame')]) {
      expect(rowFor(lines, named.id)).toContain('Rival (Even-handed)');
      expect(rowFor(lines, unknown.id)).toContain('Rival (cautious-ish)');
    }
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

  test("names the save's own floor, from its rules (v1.0.1-S6, DL-97)", () => {
    const fifty = belowTheFloor({ bankruptcyGraceDays: 10, bankruptcyFloor: 50 });
    const expected = line(10).replace('back to 0 or more', 'back to 50 or more');

    expect(renderCountdown(fifty, playDeps(fifty))).toEqual([expected]);
    expect(renderSummary(fifty, playDeps(fifty))[1]).toBe(expected);
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

// M9-F1 (DL-111 item 9, DL-112 item 4): the values of Sex are capitalised where the CLI prints them.
describe('the Sex values, capitalised (M9-F1)', () => {
  const sexLine = (lines: readonly string[]) => lines.find((line) => line.startsWith('Sex'));

  test('renderHero prints "Male" and "Female"', () => {
    const document = newGame();
    const deps = playDeps(document);
    const heroes = Object.values(document.world.heroes);
    for (const [sex, word] of [['male', 'Male'], ['female', 'Female']] as const) {
      const hero = heroes.find((it) => it.sex === sex) as Hero;
      expect(sexLine(renderHero(hero, document, deps))?.split(/\s+/)).toEqual(['Sex', word]);
    }
  });

  test('renderGuildmaster prints "Male" and "Female"', () => {
    for (const [sex, word] of [['male', 'Male'], ['female', 'Female']] as const) {
      const document = createWorld('render', { ...setup, guildmasterSex: sex }, { config: defaultConfig, content }).document;
      const guild = playerGuild(document.world) as Guild;
      expect(sexLine(renderGuildmaster(guild, document, playDeps(document)))?.split(/\s+/)).toEqual(['Sex', word]);
    }
  });
});

// v1.1.4-S7: a Trait's effects in words, each in the Trait's order, and a Hero's Traits with theirs.
describe("a Trait's effects in words (v1.1.4-S7)", () => {
  test('several effects, of either list, are each worded and joined by commas, in order', () => {
    const effects: TraitEffect[] = [
      { kind: 'statModifiers', modifiers: { dexterity: -2, endurance: -1 } },
      { kind: 'encounterBonus', flat: 2, kinds: ['combat', 'travel'] },
      { kind: 'encounterBonus', flat: -1, tags: ['undead'] },
      { kind: 'upkeepFactor', factor: 0.9 },
    ];
    expect(traitEffectWords(effects, content)).toBe(
      '-2 Dexterity, -1 Endurance, +2 to every Check of combat or travel Encounters, -1 to every Check of Encounters tagged undead, Upkeep ×0.9',
    );
  });

  test('the lore kind (v1.1.4-S8) is worded as the others are, by its key, and a tag an Encounter carries as written', () => {
    const effects: TraitEffect[] = [
      { kind: 'encounterBonus', flat: 2, kinds: ['lore'] },
      { kind: 'encounterBonus', flat: 1, kinds: ['arcane', 'lore'], tags: ['delve'] },
    ];
    expect(traitEffectWords(effects, content)).toBe(
      '+2 to every Check of lore Encounters, +1 to every Check of arcane or lore Encounters or Encounters tagged delve',
    );
  });

  test('none is "no effect"', () => {
    expect(traitEffectWords([], content)).toBe('no effect');
  });

  test("show hero gives each Trait with what it does, and its Stat changes in the effective Stats", () => {
    const document = newGame();
    const hero = Object.values(document.world.heroes).find((it) => it.guildId !== null && it.traits.length === 0) as Hero;
    const dexterity = content.stats.dexterity;
    if (dexterity === undefined) throw new Error('no Dexterity');
    const before = baseStat(hero.stats, dexterity);
    hero.traits = ['lame'];

    const lines = renderHero(hero, document, playDeps(document));

    expect(lines.find((line) => line.startsWith('Traits'))?.replace(/\s+/, ' ')).toBe('Traits Lame (-2 Dexterity, -1 Endurance)');
    const row = lines.find((line) => line.includes(' Dexterity '));
    expect(row?.trim().split(/\s+/).slice(-3, -1)).toEqual([String(before), String(Math.max(1, before - 2))]);
  });
});
