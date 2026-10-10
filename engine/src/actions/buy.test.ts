import { describe, expect, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import type { ContentSet } from '../content-types.js';
import { createWorld } from '../create.js';
import type { Guild, GuildId, ItemId, WorldDocument } from '../document.js';
import { count } from '../history.js';
import { addStack, createItem, findStack, holdings } from '../items.js';
import { marketHolder } from '../market.js';
import { playerGuild } from '../selectors.js';
import { serialise } from '../serialise.js';
import { deepFreeze, testContent, testDeps, withValid } from '../world.test-support.js';
import { applyAction } from './action.js';

// Buying from the Market (R31, DL-51). Each test arranges the Market by hand, so that no
// test leans on what the refresh drew; prices are the test content's (a Healing draught 30, a Padded
// jack 40) and the Loot-only price is pinned. No Rival acts.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const deps = testDeps({ rivalCount: 0, lootOnlyPrice: 600, sellRatio: 0.5 });

interface Scene {
  document: WorldDocument;
  guildId: GuildId;
  /** A unique Item listed on the Market, as a folded Guild's is. */
  blade: ItemId;
}

/**
 * A new world whose player's Guild holds `wealth`, and whose Market holds 5 Healing draughts, 2
 * Padded jacks and a Barrow King's blade, and nothing else.
 */
function scene(wealth = 1_000, with_: EngineDeps = deps): Scene {
  const { document } = createWorld('buy', setup, with_);
  const { world } = document;
  const guild = playerGuild(world) as Guild;
  guild.wealth = wealth;
  for (const stack of holdings(world, marketHolder).stacks) delete world.stacks[stack.id];
  addStack(world, 'healing-draught', 5, marketHolder);
  addStack(world, 'padded-jack', 2, marketHolder);
  const blade = createItem(world, 'barrow-kings-blade', marketHolder);
  return { document: withValid(document, with_), guildId: guild.id, blade };
}

const guildHolder = (id: GuildId) => ({ kind: 'guild', id }) as const;

describe('buy', () => {
  test('deducts buyPrice × quantity and moves that many from the Market’s stack to the Guild’s', () => {
    const { document, guildId } = scene();

    const result = applyAction(document, { kind: 'buy', guildId, definitionKey: 'healing-draught', quantity: 3 }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, deps);
    expect(world.guilds[guildId]?.wealth).toBe(1_000 - 3 * 30);
    expect(findStack(world, 'healing-draught', marketHolder)?.quantity).toBe(2);
    expect(findStack(world, 'healing-draught', guildHolder(guildId))?.quantity).toBe(3);
    expect(result.events).toEqual([
      {
        turn: 0,
        type: 'item.bought',
        participants: [guildId],
        labels: { [guildId]: 'The Test' },
        milestone: false,
        payload: { guildId, definitionKey: 'healing-draught', quantity: 3, unitPrice: 30, cost: 90, itemIds: [] },
      },
    ]);
    expect(count(result.document.history, 'item.bought')).toBe(1);
  });

  test('buying the whole stack takes it off the Market, and a second purchase joins the Guild’s stack', () => {
    const { guildId, document: start } = scene();
    let document = start;

    for (const quantity of [1, 1]) {
      const result = applyAction(document, { kind: 'buy', guildId, definitionKey: 'padded-jack', quantity }, deps);
      if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
      document = withValid(result.document, deps);
    }

    const { world } = document;
    expect(findStack(world, 'padded-jack', marketHolder)).toBeUndefined();
    expect(holdings(world, guildHolder(guildId)).stacks).toEqual([
      expect.objectContaining({ definitionKey: 'padded-jack', quantity: 2 }),
    ]);
    expect(world.guilds[guildId]?.wealth).toBe(1_000 - 2 * 40);
  });

  test('buys a unique Item listed on the Market at its Market price: lootOnlyPrice for one found only as Loot', () => {
    const { document, guildId, blade } = scene();

    const result = applyAction(document, { kind: 'buy', guildId, definitionKey: 'barrow-kings-blade', quantity: 1 }, deps);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, deps);
    expect(world.items[blade]?.holder).toEqual(guildHolder(guildId));
    expect(world.guilds[guildId]?.wealth).toBe(1_000 - 600);
    expect(result.events[0]).toMatchObject({
      participants: [guildId, blade],
      payload: { definitionKey: 'barrow-kings-blade', quantity: 1, unitPrice: 600, cost: 600, itemIds: [blade] },
    });
  });

  test('a unique definition with a price is bought at that price, the lowest id first', () => {
    const priced: ContentSet = deepFreeze({
      ...testContent,
      items: { ...testContent.items, 'barrow-kings-blade': { ...testContent.items['barrow-kings-blade'], buyPrice: 450 } },
    } as ContentSet);
    const with_ = testDeps(deps.config, priced);
    const { document, guildId, blade } = scene(1_000, with_);
    const second = createItem(document.world, 'barrow-kings-blade', marketHolder);

    const result = applyAction(document, { kind: 'buy', guildId, definitionKey: 'barrow-kings-blade', quantity: 1 }, with_);

    if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
    const { world } = withValid(result.document, with_);
    expect(world.guilds[guildId]?.wealth).toBe(550);
    expect(world.items[blade]?.holder.kind).toBe('guild');
    expect(world.items[second]?.holder.kind).toBe('market');
  });

  test('Wealth exactly equal to the cost is enough, leaving none', () => {
    const { document, guildId } = scene(150);

    const result = applyAction(document, { kind: 'buy', guildId, definitionKey: 'healing-draught', quantity: 5 }, deps);

    expect(result.ok && result.document.world.guilds[guildId]?.wealth).toBe(0);
  });

  test.each([
    ['guild-folded', 1_000, 'healing-draught', 1, true],
    ['not-in-market', 1_000, 'whetstone', 1, false],
    ['not-in-market', 1_000, 'mantle-of-the-fells', 1, false],
    ['not-in-market', 1_000, 'no-such-item', 1, false],
    ['insufficient-quantity', 1_000, 'healing-draught', 6, false],
    ['insufficient-quantity', 1_000, 'barrow-kings-blade', 2, false],
    ['insufficient-wealth', 149, 'healing-draught', 5, false],
    // DL-51 item 3's order: more than the Market has is refused as such, whatever the Wealth.
    ['insufficient-quantity', 149, 'healing-draught', 6, false],
  ] as const)('refuses %s (Wealth %i, %s × %i), changing nothing', (reason, wealth, definitionKey, quantity, folded) => {
    const { document, guildId } = scene(wealth);
    if (folded) (document.world.guilds[guildId] as Guild).foldedOnTurn = 0;
    const before = serialise(document);

    const result = applyAction(document, { kind: 'buy', guildId, definitionKey, quantity }, deps);

    expect(result.ok ? 'bought' : result.rejection.reason).toBe(reason);
    expect(serialise(document)).toBe(before);
    if (!result.ok && result.rejection.reason === 'insufficient-wealth') {
      expect(result.rejection).toEqual({ action: 'buy', reason, cost: 150, wealth: 149 });
    }
    if (!result.ok && result.rejection.reason === 'insufficient-quantity' && definitionKey === 'healing-draught') {
      expect(result.rejection).toEqual({ action: 'buy', reason, definitionKey, quantity: 6, available: 5 });
    }
  });

  test('throws on a programming error: a quantity that is not a whole number from 1, a Guild the world lacks', () => {
    const { document, guildId } = scene();

    expect(() => applyAction(document, { kind: 'buy', guildId, definitionKey: 'healing-draught', quantity: 0 }, deps)).toThrow(RangeError);
    expect(() => applyAction(document, { kind: 'buy', guildId, definitionKey: 'healing-draught', quantity: 1.5 }, deps)).toThrow(RangeError);
    expect(() =>
      applyAction(document, { kind: 'buy', guildId: 'guild-000099' as GuildId, definitionKey: 'healing-draught', quantity: 1 }, deps),
    ).toThrow(RangeError);
  });

});
