// Why time stops (M2-S11, approach §2, principle 10, pre-M0 review B7, DL-33): the typed reasons
// fast forward stops on, and the one place each is detected. `advance` reports what holds for the
// whole world (`ended`); fast forward reads every reason a Turn gives for the Guild it watches.
//
// A reason is detected from the Turn itself: the world before it, the world after it, the events it
// made and, for a module's stop (M8-S2, DL-77), what `advance` said of it. None reads the History or
// asks whether a Guild is the player's (ADR-0002): the caller names the Guild it watches, and a front
// end names the player's.

import type { EngineDeps } from './config.js';
import { staffableQuests } from './controllers/rival.js';
import {
  rowOf,
  type GuildId,
  type HeroId,
  type ModuleId,
  type OfferId,
  type PartyId,
  type Quest,
  type QuestId,
  type World,
} from './document.js';
import type { TurnEvent } from './events.js';
import { unattachedHeroes } from './selectors.js';

/**
 * Why time stopped (DL-33):
 * - `ended`: the game is over (`world.ended`, M2-S10).
 * - `below-floor`: the watched Guild's Wealth fell below the Bankruptcy floor at tonight's check, a
 *   `guild.below-floor` naming it this Turn; `dueDay` is the Day on whose night it reaches
 *   Bankruptcy unless its Wealth recovers (M9-S1, DL-85 item 6). A Rival's crossing is its own.
 * - `party-returned`: Parties of the watched Guild came home this Turn and were resolved, each
 *   with a `quest.resolved` naming that Guild, in the order they resolved.
 * - `decision-needed`: the watched Guild's Roster is idle, no Hero on it away in a Party, and the
 *   Board holds Quests it could staff from its pool that it could not before the Turn: new on the
 *   Board, or newly within reach because its last Party came home, a Hero healed or a Hero rested out
 *   of its rest band (`partyPool`, DL-286). The
 *   M2 reading of "a decision is needed" (M2-S11), which DL-85 item 8 keeps.
 * - `quest-staffable`: the same, whether or not a Party of the watched Guild is out: the Board holds
 *   Quests its pool could staff that it could not before the Turn (M9-S1, DL-85 item 8's
 *   "a Quest I can staff appears"). Opt-in.
 * - `transfer-offer`: Transfer Offers for Heroes of the watched Guild arrived this Turn, in the
 *   order they were made (M6-S2, DL-33, DL-57).
 * - `module`: an installed module asked for time to stop at one of its hooks this Turn, naming
 *   itself (M8-S2, DL-33, DL-77); the first to ask, in
 *   registration order. Whoever is watching, as `ended` is.
 * - `max-turns`: fast forward played the Turns it was allowed.
 * - `pool-refreshed`: Heroes entered the Unattached pool this Turn, in id order.
 */
export type StopReason =
  | { kind: 'ended' }
  | { kind: 'below-floor'; guildId: GuildId; dueDay: number }
  | { kind: 'party-returned'; guildId: GuildId; partyIds: PartyId[] }
  | { kind: 'decision-needed'; guildId: GuildId; questIds: QuestId[] }
  | { kind: 'quest-staffable'; guildId: GuildId; questIds: QuestId[] }
  | { kind: 'transfer-offer'; guildId: GuildId; offerIds: OfferId[] }
  | { kind: 'module'; moduleId: ModuleId }
  | { kind: 'max-turns' }
  | { kind: 'pool-refreshed'; heroIds: HeroId[] };

export type StopReasonKind = StopReason['kind'];

/** The stop a module's hook asks for: `module`, naming the module (M8-S2, DL-77). */
export type ModuleStopReason = Extract<StopReason, { kind: 'module' }>;

/** A reason a caller may name for fast forward: every reason but `max-turns`, which `maxTurns` sets. */
export type StopCondition = Exclude<StopReasonKind, 'max-turns'>;

/**
 * Whether each condition always stops fast forward (approach §2, principle 10) or only when the
 * caller lists it in `until` (pre-M0 review B7). Keyed by every condition, so the compiler refuses
 * one added without saying which it is.
 */
export const alwaysStops: Readonly<Record<StopCondition, boolean>> = Object.freeze({
  ended: true,
  'below-floor': true,
  'party-returned': true,
  'decision-needed': true,
  'quest-staffable': false,
  'transfer-offer': true,
  module: true,
  'pool-refreshed': false,
} satisfies Record<StopCondition, boolean>);

