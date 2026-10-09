import { describe, expect, test } from 'vitest';
import {
  addStack,
  defaultConfig,
  gearSlotKeys,
  holdings,
  itemDefinition,
  type Holder,
  type ItemDefinitionKey,
  type Stack,
  type StackId,
  type World,
} from './index.js';
import { createItem, findStack, moveItem, moveStack, removeFromStack, sameHolder } from './items.js';
import { makeId } from './document.js';
import { cyrb128, int, pick } from './rng.js';
import { buildDocument, testContent, testDeps, withValid } from './world.test-support.js';

// Who holds an Item, and moving Items between holders so that one stack per (definition,
// holder, slot) always holds (data-model §3.3, DL-48). Every document a test changes is asserted
// valid with `withValid`, whose checks include `duplicate-stack` and `empty-stack`.

const deps = testDeps();

function fixture() {
  const { document, ids } = buildDocument();
  const holders = {
    market: { kind: 'market' },
    guild: { kind: 'guild', id: ids.playerGuild },
    rival: { kind: 'guild', id: ids.rivalGuild },
    party: { kind: 'party', id: ids.party },
    weapon: { kind: 'hero', id: ids.partyHero, slot: 'weapon' },
    armour: { kind: 'hero', id: ids.partyHero, slot: 'armour' },
    trinket: { kind: 'hero', id: ids.partyHero, slot: 'trinket' },
  } as const satisfies Record<string, Holder>;
  return { document, world: document.world, ids, holders };
}

function stackOf(world: Pick<World, 'stacks'>, id: StackId): Stack {
  const stack = world.stacks[id];
  if (stack === undefined) throw new Error(`No stack is ${id}`);
  return stack;
}

/** Each definition's quantity summed over every stack, whoever holds it. */
function totals(world: Pick<World, 'stacks'>): Record<ItemDefinitionKey, number> {
  const sums: Record<ItemDefinitionKey, number> = {};
  for (const { definitionKey, quantity } of Object.values(world.stacks)) sums[definitionKey] = (sums[definitionKey] ?? 0) + quantity;
  return sums;
}

