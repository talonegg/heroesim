// `equip` and `unequip` (M5-S2, R30, DL-49): a Guild puts gear from its holding into one of its
// Heroes' slots, or takes it back. Every Guild does so through these rules, the player's front end by
// `equip` and `unequip` and a Rival's controller by `applyEquip` (ADR-0002, DL-30); `steady` and the
// harness's policy choose what to equip through `gearChoices` (gear.ts).
//
// What gear does is read where Stats are read: `effectiveStats` adds the modifiers of what a Hero
// carries (selectors.ts), and the Check reads it. Nothing here changes a Stat.

import type { EngineDeps } from '../config.js';
import { gearSlotKeys, type ItemDefinitionKey, type SlotKey } from '../content-types.js';
import type {
  Guild,
  GuildId,
  Hero,
  HeroId,
  Holder,
  ItemId,
  Stack,
  StackId,
  UniqueItem,
  World,
  WorldDocument,
} from '../document.js';
import { eventEmitter } from '../emit.js';
import type { EngineEvent } from '../events.js';
import { gearParticipants, gearUnavailability, moveToGuild, type GearUnavailability } from '../gear.js';
import { holdings, itemDefinition, moveItem, moveStack } from '../items.js';
import { applyToCopy, type ActionResult, type Rejection, type WorldActionResult } from './result.js';

/** The gear to equip: a unique Item in the Guild's holding, or a stack there, of which one unit is taken. */
export type GearRef = { itemId: ItemId; stackId?: never } | { stackId: StackId; itemId?: never };

/** What `equip` is asked: the action without its `kind`. */
export type EquipRequest = {
  /** The Guild whose holding the gear is in and whose Roster the Hero is on. */
  guildId: GuildId;
  heroId: HeroId;
  /** The slot to fill: the gear's own, which it is when not given. */
  slot?: SlotKey;
} & GearRef;

export type EquipAction = { kind: 'equip' } & EquipRequest;

export interface UnequipAction {
  kind: 'unequip';
  guildId: GuildId;
  heroId: HeroId;
  /** The slot to empty: any slot the Hero holds an Item in, a gear slot or not. */
  slot: SlotKey;
}

/** What `unequip` is asked: the action without its `kind`. */
export type UnequipRequest = Omit<UnequipAction, 'kind'>;

// ── Rejections ───────────────────────────────────────────────────────────────────────────────

/** The Guild has folded (M2-S10): it has left play and equips no one again. */
export interface EquipGuildFolded extends Rejection<'equip', 'guild-folded'> {
  guildId: GuildId;
}

/** The Hero is not on the Guild's Roster: another Guild's, Unattached, or no Hero at all. */
export interface EquipHeroNotOnRoster extends Rejection<'equip', 'hero-not-on-roster'> {
  heroId: HeroId;
  guildId: GuildId;
}

/** The Hero of the Guild is dead, retired, or away with a Party, which has their gear with it. */
export interface EquipHeroUnavailable extends Rejection<'equip', 'hero-unavailable'> {
  heroId: HeroId;
  because: GearUnavailability;
}

/**
 * The Item or stack is not in the Guild's holding: another holder's (another Guild's, a Party's, the
 * Market's, or a Hero's, gear on a Hero being unequipped first), or no row at all.
 */
export interface NotHeldByGuild extends Rejection<'equip', 'not-held-by-guild'> {
  itemId: ItemId | null;
  stackId: StackId | null;
}

/** The Item is not gear: a consumable, or a definition content does not define (data-model rule 5). */
export interface NotGear extends Rejection<'equip', 'not-gear'> {
  definitionKey: ItemDefinitionKey;
}

/**
 * The gear does not go in the slot: the slot asked is not the gear's own (`slot` ≠ `gearSlot`), or
 * the gear's own is not a slot Heroes have (`heroSlots`, `gearSlotKeys`, DL-193).
 */
export interface WrongSlot extends Rejection<'equip', 'wrong-slot'> {
  definitionKey: ItemDefinitionKey;
  /** The slot asked, or the gear's own when none was. */
  slot: SlotKey;
  gearSlot: SlotKey;
  heroSlots: SlotKey[];
}

/** The Hero's slot already holds an Item, `occupant`: it is unequipped first; `equip` never swaps. */
export interface SlotOccupied extends Rejection<'equip', 'slot-occupied'> {
  heroId: HeroId;
  slot: SlotKey;
  occupant: ItemId | StackId;
}

