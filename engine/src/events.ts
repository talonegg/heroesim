// The engine's events, typed per event type (ADR-0003, epics README §4). An event and a History
// entry are the same shape, `Entry`: `{ turn, type, participants, labels, milestone, payload }`,
// with a payload of ids and content keys, never copies of rows (data-model §4). Each story adds
// the types it emits to `EngineEvent`.

import type { ClassKey, SphereKey } from './content-types.js';
import type { Entry, GuildId, GuildmasterId, HeroId, PatronId } from './document.js';

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

/** Every event the engine emits. */
export type EngineEvent = WorldCreated | GuildFounded | GuildmasterGenerated | HeroGenerated | PatronGenerated;

/** Every event type the engine emits. */
export type EngineEventType = EngineEvent['type'];
