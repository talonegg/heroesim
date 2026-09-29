import {
  advance,
  ageOf,
  baseStat,
  createWorld,
  dayOf,
  defaultConfig,
  entriesFor,
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
import { historyPageSize } from './selectors';
import { played as playedState, started, withTheGone } from './game.test-support';
import {
  findInHistory,
  guildPage,
  guildmasterView,
  guildsTable,
  hallView,
  historyChoices,
  historySearchLimit,
  historyView,
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
        place: expect.stringMatching(/^(joint )?\d+(st|nd|rd|th)$/),
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
      ['Ashford', 'joint 2nd'],
      ['Old Weir', 'joint 2nd'],
      ['Barrow', '4th'],
      ['Cinder', '5th'],
    ]);
    const byWealth = guildsTable(document, 'wealth');
    expect(byWealth.measure).toBe('wealth');
    expect(byWealth.rows.map(({ name, place }) => [name, place])).toEqual([
      ['Ashford', 'joint 1st'],
      ['Old Weir', 'joint 1st'],
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
    const places = { 'The Lantern': '1st', Ashford: 'joint 2nd', 'Old Weir': 'joint 2nd', Barrow: '4th', Cinder: '5th' };

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
    expect(table.folded).toEqual([expect.objectContaining({ guildId: folded.id, name: folded.name, place: null, folded: `folded on Day ${dayOf(7)}` })]);
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
    expect(view?.upkeep).toBe(`${upkeep(guild, document.world, defaultConfig, content)} Wealth every ${defaultConfig.upkeepEveryDays} Days`);
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
    for (const row of view?.stats ?? []) expect(row.bearsOn).not.toBe('');
    expect(view?.traits.map((row) => row.name)).toEqual(guildmaster.traits.map((key) => content.traits[key]?.name));
    expect(view?.patrons.map((row) => row.regard)).toEqual(
      Object.values(document.world.patrons).map((patron) => regardBand(regardValue(guildmaster.regard, patron.id), defaultConfig)),
    );
    expect(view?.heroes.map((row) => row.name)).toEqual(guild.rosterIds.map((id) => document.world.heroes[id]?.name));
    const others = Object.values(document.world.guilds).filter((other) => other.id !== guild.id);
    expect(view?.guilds.map((row) => row.regard)).toEqual(
      others.map((other) => regardBand(guildmasterRegardForGuild(guildmaster, other.id, document.world), defaultConfig)),
    );
  });

  test('gives the descriptive Attributes written, after the sex and age, and none left empty (M9-S2)', () => {
    const document = createWorld(
      'world-views',
      { ...setup, guildmasterBirthplace: 'Harrowgate', guildmasterBiography: 'Once a quartermaster of the river levies.' },
      deps,
    ).document;

    expect(guildmasterView(document)?.attributes.map(([label]) => label)).toEqual(['Sex', 'Age', 'Birthplace', 'Biography']);
    expect(guildmasterView(document)?.attributes.slice(2)).toEqual([
      ['Birthplace', 'Harrowgate'],
      ['Biography', 'Once a quartermaster of the river levies.'],
    ]);
    // A Rival's are empty, so it shows none.
    expect(guildmasterView(document, rival(document).id)?.attributes.map(([label]) => label)).toEqual(['Sex', 'Age']);
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

    expect(rows[0]).toMatchObject({ patronId: cold.id, regard: 'hostile', guildmasterRegard: 'neutral', neutral: false });
    expect(rows[1]).toMatchObject({ patronId: liked.id, regard: 'neutral', guildmasterRegard: 'close', neutral: false });
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
      controller: `Rival (${other.controller.kind === 'rival' ? other.controller.disposition : ''})`,
      background: content.backgrounds[other.backgroundKey]?.name,
      fame: other.fame,
      wealth: other.wealth,
    });
    const own = guildPage(document, mine.id);
    expect(own).toMatchObject({ mine: true, controller: 'Yours' });
    expect(own?.roster.map((row) => row.fee)).toEqual(mine.rosterIds.map(() => null));
  });
});

describe('historyView', () => {
  test('pages the whole History newest first', () => {
    const document = played(30);
    const all = document.history.entries;

    const first = historyView(document, null, 0);
    const last = historyView(document, null, 9_999);

    expect(first.title).toBe('The whole History');
    expect(first).toMatchObject({ page: 0, entries: all.length, pages: Math.ceil(all.length / historyPageSize) });
    expect(first.lines).toHaveLength(historyPageSize);
    expect(first.lines[0]?.when).toBe(`Day ${dayOf(all.at(-1)?.turn ?? 0)}, ${['morning', 'afternoon', 'night'][(all.at(-1)?.turn ?? 0) % 3]}`);
    expect(last.page).toBe(first.pages - 1);
    expect(last.lines.at(-1)?.sentence).toBe('The world was made from seed world-views-played.');
  });

  test("pages a Guild's History newest first, and offers every Guild's", () => {
    const document = played(30);
    const guild = player(document);
    const mine = entriesFor(document.history, guild.id);

    const view = historyView(document, guild.id, 0);

    expect(view.title).toBe('The History of The Lantern');
    expect(view.entries).toBe(mine.length);
    expect(view.lines.map((line) => line.key)).toHaveLength(Math.min(historyPageSize, mine.length));
    expect(historyChoices(document).map((choice) => choice.guildId)).toEqual(Object.keys(document.world.guilds));
  });
});