describe('moveStack', () => {
  // The first acceptance box.
  test('moving 3 of a stack of 5 to a holder that already has 2 leaves stacks of 2 and 5', () => {
    const { document, world, ids, holders } = fixture();
    stackOf(world, ids.guildStack).quantity = 5;
    expect(stackOf(world, ids.partyStack)).toMatchObject({ definitionKey: 'healing-draught', quantity: 2 });
    const before = Object.keys(world.stacks).length;

    const into = moveStack(world, ids.guildStack, 3, holders.party);

    withValid(document, deps);
    expect(into).toBe(ids.partyStack);
    expect(stackOf(world, ids.guildStack)).toMatchObject({ quantity: 2, holder: holders.guild });
    expect(stackOf(world, ids.partyStack)).toMatchObject({ quantity: 5, holder: holders.party });
    expect(Object.keys(world.stacks)).toHaveLength(before);
  });

  test('moving part of a stack to a holder with none splits it into a new stack, its id from the counter', () => {
    const { document, world, ids, holders } = fixture();
    const next = makeId('stacks', world.counters.stacks);

    const into = moveStack(world, ids.marketStack, 4, holders.rival);

    withValid(document, deps);
    expect(into).toBe(next);
    expect(world.counters.stacks).toBe(Number(next.slice(-6)) + 1);
    expect(stackOf(world, next)).toEqual({ id: next, definitionKey: 'healing-draught', quantity: 4, holder: holders.rival });
    expect(stackOf(world, ids.marketStack).quantity).toBe(8);
  });

  test('moving a whole stack to a holder with none keeps its id and changes its holder', () => {
    const { document, world, ids, holders } = fixture();
    const counter = world.counters.stacks;

    expect(moveStack(world, ids.guildStack, 3, holders.rival)).toBe(ids.guildStack);

    withValid(document, deps);
    expect(stackOf(world, ids.guildStack)).toMatchObject({ quantity: 3, holder: holders.rival });
    expect(world.counters.stacks).toBe(counter);
  });

  test('moving a whole stack to a holder with one merges it there and removes the emptied stack', () => {
    const { document, world, ids, holders } = fixture();

    expect(moveStack(world, ids.partyStack, 2, holders.guild)).toBe(ids.guildStack);

    withValid(document, deps);
    expect(world.stacks).not.toHaveProperty(ids.partyStack);
    expect(stackOf(world, ids.guildStack).quantity).toBe(5);
    expect(holdings(world, holders.party).stacks).toEqual([]);
  });

  test('moving to the stack’s own holder changes nothing', () => {
    const { world, ids, holders } = fixture();
    const before = structuredClone(world);

    expect(moveStack(world, ids.guildStack, 2, { ...holders.guild })).toBe(ids.guildStack);
    expect(world).toEqual(before);
  });

  test('tells a Hero’s slots apart: gear moves to one slot and back, into a stack of one', () => {
    const { document, world, ids, holders } = fixture();
    const swords = addStack(world, 'short-sword', 2, holders.guild);

    const equipped = moveStack(world, swords, 1, holders.weapon);

    withValid(document, deps);
    expect(stackOf(world, equipped)).toMatchObject({ definitionKey: 'short-sword', quantity: 1, holder: holders.weapon });
    expect(holdings(world, holders.armour).stacks.map(({ id }) => id)).toEqual([ids.heroStack]);
    expect(moveStack(world, equipped, 1, holders.guild)).toBe(swords);
    withValid(document, deps);
    expect(stackOf(world, swords).quantity).toBe(2);
    expect(holdings(world, holders.weapon)).toEqual({ items: [], stacks: [] });
  });

  test('gives the new holder a holder of its own, so no two rows share one', () => {
    const { world, ids } = fixture();
    const holder: Holder = { kind: 'guild', id: ids.rivalGuild };

    const into = moveStack(world, ids.marketStack, 1, holder);
    Object.assign(holder, { id: ids.playerGuild });

    expect(stackOf(world, into).holder).toEqual({ kind: 'guild', id: ids.rivalGuild });
  });

  test.each([
    ['0', 0],
    ['more than the stack holds', 4],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
  ])('throws on a quantity of %s, changing nothing', (_, quantity) => {
    const { world, ids, holders } = fixture();
    const before = structuredClone(world);

    expect(() => moveStack(world, ids.guildStack, quantity, holders.party)).toThrow(RangeError);
    expect(world).toEqual(before);
  });

  test('throws on a stack that does not exist', () => {
    const { world, holders } = fixture();
    expect(() => moveStack(world, makeId('stacks', 999), 1, holders.guild)).toThrow(RangeError);
  });

  // The second acceptance box, its second half: the check fires on a hand-built duplicate (validate.test.ts)
  // and never after moveStack, over hundreds of seeded random moves.
  test('never leaves a duplicate or an empty stack: 600 seeded random moves, each validated', () => {
    const { document, world, ids, holders } = fixture();
    const idleHero = ids.idleHero ?? ids.partyHero;
    const targets: Holder[] = [
      holders.market,
      holders.guild,
      holders.rival,
      holders.party,
      holders.weapon,
      { kind: 'hero', id: idleHero, slot: 'weapon' },
    ];
    addStack(world, 'whetstone', 6, holders.guild);
    addStack(world, 'whetstone', 3, holders.market);
    addStack(world, 'short-sword', 4, holders.rival);
    addStack(world, 'short-sword', 1, holders.party);
    withValid(document, deps);
    const sums = totals(world);
    const state = cyrb128('m5-s1:moveStack');
    const seen = { moves: 0, merged: 0, split: 0, whole: 0, intoSlot: 0 };

    for (let attempt = 0; attempt < 600; attempt += 1) {
      const movable = Object.values(world.stacks).filter((it) => it.id !== ids.heroStack);
      const from = pick(state, movable);
      const to = pick(state, targets);
      let quantity = int(state, 1, from.quantity);
      if (to.kind === 'hero') {
        // What equip will do: one sword into a free weapon slot.
        const occupied = holdings(world, to);
        if (from.definitionKey !== 'short-sword' || occupied.items.length + occupied.stacks.length > 0) continue;
        quantity = 1;
        seen.intoSlot += 1;
      }
      const target = findStack(world, from.definitionKey, to);
      const counter = world.counters.stacks;
      const fromHolder = { ...from.holder };

      const into = moveStack(world, from.id, quantity, to);

      withValid(document, deps);
      expect(totals(world)).toEqual(sums);
      if (sameHolder(fromHolder, to)) continue;
      seen.moves += 1;
      if (target !== undefined) seen.merged += 1;
      else if (into === from.id) seen.whole += 1;
      else {
        seen.split += 1;
        expect(world.counters.stacks).toBe(counter + 1);
      }
    }

    // Every path was taken, many times.
    expect(seen.moves).toBeGreaterThan(300);
    expect(Math.min(seen.merged, seen.split, seen.whole, seen.intoSlot)).toBeGreaterThan(10);
  });
});

