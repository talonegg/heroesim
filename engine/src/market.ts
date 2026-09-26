// The Market Engine (M5-S4, R31, INPUTS 7.2, `CONTEXT.md`, DL-51): what the Market holds, the price
// it asks for an Item and the price it pays. The Market is the one holder no Guild owns: each
// morning's refresh (phases/market-refresh.ts) replaces its stacks, `buy` and `sell` move Items
// between it and a Guild, and a folding Guild's unique Items are sold to it (pre-M0 review D6).
//
// Every Guild meets the same prices (ADR-0002). In M5 only the player's Guild buys and sells by
// choice: `steady` ignores the Market until M6 gives the Rivals a use for it, though a folding
// Rival's unique Items are sold to it as any Guild's would be.

import type { EngineDeps } from './config.js';
import type { ContentSet, ItemDefinition, ItemDefinitionKey } from './content-types.js';
import { compareByCodeUnit, type Guild, type Holder, type World } from './document.js';
import type { Emit } from './emit.js';
import type { ItemSold } from './events.js';
import { holdings, itemDefinition, moveItem } from './items.js';

/** The Market as a holder, for `holdings` and the moves of `items.ts`. */
export const marketHolder: Holder = Object.freeze({ kind: 'market' });

/**
 * What the Market asks for one Item of `definitionKey`: its definition's `buyPrice`, or
 * `lootOnlyPrice` for a definition with none (Loot only, DL-48); `null` for a definition content
 * does not define, which the Market cannot price and rules ignore (data-model rule 5).
 */
export function marketPrice(
  definitionKey: ItemDefinitionKey,
  { config, content }: Pick<EngineDeps, 'config' | 'content'>,
): number | null {
  const definition = itemDefinition(content, definitionKey);
  if (definition === undefined) return null;
  return definition.buyPrice ?? config.lootOnlyPrice;
}

/**
 * What the Market pays for one Item of `definitionKey`: its `marketPrice` × `sellRatio`, rounded
 * down, so that selling several is selling one several times and the Market never pays a fraction;
 * `null` when the Market cannot price it.
 */
export function sellPrice(
  definitionKey: ItemDefinitionKey,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): number | null {
  const price = marketPrice(definitionKey, deps);
  return price === null ? null : Math.floor(price * deps.config.sellRatio);
}

/**
 * The definitions a morning's refresh draws its stacks from, in key order: every common one with a
 * `buyPrice`. A unique Item is an individual, never a stack, and one with no price is Loot only
 * (DL-48).
 */
export function stockedDefinitions(content: Pick<ContentSet, 'items'>): ItemDefinition[] {
  return Object.values(content.items)
    .filter((definition) => !definition.unique && definition.buyPrice !== null)
    .sort((a, b) => compareByCodeUnit(a.key, b.key));
}

/** One definition the Market has for sale: how many and at what price each. */
export interface MarketListing {
  definition: ItemDefinition;
  /** The Market's stack of it, or for a unique definition how many of its Items the Market holds. */
  quantity: number;
  /** `marketPrice`: what one costs. */
  price: number;
}

/**
 * What the Market has for sale, in definition key order: each common definition it holds a stack
 * of, and each unique definition it holds Items of, as the refresh left it and sales since have
 * added. What content does not define is not for sale (data-model rule 5), nor a stack of a unique
 * definition or a unique Item of a common one, which no rule makes.
 */
export function marketStock(
  world: Pick<World, 'items' | 'stacks'>,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): MarketListing[] {
  const quantities = new Map<ItemDefinitionKey, number>();
  const add = (definitionKey: ItemDefinitionKey, quantity: number, unique: boolean): void => {
    if (itemDefinition(deps.content, definitionKey)?.unique !== unique) return;
    quantities.set(definitionKey, (quantities.get(definitionKey) ?? 0) + quantity);
  };
  const { items, stacks } = holdings(world, marketHolder);
  for (const stack of stacks) add(stack.definitionKey, stack.quantity, false);
  for (const item of items) add(item.definitionKey, 1, true);
  return [...quantities]
    .sort(([a], [b]) => compareByCodeUnit(a, b))
    .map(([definitionKey, quantity]) => ({
      definition: itemDefinition(deps.content, definitionKey) as ItemDefinition,
      quantity,
      price: marketPrice(definitionKey, deps) as number,
    }));
}

/**
 * A folding Guild's Items (pre-M0 review D6, DL-51), before its Parties are disbanded and its Heroes
 * released: every unique Item that the Guild, a Party of its own, or a Hero whose Guild it is holds,
 * in any slot, is sold to the Market at `sellPrice`, one `item.sold` (`cause: 'fold'`) each in id
 * order, the proceeds credited to the Guild's Wealth, a record no rule reads again (DL-28); then
 * every stack they hold is discarded, which `guild.folded` explains. A unique Item content does not
 * define sells for nothing. Returns the events, in order.
 */
export function sellFoldedGuildItems(
  world: World,
  guild: Guild,
  emit: Emit,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): ItemSold[] {
  const heldByGuild = (holder: Holder): boolean => {
    switch (holder.kind) {
      case 'guild':
        return holder.id === guild.id;
      case 'party':
        return world.parties[holder.id]?.guildId === guild.id;
      case 'hero':
        return world.heroes[holder.id]?.guildId === guild.id;
      case 'market':
        return false;
    }
  };
  const byId = (a: { id: string }, b: { id: string }): number => compareByCodeUnit(a.id, b.id);

  const events: ItemSold[] = [];
  for (const item of Object.values(world.items).filter((row) => heldByGuild(row.holder)).sort(byId)) {
    const unitPrice = sellPrice(item.definitionKey, deps) ?? 0;
    events.push(
      emit({
        type: 'item.sold',
        participants: [guild.id, item.id],
        payload: {
          guildId: guild.id,
          definitionKey: item.definitionKey,
          quantity: 1,
          unitPrice,
          proceeds: unitPrice,
          itemIds: [item.id],
          cause: 'fold',
        },
      }),
    );
    guild.wealth += unitPrice;
    moveItem(world, item.id, marketHolder);
  }
  for (const stack of Object.values(world.stacks)) {
    if (heldByGuild(stack.holder)) delete world.stacks[stack.id];
  }
  return events;
}
