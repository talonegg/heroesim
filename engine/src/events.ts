// The engine's events, typed per event type (ADR-0003, epics README §4). An event and a History
// entry are the same shape, `Entry`: `{ turn, type, participants, labels, milestone, payload }`,
// with a payload of ids and content keys, never copies of rows (data-model §4). Each story adds
// the types it emits to `EngineEvent`, and says in `milestoneTypes` whether each is a Milestone.

import type { FatigueBand, MoraleBand, RegardBand } from './config.js';
import type {
  ClassKey,
  EncounterKey,
  FacilityKey,
  ImprovementKey,
  InjuryTypeKey,
  ItemDefinitionKey,
  LootTableKey,
  QuestTemplateKey,
  SlotKey,
  SphereKey,
  StatKey,
  SynergyKey,
  TraitKey,
} from './content-types.js';
import type {
  Contract,
  EndingReason,
  EntityId,
  Entry,
  GuildId,
  EventType,
  GuildmasterId,
  HeroId,
  ItemId,
  ModuleId,
  OfferId,
  PartyId,
  PatronId,
  QuestId,
  StackId,
  Turn,
} from './document.js';
import type { FormDecided } from './quest-engine/check.js';
import type { ConsumableUse } from './quest-engine/consumables.js';
import type { EncounterResult, QuestOutcome } from './quest-engine/resolve.js';

// ── World creation (M1-S6, DL-19) ────────────────────────────────────────────────────────────

/** The first entry of every History. It names no participant. */
export type WorldCreated = Entry<'world.created', { seed: string }>;

/**
 * A Guild came into being, player's or Rival's alike. A Milestone, naming the Guild and its Guildmaster.
 * `wealth` is the Guild's founding Wealth (DL-120 item 4, DL-121), for every Guild founded, the
 * player's, the founding Rivals' and each replacement's; required, as the validator holds it (DL-246).
 */
export type GuildFounded = Entry<'guild.founded', { guildId: GuildId; guildmasterId: GuildmasterId; wealth: number }>;

/** A Guildmaster was generated for a Guild; names both. */
export type GuildmasterGenerated = Entry<
  'guildmaster.generated',
  { guildmasterId: GuildmasterId; guildId: GuildId }
>;

/**
 * A Rival's Guildmaster retired at `age` and was succeeded (M9-S2, DL-83 item 19, DL-100 item 3):
 * the Guild carries on under `successorId`, drawn as a founding Rival's Guildmaster is. A Milestone
 * naming the Guild, the retired Guildmaster and the successor, in that order; the successor's
 * History begins with it, and no `guildmaster.generated` is made for them.
 */
export type GuildmasterSucceeded = Entry<
  'guildmaster.succeeded',
  { guildId: GuildId; guildmasterId: GuildmasterId; successorId: GuildmasterId; age: number }
>;

/**
 * A Hero was generated, onto a Roster or into the Unattached pool (`guildId: null`). Names the
 * Hero and, on a Roster, the Guild. Into the pool it is emitted and not recorded (DL-211).
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
 * A Guild's wages were deducted from its Wealth on their Day (`wageBill`, `nextWagesDay`, selectors.ts;
 * DL-298): `amount` taken, Wealth after paying it, which may be negative, and each Hero's Contract wage
 * it was the sum of, by Hero (DL-315). Names the Guild.
 */
export type GuildWagesPaid = Entry<
  'guild.wages-paid',
  { guildId: GuildId; amount: number; wealthAfter: number; wages: Record<HeroId, number> }
>;

/**
 * A Guild's Hall upkeep with its Improvements' was deducted from its Wealth on its Day
 * (`hallUpkeepParts`, `nextHallUpkeepDay`, selectors.ts; DL-298): `amount` taken, Wealth after paying
 * it, which may be negative, and the parts it was reckoned from: the Guild's own `base`, its Heroes'
 * share `heroes` for `heroCount` Heroes, each built Facility's charge by its key, and the Guildmaster's
 * `traitFactor`, so that `amount` is the parts summed, times the factor, rounded once. Every amount
 * whole Silver. Names the Guild.
 */
export type GuildHallUpkeepPaid = Entry<
  'guild.hall-upkeep-paid',
  {
    guildId: GuildId;
    amount: number;
    wealthAfter: number;
    base: number;
    heroCount: number;
    heroes: number;
    facilities: Record<FacilityKey, number>;
    traitFactor: number;
  }
>;

/**
 * A Guild's Wealth was below the Bankruptcy floor at the night's check, and was not the night before:
 * `belowFloorSince` was set tonight (M9-S1, DL-85 item 6, superseding DL-26 item 3's silence). It
 * carries the Wealth, the floor it is below (`bankruptcyFloor`) and the Day on whose night the Guild
 * reaches Bankruptcy unless Wealth is back to the floor or more on a night before it: tonight's Day
 * plus `bankruptcyGraceDays`, as `bankruptcyCountdown` reckons it and `endings.ts` rules. Names the
 * Guild. Not a Milestone: the ending is, if it comes.
 */
