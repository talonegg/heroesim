/**
 * What the engine reports. Every event is a past-tense fact carrying ids and numbers and
 * never a sentence: turning these into English is `narrate`'s job (ADR-0002, DL-08).
 *
 * Later epics add members to the union. They never change an existing member's shape.
 */

import type { Consequence, DecisionOptionKind } from './content.js';
import type { BeatResult, Calibre, HallImprovement, Reckoning, Stat } from './types.js';

/**
 * Why the Guild's coin moved. `'hall'` and `'recruitment'` are additions, not changes: no
 * field is removed or retyped, producers are unaffected, and the exhaustiveness check
 * makes every consumer declare what it does with them (E3 §4, E4 §4).
 */
export type CoinReason =
  | 'fee'
  | 'upkeep'
  | 'consequence'
  | 'hall'
  | 'recruitment'
  | 'transfer'
  | 'poach'
  /** Coin sent up the road to a Party that asked for it mid-Commission (E6-S3). */
  | 'sendCoin';

/** Which Hero, Patron and Sphere a Beat's Vignette was filled from. */
export interface BeatSlots {
  /** The Hero the Vignette's Hero slot resolved to. */
  heroId: string;
  /** The Patron whose Commission this is. */
  patronId: string;
  /** The Sphere that Patron belongs to. */
  sphereId: string;
  /** The Trait the Vignette turns on, from `requiresTrait` or a `with_trait:` slot. */
  trait?: string;
}

/** A Career was generated from a seed. Always the first event of a Career. */
export interface CareerStartedEvent {
  type: 'CareerStarted';
  /** The Day it happened. */
  day: number;
  /** The string the world was generated from. */
  seed: string;
  /** The Guild's name. */
  guildName: string;
  /** The starting Roster, by id. */
  heroIds: string[];
}

/** The Board finished a refresh. Carries what is on it now. */
export interface BoardRefreshedEvent {
  type: 'BoardRefreshed';
  day: number;
  /** The Commissions now on offer, by id. */
  commissionIds: string[];
}

/** A Patron posted a Commission to the Board. */
export interface CommissionPostedEvent {
  type: 'CommissionPosted';
  day: number;
  commissionId: string;
  /** The Patron who posted it. */
  patronId: string;
}

/** Nobody took a Commission and it came off the Board. */
export interface CommissionExpiredEvent {
  type: 'CommissionExpired';
  day: number;
  commissionId: string;
  patronId: string;
}

/** A Rival took work the player left on the Board. */
export interface CommissionTakenByRivalEvent {
  type: 'CommissionTakenByRival';
  day: number;
  commissionId: string;
  patronId: string;
  /** The Rival who took it. Their Standing rose for it. */
  rivalId: string;
}

/** Why a Hero declined a Commission. Regard wins where both would apply (E2). */
export type RefusalReason = 'regard' | 'trait';

/**
 * A Hero would not take the work. Reported on the commit that insisted upon them, never
 * from the pure query that asks who would refuse (E2).
 */
export interface CommissionRefusedEvent {
  type: 'CommissionRefused';
  day: number;
  heroId: string;
  commissionId: string;
  /** The relationship, or a Trait that says not this, not for them. */
  reason: RefusalReason;
  /** The Trait that refused. Set only when `reason` is `'trait'`. */
  trait?: string;
  /** What they thought of the Guildmaster at the moment they refused. */
  regardValue: number;
}

/** The Guildmaster sent a refusing Hero anyway, and paid for it in Regard (E2). */
export interface InsistenceAppliedEvent {
  type: 'InsistenceApplied';
  day: number;
  heroId: string;
  commissionId: string;
  /** What it cost, signed and negative. The Regard event that follows carries the clamping. */
  delta: number;
  /** Their Regard for the Guildmaster after it was charged. */
  value: number;
}

/** A Hero walked out over low Regard. They are readable in `formerHeroes` afterwards (E2). */
export interface HeroDepartedEvent {
  type: 'HeroDeparted';
  day: number;
  heroId: string;
  /** How far their Regard for the Guildmaster had fallen when they went. */
  regardValue: number;
  /** Departure has one cause. E3 adds the other ways a Hero leaves. */
  reason: 'regard';
}

