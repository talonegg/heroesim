// `dispatch` (M2-S4, R23): a Guild sends a Party of its Heroes on a Quest from the Board. A
// standalone action in any Turn (pre-M0 review D2): the CLI applies it and saves, the harness's
// policy applies it between advances, both by `applyAction`, and a Rival's controller (M2-S9)
// produces the same action, applied through the same rule, `applyDispatch` (DL-30). The Party is
// away until `returnsOnTurn`, always a night Turn (pre-M0 review C4); the afternoon's `questsAdvance`
// does nothing with it until M4, and the night's `questsConclude` (M2-S5) resolves it. The choices
// here are DL-25; M4-S5 names each requirement a Party misses and has the Guildmaster's
// Negotiation set the reward agreed (DL-43); M5-S3 has the Party carry consumables from the Guild's
// holding (DL-50).

import type { EngineDeps } from '../config.js';
import type { ClassKey, ItemDefinitionKey, SkillKey } from '../content-types.js';
import {
  rowOf,
  takeId,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type Quest,
  type QuestId,
  type Stack,
  type World,
} from '../document.js';
import { eventEmitter } from '../emit.js';
import { guildmasterOf, negotiatedReward } from '../guildmaster.js';
import { findStack, itemDefinition, moveStack } from '../items.js';
import { returnNightOf } from '../time.js';
import type { Rejection, WorldActionResult } from './result.js';

export interface DispatchAction {
  kind: 'dispatch';
  guildId: GuildId;
  questId: QuestId;
  /** The Party, in the order given; each Hero once. */
  heroIds: HeroId[];
  /**
   * The consumables the Party carries, taken from the Guild's holding (M5-S3, DL-50), each
   * definition once; none when absent.
   */
  consumables?: ConsumableRequest[];
}

/** A consumable a Party is to carry (M5-S3): a definition and how many, a whole number from 1. */
export interface ConsumableRequest {
  definitionKey: ItemDefinitionKey;
  quantity: number;
}

/** What `dispatch` is asked: the action without its `kind`. */
export type DispatchRequest = Omit<DispatchAction, 'kind'>;

/** The Guild has folded (M2-S10): it has left play and sends no Party again (DL-31). */
export interface DispatchGuildFolded extends Rejection<'dispatch', 'guild-folded'> {
  guildId: GuildId;
}

/** The Quest is not on the Board: taken, expired, resolved, or never offered. */
export interface QuestNotOffered extends Rejection<'dispatch', 'quest-not-offered'> {
  questId: QuestId;
}

/** The Hero is not on the Guild's Roster: another Guild's, Unattached, or no Hero at all. */
export interface HeroNotOnRoster extends Rejection<'dispatch', 'hero-not-on-roster'> {
  heroId: HeroId;
  guildId: GuildId;
}

/** Why a Hero of the Guild cannot go: an Injury, Death, Retirement, or a Party already away. */
export type Unavailability = 'injured' | 'dead' | 'retired' | 'in-party';

export interface HeroUnavailable extends Rejection<'dispatch', 'hero-unavailable'> {
  heroId: HeroId;
  because: Unavailability;
}

/** Which of a Quest's requirements a Party misses (M4-S5, pre-M0 review E6). */
export type RequirementKind = 'party-size' | 'class' | 'skill';

/**
 * One requirement of a Quest a Party misses, named by `requirement`: its size is outside the
 * Quest's bounds (any size within them is accepted), or no Hero in it is of the Class, or holds the
 * Skill, the Quest requires.
 */
export type UnmetRequirement =
  | { requirement: 'party-size'; size: number; partySizeMin: number; partySizeMax: number }
  | { requirement: 'class'; classKey: ClassKey }
  | { requirement: 'skill'; skillKey: SkillKey };

/**
 * The Party misses one or more of the Quest's requirements (M2-S4; M4-S5 names each): every one it
 * misses, in the order party size, Class, Skill.
 */
export interface RequirementUnmet extends Rejection<'dispatch', 'requirement-unmet'> {
  questId: QuestId;
  unmet: UnmetRequirement[];
}

/** Content defines no consumable of the key: it is gear, or no Item at all (M5-S3). */
export interface DispatchNotConsumable extends Rejection<'dispatch', 'not-consumable'> {
  definitionKey: ItemDefinitionKey;
}

/** The Guild's holding has no stack of the consumable (M5-S3). */
export interface DispatchNotHeldByGuild extends Rejection<'dispatch', 'not-held-by-guild'> {
  definitionKey: ItemDefinitionKey;
  guildId: GuildId;
}

/** The Guild holds fewer of the consumable than the Party is to carry (M5-S3). */
export interface DispatchInsufficientQuantity extends Rejection<'dispatch', 'insufficient-quantity'> {
  definitionKey: ItemDefinitionKey;
  guildId: GuildId;
  held: number;
  requested: number;
}