export type GuildBelowFloor = Entry<'guild.below-floor', { guildId: GuildId; wealth: number; floor: number; dueDay: number }>;

/**
 * A Guild's Wealth was back to the Bankruptcy floor or more at the night's check, having been below
 * it: `belowFloorSince` was cleared tonight (M9-S1, DL-85 item 6). It carries the Wealth, the floor
 * and the Turn it had fallen below. Names the Guild. Not a Milestone.
 */
export type GuildFloorRecovered = Entry<
  'guild.floor-recovered',
  { guildId: GuildId; wealth: number; floor: number; belowFloorSince: Turn }
>;
// ── Recruitment and the Unattached pool (M2-S8, DL-27) ───────────────────────────────────────

/**
 * A Contract's terms as a signing's event carries them (DL-315): its wage in whole Silver, its length
 * in years and its end Day; the Turn signed is the event's.
 */
export type ContractTerms = Pick<Contract, 'wage' | 'years' | 'endDay'>;

/**
 * A Guild signed an Unattached Hero for `fee` Wealth through `recruit`, on the Contract's terms. A
 * Milestone, naming the Hero and the Guild.
 */
export type HeroRecruited = Entry<'hero.recruited', { heroId: HeroId; guildId: GuildId; fee: number } & ContractTerms>;

/**
 * A Guild signed a Hero of its Roster again through `renew`, on the new Contract's terms, its old term
 * dropped (DL-316). A Milestone, naming the Hero and the Guild.
 */
export type HeroContractRenewed = Entry<'hero.contract-renewed', { heroId: HeroId; guildId: GuildId } & ContractTerms>;

/**
 * A Hero's Contract ended on the night of its end Day, and they play on, Out of Contract, on their Guild's
 * Roster: `wage` is the wage repriced that night (`outOfContractWage`), charged from then (Q-D, DL-311 item
 * 1, DL-316). A Milestone for every Guild's Hero alike, naming the Hero and the Guild.
 */
export type HeroContractExpired = Entry<'hero.contract-expired', { heroId: HeroId; guildId: GuildId; wage: number }>;

/**
 * A Guild released a Hero of its Roster through `release`: they join the Unattached pool with no Contract,
 * and `payout` is what the Guild paid, `releasePayoutFactor` of the wages left, 0 once their Contract has
 * ended (Q10, DL-317). A Milestone, naming the Hero and the Guild.
 */
export type HeroReleased = Entry<'hero.released', { heroId: HeroId; guildId: GuildId; payout: number }>;

/**
 * An Unattached Hero left the pool unrecruited, `unattachedStayDays` after entering it. Names the
 * Hero, whose row is then removed unless an entry names them (data-model rule 8); recorded only
 * then (DL-211).
 */
export type HeroLeftPool = Entry<'hero.left-pool', { heroId: HeroId }>;
// ── The Board (M2-S3, DL-25) ─────────────────────────────────────────────────────────────────

/**
 * A Patron offered a Quest: it is on the Board. Names the Quest and the Patron. The template's
 * key lets a front end name the Quest after its row is gone.
 */
export type QuestOffered = Entry<
  'quest.offered',
  {
    questId: QuestId;
    patronId: PatronId;
    templateKey: QuestTemplateKey;
    /** Its Tier (DL-257, DL-262), which the validator requires. */
    tier: number;
    /** The module whose `offerQuest` effect offered it (M8-S2, DL-77); absent for the Board's refresh. */
    moduleId?: ModuleId;
  }
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
  {
    questId: QuestId;
    partyId: PartyId;
    guildId: GuildId;
    heroIds: HeroId[];
    returnsOnTurn: Turn;
    /** The Quest's Tier (DL-257, DL-262), which the validator requires. */
    tier: number;
    /**
     * The reward agreed: the Quest's reward as the Guildmaster's Negotiation set it at dispatch,
     * which the Quest now carries (M4-S5, DL-43). Absent from an entry written before DL-43.
     */
    reward?: number;
    /**
     * The consumables the Party carries from the Guild's holding (M5-S3, DL-50), in the order asked:
     * `[]` for none. Absent from an entry written before DL-50.
     */
    consumables?: { definitionKey: ItemDefinitionKey; quantity: number }[];
  }
>;

// ── The Quest Engine (M2-S5, DL-29; M4-S2, DL-42) ────────────────────────────────────────────

/**
 * One Encounter of a Quest's sequence was checked as the Party came home (M4-S2): its key and kind,
 * the roll, the target it had to reach, the margin between them (the roll less
 * `checkDegrees.success` times the target, the same at its default of 1), the outcome, and whom its
 * consequences injured or killed. Also its Degree (DL-152), the Check that decided it, whose roll,
 * target, margin and outcome those are, and each of its Checks rolled: the three are required, and
 * the validator refuses an entry without any of them (DL-247). One per Encounter reached, in
 * sequence order (`index` from 0), all before the Quest's `quest.resolved`. Names the Quest, the
 * Party and the Guild.
 */
