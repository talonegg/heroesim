// `buy` (M5-S4, R31, DL-51): a Guild buys Items the Market has for sale, at the Market price. Every
// Guild buys through this one rule, a front end by `buy` and a controller by `applyBuy` (ADR-0002,
// DL-30); in M5 no Disposition does, and `steady` ignores the Market.

import type { EngineDeps } from '../config.js';
import type { ItemDefinitionKey } from '../content-types.js';
import type { Guild, GuildId, ItemId, World, WorldDocument } from '../document.js';
import { eventEmitter } from '../emit.js';
import { findStack, holdings, itemDefinition, moveItem, moveStack } from '../items.js';
import { marketHolder, marketPrice } from '../market.js';
import { applyToCopy, type ActionResult, type Rejection, type WorldActionResult } from './result.js';

export interface BuyAction {
  kind: 'buy';
  /** The Guild that buys and pays. */
  guildId: GuildId;
  /** The definition of the Items bought, as the Market lists it. */
  definitionKey: ItemDefinitionKey;
  /** How many: a whole number from 1. */
  quantity: number;
}

/** What `buy` is asked: the action without its `kind`. */
export type BuyRequest = Omit<BuyAction, 'kind'>;

/** The Guild has folded (M2-S10): it has left play and buys nothing again. */
export interface BuyGuildFolded extends Rejection<'buy', 'guild-folded'> {
  guildId: GuildId;
}

/**
 * The Market has none of the definition for sale: no stack of a common one, no Item of a unique
 * one, or a definition content does not define (data-model rule 5).
 */
export interface NotInMarket extends Rejection<'buy', 'not-in-market'> {
  definitionKey: ItemDefinitionKey;
}

/** The Market has fewer of the definition than were asked for. */
export interface BuyInsufficientQuantity extends Rejection<'buy', 'insufficient-quantity'> {
  definitionKey: ItemDefinitionKey;
  quantity: number;
  available: number;
}

/** The Guild's Wealth is below the price of what it asked for. */
export interface BuyInsufficientWealth extends Rejection<'buy', 'insufficient-wealth'> {
  cost: number;
  wealth: number;
}

/** Why a Guild could not buy. */
export type BuyRejection = BuyGuildFolded | NotInMarket | BuyInsufficientQuantity | BuyInsufficientWealth;

/**
 * `guildId` buys `quantity` Items of `definitionKey` from the Market: deducts `marketPrice` ×
 * `quantity` from its Wealth and moves them to its holding, a common Item's quantity from the
 * Market's stack into the Guild's stack of it, a unique definition's Items the Market holds in id
 * order; emits `item.bought`. Wealth equal to the cost is enough. A unique Item listed on the Market,
 * as a folded Guild's are (pre-M0 review D6), is bought like any other, at its Market price.
 *
 * Refused, changing nothing: `guild-folded`, `not-in-market`, `insufficient-quantity`,
 * `insufficient-wealth`, in that order. Throws on a programming error: a Guild id the world does not
 * hold, or a quantity that is not a whole number from 1.
 *
 * The returned document has a new `world`, a copy, so a document that shares the old one is left as
 * it was (DL-24); `meta` and `history` are shared, and the event is appended to the History.
 */
export function buy(document: WorldDocument, request: BuyRequest, deps: EngineDeps): ActionResult<BuyRejection> {
  return applyToCopy(document, (world) => applyBuy(world, request, deps));
}

/**
 * `buy`'s rule on a world it changes in place: the same checks in the same order, the same changes
 * and the same `item.bought`, which it returns rather than appends (DL-30). A refusal changes
 * nothing. Throws on the programming errors `buy` throws on.
 */
export function applyBuy(
  world: World,
  { guildId, definitionKey, quantity }: BuyRequest,
  deps: EngineDeps,
): WorldActionResult<BuyRejection> {
  const guild: Guild | undefined = Object.hasOwn(world.guilds, guildId) ? world.guilds[guildId] : undefined;
  if (guild === undefined) throw new RangeError(`No Guild in the world has the id ${guildId}`);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError(`A Guild buys a whole number of Items from 1, not ${quantity}`);
  }
  if (guild.foldedOnTurn !== null) {
    return { ok: false, rejection: { action: 'buy', reason: 'guild-folded', guildId } };
  }

  const definition = itemDefinition(deps.content, definitionKey);
  const unitPrice = marketPrice(definitionKey, deps);
  const stack = definition?.unique === false ? findStack(world, definitionKey, marketHolder) : undefined;
  const uniqueItems =
    definition?.unique === true
      ? holdings(world, marketHolder).items.filter((item) => item.definitionKey === definitionKey)
      : [];
  const available = stack?.quantity ?? uniqueItems.length;
  if (unitPrice === null || available === 0) {
    return { ok: false, rejection: { action: 'buy', reason: 'not-in-market', definitionKey } };
  }
  if (quantity > available) {
    return {
      ok: false,
      rejection: { action: 'buy', reason: 'insufficient-quantity', definitionKey, quantity, available },
    };
  }
  const cost = unitPrice * quantity;
  if (guild.wealth < cost) {
    return { ok: false, rejection: { action: 'buy', reason: 'insufficient-wealth', cost, wealth: guild.wealth } };
  }

  guild.wealth -= cost;
  const holder = { kind: 'guild', id: guildId } as const;
  // `holdings` lists the Market's Items in id order: the lowest ids are bought first.
  const itemIds: ItemId[] = stack === undefined ? uniqueItems.slice(0, quantity).map((item) => item.id) : [];
  if (stack !== undefined) moveStack(world, stack.id, quantity, holder);
  for (const itemId of itemIds) moveItem(world, itemId, holder);

  const bought = eventEmitter(world)({
    type: 'item.bought',
    participants: [guildId, ...itemIds],
    payload: { guildId, definitionKey, quantity, unitPrice, cost, itemIds },
  });
  return { ok: true, events: [bought] };
}