export type DispatchRejection =
  | DispatchGuildFolded
  | QuestNotOffered
  | HeroNotOnRoster
  | HeroUnavailable
  | RequirementUnmet
  | DispatchNotConsumable
  | DispatchNotHeldByGuild
  | DispatchInsufficientQuantity;

/**
 * Sends `heroIds` of `guildId` on `questId`. The checks run in this order, and the first that
 * fails is the rejection (DL-25, DL-31): the Guild has not folded (`guild-folded`); the Quest is
 * on the Board (`quest-not-offered`); each Hero in turn is on the Guild's Roster
 * (`hero-not-on-roster`) and free to go (`hero-unavailable`: dead, retired, injured, or in a
 * Party); the Party meets the Quest's requirements (`requirement-unmet`, naming each it
 * misses: its size, its required Class, its required Skill; M4-S5, `unmetRequirements`); and each
 * consumable, in the order given, is a consumable (`not-consumable`), held by the Guild
 * (`not-held-by-guild`) in the quantity asked (`insufficient-quantity`; M5-S3, DL-50).
 *
 * On success, `world` gains a `parties` row departing this Turn and returning on
 * `nightOf(dayOf(turn) + durationDays)`, a night Turn whichever Turn of the Day it left in
 * (pre-M0 review C4); the Quest is `taken`, lists the Party and leaves the Board, and its reward
 * becomes the reward agreed, the Guild's Guildmaster's Negotiation applied (`negotiatedReward`,
 * M4-S5, R8), which the Quest Engine pays on a success; each Hero's `partyId` is the Party's; each
 * consumable moves from the Guild's holding to the Party's (M5-S3); and `quest.taken`, carrying the
 * reward agreed and the consumables carried, is returned.
 *
 * Throws on a programming error, as the validator would refuse the request: a Guild not in the
 * world, a Hero named twice, or a consumable named twice or in a quantity that is not a whole
 * number from 1.
 *
 * Changes `world` in place and returns its events rather than appending them: `applyAction` runs
 * it on a copy of a document's world, a Rival controller on the Turn's copy (DL-30).
 */
export function applyDispatch(
  world: World,
  request: DispatchRequest,
  deps: EngineDeps,
): WorldActionResult<DispatchRejection> {
  const { guildId, questId, heroIds, consumables = [] } = request;
  const guild = requestedGuild(world, request);
  const rejection = refusal(world, guild, request, deps);
  if (rejection !== null) return { ok: false, rejection };

  const quest = world.quests[questId] as Quest;
  const partyId = takeId(world, 'parties');
  const returnsOnTurn = returnNightOf(world.turn, quest);
  world.parties[partyId] = {
    id: partyId,
    questId,
    guildId,
    heroIds: [...heroIds],
    departedOnTurn: world.turn,
    returnsOnTurn,
  };
  quest.status = 'taken';
  quest.partyIds.push(partyId);
  quest.reward = negotiatedReward(quest.reward, guildmasterOf(guild, world), deps.content, deps.config);
  world.board = world.board.filter((id) => id !== questId);
  for (const heroId of heroIds) (world.heroes[heroId] as Hero).partyId = partyId;
  // M5-S3: the consumables go from the Guild's holding to the Party's.
  for (const { definitionKey, quantity } of consumables) {
    const stack = findStack(world, definitionKey, { kind: 'guild', id: guildId }) as Stack;
    moveStack(world, stack.id, quantity, { kind: 'party', id: partyId });
  }

  const taken = eventEmitter(world)({
    type: 'quest.taken',
    participants: [questId, partyId, ...heroIds, guildId, quest.patronId],
    payload: {
      questId,
      partyId,
      guildId,
      heroIds: [...heroIds],
      returnsOnTurn,
      reward: quest.reward,
      consumables: consumables.map(({ definitionKey, quantity }) => ({ definitionKey, quantity })),
    },
  });
  return { ok: true, events: [taken] };
}

/**
 * Every requirement of `quest` a Party of `party` misses, in the order party size, Class, Skill
 * (M4-S5, pre-M0 review E6): empty when it meets them all. `dispatch` refuses a Party that misses
 * any with `requirement-unmet` listing them, and a front end's preview of a proposed Party lists
 * them before it is sent. A Skill is held at any rating.
 */
export function unmetRequirements(
  quest: Pick<Quest, 'requirements'>,
  party: readonly Pick<Hero, 'classKey' | 'skills'>[],
): UnmetRequirement[] {
  const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
  const unmet: UnmetRequirement[] = [];
  if (party.length < partySizeMin || party.length > partySizeMax) {
    unmet.push({ requirement: 'party-size', size: party.length, partySizeMin, partySizeMax });
  }
  if (classKey !== undefined && !party.some((hero) => hero.classKey === classKey)) {
    unmet.push({ requirement: 'class', classKey });
  }
  if (skillKey !== undefined && !party.some((hero) => Object.hasOwn(hero.skills, skillKey))) {
    unmet.push({ requirement: 'skill', skillKey });
  }
  return unmet;
}