export type QuestEncounter = Entry<'quest.encounter', EncounterResult & { questId: QuestId; partyId: PartyId; guildId: GuildId }>;

/**
 * Whether form decided whether a `quest.encounter` entry's Encounter succeeded, and which way
 * (v1.1.4-S3's verification): with the raw Stats and the same rolls, its pass formula would have
 * given the other side of the Success line. The narration's one sentence of the Encounter is said
 * exactly when it is set; an entry written before DL-154 has none.
 */
export function encounterForm(payload: Pick<QuestEncounter['payload'], 'formDecided'>): FormDecided | undefined {
  return payload.formDecided;
}

/**
 * A Party came home and its Quest was resolved by the Quest Engine: the payload is the outcome
 * (`QuestOutcome`) with the Quest's, Party's and Guild's ids and the template's key, which names the
 * Quest once its row is gone. Names the Quest, the Party, each Hero, the Guild and the Patron. Not a
 * Milestone: its Injuries and Deaths are entries of their own.
 */
export type QuestResolved = Entry<
  'quest.resolved',
  Omit<QuestOutcome, 'synergyKeys' | 'moraleByHero'> & {
    /**
     * The Synergies that added to any of the Quest's Checks, in key order (M4-S3, DL-45): none is
     * `[]`. Absent from an entry written before DL-45, which reads as none.
     */
    synergyKeys?: SynergyKey[];
    /**
     * The Morale each Hero who came home brought from the Encounters, by id (v1.1.4-S4, DL-148 item
     * 14), which a loss `steadiedBy` their Stats makes their own. Absent from an entry written before
     * DL-155, whose every Hero brought `moraleDelta`.
     */
    moraleByHero?: QuestOutcome['moraleByHero'];
    questId: QuestId;
    partyId: PartyId;
    guildId: GuildId;
    heroIds: HeroId[];
    templateKey: QuestTemplateKey;
  }
>;

/**
 * A Quest's outcome left Loot (M5-S5, DL-52): one entry of the Quest's Loot table, drawn by the Quest
 * Engine on a band in `lootOnBands`, now in the Guild's holding. A unique Item is a new row,
 * `itemId`; a common Item joined the Guild's stack of its definition, `stackId`, by `quantity`. A
 * Milestone when the Item is unique (`milestoneWhen`). Names the Quest, the Party, the Guild and, for
 * a unique Item, the Item.
 */
export type QuestLoot = Entry<
  'quest.loot',
  {
    questId: QuestId;
    partyId: PartyId;
    guildId: GuildId;
    lootTableKey: LootTableKey;
    definitionKey: ItemDefinitionKey;
    quantity: number;
    /** The unique Item created; `null` for a common Item. */
    itemId: ItemId | null;
    /** The Guild's stack the common Item joined; `null` for a unique Item. */
    stackId: StackId | null;
  }
>;

/**
 * A Hero was injured, until `healsOnTurn`: coming home from the Quest `questId`, or by a module's
 * `injure` effect (M8-S2, DL-77), when `questId` is `null` and `moduleId` names the module. Names
 * the Hero and the Quest.
 */
export type HeroInjured = Entry<
  'hero.injured',
  { heroId: HeroId; questId: QuestId | null; typeKey: InjuryTypeKey; healsOnTurn: Turn; moduleId?: ModuleId }
>;

/**
 * A Hero died on a Quest: off the Roster, the row kept with `diedOnTurn` (data-model rule 8). A
 * Milestone, naming the Hero and the Quest.
 */
export type HeroDied = Entry<'hero.died', { heroId: HeroId; questId: QuestId }>;

/**
 * A Hero gained XP from a Quest (training XP, M3-S2, is a drift and emits none). Names the Hero and
 * the Quest (DL-112 item 2).
 */
export type HeroXpGained = Entry<'hero.xp-gained', { heroId: HeroId; questId: QuestId; amount: number }>;

// ── The Hero State Engine (M2-S6, DL-29) ─────────────────────────────────────────────────────

/**
 * What moved a Hero's Morale: a Death on their Roster, a strong success, the nightly drift, the
 * Morale consequences of a Quest's Encounters, summed (M4-S2), a Hero they held in high Regard
 * transferred away from their Roster (M6-S2, DL-57) or released (DL-317), emitted only on a band crossing, a module's
 * `adjustMorale` effect (M8-S2, DL-77), another Hero named Captain in their place (`captain-changed`),
 * or coming home with their Guild's Captain (`captain-homecoming`; DL-287).
 */
export type MoraleCause =
  | 'roster-death'
  | 'strong-success'
  | 'drift'
  | 'encounters'
  | 'transfer'
  | 'module'
  | 'captain-changed'
  | 'captain-homecoming';