/** A Party left for a Commission. Its Backing is fixed from here on. */
export interface PartyCommittedEvent {
  type: 'PartyCommitted';
  day: number;
  partyId: string;
  commissionId: string;
  /** The Heroes sent, by id. */
  heroIds: string[];
  /** What the Guildmaster contributes to every Check this Party makes. */
  backing: number;
  /** The Day the Party is due back. */
  returnsOn: number;
}

/** One Beat of a Commission was resolved by a Check. */
export interface BeatResolvedEvent {
  type: 'BeatResolved';
  day: number;
  partyId: string;
  commissionId: string;
  /** The Vignette the Beat came from. `narrate` reads its template for the outcome. */
  vignetteId: string;
  /** Which Beat of this Commission it was, counting from one. */
  beatIndex: number;
  /** The Hero the Check was made against. */
  heroId: string;
  /** The Stat the Check was resolved against. */
  stat: Stat;
  /** The die roll alone. */
  roll: number;
  /** Roll plus the Hero's Stat, their Trait modifiers and the Party's Backing. */
  total: number;
  /** What the total had to reach. */
  dc: number;
  result: BeatResult;
  /** What the Vignette's slots resolved to. */
  slots: BeatSlots;
}

/** A Beat's outcome did something to the world. The specific event follows this one. */
export interface ConsequenceAppliedEvent {
  type: 'ConsequenceApplied';
  day: number;
  partyId: string;
  /** Exactly what the Vignette asked for. */
  consequence: Consequence;
  /** The Hero it landed on, where it landed on one. */
  heroId?: string;
}

/** A Party came back, and the Commission was settled one way or the other. */
export interface PartyReturnedEvent {
  type: 'PartyReturned';
  day: number;
  partyId: string;
  commissionId: string;
  patronId: string;
  /** Who came back. */
  heroIds: string[];
  /** Whether the Commission's score reached half its Beats, rounded up. */
  succeeded: boolean;
  /** The Commission's final score. */
  score: number;
  /** The fee paid. Zero when the work was not finished. */
  feePaid: number;
}

/** The Guild's coin moved. */
export interface CoinChangedEvent {
  type: 'CoinChanged';
  day: number;
  /** Signed. Negative is money out. */
  delta: number;
  /** The balance after the change. */
  balance: number;
  reason: CoinReason;
}

/** A Patron's Regard for the Guild moved. */
export interface PatronRegardChangedEvent {
  type: 'PatronRegardChanged';
  day: number;
  patronId: string;
  /** What actually moved, after clamping. */
  delta: number;
  /** The value after the change. */
  value: number;
  /** What moved it. */
  reason: string;
}

/**
 * A Rival's Regard for the Guild moved (E5). It exists for the movements nothing else
 * reports — a Vignette's `rivalRegard` Consequence — so that every Regard movement in the
 * game arrives as an event carrying the delta that actually landed after clamping. A
 * Poaching does **not** emit it: {@link HeroPoachedEvent} already carries what it cost.
 */
export interface RivalRegardChangedEvent {
  type: 'RivalRegardChanged';
  day: number;
  rivalId: string;
  /** What actually moved, after clamping. */
  delta: number;
  /** The value after the change. */
  value: number;
  /** What moved it. */
  reason: string;
}

/** A Hero's Regard for the Guildmaster moved. */
export interface HeroRegardForGuildmasterChangedEvent {
  type: 'HeroRegardForGuildmasterChanged';
  day: number;
  heroId: string;
  /** What actually moved, after clamping. */
  delta: number;
  /** The value after the change. */
  value: number;
  /** What moved it. */
  reason: string;
}

/** A Hero gained a Trait: a disposition, an Injury or a Scar (ADR-0005). */
export interface TraitGainedEvent {
  type: 'TraitGained';
  day: number;
  heroId: string;
  /** The name of the TraitDef in content. */
  trait: string;
  /** Set when it is an Injury: the Day it lifts. */
  liftsOn?: number;
}

/**
 * A timed Trait that is **not** an Injury ran its span and lifted. Reserved: an Injury
 * lifting emits {@link InjuryLiftedEvent} alone, so narration never has to de-duplicate a
 * pair (E3 §4). Nothing in E3 gives a timed Trait that is not an Injury; E6 may.
 */
