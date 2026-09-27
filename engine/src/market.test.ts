import { afterEach, describe, expect, test, vi } from 'vitest';
import { buy } from './actions/buy.js';
import { dispatch } from './actions/dispatch.js';
import { advance } from './advance.js';
import type { EngineDeps } from './config.js';
import { defaultConfig } from './config.js';
import { availableHeroes, partyFor } from './controllers/rival.js';
import { createWorld } from './create.js';
import type { Guild, GuildId, ItemId, StackId, WorldDocument } from './document.js';
import type { EngineEvent, ItemSold } from './events.js';
import { addStack, createItem, holdings } from './items.js';
import { marketHolder, marketPrice, marketStock, sellPrice } from './market.js';
import { phases } from './pipeline.js';
import { playerGuild } from './selectors.js';
import { nightOf } from './time.js';
import { testContent, testDeps, withValid } from './world.test-support.js';

// M5-S4: the Market Engine's prices, what the Market lists, a folding Guild's Items (pre-M0 review
// D6), and the Rivals, who ignored the Market in M5 (DL-51) and buy gear there from M6-S4 (DL-58).
// Config values relied on are pinned.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const pinned = { sellRatio: 0.5, lootOnlyPrice: 600, marketSize: 10, marketStackMin: 1, marketStackMax: 5 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('prices', () => {
  const deps = testDeps(pinned);

  test('the Market asks buyPrice, or lootOnlyPrice for an Item found only as Loot, and cannot price what content lacks', () => {
    expect(marketPrice('healing-draught', deps)).toBe(30);
    expect(marketPrice('masterwork-blade', deps)).toBe(300);
    expect(marketPrice('barrow-kings-blade', deps)).toBe(600);
    expect(marketPrice('a-lost-item', deps)).toBeNull();
  });

  test('the Market pays sellRatio of that, rounded down', () => {
    expect(sellPrice('healing-draught', deps)).toBe(15);
    expect(sellPrice('whetstone', deps)).toBe(12);
    expect(sellPrice('barrow-kings-blade', deps)).toBe(300);
    expect(sellPrice('a-lost-item', deps)).toBeNull();
  });

  test('under the defaults every Item sells for less than it costs (R31)', () => {
    const defaults = { config: defaultConfig, content: testContent };
    for (const key of Object.keys(testContent.items)) {
      expect(sellPrice(key, defaults), key).toBeLessThan(marketPrice(key, defaults) as number);
    }
  });

  test('marketStock lists each definition the Market holds, in key order, with how many and the price', () => {
    const { world } = createWorld('stock', setup, deps).document;
    for (const stack of holdings(world, marketHolder).stacks) delete world.stacks[stack.id];
    addStack(world, 'padded-jack', 2, marketHolder);
    addStack(world, 'a-lost-item', 4, marketHolder);
    createItem(world, 'mantle-of-the-fells', marketHolder);
    createItem(world, 'barrow-kings-blade', marketHolder);
    createItem(world, 'barrow-kings-blade', marketHolder);

    expect(marketStock(world, deps).map(({ definition, quantity, price }) => [definition.key, quantity, price])).toEqual([
      ['barrow-kings-blade', 2, 600],
      ['mantle-of-the-fells', 1, 600],
      ['padded-jack', 2, 40],
    ]);
  });
});

/** Stills every Rival's controller: these tests arrange a Rival's holdings and watch its fold. */
function stillRivalControllers() {
  const rivalControllers = phases.find((phase) => phase.name === 'rivalControllers');
  if (rivalControllers === undefined) throw new Error('No rivalControllers phase');
  return vi.spyOn(rivalControllers, 'run').mockReturnValue([]);
}

/** Plays Turns until `turn`, checking every document, returning the last and every event. */
function playTo(document: WorldDocument, turn: number, deps: EngineDeps): { document: WorldDocument; events: EngineEvent[] } {
  let current = document;
  const events: EngineEvent[] = [];
  while (current.world.turn < turn) {
    const result = advance(current, deps);
    current = withValid(result.document, deps);
    events.push(...result.events);
  }
  return { document: current, events };
}

