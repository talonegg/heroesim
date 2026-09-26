// The Market from the CLI (M5-S4, DL-51): `show market`, `buy --item <key> [--quantity <n>]` and
// `sell --stack <stackId> [--quantity <n>]` or `sell --item <itemId>`. What each does to an open save
// and what it prints; `main.ts` opens the save, and writes it back only when a purchase or a sale
// succeeds.
//
// The CLI holds no rule: the engine's `buy` and `sell` decide, its Market Engine prices
// (`marketStock`, `sellPrice`), and a refusal is its typed rejection put into words here (ADR-0003).

import {
  buy,
  holdings,
  marketStock,
  playerGuild,
  sell,
  sellPrice,
  type BuyRejection,
  type ContentSet,
  type EngineDeps,
  type Guild,
  type ItemBought,
  type ItemDefinition,
  type ItemSold,
  type SellRejection,
  type WorldDocument,
} from '@heroesim/engine';
import type { Command } from '../args.js';
import { nameIn, renderTime, rowIn, table } from '../render.js';
import type { CommandOutcome } from './outcome.js';

/** `3 × Whetstone`, or the name alone for one. */
function counted(quantity: number, name: string): string {
  return quantity === 1 ? name : `${quantity} × ${name}`;
}

/** An Item's kind as a column shows it: its gear slot or `consumable`, and whether it is unique. */
function kindOf(definition: ItemDefinition): string {
  const kind = definition.kind === 'gear' ? definition.slot : 'consumable';
  return definition.unique ? `${kind}, unique` : kind;
}

/** What an Item does, in words: gear's Stat modifiers, a consumable's effect. */
function effectOf(definition: ItemDefinition, content: ContentSet): string {
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

/**
 * `show market`: what the Market has for sale, each definition by the key `buy` takes, with its
 * kind, what it does, how many and its price; then what the player's Guild holds itself, by the id
 * `sell` takes, with what each would sell for. An Item a Hero carries or a Party took is not listed.
 */
export function renderMarket(document: WorldDocument, deps: EngineDeps): string[] {
  const { world } = document;
  const { content } = deps;
  const stock = marketStock(world, deps);
  const guild = playerGuild(world);
  // Items counted one by one, a stack by its quantity; the kinds are the rows below.
  const total = stock.reduce((sum, { quantity }) => sum + quantity, 0);
  const kinds = `${stock.length} ${stock.length === 1 ? 'kind' : 'kinds'}`;
  const heading = `Market: ${total} ${total === 1 ? 'Item' : 'Items'} for sale, of ${kinds}, ${renderTime(world.turn, deps.config)}`;
  const lines = [
    heading,
    '',
    ...(stock.length === 0
      ? ['The Market has nothing for sale.']
      : table(
          [
            { heading: 'Key' },
            { heading: 'Item' },
            { heading: 'Kind' },
            { heading: 'Does' },
            { heading: 'For sale', align: 'right' },
            { heading: 'Price', align: 'right' },
          ],
          stock.map(({ definition, quantity, price }) => [
            definition.key,
            definition.name,
            kindOf(definition),
            effectOf(definition, content),
            String(quantity),
            String(price),
          ]),
        )),
  ];
  if (guild === undefined) return lines;

  const { items, stacks } = holdings(world, { kind: 'guild', id: guild.id });
  const held = [
    ...stacks.map((stack) => [stack.id, stack.definitionKey, stack.quantity] as const),
    ...items.map((item) => [item.id, item.definitionKey, 1] as const),
  ];
  lines.push('', `${guild.name} has ${guild.wealth} Wealth and holds:`, '');
  if (held.length === 0) return [...lines, 'Nothing to sell.'];
  return [
    ...lines,
    ...table(
      [{ heading: 'Id' }, { heading: 'Item' }, { heading: 'Held', align: 'right' }, { heading: 'Each sells for', align: 'right' }],
      held.map(([id, definitionKey, quantity]) => [
        id,
        nameIn(content.items, definitionKey),
        String(quantity),
        String(sellPrice(definitionKey, deps) ?? 'nothing'),
      ]),
    ),
  ];
}

/** The engine's refusal of a purchase in words. */
function explainBuy(rejection: BuyRejection, guild: Guild, content: ContentSet): string {
  switch (rejection.reason) {
    case 'guild-folded':
      return `${guild.name} has folded and buys nothing.`;
    case 'not-in-market':
      return `The Market has no ${nameIn(content.items, rejection.definitionKey)} for sale (show market).`;
    case 'insufficient-quantity':
      return (
        `The Market has ${rejection.available} ${nameIn(content.items, rejection.definitionKey)}; ` +
        `${rejection.quantity} cannot be bought.`
      );
    case 'insufficient-wealth':
      return `That costs ${rejection.cost} Wealth; ${guild.name} has ${rejection.wealth}.`;
  }
}

/**
 * `buy --item <key> [--quantity <n>]`: the player's Guild buys from the Market under the save's own
 * deps, and says what it bought, for how much, and the Wealth left.
 */
export function buyItems(command: Extract<Command, { name: 'buy' }>, document: WorldDocument, deps: EngineDeps): CommandOutcome {
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: "The save has no player's Guild." };

  const result = buy(document, { guildId: guild.id, definitionKey: command.item, quantity: command.quantity }, deps);
  if (!result.ok) return { ok: false, problem: explainBuy(result.rejection, guild, deps.content) };

  const bought = result.events.find((event): event is ItemBought => event.type === 'item.bought');
  const after = rowIn(result.document.world.guilds, guild.id);
  if (bought === undefined || after === undefined) throw new Error('buy succeeded but bought nothing');
  const { definitionKey, quantity, unitPrice, cost, itemIds } = bought.payload;
  const what = counted(quantity, nameIn(deps.content.items, definitionKey));
  return {
    ok: true,
    document: result.document,
    lines: [
      `Bought ${what}${itemIds.length === 0 ? '' : ` (${itemIds.join(', ')})`} for ${cost} Wealth, ${unitPrice} each.`,
      `${guild.name} has ${after.wealth} Wealth left.`,
    ],
  };
}

