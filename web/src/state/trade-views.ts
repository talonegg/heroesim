// The Market, the Unattached pool and the Transfer Offers (M7-S3 part 2, DL-73): the CLI's
// `show market`, `show pool` and `show offers`, in its words (`cli/src/commands/market.ts`,
// `cli/src/render.ts`, `cli/src/commands/transfer.ts`), less the ids and keys a command line takes.
//
// Nothing here computes a rule (ADR-0007, principle 12): prices are the Market Engine's
// (`marketStock`, `sellPrice`), fees the engine's (`signingFee` at the player's Guildmaster's
// Negotiation), whether a Hero signs its `signingRefusal`, and the offers its `offersTo`.

import {
  ageOf,
  guildmasterOf,
  holdings,
  itemDefinition,
  marketStock,
  offersTo,
  playerGuild,
  sellPrice,
  signingFee,
  signingRefusal,
  unattachedHeroes,
  type HeroId,
  type ItemDefinition,
  type ItemDefinitionKey,
  type ItemId,
  type OfferId,
  type StackId,
  type WorldDocument,
} from '@heroesim/engine';
import { content } from '../content';
import { nameIn, nightOf, rowOf } from './names';
import { playDeps } from './reducer';

// ── The Market ───────────────────────────────────────────────────────────────────────────────

/** An Item's kind as the CLI's Market shows it: its gear slot or `consumable`, and whether it is unique. */
function kindOf(definition: ItemDefinition): string {
  const kind = definition.kind === 'gear' ? `${definition.slot} gear` : 'consumable';
  return definition.unique ? `${kind}, unique` : kind;
}

/** What an Item does, in the CLI's Market's words: gear's Stat modifiers, a consumable's effect. */
function doesOf(definition: ItemDefinition): string {
  if (definition.kind === 'gear') {
    return Object.entries(definition.statModifiers)
      .map(([statKey, delta]) => `${nameIn(content.stats, statKey)} ${delta > 0 ? `+${delta}` : String(delta)}`)
      .join(', ');
  }
  const { effect } = definition;
  switch (effect.kind) {
    case 'bonus':
      return `+${effect.flat} on a ${effect.kinds.join(' or ')} Encounter`;
    case 'reroll':
      return `rolls a failed ${effect.kinds.join(' or ')} Encounter again`;
    case 'heal':
      return `an Injury on the Quest heals ${effect.days} Days sooner`;
  }
}

export interface ListingRow {
  /** What `buy` takes. */
  definitionKey: ItemDefinitionKey;
  name: string;
  /** `weapon gear`, `consumable`, `trinket gear, unique`. */
  kind: string;
  does: string;
  /** How many the Market has. */
  quantity: number;
  /** What one costs (`marketPrice`). */
  price: number;
}

export interface HeldForSale {
  /** Unique within the list. */
  key: string;
  name: string;
  /** How many the Guild holds: a stack's quantity, or 1 for a unique Item. */
  held: number;
  /** What the Market pays for one (`sellPrice`), or `null` when it cannot price it. */
  sellsFor: number | null;
  /** What `sell` takes: the stack, of which some may be sold, or the unique Item. */
  sale: { stackId: StackId } | { itemId: ItemId };
}

export interface MarketView {
  forSale: ListingRow[];
  /** Items for sale counted one by one, a stack by its quantity. */
  totalForSale: number;
  /** The player's Guild, its Wealth and what it holds itself; `null` and empty without one. */
  guildName: string | null;
  wealth: number | null;
  held: HeldForSale[];
}

/**
 * `show market`: what the Market has for sale, with each price; then what the player's Guild holds
 * itself, stacks then unique Items as the CLI lists them, with what each sells for. An Item a Hero
 * carries or a Party took is not the Guild's to sell here, and is not listed.
 */