/**
 * The causes a Quest's return makes, for each type that names the Quest on them (DL-112 item 2):
 * an entry of one of these causes carries `questId`, and one of any other cause carries none. The
 * validator refuses an entry of a Quest's cause without it (DL-246).
 */
export const questCauses = {
  'hero.morale-changed': ['encounters', 'strong-success', 'roster-death', 'captain-homecoming'],
  'patron.regard-changed': ['quest-success', 'quest-failure'],
  'guildmaster.regard-changed': ['quest-success', 'quest-failure'],
  'hero.regard-changed': ['shared-quest'],
} as const;

/** `cause`, and `questId` with it when it is one of `QuestCause`, a Quest's: required then, and absent otherwise. */
export type NamingTheQuest<Cause extends string, QuestCause extends Cause> =
  | { cause: QuestCause; questId: QuestId }
  | { cause: Exclude<Cause, QuestCause>; questId?: never };

/**
 * `cause`, with `questId` when the cause is one of `causes`, a Quest's, as a payload's fields: what
 * an entry's writer spreads into it. Throws when a Quest's cause comes without its Quest, or another
 * with one: a programming error.
 */
export function namingTheQuest<Cause extends string, QuestCause extends Cause>(
  causes: readonly QuestCause[],
  cause: Cause,
  questId: QuestId | undefined,
): NamingTheQuest<Cause, QuestCause> {
  const ofAQuest = (causes as readonly string[]).includes(cause);
  if (ofAQuest !== (questId !== undefined)) {
    throw new RangeError(`A change caused by ${cause} ${ofAQuest ? 'names the Quest' : 'names no Quest'}, but ${String(questId)} was given`);
  }
  return (questId === undefined ? { cause } : { cause, questId }) as NamingTheQuest<Cause, QuestCause>;
}

/**
 * A Hero's Morale changed: always for a discrete change, and for the nightly drift only when it
 * crosses from one of `moraleBands` to another (data-model rule 10). Names the Hero. `moduleId`
 * names the module whose effect moved it, for the `module` cause alone. `questId` names the Quest
 * whose return caused it, for `encounters`, `strong-success` and `roster-death` (`questCauses`), and
 * the Quest is a participant (DL-112 item 2).
 */
export type HeroMoraleChanged = Entry<
  'hero.morale-changed',
  {
    heroId: HeroId;
    before: number;
    after: number;
    bandBefore: MoraleBand;
    bandAfter: MoraleBand;
    moduleId?: ModuleId;
  } & NamingTheQuest<MoraleCause, (typeof questCauses)['hero.morale-changed'][number]>
>;

/**
 * A Hero's Fatigue crossed from one of `fatigueBands` to another on a night, away or at home, as
 * Morale's drift does (DL-282, data-model rule 10): never for a night that stays in its band. Names
 * the Hero.
 */
export type HeroFatigueChanged = Entry<
  'hero.fatigue-changed',
  { heroId: HeroId; before: number; after: number; bandBefore: FatigueBand; bandAfter: FatigueBand }
>;

/** A Hero's Injury healed, leaving the Trait `traitKey` if it left one they lacked. Names the Hero. */
export type HeroHealed = Entry<'hero.healed', { heroId: HeroId; typeKey: InjuryTypeKey; traitKey: TraitKey | null }>;

/**
 * A Hero earned the Hero Trait `traitKey` on a Quest (v1.1.4-S7, DL-148 items 25 and 27), from the
 * consequence of its Encounter `encounterKey`, the `encounterIndex`th of the sequence from 0: a
 * positive Trait on a strong success, or a negative one beside an Injury. A Milestone, positive or
 * negative, naming the Hero and the Quest.
 */
export type HeroTraitGained = Entry<
  'hero.trait-gained',
  { heroId: HeroId; traitKey: TraitKey; questId: QuestId; encounterIndex: number; encounterKey: EncounterKey }
>;

/**
 * A Hero lost the Hero Trait `traitKey`, replaced by `replacedBy`, a Trait an Injury left as it
 * healed, which excludes it or is excluded by it (v1.1.4-S7, DL-150 item 5): the wound is a fact of
 * the body. Emitted after the `hero.healed` that left `replacedBy`. A Milestone, naming the Hero.
 */
export type HeroTraitLost = Entry<'hero.trait-lost', { heroId: HeroId; traitKey: TraitKey; replacedBy: TraitKey }>;

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

// ── The Captain (DL-280 item 6, DL-287) ─────────────────────────────────────────────────────

/**
 * A Guild named `heroId` its Captain through `nameCaptain`: to an empty post, `replacedId` `null`; in
 * another's place, `replacedId` theirs and `lockedUntilTurn` the first Turn another change may be
 * made (`captainLock`), `null` for a vacancy filled or a lock of 0 Days. A Milestone, naming the
 * Guild, the Hero and the Captain replaced.
 */