describe("a folding Guild's Items go to the Market (pre-M0 review D6)", () => {
  const deps = testDeps({ ...pinned, rivalCount: 1, bankruptcyGraceDays: 0 });

  interface Arranged {
    document: WorldDocument;
    rivalId: GuildId;
    /** The Rival's unique Items: one in its holding, one in a Roster Hero's weapon slot. */
    uniques: ItemId[];
    /** Its stacks: in its holding, in a Hero's armour slot, and with a Party in flight. */
    stacks: StackId[];
  }

  /** A world whose one Rival, bankrupt from the first night, holds Items everywhere a Guild can. */
  function arranged(seed: string, withItems: boolean): Arranged {
    const { document: start } = createWorld(seed, setup, deps);
    const rival = Object.values(start.world.guilds).find((guild) => guild.controller.kind === 'rival') as Guild;
    const quest = start.world.quests[start.world.board[0] as string as keyof typeof start.world.quests];
    const heroIds = quest === undefined ? null : partyFor(quest, availableHeroes(start.world, rival), deps.content);
    if (quest === undefined || heroIds === null) throw new Error('The Rival cannot staff the first Quest');
    const sent = dispatch(start, { guildId: rival.id, questId: quest.id, heroIds }, deps);
    if (!sent.ok) throw new Error(`Refused: ${sent.rejection.reason}`);
    const { document } = sent;
    const { world } = document;
    const bankrupt = world.guilds[rival.id] as Guild;
    bankrupt.wealth = deps.config.bankruptcyFloor - 1;
    const party = Object.values(world.parties).find((row) => row.guildId === rival.id);
    const [armed, armoured] = bankrupt.rosterIds.filter((id) => !heroIds.includes(id)).concat(heroIds);
    if (party === undefined || armed === undefined || armoured === undefined) throw new Error('No Party or Heroes');
    if (!withItems) return { document: withValid(document, deps), rivalId: rival.id, uniques: [], stacks: [] };

    const guild = { kind: 'guild', id: rival.id } as const;
    const uniques = [
      createItem(world, 'lantern-of-stannary', guild),
      createItem(world, 'barrow-kings-blade', { kind: 'hero', id: armed, slot: 'weapon' }),
    ];
    const stacks = [
      addStack(world, 'healing-draught', 3, guild),
      addStack(world, 'padded-jack', 1, { kind: 'hero', id: armoured, slot: 'armour' }),
      addStack(world, 'whetstone', 2, { kind: 'party', id: party.id }),
    ];
    return { document: withValid(document, deps), rivalId: rival.id, uniques, stacks };
  }

  test('its unique Items are sold to the Market at sell price with item.sold, its stacks discarded, and its Heroes leave bare', () => {
    stillRivalControllers();
    const { document, rivalId, uniques, stacks } = arranged('fold', true);
    const { document: bare } = arranged('fold', false);

    const { document: folded, events } = playTo(document, nightOf(0), deps);
    const { document: foldedBare } = playTo(bare, nightOf(0), deps);

    const rival = folded.world.guilds[rivalId] as Guild;
    expect(rival.foldedOnTurn).toBe(nightOf(0));
    const sold = events.filter((event): event is ItemSold => event.type === 'item.sold');
    expect(sold.map((event) => [event.participants, event.payload])).toEqual(
      uniques.map((itemId) => [
        [rivalId, itemId],
        {
          guildId: rivalId,
          definitionKey: folded.world.items[itemId]?.definitionKey,
          quantity: 1,
          unitPrice: 300,
          proceeds: 300,
          itemIds: [itemId],
          cause: 'fold',
        },
      ]),
    );
    // The fold's third step (DL-54): after its Roster's gear is back, before its Heroes leave and it folds.
    const types = events.map((event) => event.type);
    expect(types.indexOf('item.sold')).toBeGreaterThan(types.lastIndexOf('item.returned'));
    expect(types.lastIndexOf('item.sold')).toBeLessThan(types.indexOf('hero.left-guild'));
    expect(types.indexOf('hero.left-guild')).toBeLessThan(types.indexOf('guild.folded'));
    // Credited to the folded Guild: a record no rule reads again (DL-28).
    expect(rival.wealth).toBe((foldedBare.world.guilds[rivalId] as Guild).wealth + 600);

    for (const itemId of uniques) expect(folded.world.items[itemId]?.holder).toEqual({ kind: 'market' });
    for (const stackId of stacks) expect(folded.world.stacks[stackId]).toBeUndefined();
    for (const hero of Object.values(folded.world.heroes)) {
      if (hero.guildId === null) expect(holdings(folded.world, { kind: 'hero', id: hero.id })).toEqual({ items: [], stacks: [] });
    }
    expect(holdings(folded.world, { kind: 'guild', id: rivalId })).toEqual({ items: [], stacks: [] });
  });

  test("the next morning's refresh keeps them listed, and the player buys one at its Market price", () => {
    stillRivalControllers();
    const { document, uniques } = arranged('fold-buy', true);
    const { document: morning } = playTo(document, nightOf(0) + 1, deps);
    const player = playerGuild(morning.world) as Guild;
    player.wealth = 1_000;

    expect(holdings(morning.world, marketHolder).items.map((item) => item.id)).toEqual(uniques);
    const result = buy(morning, { guildId: player.id, definitionKey: 'lantern-of-stannary', quantity: 1 }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, deps);
    expect(world.items[uniques[0] as ItemId]?.holder).toEqual({ kind: 'guild', id: player.id });
    expect(world.guilds[player.id]?.wealth).toBe(400);
  });
});

