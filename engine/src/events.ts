// The engine's events, typed per event type (ADR-0003, epics README §4). An event and a History
// entry are the same shape, `Entry`: `{ turn, type, participants, labels, milestone, payload }`,
// with a payload of ids and content keys, never copies of rows (data-model §4). Each story adds
// the types it emits to `EngineEvent`, and says in `milestoneTypes` whether each is a Milestone.

import type { ClassKey, SphereKey } from './content-types.js';
import type { EndingReason, Entry, GuildId, GuildmasterId, HeroId, PatronId } from './document.js';

// ── World creation (M1-S6, DL-19) ────────────────────────────────────────────────────────────

/** The first entry of every History. It names no participant. */
export type WorldCreated = Entry<'world.created', { seed: string }>;

/** A Guild came into being, player's or Rival's alike. A Milestone, naming the Guild and its Guildmaster. */
export type GuildFounded = Entry<'guild.founded', { guildId: GuildId; guildmasterId: GuildmasterId }>;

/** A Guildmaster was generated for a Guild; names both. */
export type GuildmasterGenerated = Entry<
  'guildmaster.generated',
  { guildmasterId: GuildmasterId; guildId: GuildId }
>;

/**
 * A Hero was generated, onto a Roster or into the Unattached pool (`guildId: null`). Names the
 * Hero and, on a Roster, the Guild.
 */
export type HeroGenerated = Entry<
  'hero.generated',
  { heroId: HeroId; guildId: GuildId | null; classKey: ClassKey }
>;

/** A Patron was generated; names the Patron. */
export type PatronGenerated = Entry<'patron.generated', { patronId: PatronId; sphereKey: SphereKey }>;

// ── Rules (M2-S1, DL-24) ─────────────────────────────────────────────────────────────────────

/**
 * The game adopted the current default rules through `rebase`: `meta.config` was rewritten from
 * `configVersion` `oldConfigVersion` to `newConfigVersion` (data-model §2, pre-M0 review D1). A
 * Milestone naming no participant, since the rules are the whole world's.
 */
export type WorldRulesAdopted = Entry<
  'world.rules-adopted',
  { oldConfigVersion: number; newConfigVersion: number }
>;

// ── The Guild State Engine (M2-S7, INPUTS 4.6, DL-26) ────────────────────────────────────────

/**
 * Upkeep was deducted from a Guild's Wealth on its Day (`upkeep`, selectors.ts): `amount` taken
 * and Wealth after paying it, which may be negative.
 */
export type GuildUpkeepPaid = Entry<'guild.upkeep-paid', { guildId: GuildId; amount: number; wealthAfter: number }>;
// ── Recruitment and the Unattached pool (M2-S8, DL-27) ───────────────────────────────────────

/**
 * A Guild signed an Unattached Hero for `fee` Wealth through `recruit`. A Milestone, naming the
 * Hero and the Guild.
 */
export type HeroRecruited = Entry<'hero.recruited', { heroId: HeroId; guildId: GuildId; fee: number }>;

/**
 * An Unattached Hero left the pool unrecruited, `unattachedStayDays` after entering it. Names the
 * Hero, whose row is then removed unless an entry other than this and `hero.generated` names them
 * (data-model rule 8).
 */
export type HeroLeftPool = Entry<'hero.left-pool', { heroId: HeroId }>;

// ── Endings (M2-S10, pre-M0 review D6, DL-28) ────────────────────────────────────────────────

/**
 * The player-controlled Guild reached its ending, for `reason`, and the game is over: `world.ended`
 * is set. A Milestone, naming the Guild and its Guildmaster.
 */
export type GameEnded = Entry<'game.ended', { guildId: GuildId; reason: EndingReason }>;

/**
 * A Rival reached its ending, for `reason`, and folded: it is out of play and out of the Rankings.
 * A Milestone, naming the Guild, its Guildmaster, and each Party the fold disbanded and Quest it
 * abandoned (DL-28).
 */
export type GuildFolded = Entry<'guild.folded', { guildId: GuildId; reason: EndingReason }>;

/**
 * A Hero left a Guild's Roster for the Unattached pool: in M2 because the Guild folded. Names the
 * Hero and the Guild.
 */
export type HeroLeftGuild = Entry<'hero.left-guild', { heroId: HeroId; guildId: GuildId }>;

/** Every event the engine emits. */
export type EngineEvent =
  | WorldCreated
  | GuildFounded
  | GuildmasterGenerated
  | HeroGenerated
  | PatronGenerated
  | WorldRulesAdopted
  | GuildUpkeepPaid
  | HeroRecruited
  | HeroLeftPool
  | GameEnded
  | GuildFolded
  | HeroLeftGuild;

/** Every event type the engine emits. */
export type EngineEventType = EngineEvent['type'];

/** The event of type `Type`. */
export type EngineEventOf<Type extends EngineEventType> = Extract<EngineEvent, { type: Type }>;

/**
 * Whether each event type is a Milestone (`CONTEXT.md`): the entries a front end picks out of the
 * History. Keyed by every event type and by nothing else, so the compiler refuses an event type
 * added to `EngineEvent` without saying which it is. `emit` reads it (DL-24).
 */
export const milestoneTypes: Readonly<Record<EngineEventType, boolean>> = Object.freeze({
  'world.created': false,
  'guild.founded': true,
  'guildmaster.generated': false,
  'hero.generated': false,
  'patron.generated': false,
  'world.rules-adopted': true,
  'guild.upkeep-paid': false,
  'hero.recruited': true,
  'hero.left-pool': false,
  'game.ended': true,
  'guild.folded': true,
  'hero.left-guild': false,
} satisfies Record<EngineEventType, boolean>);