describe('moveItem', () => {
  test('moves a unique Item to any holder, the Market included (D6)', () => {
    const { document, world, ids, holders } = fixture();

    for (const holder of [holders.guild, holders.party, holders.market, holders.trinket]) {
      moveItem(world, ids.item, holder);
      withValid(document, deps);
      expect(world.items[ids.item]?.holder).toEqual(holder);
      expect(holdings(world, holder).items.map(({ id }) => id)).toEqual([ids.item]);
    }
  });

  test('gives the Item a holder of its own', () => {
    const { world, ids } = fixture();
    const holder: Holder = { kind: 'guild', id: ids.playerGuild };

    moveItem(world, ids.item, holder);
    Object.assign(holder, { id: ids.rivalGuild });

    expect(world.items[ids.item]?.holder).toEqual({ kind: 'guild', id: ids.playerGuild });
  });

  test('throws on an Item that does not exist', () => {
    const { world, holders } = fixture();
    expect(() => moveItem(world, makeId('items', 999), holders.guild)).toThrow(RangeError);
  });
});

describe('addStack, removeFromStack and createItem', () => {
  test('addStack adds to the holder’s stack of the definition, or makes one with the next id', () => {
    const { document, world, ids, holders } = fixture();
    const next = makeId('stacks', world.counters.stacks);

    expect(addStack(world, 'healing-draught', 4, holders.guild)).toBe(ids.guildStack);
    expect(addStack(world, 'whetstone', 2, holders.guild)).toBe(next);
    expect(addStack(world, 'whetstone', 1, holders.guild)).toBe(next);

    withValid(document, deps);
    expect(stackOf(world, ids.guildStack).quantity).toBe(7);
    expect(stackOf(world, next)).toEqual({ id: next, definitionKey: 'whetstone', quantity: 3, holder: holders.guild });
  });

  test.each([0, -1, 2.5])('addStack throws on a quantity of %s', (quantity) => {
    const { world, holders } = fixture();
    expect(() => addStack(world, 'whetstone', quantity, holders.guild)).toThrow(RangeError);
  });

  test('removeFromStack takes a quantity, and removes the stack it empties', () => {
    const { document, world, ids } = fixture();

    removeFromStack(world, ids.guildStack, 2);
    expect(stackOf(world, ids.guildStack).quantity).toBe(1);
    removeFromStack(world, ids.guildStack, 1);

    withValid(document, deps);
    expect(world.stacks).not.toHaveProperty(ids.guildStack);
    expect(() => removeFromStack(world, ids.partyStack, 3)).toThrow(RangeError);
    expect(() => removeFromStack(world, ids.guildStack, 1)).toThrow(RangeError);
  });

  test('createItem makes a unique Item with the next id, held by the holder', () => {
    const { document, world, holders } = fixture();
    const next = makeId('items', world.counters.items);

    expect(createItem(world, 'barrow-kings-blade', holders.guild)).toBe(next);

    withValid(document, deps);
    expect(world.items[next]).toEqual({ id: next, definitionKey: 'barrow-kings-blade', holder: holders.guild });
    expect(world.counters.items).toBe(Number(next.slice(-6)) + 1);
  });
});

