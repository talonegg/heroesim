// What a controller sells of its Guild's surplus (Q18, DL-301): gear in the holding no Hero would
// equip over what they carry, consumables above the Guild's stock (rivalHealItemStock for a Rival,
// the policy's own), and loot-only Items no one carries. In debt, the whole holding is sold before
// the debt sale (DL-301).
//
// Beside `consumable-choices.ts` and `gear.ts`, this holds what controllers sell to the Market outside
// the afternoon's one purchase. Reads, never writes, and draws nothing.

import type { GuildAction } from './actions/action.js';
import type { SellAction } from './actions/sell.js';
import type { EngineDeps } from './config.js';
import {
  gearSlotKeys,
  type ConsumableEffectKind,
  type ItemDefinitionKey,
  type SlotKey,
} from './content-types.js';
import {
  compareByCodeUnit,
  rowOf,
  type Guild,
  type HeroId,
  type ItemId,
  type StackId,
  type World,
} from './document.js';
import { worthOf } from './gear.js';
import { holdings, itemDefinition } from './items.js';
import { sellPrice } from './market.js';

/** How a controller keeps consumables when selling surplus (Q18, DL-301). */
export interface SurplusKeeping {
  /** The effects of the consumables the Guild keeps: the policy every one, a Rival `heal` alone. */
  effects: readonly ConsumableEffectKind[];
  /** How many of each definition the Guild keeps, at home and carried by its Parties together. */
  stock: number;
}

/** The target id (Item or Stack) of a SellAction for deterministic sorting. */
function sellTargetId(action: SellAction): string {
  return 'itemId' in action ? action.itemId : action.stackId;
}

/** A piece of gear in the Guild's holding under consideration for surplus. */
interface GearItemCandidate {
  isStack: false;
  id: ItemId;
  available: 1;
  definitionKey: ItemDefinitionKey;
  slot: SlotKey;
  worth: number;
}

interface GearStackCandidate {
  isStack: true;
  id: StackId;
  available: number;
  definitionKey: ItemDefinitionKey;
  slot: SlotKey;
  worth: number;
}

type GearCandidate = GearItemCandidate | GearStackCandidate;

/**
 * What `guild` sells to the Market now (Q18, DL-301): outside the afternoon's one purchase, gear in
 * the holding no Hero would equip over what they carry, consumables above the Guild's stock
 * (`keeping.stock`), and loot-only Items no one carries.
 *
 * In debt (`guild.belowFloorSince !== null`), the entire holding is sold before the debt sale (DL-301).
 * When not in debt, surplus items are sold:
 * - loot-only Items in the holding (which no Hero carries) are sold;
 * - consumables of effects not kept, and excess units above `stock` (counting holding and parties together);
 * - gear in the holding beyond what living Heroes lack in each slot, best pieces kept first.
 *
 * When `plannedActions` are provided (e.g. equips or dispatches chosen earlier in the afternoon), items
 * and stacks committed to them are deducted so that sales never conflict with them. None for a folded Guild.
 */