/** Why a Guild could not equip a Hero, in the order `equip` checks. */
export type EquipRejection =
  | EquipGuildFolded
  | EquipHeroNotOnRoster
  | EquipHeroUnavailable
  | NotHeldByGuild
  | NotGear
  | WrongSlot
  | SlotOccupied;

export interface UnequipGuildFolded extends Rejection<'unequip', 'guild-folded'> {
  guildId: GuildId;
}

export interface UnequipHeroNotOnRoster extends Rejection<'unequip', 'hero-not-on-roster'> {
  heroId: HeroId;
  guildId: GuildId;
}

export interface UnequipHeroUnavailable extends Rejection<'unequip', 'hero-unavailable'> {
  heroId: HeroId;
  because: GearUnavailability;
}

/** The Hero's slot holds nothing. */
export interface SlotEmpty extends Rejection<'unequip', 'slot-empty'> {
  heroId: HeroId;
  slot: SlotKey;
}

/** Why a Guild could not unequip a Hero, in the order `unequip` checks. */
export type UnequipRejection = UnequipGuildFolded | UnequipHeroNotOnRoster | UnequipHeroUnavailable | SlotEmpty;

// ── equip ────────────────────────────────────────────────────────────────────────────────────

/**
 * `guildId` puts gear from its holding into a slot of `heroId`: the unique Item `itemId` whole, or
 * one unit of the stack `stackId` (`moveStack`, the rest staying in the holding), into the gear's
 * own slot, and emits `item.equipped`, naming the Hero, the Guild and the Item or the Hero's stack.
 *
 * Refused, changing nothing, in this order (DL-49): `guild-folded`; `hero-not-on-roster`;
 * `hero-unavailable` (dead, retired, or away with a Party; an injured Hero may be equipped);
 * `not-held-by-guild` (no such row, or not in this Guild's holding); `not-gear`; `wrong-slot` (a
 * slot asked that is not the gear's own, or one that is no gear slot); `slot-occupied`.
 * Throws on a programming error: a Guild the world does not hold, or neither or both of `itemId` and
 * `stackId`.
 *
 * The returned document has a new `world`, a copy, so a document that shares the old one is left as
 * it was (DL-24); `meta` and `history` are shared, and the event is appended to the History.
 */
export function equip(document: WorldDocument, request: EquipRequest, deps: EngineDeps): ActionResult<EquipRejection> {
  return applyToCopy(document, (world) => applyEquip(world, request, deps));
}

/**
 * `equip`'s rule on a world it changes in place: the same checks in the same order, the same change
 * and the same `item.equipped`, which it returns rather than appends. `equip` runs it on a copy of a
 * document's world; a Rival controller runs it on the Turn's copy (DL-30). A refusal changes nothing.
 */
export function applyEquip(world: World, request: EquipRequest, deps: EngineDeps): WorldActionResult<EquipRejection> {
  const { guildId, heroId } = request;
  const itemId = request.itemId ?? null;
  const stackId = request.stackId ?? null;
  if ((itemId === null) === (stackId === null)) {
    throw new RangeError('equip names the gear by itemId or by stackId, and by one of them only');
  }
  const guild = own(world.guilds, guildId);
  if (guild === undefined) throw new RangeError(`No Guild in the world has the id ${guildId}`);
  if (guild.foldedOnTurn !== null) {
    return { ok: false, rejection: { action: 'equip', reason: 'guild-folded', guildId } };
  }
  const hero = own(world.heroes, heroId);
  if (!isGuildHero(hero, guild)) {
    return { ok: false, rejection: { action: 'equip', reason: 'hero-not-on-roster', heroId, guildId } };
  }
  const because = gearUnavailability(hero);
  if (because !== null) {
    return { ok: false, rejection: { action: 'equip', reason: 'hero-unavailable', heroId, because } };
  }

  const row: UniqueItem | Stack | undefined =
    itemId !== null ? own(world.items, itemId) : own(world.stacks, stackId ?? '');
  if (row === undefined || row.holder.kind !== 'guild' || row.holder.id !== guildId) {
    return { ok: false, rejection: { action: 'equip', reason: 'not-held-by-guild', itemId, stackId } };
  }
  const definition = itemDefinition(deps.content, row.definitionKey);
  if (definition?.kind !== 'gear') {
    return { ok: false, rejection: { action: 'equip', reason: 'not-gear', definitionKey: row.definitionKey } };
  }
  const gearSlot = definition.slot;
  const slot = request.slot ?? gearSlot;
  if (slot !== gearSlot || !gearSlotKeys.includes(gearSlot)) {
    const heroSlots = [...gearSlotKeys];
    return {
      ok: false,
      rejection: { action: 'equip', reason: 'wrong-slot', definitionKey: row.definitionKey, slot, gearSlot, heroSlots },
    };
  }
  const into: Holder = { kind: 'hero', id: heroId, slot };
  const inSlot = holdings(world, into);
  const occupant = inSlot.items[0]?.id ?? inSlot.stacks[0]?.id;
  if (occupant !== undefined) {
    return { ok: false, rejection: { action: 'equip', reason: 'slot-occupied', heroId, slot, occupant } };
  }

  let moved: { itemId: ItemId | null; stackId: StackId | null };
  if (itemId !== null) {
    moveItem(world, itemId, into);
    moved = { itemId, stackId: null };
  } else {
    moved = { itemId: null, stackId: moveStack(world, row.id as StackId, 1, into) };
  }
  const move = { heroId, guildId, slot, definitionKey: row.definitionKey, ...moved };
  const equipped = eventEmitter(world)({ type: 'item.equipped', participants: gearParticipants(move), payload: move });
  return { ok: true, events: [equipped] };
}

