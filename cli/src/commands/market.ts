// The Market from the CLI (M5-S4, DL-51): `show market`, `buy --item <key> [--quantity <n>]` and
// `sell --stack <stackId> [--quantity <n>]` or `sell --item <itemId>`. What each does to an open save
// and what it prints; `main.ts` opens the save, and writes it back only when a purchase or a sale
// succeeds.
//
// The CLI holds no rule: the engine's `buy` and `sell` decide, its Market Engine prices
// (`marketStock`, `sellPrice`), and a refusal is its typed rejection in the refusals' words (ADR-0003,
// DL-240).

import {
  applyAction,
  holdings,
  marketStock,
  playerGuild,
  sellPrice,
  type EngineDeps,
  type ItemBought,
  type ItemSold,
  type WorldDocument,
} from '@heroesim/engine';
import type { Command } from '../args.js';
import { itemEffectWords, kindOf, nameIn, rowOf } from '@heroesim/words';
import { refusalLine } from '../namer.js';
import { renderTime, table } from '../render.js';
import type { CommandOutcome } from './outcome.js';

/** `3 × Whetstone`, or the name alone for one. */
function counted(quantity: number, name: string): string {
  return quantity === 1 ? name : `${quantity} × ${name}`;
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
            itemEffectWords(definition, content),
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

/**
 * `buy --item <key> [--quantity <n>]`: the player's Guild buys from the Market under the save's own
 * deps, and says what it bought, for how much, and the Wealth left.
 */
export function buyItems(command: Extract<Command, { name: 'buy' }>, document: WorldDocument, deps: EngineDeps): CommandOutcome {
  const setting = { world: document.world, content: deps.content, calendar: deps.config };
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: refusalLine({ action: 'buy', reason: 'no-player-guild' }, setting) };

  const result = applyAction(document, { kind: 'buy', guildId: guild.id, definitionKey: command.item, quantity: command.quantity }, deps);
  if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };

  const bought = result.events.find((event): event is ItemBought => event.type === 'item.bought');
  const after = rowOf(result.document.world.guilds, guild.id);
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

/**
 * `sell --stack <stackId> [--quantity <n>]` or `sell --item <itemId>`: the player's Guild sells to
 * the Market under the save's own deps, and says what it sold, for how much, and its Wealth after.
 */
export function sellItems(command: Extract<Command, { name: 'sell' }>, document: WorldDocument, deps: EngineDeps): CommandOutcome {
  const setting = { world: document.world, content: deps.content, calendar: deps.config };
  const guild = playerGuild(document.world);
  if (guild === undefined) return { ok: false, problem: refusalLine({ action: 'sell', reason: 'no-player-guild' }, setting) };

  const request =
    'stack' in command
      ? { guildId: guild.id, stackId: command.stack, quantity: command.quantity }
      : { guildId: guild.id, itemId: command.item };
  const result = applyAction(document, { kind: 'sell', ...request }, deps);
  if (!result.ok) return { ok: false, problem: refusalLine(result.rejection, setting) };

  const sold = result.events.find((event): event is ItemSold => event.type === 'item.sold');
  const after = rowOf(result.document.world.guilds, guild.id);
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
