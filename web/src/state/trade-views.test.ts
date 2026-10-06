import {
  addStack,
  ageOf,
  applyAction,
  createWorld,
  defaultConfig,
  guildmasterOf,
  holdings,
  marketStock,
  playerGuild,
  sellPrice,
  signingFee,
  signingRefusal,
  unattachedHeroes,
  type Guild,
  type WorldDocument,
} from '@heroesim/engine';
import { createItem } from '@heroesim/engine/testing';
import { describe, expect, test } from 'vitest';
import { nightOfTurn } from '@heroesim/words';
import { content } from '../content';
import { faceted } from './facets';
import { defaultHeroOrder } from './selectors';
import { marketView, offersView, poolView } from './trade-views';

// The Market, the Unattached pool and the Transfer Offers (M7-S3 part 2, DL-73): each number beside
// the engine selector it comes from.

const deps = { config: defaultConfig, content };
const setup = { guildName: 'The Lantern', guildmasterName: 'Ada Vell', createdAt: '2026-09-27T09:00:00.000Z' };

function newGame(seed = 'trade-views'): WorldDocument {
  return createWorld(seed, setup, deps).document;
}

function player(document: WorldDocument): Guild {
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error('no player');
  return guild;
}

describe('marketView', () => {
  test("lists what the Market has for sale at the engine's prices, and what the Guild holds with what each sells for", () => {
    const document = structuredClone(newGame());
    const guild = player(document);
    addStack(document.world, 'whetstone', 3, { kind: 'guild', id: guild.id });
    addStack(document.world, 'arming-sword', 1, { kind: 'guild', id: guild.id });
    const [hero] = guild.rosterIds;
    if (hero === undefined) throw new Error('no Hero');
    addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: hero, slot: 'armour' });

    const view = marketView(document);
    const stock = marketStock(document.world, deps);

    expect(view.forSale.map(({ definitionKey, quantity, price }) => ({ definitionKey, quantity, price }))).toEqual(
      stock.map(({ definition, quantity, price }) => ({ definitionKey: definition.key, quantity, price })),
    );
    expect(view.totalForSale).toBe(stock.reduce((sum, listing) => sum + listing.quantity, 0));
    for (const row of view.forSale) expect(row.does).not.toBe('');
    expect(view.wealth).toBe(guild.wealth);
    const { stacks } = holdings(document.world, { kind: 'guild', id: guild.id });
    expect(view.held.map(({ name, held, sellsFor, sale }) => ({ name, held, sellsFor, sale }))).toEqual(
      stacks.map((stack) => ({
        name: content.items[stack.definitionKey]?.name,
        held: stack.quantity,
        sellsFor: sellPrice(stack.definitionKey, deps),
        sale: { stackId: stack.id },
      })),
    );
    // A Hero's gear is not the Guild's to sell: it is not listed.
    expect(view.held.map((row) => row.name)).not.toContain(content.items['padded-jack']?.name);
  });
});