/**
 * Every condition, in the order a Turn that gives several reports them: an ending first, then the
 * watched Guild below the floor, the step before an ending (M9-S1), then its Parties home, then a
 * decision, then a Quest its pool could staff, which on an idle Roster names what the
 * decision names, then a Transfer Offer, then a module's stop, then the pool.
 */
export const stopConditions: readonly StopCondition[] = Object.freeze([
  'ended',
  'below-floor',
  'party-returned',
  'decision-needed',
  'quest-staffable',
  'transfer-offer',
  'module',
  'pool-refreshed',
] as const);

/** Whether `value` names a stop condition. */
export function isStopCondition(value: unknown): value is StopCondition {
  return typeof value === 'string' && Object.hasOwn(alwaysStops, value);
}

// ── Detection: one function per condition ────────────────────────────────────────────────────

/** `ended` when the game is over, whatever Turn ended it. */
export function endedStop(world: Pick<World, 'ended'>): StopReason | null {
  return world.ended === null ? null : { kind: 'ended' };
}

/** `party-returned` when this Turn's events resolve a Quest of `guildId`'s: its Parties came home. */
export function partyReturnedStop(events: readonly TurnEvent[], guildId: GuildId): StopReason | null {
  const partyIds: PartyId[] = [];
  for (const event of events) {
    if (event.type === 'quest.resolved' && event.payload.guildId === guildId) partyIds.push(event.payload.partyId);
  }
  return partyIds.length === 0 ? null : { kind: 'party-returned', guildId, partyIds };
}

/**
 * `below-floor` when this Turn's events have the Guild State Engine find `guildId`'s Wealth below the
 * Bankruptcy floor, as it was not the night before (`guild.below-floor` naming it), with the Day its
 * Bankruptcy falls on. Another Guild's crossing stops nothing: a Rival's is its own affair.
 */
export function belowFloorStop(events: readonly TurnEvent[], guildId: GuildId): StopReason | null {
  for (const event of events) {
    if (event.type === 'guild.below-floor' && event.payload.guildId === guildId) {
      return { kind: 'below-floor', guildId, dueDay: event.payload.dueDay };
    }
  }
  return null;
}

/**
 * What a Turn's two staffable stops read of one world, for the Guild watched: whether its Roster is
 * idle, no Hero on it away in a Party, and the Quests on the Board it could staff from its pool
 * (`staffableQuests`: a Party of it `dispatch` would send), none for a Guild not in the world. The
 * Quests are worked out once, when first asked, however many stops ask (the M9 review): each
 * search runs `requiredParty` and `dispatchRefusal` over the Board, through `staffingParty`
 * (controllers/rival.ts), and asks no chance estimate (v1.1.4-S6, DL-157; v1.1.4-S14).
 */
interface Staffing {
  idle: boolean;
  quests: () => readonly Quest[];
}

function staffingOf(world: World, guildId: GuildId, deps: EngineDeps): Staffing {
  const guild = rowOf(world.guilds, guildId);
  if (guild === undefined) return { idle: true, quests: () => [] };
  const idle = !guild.rosterIds.some((heroId) => {
    const hero = rowOf(world.heroes, heroId);
    return hero !== undefined && hero.partyId !== null;
  });
  let quests: readonly Quest[] | undefined;
  return { idle, quests: () => (quests ??= staffableQuests(world, guild, deps)) };
}

/**
 * The ids of the Quests the Guild could staff after the Turn and could not before it, in the Board's
 * order: new on the Board, or newly within reach. `whileIdle` counts only a Roster with no Hero away
 * in a Party, whose return is otherwise the next thing to wait for: after the Turn, nothing unless it
 * is idle; before it, nothing then unless it was. A Quest the Guild could already staff before the
 * Turn is not among them: the caller has seen it and gone on.
 */
function newlyStaffable(before: Staffing, after: Staffing, whileIdle: boolean): QuestId[] {
  if (whileIdle && !after.idle) return [];
  const now = after.quests();
  if (now.length === 0) return [];
  const then = new Set(whileIdle && !before.idle ? [] : before.quests().map((quest) => quest.id));
  return now.filter((quest) => !then.has(quest.id)).map((quest) => quest.id);
}

function decisionNeeded(before: Staffing, after: Staffing, guildId: GuildId): StopReason | null {
  const questIds = newlyStaffable(before, after, true);
  return questIds.length === 0 ? null : { kind: 'decision-needed', guildId, questIds };
}

function questStaffable(before: Staffing, after: Staffing, guildId: GuildId): StopReason | null {
  const questIds = newlyStaffable(before, after, false);
  return questIds.length === 0 ? null : { kind: 'quest-staffable', guildId, questIds };
}

