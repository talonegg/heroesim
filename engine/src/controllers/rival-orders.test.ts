import { describe, expect, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import { facilityKeys, type Guild, type World } from '../document.js';
import { addStack, holdings } from '../items.js';
import { marketHolder } from '../market.js';
import { dispositionOf } from '../selectors.js';
import { testDeps, withDispositions } from '../world.test-support.js';
import { rivalChoices } from './rival.js';
import type { Disposition } from '../content-types.js';

// DL-186 item 16, DL-202: a Disposition's `purchaseOrder`, `gearSlotOrder` and `buildOrder`,
// the engine's own orders when a row has none.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
type Orders = Pick<Disposition, 'purchaseOrder' | 'gearSlotOrder' | 'buildOrder'>;

/** Every purchase is on offer to a rich `steady` Rival with Heroes to hire and gear to buy, but a Transfer and a debt. */
function scene(orders: Orders, seed = 'orders'): { world: World; rival: Guild; deps: EngineDeps } {
  const deps = testDeps(
    { negotiationRange: 0 },
    withDispositions({ buildThreshold: 3, recruitThreshold: 1, gearThreshold: 3, transferAppetite: 0, ...orders }),
  );
  const { world } = createWorld(seed, setup, deps).document;
  const rival = Object.values(world.guilds).find((guild) => dispositionOf(guild) === 'steady');
  if (rival === undefined) throw new Error('No steady Rival');
  rival.wealth = 1_000_000;
  const held = holdings(world, marketHolder);
  for (const stack of held.stacks) delete world.stacks[stack.id];
  for (const item of held.items) delete world.items[item.id];
  for (const [key, quantity] of [['padded-jack', 20], ['short-sword', 20], ['lucky-charm', 20]] as const) addStack(world, key, quantity, marketHolder);
  return { world, rival, deps };
}

/** The one purchase `rival` makes this afternoon, as the kind and what it names. */
function purchase({ world, rival, deps }: ReturnType<typeof scene>): string {
  const [made, ...more] = rivalChoices(world, rival, deps).filter((action) => action.kind !== 'dispatch' && action.kind !== 'equip');
  expect(more).toEqual([]);
  if (made === undefined) return 'nothing';
  if (made.kind === 'build') return `build ${made.facility}`;
  if (made.kind === 'buy') return `buy ${made.definitionKey}`;
  return made.kind;
}

describe("a Rival's purchase order", () => {
  test('is build, gear, transfer, recruit, debt when the row has none: a build while a Hall has grades to build', () => {
    expect(purchase(scene({}))).toBe('build infirmary');
  });

  test('is the row\'s when it has one: the first step that applies is the purchase', () => {
    expect(purchase(scene({ purchaseOrder: ['gear', 'build', 'transfer', 'recruit', 'debt'] }))).toBe('buy padded-jack');
    expect(purchase(scene({ purchaseOrder: ['recruit', 'gear', 'build', 'transfer', 'debt'] }))).toBe('recruit');
    expect(purchase(scene({ purchaseOrder: ['build', 'gear', 'transfer', 'recruit', 'debt'] }))).toBe('build infirmary');
  });

  test('passes a step that does not apply to the next: a debt no Guild is in, and a Transfer none makes, give way', () => {
    expect(purchase(scene({ purchaseOrder: ['debt', 'transfer', 'recruit', 'gear', 'build'] }))).toBe('recruit');
    expect(purchase(scene({ purchaseOrder: ['debt', 'transfer', 'gear', 'build', 'recruit'] }))).toBe('buy padded-jack');
  });
});

describe("a Rival's build order", () => {
  test("is the Hall's order when the row has none, and the row's when it has", () => {
    expect(purchase(scene({}))).toBe(`build ${facilityKeys[0]}`);
    expect(purchase(scene({ buildOrder: ['quarters', 'trainingYard', 'infirmary'] }))).toBe('build quarters');
    expect(purchase(scene({ buildOrder: ['trainingYard', 'quarters', 'infirmary'] }))).toBe('build trainingYard');
  });
});

describe("a Rival's gear slot order", () => {
  /** A Rival whose Hall is built, so that gear is what it buys. */
  function outfitting(orders: Orders): ReturnType<typeof scene> {
    const found = scene(orders);
    found.rival.hall = { infirmary: 3, trainingYard: 3, quarters: 3 };
    return found;
  }

  test('is armour first, then the other slots in order, when the row has none, and the row\'s when it has', () => {
    expect(purchase(outfitting({}))).toBe('buy padded-jack');
    expect(purchase(outfitting({ gearSlotOrder: ['weapon', 'armour', 'trinket'] }))).toBe('buy short-sword');
    expect(purchase(outfitting({ gearSlotOrder: ['trinket', 'weapon', 'armour'] }))).toBe('buy lucky-charm');
  });
});
