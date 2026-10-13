// `sell` (M5-S4, R31, DL-51): a Guild sells Items from its holding to the Market, which pays its
// sell price and lists them: a stack until the next morning's refresh clears the Market's stacks, a
// unique Item until a Guild buys it. Every Guild sells through this one rule, `applySell`, a front
// end by `applyAction` and a controller on the Turn's copy (ADR-0002, DL-30), as a Rival and the
// harness's policy sell their surplus (`surplusChoices`, DL-301).

import type { EngineDeps } from '../config.js';
import type { ItemDefinitionKey, SlotKey } from '../content-types.js';
import {
  rowOf,
  type Guild,
  type GuildId,
  type HeroId,
  type Holder,
  type ItemId,
  type StackId,
  type World,
} from '../document.js';
import { eventEmitter } from '../emit.js';
import { moveItem, moveStack } from '../items.js';
import { marketHolder, sellPrice } from '../market.js';
import type { Rejection, WorldActionResult } from './result.js';

/** A Guild sells `quantity` Items of one of its stacks. */
export interface SellStackAction {
  kind: 'sell';
  /** The Guild that sells and is paid. */
  guildId: GuildId;
  stackId: StackId;
  /** How many: a whole number from 1. */
  quantity: number;
}

/** A Guild sells one of its unique Items. */
export interface SellItemAction {
  kind: 'sell';
  guildId: GuildId;
  itemId: ItemId;
}

export type SellAction = SellStackAction | SellItemAction;

/** What `sell` is asked: the action without its `kind`. */
export type SellRequest = Omit<SellStackAction, 'kind'> | Omit<SellItemAction, 'kind'>;

/** The Guild has folded (M2-S10): it has left play and sells nothing again. */
export interface SellGuildFolded extends Rejection<'sell', 'guild-folded'> {
  guildId: GuildId;
}

/**
 * The Guild's own holding has no such stack or Item: another holder has it, a Party of the Guild's
 * carries it, or it has no row, as a stack sold, merged or expended has not.
 */
export interface SellNotHeldByGuild extends Rejection<'sell', 'not-held-by-guild'> {
  id: StackId | ItemId;
}

/** A Hero of the Guild carries it in a gear slot: it is unequipped before it is sold. */
export interface SellEquipped extends Rejection<'sell', 'equipped'> {
  id: StackId | ItemId;
  heroId: HeroId;
  slot: SlotKey;
}

/** Content does not define the Item, so the Market cannot price it (data-model rule 5). */
export interface SellUnknownItem extends Rejection<'sell', 'unknown-item'> {
  definitionKey: ItemDefinitionKey;
}

/** The stack holds fewer Items than were offered. */
export interface SellInsufficientQuantity extends Rejection<'sell', 'insufficient-quantity'> {
  stackId: StackId;
  quantity: number;
  available: number;
}

/** Why a Guild could not sell. */
export type SellRejection =
  | SellGuildFolded
  | SellNotHeldByGuild
  | SellEquipped
  | SellUnknownItem
  | SellInsufficientQuantity;

/**
 * `guildId` sells to the Market `quantity` Items of stack `stackId`, or its unique Item `itemId`,
 * held by the Guild itself (not a Hero's slot, not a Party): credits `sellPrice` × the quantity to
 * its Wealth, moves them to the Market, where a stack joins the Market's stack of the definition,
 * and emits `item.sold` (`cause: 'sale'`).
 *
 * Refused, changing nothing: `guild-folded`, `not-held-by-guild`, `equipped`, `unknown-item`,
 * `insufficient-quantity`, in that order. Throws on a programming error: a Guild id the world does
 * not hold, or a quantity that is not a whole number from 1.
 *
 * Changes `world` in place and returns its events rather than appending them: `applyAction` runs
 * it on a copy of a document's world, a Rival controller on the Turn's copy (DL-30).
 */
export function applySell(world: World, request: SellRequest, deps: EngineDeps): WorldActionResult<SellRejection> {
  const { guildId } = request;
  const guild: Guild | undefined = rowOf(world.guilds, guildId);
  if (guild === undefined) throw new RangeError(`No Guild in the world has the id ${guildId}`);
  const quantity = 'stackId' in request ? request.quantity : 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError(`A Guild sells a whole number of Items from 1, not ${quantity}`);
  }
  if (guild.foldedOnTurn !== null) {
    return { ok: false, rejection: { action: 'sell', reason: 'guild-folded', guildId } };
  }

  const id = 'stackId' in request ? request.stackId : request.itemId;
  // A unique Item is one Item; a stack is its quantity.
  const row: { definitionKey: ItemDefinitionKey; holder: Holder; quantity?: number } | undefined =
    'stackId' in request ? rowOf(world.stacks, request.stackId) : rowOf(world.items, request.itemId);
  if (row === undefined) return { ok: false, rejection: { action: 'sell', reason: 'not-held-by-guild', id } };
  const refusal = heldRefusal(world, guildId, id, row.holder);
  if (refusal !== null) return { ok: false, rejection: refusal };
  const { definitionKey, quantity: available = 1 } = row;
  const unitPrice = sellPrice(definitionKey, deps);
  if (unitPrice === null) return { ok: false, rejection: { action: 'sell', reason: 'unknown-item', definitionKey } };
  if ('stackId' in request && quantity > available) {
    return {
      ok: false,
      rejection: { action: 'sell', reason: 'insufficient-quantity', stackId: request.stackId, quantity, available },
    };
  }

  const proceeds = unitPrice * quantity;
  const itemIds: ItemId[] = 'itemId' in request ? [request.itemId] : [];
  const sold = eventEmitter(world)({
    type: 'item.sold',
    participants: [guildId, ...itemIds],
    payload: { guildId, definitionKey, quantity, unitPrice, proceeds, itemIds, cause: 'sale' },
  });
  guild.wealth += proceeds;
  if ('stackId' in request) moveStack(world, request.stackId, quantity, marketHolder);
  else moveItem(world, request.itemId, marketHolder);
  return { ok: true, events: [sold] };
}

/**
 * Why `guildId` cannot sell what `holder` holds, or `null` when the Guild's own holding has it: a
 * Hero of the Guild's carrying it is `equipped`; any other holder `not-held-by-guild`.
 */
function heldRefusal(
  world: World,
  guildId: GuildId,
  id: StackId | ItemId,
  holder: Holder,
): SellNotHeldByGuild | SellEquipped | null {
  if (holder.kind === 'guild' && holder.id === guildId) return null;
  if (holder.kind === 'hero' && world.heroes[holder.id]?.guildId === guildId) {
    return { action: 'sell', reason: 'equipped', id, heroId: holder.id, slot: holder.slot };
  }
  return { action: 'sell', reason: 'not-held-by-guild', id };
}