/**
 * What `dispatch` would say of `request` in `world`, without sending anyone: `null` when it would
 * send the Party, or the rejection it would return, by the same checks in the same order. Changes
 * nothing. A preview of a proposed Party reports it (`previewDispatch`, M7-S3, DL-66), so that the
 * verdict shown is the rule's own. Throws on the programming errors `dispatch` throws on.
 */
export function dispatchRefusal(
  world: World,
  request: DispatchRequest,
  deps: EngineDeps,
): DispatchRejection | null {
  return refusal(world, requestedGuild(world, request), request, deps);
}

/**
 * The Guild `request` names, having thrown on a programming error, as the validator would refuse
 * the request: a Guild not in the world, a Hero named twice, or a consumable named twice or in a
 * quantity that is not a whole number from 1.
 */
function requestedGuild(world: World, request: DispatchRequest): Guild {
  const { guildId, heroIds, consumables = [] } = request;
  const guild = rowOf(world.guilds, guildId);
  if (guild === undefined) throw new RangeError(`${guildId} is not in world.guilds`);
  checkProposedParty(heroIds, consumables);
  return guild;
}

/**
 * Throws, as `dispatch` does, on a Party that names a Hero twice, or a consumable twice or in a
 * quantity that is not a whole number from 1: a programming error, which the validator would refuse.
 * The chance estimate holds a proposed Party to it too (v1.1.4-S5's verification, estimate.ts).
 */
export function checkProposedParty(heroIds: readonly HeroId[], consumables: readonly ConsumableRequest[]): void {
  const repeated = heroIds.find((heroId, index) => heroIds.indexOf(heroId) !== index);
  if (repeated !== undefined) throw new RangeError(`A Party names ${repeated} twice`);
  const keys = consumables.map((it) => it.definitionKey);
  const twice = keys.find((key, index) => keys.indexOf(key) !== index);
  if (twice !== undefined) throw new RangeError(`A Party's consumables name ${twice} twice`);
  const odd = consumables.find(({ quantity }) => !Number.isSafeInteger(quantity) || quantity < 1);
  if (odd !== undefined) throw new RangeError(`A Party carries a whole number of ${odd.definitionKey} from 1, not ${odd.quantity}`);
}

/** The first check `request` fails, in the order `dispatch` gives, or `null` when it passes them all. */
function refusal(world: World, guild: Guild, request: DispatchRequest, deps: EngineDeps): DispatchRejection | null {
  const { guildId, questId, heroIds, consumables = [] } = request;
  if (guild.foldedOnTurn !== null) return { action: 'dispatch', reason: 'guild-folded', guildId };
  const quest = rowOf(world.quests, questId);
  if (quest === undefined || quest.status !== 'offered' || !world.board.includes(questId)) {
    return { action: 'dispatch', reason: 'quest-not-offered', questId };
  }

  const party: Hero[] = [];
  for (const heroId of heroIds) {
    const hero = rowOf(world.heroes, heroId);
    const because = hero === undefined ? null : unavailability(hero);
    // A dead or retired Hero has left the Roster and keeps `guildId` (DL-20 item 3): the Guild's
    // own, unavailable, rather than a stranger.
    const left = because === 'dead' || because === 'retired';
    if (hero === undefined || hero.guildId !== guildId || (!left && !guild.rosterIds.includes(heroId))) {
      return { action: 'dispatch', reason: 'hero-not-on-roster', heroId, guildId };
    }
    if (because !== null) return { action: 'dispatch', reason: 'hero-unavailable', heroId, because };
    party.push(hero);
  }

  const unmet = unmetRequirements(quest, party);
  if (unmet.length > 0) return { action: 'dispatch', reason: 'requirement-unmet', questId, unmet };

  for (const { definitionKey, quantity } of consumables) {
    if (itemDefinition(deps.content, definitionKey)?.kind !== 'consumable') {
      return { action: 'dispatch', reason: 'not-consumable', definitionKey };
    }
    const held = findStack(world, definitionKey, { kind: 'guild', id: guildId })?.quantity ?? 0;
    if (held === 0) return { action: 'dispatch', reason: 'not-held-by-guild', definitionKey, guildId };
    if (held < quantity) {
      return { action: 'dispatch', reason: 'insufficient-quantity', definitionKey, guildId, held, requested: quantity };
    }
  }
  return null;
}

/**
 * Why a Hero cannot go, or `null` when they can: Death and Retirement before the rest. What a
 * controller reads to choose a Party that `dispatch` accepts (M2-S9).
 */
export function unavailability(hero: Hero): Unavailability | null {
  if (hero.diedOnTurn !== null) return 'dead';
  if (hero.retiredOnTurn !== null) return 'retired';
  if (hero.injury !== null) return 'injured';
  if (hero.partyId !== null) return 'in-party';
  return null;
}
