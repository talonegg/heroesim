import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import { createWorld } from '../create.js';
import type { Guild, GuildId, StackId, WorldDocument } from '../document.js';
import { addStack, createItem, findStack, holdings } from '../items.js';
import { marketHolder, marketStock } from '../market.js';
import { playerGuild } from '../selectors.js';
import { serialise } from '../serialise.js';
import { buildDocument, testDeps, withValid } from '../world.test-support.js';
import { applyAction } from './action.js';
import type { SellRequest } from './sell.js';

// Selling to the Market (R31, DL-51). `sellRatio` and the Loot-only price are pinned; the
// test content prices a Healing draught at 30, a Whetstone at 25. The built document holds a stack
// for every kind of holder: 3 Healing draughts in the player's Guild's holding, 12 on the Market, 2
// with the Party, a Padded jack in a Hero's armour slot, and the Lantern of Stannary in their
// trinket slot.

const deps = testDeps({ rivalCount: 0, sellRatio: 0.5 });

function built(wealth = 100) {
  const { document, ids } = buildDocument();
  (document.world.guilds[ids.playerGuild] as Guild).wealth = wealth;
  return { document: withValid(document, deps), ids };
}

describe('sell', () => {
  test('credits sellRatio × buyPrice for each Item and moves them to the Market, joining its stack', () => {
    const { document, ids } = built();
    const guildId = ids.playerGuild;

    const result = applyAction(document, { kind: 'sell', guildId, stackId: ids.guildStack, quantity: 2 }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, deps);
    expect(world.guilds[guildId]?.wealth).toBe(100 + 2 * 15);
    expect(world.stacks[ids.guildStack]?.quantity).toBe(1);
    expect(world.stacks[ids.marketStack]?.quantity).toBe(14);
    expect(result.events).toEqual([
      expect.objectContaining({
        type: 'item.sold',
        participants: [guildId],
        milestone: false,
        payload: {
          guildId,
          definitionKey: 'healing-draught',
          quantity: 2,
          unitPrice: 15,
          proceeds: 30,
          itemIds: [],
          cause: 'sale',
        },
      }),
    ]);
  });

  test('rounds the price of each Item down, so that selling several is selling one several times', () => {
    const { document, ids } = built();
    const whetstones = addStack(document.world, 'whetstone', 3, { kind: 'guild', id: ids.playerGuild });

    const result = applyAction(document, { kind: 'sell', guildId: ids.playerGuild, stackId: whetstones, quantity: 3 }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, deps);
    expect(world.guilds[ids.playerGuild]?.wealth).toBe(100 + 3 * 12);
    // The whole stack moved where the Market had none, keeping its id (DL-48).
    expect(world.stacks[whetstones]).toMatchObject({ holder: { kind: 'market' }, quantity: 3 });
    expect(findStack(world, 'whetstone', { kind: 'guild', id: ids.playerGuild })).toBeUndefined();
  });

  test('sells a unique Item at its value × sellRatio, and the Market lists it', () => {
    const { document, ids } = built();
    const blade = createItem(document.world, 'barrow-kings-blade', { kind: 'guild', id: ids.playerGuild });

    const result = applyAction(document, { kind: 'sell', guildId: ids.playerGuild, itemId: blade }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, deps);
    expect(world.guilds[ids.playerGuild]?.wealth).toBe(100 + 300);
    expect(world.items[blade]?.holder).toEqual({ kind: 'market' });
    expect(result.events[0]).toMatchObject({
      participants: [ids.playerGuild, blade],
      payload: { quantity: 1, unitPrice: 300, proceeds: 300, itemIds: [blade], cause: 'sale' },
    });
    expect(marketStock(world, deps)).toContainEqual(
      expect.objectContaining({ definition: expect.objectContaining({ key: 'barrow-kings-blade' }), quantity: 1, price: 600 }),
    );
  });

  test.each<[string, (ids: ReturnType<typeof built>['ids'], document: WorldDocument) => SellRequest]>([
    ['guild-folded', (ids, document) => {
      (document.world.guilds[ids.playerGuild] as Guild).foldedOnTurn = 0;
      return { guildId: ids.playerGuild, stackId: ids.guildStack, quantity: 1 };
    }],
    ['not-held-by-guild', (ids) => ({ guildId: ids.playerGuild, stackId: ids.marketStack, quantity: 1 })],
    ['not-held-by-guild', (ids) => ({ guildId: ids.playerGuild, stackId: ids.partyStack, quantity: 1 })],
    ['not-held-by-guild', (ids) => ({ guildId: ids.rivalGuild, stackId: ids.guildStack, quantity: 1 })],
    ['not-held-by-guild', (ids) => ({ guildId: ids.playerGuild, stackId: 'stack-000999' as StackId, quantity: 1 })],
    ['not-held-by-guild', (ids) => ({ guildId: ids.rivalGuild, itemId: ids.item })],
    ['equipped', (ids) => ({ guildId: ids.playerGuild, stackId: ids.heroStack, quantity: 1 })],
    ['equipped', (ids) => ({ guildId: ids.playerGuild, itemId: ids.item })],
    ['insufficient-quantity', (ids) => ({ guildId: ids.playerGuild, stackId: ids.guildStack, quantity: 4 })],
  ])('refuses %s, changing nothing', (reason, arrange) => {
    const { document, ids } = built();
    const request = arrange(ids, document);
    const before = serialise(document);

    const result = applyAction(document, { kind: 'sell', ...request }, deps);

    expect(result.ok ? 'sold' : result.rejection.reason).toBe(reason);
    expect(serialise(document)).toBe(before);
    if (!result.ok && result.rejection.reason === 'equipped' && 'itemId' in request) {
      expect(result.rejection).toEqual({ action: 'sell', reason, id: ids.item, heroId: ids.partyHero, slot: 'trinket' });
    }
    if (!result.ok && result.rejection.reason === 'insufficient-quantity') {
      expect(result.rejection).toEqual({ action: 'sell', reason, stackId: ids.guildStack, quantity: 4, available: 3 });
    }
  });

  test('refuses an Item content does not define, which the Market cannot price (unknown-item)', () => {
    const { document, ids } = built();
    const lost = addStack(document.world, 'a-lost-item', 1, { kind: 'guild', id: ids.playerGuild });
    withValid(document, deps, { allowWarnings: true });

    const result = applyAction(document, { kind: 'sell', guildId: ids.playerGuild, stackId: lost, quantity: 1 }, deps);

    expect(result).toEqual({ ok: false, rejection: { action: 'sell', reason: 'unknown-item', definitionKey: 'a-lost-item' } });
  });

  test("refuses by where the Item is before what it is (DL-51 item 4's order): an unknown Item a Hero carries is equipped, another holder's not held", () => {
    const { document, ids } = built();
    const carried = createItem(document.world, 'a-lost-relic', { kind: 'hero', id: ids.partyHero, slot: 'weapon' });
    const listed = addStack(document.world, 'a-lost-item', 1, marketHolder);
    withValid(document, deps, { allowWarnings: true });

    expect(applyAction(document, { kind: 'sell', guildId: ids.playerGuild, itemId: carried }, deps)).toEqual({
      ok: false,
      rejection: { action: 'sell', reason: 'equipped', id: carried, heroId: ids.partyHero, slot: 'weapon' },
    });
    expect(applyAction(document, { kind: 'sell', guildId: ids.playerGuild, stackId: listed, quantity: 1 }, deps)).toEqual({
      ok: false,
      rejection: { action: 'sell', reason: 'not-held-by-guild', id: listed },
    });
  });

  test('throws on a programming error: a quantity that is not a whole number from 1, a Guild the world lacks', () => {
    const { document, ids } = built();

    expect(() => applyAction(document, { kind: 'sell', guildId: ids.playerGuild, stackId: ids.guildStack, quantity: 0 }, deps)).toThrow(RangeError);
    expect(() => applyAction(document, { kind: 'sell', guildId: 'guild-000099' as GuildId, itemId: ids.item }, deps)).toThrow(RangeError);
  });

  test('a sold stack is for sale until the next morning’s refresh; a sold unique Item past it, and costs its full price to buy back', () => {
    const { document: start } = createWorld('sold', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps);
    const guild = playerGuild(start.world) as Guild;
    guild.wealth = 1_000;
    const holder = { kind: 'guild', id: guild.id } as const;
    const kit = addStack(start.world, 'physicians-kit', 2, holder);
    const blade = createItem(start.world, 'barrow-kings-blade', holder);
    let document = withValid(start, deps);
    for (const request of [{ guildId: guild.id, stackId: kit, quantity: 2 }, { guildId: guild.id, itemId: blade }]) {
      const result = applyAction(document, { kind: 'sell', ...request }, deps);
      if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
      document = withValid(result.document, deps);
    }
    expect(document.world.guilds[guild.id]?.wealth).toBe(1_000 + 2 * 35 + 300);
    const listed = (at: WorldDocument) => marketStock(at.world, deps).map((listing) => listing.definition.key);
    expect(listed(document)).toEqual(expect.arrayContaining(['physicians-kit', 'barrow-kings-blade']));

    // The afternoon and the night, then the next morning's refresh.
    for (let turn = 0; turn < 3; turn += 1) document = withValid(advance(document, deps).document, deps);
    expect(findStack(document.world, 'physicians-kit', marketHolder)?.id).not.toBe(kit);
    expect(holdings(document.world, marketHolder).items.map((item) => item.id)).toEqual([blade]);

    const wealth = document.world.guilds[guild.id]?.wealth ?? 0;
    const bought = applyAction(document, { kind: 'buy', guildId: guild.id, definitionKey: 'barrow-kings-blade', quantity: 1 }, deps);
    if (!bought.ok) throw new Error(`Refused: ${bought.rejection.reason}`);
    expect(withValid(bought.document, deps).world.guilds[guild.id]?.wealth).toBe(wealth - 600);
  });
});