export function marketView(document: WorldDocument): MarketView {
  const { world } = document;
  const deps = playDeps(document);
  const stock = marketStock(world, deps);
  const guild = playerGuild(world);
  const forSale = stock.map(({ definition, quantity, price }) => ({
    definitionKey: definition.key,
    name: definition.name,
    kind: kindOf(definition),
    does: doesOf(definition),
    quantity,
    price,
  }));
  const totalForSale = stock.reduce((sum, { quantity }) => sum + quantity, 0);
  if (guild === undefined) return { forSale, totalForSale, guildName: null, wealth: null, held: [] };

  const { items, stacks } = holdings(world, { kind: 'guild', id: guild.id });
  const held: HeldForSale[] = [
    ...stacks.map((stack) => ({
      key: stack.id,
      name: nameIn(content.items, stack.definitionKey),
      held: stack.quantity,
      sellsFor: sellPrice(stack.definitionKey, deps),
      sale: { stackId: stack.id },
    })),
    ...items.map((item) => ({
      key: item.id,
      name: itemDefinition(content, item.definitionKey)?.name ?? item.definitionKey,
      held: 1,
      sellsFor: sellPrice(item.definitionKey, deps),
      sale: { itemId: item.id },
    })),
  ];
  return { forSale, totalForSale, guildName: guild.name, wealth: guild.wealth, held };
}

// ── The Unattached pool ──────────────────────────────────────────────────────────────────────

export interface PoolRow {
  heroId: HeroId;
  name: string;
  className: string;
  level: number;
  age: number;
  morale: number;
  background: string;
  /** The signing fee the player's Guild would pay (`signingFee`, its Guildmaster's Negotiation), or the list price without one. */
  fee: number;
  /** `yes`, or `needs Fame 40` (`signingRefusal`); `null` in a save with no player's Guild. */
  signs: string | null;
}

export interface PoolView {
  rows: PoolRow[];
  /** The player's Guild's Fame, which a Hero of a higher Level asks of it (M3-S5). */
  note: string | null;
}

/** `show pool`: the Unattached Heroes, in id order, each with the fee and whether they would sign. */
export function poolView(document: WorldDocument): PoolView {
  const { world } = document;
  const deps = playDeps(document);
  const guild = playerGuild(world);
  const buyer = guild === undefined ? undefined : guildmasterOf(guild, world);
  const rows = unattachedHeroes(world).map((hero) => {
    const refusal = guild === undefined ? null : signingRefusal(guild, hero, deps.config);
    return {
      heroId: hero.id,
      name: hero.name,
      className: nameIn(content.classes, hero.classKey),
      level: hero.level,
      age: ageOf(hero, world.turn, deps.config),
      morale: hero.morale,
      background: nameIn(content.backgrounds, hero.backgroundKey),
      fee: signingFee(hero, deps, buyer),
      signs: guild === undefined ? null : refusal === null ? 'yes' : `needs Fame ${refusal.fameRequired}`,
    };
  });
  const note =
    guild === undefined ? null : `${guild.name} has ${guild.fame} Fame. A Hero who needs more will not sign for it until it has that much.`;
  return { rows, note };
}

// ── Transfer Offers ──────────────────────────────────────────────────────────────────────────

export interface OfferRow {
  /** What `acceptTransfer` and `declineTransfer` take. */
  offerId: OfferId;
  /** `The Ashford Guild offers 180 Wealth for Bran Tull, until the night of Day 12.` */
  sentence: string;
}

/**
 * `show offers`: the Transfer Offers standing for Heroes of the player's Guild (`offersTo`), in id
 * order, with who offers what for whom and the night each expires; `null` with no player's Guild.
 */
export function offersView(document: WorldDocument): { guildName: string; offers: OfferRow[] } | null {
  const { world } = document;
  const guild = playerGuild(world);
  if (guild === undefined) return null;
  return {
    guildName: guild.name,
    offers: offersTo(world, guild.id).map((offer) => {
      const bidder = rowOf(world.guilds, offer.toGuildId)?.name ?? 'A Guild';
      const hero = rowOf(world.heroes, offer.heroId)?.name ?? 'a Hero';
      return { offerId: offer.id, sentence: `${bidder} offers ${offer.fee} Wealth for ${hero}, until ${nightOf(offer.expiresOnTurn)}.` };
    }),
  };
}