export type GuildCaptainNamed = Entry<
  'guild.captain-named',
  { guildId: GuildId; heroId: HeroId; replacedId: HeroId | null; lockedUntilTurn: Turn | null }
>;

// ── Progression (M3-S1, DL-36) ───────────────────────────────────────────────────────────────

/**
 * A Hero's XP reached the next Level and they gained it: `level` is the Level reached, one entry
 * for each Level gained in a night. `statDeltas` holds each Stat that rose and by how much, and
 * `pointsLost` the Level's growth points that fell on a Stat already at its Potential. A Milestone,
 * naming the Hero and their Guild.
 */
export type HeroLevelled = Entry<
  'hero.levelled',
  { heroId: HeroId; guildId: GuildId; level: number; statDeltas: Record<StatKey, number>; pointsLost: number }
>;

// ── Regard (M4-S5, data-model rule 10, DL-43) ───────────────────────────────────────────────

/**
 * What moved a Patron's Regard for a Guild: a Quest of theirs resolved, an offer expired untaken,
 * the nightly recovery, or a module's `adjustRegard` effect (M8-S2, DL-77).
 */
export type PatronRegardCause = 'quest-success' | 'quest-failure' | 'offer-expired' | 'recovery' | 'module';

/**
 * A Patron's Regard for a Guild crossed from one of `regardBands` into another: emitted for a
 * discrete change and for the nightly recovery alike, and only on a crossing (data-model rule 10).
 * `before` and `after` are the values, which a front end shows as bands. Names the Patron and the
 * Guild, and, for `quest-success` and `quest-failure`, the Quest (`questId`, DL-112
 * item 2).
 */
export type PatronRegardChanged = Entry<
  'patron.regard-changed',
  {
    patronId: PatronId;
    guildId: GuildId;
    before: number;
    after: number;
    bandBefore: RegardBand;
    bandAfter: RegardBand;
    /** The module whose effect moved it, for the `module` cause alone (M8-S2, DL-77). */
    moduleId?: ModuleId;
  } & NamingTheQuest<PatronRegardCause, (typeof questCauses)['patron.regard-changed'][number]>
>;

/**
 * What moved a Guildmaster's Regard: a Quest their Guild resolved (M4-S5), a Transfer made between
 * their Guild and another, for the other Guild's Guildmaster (M6-S2, DL-57), or a module's
 * `adjustRegard` effect (M8-S2, DL-77).
 */
export type GuildmasterRegardCause = 'quest-success' | 'quest-failure' | 'transfer-deal' | 'module';

/**
 * A Guildmaster's Regard for `entityId`, a Patron, a Hero or a Guildmaster (DL-57), crossed
 * from one of `regardBands` into another; only on a crossing (data-model rule 10, pre-M0 review
 * B3). Names the Guildmaster, the entity and the Guildmaster's Guild, and, for
 * `quest-success` and `quest-failure`, the Quest (`questId`, DL-112 item 2).
 */
export type GuildmasterRegardChanged = Entry<
  'guildmaster.regard-changed',
  {
    guildmasterId: GuildmasterId;
    guildId: GuildId;
    entityId: EntityId;
    before: number;
    after: number;
    bandBefore: RegardBand;
    bandAfter: RegardBand;
    /** The module whose effect moved it, for the `module` cause alone (M8-S2, DL-77). */
    moduleId?: ModuleId;
  } & NamingTheQuest<GuildmasterRegardCause, (typeof questCauses)['guildmaster.regard-changed'][number]>
>;

// ── Regard between Heroes (M4-S4, data-model rule 10, DL-46) ────────────────────────────────

/**
 * What moved a Hero's Regard for another Hero: a Quest the two shared and came home from alive, the
 * nightly decay toward neutral once a year has passed without one, or a module's `adjustRegard`
 * effect (M8-S2, DL-77).
 */
export type HeroRegardCause = 'shared-quest' | 'decay' | 'module';

/**
 * A Hero's Regard for `entityId`, another Hero, crossed from one of `regardBands` into another:
 * emitted for a shared Quest's change and for the nightly decay alike, and only on a crossing
 * (data-model rule 10), one entry for each Hero whose Regard crossed, so the two of a pair each
 * have their own. `before` and `after` are the values, which a front end shows as bands. Names the
 * Hero, the other Hero, and their Guilds, and, for `shared-quest`, the Quest (`questId`,
 * DL-112 item 2). Not a Milestone.
 */
export type HeroRegardChanged = Entry<
  'hero.regard-changed',
  {
    heroId: HeroId;
    entityId: EntityId;
    before: number;
    after: number;
    bandBefore: RegardBand;
    bandAfter: RegardBand;
    /** The module whose effect moved it, for the `module` cause alone (M8-S2, DL-77). */
    moduleId?: ModuleId;
  } & NamingTheQuest<HeroRegardCause, (typeof questCauses)['hero.regard-changed'][number]>
