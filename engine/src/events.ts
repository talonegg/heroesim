// The engine's events, typed per event type (ADR-0003, epics README §4). An event and a History
// entry are the same shape, `Entry`: `{ turn, type, participants, labels, milestone, payload }`,
// with a payload of ids and content keys, never copies of rows (data-model §4). Each story adds
// the types it emits to `EngineEvent`, and says in `milestoneTypes` whether each is a Milestone.

import type { ClassKey, QuestTemplateKey, SphereKey } from './content-types.js';
import type { Entry, GuildId, GuildmasterId, HeroId, PartyId, PatronId, QuestId, Turn } from './document.js';

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

// ── The Board (M2-S3, DL-25) ─────────────────────────────────────────────────────────────────

/**
 * A Patron offered a Quest: it is on the Board. Names the Quest and the Patron. The template's
 * key lets a front end name the Quest after its row is gone.
 */
export type QuestOffered = Entry<
  'quest.offered',
  { questId: QuestId; patronId: PatronId; templateKey: QuestTemplateKey }
>;

/**
 * An offered Quest no Guild took went off the Board at a morning's refresh, and its row was
 * removed; this entry keeps its record (data-model rule 8). Names the Quest and the Patron.
 */
export type QuestExpired = Entry<
  'quest.expired',
  { questId: QuestId; patronId: PatronId; templateKey: QuestTemplateKey }
>;

// ── Dispatch (M2-S4, DL-25) ──────────────────────────────────────────────────────────────────

/**
 * A Guild sent a Party on a Quest from the Board: the Quest is taken and the Party away until
 * `returnsOnTurn`, a night. Names the Quest, the Party, each Hero, the Guild and the Patron.
 */
export type QuestTaken = Entry<
  'quest.taken',
  { questId: QuestId; partyId: PartyId; guildId: GuildId; heroIds: HeroId[]; returnsOnTurn: Turn }
>;

/** Every event the engine emits. */
export type EngineEvent =
  | WorldCreated
  | GuildFounded
  | GuildmasterGenerated
  | HeroGenerated
  | PatronGenerated
  | WorldRulesAdopted
  | QuestOffered
  | QuestExpired
  | QuestTaken;

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
  'quest.offered': false,
  'quest.expired': false,
  'quest.taken': false,
} satisfies Record<EngineEventType, boolean>);
