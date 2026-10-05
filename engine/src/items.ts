// Items and who holds them (M5-S1, data-model §3.3, DL-48): the unique Items of `world.items`, each
// an individual with one holder, and the common stacks of `world.stacks`, each a quantity of one
// definition. A row carries its holder and nothing else records it, so what a holder has is a
// filter over both tables, and moving an Item is changing a holder.
//
// The one rule these functions keep: **one stack per (definition, holder, slot)**, with a quantity
// of at least 1. `moveStack` splits a stack and merges into the stack already there, `addStack`
// merges or creates, `removeFromStack` removes an emptied stack; the validator refuses a duplicate
// (`duplicate-stack`) or an empty stack (`empty-stack`). They are world-level primitives for the
// rules M5-S2 to S5 write (equip, dispatch's consumables, the Market, Loot): they emit nothing and
// check no rule of play — whether a slot is free, a Guild owns the Item, a price is paid — which is
// the calling action's to reject. They throw only on a programming error: an id naming no row, or a
// quantity the stack cannot give.

import type { ContentSet, ItemDefinition, ItemDefinitionKey } from './content-types.js';
import {
  compareByCodeUnit,
  rowOf,
  takeId,
  type HeroId,
  type Holder,
  type ItemId,
  type Stack,
  type StackId,
  type UniqueItem,
  type World,
} from './document.js';

/** Whom `holdings` looks at: one holder, or a Hero in every slot at once (no `slot`). */
export type HolderQuery = Holder | { kind: 'hero'; id: HeroId };

/** What a holder has, in both tables, each list in id order. */
export interface Holdings {
  items: UniqueItem[];
  stacks: Stack[];
}

/**
 * Content's definition of `definitionKey`, or `undefined` for a key it does not define, which rules
 * ignore and the validator warns about (data-model rule 5).
 */
export function itemDefinition(
  content: Pick<ContentSet, 'items'>,
  definitionKey: ItemDefinitionKey,
): ItemDefinition | undefined {
  return rowOf(content.items, definitionKey);
}

/** True when `a` and `b` are the same holder: the same kind, the same row, and for a Hero the same slot. */
export function sameHolder(a: Holder, b: Holder): boolean {
  switch (a.kind) {
    case 'market':
      return b.kind === 'market';
    case 'hero':
      return b.kind === 'hero' && a.id === b.id && a.slot === b.slot;
    case 'guild':
    case 'party':
      return b.kind === a.kind && a.id === b.id;
  }
}

/** True when `holder` is `query`, or, for a query naming a Hero and no slot, is that Hero in any slot. */
function matches(holder: Holder, query: HolderQuery): boolean {
  if (query.kind !== 'hero') return sameHolder(holder, query);
  return holder.kind === 'hero' && holder.id === query.id && (!('slot' in query) || holder.slot === query.slot);
}

/**
 * Every unique Item and every stack `holder` holds, each list in id order (data-model §3.3: "what is
 * Brenna carrying" is a filter over both tables). A Hero named without a slot is looked at in every
 * slot, so `holdings(world, { kind: 'hero', id })` is all a Hero carries.
 */
export function holdings(world: Pick<World, 'items' | 'stacks'>, holder: HolderQuery): Holdings {
  const byId = (a: { id: string }, b: { id: string }): number => compareByCodeUnit(a.id, b.id);
  return {
    items: rowsWhere(world.items, (item) => matches(item.holder, holder)).sort(byId),
    stacks: rowsWhere(world.stacks, (stack) => matches(stack.holder, holder)).sort(byId),
  };
}

/**
 * The rows of `table` that `keep`, in its order, as `Object.values(table).filter(keep)` gives them
 * without the copy of the whole table: `holdings` is asked for every Hero a Query reads, and copying
 * the tables was a fifth of a twenty-year game's time (DL-164).
 */
function rowsWhere<T>(table: Readonly<Record<string, T>>, keep: (row: T) => boolean): T[] {
  const kept: T[] = [];
  for (const id in table) {
    const row = table[id] as T;
    if (keep(row)) kept.push(row);
  }
  return kept;
}

/** `holder`'s stack of `definitionKey`, or `undefined` when it has none: by the rule, there is one at most. */
export function findStack(
  world: Pick<World, 'stacks'>,
  definitionKey: ItemDefinitionKey,
  holder: Holder,
): Stack | undefined {
  for (const id in world.stacks) {
    const stack = world.stacks[id as StackId] as Stack;
    if (stack.definitionKey === definitionKey && sameHolder(stack.holder, holder)) return stack;
  }
  return undefined;
}