>;

// ── Items (M5) ───────────────────────────────────────────────────────────────────────────────

/**
 * One consumable a Party carried was used on its Quest and expended from its stack (M5-S3, DL-50):
 * a `bonus` added `flat` to each Check of Encounter `encounterIndex`; a `reroll` had that failed
 * Encounter's Checks short of Success rolled again, `firstRoll` the deciding Check's failed roll (its
 * `quest.encounter` records the second rolls; v1.1.4-S2); a `heal`, spent at Encounter
 * `encounterIndex` where `heroId`'s Injury was taken, relieved its hurt for the rest of the Quest and
 * took `days` Days off it, 0 for an Injury at 1 Day (DL-285). One entry an Item, in the order used, after the Quest's
 * `quest.encounter` entries and before its `quest.resolved`. Names the Quest, the Party, the Guild
 * and, for a heal, the Hero. Not a Milestone.
 */
export type ItemExpended = Entry<'item.expended', ConsumableUse & { questId: QuestId; partyId: PartyId; guildId: GuildId }>;

// ── Gear (M5-S2, DL-49) ──────────────────────────────────────────────────────────────────────

/**
 * An Item of gear moving between a Hero's slot and their Guild's holding: the Hero, the Guild, the
 * slot, the definition, and the row moved — the unique Item (`itemId`, `stackId` null), or for a
 * Common Item the stack the unit is in after the move (`stackId`, `itemId` null), which is the
 * Hero's own stack on equipping and the Guild's stack it joined on the way back.
 */
export interface GearMove {
  heroId: HeroId;
  guildId: GuildId;
  slot: SlotKey;
  definitionKey: ItemDefinitionKey;
  itemId: ItemId | null;
  stackId: StackId | null;
}

/**
 * A Guild put gear from its holding into a Hero's slot through `equip`. Names the Hero, the Guild
 * and the Item or stack. Not a Milestone.
 */
export type ItemEquipped = Entry<'item.equipped', GearMove>;

/**
 * A Guild took gear out of a Hero's slot back into its holding through `unequip`. Names the Hero,
 * the Guild and the Item or stack. Not a Milestone.
 */
export type ItemUnequipped = Entry<'item.unequipped', GearMove>;

/**
 * Why gear went back from a Hero to their Guild's holding without an `unequip` (DL-49): the Hero
 * died or retired (the night's `gearReturn`), or the Guild folded (its gear is back before the
 * fold does anything with the Guild's holding), or the Hero was transferred to another Guild, whose
 * gear stays with the Guild they leave (M6-S2, DL-49 item 8, DL-57), or their Guild released them (DL-317).
 */
export type GearReturnCause = 'died' | 'retired' | 'guild-folded' | 'transferred' | 'released';

/**
 * Gear a Hero carried went back to their Guild's holding, for `cause`, one entry per Item. Names the
 * Hero, the Guild and the Item or stack. Not a Milestone: the Death, Retirement or fold is.
 */
export type ItemReturned = Entry<'item.returned', GearMove & { cause: GearReturnCause }>;
// ── The Market (M5-S4, R31, pre-M0 review D6, DL-51) ────────────────────────────────────────

/**
 * A Guild bought `quantity` Items of `definitionKey` from the Market through `buy`, at `unitPrice`
 * each, for `cost` Wealth in all; `itemIds` are the unique Items bought, in id order, and `[]` for a
 * common Item, whose quantity joined the Guild's stack of it. Names the Guild and each unique Item.
 */
export type ItemBought = Entry<
  'item.bought',
  {
    guildId: GuildId;
    definitionKey: ItemDefinitionKey;
    quantity: number;
    unitPrice: number;
    cost: number;
    itemIds: ItemId[];
  }
>;

/**
 * Why Items went to the Market: a Guild sold them through `sell`, or a folding Guild's unique Items
 * were sold for it (pre-M0 review D6, DL-51).
 */
export type ItemSaleCause = 'sale' | 'fold';

/**
 * A Guild sold `quantity` Items of `definitionKey` to the Market, at `unitPrice` each, for
 * `proceeds` Wealth in all, and the Market lists them: through `sell`, or, with `cause: 'fold'`, one
 * unique Item of a folding Guild at a time. `itemIds` are the unique Items sold and `[]` for a
 * common Item. Names the Guild and each unique Item.
 */
export type ItemSold = Entry<
  'item.sold',
  {
    guildId: GuildId;
    definitionKey: ItemDefinitionKey;
    quantity: number;
    unitPrice: number;
    proceeds: number;
    itemIds: ItemId[];
    cause: ItemSaleCause;
  }
>;

// ── Transfers (M6-S2, R28, data-model §3.2, DL-57) ────────────────────────────────────────────