/** The engine's refusal of a sale in words. */
function explainSell(rejection: SellRejection, guild: Guild, document: WorldDocument, content: ContentSet): string {
  switch (rejection.reason) {
    case 'guild-folded':
      return `${guild.name} has folded and sells nothing.`;
    case 'not-held-by-guild':
      return `${guild.name} holds no ${rejection.id} to sell (show market lists what it holds).`;
    case 'equipped': {
      const hero = rowIn(document.world.heroes, rejection.heroId)?.name ?? rejection.heroId;
      return `${hero} (${rejection.heroId}) carries ${rejection.id} as their ${rejection.slot}; unequip it first.`;
    }
    case 'unknown-item':
      return `The Market cannot price ${nameIn(content.items, rejection.definitionKey)}: the content does not define it.`;
    case 'insufficient-quantity':
      return `${rejection.stackId} holds ${rejection.available}; ${rejection.quantity} cannot be sold from it.`;
  }
}

/**
 * `sell --stack <stackId> [--quantity <n>]` or `sell --item <itemId>`: the player's Guild sells to
 * the Market under the save's own deps, and says what it sold, for how much, and its Wealth after.
 */
export function sellItems(command: Extract<Command, { name: 'sell' }>, document: WorldDocument, deps: EngineDeps): CommandOutcome {
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: "The save has no player's Guild." };

  const request =
    'stack' in command
      ? { guildId: guild.id, stackId: command.stack, quantity: command.quantity }
      : { guildId: guild.id, itemId: command.item };
  const result = sell(document, request, deps);
  if (!result.ok) return { ok: false, problem: explainSell(result.rejection, guild, document, deps.content) };

  const sold = result.events.find((event): event is ItemSold => event.type === 'item.sold');
  const after = rowIn(result.document.world.guilds, guild.id);
  if (sold === undefined || after === undefined) throw new Error('sell succeeded but sold nothing');
  const { definitionKey, quantity, unitPrice, proceeds } = sold.payload;
  return {
    ok: true,
    document: result.document,
    lines: [
      `Sold ${counted(quantity, nameIn(deps.content.items, definitionKey))} to the Market for ${proceeds} Wealth, ${unitPrice} each.`,
      `${guild.name} has ${after.wealth} Wealth.`,
    ],
  };
}
