import { describe, expect, test } from 'vitest';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import type { ContentSet } from '../content-types.js';
import { createWorld } from '../create.js';
import type { WorldDocument } from '../document.js';
import { addStack, createItem, holdings } from '../items.js';
import { marketHolder, stockedDefinitions } from '../market.js';
import { createStreams } from '../rng.js';
import { dayOf, timeOfDay } from '../time.js';
import { deepFreeze, plannedStreams, testContent, testDeps, withValid } from '../world.test-support.js';
import { marketRefresh } from './market-refresh.js';
import { phaseContext } from './phase.js';

// The Market Engine's morning refresh (INPUTS 7.2, DL-51). The Market's size, its stacks'
// quantities and the prices are pinned; no Rival acts, since none of these tests is about them.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

const market = { rivalCount: 0, marketSize: 10, marketStackMin: 1, marketStackMax: 5 };
const deps = testDeps(market);

function created(seed: string, with_: EngineDeps = deps): WorldDocument {
  return withValid(createWorld(seed, setup, with_).document, with_);
}

/** Plays Turns until `turn`, checking every document. */
function playTo(document: WorldDocument, turn: number, with_: EngineDeps = deps): WorldDocument {
  let current = document;
  while (current.world.turn < turn) current = withValid(advance(current, with_).document, with_);
  return current;
}

/** The keys the test content's Market stocks: its nine common gear and six consumables. */
const stocked = stockedDefinitions(testContent).map((definition) => definition.key);