/**
 * A Hero moved from `fromGuildId`'s Roster to `toGuildId`'s for `fee` Wealth, paid by the second to
 * the first: through `transferIn`, `transferOut`, or `acceptTransfer`, which names the Transfer Offer
 * accepted as `offerId` (`null` otherwise). Their old Contract ended, and they signed the new one's
 * terms with the Guild they joined (DL-315). A Milestone, naming the Hero, both Guilds and the offer.
 */
export type HeroTransferred = Entry<
  'hero.transferred',
  { heroId: HeroId; fromGuildId: GuildId; toGuildId: GuildId; fee: number; offerId: OfferId | null } & ContractTerms
>;

/** A Transfer Offer as its events carry it: the offer, the two Guilds, the Hero and the fee. */
export interface OfferTerms {
  offerId: OfferId;
  /** The Guild whose Roster the Hero is on, which answers the offer. */
  fromGuildId: GuildId;
  /** The Guild that made the offer and would pay the fee. */
  toGuildId: GuildId;
  heroId: HeroId;
  fee: number;
}

/**
 * A Guild offered `fee` for a Hero of another Guild whose controller answers for itself: a row in
 * `world.offers`, standing until `expiresOnTurn`'s night unless accepted or declined first. Names the
 * offer, the Hero and both Guilds. Not a Milestone: the Transfer is.
 */
export type GuildTransferOffered = Entry<'guild.transfer-offered', OfferTerms & { expiresOnTurn: Turn }>;

/**
 * The Guild asked declined a Transfer Offer through `declineTransfer`, and the offer was removed.
 * Names the offer, the Hero and both Guilds.
 */
export type GuildTransferOfferDeclined = Entry<'guild.transfer-offer-declined', OfferTerms>;

/**
 * Why a Transfer Offer was removed unanswered: its time ran out (`expired`, the night of its last
 * Day), its Hero left the Roster it was made for (`hero-left`: transferred, dead or retired), or one
 * of the two Guilds folded (`guild-folded`).
 */
export type TransferOfferEndCause = 'expired' | 'hero-left' | 'guild-folded';

/**
 * A Transfer Offer was removed unanswered, for `cause`. Names the offer, the Hero and both Guilds.
 */
export type GuildTransferOfferExpired = Entry<'guild.transfer-offer-expired', OfferTerms & { cause: TransferOfferEndCause }>;

// ── Modules' effects (M8-S2, ADR-0005, DL-77) ───────────────────────────────────────────────

/**
 * A Guild's Wealth moved from `before` to `after` by a module's `adjustWealth` effect: the one change
 * of Wealth no other event records. Names the Guild and, as `moduleId`, the module. Not a Milestone.
 */
export type GuildWealthChanged = Entry<
  'guild.wealth-changed',
  { guildId: GuildId; moduleId: ModuleId; before: number; after: number }
>;

/** Every event the engine emits. */
export type EngineEvent =
  | WorldCreated
  | GuildFounded
  | GuildmasterGenerated
  | HeroGenerated
  | PatronGenerated
  | WorldRulesAdopted
  | GuildWagesPaid
  | GuildHallUpkeepPaid
  | GuildBelowFloor
  | GuildFloorRecovered
  | HeroRecruited
  | HeroContractRenewed
  | HeroContractExpired
  | HeroReleased
  | HeroLeftPool
  | QuestOffered
  | QuestExpired
  | QuestTaken
  | QuestEncounter
  | QuestResolved
  | QuestLoot
  | HeroInjured
  | HeroDied
  | HeroXpGained
  | HeroMoraleChanged
  | HeroFatigueChanged
  | HeroHealed
  | HeroTraitGained
  | HeroTraitLost
  | HeroRetired
  | HeroDeclined
  | GameEnded
  | GuildFolded
  | GuildmasterSucceeded
  | HeroLeftGuild
  | GuildImproved
  | GuildCaptainNamed
  | HeroLevelled
  | PatronRegardChanged
  | GuildmasterRegardChanged
  | HeroRegardChanged
  | ItemExpended
  | ItemEquipped
  | ItemUnequipped
  | ItemReturned
  | ItemBought
  | ItemSold
  | HeroTransferred
  | GuildTransferOffered
  | GuildTransferOfferDeclined
  | GuildTransferOfferExpired
  | GuildWealthChanged;

/** Every event type the engine emits. */
export type EngineEventType = EngineEvent['type'];

/** The event of type `Type`. */
export type EngineEventOf<Type extends EngineEventType> = Extract<EngineEvent, { type: Type }>;

/**
 * Whether each event type is a Milestone (`CONTEXT.md`): the entries a front end picks out of the
 * History. Keyed by every event type and by nothing else, so the compiler refuses an event type
 * added to `EngineEvent` without saying which it is. `emit` reads it (DL-24) through `isMilestone`,
 * which lets `milestoneWhen` decide a type that is a Milestone for some payloads only; such a type
 * is `false` here.
 */
