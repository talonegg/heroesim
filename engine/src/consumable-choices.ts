// What a controller buys and carries of the consumables (DL-62, DL-288): the two choices the
// harness's policy made alone until the Rivals bought and carried heal Items too (DL-280 item 7,
// Q16 b; the architecture review's candidate 4). Gear's choices, `gearChoices` and `gearPurchase`,
// are beside it in `gear.ts`; this holds the consumables', read by every controller by the effects
// it keeps: the policy every one, a Rival `heal` alone. Each reads, never writes, and draws nothing.

import type { BuyAction } from './actions/buy.js';
import type { ConsumableRequest } from './actions/dispatch.js';
import type { EngineDeps } from './config.js';
import type { ConsumableEffectKind, ItemDefinitionKey } from './content-types.js';
import { compareByCodeUnit, type Guild, type HeroId, type Quest, type World } from './document.js';
import { holdings, itemDefinition } from './items.js';
import { marketStock } from './market.js';
import { upkeep } from './selectors.js';

/** How a controller keeps consumables: which, how many, and from what means (DL-62, DL-288). */
export interface ConsumableKeeping {
  /** The effects of the consumables it keeps: the policy every one, a Rival `heal` alone. */
  effects: readonly ConsumableEffectKind[];
  /** How many of each definition it keeps, at home and carried by its Parties together. */
  stock: number;
  /** It buys only while its Wealth is above this many times the purchase's cost, and covers it. */
  wealthMultiple: number;
  /**
   * And only while, once paid, it keeps more than this many Upkeeps (the policy's, DL-62); no reserve
   * when absent, as a Rival buys gear (DL-288).
   */
  reserveUpkeeps?: number;
}

/** What a Party a controller sends on `quest` carries: `consumablesToCarry`'s answer for one dispatch. */
export type Carry = (quest: Pick<Quest, 'encounterKeys'>, heroIds: readonly HeroId[]) => ConsumableRequest[];

/** How many of each consumable of `effects` `holder`'s stacks hold, added to `into`, by definition. */
function tally(
  world: Pick<World, 'items' | 'stacks'>,
  holder: Parameters<typeof holdings>[1],
  effects: readonly ConsumableEffectKind[],
  deps: Pick<EngineDeps, 'content'>,
  into: Map<ItemDefinitionKey, number>,
): Map<ItemDefinitionKey, number> {
  for (const stack of holdings(world, holder).stacks) {
    const definition = itemDefinition(deps.content, stack.definitionKey);
    if (definition?.kind === 'consumable' && effects.includes(definition.effect.kind)) {
      into.set(stack.definitionKey, (into.get(stack.definitionKey) ?? 0) + stack.quantity);
    }
  }
  return into;
}

/**
 * What the Parties `guild` sends now carry (DL-62): each call, for one Party of `heroIds` sent on
 * `quest`, gives one of each consumable of `effects` the Guild's own holding has left, in key order,
 * that could serve the Quest — a `bonus` or a `reroll` whose kinds hold the kind of one of its
 * Encounters, and any `heal` — and takes each from what is left, so that the Parties sent the same
 * Turn never ask for more than the Guild holds. None for a Party of no one, and none of a consumable
 * the Guild has none of left. Reads `world` once, as it stands, and changes nothing.
 */
export function consumablesToCarry(
  world: Pick<World, 'items' | 'stacks'>,
  guild: Pick<Guild, 'id'>,
  effects: readonly ConsumableEffectKind[],
  deps: Pick<EngineDeps, 'content'>,
): Carry {
  const left = tally(world, { kind: 'guild', id: guild.id }, effects, deps, new Map());
  const keys = [...left.keys()].sort(compareByCodeUnit);
  return (quest, heroIds) => {
    if (heroIds.length === 0) return [];
    const { encounters } = deps.content;
    const kinds = new Set(quest.encounterKeys.flatMap((key) => (Object.hasOwn(encounters, key) ? [encounters[key]?.kind] : [])));
    const carried: ConsumableRequest[] = [];
    for (const definitionKey of keys) {
      const definition = itemDefinition(deps.content, definitionKey);
      if (definition?.kind !== 'consumable' || (left.get(definitionKey) ?? 0) === 0) continue;
      const { effect } = definition;
      if (!(effect.kind === 'heal' || effect.kinds.some((kind) => kinds.has(kind)))) continue;
      carried.push({ definitionKey, quantity: 1 });
      left.set(definitionKey, (left.get(definitionKey) ?? 0) - 1);
    }
    return carried;
  };
}

/**
 * The consumables `guild` would buy now toward `keeping.stock` of each of `keeping.effects` (DL-62,
 * DL-288), or `null`. Its count of a definition is its own holding's and its Parties' together, since
 * what a Party carries comes home unless used. Of the consumables of those effects on the Market it
 * has fewer of, the one it has fewest of, the lowest key among equals, as many as it lacks and the
 * Market has, when its Wealth is above `wealthMultiple` times their cost and covers it, and once it
 * is paid keeps more than `reserveUpkeeps` Upkeeps where it has one; `null` when none is lacking, for
 * sale or within its means, and for a folded Guild. The policy buys by it with its own numbers, every
 * effect; a Rival, in its gear step, `heal` by its Disposition's `gearThreshold` (DL-288).
 */
export function consumablePurchase(
  world: Pick<World, 'heroes' | 'guildmasters' | 'items' | 'stacks' | 'parties'>,
  guild: Pick<Guild, 'id' | 'wealth' | 'rosterIds' | 'hall' | 'guildmasterId' | 'foldedOnTurn'>,
  keeping: Readonly<ConsumableKeeping>,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): BuyAction | null {
  if (guild.foldedOnTurn !== null) return null;
  const { effects, stock, wealthMultiple, reserveUpkeeps } = keeping;
  const owned = tally(world, { kind: 'guild', id: guild.id }, effects, deps, new Map());
  for (const party of Object.values(world.parties)) {
    if (party.guildId === guild.id) tally(world, { kind: 'party', id: party.id }, effects, deps, owned);
  }
  const reserve = reserveUpkeeps === undefined ? null : reserveUpkeeps * upkeep(guild, world, deps.config, deps.content);
  const [best] = marketStock(world, deps)
    .flatMap(({ definition, quantity, price }) => {
      if (definition.kind !== 'consumable' || !effects.includes(definition.effect.kind)) return [];
      const have = owned.get(definition.key) ?? 0;
      return [{ key: definition.key, have, quantity: Math.min(quantity, stock - have), cost: price * Math.min(quantity, stock - have) }];
    })
    .filter(
      ({ quantity, cost }) =>
        quantity > 0 && guild.wealth > wealthMultiple * cost && guild.wealth >= cost && (reserve === null || guild.wealth - cost > reserve),
    )
    .sort((a, b) => a.have - b.have || compareByCodeUnit(a.key, b.key));
  return best === undefined ? null : { kind: 'buy', guildId: guild.id, definitionKey: best.key, quantity: best.quantity };
}
