import {
  addStack,
  ageOf,
  createWorld,
  dayOf,
  defaultConfig,
  guildmasterOf,
  holdings,
  marketStock,
  offerTransfer,
  playerGuild,
  sellPrice,
  signingFee,
  signingRefusal,
  unattachedHeroes,
  type Guild,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { content } from '../content';
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
        signs: refusal === null ? 'yes' : `needs Fame ${refusal.fameRequired}`,
      });
    }
    expect(view.rows[0]?.signs).toMatch(/^needs Fame \d+$/);
    expect(view.note).toBe('The Lantern has 0 Fame. A Hero who needs more will not sign for it until it has that much.');
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

    const offered = offerTransfer(document, { guildId: rival.id, heroId }, deps);
    if (!offered.ok) throw new Error(offered.rejection.reason);
    const [offer] = Object.values(offered.document.world.offers);
    if (offer === undefined) throw new Error('no offer');

    expect(offersView(offered.document)?.offers).toEqual([
      {
        offerId: offer.id,
        sentence: `${rival.name} offers ${offer.fee} Wealth for ${document.world.heroes[heroId]?.name}, until the night of Day ${dayOf(offer.expiresOnTurn)}.`,
      },
    ]);
  });
});