export const milestoneTypes: Readonly<Record<EngineEventType, boolean>> = Object.freeze({
  'world.created': false,
  'guild.founded': true,
  'guildmaster.generated': false,
  'hero.generated': false,
  'patron.generated': false,
  'world.rules-adopted': true,
  'guild.wages-paid': false,
  'guild.hall-upkeep-paid': false,
  'guild.below-floor': false,
  'guild.floor-recovered': false,
  'hero.recruited': true,
  'hero.contract-renewed': true,
  'hero.contract-expired': true,
  'hero.released': true,
  'hero.left-pool': false,
  'quest.offered': false,
  'quest.expired': false,
  'quest.taken': false,
  'quest.encounter': false,
  'quest.resolved': false,
  'quest.loot': false,
  'hero.injured': false,
  'hero.died': true,
  'hero.xp-gained': false,
  'hero.morale-changed': false,
  'hero.fatigue-changed': false,
  'hero.healed': false,
  'hero.trait-gained': true,
  'hero.trait-lost': true,
  'hero.retired': true,
  'hero.declined': false,
  'game.ended': true,
  'guild.folded': true,
  'guildmaster.succeeded': true,
  'hero.left-guild': false,
  'guild.improved': true,
  'guild.captain-named': true,
  'hero.levelled': true,
  'patron.regard-changed': false,
  'guildmaster.regard-changed': false,
  'hero.regard-changed': false,
  'item.expended': false,
  'item.equipped': false,
  'item.unequipped': false,
  'item.returned': false,
  'item.bought': false,
  'item.sold': false,
  'hero.transferred': true,
  'guild.transfer-offered': false,
  'guild.transfer-offer-declined': false,
  'guild.transfer-offer-expired': false,
  'guild.wealth-changed': false,
} satisfies Record<EngineEventType, boolean>);

/** A rule saying, from its payload, whether an entry of `Type` is a Milestone. */
type MilestoneRule<Type extends EngineEventType> = (payload: EngineEventOf<Type>['payload']) => boolean;

/**
 * The event types that are Milestones for some payloads only, each with the rule that says which
 * (M5-S5, DL-52): `quest.loot` when its Item is unique. `milestoneTypes` holds `false` for them.
 */
export const milestoneWhen: { readonly [Type in EngineEventType]?: MilestoneRule<Type> } = Object.freeze({
  'quest.loot': (payload: QuestLoot['payload']) => payload.itemId !== null,
});

/** Whether an event of `type` with `payload` is a Milestone: `milestoneWhen`'s rule, or else `milestoneTypes`. */
export function isMilestone<Type extends EngineEventType>(type: Type, payload: EngineEventOf<Type>['payload']): boolean {
  const rule = milestoneWhen[type] as MilestoneRule<Type> | undefined;
  return rule === undefined ? milestoneTypes[type] : rule(payload);
}

// ── Modules' own events (M8-S2, ADR-0005, DL-77) ────────────────────────────────────────────

/**
 * What keeps a module's event type apart from the engine's, in the types alone: nothing at run
 * time carries it. With it, comparing an event's `type` to one of the engine's narrows a
 * `TurnEvent` to that engine event, as it narrows an `EngineEvent`, and a module's event never
 * passes for one of the engine's.
 */
interface ModuleEventBrand {
  readonly __moduleEvent: true;
}

/**
 * A module's event type: `<module id>.<what-happened>`, `probe.fired`, in the module's namespace and
 * never one of the engine's (the module's `emit` refuses any other).
 */
export type ModuleEventType<Type extends EventType = EventType> = Type & ModuleEventBrand;

/**
 * An event a module emits (M8-S2, DL-77): the engine's entry shape, typed by its module and not by
 * the engine. A module declares its own, `ModuleEvent<'probe.fired', { ... }>`, and the engine's
 * `EngineEvent` never lists them, so installing a module edits nothing in the core. The engine
 * treats every module's event alike: it appends it to the History, where it is an `Entry` like any
 * other, and counts it under its type.
 */
export type ModuleEvent<Type extends EventType = EventType, Payload = unknown> = Entry<ModuleEventType<Type>, Payload>;

/**
 * What a Turn produces: the engine's events and, with a module installed, the modules' own
 * (`advance`, `fastForward`). A reader narrows it by the engine's event types, as it narrows an
 * `EngineEvent`, and tells a module's event by `isModuleEvent`.
 */
export type TurnEvent = EngineEvent | ModuleEvent;

/** Whether `event`'s type is one of the engine's: `milestoneTypes` lists it. */
export function isEngineEvent(event: Pick<Entry, 'type'>): event is EngineEvent {
  return Object.hasOwn(milestoneTypes, event.type);
}

/** Whether `event` is a module's own: its type is none of the engine's. */
export function isModuleEvent(event: Pick<Entry, 'type'>): event is ModuleEvent {
  return !isEngineEvent(event);
}