// ── unequip ──────────────────────────────────────────────────────────────────────────────────

/**
 * `guildId` takes what `heroId` holds in `slot` back into its holding, a stack joining the Guild's
 * stack of its definition, and emits `item.unequipped` for it, naming the Hero, the Guild and the
 * Item or the Guild's stack. Any slot the Hero holds an Item in may be emptied, one that is no gear
 * slot among them (DL-49).
 *
 * Refused, changing nothing, in this order: `guild-folded`; `hero-not-on-roster`; `hero-unavailable`
 * (dead, retired, or away with a Party); `slot-empty`. Throws on a Guild the world does not hold.
 * The document is copied and the event appended as `equip`'s are.
 */
export function unequip(
  document: WorldDocument,
  request: UnequipRequest,
  deps: EngineDeps,
): ActionResult<UnequipRejection> {
  return applyToCopy(document, (world) => applyUnequip(world, request, deps));
}

/**
 * `unequip`'s rule on a world it changes in place, returning its events rather than appending them;
 * a refusal changes nothing. `deps` is taken for the seam every action shares (DL-30); the rule
 * reads none.
 */
export function applyUnequip(
  world: World,
  { guildId, heroId, slot }: UnequipRequest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- every action takes deps (epics README §4); this rule reads none
  _deps: EngineDeps,
): WorldActionResult<UnequipRejection> {
  const guild = own(world.guilds, guildId);
  if (guild === undefined) throw new RangeError(`No Guild in the world has the id ${guildId}`);
  if (guild.foldedOnTurn !== null) {
    return { ok: false, rejection: { action: 'unequip', reason: 'guild-folded', guildId } };
  }
  const hero = own(world.heroes, heroId);
  if (!isGuildHero(hero, guild)) {
    return { ok: false, rejection: { action: 'unequip', reason: 'hero-not-on-roster', heroId, guildId } };
  }
  const because = gearUnavailability(hero);
  if (because !== null) {
    return { ok: false, rejection: { action: 'unequip', reason: 'hero-unavailable', heroId, because } };
  }
  const { items, stacks } = holdings(world, { kind: 'hero', id: heroId, slot });
  const rows = [...items, ...stacks];
  if (rows.length === 0) return { ok: false, rejection: { action: 'unequip', reason: 'slot-empty', heroId, slot } };

  const emit = eventEmitter(world);
  const events: EngineEvent[] = rows.map((row) => {
    const move = moveToGuild(world, row, guildId);
    return emit({ type: 'item.unequipped', participants: gearParticipants(move), payload: move });
  });
  return { ok: true, events };
}

// ── Shared ───────────────────────────────────────────────────────────────────────────────────

/**
 * True when `hero` is `guild`'s: on its Roster, or dead or retired off it with its `guildId` kept
 * (DL-20 item 3), whom the next check refuses as unavailable rather than as a stranger — `dispatch`'s
 * reading (DL-25).
 */
function isGuildHero(hero: Hero | undefined, guild: Guild): hero is Hero {
  if (hero === undefined || hero.guildId !== guild.id) return false;
  return hero.diedOnTurn !== null || hero.retiredOnTurn !== null || guild.rosterIds.includes(hero.id);
}

/** The row keyed `id`, looked up without falling through to `Object.prototype`. */
function own<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}