describe('holdings', () => {
  test('lists what a holder has in both tables, each in id order', () => {
    const { world, ids, holders } = fixture();
    const blade = createItem(world, 'barrow-kings-blade', holders.guild);
    const whetstones = addStack(world, 'whetstone', 2, holders.guild);

    expect(holdings(world, holders.guild)).toEqual({
      items: [world.items[blade]],
      stacks: [world.stacks[ids.guildStack], world.stacks[whetstones]],
    });
    expect(holdings(world, holders.market).stacks.map(({ id }) => id)).toEqual([ids.marketStack]);
    expect(holdings(world, holders.rival)).toEqual({ items: [], stacks: [] });
  });

  test('reads a Hero in one slot, or, with no slot named, in every slot', () => {
    const { world, ids, holders } = fixture();

    expect(holdings(world, holders.trinket)).toEqual({ items: [world.items[ids.item]], stacks: [] });
    expect(holdings(world, holders.armour)).toEqual({ items: [], stacks: [world.stacks[ids.heroStack]] });
    expect(holdings(world, { kind: 'hero', id: ids.partyHero })).toEqual({
      items: [world.items[ids.item]],
      stacks: [world.stacks[ids.heroStack]],
    });
    expect(holdings(world, { kind: 'hero', id: ids.rivalHero })).toEqual({ items: [], stacks: [] });
  });

  test('orders by id whatever order the rows were written in', () => {
    const { world, holders } = fixture();
    const later = makeId('stacks', 900);
    const earlier = makeId('stacks', 800);
    world.stacks[later] = { id: later, definitionKey: 'whetstone', quantity: 1, holder: { kind: 'guild', id: holders.rival.id } };
    world.stacks[earlier] = { id: earlier, definitionKey: 'lockpicks', quantity: 1, holder: { kind: 'guild', id: holders.rival.id } };

    expect(holdings(world, holders.rival).stacks.map(({ id }) => id)).toEqual([earlier, later]);
  });
});

describe('sameHolder and findStack', () => {
  test('compare kind, row and, for a Hero, slot', () => {
    const { ids, holders } = fixture();

    expect(sameHolder(holders.market, { kind: 'market' })).toBe(true);
    expect(sameHolder(holders.guild, { kind: 'guild', id: ids.playerGuild })).toBe(true);
    expect(sameHolder(holders.guild, holders.rival)).toBe(false);
    expect(sameHolder(holders.guild, holders.market)).toBe(false);
    expect(sameHolder(holders.weapon, { kind: 'hero', id: ids.partyHero, slot: 'weapon' })).toBe(true);
    expect(sameHolder(holders.weapon, holders.armour)).toBe(false);
    expect(sameHolder(holders.party, holders.guild)).toBe(false);
  });

  test('findStack finds the holder’s one stack of a definition, or none', () => {
    const { world, ids, holders } = fixture();

    expect(findStack(world, 'healing-draught', holders.guild)?.id).toBe(ids.guildStack);
    expect(findStack(world, 'padded-jack', holders.armour)?.id).toBe(ids.heroStack);
    expect(findStack(world, 'padded-jack', holders.weapon)).toBeUndefined();
    expect(findStack(world, 'whetstone', holders.guild)).toBeUndefined();
  });
});

describe('itemDefinition and gearSlots', () => {
  test('reads content’s definition by key, and nothing for a key it lacks', () => {
    expect(itemDefinition(testContent, 'lantern-of-stannary')).toMatchObject({ kind: 'gear', unique: true, slot: 'trinket' });
    expect(itemDefinition(testContent, 'healing-draught')).toMatchObject({ kind: 'consumable', effect: { kind: 'heal' } });
    expect(itemDefinition(testContent, 'rope')).toBeUndefined();
    expect(itemDefinition(testContent, 'constructor')).toBeUndefined();
  });

  test("every Hero has the three gear slots of INPUTS 7.1, the engine's and no setting (DL-193)", () => {
    expect(gearSlotKeys).toEqual(['weapon', 'armour', 'trinket']);
    expect(defaultConfig).not.toHaveProperty('gearSlots');
  });
});