// M5-S4's test that the Rivals ignore the Market — "Rivals' Wealth is unaffected by the Market: steady
// neither buys nor sells, whatever the Market holds" (DL-51 item 8, DL-54 item 3) — is retired by
// M6-S4, whose Rivals buy gear there, armour first, by their Disposition's `gearThreshold` (DL-58).
// What stands of it: a Rival buys only what the Market has, sells nothing but by a fold, and with no
// Market buys nothing. controllers/rival.test.ts has the rule; controllers/rivals-build-and-buy.test.ts
// the twenty years.
describe('the Rivals and the Market (M6-S4)', () => {
  test('Rivals buy gear from the Market and sell none; with an empty Market they buy nothing', () => {
    const withMarket = testDeps({ ...pinned, rivalCount: 4 });
    const noMarket = testDeps({ ...pinned, rivalCount: 4, marketSize: 0 });
    const play = (deps: EngineDeps): WorldDocument => {
      const { document } = createWorld('rivals-and-the-market', setup, deps);
      (playerGuild(document.world) as Guild).wealth = 100_000; // the player buys nothing
      return playTo(withValid(document, deps), nightOf(20), deps).document;
    };
    /** The History's `type` entries whose Guild is a Rival. */
    const tradesBy = <Type extends 'item.bought' | 'item.sold'>(document: WorldDocument, type: Type) =>
      document.history.entries.filter(
        (entry): entry is Extract<EngineEvent, { type: Type }> =>
          entry.type === type && document.world.guilds[(entry.payload as { guildId: GuildId }).guildId]?.controller.kind === 'rival',
      );

    const shopped = play(withMarket);
    const bought = tradesBy(shopped, 'item.bought');
    expect(bought.length).toBeGreaterThan(0);
    for (const entry of bought) {
      const definition = testContent.items[entry.payload.definitionKey];
      expect(definition?.kind, entry.payload.definitionKey).toBe('gear');
    }
    expect(new Set(bought.map((entry) => entry.payload.guildId)).size).toBeGreaterThan(1);
    expect(tradesBy(shopped, 'item.sold').filter((entry) => entry.payload.cause === 'sale')).toEqual([]);
    expect(shopped.history.entries.filter((entry) => entry.type === 'item.bought')).toEqual(bought);

    const bare = play(noMarket);
    expect(bare.history.entries.filter((entry) => entry.type === 'item.bought')).toEqual([]);
  });
});
