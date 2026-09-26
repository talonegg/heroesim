// Gear on Heroes (M5-S2, R30, data-model §3.3, DL-49): what the gear a Hero carries adds to their
// Stats, how gear goes back to a Guild's holding when its Hero can no longer carry it, and which
// gear a controller puts on which Hero. The two actions, `equip` and `unequip`, are in
// `actions/equip.ts`; this file holds what they share with the night's `gearReturn`, a Rival's fold,
// `steady` and the harness's policy.
//
// A Hero carries gear as Items whose holder is the Hero in a slot (`items.ts`): one unique Item or a
// stack of one per slot. Nothing on the Hero's row records it.

import type { EquipAction } from './actions/equip.js';
import type { EngineDeps } from './config.js';
import { gearSlotKeys, type ContentSet, type GearDefinition, type SlotKey, type StatKey } from './content-types.js';
import {
  compareByCodeUnit,
  type EntityId,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type Holder,
  type Stack,
  type UniqueItem,
  type World,
} from './document.js';
import type { Emit } from './emit.js';
import type { GearMove, GearReturnCause, ItemReturned } from './events.js';
import { holdings, itemDefinition, moveItem, moveStack } from './items.js';

/**
 * Why a Hero's gear cannot be changed now (DL-49): Death, Retirement, or away with a Party, which
 * takes the Hero's gear with it. An Injury is no bar: an injured Hero is at the Hall.
 */
export type GearUnavailability = 'dead' | 'retired' | 'in-party';

/** Why `equip` and `unequip` refuse `hero` now, or `null` when they would not: Death and Retirement first. */
export function gearUnavailability(
  hero: Pick<Hero, 'diedOnTurn' | 'retiredOnTurn' | 'partyId'>,
): GearUnavailability | null {
  if (hero.diedOnTurn !== null) return 'dead';
  if (hero.retiredOnTurn !== null) return 'retired';
  if (hero.partyId !== null) return 'in-party';
  return null;
}

/** A row of either table: a unique Item or a stack. */
type HeldRow = UniqueItem | Stack;

/**
 * The gear definition of an Item a Hero holds, when it is gear made for the slot it is in; else
 * `undefined`: a consumable, gear of another slot (the validator's `misplaced-item`), or a definition
 * content lacks (rule 5). What counts toward effective Stats.
 */
export function wornGear(
  row: Pick<HeldRow, 'definitionKey' | 'holder'>,
  content: Pick<ContentSet, 'items'>,
): GearDefinition | undefined {
  if (row.holder.kind !== 'hero') return undefined;
  const definition = itemDefinition(content, row.definitionKey);
  return definition?.kind === 'gear' && definition.slot === row.holder.slot ? definition : undefined;
}

/**
 * Everything Hero `heroId` carries, in the order of `gearSlotKeys` (weapon, armour, trinket), then by
 * id: unique Items and stacks together.
 */
export function carriedGear(world: Pick<World, 'items' | 'stacks'>, heroId: HeroId): HeldRow[] {
  const { items, stacks } = holdings(world, { kind: 'hero', id: heroId });
  const slotOrder = (row: HeldRow): number => {
    const index = row.holder.kind === 'hero' ? gearSlotKeys.indexOf(row.holder.slot) : -1;
    return index === -1 ? gearSlotKeys.length : index;
  };
  return [...items, ...stacks].sort((a, b) => slotOrder(a) - slotOrder(b) || compareByCodeUnit(a.id, b.id));
}

/**
 * The sum, by Hero Stat, of the modifiers of the gear Hero `heroId` carries in its own slots
 * (`wornGear`): what `effectiveStats` adds to the base (DL-49). A Stat no gear modifies has no entry.
 * Reads no config: gear counts wherever it is rightly placed, and `equip` alone asks which slots
 * `config.gearSlots` lists (DL-49).
 */
export function gearModifiers(
  heroId: HeroId,
  world: Pick<World, 'items' | 'stacks'>,
  content: Pick<ContentSet, 'items'>,
): Record<StatKey, number> {
  const total: Record<StatKey, number> = {};
  for (const row of carriedGear(world, heroId)) {
    const gear = wornGear(row, content);
    if (gear === undefined) continue;
    for (const [statKey, delta] of Object.entries(gear.statModifiers)) {
      total[statKey] = (Object.hasOwn(total, statKey) ? (total[statKey] ?? 0) : 0) + delta;
    }
  }
  return total;
}

/**
 * Moves `row`, which a Hero holds in a slot, whole to `guildId`'s holding, a stack joining the
 * Guild's stack of its definition, and says what moved: the Item, or the Guild's stack the unit is
 * now in. What `unequip`, `returnGear` and a fold share.
 *
 * @throws RangeError when `row` is not held by a Hero
 */
