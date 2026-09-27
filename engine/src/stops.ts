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
import type { GuildId, HeroId, ModuleId, OfferId, PartyId, Quest, QuestId, World } from './document.js';
import type { TurnEvent } from './events.js';
import { unattachedHeroes } from './selectors.js';

/**
 * Why time stopped (DL-33):
 * - `ended`: the game is over (`world.ended`, M2-S10).
 * - `party-returned`: Parties of the watched Guild came home this Turn and were resolved, each
 *   with a `quest.resolved` naming that Guild, in the order they resolved.
 * - `decision-needed`: the watched Guild's Roster is idle, no Hero on it away in a Party, and the
 *   Board holds Quests it could staff from its available Heroes that it could not before the Turn:
 *   new on the Board, or newly within reach because its last Party came home or a Hero healed. The
 *   M2 reading of "a decision is needed" (M2-S11); later milestones widen it.
 * - `transfer-offer`: Transfer Offers for Heroes of the watched Guild arrived this Turn, in the
 *   order they were made (M6-S2, approach §2: "a Transfer offer arrives", DL-57).
 * - `module`: an installed module asked for time to stop at one of its hooks this Turn, naming
 *   itself (M8-S2, approach §2: "a module asks for a decision", DL-77); the first to ask, in
 *   registration order. Whoever is watching, as `ended` is.
 * - `max-turns`: fast forward played the Turns it was allowed.
 * - `pool-refreshed`: Heroes entered the Unattached pool this Turn, in id order.
 */
export type StopReason =
  | { kind: 'ended' }
  | { kind: 'party-returned'; guildId: GuildId; partyIds: PartyId[] }
  | { kind: 'decision-needed'; guildId: GuildId; questIds: QuestId[] }
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
  'party-returned': true,
  'decision-needed': true,
  'transfer-offer': true,
  module: true,
  'pool-refreshed': false,
} satisfies Record<StopCondition, boolean>);

/**
 * Every condition, in the order a Turn that gives several reports them: an ending first, then the
 * watched Guild's Parties home, then a decision, then a Transfer Offer, then a module's stop, then
 * the pool.
 */
export const stopConditions: readonly StopCondition[] = Object.freeze([
  'ended',
  'party-returned',
  'decision-needed',
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
 * The Quests on the Board `guildId` could staff (`staffableQuests`, the Rivals' and `dispatch`'s
 * test) while its Roster is idle, no Hero on it away in a Party; none while a Party is out, whose
 * return is the next thing to wait for, and none for a Guild not in `world`.
 */
function idleStaffable(world: World, guildId: GuildId, deps: EngineDeps): Quest[] {
  const guild = Object.hasOwn(world.guilds, guildId) ? world.guilds[guildId] : undefined;
  if (guild === undefined) return [];
  const away = guild.rosterIds.some((heroId) => {
    const hero = Object.hasOwn(world.heroes, heroId) ? world.heroes[heroId] : undefined;
    return hero !== undefined && hero.partyId !== null;
  });
  return away ? [] : staffableQuests(world, guild, deps.content);
}

/**
 * `decision-needed` when, after the Turn, the Guild's Roster is idle and the Board holds Quests it
 * could staff that it could not before (`idleStaffable`), in the Board's order. A Quest the Guild
 * could already staff before the Turn stops nothing: the caller has seen it and gone on.
 */
export function decisionNeededStop(before: World, after: World, guildId: GuildId, deps: EngineDeps): StopReason | null {
  const now = idleStaffable(after, guildId, deps);
  if (now.length === 0) return null;
  const then = new Set(idleStaffable(before, guildId, deps).map((quest) => quest.id));
  const questIds = now.filter((quest) => !then.has(quest.id)).map((quest) => quest.id);
  return questIds.length === 0 ? null : { kind: 'decision-needed', guildId, questIds };
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
  const detect: Record<StopCondition, () => StopReason | null> = {
    ended: () => endedStop(after),
    'party-returned': () => partyReturnedStop(events, guildId),
    'decision-needed': () => decisionNeededStop(before, after, guildId, deps),
    'transfer-offer': () => transferOfferStop(events, guildId),
    module: () => moduleStop(turn.stoppedBecause),
    'pool-refreshed': () => poolRefreshedStop(before, after),
  };
  const wanted = new Set(conditions);
  return stopConditions.flatMap((condition) => (wanted.has(condition) ? (detect[condition]() ?? []) : []));
}
