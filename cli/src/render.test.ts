import {
  advance,
  createWorld,
  defaultConfig,
  playerGuild,
  unattachedHeroes,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type PartyId,
  type Quest,
  type WorldDocument,
} from '@heroesim/engine';
import { loadContent } from '@heroesim/content/node';
import {
  bestPartyReading,
  boardReading,
  capitalised,
  chanceWords,
  listed,
  playerReading,
  poolReading,
  rosterReading,
  signsWords,
  type HeroReading,
  type QuestReading,
  type Signs,
  type StatReading,
} from '@heroesim/words';
import { describe, expect, test } from 'vitest';
import { renderBoard, renderCountdown, renderGuildmaster, renderGuilds, renderHero, renderPool, renderRankings, renderRoster, renderSummary, table } from './render.js';

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

describe('renderRankings: shared places (DL-95)', () => {
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
  });
});

// A Rival's Disposition by its name in content, as the page's Guilds' table
// has it (DL-125 item 9), so the two read the same.
describe("a Rival's Disposition by its content name in show guilds and show rankings", () => {
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

describe('the Bankruptcy countdown in show (DL-95)', () => {
  /** The Test below the floor from the start, played through the night of the first Day under `config`. */
  function belowTheFloor(config: Partial<typeof defaultConfig> = {}): WorldDocument {
    let document = structuredClone(newGame('render-countdown'));
    document.meta.config = { ...document.meta.config, ...config };
    (playerGuild(document.world) as Guild).wealth = document.meta.config.bankruptcyFloor - 1;
    while (document.world.turn < 2) document = advance(document, playDeps(document)).document;
    return document;
  }

  const line = (dueDay: number) =>
    `The Test has been below the Bankruptcy floor since Year 1 Day 1: Bankruptcy on the night of Year 1 Day ${dueDay + 1} ` +
    'unless Wealth is back to 0 or more on a night by then, after any Upkeep due.';

  test("show's summary prints it under the Turn while the player's Guild is below the floor, from the save's grace", () => {
    const below = belowTheFloor();
    expect(playerGuild(below.world)?.belowFloorSince).toBe(2);

    const summary = renderSummary(below, playDeps(below));

    expect(summary[0]).toMatch(/^Seed render-countdown, Turn 2 \(Year 1 Day 1, night\)/);
    expect(summary[1]).toBe(line(defaultConfig.bankruptcyGraceDays));
    expect(summary[2]).toBe('');
    // A save playing under a grace of 10 Days, read under its own rules as `open` reads it.
    const ten = belowTheFloor({ bankruptcyGraceDays: 10 });
    expect(renderSummary(ten, playDeps(ten))[1]).toBe(line(10));
  });

  test("names the save's own floor, from its rules (DL-97)", () => {
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

// DL-111 item 9, DL-112 item 4: the values of Sex are capitalised where the CLI prints them.
describe('the Sex values, capitalised', () => {
  const sexLine = (lines: readonly string[]) => lines.find((line) => line.startsWith('Sex'));

  test('renderGuildmaster prints "Male" and "Female"', () => {
    for (const [sex, word] of [['male', 'Male'], ['female', 'Female']] as const) {
      const document = createWorld('render', { ...setup, guildmasterSex: sex }, { config: defaultConfig, content }).document;
      const guild = playerGuild(document.world) as Guild;
      expect(sexLine(renderGuildmaster(guild, document, playDeps(document)))?.split(/\s+/)).toEqual(['Sex', word]);
    }
  });
});

// The layouts of the readings (DL-241): what a reading holds is `words/src/readings.test.ts`'s; these
// hold how `show` lays each out, a cell that stands alone opening with a capital (docs/agents/ui-text.md).
describe("show's layouts of the readings (DL-241)", () => {
  const stat = (key: string, area: string, name: string, base: number, value: number, outlook: StatReading['outlook']): StatReading => ({ key, area, name, base, value, outlook });
  const hero: HeroReading = {
    id: 'hero-000007' as HeroId,
    name: 'Finn Grimshaw',
    sex: 'male',
    portraitKey: null,
    classKey: 'warrior',
    className: 'Warrior',
    level: 3,
    age: 24,
    morale: 61,
    background: 'Levy soldier',
    xp: 45,
    moraleBand: 'steady',
    guild: { id: 'guild-000002' as GuildId, name: 'The Ashford Guild' },
    unattached: false,
    injury: { name: 'Deep cut', healsOnTurn: 20 },
    traits: [{ name: 'Lame', effect: '-2 Dexterity, -1 Endurance' }],
    texts: [{ label: 'Biography', words: 'Once a drover.' }],
    transferFee: 180,
    signing: null,
    partyId: 'party-000004' as PartyId,
    died: 2_198,
    retired: null,
    leftPool: 0,
    stats: [stat('strength', 'Physical', 'Strength', 9, 10, 'promising'), stat('dexterity', 'Physical', 'Dexterity', 7, 5, 'modest'), stat('wits', 'Mental', 'Wits', 6, 6, 'exceptional')],
    gear: [
      { slot: 'weapon', item: { id: 'stack-000003', name: 'Arming sword', modifies: 'Weaponry +2, Strength +1', definitionKey: 'arming-sword', unique: false } },
      { slot: 'armour', item: null },
    ],
    skills: [{ key: 'swordcraft', name: 'Swordcraft', rating: 2 }],
    relationships: [{ id: 'hero-000008' as HeroId, name: 'Ada Brack', classKey: 'mage', className: 'Mage', regard: 'warm', relationship: 'neutral' }],
  };

  test("show hero lays out a Hero's reading: its Attributes, then its Stats, gear, Skills and Relationships as tables", () => {
    expect(renderHero(hero, defaultConfig)).toEqual([
      'Finn Grimshaw (hero-000007)',
      '',
      'Sex            Male',
      'Portrait       None: the Silhouette',
      'Age            24',
      'Class          Warrior',
      'Background     Levy soldier',
      'Guild          The Ashford Guild (guild-000002)',
      'Level          3',
      'XP             45',
      'Morale         61',
      'Injury         Deep cut, healing on the night of Year 1 Day 7 (Turn 20)',
      'Traits         Lame (-2 Dexterity, -1 Endurance)',
      'Biography      Once a drover.',
      'Transfer fee   180',
      'Party          party-000004',
      'Died           Year 3 Day 13 (Turn 2198)',
      'Left the pool  Year 1 Day 1 (Turn 0)',
      '',
      'Stats',
      'Area      Stat       Base  Effective  Outlook',
      '--------  ---------  ----  ---------  -----------',
      'Physical  Strength      9         10  Promising',
      '          Dexterity     7          5  Modest',
      'Mental    Wits          6          6  Exceptional',
      '',
      'Gear',
      'Slot    Item          Id            Modifies',
      '------  ------------  ------------  ------------------------',
      'Weapon  Arming sword  stack-000003  Weaponry +2, Strength +1',
      'Armour  None',
      '',
      'Skills',
      'Skill       Rating',
      '----------  ------',
      'Swordcraft       2',
      '',
      'Relationships on the Roster',
      'Id           Hero       Class  Regard  Relationship',
      '-----------  ---------  -----  ------  ------------',
      'hero-000008  Ada Brack  Mage   Warm    Neutral',
    ]);
  });

  test('show hero says what a Hero lacks: no Guild, Injury, Trait, Skill or other Hero on the Roster, and no Relationships off one', () => {
    const lines = (reading: Partial<HeroReading>) => renderHero({ ...hero, ...reading }, defaultConfig);
    const field = (all: readonly string[], label: string) => all.find((line) => line.startsWith(`${label} `))?.replace(/\s+/g, ' ');

    const bare = lines({ guild: null, unattached: false, injury: null, traits: [], skills: [], relationships: [], sex: 'female' });
    expect(field(bare, 'Guild')).toBe('Guild None');
    expect(field(bare, 'Injury')).toBe('Injury None');
    expect(field(bare, 'Traits')).toBe('Traits None');
    expect(field(bare, 'Sex')).toBe('Sex Female');
    expect(bare.slice(bare.indexOf('Skills'), bare.indexOf('Skills') + 2)).toEqual(['Skills', 'None']);
    expect(bare.slice(-2)).toEqual(['Relationships on the Roster', 'None']);
    expect(field(lines({ guild: null, unattached: true }), 'Guild')).toBe('Guild Unattached');
    expect(field(lines({ guild: { id: 'guild-000009' as GuildId, name: undefined } }), 'Guild')).toBe('Guild guild-000009 (guild-000009)');
    expect(lines({ relationships: null }).join('\n')).not.toContain('Relationships');
    expect(lines({ transferFee: null, partyId: null, died: null, leftPool: null, retired: 1_079 }).filter((line) => /^(Transfer fee|Party|Died|Left the pool|Retired) /.test(line)).map((line) => line.replace(/\s{2,}/, '  '))).toEqual([
      'Retired  Year 1 Day 360 (Turn 1079)',
    ]);
  });

  test("show pool and show roster lay out their Heroes' rows: the pool's with the fee and whether they sign, another Guild's Roster with the Transfer fee", () => {
    const document = newGame();
    const pool = unattachedHeroes(document.world);
    (pool[0] as Hero).level = 9;
    const reading = playerReading(document, playDeps(document));
    const guild = playerGuild(document.world) as Guild;

    const lines = renderPool(reading);

    expect(lines.slice(0, 3)).toEqual(['Unattached pool', '', expect.stringMatching(/^Id\s+Name\s+Class\s+Level\s+Age\s+Morale\s+Background\s+Fee\s+Signs$/)]);
    for (const row of poolReading(reading)) {
      const cells = rowFor(lines, row.id).split(/\s{2,}/);
      expect(cells).toEqual([row.id, row.name, row.className, String(row.level), String(row.age), String(row.morale), row.background, String(row.fee), capitalised(signsWords(row.signs as Signs))]);
    }
    expect(rowFor(lines, (pool[0] as Hero).id)).toMatch(/\sNeeds Fame \d+$/);
    expect(lines.slice(-2)).toEqual(['', `The Test has ${guild.fame} Fame. A Hero who needs more will not sign for it until it has that much.`]);

    const rival = Object.values(document.world.guilds).find((each) => each.id !== guild.id) as Guild;
    const roster = renderRoster(reading, rival);
    expect(roster[2]).toMatch(/\sBackground\s+Transfer fee$/);
    for (const row of rosterReading(reading, rival)) expect(rowFor(roster, row.id)).toMatch(new RegExp(`\\s${row.background}\\s+${row.transferFee}$`));
    expect(renderRoster(reading, guild)[2]).toMatch(/\sBackground$/);
  });

  test("show board lays out the Board's readings: a row of terms each, the Skills that help and the Encounters' kinds, then each Quest's Encounters and its Best Party", () => {
    const document = newGame();
    const [first, second, third] = document.world.board.map((id) => document.world.quests[id] as Quest) as [Quest, Quest, Quest];
    first.requirements = { partySizeMin: 1, partySizeMax: 4, classKey: 'mage', skillKey: 'lockpicking' };
    // Its Encounters are none the content in use defines (data-model rule 5).
    second.encounterKeys = ['no-such-encounter'];
    const reading = playerReading(document, playDeps(document));
    const quests = boardReading(reading);

    const lines = renderBoard(reading);

    expect(lines[0]).toBe(`Board: ${quests.length} Quests on offer, Turn 0 (Year 1 Day 1, morning)`);
    expect(lines[2]?.split(/\s{2,}/)).toEqual(['Id', 'Quest', 'Patron', 'Difficulty', 'Days', 'Reward', 'Fame', 'Party', 'Requires', 'On offer through']);
    const [one, two, three] = quests as [QuestReading, QuestReading, QuestReading];
    expect(lines[4]?.split(/\s{2,}/)).toEqual([one.id, one.name, one.patron, String(one.difficulty), String(one.days), String(one.reward), String(one.fame), '1 to 4', 'Mage, Lockpicking', 'Year 1 Day 3']);
    const rows = lines.filter((line) => line.startsWith(one.id) || line.startsWith(two.id)).map((line) => line.split(/\s{2,}/));
    expect(rows[2]).toEqual([one.id, one.skills.join(', '), capitalised(one.encounters.map((encounter) => encounter.kind).join(', '))]);
    // An Encounter content does not define, by its key; no Skill is known to help, since its Encounters'
    // Checks name them, not its template (DL-42, DL-248).
    expect(rows[3]).toEqual([two.id, 'None', 'No-such-encounter']);

    const block = (quest: QuestReading): string[] => lines.slice(lines.indexOf(`${quest.id}, ${quest.name}`));
    const encounter = one.encounters[0];
    expect(block(one).slice(1, 2 + (encounter?.checks.length ?? 0))).toEqual([`  ${encounter?.name} (${encounter?.kind})`, ...(encounter?.checks ?? []).map((check) => `    ${check.name}: ${check.reads}`)]);
    const best = bestPartyReading(reading, third);
    if (best === null || best.chance === null) throw new Error('no Best Party');
    expect(block(three)).toContain(`  Your best Party: ${chanceWords[best.chance.band]} (${best.chance.percent}% if no one falls), ${listed(best.names)}.`);
    expect(block(two).slice(1, 3)).toEqual(['  no-such-encounter', expect.stringMatching(/^ {2}(Your best Party: .+; its chance is not known until its Encounters are drawn|No Party of your free Heroes meets its requirements)\.$/)]);
  });

  // DL-264: a Quest the player's Guild may not take offers no Party; the line says why, in the refusals' words.
  test("show board says, in place of a Quest's best Party, that its Tier's Fame minimum is above the Guild's Fame", () => {
    const document = newGame();
    const [first, second] = document.world.board.map((id) => document.world.quests[id] as Quest) as [Quest, Quest];
    for (const quest of [first, second]) quest.requirements = { partySizeMin: 1, partySizeMax: 4 };
    first.tier = 1;
    second.tier = 2;
    const deps = playDeps(document);
    const tiers = deps.config.tiers.map((row, index) => ({ ...row, fameMinimum: index === 1 ? 7 : 0 }));
    const reading = playerReading(document, { ...deps, config: { ...deps.config, tiers } });
    const quests = boardReading(reading);
    const lines = renderBoard(reading);
    const [one, two] = quests as [QuestReading, QuestReading];
    // A Quest's block runs from its heading to the blank line after it, its Best Party's line last.
    const lastOf = (quest: QuestReading): string | undefined => {
      const from = lines.indexOf(`${quest.id}, ${quest.name}`);
      const to = lines.indexOf('', from);
      return lines.slice(from, to === -1 ? undefined : to).at(-1);
    };

    expect(lastOf(one)).toMatch(/^ {2}Your best Party: /);
    expect(lastOf(two)).toBe(`  ${two.name} (${two.id}) is a Tier 2 Quest, open to a Guild of 7 Fame or more; The Test has 0, 7 short.`);
  });
});
