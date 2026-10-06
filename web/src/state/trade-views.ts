// The Market, the Unattached pool and the Transfer Offers (M7-S3 part 2, DL-73): the CLI's
// `show market`, `show pool` and `show offers`, in its words (`cli/src/commands/market.ts`,
// `cli/src/render.ts`, `cli/src/commands/transfer.ts`), less the ids and keys a command line takes.
//
// Nothing here computes a rule (ADR-0007, principle 12): prices are the Market Engine's
// (`marketStock`, `sellPrice`), fees the engine's (`signingFee` at the player's Guildmaster's
// Negotiation), whether a Hero signs its `signingRefusal`, and the offers its `offersTo`.

import {
  ageOf,
  gearSlotKeys,
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
  type Hero,
  type HeroId,
  type ItemDefinition,
  type ItemDefinitionKey,
  type ItemId,
  type OfferId,
  type Sex,
  type SlotKey,
  type StackId,
  type WorldDocument,
} from '@heroesim/engine';
import { capitalised, itemEffectWords, kindOf, nameIn, nightOfTurn } from '@heroesim/words';
import { content } from '../content';
import type { Facets } from './facets';
import { classMarkOf, type ClassMarked, rowOf, transferCostWords } from './names';
import { calendarFor, playDeps } from './reducer';
import { defaultHeroOrder } from './selectors';

// ── The Market ───────────────────────────────────────────────────────────────────────────────

// An Item's kind as a cell says it (`kindOf`), `Weapon Gear, Unique Item`, its first word the Kind
// filter's chip (DL-125 item 9), which the Stores says too (M9-F3); and what it does, as the CLI's
// Market says it (`itemEffectWords`): `@heroesim/words` (v1.1.6-S11, DL-186 item 1).

/** A kind of Item the Market's table can be filtered by: a gear slot, or `consumable` (M9-S6). */
export type MarketKind = SlotKey | 'consumable';

/** An Item's kind for the Market's filter, and the Stores' (M9-F3): its gear slot, or `consumable`. */
export function kindKeyOf(definition: ItemDefinition): MarketKind {
  return definition.kind === 'gear' ? definition.slot : 'consumable';
}

export interface ListingRow {
  /** What `buy` takes. */
  definitionKey: ItemDefinitionKey;
  name: string;
  /** `Weapon Gear`, `Consumable`, `Trinket Gear, Unique Item`. */
  kind: string;
  /** The kind the Market's filter chips name (M9-S6). */
  kindKey: MarketKind;
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
  /** The Item's content key, and whether it is a Unique Item, which shows its picture (DL-125 item 8). */
  definitionKey: ItemDefinitionKey;
  unique: boolean;
  /** `Weapon Gear`, `Consumable`, as the Market says it; empty for an Item content does not define. */
  kind: string;
  /** What it does, as the Market says it; empty for an Item content does not define. */
  does: string;
  /** How many the Guild holds: a stack's quantity, or 1 for a unique Item. */
  held: number;
  /** What the Market pays for one (`sellPrice`), or `null` when it cannot price it. */
  sellsFor: number | null;
  /** What `sell` takes: the stack, of which some may be sold, or the unique Item. */
  sale: { stackId: StackId } | { itemId: ItemId };
}

export interface MarketView {
  /** Everything the Market has for sale, a listing to each kind of Item. */
  forSale: ListingRow[];
  /**
   * The Buy's filter, by kind, several choices: each kind the Market has for sale, the gear slots in
   * their order then consumables, each option counted by `faceted` (M9-S6, the review's B3; DL-206
   * items 26 to 29, DL-213).
   */
  facets: Facets<ListingRow, 'kind'>;
  /** Items for sale counted one by one, a stack by its quantity. */
  totalForSale: number;
  /** The player's Guild, its Wealth and what it holds itself; `null` and empty without one. */
  guildName: string | null;
  wealth: number | null;
  held: HeldForSale[];
}

