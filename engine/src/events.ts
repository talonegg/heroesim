// The engine's events, typed per event type (ADR-0003, epics README §4). An event and a History
// entry are the same shape, `Entry`: `{ turn, type, participants, labels, milestone, payload }`,
// with a payload of ids and content keys, never copies of rows (data-model §4). Each story adds
// the types it emits to `EngineEvent`, and says in `milestoneTypes` whether each is a Milestone.

import type { MoraleBand } from './config.js';
import type { ClassKey, ImprovementKey, InjuryTypeKey, QuestTemplateKey, SphereKey, StatKey, TraitKey } from './content-types.js';
import type {
  EndingReason,
  Entry,
  FacilityKey,
  GuildId,
  GuildmasterId,
  HeroId,
  PartyId,
  PatronId,
  QuestId,
  Turn,
} from './document.js';
import type { QuestOutcome } from './quest-engine/stub.js';

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

// ── The stub Quest Engine (M2-S5, DL-29) ─────────────────────────────────────────────────────

/**
 * A Party came home and its Quest was resolved by the stub Quest Engine: the payload is the
 * outcome (`QuestOutcome`) with the Quest's, Party's and Guild's ids and the template's key, which
 * names the Quest once its row is gone. Names the Quest, the Party, each Hero, the Guild and the
 * Patron. Not a Milestone: its Injuries and Deaths are entries of their own.
 */
export type QuestResolved = Entry<
  'quest.resolved',
  QuestOutcome & {
    questId: QuestId;
    partyId: PartyId;
    guildId: GuildId;
    heroIds: HeroId[];
    templateKey: QuestTemplateKey;
  }
>;

/** A Hero came home from a Quest injured, until `healsOnTurn`. Names the Hero and the Quest. */
export type HeroInjured = Entry<
  'hero.injured',
  { heroId: HeroId; questId: QuestId; typeKey: InjuryTypeKey; healsOnTurn: Turn }
>;

/**
 * A Hero died on a Quest: off the Roster, the row kept with `diedOnTurn` (data-model rule 8). A
 * Milestone, naming the Hero and the Quest.
 */
export type HeroDied = Entry<'hero.died', { heroId: HeroId; questId: QuestId }>;

/** A Hero gained XP from a Quest (training XP, M3-S2, is a drift and emits none). Names the Hero. */
export type HeroXpGained = Entry<'hero.xp-gained', { heroId: HeroId; questId: QuestId; amount: number }>;

// ── The Hero State Engine (M2-S6, DL-29) ─────────────────────────────────────────────────────

/** What moved a Hero's Morale: a Death on their Roster, a strong success, or the nightly drift. */
export type MoraleCause = 'roster-death' | 'strong-success' | 'drift';

/**
 * A Hero's Morale changed: always for a discrete change, and for the nightly drift only when it
 * crosses from one of `moraleBands` to another (data-model rule 10). Names the Hero.
 */
export type HeroMoraleChanged = Entry<
  'hero.morale-changed',
  { heroId: HeroId; cause: MoraleCause; before: number; after: number; bandBefore: MoraleBand; bandAfter: MoraleBand }
>;

/** A Hero's Injury healed, leaving the Trait `traitKey` if it left one they lacked. Names the Hero. */
export type HeroHealed = Entry<'hero.healed', { heroId: HeroId; typeKey: InjuryTypeKey; traitKey: TraitKey | null }>;

/**
 * A Hero retired at a yearly check, at `age`: off the Roster, the row kept with `retiredOnTurn`. A
 * Milestone, naming the Hero and their Guild.
 */
export type HeroRetired = Entry<'hero.retired', { heroId: HeroId; guildId: GuildId; age: number }>;

// ── Ageing (M3-S4, DL-37) ────────────────────────────────────────────────────────────────────

/**
 * A Hero's Stat `statKey` fell by `delta`, a negative number, at a yearly check at `age`, from
 * `declineAge`. Potential is untouched. Names the Hero.
 */
export type HeroDeclined = Entry<'hero.declined', { heroId: HeroId; statKey: StatKey; delta: number; age: number }>;

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

// ── Hall Improvements (M3-S6, DL-38) ─────────────────────────────────────────────────────────

/**
 * A Guild built an Improvement through `build`, raising `facility` to `grade` for `cost` Wealth. A
 * Milestone, naming the Guild.
 */
export type GuildImproved = Entry<
  'guild.improved',
  { guildId: GuildId; facility: FacilityKey; grade: number; improvementKey: ImprovementKey; cost: number }
>;

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
  | QuestOffered
  | QuestExpired
  | QuestTaken
  | QuestResolved
  | HeroInjured
  | HeroDied
  | HeroXpGained
  | HeroMoraleChanged
  | HeroHealed
  | HeroRetired
  | HeroDeclined
  | GameEnded
  | GuildFolded
  | HeroLeftGuild
  | GuildImproved;

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
  'quest.offered': false,
  'quest.expired': false,
  'quest.taken': false,
  'quest.resolved': false,
  'hero.injured': false,
  'hero.died': true,
  'hero.xp-gained': false,
  'hero.morale-changed': false,
  'hero.healed': false,
  'hero.retired': true,
  'hero.declined': false,
  'game.ended': true,
  'guild.folded': true,
  'hero.left-guild': false,
  'guild.improved': true,
} satisfies Record<EngineEventType, boolean>);