describe('anyone the History names, found by name (DL-74)', () => {
  /** A game a few Turns in with a Hero dead, one retired and one gone from the world. */
  function gone() {
    const { state, ...heroes } = withTheGone(playedState(started('history-search'), { kind: 'advance', turns: 6 }));
    if (state.document === null) throw new Error('no game in hand');
    return { document: state.document, ...heroes };
  }

  test('finds a Hero on no Roster and not in the pool, dead, retired or gone from the world, by any part of their name', () => {
    const { document, dead, retired, gone: left } = gone();

    for (const [hero, what] of [
      [dead, 'Hero, dead'],
      [retired, 'Hero, retired'],
      [left, 'Hero, no longer in the world'],
    ] as const) {
      const part = hero.name.split(' ').at(-1)?.toUpperCase() ?? '';
      const found = findInHistory(document, `  ${part} `);
      expect(found.names).toContainEqual({ entityId: hero.id, name: hero.name, what });
    }
  });

  test('finds the Guilds, Guildmasters and Patrons too, each said for what it is', () => {
    const { document } = gone();
    const lantern = player(document);
    const patron = Object.values(document.world.patrons)[0];
    if (patron === undefined) throw new Error('no Patron');

    expect(findInHistory(document, 'lantern').names).toContainEqual({ entityId: lantern.id, name: 'The Lantern', what: 'Guild' });
    expect(findInHistory(document, 'ada vell').names).toContainEqual({
      entityId: lantern.guildmasterId,
      name: 'Ada Vell',
      what: 'Guildmaster of The Lantern',
    });
    expect(findInHistory(document, patron.name).names).toContainEqual({ entityId: patron.id, name: patron.name, what: 'Patron' });
    const onTheRoster = Object.values(document.world.heroes).find((hero) => lantern.rosterIds.includes(hero.id));
    if (onTheRoster === undefined) throw new Error('no Hero on the Roster');
    expect(findInHistory(document, onTheRoster.name).names).toContainEqual({
      entityId: onTheRoster.id,
      name: onTheRoster.name,
      what: 'Hero of The Lantern',
    });
  });

  test('names no Quest or Party, shows at most a page of names in order, and nothing for a blank or unknown name', () => {
    const { document } = gone();
    const many = findInHistory(document, 'e');

    expect(many.matched).toBeGreaterThan(historySearchLimit);
    expect(many.names).toHaveLength(historySearchLimit);
    expect(many.names.map((name) => name.name)).toEqual(many.names.map((name) => name.name).sort());
    expect(many.names.every((name) => /^(guild|hero|guildmaster|patron)-\d{6}$/.test(name.entityId))).toBe(true);
    const quest = document.history.entries.find((entry) => entry.type === 'quest.offered');
    const template = content.questTemplates[(quest?.payload as { templateKey: string } | undefined)?.templateKey ?? '']?.name ?? '';
    expect(template).not.toBe('');
    expect(findInHistory(document, template).names.filter((name) => !/^(guild|hero|guildmaster|patron)-/.test(name.entityId))).toEqual([]);
    expect(findInHistory(document, '   ')).toEqual({ names: [], matched: 0 });
    expect(findInHistory(document, 'no one is called this')).toEqual({ names: [], matched: 0 });
  });

  test("opens the page of a Hero the world still holds, dead ones included, and anyone else's entries newest first", () => {
    const { document, dead, gone: left } = gone();
    const patron = Object.values(document.world.patrons)[0];
    if (patron === undefined) throw new Error('no Patron');

    expect(historyView(document, dead.id, 0)).toMatchObject({ hero: dead.id, name: dead.name, title: `The History of ${dead.name}` });
    const leftView = historyView(document, left.id, 0);
    expect(leftView).toMatchObject({ hero: null, name: left.name, title: `The History of ${left.name}` });
    expect(leftView.entries).toBe(entriesFor(document.history, left.id).length);
    expect(leftView.entries).toBeGreaterThan(0);
    const patronView = historyView(document, patron.id, 0);
    expect(patronView).toMatchObject({ hero: null, name: patron.name, entries: entriesFor(document.history, patron.id).length });
    expect(patronView.lines).toHaveLength(Math.min(historyPageSize, patronView.entries));
    expect(historyView(document, 'hero-999999' as never, 0)).toMatchObject({ title: 'The whole History', name: null, hero: null });
  });
});