/**
 * Moves `quantity` of stack `stackId` to `toHolder`, keeping one stack per (definition, holder,
 * slot): the quantity joins `toHolder`'s stack of the definition when it has one, or else becomes a
 * new stack with an id from `world.counters`; a whole stack moving where there is none keeps its id
 * and changes holder. The source stack is removed once emptied. Moving to the stack's own holder
 * changes nothing. Returns the id of the stack the quantity is now in.
 *
 * Checks no rule of play: a Hero's slot holds one Item (the validator's `gear-slot-overfull`), so
 * a caller moves gear to a Hero one at a time, into a free slot of the Item's own.
 *
 * @throws RangeError when `stackId` names no stack, or `quantity` is not a whole number from 1 to
 *   the stack's quantity
 */
export function moveStack(
  world: Pick<World, 'stacks' | 'counters'>,
  stackId: StackId,
  quantity: number,
  toHolder: Holder,
): StackId {
  const source = stackOf(world, stackId);
  checkQuantity(quantity, source);
  if (sameHolder(source.holder, toHolder)) return stackId;

  const target = findStack(world, source.definitionKey, toHolder);
  if (target === undefined && quantity === source.quantity) {
    source.holder = copyHolder(toHolder);
    return stackId;
  }
  let into: StackId;
  if (target === undefined) into = addStack(world, source.definitionKey, quantity, toHolder);
  else {
    target.quantity += quantity;
    into = target.id;
  }
  removeFromStack(world, stackId, quantity);
  return into;
}

/**
 * Moves unique Item `itemId` to `toHolder`. Checks no rule of play, as `moveStack` does not.
 *
 * @throws RangeError when `itemId` names no Item
 */
export function moveItem(world: Pick<World, 'items'>, itemId: ItemId, toHolder: Holder): void {
  const item = rowOf(world.items, itemId);
  if (item === undefined) throw new RangeError(`No unique Item is ${itemId}`);
  item.holder = copyHolder(toHolder);
}

/**
 * Adds `quantity` of `definitionKey` to `holder`: to its stack of the definition when it has one,
 * or as a new stack with an id from `world.counters` (a Market's refresh, a purchase, Loot). Returns
 * the stack's id. Content is not read: whether the definition is common is the caller's to know.
 *
 * @throws RangeError when `quantity` is not a whole number from 1
 */
export function addStack(
  world: Pick<World, 'stacks' | 'counters'>,
  definitionKey: ItemDefinitionKey,
  quantity: number,
  holder: Holder,
): StackId {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError(`A stack gains a whole number of Items from 1, not ${quantity}`);
  }
  const found = findStack(world, definitionKey, holder);
  if (found !== undefined) {
    found.quantity += quantity;
    return found.id;
  }
  const id = takeId(world, 'stacks');
  world.stacks[id] = { id, definitionKey, quantity, holder: copyHolder(holder) };
  return id;
}

/**
 * Takes `quantity` from stack `stackId`, removing the stack once emptied: an Item expended, sold, or
 * cleared from the Market.
 *
 * @throws RangeError when `stackId` names no stack, or `quantity` is not a whole number from 1 to
 *   the stack's quantity
 */
export function removeFromStack(world: Pick<World, 'stacks'>, stackId: StackId, quantity: number): void {
  const stack = stackOf(world, stackId);
  checkQuantity(quantity, stack);
  stack.quantity -= quantity;
  if (stack.quantity === 0) delete world.stacks[stackId];
}

/**
 * Creates a unique Item of `definitionKey` held by `holder`, with an id from `world.counters` (Loot,
 * M5-S5), and returns its id. Content is not read: whether the definition is unique is the caller's
 * to know.
 */
export function createItem(
  world: Pick<World, 'items' | 'counters'>,
  definitionKey: ItemDefinitionKey,
  holder: Holder,
): ItemId {
  const id = takeId(world, 'items');
  world.items[id] = { id, definitionKey, holder: copyHolder(holder) };
  return id;
}

/** The stack under `stackId`, which must exist. */
function stackOf(world: Pick<World, 'stacks'>, stackId: StackId): Stack {
  const stack = rowOf(world.stacks, stackId);
  if (stack === undefined) throw new RangeError(`No stack is ${stackId}`);
  return stack;
}

function checkQuantity(quantity: number, stack: Stack): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > stack.quantity) {
    throw new RangeError(`${stack.id} holds ${stack.quantity}; ${quantity} cannot be taken from it`);
  }
}

/** A holder of its own, so that no two rows share an object (rows never embed or share one). */
function copyHolder(holder: Holder): Holder {
  return { ...holder };
}
