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
  rankingPlaces,
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
  guildsView,
  hallView,
  patronsView,
  rankingsView,
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

describe('guildsView', () => {
  test('lists every Guild with its controller, Guildmaster, Roster, Wealth, Fame and Upkeep, a folded one with its Day', () => {
    const document = structuredClone(newGame());
    const folded = rival(document);
    folded.foldedOnTurn = 7;

    const rows = guildsView(document);

    expect(rows.map((row) => row.guildId)).toEqual(Object.keys(document.world.guilds));
    for (const row of rows) {
      const guild = document.world.guilds[row.guildId] as Guild;
      expect(row).toEqual({
        guildId: guild.id,
        name: guild.name,
        mine: guild.controller.kind === 'player',
        controller: guild.controller.kind === 'player' ? 'Yours' : `Rival (${guild.controller.disposition})`,
        guildmaster: guildmasterOf(guild, document.world)?.name,
        background: content.backgrounds[guild.backgroundKey]?.name,
        roster: guild.rosterIds.length,
        wealth: guild.wealth,
        fame: guild.fame,
        upkeep: upkeep(guild, document.world, defaultConfig, content),
        folded: guild.id === folded.id ? `folded on Day ${dayOf(7)}` : null,
      });
    }
  });
});

describe('rankingsView', () => {
  test("orders the Guilds in play as the engine's rankings do, by Fame or by Wealth, marking the player's", () => {
    const document = played(12);

    for (const by of ['fame', 'wealth'] as const) {
      const rows = rankingsView(document, by);
      const ranked = rankings(document.world, by);
      expect(rows.map(({ guildId, value }) => ({ guildId, value }))).toEqual(ranked.map(({ guildId, value }) => ({ guildId, value })));
      const places = rankingPlaces(document.world, by);
      expect(rows.map((row) => row.place)).toEqual(
        places.map(({ place, joint }) => `${joint ? 'joint ' : ''}${place}${['th', 'st', 'nd', 'rd'][place] ?? 'th'}`),
      );
      expect(rows.filter((row) => row.mine).map((row) => row.guildId)).toEqual([player(document).id]);
    }
  });

  test('a new game, every Guild at Fame 0, has joint 1st on each row (v1.0.1-S4, DL-95)', () => {
    const document = newGame();

    const rows = rankingsView(document, 'fame');

    expect(rows.map((row) => row.value)).toEqual([0, 0, 0, 0, 0]);
    expect(rows.map((row) => row.place)).toEqual(['joint 1st', 'joint 1st', 'joint 1st', 'joint 1st', 'joint 1st']);
  });

  test('Guilds level on the measure share a place, and the next place counts every Guild ahead of it (DL-95)', () => {
    const document = structuredClone(newGame());
    const guilds = Object.values(document.world.guilds);
    [9, 4, 4, 1, 0].forEach((fame, index) => Object.assign(guilds[index] ?? {}, { fame }));
    Object.assign(guilds[4] ?? {}, { foldedOnTurn: 3 });

    const rows = rankingsView(document, 'fame');

    expect(rows.map(({ place, value }) => [place, value])).toEqual([
      ['1st', 9],
      ['joint 2nd', 4],
      ['joint 2nd', 4],
      ['4th', 1],
    ]);
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

  test("is another Guild's Guildmaster when named", () => {
    const document = newGame();
    const other = rival(document);

    expect(guildmasterView(document, other.id)?.name).toBe(guildmasterOf(other, document.world)?.name);
    expect(guildmasterView(document, other.id)?.guildName).toBe(other.name);
  });
});

describe('patronsView', () => {
  test("gives each Patron's Sphere and Regard for the player's Guild as a band", () => {
    const document = played(9);
    const guild = player(document);

    expect(patronsView(document)).toEqual(
      Object.values(document.world.patrons).map((patron) => ({
        patronId: patron.id,
        name: patron.name,
        sphere: content.spheres[patron.sphereKey]?.name,
        regard: regardBand(patronRegardFor(patron, guild.id), defaultConfig),
      })),
    );
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
});
