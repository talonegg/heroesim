import {
  advance,
  ageOf,
  baseStat,
  createWorld,
  dayOf,
  defaultConfig,
  facilityKeys,
  guildmasterOf,
  guildmasterRegardForGuild,
  nextImprovement,
  patronRegardFor,
  playerGuild,
  rankings,
  regardBand,
  regardValue,
  transferFee,
  upkeep,
  type Guild,
  type GuildId,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
import {
  guildPage,
  guildmasterView,
  guildsTable,
  hallView,
  patronsView,
} from './world-views';

// The views of the wider world (M7-S3 part 2, DL-73): every number beside the engine selector or
// document field it comes from, as `selectors.test.ts` does for part 1's.

const deps = { config: defaultConfig, content };
const setup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' };

function newGame(seed = 'world-views'): WorldDocument {
  return createWorld(seed, setup, deps).document;
}

function played(turns: number, seed = 'world-views-played'): WorldDocument {
  let document = newGame(seed);
  for (let turn = 0; turn < turns; turn += 1) document = advance(document, deps).document;
  return document;
}

function player(document: WorldDocument): Guild {
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error('no player');
  return guild;
}

function rival(document: WorldDocument): Guild {
  const guild = Object.values(document.world.guilds).find((each) => each.controller.kind === 'rival');
  if (guild === undefined) throw new Error('no Rival');
  return guild;
}

describe("the Guilds as one table, the Rankings in it (M9-S6, DL-106; the review's B4)", () => {
  /** A new game whose five Guilds have the names, Fame, Wealth and Roster sizes given, in the world's order. */
  function arranged(rows: readonly [name: string, fame: number, wealth: number, heroes: number][]): WorldDocument {
    const document = structuredClone(newGame());
    Object.values(document.world.guilds).forEach((guild, index) => {
      const [name, fame, wealth, heroes] = rows[index] ?? ['', 0, 0, 0];
      Object.assign(guild, { name, fame, wealth, rosterIds: guild.rosterIds.slice(0, heroes) });
    });
    return document;
  }

  test("gives every Guild in play its place by Fame, its Disposition, Fame, Wealth, Heroes and Upkeep, in the Rankings' order, the player's marked", () => {
    const document = played(12);

    const table = guildsTable(document, 'fame');

    expect(table.measure).toBe('fame');
    expect(table.rows.map((row) => row.guildId)).toEqual(rankings(document.world, 'fame').map((ranking) => ranking.guildId));
    for (const row of table.rows) {
      const guild = document.world.guilds[row.guildId] as Guild;
      expect(row).toEqual({
        guildId: guild.id,
        name: guild.name,
        mine: guild.controller.kind === 'player',
        // Its Guildmaster's sex and Portrait's key, for the thumbnail beside its name (v1.1.3-S7).
        guildmaster: { sex: document.world.guildmasters[guild.guildmasterId]?.sex, portraitKey: document.world.guildmasters[guild.guildmasterId]?.portraitKey },
        place: expect.stringMatching(/^(Joint )?\d+(st|nd|rd|th)$/),
        disposition: guild.controller.kind === 'player' ? 'Yours' : content.dispositions[guild.controller.disposition]?.name,
        fame: guild.fame,
        wealth: guild.wealth,
        heroes: guild.rosterIds.length,
        upkeep: upkeep(guild, document.world, defaultConfig, content),
        folded: null,
      });
    }
    expect(table.rows.filter((row) => row.mine).map((row) => row.name)).toEqual(['The Lantern']);
    expect(table.folded).toEqual([]);
  });

  test('Guilds level on Fame share a place; by Wealth, the order and the places are by Wealth, shared too (DL-95, DL-91)', () => {
    const document = arranged([
      ['The Lantern', 9, 100, 3],
      ['Ashford', 4, 300, 3],
      ['Old Weir', 4, 300, 3],
      ['Barrow', 1, 50, 3],
      ['Cinder', 0, 200, 3],
    ]);

    expect(guildsTable(document, 'fame').rows.map(({ name, place }) => [name, place])).toEqual([
      ['The Lantern', '1st'],
      ['Ashford', 'Joint 2nd'],
      ['Old Weir', 'Joint 2nd'],
      ['Barrow', '4th'],
      ['Cinder', '5th'],
    ]);
    const byWealth = guildsTable(document, 'wealth');
    expect(byWealth.measure).toBe('wealth');
    expect(byWealth.rows.map(({ name, place }) => [name, place])).toEqual([
      ['Ashford', 'Joint 1st'],
      ['Old Weir', 'Joint 1st'],
      ['Cinder', '3rd'],
      ['The Lantern', '4th'],
      ['Barrow', '5th'],
    ]);
  });

  test("by any other column, orders for display, ties in the Rankings' order by Fame, and Place still reads by Fame", () => {
    const document = arranged([
      ['The Lantern', 9, 100, 1],
      ['Ashford', 4, 300, 3],
      ['Old Weir', 4, 300, 1],
      ['Barrow', 1, 50, 2],
      ['Cinder', 0, 200, 3],
    ]);
    const places = { 'The Lantern': '1st', Ashford: 'Joint 2nd', 'Old Weir': 'Joint 2nd', Barrow: '4th', Cinder: '5th' };

    for (const sort of ['name', 'disposition', 'heroes', 'upkeep'] as const) {
      const table = guildsTable(document, sort);
      expect(table.measure).toBe('fame');
      for (const row of table.rows) expect(row.place).toBe(places[row.name as keyof typeof places]);
    }
    expect(guildsTable(document, 'name').rows.map((row) => row.name)).toEqual(['Ashford', 'Barrow', 'Cinder', 'Old Weir', 'The Lantern']);
    expect(guildsTable(document, 'heroes').rows.map((row) => [row.name, row.heroes])).toEqual([
      ['Ashford', 3],
      ['Cinder', 3],
      ['Barrow', 2],
      ['The Lantern', 1],
      ['Old Weir', 1],
    ]);
    const byDisposition = guildsTable(document, 'disposition').rows.map((row) => row.disposition);
    expect(byDisposition[0]).toBe('Yours');
    expect(byDisposition.slice(1)).toEqual([...byDisposition.slice(1)].sort());
    const byUpkeep = guildsTable(document, 'upkeep').rows.map((row) => row.upkeep);
    expect(byUpkeep).toEqual([...byUpkeep].sort((a, b) => b - a));
    // Nothing in the world is reordered.
    expect(Object.values(document.world.guilds).map((guild) => guild.name)).toEqual(['The Lantern', 'Ashford', 'Old Weir', 'Barrow', 'Cinder']);
  });

  test('lists a folded Guild apart, with the Day it folded and no place, out of the Rankings', () => {
    const document = structuredClone(newGame());
    const folded = rival(document);
    folded.foldedOnTurn = 7;

    const table = guildsTable(document, 'fame');

    expect(table.rows.map((row) => row.guildId)).not.toContain(folded.id);
    expect(table.rows).toHaveLength(4);
    expect(table.folded).toEqual([expect.objectContaining({ guildId: folded.id, name: folded.name, place: null, folded: `Folded on Day ${dayOf(7)}` })]);
  });
});

describe('hallView', () => {
  test("gives each facility's grade, what it does and the next grade's Improvement and cost, and the Guild's Upkeep", () => {
    const document = structuredClone(newGame());
    const guild = player(document);
    guild.hall.quarters = 3;

    const view = hallView(document);

    expect(view?.mine).toBe(true);
    expect(view?.facilities.map((row) => row.facility)).toEqual([...facilityKeys]);
    for (const row of view?.facilities ?? []) {
      const next = nextImprovement(guild, row.facility, content);
      expect(row.grade).toBe(guild.hall[row.facility]);
      expect(row.next).toEqual(next === null ? null : { name: next.name, cost: next.cost });
      expect(row.does.length).toBeGreaterThan(10);
    }
    expect(view?.facilities.find((row) => row.facility === 'quarters')).toMatchObject({ built: 'Comfortable lodgings', next: null });
    expect(view?.facilities.find((row) => row.facility === 'infirmary')).toMatchObject({ built: 'none' });
    // The Upkeep left the Hall for the Treasury (M9-F3, DL-112 item 6).
    expect(view).not.toHaveProperty('upkeep');
  });

  test("is another Guild's when named, which the player cannot build", () => {
    const document = newGame();
    const other = rival(document);

    expect(hallView(document, other.id)).toMatchObject({ guildId: other.id, guildName: other.name, mine: false });
    expect(hallView(document, 'guild-999999' as GuildId)).toBeNull();
  });

  test("gives each facility's top grade from the Improvements content defines, for its pips (M9-S6, the review's B9)", () => {
    const document = structuredClone(newGame());
    player(document).hall.infirmary = 1;

    const rows = hallView(document)?.facilities ?? [];

    // `improvements.json` defines three grades of each facility.
    expect(rows.map(({ facility, grade, top }) => [facility, grade, top])).toEqual([
      ['infirmary', 1, 3],
      ['trainingYard', 0, 3],
      ['quarters', 0, 3],
    ]);
  });
});

describe('guildmasterView', () => {
  test('gives Stats and what each bears on, Traits and what each does, and Regard as bands for Patrons, the Roster and the other Guilds', () => {
    const document = newGame();
    const guild = player(document);
    const guildmaster = guildmasterOf(guild, document.world);
    if (guildmaster === undefined) throw new Error('no Guildmaster');

    const view = guildmasterView(document);

    expect(view?.name).toBe(guildmaster.name);
    expect(view?.attributes).toContainEqual(['Age', String(ageOf(guildmaster, document.world.turn, defaultConfig))]);
    const stats = Object.values(content.stats).filter((stat) => stat.owner === 'guildmaster');
    expect(view?.stats.map(({ name, value }) => ({ name, value }))).toEqual(
      stats.map((stat) => ({ name: stat.name, value: baseStat(guildmaster.stats, stat) })),
    );
    // Each a cell of its own, beginning with a capital (DL-125 item 9).
    for (const row of view?.stats ?? []) expect(row.bearsOn).toMatch(/^[A-Z]/);
    expect(view?.traits.map((row) => row.name)).toEqual(guildmaster.traits.map((key) => content.guildmasterTraits[key]?.name));
    expect(view?.patrons.map((row) => row.regard)).toEqual(
      Object.values(document.world.patrons).map((patron) => regardBand(regardValue(guildmaster.regard, patron.id), defaultConfig)),
    );
    expect(view?.heroes.map((row) => row.name)).toEqual(guild.rosterIds.map((id) => document.world.heroes[id]?.name));
    const others = Object.values(document.world.guilds).filter((other) => other.id !== guild.id);
    expect(view?.guilds.map((row) => row.regard)).toEqual(
      others.map((other) => regardBand(guildmasterRegardForGuild(guildmaster, other.id, document.world), defaultConfig)),
    );
    // Each band as its chip says it (DL-125 item 9).
    for (const row of [...(view?.patrons ?? []), ...(view?.heroes ?? []), ...(view?.guilds ?? [])]) {
      expect(row.regardWords).toBe(row.regard.charAt(0).toUpperCase() + row.regard.slice(1));
    }
  });

  test('gives the descriptive Attributes written, after the sex and age, and none left empty (M9-S2)', () => {
    const document = createWorld(
      'world-views',
      { ...setup, guildmasterBirthplace: 'Harrowgate', guildmasterBiography: 'Once a quartermaster of the river levies.' },
      deps,
    ).document;
    // Every Guildmaster's blanks are written as they enter play since v1.1.2-S5: an older save may hold one empty.
    const player = playerGuild(document.world);
    const mine = player === undefined ? undefined : document.world.guildmasters[player.guildmasterId];
    if (mine !== undefined) mine.appearance = '';

    expect(guildmasterView(document)?.attributes.map(([label]) => label)).toEqual(['Sex', 'Age', 'Birthplace', 'Biography']);
    expect(guildmasterView(document)?.attributes.slice(2)).toEqual([
      ['Birthplace', 'Harrowgate'],
      ['Biography', 'Once a quartermaster of the river levies.'],
    ]);
    // A Rival's are written as they enter play (v1.1.2-S5), so it shows all three.
    expect(guildmasterView(document, rival(document).id)?.attributes.map(([label]) => label)).toEqual(['Sex', 'Age', 'Birthplace', 'Appearance', 'Biography']);
  });

  test("gives the Guild, for its Banner, and the sex and Portrait's key, for the Portrait: the player's and every Rival's chosen to fit them", () => {
    const document = newGame();
    const keys: (string | null | undefined)[] = [];
    for (const guild of Object.values(document.world.guilds)) {
      const guildmaster = guildmasterOf(guild, document.world);
      if (guildmaster === undefined) throw new Error('no Guildmaster');
      const view = guildmasterView(document, guild.id);
      expect(view?.guildId).toBe(guild.id);
      expect(view?.sex).toBe(guildmaster.sex);
      keys.push(view?.portraitKey);
    }
    // The player's first, a male of 41, then the Rivals', each of their sex and age (v1.1.3-S5).
    expect(keys).toEqual(['gm-male-10', 'gm-male-19', 'gm-female-12', 'gm-male-16', 'gm-male-05']);
    // The key a save of schema 5 holds (v1.1.2-S3) is read as it is.
    const later = structuredClone(document);
    const guildmaster = guildmasterOf(player(later), later.world);
    if (guildmaster === undefined) throw new Error('no Guildmaster');
    Object.assign(guildmaster, { portraitKey: 'gm-male-09' });
    expect(guildmasterView(later)?.portraitKey).toBe('gm-male-09');
  });

  test('gives the Sex capitalised, and the Age as a label (DL-111 item 9)', () => {
    const document = structuredClone(newGame());
    for (const sex of ['male', 'female'] as const) {
      const player = Object.values(document.world.guilds).find((guild) => guild.controller.kind === 'player');
      const guildmaster = player === undefined ? undefined : document.world.guildmasters[player.guildmasterId];
      if (guildmaster === undefined) throw new Error('no Guildmaster');
      guildmaster.sex = sex;
      const [sexRow, ageRow] = guildmasterView(document)?.attributes ?? [];
      expect(sexRow).toEqual(['Sex', sex === 'male' ? 'Male' : 'Female']);
      expect(ageRow?.[0]).toBe('Age');
    }
  });

  describe("the Guildmaster's Retirement, read from the engine's retirementTurn (M9-F3, DL-113 item 5, DL-116)", () => {
    /** A world whose player's Guildmaster is `age` on Turn 0, played on to `turn`. */
    function aged(age: number, turn = 0): WorldDocument {
      const document = structuredClone(createWorld('world-views-retirement', { ...setup, guildmasterAge: age }, deps).document);
      document.world.turn = turn;
      return document;
    }

    test('gives when it will come, in the calendar’s words, and the years left', () => {
      // At 30 on Turn 0, 61 in 31 years of 1,080 Turns: the night of Day 11160, in Year 31.
      expect(guildmasterView(aged(30))?.retirement).toBe('Retires at 61 on the night of Day 11160, Year 31: in 31 Years.');
      // Two Years on, in Year 2, the Day holds and 29 years are left.
      expect(guildmasterView(aged(30, 2 * 1080 + 5))?.retirement).toBe('Retires at 61 on the night of Day 11160, Year 31: in 29 Years.');
      // At 50: 11 years.
      expect(guildmasterView(aged(50))?.retirement).toBe('Retires at 61 on the night of Day 3960, Year 11: in 11 Years.');
    });

    test('says "in 1 year" a year or more away, and the Days left once it is less than a year away (M9-F7, DL-120 item 2)', () => {
      // A year to the Day before: the night of Day 3600, 360 Days, is a year away.
      expect(guildmasterView(aged(50, 10 * 1080))?.retirement).toBe('Retires at 61 on the night of Day 3960, Year 11: in 1 Year.');
      // A Day later it is less than a year away, though still the Year before.
      expect(guildmasterView(aged(50, 10 * 1080 + 3))?.retirement).toBe('Retires at 61 on the night of Day 3960, Year 11: in 359 Days.');
      expect(guildmasterView(aged(50, 3959 * 3))?.retirement).toBe('Retires at 61 on the night of Day 3960, Year 11: in 1 Day.');
      expect(guildmasterView(aged(50, 3960 * 3))?.retirement).toBe('Retires at 61 on the night of Day 3960, Year 11: tonight.');
    });

    test('says it came, once the night has been played and the game has ended with it', () => {
      const document = aged(50, 3960 * 3 + 2);
      document.world.ended = { turn: 3960 * 3 + 2, reason: 'retirement' };
      expect(guildmasterView(document)?.retirement).toBe('Retired at 61 on the night of Day 3960, Year 11.');
    });

    test('says why none came once the game has ended otherwise, or the Guild has folded (M9-F7, DL-120 item 9)', () => {
      const bankrupt = aged(30, 900);
      bankrupt.world.ended = { turn: 900, reason: 'bankruptcy' };
      expect(guildmasterView(bankrupt)?.retirement).toBe('Never retired: the game ended in Bankruptcy on Day 300.');

      const wiped = aged(30, 902);
      wiped.world.ended = { turn: 902, reason: 'roster-wiped' };
      expect(guildmasterView(wiped)?.retirement).toBe('Never retired: the game ended with the Roster wiped out on Day 300.');

      const folded = newGame();
      const other = rival(folded);
      other.foldedOnTurn = 3 * 45 + 2;
      expect(guildmasterView(folded, other.id)?.retirement).toBe('Never retired: the Guild folded on Day 45.');
      // A fold before the game's end is why, whatever ended the game after.
      folded.world.ended = { turn: 900, reason: 'bankruptcy' };
      expect(guildmasterView(folded, other.id)?.retirement).toBe('Never retired: the Guild folded on Day 45.');
    });

    test("says why a Rival's Guildmaster never retired when the player's game ended first, naming the player's Guild (M9-F7)", () => {
      const document = aged(30, 900);
      document.world.ended = { turn: 900, reason: 'bankruptcy' };
      expect(guildmasterView(document, rival(document).id)?.retirement).toBe('Never retired: the game ended on Day 300, when The Lantern went bankrupt.');
      document.world.ended = { turn: 900, reason: 'retirement' };
      expect(guildmasterView(document, rival(document).id)?.retirement).toBe(
        'Never retired: the game ended on Day 300, when The Lantern lost its Guildmaster to Retirement.',
      );
    });

    test('says the coming night for one past the night retirementTurn gave but still in office, as a save adopting younger rules has (M9-F6, code review)', () => {
      // At 45 on Turn 0, the night of their 61st was Turn 17,282. On Turn 18,500 they are 62 and
      // still in office: the endings retire them on the next night, Turn 18,503, Day 6167.
      expect(guildmasterView(aged(45, 18_500))?.retirement).toBe('Retires at 62 on the night of Day 6167, Year 17: in 1 Day.');
    });

    test('gives the age they will be, for one already past the Retirement age when they entered, as a save adopting the rules has (code review)', () => {
      const document = aged(30);
      const player = Object.values(document.world.guilds).find((guild) => guild.controller.kind === 'player');
      const guildmaster = player === undefined ? undefined : document.world.guildmasters[player.guildmasterId];
      if (guildmaster === undefined) throw new Error('no Guildmaster');
      guildmaster.ageAtEntry = 63;
      // They retire on the first night from their entry, at the age they are.
      expect(guildmasterView(document)?.retirement).toBe('Retires at 63 on the night of Day 0, Year 0: tonight.');
    });

    test("gives a Rival's Guildmaster's too, on its Guild's page", () => {
      const document = newGame();
      expect(guildmasterView(document, rival(document).id)?.retirement).toMatch(/^Retires at 61 on the night of Day \d+, Year \d+: in \d+ Years\.$/);
    });
  });

  test("is another Guild's Guildmaster when named", () => {
    const document = newGame();
    const other = rival(document);

    expect(guildmasterView(document, other.id)?.name).toBe(guildmasterOf(other, document.world)?.name);
    expect(guildmasterView(document, other.id)?.guildName).toBe(other.name);
  });

  test("marks each Regard that is neutral, for the page to fold (M9-S6, the review's C8)", () => {
    const document = structuredClone(newGame());
    const guild = player(document);
    const guildmaster = guildmasterOf(guild, document.world);
    const [patron] = Object.values(document.world.patrons);
    const [hero] = guild.rosterIds;
    if (guildmaster === undefined || patron === undefined || hero === undefined) throw new Error('no Guildmaster, Patron or Hero');
    guildmaster.regard[patron.id] = { value: 8, since: 0, reason: 'test' };
    guildmaster.regard[hero] = { value: -30, since: 0, reason: 'test' };

    const view = guildmasterView(document);

    expect(view?.patrons[0]).toMatchObject({ name: patron.name, regard: 'warm', neutral: false });
    expect(view?.patrons.slice(1).every((row) => row.regard === 'neutral' && row.neutral)).toBe(true);
    expect(view?.heroes[0]).toMatchObject({ regard: 'hostile', neutral: false });
    expect(view?.guilds.every((row) => row.neutral)).toBe(true);
  });
});

describe('patronsView', () => {
  test("gives each Patron's Sphere and Regard for the player's Guild as a band", () => {
    const document = played(9);
    const guild = player(document);

    expect(patronsView(document).map(({ patronId, name, sphere, regard }) => ({ patronId, name, sphere, regard }))).toEqual(
      Object.values(document.world.patrons).map((patron) => ({
        patronId: patron.id,
        name: patron.name,
        sphere: content.spheres[patron.sphereKey]?.name,
        regard: regardBand(patronRegardFor(patron, guild.id), defaultConfig),
      })),
    );
  });

  test("gives, beside their Regard for the player's Guild, the player's Guildmaster's Regard for them and their Quests on the Board now, and marks a row neutral when both Regards are (M9-S6, the review's B5)", () => {
    const document = structuredClone(played(9));
    const guild = player(document);
    const guildmaster = guildmasterOf(guild, document.world);
    const [cold, liked, ...rest] = Object.values(document.world.patrons);
    if (guildmaster === undefined || cold === undefined || liked === undefined) throw new Error('no Guildmaster or Patrons');
    cold.regard[guild.id] = { value: -30, since: 0, reason: 'test' };
    guildmaster.regard[cold.id] = { value: 0, since: 0, reason: 'test' };
    liked.regard[guild.id] = { value: 0, since: 0, reason: 'test' };
    guildmaster.regard[liked.id] = { value: 20, since: 0, reason: 'test' };
    for (const patron of rest) {
      patron.regard[guild.id] = { value: 0, since: 0, reason: 'test' };
      guildmaster.regard[patron.id] = { value: 0, since: 0, reason: 'test' };
    }

    const rows = patronsView(document);

    expect(rows[0]).toMatchObject({
      patronId: cold.id,
      regard: 'hostile',
      guildmasterRegard: 'neutral',
      regardWords: 'Hostile',
      guildmasterRegardWords: 'Neutral',
      neutral: false,
    });
    expect(rows[1]).toMatchObject({ patronId: liked.id, regard: 'neutral', guildmasterRegard: 'close', regardWords: 'Neutral', guildmasterRegardWords: 'Close', neutral: false });
    expect(rows.slice(2).every((row) => row.regard === 'neutral' && row.guildmasterRegard === 'neutral' && row.neutral)).toBe(true);
    const onTheBoard = document.world.board.map((questId) => document.world.quests[questId]?.patronId);
    expect(onTheBoard.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.quests).toBe(onTheBoard.filter((patronId) => patronId === row.patronId).length);
    expect(rows.reduce((sum, row) => sum + row.quests, 0)).toBe(document.world.board.length);
  });
});

describe('guildPage', () => {
  test("gives another Guild's Roster with the Transfer fee the player's Guild would pay for each Hero, its Hall and its Guildmaster", () => {
    const document = newGame();
    const other = rival(document);
    const buyer = guildmasterOf(player(document), document.world);

    const page = guildPage(document, other.id);

    expect(page?.name).toBe(other.name);
    expect(page?.roster.map((row) => ({ heroId: row.heroId, fee: row.fee }))).toEqual(
      other.rosterIds.map((heroId) => ({ heroId, fee: transferFee(document.world.heroes[heroId] as never, buyer, deps) })),
    );
    // Each Hero's sex and Portrait's key, for their thumbnail beside their name (DL-147).
    expect(page?.roster.map((row) => ({ sex: row.sex, portraitKey: row.portraitKey }))).toEqual(
      other.rosterIds.map((heroId) => ({ sex: document.world.heroes[heroId]?.sex, portraitKey: document.world.heroes[heroId]?.portraitKey })),
    );
    expect(page?.hall.guildId).toBe(other.id);
    expect(page?.guildmaster?.guildName).toBe(other.name);
    expect(guildPage(document, 'guild-999999' as GuildId)).toBeNull();
  });

  test("says whose it is, its Background, Fame and Wealth; the player's own has no fees (M9-S6, the review's B10)", () => {
    const document = newGame();
    const other = rival(document);
    const mine = player(document);

    expect(guildPage(document, other.id)).toMatchObject({
      mine: false,
      controller: `Rival (${other.controller.kind === 'rival' ? content.dispositions[other.controller.disposition]?.name : ''})`,
      background: content.backgrounds[other.backgroundKey]?.name,
      fame: other.fame,
      wealth: other.wealth,
    });
    const own = guildPage(document, mine.id);
    expect(own).toMatchObject({ mine: true, controller: 'Yours' });
    expect(own?.roster.map((row) => row.fee)).toEqual(mine.rosterIds.map(() => null));
  });
});