/**
 * `decision-needed` when, after the Turn, the Guild's Roster is idle and the Board holds Quests it
 * could staff that it could not before (`newlyStaffable` while idle), in the Board's order.
 */
export function decisionNeededStop(before: World, after: World, guildId: GuildId, deps: EngineDeps): StopReason | null {
  return decisionNeeded(staffingOf(before, guildId, deps), staffingOf(after, guildId, deps), guildId);
}

/**
 * `quest-staffable` when, after the Turn, the Board holds Quests the Guild's pool could staff that
 * it could not before (`newlyStaffable`), in the Board's order, whether or not a Party of
 * the Guild is out (M9-S1, DL-85 item 8). On an idle Roster it names what `decision-needed` names.
 */
export function questStaffableStop(before: World, after: World, guildId: GuildId, deps: EngineDeps): StopReason | null {
  return questStaffable(staffingOf(before, guildId, deps), staffingOf(after, guildId, deps), guildId);
}

/**
 * `transfer-offer` when this Turn's events make Transfer Offers for Heroes of `guildId`'s, which it
 * answers (`guild.transfer-offered` naming it as `fromGuildId`), in the order they were made. An offer
 * that stands from an earlier Turn stops nothing: the caller has seen it, and it expires on its night.
 */
export function transferOfferStop(events: readonly TurnEvent[], guildId: GuildId): StopReason | null {
  const offerIds: OfferId[] = [];
  for (const event of events) {
    if (event.type === 'guild.transfer-offered' && event.payload.fromGuildId === guildId) offerIds.push(event.payload.offerId);
  }
  return offerIds.length === 0 ? null : { kind: 'transfer-offer', guildId, offerIds };
}

/**
 * `pool-refreshed` when Heroes are in the Unattached pool after the Turn who were not before it:
 * the night's refill, and Heroes a folded Guild released, alike.
 */
export function poolRefreshedStop(before: Pick<World, 'heroes'>, after: Pick<World, 'heroes'>): StopReason | null {
  const then = new Set(unattachedHeroes(before).map((hero) => hero.id));
  const heroIds = unattachedHeroes(after)
    .filter((hero) => !then.has(hero.id))
    .map((hero) => hero.id);
  return heroIds.length === 0 ? null : { kind: 'pool-refreshed', heroIds };
}

/**
 * `module` when `advance` reported a module's stop for the Turn (`stoppedBecause`): a module's hook
 * asked for it, and only `advance` saw the hook's answer.
 */
export function moduleStop(stoppedBecause: StopReason | null | undefined): StopReason | null {
  return stoppedBecause?.kind === 'module' ? stoppedBecause : null;
}

/**
 * One Turn as fast forward sees it: the world before and after, the events it made, and why
 * `advance` said time should stop after it, which carries a module's stop.
 */
export interface PlayedTurn {
  before: World;
  after: World;
  events: readonly TurnEvent[];
  stoppedBecause?: StopReason | null;
}

/**
 * Every reason `turn` gives to stop among `conditions`, watching `guildId`, in `stopConditions`'
 * order: always-on and opt-in alike unless the caller narrows the list, since which of them stop
 * is the caller's to decide (`alwaysStops`, `until`). A condition left out is not looked for.
 */
export function stopsOfTurn(
  turn: PlayedTurn,
  guildId: GuildId,
  deps: EngineDeps,
  conditions: Iterable<StopCondition> = stopConditions,
): StopReason[] {
  const { before, after, events } = turn;
  // Both staffable stops read the same two searches of the Board, made once for the Turn.
  let staffing: { before: Staffing; after: Staffing } | undefined;
  const staffed = () => (staffing ??= { before: staffingOf(before, guildId, deps), after: staffingOf(after, guildId, deps) });
  const detect: Record<StopCondition, () => StopReason | null> = {
    ended: () => endedStop(after),
    'below-floor': () => belowFloorStop(events, guildId),
    'party-returned': () => partyReturnedStop(events, guildId),
    'decision-needed': () => decisionNeeded(staffed().before, staffed().after, guildId),
    'quest-staffable': () => questStaffable(staffed().before, staffed().after, guildId),
    'transfer-offer': () => transferOfferStop(events, guildId),
    module: () => moduleStop(turn.stoppedBecause),
    'pool-refreshed': () => poolRefreshedStop(before, after),
  };
  const wanted = new Set(conditions);
  return stopConditions.flatMap((condition) => (wanted.has(condition) ? (detect[condition]() ?? []) : []));
}
