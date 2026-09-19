/**
 * What the engine reports. Every event is a past-tense fact carrying ids and numbers and
 * never a sentence: turning these into English is `narrate`'s job (ADR-0002, DL-08).
 *
 * Later epics add members to the union. They never change an existing member's shape.
 */

import type { Consequence } from './content.js';
import type { BeatResult, Reckoning, Stat } from './types.js';

/** Why the Guild's coin moved. */
export type CoinReason = 'fee' | 'upkeep' | 'consequence';

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

/** An Injury ran its span and lifted. */
export interface TraitLiftedEvent {
  type: 'TraitLifted';
  day: number;
  heroId: string;
  /** The name of the TraitDef in content. */
  trait: string;
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
  | PartyCommittedEvent
  | BeatResolvedEvent
  | ConsequenceAppliedEvent
  | PartyReturnedEvent
  | CoinChangedEvent
  | PatronRegardChangedEvent
  | HeroRegardForGuildmasterChangedEvent
  | TraitGainedEvent
  | TraitLiftedEvent
  | UpkeepOwedEvent
  | CareerEndedEvent;

/** The `type` of any event. */
export type GameEventType = GameEvent['type'];
