// `dispatch` (M2-S4, R23): a Guild sends a Party of its Heroes on a Quest from the Board. A
// standalone call in any Turn (pre-M0 review D2): the CLI calls it and saves, the harness's policy
// calls it between advances, and a Rival's controller (M2-S9) produces the same action. The Party
// is away until `returnsOnTurn`, always a night Turn (pre-M0 review C4); the afternoon's
// `questsAdvance` does nothing with it until M4, and the night's `questsConclude` (M2-S5)
// resolves it. The choices here are DL-25.

import type { EngineDeps } from '../config.js';
import type { ClassKey, SkillKey } from '../content-types.js';
import {
  takeId,
  type Guild,
  type GuildId,
  type Hero,
  type HeroId,
  type Quest,
  type QuestId,
  type World,
  type WorldDocument,
} from '../document.js';
import { eventEmitter } from '../emit.js';
import { append } from '../history.js';
import { dayOf, durationDaysOf, nightOf } from '../time.js';
import type { ActionResult, Rejection } from './result.js';

export interface DispatchAction {
  kind: 'dispatch';
  guildId: GuildId;
  questId: QuestId;
  /** The Party, in the order given; each Hero once. */
  heroIds: HeroId[];
}

/** What `dispatch` is asked: the action without its `kind`. */
export type DispatchRequest = Omit<DispatchAction, 'kind'>;

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

/** The Party is smaller or larger than the Quest's bounds; any size within them is accepted. */
export interface PartySize extends Rejection<'dispatch', 'party-size'> {
  questId: QuestId;
  size: number;
  partySizeMin: number;
  partySizeMax: number;
}

/** No Hero in the Party is of the Class, or holds the Skill, the Quest requires: those it lacks. */
export interface RequirementUnmet extends Rejection<'dispatch', 'requirement-unmet'> {
  questId: QuestId;
  unmet: { classKey?: ClassKey; skillKey?: SkillKey };
}

export type DispatchRejection = QuestNotOffered | HeroNotOnRoster | HeroUnavailable | PartySize | RequirementUnmet;

/**
 * Sends `heroIds` of `guildId` on `questId`. The checks run in this order, and the first that
 * fails is the rejection (DL-25): the Quest is on the Board (`quest-not-offered`); each Hero in
 * turn is on the Guild's Roster (`hero-not-on-roster`) and free to go (`hero-unavailable`: dead,
 * retired, injured, or in a Party); the Party's size is within the Quest's bounds (`party-size`);
 * and it meets the Quest's required Class and Skill (`requirement-unmet`).
 *
 * On success, a copy of `world` gains a `parties` row departing this Turn and returning on
 * `nightOf(dayOf(turn) + durationDays)`, a night Turn whichever Turn of the Day it left in
 * (pre-M0 review C4); the Quest is `taken`, lists the Party and leaves the Board; each Hero's
 * `partyId` is the Party's; and `quest.taken` is appended to the History and returned. The old
 * document's `world` is left as it was; `meta` and `history` are shared, as `advance` shares them.
 *
 * Throws on a programming error, as the validator would refuse the request: a Guild not in the
 * world, or a Hero named twice.
 */
export function dispatch(
  document: WorldDocument,
  request: DispatchRequest,
  deps: EngineDeps,
): ActionResult<DispatchRejection> {
  // Taken as every entry point takes it (epics README §4); no rule of dispatch reads it until
  // M4-S5's Negotiation scales the reward.
  void deps;
  const { meta, history } = document;
  const { guildId, questId, heroIds } = request;
  const guild = own(document.world.guilds, guildId);
  if (guild === undefined) throw new RangeError(`${guildId} is not in world.guilds`);
  const repeated = heroIds.find((heroId, index) => heroIds.indexOf(heroId) !== index);
  if (repeated !== undefined) throw new RangeError(`A Party names ${repeated} twice`);

  const rejection = refusal(document.world, guild, request);
  if (rejection !== null) return { ok: false, rejection };

  const world = structuredClone(document.world);
  const quest = world.quests[questId] as Quest;
  const partyId = takeId(world, 'parties');
  const returnsOnTurn = nightOf(dayOf(world.turn) + durationDaysOf(quest));
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
  world.board = world.board.filter((id) => id !== questId);
  for (const heroId of heroIds) (world.heroes[heroId] as Hero).partyId = partyId;

  const taken = eventEmitter(world)({
    type: 'quest.taken',
    participants: [questId, partyId, ...heroIds, guildId, quest.patronId],
    payload: { questId, partyId, guildId, heroIds: [...heroIds], returnsOnTurn },
  });
  append(history, taken);
  return { ok: true, document: { meta, world, history }, events: [taken] };
}

/** The first check `request` fails, in the order `dispatch` gives, or `null` when it passes them all. */
function refusal(world: World, guild: Guild, request: DispatchRequest): DispatchRejection | null {
  const { guildId, questId, heroIds } = request;
  const quest = own(world.quests, questId);
  if (quest === undefined || quest.status !== 'offered' || !world.board.includes(questId)) {
    return { action: 'dispatch', reason: 'quest-not-offered', questId };
  }

  const party: Hero[] = [];
  for (const heroId of heroIds) {
    const hero = own(world.heroes, heroId);
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

  const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
  if (heroIds.length < partySizeMin || heroIds.length > partySizeMax) {
    return { action: 'dispatch', reason: 'party-size', questId, size: heroIds.length, partySizeMin, partySizeMax };
  }

  const classUnmet = classKey !== undefined && !party.some((hero) => hero.classKey === classKey);
  const skillUnmet = skillKey !== undefined && !party.some((hero) => Object.hasOwn(hero.skills, skillKey));
  if (classUnmet || skillUnmet) {
    const unmet = { ...(classUnmet ? { classKey } : {}), ...(skillUnmet ? { skillKey } : {}) };
    return { action: 'dispatch', reason: 'requirement-unmet', questId, unmet };
  }
  return null;
}

/** Why a Hero cannot go, or `null` when they can: Death and Retirement before the rest. */
function unavailability(hero: Hero): Unavailability | null {
  if (hero.diedOnTurn !== null) return 'dead';
  if (hero.retiredOnTurn !== null) return 'retired';
  if (hero.injury !== null) return 'injured';
  if (hero.partyId !== null) return 'in-party';
  return null;
}

/** The row keyed `id`, looked up without falling through to `Object.prototype`. */
function own<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}