export interface TraitLiftedEvent {
  type: 'TraitLifted';
  day: number;
  heroId: string;
  /** The name of the TraitDef in content. */
  trait: string;
}

/**
 * Work marked somebody: the slot Hero of a failed Beat took an Injury (E3). `TraitGained`
 * carries the same fact mechanically; this is the one narration reads.
 */
export interface HeroInjuredEvent {
  type: 'HeroInjured';
  day: number;
  heroId: string;
  /** The name of the TraitDef in content. */
  trait: string;
  /** The Day it lifts, after the infirmary has been applied to the span. */
  liftsOn: number;
  /** The Party it happened on. Absent if an Injury is ever given away from work. */
  partyId?: string;
  /** Which Beat of that Commission it was, counting from one. */
  beatIndex?: number;
}

/** An Injury ran its span and lifted (E3). */
export interface InjuryLiftedEvent {
  type: 'InjuryLifted';
  day: number;
  heroId: string;
  /** The name of the TraitDef in content. */
  trait: string;
  /** The Day it was taken. */
  injuredOn: number;
  /** How many Days it was borne for. */
  daysBorne: number;
}

/** A badly failed Beat left a permanent mark. A Scar is never removed (E3). */
export interface HeroScarredEvent {
  type: 'HeroScarred';
  day: number;
  heroId: string;
  /** The name of the TraitDef in content. */
  trait: string;
  partyId?: string;
  beatIndex?: number;
}

/**
 * A Hero did not come back. They leave the Roster for `formerHeroes` and never return;
 * the rest of the Party finishes the Commission short-handed (E3).
 */
export interface HeroDiedEvent {
  type: 'HeroDied';
  day: number;
  heroId: string;
  partyId?: string;
  beatIndex?: number;
}

/** A Hero reached the end of a working life. The one exit that ends well (E3). */
export interface HeroRetiredEvent {
  type: 'HeroRetired';
  day: number;
  heroId: string;
  /** How old they were. */
  age: number;
  /** Whole years on the Roster: `round((day − joinedOn) / daysPerYear)`. */
  yearsServed: number;
}

/**
 * A batch of Applicants turned up asking for work (E4-S2). It carries the ids and their
 * calibres so that a front end can render the batch without a second lookup, and it does
 * **not** say which of them have been here before: that is what the offer itself reveals.
 */
export interface ApplicantsArrivedEvent {
  type: 'ApplicantsArrived';
  day: number;
  /** The Applicants who arrived, in the order they are listed. */
  applicantIds: string[];
  /** Their calibres, in the same order as `applicantIds`. */
  calibres: Calibre[];
  /** The Day every one of them gives up waiting. */
  expiresOn: number;
}

/**
 * An offer was taken: the coin is paid and somebody is joining (E4-S3). This is the
 * transaction; the `HeroJoined` that follows it is the fact about the Roster, and E5
 * emits that one after a Transfer where no Applicant was ever involved.
 */
export interface ApplicantAcceptedEvent {
  type: 'ApplicantAccepted';
  day: number;
  applicantId: string;
  /** The id they join the Roster under. The same id they applied with (E4-S3). */
  heroId: string;
  /** What they asked for. The `CoinChanged` that follows carries the sign. */
  fee: number;
  calibre: Calibre;
}

/**
 * An Applicant went away: sent away by the player, or tired of waiting (E4).
 *
 * It carries their `name` for the same reason `HeroJoined` does — somebody who has gone
 * is gone from `career.applicants` too, so narration has nothing left to look the id up
 * in. One addition to the shape E4 §4 sketches, recorded in DL-19.
 */
export interface ApplicantDeclinedEvent {
  type: 'ApplicantDeclined';
  day: number;
  applicantId: string;
  name: string;
  reason: 'player' | 'expired';
}

/**
 * The Roster gained somebody (E4-S3). E5 emits this after a Transfer and a Poaching too,
 * because the Roster gaining a person is the same fact however they arrived.
 */
export interface HeroJoinedEvent {
  type: 'HeroJoined';
  day: number;
  heroId: string;
  name: string;
  calibre: Calibre;
  age: number;
  /** Set when this is somebody coming back, so narration can say who (E4-S4). */
  formerHeroId?: string;
}