describe("the Market as tables (M9-S6, DL-106; the review's B3)", () => {
  test('names each kind for sale, the gear slots in their order then consumables, with how many kinds of Item each has', () => {
    const view = marketView(newGame());

    expect(view.kinds.map((kind) => kind.key)).toEqual(['weapon', 'armour', 'trinket', 'consumable'].filter((key) => view.kinds.some((kind) => kind.key === key)));
    expect(view.kinds.map((kind) => kind.label)).toEqual(view.kinds.map((kind) => ({ weapon: 'Weapon', armour: 'Armour', trinket: 'Trinket', consumable: 'Consumable' })[kind.key]));
    expect(view.kinds.reduce((sum, kind) => sum + kind.count, 0)).toBe(view.forSale.length);
    expect(view.kinds.length).toBeGreaterThan(1);
  });

  test('filters by kind, one or several, for display; each kind its count of everything for sale (DL-206 items 26 to 29)', () => {
    const view = marketView(newGame());
    const kindOf = view.facets.kind;
    expect(kindOf.label).toBe('Show for sale');
    expect(kindOf.options.map(({ key, label }) => ({ key, label }))).toEqual(view.kinds.map(({ key, label }) => ({ key, label })));

    for (const kind of view.kinds) {
      const shown = faceted(view.forSale, view.facets, { kind: [kind.key] });
      expect(shown.rows).toHaveLength(kind.count);
      expect(shown.rows.every((row) => row.kindKey === kind.key)).toBe(true);
      expect(shown.rows.every((row) => (kind.key === 'consumable' ? /^Consumable$/ : new RegExp(`^${kind.label} Gear$`)).test(row.kind))).toBe(true);
      // The one filter: its counts are everything for sale's, whatever is chosen.
      expect(shown.facets.kind.options.map((option) => option.count)).toEqual(view.kinds.map((each) => each.count));
    }
    const [first, second] = view.kinds;
    if (first === undefined || second === undefined) throw new Error('two kinds wanted');
    expect(faceted(view.forSale, view.facets, { kind: [first.key, second.key] }).rows).toHaveLength(first.count + second.count);
    expect(faceted(view.forSale, view.facets, {}).rows).toEqual(view.forSale);
  });

  test("gives what the Guild holds its kind and what it does, in the Market's words, beside what each sells for", () => {
    const document = structuredClone(newGame());
    const guild = player(document);
    addStack(document.world, 'whetstone', 3, { kind: 'guild', id: guild.id });
    addStack(document.world, 'arming-sword', 1, { kind: 'guild', id: guild.id });

    const held = marketView(document).held.map(({ name, kind, does, held: count }) => ({ name, kind, does, count }));

    expect(held).toEqual([
      { name: 'Whetstone', kind: 'Consumable', does: '+3 on a combat Encounter', count: 3 },
      { name: 'Arming sword', kind: 'Weapon Gear', does: 'Weaponry +2, Strength +1', count: 1 },
    ]);
  });

  test('says a kind and an effect as a cell does, beginning with a capital: a Unique Item is named so (DL-125 item 9)', () => {
    const document = structuredClone(newGame());
    const guild = player(document);
    addStack(document.world, 'healing-draught', 1, { kind: 'guild', id: guild.id });
    createItem(document.world, 'barrow-kings-blade', { kind: 'guild', id: guild.id });

    const held = marketView(document).held.map(({ name, kind, does }) => ({ name, kind, does }));

    expect(held).toEqual([
      { name: 'Healing draught', kind: 'Consumable', does: 'An Injury on the Quest heals 5 Days sooner' },
      { name: "The Barrow King's blade", kind: 'Weapon Gear, Unique Item', does: 'Weaponry +4, Strength +2, Courage +1' },
    ]);
  });

  test("gives each held Item's content key, and whether it is a Unique Item, whose picture Sell shows (DL-125 item 8)", () => {
    const document = structuredClone(newGame());
    const guild = player(document);
    addStack(document.world, 'healing-draught', 1, { kind: 'guild', id: guild.id });
    createItem(document.world, 'barrow-kings-blade', { kind: 'guild', id: guild.id });

    expect(marketView(document).held.map(({ definitionKey, unique }) => ({ definitionKey, unique }))).toEqual([
      { definitionKey: 'healing-draught', unique: false },
      { definitionKey: 'barrow-kings-blade', unique: true },
    ]);
  });
});

describe('poolView', () => {
  test('lists the Unattached pool with the signing fee the player pays, and whether each would sign for its Fame', () => {
    const document = structuredClone(newGame());
    const guild = player(document);
    guild.fame = 0;
    const [first] = unattachedHeroes(document.world);
    if (first === undefined) throw new Error('an empty pool');
    first.level = 4;
    const buyer = guildmasterOf(guild, document.world);

    const view = poolView(document);

    expect(view.rows.map((row) => row.heroId)).toEqual(unattachedHeroes(document.world).map((hero) => hero.id));
    for (const row of view.rows) {
      const hero = document.world.heroes[row.heroId];
      if (hero === undefined) throw new Error('no Hero');
      const refusal = signingRefusal(guild, hero, defaultConfig);
      expect(row).toMatchObject({
        fee: signingFee(hero, deps, buyer),
        age: ageOf(hero, document.world.turn, defaultConfig),
        signs: refusal === null ? 'Yes' : `Needs Fame ${refusal.fameRequired}`,
      });
    }
    expect(view.rows[0]?.signs).toMatch(/^Needs Fame \d+$/);
    expect(view.note).toBe('The Lantern has 0 Fame. A Hero who needs more will not sign for it until it has that much.');
  });
});