/**
 * `show market`: what the Market has for sale, with each price, and its filter by kind (display only,
 * M9-S6, DL-213); then what the player's Guild holds itself, stacks then unique Items as the
 * CLI lists them, each with its kind, what it does and what it sells for. An Item a Hero carries or
 * a Party took is not the Guild's to sell here, and is not listed.
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
    kindKey: kindKeyOf(definition),
    does: itemEffectWords(definition, content),
    quantity,
    price,
  }));
  const kinds = [...gearSlotKeys, 'consumable' as const].filter((key) => forSale.some((row) => row.kindKey === key));
  const facets: Facets<ListingRow, 'kind'> = {
    kind: { label: 'Show for sale', options: kinds.map((key) => ({ key, label: capitalised(key) })), of: (row) => row.kindKey },
  };
  const totalForSale = stock.reduce((sum, { quantity }) => sum + quantity, 0);
  if (guild === undefined) return { forSale, facets, totalForSale, guildName: null, wealth: null, held: [] };

  const { items, stacks } = holdings(world, { kind: 'guild', id: guild.id });
  const described = (key: ItemDefinitionKey): { definitionKey: ItemDefinitionKey; unique: boolean; kind: string; does: string } => {
    const definition = itemDefinition(content, key);
    return definition === undefined
      ? { definitionKey: key, unique: false, kind: '', does: '' }
      : { definitionKey: key, unique: definition.unique, kind: kindOf(definition), does: itemEffectWords(definition, content) };
  };
  const held: HeldForSale[] = [
    ...stacks.map((stack) => ({
      key: stack.id,
      name: nameIn(content.items, stack.definitionKey),
      ...described(stack.definitionKey),
      held: stack.quantity,
      sellsFor: sellPrice(stack.definitionKey, deps),
      sale: { stackId: stack.id },
    })),
    ...items.map((item) => ({
      key: item.id,
      name: itemDefinition(content, item.definitionKey)?.name ?? item.definitionKey,
      ...described(item.definitionKey),
      held: 1,
      sellsFor: sellPrice(item.definitionKey, deps),
      sale: { itemId: item.id },
    })),
  ];
  return { forSale, facets, totalForSale, guildName: guild.name, wealth: guild.wealth, held };
}

// ── The Unattached pool ──────────────────────────────────────────────────────────────────────

export interface PoolRow extends ClassMarked {
  heroId: HeroId;
  name: string;
  /** Their sex and Portrait's key, for the thumbnail beside their name (v1.1.3-S7, DL-135 item 9). */
  sex: Sex;
  portraitKey: string | null;
  level: number;
  age: number;
  morale: number;
  background: string;
  /** The signing fee the player's Guild would pay (`signingFee`, its Guildmaster's Negotiation), or the list price without one. */
  fee: number;
  /** `Yes`, or `Needs Fame 40` (`signingRefusal`), as its cell says it; `null` in a save with no player's Guild. */
  signs: string | null;
  /** Whether they would sign for the player's Guild now (`signingRefusal`), for the row to be set back when not; `null` as `signs`. */
  willSign: boolean | null;
}

/** How the pool may be ordered for display (M9-S6): as it lists them, by Class in the content's order, or by fee, lowest first. */
export type PoolOrder = 'listed' | 'class' | 'fee';

export interface PoolView {
  rows: PoolRow[];
  /** The player's Guild's Fame, which a Hero of a higher Level asks of it (M3-S5). */
  note: string | null;
}

/**
 * `show pool`: the Unattached Heroes, each with the fee and whether they would sign, in id order, or
 * by Class in the content's declared order, ties in the Roster's default order (`defaultHeroOrder`,
 * v1.1.6-S14, DL-186 item 24), or by fee lowest first, ties in id order: an order for display, which
 * changes nothing in the world (M9-S6, the review's B8).
 */
export function poolView(document: WorldDocument, order: PoolOrder = 'listed'): PoolView {
  const { world } = document;
  const deps = playDeps(document);
  const guild = playerGuild(world);
  const buyer = guild === undefined ? undefined : guildmasterOf(guild, world);
  const heroes = unattachedHeroes(world);
  const rows = heroes.map((hero) => {
    const refusal = guild === undefined ? null : signingRefusal(guild, hero, deps.config);
    return {
      heroId: hero.id,
      name: hero.name,
      sex: hero.sex,
      portraitKey: hero.portraitKey,
      ...classMarkOf(content, hero.classKey),
      level: hero.level,
      age: ageOf(hero, world.turn, deps.config),
      morale: hero.morale,
      background: nameIn(content.backgrounds, hero.backgroundKey),
      fee: signingFee(hero, deps, buyer),
      signs: guild === undefined ? null : refusal === null ? 'Yes' : `Needs Fame ${refusal.fameRequired}`,
      willSign: guild === undefined ? null : refusal === null,
    };
  });
  // A stable sort: a fee's ties keep the pool's own order; a Class's are the Roster's default order, which begins with the Class.
  if (order === 'class') {
    const byDefault = defaultHeroOrder(document);
    const heroOf = new Map(heroes.map((hero) => [hero.id, hero]));
    rows.sort((a, b) => byDefault(heroOf.get(a.heroId) as Hero, heroOf.get(b.heroId) as Hero));
  }
  if (order === 'fee') rows.sort((a, b) => a.fee - b.fee);
  const note =
    guild === undefined ? null : `${guild.name} has ${guild.fame} Fame. A Hero who needs more will not sign for it until it has that much.`;
  return { rows, note };
}

// ── Transfer Offers ──────────────────────────────────────────────────────────────────────────

export interface OfferRow {
  /** What `acceptTransfer` and `declineTransfer` take. */
  offerId: OfferId;
  /** `The Ashford Guild offers 180 Wealth for Bran Tull, until the night of Year 1 Day 13.` */
  sentence: string;
  /** The Guild that makes the offer. */
  guildName: string;
  heroName: string;
  fee: number;
  /**
   * What Accept asks before it lets the Hero go (M9-S6, the review's E4): `Accepting sends Bran Tull
   * to The Ashford Guild for 180 Wealth.`, then what a Transfer out costs, in the page's words.
   */
  confirm: string;
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
      return {
        offerId: offer.id,
        sentence: `${bidder} offers ${offer.fee} Wealth for ${hero}, until ${nightOfTurn(offer.expiresOnTurn, calendarFor(document))}.`,
        guildName: bidder,
        heroName: hero,
        fee: offer.fee,
        confirm: `Accepting sends ${hero} to ${bidder} for ${offer.fee} Wealth. ${transferCostWords}`,
      };
    }),
  };
}