/**
 * A Hero came over from a Rival, above board and with that Rival's consent (E5-S2). The
 * transaction; the `CoinChanged` that follows carries what it cost and the `HeroJoined`
 * after that is the fact about the Roster.
 */
export interface HeroTransferredEvent {
  type: 'HeroTransferred';
  day: number;
  heroId: string;
  /** The Rival they came from. Their Regard for your Guild is untouched: you did it properly. */
  fromRivalId: string;
  /** What it cost. A positive number; the `CoinChanged` that follows carries the sign. */
  fee: number;
  /** The balance after it was paid for. */
  balance: number;
}

/**
 * A Hero was approached behind their employer's back and took the offer (E5-S3). Cheaper
 * than a Transfer, and it costs that Rival's goodwill — which is what the last two fields
 * carry, because the Regard is the bill and the player should read it here.
 */
export interface HeroPoachedEvent {
  type: 'HeroPoached';
  day: number;
  heroId: string;
  fromRivalId: string;
  fee: number;
  balance: number;
  /** What the Rival's Regard for your Guild actually moved, after clamping. Negative. */
  rivalRegardDelta: number;
  /** Their Regard for your Guild after it moved. */
  rivalRegardValue: number;
}

/**
 * A soured Rival took somebody off your Roster, by exactly the rule you poach by (E5-S4).
 * It carries the Regard that made them takeable, because that is the whole warning the
 * player ever gets: a Hero is never taken from a Regard you have not watched fall.
 */
export interface RivalPoachedHeroEvent {
  type: 'RivalPoachedHero';
  day: number;
  heroId: string;
  /** The Rival they now work for. */
  toRivalId: string;
  /** Their Regard for the Guildmaster at the moment they were approached. */
  regardValue: number;
}

/** A Rival's Roster gained or lost somebody of its own accord (E5-S5). */
export interface RivalRosterChangedEvent {
  type: 'RivalRosterChanged';
  day: number;
  rivalId: string;
  /** Who joined them, by id. */
  joinedHeroIds: string[];
  /** Who left them, by id. */
  leftHeroIds: string[];
}

/**
 * Why a move did not happen. A refusal is a thing that happened in the world, not a
 * programming error, so it is an event and the front ends narrate it (E5-S2).
 *
 * `'regard'` is the Rival declining to deal with you at all; `'heroRegard'` is a Hero who
 * is not disaffected enough to be approached; `'rosterFull'` is your own Roster at its
 * cap; `'coin'` is the Guild unable to pay. Where several hold at once, that is the order
 * they are reported in — the obstacle that is hardest to shift is named first.
 */
export type TransferRefusedReason = 'regard' | 'heroRegard' | 'rosterFull' | 'coin';

/** A Transfer or a Poaching was refused, and nothing at all moved (E5-S2). */
export interface TransferRefusedEvent {
  type: 'TransferRefused';
  day: number;
  rivalId: string;
  heroId: string;
  reason: TransferRefusedReason;
}

/**
 * What a Decision's option does, as the offer reports it (E6-S2). Ids, a kind and a
 * number: the label is authored prose and is `narrate`'s to fill (ADR-0002).
 */
export interface WordOptionOffered {
  id: string;
  kind: DecisionOptionKind;
  /** Coin it costs. Set on a `sendCoin` option and absent on the other two. */
  cost?: number;
  /**
   * Whether the Guild could pay for it **at the moment the word arrived**. An event is a
   * past-tense fact, so this is not re-read later; coin moves while a Party waits, and
   * `wordOffers` is what answers "can it be taken now" (DL-23 §8).
   */
  affordable: boolean;
}

/**
 * A Party stopped part-way through a Commission and sent word (E6-S2). The one place the
 * player's attention snaps back mid-Commission, so it is its own member of the attention
 * set. It carries option **ids** and never their prose.
 */
