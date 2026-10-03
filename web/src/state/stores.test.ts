import {
  addStack,
  availableHeroes,
  createItem,
  holdings,
  offeredQuests,
  partyFor,
  playerGuild,
  sellPrice,
  type Guild,
  type HeroId,
  type HolderQuery,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { changed, holding, played, started } from './game.test-support';
import { playDeps, type GameState } from './reducer';
import { storesView, type StoresFilter, type StoresRow } from './stores';

// The Stores (M9-F3, DL-111 item 5, DL-112 item 6, DL-113 item 2, DL-116): everything the Guild owns,
// wherever it is, read from the engine's `holdings` and `carriedGear`; read only.

function documentOf(state: GameState): WorldDocument {
  if (state.document === null) throw new Error('no game');
  return state.document;
}

function playerOf(document: WorldDocument): Guild {
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error("no player's Guild");
  return guild;
}

const all: StoresFilter = { kind: null, where: null };

/**
 * The Lantern with three whetstones, one of which goes with a Party it sends, so the stack is held in
 * two places; a Hero of that Party away with a padded jack; a Hero at home with a unique blade; and a
 * unique lantern in the Holding.
 */
function stocked(): { state: GameState; away: HeroId; home: HeroId } {
  let state = holding(started('stores'), 'whetstone', 3);
  const document = documentOf(state);
  const guild = playerOf(document);
  const available = availableHeroes(document.world, guild);
  const sent = offeredQuests(document.world).flatMap((quest) => {
    const heroIds = partyFor(document.world, guild, quest, available, playDeps(document));
    return heroIds === null || heroIds.length === guild.rosterIds.length ? [] : [{ quest, heroIds }];
  })[0];
  if (sent === undefined) throw new Error('no Quest a part of the Roster can staff');
  state = played(state, { kind: 'dispatch', questId: sent.quest.id, heroIds: sent.heroIds, consumables: [{ definitionKey: 'whetstone', quantity: 1 }] });
  if (state.rejection !== null) throw new Error(`dispatch refused: ${state.rejection.reason}`);
  const away = sent.heroIds[0];
  const home = guild.rosterIds.find((id) => !sent.heroIds.includes(id));
  if (away === undefined || home === undefined) throw new Error('expected a Hero away and one at home');
  state = changed(state, (next, player) => {
    addStack(next.world, 'padded-jack', 1, { kind: 'hero', id: away, slot: 'armour' });
    createItem(next.world, 'barrow-kings-blade', { kind: 'hero', id: home, slot: 'weapon' });
    createItem(next.world, 'lantern-of-stannary', { kind: 'guild', id: player.id });
  });
  return { state, away, home };
}

/** What `rows` hold, by definition, each with its quantity, in order. */
function held(rows: readonly StoresRow[]): { definitionKey: string; quantity: number }[] {
  return rows.map(({ definitionKey, quantity }) => ({ definitionKey, quantity }));
}

/** What the engine says `holder` has, stacks then unique Items, each with its quantity. */
function engineHas(document: WorldDocument, holder: HolderQuery): { definitionKey: string; quantity: number }[] {
  const { items, stacks } = holdings(document.world, holder);
  return [
    ...stacks.map(({ definitionKey, quantity }) => ({ definitionKey, quantity })),
    ...items.map(({ definitionKey }) => ({ definitionKey, quantity: 1 })),
  ];
}

describe('storesView (M9-F3)', () => {
  test("matches the engine's holdings for every holder: the Holding, each Hero on the Roster, and each Party away", () => {
    const { state } = stocked();
    const document = documentOf(state);
    const guild = playerOf(document);
    const view = storesView(document, all);
    if (view === null) throw new Error('no view');

    expect(held(view.rows.filter((row) => row.where === 'held'))).toEqual(engineHas(document, { kind: 'guild', id: guild.id }));
    for (const heroId of guild.rosterIds) {
      const sorted = (list: { definitionKey: string; quantity: number }[]) => [...list].sort((a, b) => a.definitionKey.localeCompare(b.definitionKey));
      expect(sorted(held(view.rows.filter((row) => row.heroId === heroId && row.where === 'carried')))).toEqual(
        sorted(engineHas(document, { kind: 'hero', id: heroId })),
      );
    }
    const parties = Object.values(document.world.parties).filter((party) => party.guildId === guild.id);
    expect(parties).toHaveLength(1);
    for (const party of parties) {
      expect(held(view.rows.filter((row) => row.partyId === party.id))).toEqual(engineHas(document, { kind: 'party', id: party.id }));
    }
    // Nothing else: every row is one of those holders'.
    const counted = (rows: readonly StoresRow[]) => rows.reduce((sum, row) => sum + row.quantity, 0);
    const engineTotal = [
      ...engineHas(document, { kind: 'guild', id: guild.id }),
      ...guild.rosterIds.flatMap((id) => engineHas(document, { kind: 'hero', id })),
      ...parties.flatMap((party) => engineHas(document, { kind: 'party', id: party.id })),
    ].reduce((sum, row) => sum + row.quantity, 0);
    expect(counted(view.rows)).toBe(engineTotal);
  });

  test('a stack held in two places is a row in each: two whetstones held, one with the Party', () => {
    const view = storesView(documentOf(stocked().state), all);
    const whetstones = view?.rows.filter((row) => row.definitionKey === 'whetstone');
    expect(whetstones?.map((row) => [row.where, row.quantity])).toEqual([
      ['held', 2],
      ['party', 1],
    ]);
    expect(whetstones?.[1]?.whereWords).toMatch(/^With the Party on .+$/);
    expect(whetstones?.map((row) => row.kind)).toEqual(['Consumable', 'Consumable']);
  });

  test('an Item on a Hero away names the Hero, away on the Quest, and a unique Item is a row of one', () => {
    const { state, away, home } = stocked();
    const document = documentOf(state);
    const view = storesView(document, all);
    const jack = view?.rows.find((row) => row.definitionKey === 'padded-jack');
    const awayName = document.world.heroes[away]?.name ?? '';
    expect(jack).toMatchObject({ where: 'carried', heroId: away, quantity: 1, sellsFor: null, kind: 'Armour Gear' });
    expect(jack?.whereWords).toMatch(new RegExp(`^Carried by ${awayName}, away on .+$`));
    expect(jack?.whereSegments[1]).toEqual({ kind: 'name', text: awayName, entityId: away, table: 'heroes' });

    const blade = view?.rows.find((row) => row.definitionKey === 'barrow-kings-blade');
    expect(blade).toMatchObject({ where: 'carried', heroId: home, quantity: 1, kind: 'Weapon Gear, Unique Item', whereWords: `Carried by ${document.world.heroes[home]?.name ?? ''}` });
    const lantern = view?.rows.find((row) => row.definitionKey === 'lantern-of-stannary');
    expect(lantern).toMatchObject({ where: 'held', quantity: 1, whereWords: 'Held', heroId: null, partyId: null, name: 'The Lantern of Stannary' });
    // A Unique Item shows its picture (DL-125 item 8); a common one does not.
    expect([blade?.unique, lantern?.unique, jack?.unique]).toEqual([true, true, false]);
  });

  test('gives what a held Item sells for, as the Market prices it, and nothing for one carried or away', () => {
    const document = documentOf(stocked().state);
    const deps = playDeps(document);
    for (const row of storesView(document, all)?.rows ?? []) {
      expect(row.sellsFor).toBe(row.where === 'held' ? sellPrice(row.definitionKey, deps) : null);
    }
  });

  test('filters by kind and by where, and names each kind and each place the Guild has Items, with how many rows', () => {
    const document = documentOf(stocked().state);
    const view = storesView(document, { kind: 'consumable', where: null });
    expect(view?.rows.every((row) => row.kindKey === 'consumable')).toBe(true);
    expect(storesView(document, { kind: null, where: 'carried' })?.rows.map((row) => row.definitionKey).sort()).toEqual(['barrow-kings-blade', 'padded-jack']);
    expect(storesView(document, { kind: 'consumable', where: 'party' })?.rows.map((row) => row.definitionKey)).toEqual(['whetstone']);
    expect(storesView(document, { kind: 'trinket', where: 'party' })?.rows).toEqual([]);

    expect(view?.kinds).toEqual([
      { key: 'weapon', label: 'Weapon', count: 1 },
      { key: 'armour', label: 'Armour', count: 1 },
      { key: 'trinket', label: 'Trinket', count: 1 },
      { key: 'consumable', label: 'Consumable', count: 2 },
    ]);
    expect(view?.wheres).toEqual([
      { key: 'held', label: 'Held', count: 2 },
      { key: 'carried', label: 'Carried', count: 2 },
      { key: 'party', label: 'With a Party', count: 1 },
    ]);
  });

  test('says in a sentence how much the Guild owns, and when it owns nothing', () => {
    expect(storesView(documentOf(stocked().state), all)?.summary).toBe('The Lantern owns 6 Items: 3 held, 2 carried by its Heroes and 1 with its Parties.');
    const bare = changed(started('stores-bare'), (document) => {
      document.world.items = {};
      document.world.stacks = {};
    });
    const view = storesView(documentOf(bare), all);
    expect(view?.rows).toEqual([]);
    expect(view?.summary).toBe('The Lantern owns nothing: no Item is held, carried by a Hero or with a Party.');
  });

  test("is null in a save with no player's Guild", () => {
    const none = changed(started('stores-none'), (_, player) => {
      player.controller = { kind: 'rival', disposition: 'steady' };
    });
    expect(storesView(documentOf(none), all)).toBeNull();
  });
});