export function surplusChoices(
  world: Pick<World, 'heroes' | 'items' | 'stacks' | 'parties'>,
  guild: Pick<Guild, 'id' | 'rosterIds' | 'belowFloorSince' | 'foldedOnTurn'>,
  keeping: Readonly<SurplusKeeping>,
  deps: Pick<EngineDeps, 'config' | 'content'>,
  plannedActions: readonly GuildAction[] = [],
): SellAction[] {
  if (guild.foldedOnTurn !== null) return [];

  // Track commitments from plannedActions in the same turn:
  const equippedItemIds = new Set<ItemId>();
  const equippedStackUnits = new Map<StackId, number>();
  const heroFilledSlots = new Map<HeroId, Set<SlotKey>>();

  for (const row of [...Object.values(world.items), ...Object.values(world.stacks)]) {
    if (row.holder.kind === 'hero') {
      const slots = heroFilledSlots.get(row.holder.id) ?? new Set<SlotKey>();
      slots.add(row.holder.slot);
      heroFilledSlots.set(row.holder.id, slots);
    }
  }

  const dispatchedDefQuantities = new Map<ItemDefinitionKey, number>();

  for (const action of plannedActions) {
    if (action.kind === 'equip' && action.guildId === guild.id) {
      if (action.itemId) equippedItemIds.add(action.itemId);
      if (action.stackId) equippedStackUnits.set(action.stackId, (equippedStackUnits.get(action.stackId) ?? 0) + 1);
      const item = action.itemId ? world.items[action.itemId] : action.stackId ? world.stacks[action.stackId] : undefined;
      const def = item ? itemDefinition(deps.content, item.definitionKey) : undefined;
      if (def?.kind === 'gear') {
        const slots = heroFilledSlots.get(action.heroId) ?? new Set<SlotKey>();
        slots.add(def.slot);
        heroFilledSlots.set(action.heroId, slots);
      }
    } else if (action.kind === 'dispatch' && action.guildId === guild.id) {
      for (const req of action.consumables ?? []) {
        dispatchedDefQuantities.set(req.definitionKey, (dispatchedDefQuantities.get(req.definitionKey) ?? 0) + req.quantity);
      }
    }
  }

  const held = holdings(world, { kind: 'guild', id: guild.id });
  const actions: SellAction[] = [];

  // In debt: the whole holding is sold before the debt sale (DL-301)
  if (guild.belowFloorSince !== null) {
    for (const item of held.items) {
      if (equippedItemIds.has(item.id)) continue;
      if (sellPrice(item.definitionKey, deps) === null) continue;
      actions.push({ kind: 'sell', guildId: guild.id, itemId: item.id });
    }
    for (const stack of held.stacks) {
      const dispatched = dispatchedDefQuantities.get(stack.definitionKey) ?? 0;
      const equipped = equippedStackUnits.get(stack.id) ?? 0;
      const available = stack.quantity - equipped - dispatched;
      if (available <= 0) continue;
      if (sellPrice(stack.definitionKey, deps) === null) continue;
      actions.push({ kind: 'sell', guildId: guild.id, stackId: stack.id, quantity: available });
    }
    actions.sort((a, b) => compareByCodeUnit(sellTargetId(a), sellTargetId(b)));
    return actions;
  }

  // Not in debt: sell surplus items.

  // 1. Loot-only Items in holding: no one carries them (DL-301)
  for (const item of held.items) {
    if (equippedItemIds.has(item.id)) continue;
    const def = itemDefinition(deps.content, item.definitionKey);
    if (def?.value !== undefined && sellPrice(item.definitionKey, deps) !== null) {
      actions.push({ kind: 'sell', guildId: guild.id, itemId: item.id });
    }
  }

  // 2. Consumables above the Guild's stock
  const remainingAllowance = new Map<ItemDefinitionKey, number>();
  for (const stack of held.stacks) {
    const def = itemDefinition(deps.content, stack.definitionKey);
    if (def?.kind !== 'consumable') continue;
    if (sellPrice(stack.definitionKey, deps) === null) continue;

    const equipped = equippedStackUnits.get(stack.id) ?? 0;
    const dispatched = dispatchedDefQuantities.get(stack.definitionKey) ?? 0;
    const available = stack.quantity - equipped - dispatched;
    if (available <= 0) continue;

    if (!keeping.effects.includes(def.effect.kind)) {
      // Not an effect the Guild keeps: sell all available
      actions.push({ kind: 'sell', guildId: guild.id, stackId: stack.id, quantity: available });
    } else {
      if (!remainingAllowance.has(stack.definitionKey)) {
        let inParties = dispatched;
        for (const party of Object.values(world.parties)) {
          if (party.guildId === guild.id) {
            for (const s of holdings(world, { kind: 'party', id: party.id }).stacks) {
              if (s.definitionKey === stack.definitionKey) inParties += s.quantity;
            }
          }
        }
        remainingAllowance.set(stack.definitionKey, Math.max(0, keeping.stock - inParties));
      }
      const allowed = remainingAllowance.get(stack.definitionKey) ?? 0;
      if (available > allowed) {
        const surplus = available - allowed;
        actions.push({ kind: 'sell', guildId: guild.id, stackId: stack.id, quantity: surplus });
        remainingAllowance.set(stack.definitionKey, 0);
      } else {
        remainingAllowance.set(stack.definitionKey, allowed - available);
      }
    }
  }

  // 3. Gear in holding no Hero would equip over what they carry
  const living = guild.rosterIds.filter((heroId) => {
    const hero = rowOf(world.heroes, heroId);
    return hero !== undefined && hero.diedOnTurn === null && hero.retiredOnTurn === null;
  });

  const gearBySlot = new Map<SlotKey, GearCandidate[]>(gearSlotKeys.map((s) => [s, []]));

  for (const item of held.items) {
    if (equippedItemIds.has(item.id)) continue;
    const def = itemDefinition(deps.content, item.definitionKey);
    if (def?.value !== undefined) continue; // Loot-only handled above
    if (def?.kind !== 'gear') continue;
    if (sellPrice(item.definitionKey, deps) === null) continue;
    const worth = worthOf(def);
    if (!gearSlotKeys.includes(def.slot) || worth <= 0) {
      actions.push({ kind: 'sell', guildId: guild.id, itemId: item.id });
    } else {
      gearBySlot.get(def.slot)?.push({
        id: item.id,
        isStack: false,
        available: 1,
        definitionKey: item.definitionKey,
        slot: def.slot,
        worth,
      });
    }
  }

  for (const stack of held.stacks) {
    const def = itemDefinition(deps.content, stack.definitionKey);
    if (def?.kind !== 'gear') continue;
    if (sellPrice(stack.definitionKey, deps) === null) continue;
    const equipped = equippedStackUnits.get(stack.id) ?? 0;
    const dispatched = dispatchedDefQuantities.get(stack.definitionKey) ?? 0;
    const available = stack.quantity - equipped - dispatched;
    if (available <= 0) continue;
    const worth = worthOf(def);
    if (!gearSlotKeys.includes(def.slot) || worth <= 0) {
      actions.push({ kind: 'sell', guildId: guild.id, stackId: stack.id, quantity: available });
    } else {
      gearBySlot.get(def.slot)?.push({
        id: stack.id,
        isStack: true,
        available,
        definitionKey: stack.definitionKey,
        slot: def.slot,
        worth,
      });
    }
  }

  for (const slot of gearSlotKeys) {
    const candidates = gearBySlot.get(slot) ?? [];
    if (candidates.length === 0) continue;
    const needed = living.filter((heroId) => heroFilledSlots.get(heroId)?.has(slot) !== true).length;
    candidates.sort((a, b) => b.worth - a.worth || compareByCodeUnit(a.id, b.id));

    let keepCount = needed;
    for (const piece of candidates) {
      if (keepCount >= piece.available) {
        keepCount -= piece.available;
      } else {
        const surplus = piece.available - keepCount;
        keepCount = 0;
        if (piece.isStack) {
          actions.push({ kind: 'sell', guildId: guild.id, stackId: piece.id, quantity: surplus });
        } else {
          actions.push({ kind: 'sell', guildId: guild.id, itemId: piece.id });
        }
      }
    }
  }

  actions.sort((a, b) => compareByCodeUnit(sellTargetId(a), sellTargetId(b)));
  return actions;
}