export interface PartyAwaitingWordEvent {
  type: 'PartyAwaitingWord';
  day: number;
  partyId: string;
  commissionId: string;
  /** The DecisionDef in content that fired. */
  decisionId: string;
  /** The Beat it displaced, counting from one. That Beat fires when the word is answered. */
  beatIndex: number;
  /** The Day the `default` option is taken if nobody answers. */
  timesOutOn: number;
  /** Every option offered, in the order they were authored. */
  options: WordOptionOffered[];
  /** What the Decision's slots resolved to, exactly as a Beat's do. */
  slots: BeatSlots;
}

/**
 * A Party got its answer (E6-S3). Emitted for the Guildmaster's own answer and for the
 * `default` taken on the timeout alike, so narration can say what was chosen either way
 * without a front end having remembered it.
 *
 * It carries `commissionId` and `slots` as well as the ids E6 §4 sketches, for the reason
 * `ApplicantDeclined` carries a name (DL-19): the option's `label` is authored prose with
 * the same tokens a prompt has, and by the time this is read `pendingWord` has been
 * cleared, so nothing else is left to fill them from.
 */
export interface PartyAnsweredEvent {
  type: 'PartyAnswered';
  day: number;
  partyId: string;
  commissionId: string;
  decisionId: string;
  /** The option taken. */
  optionId: string;
  /** True when nobody answered and the timeout took the Decision's `default`. */
  byDefault: boolean;
  slots: BeatSlots;
}

/**
 * A Commission was called off part-way through and the Party told to come home (E6-S3).
 * They return through `PartyReturned` like anybody else, with `succeeded: false` and the
 * pro-rata fee; this is the fact that the work was stopped rather than finished.
 */
export interface PartyTurnedBackEvent {
  type: 'PartyTurnedBack';
  day: number;
  partyId: string;
  commissionId: string;
  /** How many Beats had been resolved when the word came. */
  beatsResolved: number;
  /** How many the Commission asked for. The rest are skipped, so no further harm is done. */
  beatCount: number;
}

/** The Guild bought one of the three things coin buys besides Upkeep (E3). */
export interface HallImprovedEvent {
  type: 'HallImproved';
  day: number;
  improvement: HallImprovement;
  /** What it cost. A positive number; the `CoinChanged` that follows carries the sign. */
  cost: number;
  /** The balance after it was paid for. */
  balance: number;
}

/** Upkeep fell due and was taken, whether or not anyone worked. */
export interface UpkeepOwedEvent {
  type: 'UpkeepOwed';
  day: number;
  /** What was owed. */
  amount: number;
  /** The balance after it was taken. */
  balance: number;
}

/** The Career ended. Always the last event of a Career. */
export interface CareerEndedEvent {
  type: 'CareerEnded';
  day: number;
  /** Retirement ends a Career well. Insolvency is the only way to lose. */
  reason: 'retirement' | 'insolvency';
  /** What the Guild became. */
  reckoning: Reckoning;
}

/** Everything the engine can report. */
export type GameEvent =
  | CareerStartedEvent
  | BoardRefreshedEvent
  | CommissionPostedEvent
  | CommissionExpiredEvent
  | CommissionTakenByRivalEvent
  | CommissionRefusedEvent
  | InsistenceAppliedEvent
  | HeroDepartedEvent
  | PartyCommittedEvent
  | BeatResolvedEvent
  | ConsequenceAppliedEvent
  | PartyReturnedEvent
  | CoinChangedEvent
  | PatronRegardChangedEvent
  | HeroRegardForGuildmasterChangedEvent
  | TraitGainedEvent
  | TraitLiftedEvent
  | HeroInjuredEvent
  | InjuryLiftedEvent
  | HeroScarredEvent
  | HeroDiedEvent
  | HeroRetiredEvent
  | ApplicantsArrivedEvent
  | ApplicantAcceptedEvent
  | ApplicantDeclinedEvent
  | HeroJoinedEvent
  | HeroTransferredEvent
  | HeroPoachedEvent
  | RivalPoachedHeroEvent
  | RivalRosterChangedEvent
  | RivalRegardChangedEvent
  | TransferRefusedEvent
  | PartyAwaitingWordEvent
  | PartyAnsweredEvent
  | PartyTurnedBackEvent
  | HallImprovedEvent
  | UpkeepOwedEvent
  | CareerEndedEvent;

/** The `type` of any event. */
export type GameEventType = GameEvent['type'];