describe('marketRefresh', () => {
  test('stocks only the common definitions with a price, in key order', () => {
    expect(stocked).toHaveLength(15);
    expect(stocked).toEqual([...stocked].sort());
    for (const key of stocked) expect(testContent.items[key]).toMatchObject({ unique: false, buyPrice: expect.any(Number) as number });
  });

  test('a new game opens on a stocked Market: marketSize stacks, each of a different stocked definition, of 1 to 5', () => {
    const { world } = created('opening');

    const { stacks, items } = holdings(world, marketHolder);
    expect(stacks).toHaveLength(10);
    expect(items).toEqual([]);
    const keys = stacks.map((stack) => stack.definitionKey);
    expect(new Set(keys).size).toBe(10);
    for (const stack of stacks) {
      expect(stocked).toContain(stack.definitionKey);
      expect(stack.quantity).toBeGreaterThanOrEqual(1);
      expect(stack.quantity).toBeLessThanOrEqual(5);
    }
  });

  test('each morning clears the Market’s stacks and draws new ones, leaving the Guilds’ stacks and the unique Items it lists', () => {
    let document = created('mornings');
    const { world } = document;
    const guildId = Object.keys(world.guilds)[0] as keyof typeof world.guilds;
    const kept = addStack(world, 'whetstone', 2, { kind: 'guild', id: guildId });
    const listed = createItem(world, 'barrow-kings-blade', marketHolder);
    const seen = new Set<string>();
    const quantities = new Set<number>();

    for (let day = 1; day <= 20; day += 1) {
      const before = holdings(document.world, marketHolder).stacks.map((stack) => stack.id);
      document = playTo(withValid(document, deps), 3 * day);
      expect(timeOfDay(document.world.turn)).toBe('morning');
      expect(dayOf(document.world.turn)).toBe(day);

      const { stacks, items } = holdings(document.world, marketHolder);
      expect(stacks).toHaveLength(10);
      expect(new Set(stacks.map((stack) => stack.definitionKey)).size).toBe(10);
      for (const stack of stacks) {
        expect(before).not.toContain(stack.id);
        expect(stocked).toContain(stack.definitionKey);
        expect(stack.quantity).toBeGreaterThanOrEqual(1);
        expect(stack.quantity).toBeLessThanOrEqual(5);
        seen.add(stack.definitionKey);
        quantities.add(stack.quantity);
      }
      expect(items.map((item) => item.id)).toEqual([listed]);
      expect(document.world.stacks[kept]).toMatchObject({ definitionKey: 'whetstone', quantity: 2 });
    }
    // Twenty draws of ten from fifteen reach them all; no unique or unpriced definition among them.
    expect([...seen].sort()).toEqual(stocked);
    // And each stack's quantity is drawn: two hundred stacks take every quantity from 1 to 5.
    expect([...quantities].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test('draws from the market stream and no other, and emits nothing', () => {
    const { world } = created('streams');
    const others = plannedStreams.filter((name) => !Object.hasOwn(world.rng, name));
    Object.assign(world.rng, createStreams('streams', others));
    const before = structuredClone(world.rng) as Record<string, unknown>;

    const events = marketRefresh(world, phaseContext(world, deps));

    expect(events).toEqual([]);
    const after = world.rng as Record<string, unknown>;
    for (const name of plannedStreams) {
      if (name === 'market') expect(after[name], name).not.toEqual(before[name]);
      else expect(after[name], name).toEqual(before[name]);
    }
  });

  test('the same seed stocks the same Market, and another seed another', () => {
    const stock = (document: WorldDocument) =>
      holdings(document.world, marketHolder).stacks.map(({ definitionKey, quantity }) => [definitionKey, quantity]);

    expect(stock(created('twin'))).toEqual(stock(created('twin')));
    expect(stock(created('twin'))).not.toEqual(stock(created('other')));
  });

  test('a Market of size 0 is empty and draws nothing', () => {
    const empty = testDeps({ ...market, marketSize: 0 });
    const { world } = created('empty', empty);
    addStack(world, 'whetstone', 3, marketHolder);
    const before = structuredClone(world.rng);

    marketRefresh(world, phaseContext(world, empty));

    expect(holdings(world, marketHolder).stacks).toEqual([]);
    expect(world.rng).toEqual(before);
  });

  test('never stocks a unique definition, even one with a price (DL-48 item 3): a unique Item is an individual, never a stack', () => {
    const blade = testContent.items['barrow-kings-blade'];
    if (blade === undefined) throw new Error('No barrow-kings-blade in the test content');
    const priced: ContentSet = deepFreeze({
      ...testContent,
      items: Object.fromEntries(
        Object.entries({ ...testContent.items, 'barrow-kings-blade': { ...blade, buyPrice: 500 } }).filter(([key]) =>
          ['whetstone', 'padded-jack', 'barrow-kings-blade'].includes(key),
        ),
      ),
    });

    expect(stockedDefinitions(priced).map((definition) => definition.key)).toEqual(['padded-jack', 'whetstone']);
    const { world } = created('priced-unique', testDeps(market, priced));
    expect(holdings(world, marketHolder).stacks.map((stack) => stack.definitionKey).sort()).toEqual(['padded-jack', 'whetstone']);
  });

  test('never stocks a common definition with a value rather than a buyPrice: it is found only as Loot (DL-301)', () => {
    const sword = testContent.items['short-sword'];
    if (sword === undefined || sword.kind !== 'gear') throw new Error('No short-sword in the test content');
    const lost = { ...sword, value: 40 };
    delete lost.buyPrice;
    const valued: ContentSet = deepFreeze({
      ...testContent,
      items: Object.fromEntries(
        Object.entries({ ...testContent.items, 'short-sword': lost }).filter(([key]) =>
          ['whetstone', 'padded-jack', 'short-sword'].includes(key),
        ),
      ),
    });

    expect(stockedDefinitions(valued).map((definition) => definition.key)).toEqual(['padded-jack', 'whetstone']);
  });

  test('stocks every definition once when content stocks fewer than marketSize', () => {
    const few: ContentSet = deepFreeze({
      ...testContent,
      items: Object.fromEntries(
        Object.entries(testContent.items).filter(([key]) => ['whetstone', 'padded-jack', 'barrow-kings-blade'].includes(key)),
      ),
    });
    const small = testDeps(market, few);

    const { world } = created('few', small);

    expect(holdings(world, marketHolder).stacks.map((stack) => stack.definitionKey).sort()).toEqual(['padded-jack', 'whetstone']);
  });
});
