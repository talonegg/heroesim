// `dispatch` (M2-S4, R23): a Guild sends a Party of its Heroes on a Quest from the Board. A
// standalone call in any Turn (pre-M0 review D2): the CLI calls it and saves, the harness's policy
// calls it between advances, and a Rival's controller (M2-S9) produces the same action, applied
// through `applyDispatch`, the rule `dispatch` runs (DL-30). The Party is away until
// `returnsOnTurn`, always a night Turn (pre-M0 review C4); the afternoon's `questsAdvance` does
// nothing with it until M4, and the night's `questsConclude` (M2-S5) resolves it. The choices
// here are DL-25; M4-S5 names each requirement a Party misses and has the Guildmaster's
// Negotiation set the reward agreed (DL-43).

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
import { guildmasterOf, negotiatedReward } from '../guildmaster.js';
import { dayOf, durationDaysOf, nightOf } from '../time.js';
import { applyToCopy, type ActionResult, type Rejection, type WorldActionResult } from './result.js';

export interface DispatchAction {
  kind: 'dispatch';
  guildId: GuildId;
  questId: QuestId;
  /** The Party, in the order given; each Hero once. */
  heroIds: HeroId[];
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

export type DispatchRejection =
  | DispatchGuildFolded
  | QuestNotOffered
  | HeroNotOnRoster
  | HeroUnavailable
  | RequirementUnmet;

/**
 * Sends `heroIds` of `guildId` on `questId`. The checks run in this order, and the first that
 * fails is the rejection (DL-25, DL-31): the Guild has not folded (`guild-folded`); the Quest is
 * on the Board (`quest-not-offered`); each Hero in turn is on the Guild's Roster
 * (`hero-not-on-roster`) and free to go (`hero-unavailable`: dead, retired, injured, or in a
 * Party); and the Party meets the Quest's requirements (`requirement-unmet`, naming each it
 * misses: its size, its required Class, its required Skill; M4-S5, `unmetRequirements`).
 *
 * On success, a copy of `world` gains a `parties` row departing this Turn and returning on
 * `nightOf(dayOf(turn) + durationDays)`, a night Turn whichever Turn of the Day it left in
 * (pre-M0 review C4); the Quest is `taken`, lists the Party and leaves the Board, and its reward
 * becomes the reward agreed, the Guild's Guildmaster's Negotiation applied (`negotiatedReward`,
 * M4-S5, R8), which the Quest Engine pays on a success; each Hero's `partyId` is the Party's; and
 * `quest.taken`, carrying the reward agreed, is appended to the History and returned. The old
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
  return applyToCopy(document, (world) => applyDispatch(world, request, deps));
}

/**
 * `dispatch`'s rule on a world it changes in place: the same checks in the same order, the same
 * changes and the same `quest.taken`, which it returns rather than appends. `dispatch` runs it on
 * a copy of a document's world; a Rival controller runs it on the Turn's copy (M2-S9, DL-30). A
 * refusal changes nothing. Throws on the programming errors `dispatch` throws on.
 */
export function applyDispatch(
  world: World,
  request: DispatchRequest,
  deps: EngineDeps,
): WorldActionResult<DispatchRejection> {
  const { guildId, questId, heroIds } = request;
  const guild = own(world.guilds, guildId);
  if (guild === undefined) throw new RangeError(`${guildId} is not in world.guilds`);
  const repeated = heroIds.find((heroId, index) => heroIds.indexOf(heroId) !== index);
  if (repeated !== undefined) throw new RangeError(`A Party names ${repeated} twice`);

  const rejection = refusal(world, guild, request);
  if (rejection !== null) return { ok: false, rejection };

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
  quest.reward = negotiatedReward(quest.reward, guildmasterOf(guild, world), deps.content, deps.config);
  world.board = world.board.filter((id) => id !== questId);
  for (const heroId of heroIds) (world.heroes[heroId] as Hero).partyId = partyId;

  const taken = eventEmitter(world)({
    type: 'quest.taken',
    participants: [questId, partyId, ...heroIds, guildId, quest.patronId],
    payload: { questId, partyId, guildId, heroIds: [...heroIds], returnsOnTurn, reward: quest.reward },
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

/** The first check `request` fails, in the order `dispatch` gives, or `null` when it passes them all. */
function refusal(world: World, guild: Guild, request: DispatchRequest): DispatchRejection | null {
  const { guildId, questId, heroIds } = request;
  if (guild.foldedOnTurn !== null) return { action: 'dispatch', reason: 'guild-folded', guildId };
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

  const unmet = unmetRequirements(quest, party);
  if (unmet.length > 0) return { action: 'dispatch', reason: 'requirement-unmet', questId, unmet };
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

/** The row keyed `id`, looked up without falling through to `Object.prototype`. */
function own<Row>(rows: Readonly<Record<string, Row>>, id: string): Row | undefined {
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}