export function moveToGuild(world: Pick<World, 'items' | 'stacks' | 'counters'>, row: HeldRow, guildId: GuildId): GearMove {
  const { holder } = row;
  if (holder.kind !== 'hero') throw new RangeError(`${row.id} is not held by a Hero`);
  const to: Holder = { kind: 'guild', id: guildId };
  const move = { heroId: holder.id, guildId, slot: holder.slot, definitionKey: row.definitionKey };
  if ('quantity' in row) return { ...move, itemId: null, stackId: moveStack(world, row.id, row.quantity, to) };
  moveItem(world, row.id, to);
  return { ...move, itemId: row.id, stackId: null };
}

/** Who a gear event names: the Hero, the Guild, and the Item or stack. */
export function gearParticipants(move: GearMove): EntityId[] {
  const row: EntityId | null = move.itemId ?? move.stackId;
  return row === null ? [move.heroId, move.guildId] : [move.heroId, move.guildId, row];
}

/**
 * Takes every Item `hero` carries back to the holding of the Guild `hero.guildId` names, in
 * `carriedGear`'s order, with an `item.returned` for `cause` for each (DL-49): the night's
 * `gearReturn` for a Hero who died or retired, and a Rival's fold for each Hero on its Roster before
 * they leave it. M6's Transfer calls it too, before the Hero's Guild changes. A Hero who carries
 * nothing returns nothing.
 *
 * @throws RangeError when `hero` carries gear and is on no Roster: no Guild can take it back
 */
export function returnGear(
  world: Pick<World, 'items' | 'stacks' | 'counters'>,
  hero: Pick<Hero, 'id' | 'guildId'>,
  cause: GearReturnCause,
  emit: Emit,
): ItemReturned[] {
  const rows = carriedGear(world, hero.id);
  if (rows.length === 0) return [];
  const { guildId } = hero;
  if (guildId === null) throw new RangeError(`${hero.id} carries gear and is on no Roster, so no Guild can take it back`);
  return rows.map((row) => {
    const move = moveToGuild(world, row, guildId);
    return emit({ type: 'item.returned', participants: gearParticipants(move), payload: { ...move, cause } });
  });
}

/** A piece of gear in a Guild's holding a controller might put on a Hero. */
interface Piece {
  id: string;
  ref: Pick<EquipAction, 'itemId'> | Pick<EquipAction, 'stackId'>;
  units: number;
  slot: SlotKey;
  /** The sum of its Stat modifiers. */
  worth: number;
}

/**
 * The `equip` actions that put the gear `guild` holds onto its Heroes whose slot for it is empty
 * (DL-49): the one rule `steady` and the harness's policy share, so bought armour and Loot are worn.
 * The gear is every piece in the Guild's holding for a slot `config.gearSlots` lists whose
 * modifiers sum above 0, best first (the sum, then id), each unit of a stack a piece; each goes to
 * the first Hero in Roster order whom `equip` would accept (`gearUnavailability`: not dead, retired
 * or away) with that slot empty, until the gear or the Heroes run out. An injured Hero is equipped.
 *
 * Applied in order, every action is one `equip` accepts on `world` as it stands: a stack is named
 * once per unit it has, the last unit moving the stack itself. Reads, never writes, and draws
 * nothing. None for a folded Guild.
 */
export function gearChoices(
  world: Pick<World, 'heroes' | 'items' | 'stacks'>,
  guild: Pick<Guild, 'id' | 'rosterIds' | 'foldedOnTurn'>,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): EquipAction[] {
  if (guild.foldedOnTurn !== null) return [];
  const { config, content } = deps;
  const held = holdings(world, { kind: 'guild', id: guild.id });
  const pieces: Piece[] = [];
  for (const row of [...held.items, ...held.stacks]) {
    const definition = itemDefinition(content, row.definitionKey);
    if (definition?.kind !== 'gear' || !config.gearSlots.includes(definition.slot)) continue;
    const worth = Object.values(definition.statModifiers).reduce((sum, delta) => sum + delta, 0);
    if (worth <= 0) continue;
    const isStack = 'quantity' in row;
    pieces.push({
      id: row.id,
      ref: isStack ? { stackId: row.id } : { itemId: row.id },
      units: isStack ? row.quantity : 1,
      slot: definition.slot,
      worth,
    });
  }
  if (pieces.length === 0) return [];
  pieces.sort((a, b) => b.worth - a.worth || compareByCodeUnit(a.id, b.id));

  const free = new Map<SlotKey, HeroId[]>(config.gearSlots.map((slot) => [slot, []]));
  for (const heroId of guild.rosterIds) {
    const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
    if (hero === undefined || gearUnavailability(hero) !== null) continue;
    const filled = new Set(carriedGear(world, heroId).map((row) => (row.holder.kind === 'hero' ? row.holder.slot : null)));
    for (const slot of config.gearSlots) if (!filled.has(slot)) free.get(slot)?.push(heroId);
  }

  const actions: EquipAction[] = [];
  for (const piece of pieces) {
    const heroes = free.get(piece.slot) ?? [];
    for (let unit = 0; unit < piece.units; unit += 1) {
      const heroId = heroes.shift();
      if (heroId === undefined) break;
      actions.push({ kind: 'equip', guildId: guild.id, heroId, ...piece.ref } as EquipAction);
    }
  }
  return actions;
}
