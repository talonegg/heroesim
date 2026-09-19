/**
 * The world state. Every type here is plain JSON-serialisable data: no classes, no
 * functions, no `Date`, no `Map` or `Set`. Optional fields are omitted when they do not
 * apply rather than set to `undefined`, so that a serialise round-trip is deep-equal.
 */

import type { GameConfig } from './config.js';
import type { GameEvent } from './events.js';
import type { RngState } from './rng.js';

/** One of the four numeric capabilities a Check is resolved against. */
export type Stat = 'Might' | 'Craft' | 'Nerve' | 'Guile';

/** The four Stats, in their canonical order. */
export const STATS: readonly Stat[] = ['Might', 'Craft', 'Nerve', 'Guile'];

/** A person's four Stats. Each is generated within `config.statMin`..`config.statMax`. */
export type Stats = Record<Stat, number>;

/** Which pronouns a person takes, so that narration reads correctly. */
export type Pronouns = 'she' | 'he' | 'they';

/** What kind of thing a Regard is. The one place new kinds of relationship are added. */
export type RegardNature = 'neutral' | 'bond' | 'rivalry';

/** A directed opinion one party holds of another. */
export interface Regard {
  /** Clamped to `config.regardMin`..`config.regardMax`. */
  value: number;
  /** The last thing that moved it. */
  reason: string;
  /** Whether this is a plain opinion, a bond or a rivalry. */
  nature: RegardNature;
}

/** A Trait as held by a person, as opposed to the TraitDef that defines it in content. */
export interface HeroTrait {
  /** The name of a TraitDef in content. */
  name: string;
  /** The Day it was acquired. */
  since: number;
  /** Set on an Injury: the Day it lifts. Absent on a permanent Trait. */
  liftsOn?: number;
}

/** A named individual on the Roster. */
export interface Hero {
  /** Unique within the Career. */
  id: string;
  /** First name, sometimes with an epithet. Unique within the Roster. */
  name: string;
  pronouns: Pronouns;
  stats: Stats;
  /** The name of a BackgroundDef in content. */
  background: string;
  traits: HeroTrait[];
  /** What this Hero thinks of the Guildmaster. */
  regardForGuildmaster: Regard;
  /** What this Hero thinks of other Heroes, by their id. */
  regardFor: Record<string, Regard>;
  /** The Day they joined the Roster. */
  joinedOn: number;
}

/** The player's character in the world. Never a member of the Roster (ADR-0007). */
export interface Guildmaster {
  name: string;
  pronouns: Pronouns;
  stats: Stats;
  /** The name of a BackgroundDef in content. */
  background: string;
  traits: HeroTrait[];
  /** What the Guildmaster thinks of each Hero, by their id. */
  regardFor: Record<string, Regard>;
  /** The Stats they began with, kept for the reckoning. */
  startingStats: Stats;
}

/** A person or body that offers Commissions and holds Regard for the Guild. */
export interface Patron {
  id: string;
  name: string;
  /** The id of a SphereDef in content. */
  sphere: string;
  regardForGuild: Regard;
}

/** A piece of paid work offered by a Patron. */
export interface Commission {
  id: string;
  /** The Patron who posted it. */
  patronId: string;
  title: string;
  fee: number;
  /** The base DC, `config.difficultyMin`..`config.difficultyMax`. Shifts every Beat's DC. */
  difficulty: number;
  /** How many Days the Party is away. */
  spanDays: number;
  /** How many Beats the work resolves as. */
  beatCount: number;
  /**
   * The tags carried over from the Sphere's entry for this title. Vignette selection
   * matches against them, so they travel on the Commission (DL-09).
   */
  tags: string[];
  postedOn: number;
  /** The next Board refresh: the Commission is gone after it. */
  expiresOn: number;
}

/** How a Beat's Check came out. */
export type BeatResult = 'failure' | 'success' | 'critical';

/** The Heroes sent on one Commission, existing only for its duration. */
export interface Party {
  id: string;
  /** The id of the Commission being worked. */
  commissionId: string;
  /**
   * The Commission itself. It leaves the Board when the Party is committed, and travels
   * with the Party so that it stays readable while the work is being done (DL-09).
   */
  commission: Commission;
  heroIds: string[];
  /** Fixed at commit, and applied to every Check this Party makes. */
  backing: number;
  departedOn: number;
  returnsOn: number;
  /** The Days on which a Beat fires, ascending. */
  beatDays: number[];
  /** One entry per Beat resolved so far, in order. */
  beatsResolved: BeatResult[];
  /** The ids of the Vignettes already spent on this Commission. */
  vignettesUsed: string[];
  /** The Commission's running score. Decides whether the work succeeded (DL-09). */
  score: number;
}

/** Another Guild. Not the same type as the player's (ADR-0003). E1 models the name and Standing only. */
export interface Rival {
  id: string;
  name: string;
  standing: number;
}

/** Everything the player owns. */
export interface Guild {
  name: string;
  guildmaster: Guildmaster;
  roster: Hero[];
  /** Death, Departure and Retirement move a Hero here rather than deleting them. */
  formerHeroes: Hero[];
  coin: number;
  /** Hall improvements. Empty in E1. */
  hall: string[];
}

/** Counters kept through the Career so the reckoning can be assembled at the end. */
export interface CareerLedger {
  commissionsCompleted: number;
  commissionsFailed: number;
  /** Completed Commissions by Patron id, for the favourite Patron. */
  commissionsByPatron: Record<string, number>;
  /** The largest coin balance the Guild ever reached. */
  peakCoin: number;
  /** Whether coin was below zero at the previous Upkeep. Two in a row is insolvency. */
  lastUpkeepNegative: boolean;
}

/** What the Guild became. */
export interface Reckoning {
  /** Whole years the Career ran. */
  years: number;
  heroesOnRoster: number;
  heroesLost: number;
  commissionsCompleted: number;
  commissionsFailed: number;
  /** The Patron who bought the most finished work. Absent if none ever did. */
  favouritePatron?: { id: string; name: string; count: number };
  peakCoin: number;
  finalCoin: number;
  standing: number;
  guildmasterStats: { start: Stats; end: Stats };
}

/** How and when a Career ended. */
export interface CareerEnd {
  reason: 'retirement' | 'insolvency';
  onDay: number;
  reckoning: Reckoning;
}

/** One playthrough, and the whole of the state a save holds. */
export interface Career {
  /** Bumped only by a breaking change to this shape. A save that does not match is refused. */
  formatVersion: 1;
  /** The string the world was generated from. */
  seed: string;
  config: GameConfig;
  /** The generator state, so a loaded Career continues on the same random path (DL-07). */
  rng: RngState;
  /** The current Day. Starts at 1. */
  day: number;
  guild: Guild;
  patrons: Patron[];
  /** The Commissions currently on offer. */
  board: Commission[];
  /** The Parties currently away. */
  parties: Party[];
  rivals: Rival[];
  ledger: CareerLedger;
  /**
   * The most recently finished Commissions, newest first, capped at
   * `config.recentCommissionsKept`. Keeps a returned Party's work readable for narration
   * after the Party itself has gone (DL-09).
   */
  recentCommissions: Commission[];
  /** Set once, when the Career ends. Absent while it is still running. */
  ended?: CareerEnd;
}

/** What every public engine function returns: the new world, and what happened. */
export interface Step {
  /** A new Career. The Career passed in is never mutated. */
  career: Career;
  /** What happened, in the order it happened. */
  events: GameEvent[];
}