describe("the Unattached pool by Class (v1.1.6-S14, DL-186 item 24)", () => {
  test("lists the Warriors, Rogues, Mages and Healers in that order, not A to Z, ties in the Roster's default order", () => {
    const document = newGame();
    const heroes = unattachedHeroes(document.world);
    // Each Class in the pool, at two Levels each, so that the ties are real.
    heroes.forEach((hero, index) => {
      hero.classKey = ['healer', 'mage', 'rogue', 'warrior'][index % 4] as string;
      hero.level = 1 + (Math.floor(index / 4) % 2);
    });

    const rows = poolView(document, 'class').rows;
    const order = defaultHeroOrder(document);

    expect(new Set(rows.map((row) => row.className))).toEqual(new Set(['Warrior', 'Rogue', 'Mage', 'Healer']));
    expect(rows.map((row) => row.heroId)).toEqual([...heroes].sort(order).map((hero) => hero.id));
    expect([...new Set(rows.map((row) => row.className))]).toEqual(['Warrior', 'Rogue', 'Mage', 'Healer']);
    for (let index = 1; index < rows.length; index += 1) {
      const [before, after] = [rows[index - 1], rows[index]];
      if (before?.className === after?.className) expect(before?.level ?? 0).toBeGreaterThanOrEqual(after?.level ?? 0);
    }
  });
});

describe("the Unattached pool as rows (M9-S6, DL-106; the review's B8)", () => {
  test("orders the pool by Class in the content's declared order, or by fee, lowest first, ties as the pool lists them: display only", () => {
    const document = newGame();
    const listed = poolView(document).rows;
    const at = (heroId: string): number => listed.findIndex((row) => row.heroId === heroId);

    const byFee = poolView(document, 'fee').rows;

    expect(listed.length).toBeGreaterThan(3);
    expect(new Set(listed.map((row) => row.className)).size).toBeGreaterThan(1);
    for (let index = 1; index < byFee.length; index += 1) {
      const [before, after] = [byFee[index - 1], byFee[index]];
      if (before === undefined || after === undefined) throw new Error('no row');
      expect(before.fee).toBeLessThanOrEqual(after.fee);
      if (before.fee === after.fee) expect(at(before.heroId)).toBeLessThan(at(after.heroId));
    }
    expect(poolView(document, 'listed').rows).toEqual(listed);
    // The world's pool is untouched.
    expect(unattachedHeroes(document.world).map((hero) => hero.id)).toEqual(listed.map((row) => row.heroId));
  });

  test('says whether each Hero would sign for the Guild now, beside the pool’s own words, for the row to be set back', () => {
    const document = structuredClone(newGame());
    player(document).fame = 0;
    const [first, second] = unattachedHeroes(document.world);
    if (first === undefined || second === undefined) throw new Error('an empty pool');
    first.level = 4;
    second.level = 1;

    const rows = poolView(document).rows;

    expect(rows.find((row) => row.heroId === first.id)).toMatchObject({ willSign: false, signs: expect.stringMatching(/^Needs Fame \d+$/) });
    expect(rows.find((row) => row.heroId === second.id)).toMatchObject({ willSign: true, signs: 'Yes' });
  });
});

describe('offersView', () => {
  test("lists each Transfer Offer standing for the player's Heroes: who offers what for whom, and until when", () => {
    const document = newGame();
    const guild = player(document);
    const rival = Object.values(document.world.guilds).find((each) => each.id !== guild.id);
    const heroId = guild.rosterIds[0];
    if (rival === undefined || heroId === undefined) throw new Error('no Rival or Hero');
    expect(offersView(document)).toEqual({ guildName: 'The Lantern', offers: [] });

    const offered = applyAction(document, { kind: 'offerTransfer', guildId: rival.id, heroId }, deps);
    if (!offered.ok) throw new Error(offered.rejection.reason);
    const [offer] = Object.values(offered.document.world.offers);
    if (offer === undefined) throw new Error('no offer');

    const heroName = document.world.heroes[heroId]?.name;
    expect(offersView(offered.document)?.offers).toEqual([
      {
        offerId: offer.id,
        sentence: `${rival.name} offers ${offer.fee} Wealth for ${heroName}, until ${nightOfTurn(offer.expiresOnTurn, offered.document.meta.config)}.`,
        guildName: rival.name,
        heroName,
        fee: offer.fee,
        // What Accept asks before it lets the Hero go (M9-S6, the review's E4).
        confirm:
          `Accepting sends ${heroName} to ${rival.name} for ${offer.fee} Wealth. Their Gear stays with your Guild, and the Heroes ` +
          'left behind who held them in high Regard lose Morale.',
      },
    ]);
  });
});
