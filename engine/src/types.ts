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
  /** Set on a timed Trait: the Day it lifts. Absent on a permanent Trait. */
  liftsOn?: number;
  /**
   * What kind of Trait this is, copied off the TraitDef at the moment it was given (E6).
   * It closes the shortcut DL-16 §5 left open: until E6 a Trait carrying `liftsOn` *was*
   * an Injury, because nothing gave a timed Trait that was not one, and `isInjured` and
   * the three readers built on it take a Career and no content. A Decision's option may
   * now give a timed Trait that is not an Injury, and its holder must stay committable
   * and must not be labelled injured by either front end.
   *
   * Absent on every Trait written before E6, and on any set by hand: a timed Trait with
   * no `kind` is read as an Injury, which is what every such document means (DL-21 §5 —
   * E5 gives nobody a timed Trait that is not one). `advance` fills it from content the
   * first time the engine is handed any, as a Rival's Roster is filled (DL-21 §13).
   */
  kind?: TraitKind;
}

/**
 * The kinds a Trait can be, as content declares them. Repeated here rather than imported
 * from `content.ts` so that world state stays a leaf: `HeroTrait` is data in a save, and
 * a save has no opinion about where content types live.
 */
export type TraitKind = 'background' | 'disposition' | 'injury' | 'scar';

/**
 * The three ways a Hero leaves the Roster. One union, so that a person's exit is readable
 * without asking three questions (E3).
 */
export type HeroExitKind = 'departure' | 'death' | 'retirement';

/**
 * How a Hero left the Roster. Set only on a Hero in `formerHeroes`, so that a person who
 * has gone is still readable — with their Traits, their Regard and the reason (E2).
 *
 * **The `formerHeroId` hook.** A departed Hero keeps the `id` they had on the Roster, and
 * that id is what E4's Applicant will carry as `formerHeroId` when somebody who once
 * walked out comes back to ask for work. E2 writes the hook and not the arrival: nothing
 * here reads `formerHeroes` except to keep them readable, and ids are never reused.
 */
export interface HeroExit {
  kind: HeroExitKind;
  /** The Day they went. */
  onDay: number;
  /**
   * Why. For a Departure it is the last thing that moved their Regard; for a Death and a
   * Retirement it is the engine's own reason for that kind of exit (E3).
   */
  reason: string;
}

/**
 * Everything a named individual is, apart from who employs them. A Hero is a Hero
 * wherever they work (ADR-0003, E5): the person does not change shape when they cross
 * between Rosters, only the Regard they hold for whoever is paying them.
 *
 * Never used on its own. {@link Hero} and {@link RivalHero} are the two inhabited shapes.
 */
interface Person {
  /** Unique within the Career. */
  id: string;
  /** First name, sometimes with an epithet. Unique within the Roster. */
  name: string;
  pronouns: Pronouns;
  stats: Stats;
  /**
   * Years old. Generated in `[config.heroStartingAgeMin, config.heroStartingAgeMax]` and
   * advanced by one at each year boundary; at `config.heroRetirementAge` they retire (E3).
   */
  age: number;
  /** The name of a BackgroundDef in content. */
  background: string;
  traits: HeroTrait[];
  /**
   * How good they are, as a Stat budget: E4 put it on an Applicant and E5 carries it
   * onto the person, so a Transfer can be priced without asking where they came from.
   * For somebody generated it is the budget they were generated against; for anybody
   * else it is `calibreOfStats` over the Stats they actually have.
   */
  calibre: Calibre;
  /** What this Hero thinks of other Heroes, by their id. */
  regardFor: Record<string, Regard>;
  /** The Day they joined the Roster they are on. */
  joinedOn: number;
  /**
   * The Day they were last committed to a Commission, set at commit and not at return.
   * Initialised to `joinedOn`. With `regardDecayedOn` it decides when neglect tells (E2).
   */
  lastCommittedOn: number;
  /** The Day idleness last cost them Regard. Initialised to `joinedOn` (E2). */
  regardDecayedOn: number;
  /**
   * Set only on somebody who walked out and was taken back on as an Applicant (E4-S4).
   * It is the id they left with, which is also the id they came back under, and it is
   * how narration knows to say that this is a person returning rather than arriving.
   */
  formerHeroId?: string;
  /** How they left. Set only on a Hero in `formerHeroes`; absent while they are on the Roster. */
  exit?: HeroExit;
}

/**
 * A named individual on the player's Roster.
 *
 * **A Hero holds Regard for one employer at a time** (E5-S1). While they work for you
 * that is the Guildmaster, and `regardForRival` is not merely unset but unsettable: the
 * `never` is what makes "a Hero of yours has no Regard for a Rival" a fact the type
 * system knows rather than a convention a rule has to remember (E5 §4).
 */
export interface Hero extends Person {
  /** What this Hero thinks of the Guildmaster. */
  regardForGuildmaster: Regard;
  /** Never set while they are in your employ. {@link RivalHero} is where it lives. */
  regardForRival?: never;
}

/**
 * The same person, on a Rival's Roster instead (E5-S1). Not a Hero carrying a flag and
 * not a different kind of person: everything about them but their employer is the same,
 * and they keep their id, their age, their Traits and their history when they cross.
 *
 * A Rival's Hero is never committable, refusable, drifted, injured by a Beat, offered as
 * one of your Applicants, or counted in your Upkeep — none of which needs a check in
 * front of it, because they are not in `guild.roster` to be found.
 */
export interface RivalHero extends Person {
  /** What this Hero thinks of the Rival who employs them. */
  regardForRival: Regard;
  /** Never set while they are in a Rival's employ. {@link Hero} is where it lives. */
  regardForGuildmaster?: never;
}

/**
 * Somebody on either kind of Roster, for the handful of rules that are deliberately the
 * same in both directions: `employerRegard`, `isPoachable` and `moveHero` (E5-S4).
 */
export type AnyHero = Hero | RivalHero;

/**
 * How good an Applicant is: a Stat budget and an asking fee, and nothing else (E4-S1).
 * Standing gates the top of the range a batch may draw from, and gates nothing else.
 */
export type Calibre = 1 | 2 | 3;

/** The three calibres, lowest first. */
export const CALIBRES: readonly Calibre[] = [1, 2, 3];

/**
 * Somebody offering to join the Roster (E4). Deliberately **not** a Hero carrying a flag
 * (ADR-0003): a Hero can be committed, injured and killed, and an Applicant can do none
 * of those. The two share the value types — `Stats`, `HeroTrait`, `Pronouns` — and
 * nothing else, and there is no `isApplicant` anywhere in the engine.
 */
export interface Applicant {
  /**
   * Unique within the Career, and never reused: `a1`, `a2`, … from the Career's own
   * counter. Somebody coming back keeps the id they left the Roster with instead, so a
   * person stays one person (DL-19 §2).
   */
  id: string;
  name: string;
  pronouns: Pronouns;
  stats: Stats;
  /** The name of a BackgroundDef in content. It supplies their starting Traits. */
  background: string;
  traits: HeroTrait[];
  /** Years old, in `[config.heroStartingAgeMin, config.heroStartingAgeMax]` for a fresh one. */
  age: number;
  calibre: Calibre;
  /** What taking them on costs the Guild in coin. */
  askingFee: number;
  arrivedOn: number;
  /** The Day they give up waiting and go elsewhere. */
  expiresOn: number;
  /** Set when this is somebody who once walked out, coming back (E4-S4). */
  formerHeroId?: string;
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

/**
 * A Decision put to the Guildmaster, waiting for an answer (E6-S2). Ids and numbers only:
 * the prompt and the labels are authored content, filled by `narrate` (ADR-0002).
 */
export interface PendingWord {
  /** The DecisionDef in content that fired. */
  decisionId: string;
  /** The Beat this Decision displaced, counting from one. It fires when the word is answered. */
  beatIndex: number;
  /** The Day the Party sent word. */
  askedOn: number;
  /** The Day the `default` option is taken if nobody has answered by then. */
  timesOutOn: number;
  /** What the Decision's slots resolved to, exactly as a Beat's do. */
  slots: { heroId: string; patronId: string; sphereId: string; trait?: string };
  /**
   * Every option the Decision offers, in the order they were authored. The offer as it was
   * made, and it never changes: whether the Guild can *pay* for one moves while the Party
   * waits, so affordability is worked out fresh by `wordOffers` and enforced by
   * `answerParty`, never frozen here (DL-23 §8).
   */
  optionIds: string[];
}

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
  /**
   * Whether this Commission has already stopped to ask once (E6-S2). At most one Decision
   * per Commission is a rule and not a hope, and this is the whole of it: `config`'s
   * `decisionsPerCommission` says whether a Commission may stop at all (DL-23 §7).
   */
  decisionUsed: boolean;
  /**
   * Added to every remaining Beat's DC by an answered Decision's `effect.dcDelta`, and
   * accumulated (E6-S3). Zero on a Party that has never been asked anything.
   */
  dcDelta: number;
  /** Set while the Party has sent word and is waiting for an answer (E6-S2). */
  pendingWord?: PendingWord;
  /**
   * The Day the Guildmaster told them to come home (E6-S3). Set only on a Party that
   * turned back: the remaining Beats are skipped, the work is not finished however far the
   * score had got, and the fee is paid pro rata.
   */
  turnedBackOn?: number;
}

/**
 * Another Guild: an identity, a Roster and a Standing (E5-S1). Deliberately **not** the
 * same type as the player's Guild (ADR-0003) — there is no Hall, no Board, no coin and no
 * Guildmaster here, and none of them can be added by a rule that forgot to ask whose
 * Guild it was looking at. E1 modelled the name and the Standing; E5 gives it people and
 * an opinion of you.
 *
 * A Rival is never simulated. It takes work off the Board and its Roster churns; it runs
 * no Beats and makes no decisions.
 */
export interface Rival {
  id: string;
  name: string;
  /**
   * Stored rather than derived, because a Rival has no Patrons to derive it from. It
   * rises when they take work the player left on the Board, and it gates the calibre of
   * the people they take on, exactly as the player's Standing gates an Applicant's.
   */
  standing: number;
  /** The people in their employ, each holding Regard for this Rival (E5-S1). */
  roster: RivalHero[];
  /** What this Rival thinks of your Guild. Starts neutral; poaching from them sours it. */
  regardForGuild: Regard;
}

/**
 * One row of the League: every Guild ordered by Standing (E5-S6). A view of something
 * already modelled and never a currency of its own — nothing writes a League position,
 * and there is no `rank` or `position` field anywhere in the world for one to be written to.
 */
export interface LeagueRow {
  /** The Rival's id, or `'player'` for the Guild the player runs. */
  guildId: string;
  name: string;
  /** Derived for the player's Guild, stored for a Rival. */
  standing: number;
  /** How many people are in their employ, so the row says more than a bare number does. */
  rosterSize: number;
  isPlayer: boolean;
}

/**
 * The three things coin buys besides Upkeep (E3). Each is bought once, and the design
 * names no fourth.
 */
export type HallImprovement = 'infirmary' | 'trainingYard' | 'quarters';

/** The improvement that halves the span of every Injury given after it is bought. */
export const HALL_INFIRMARY = 'infirmary';
/** The improvement that adds to every Party's Backing. */
export const HALL_TRAINING_YARD = 'trainingYard';
/** The improvement that slows Regard drift. Read since E2 (DL-14 §5); sold in E3. */
export const HALL_QUARTERS = 'quarters';

/** The improvements in the order a front end offers them. */
export const HALL_IMPROVEMENTS: readonly HallImprovement[] = [
  HALL_INFIRMARY,
  HALL_TRAINING_YARD,
  HALL_QUARTERS,
];

/** Everything the player owns. */
export interface Guild {
  name: string;
  guildmaster: Guildmaster;
  roster: Hero[];
  /**
   * Death, Departure and Retirement move a Hero here rather than deleting them. Their id
   * is the `formerHeroId` E4 will hand to an Applicant who has been here before (E2).
   */
  formerHeroes: Hero[];
  coin: number;
  /** The Hall improvements bought, in the order they were bought. Empty in E1 and E2. */
  hall: HallImprovement[];
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
  /** Heroes who walked out over low Regard. Counted in the reckoning's `heroesLost` (E2). */
  departures: number;
  /** Injuries given, counting each one and not each Hero (E3). */
  heroesInjured: number;
  /** Scars given (E3). */
  heroesScarred: number;
  /** Heroes who did not come back. Counted in the reckoning's `heroesLost` (E3). */
  heroesDied: number;
  /** Heroes who reached the end of a working life. Not a loss, and not counted as one (E3). */
  heroesRetired: number;
  /** Applicants who ever turned up, returners included (E4). */
  applicantsSeen: number;
  /** Applicants taken on to the Roster (E4). */
  applicantsAccepted: number;
  /**
   * Former Heroes who came back and were taken on, counted at `acceptApplicant` (E4;
   * corrected by finding C7 — this used to count every OFFER of a returner, so one person
   * offered repeatedly as they expired and were offered again ran the count up without
   * ever rejoining. `returnersOffered` below keeps that count).
   */
  returners: number;
  /** Former Heroes offered as an Applicant, counted as each offer arrives, never accepted or not (E4). */
  returnersOffered: number;
  /**
   * People brought over from a Rival with that Rival's consent, counted once each as the
   * Transfer goes through (E5-S2). Heroes, not Transfers offered and not coin spent —
   * the name says people, so it counts people (DL-17 §6, DL-20 §1).
   */
  heroesTransferredIn: number;
  /** People taken off a Rival without their consent, counted once each (E5-S3). */
  heroesPoachedIn: number;
  /** People a soured Rival took off your Roster, counted once each (E5-S4). */
  heroesPoachedFromUs: number;
  /**
   * Parties that sent word and waited, counted once as the word is sent (E6-S2). One per
   * `PartyAwaitingWord`, and never one per option offered or per Day waited.
   */
  wordsSent: number;
  /**
   * Commissions the Guildmaster called off part-way through, counted once as the Party is
   * told to come home (E6-S3). One per `PartyTurnedBack`, and never one per Beat skipped.
   */
  turnedBack: number;
}

/** What the Guild became. */
export interface Reckoning {
  /** Whole years the Career ran. */
  years: number;
  heroesOnRoster: number;
  /** Heroes lost: Death and Departure. Retirement is not a loss and is not counted here (E3). */
  heroesLost: number;
  /** Heroes who reached the end of a working life, reported apart from the losses (E3). */
  heroesRetired: number;
  /** Applicants taken on over the Career, however they arrived (E4). */
  heroesRecruited: number;
  /** People a soured Rival took off the Roster over the Career (E5-S4). */
  heroesPoachedFromUs: number;
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
  /** The people currently offering to join the Roster, oldest batch first (E4). */
  applicants: Applicant[];
  /**
   * The number the next fresh Applicant's id is made from. It only ever goes up, so an
   * id is never reused inside a Career even after an Applicant has expired, and `a<n>`
   * can never collide with a Roster Hero's `h<n>` (DL-19 §2).
   */
  nextApplicantNumber: number;
  /**
   * The number the next Rival's Hero is made from. A Rival's Hero is `<rivalId>h<n>` —
   * `r1h3`, `r4h17` — and `n` comes from here, so it can never land on an Applicant's
   * `a<n>`, a Hero's `h<n>`, a Patron's `pa<n>`, a Rival's own `r<n>`, a Commission's
   * `c<day>.<n>` or a Party's `p<day>.<n>`, and never repeats within a Career however
   * much a Roster churns. Ages derive from `"<seed>:age:<id>"`, so two people sharing an
   * id would share a birthday (DL-16 §1, DL-19 §2, DL-20's "E5 must know").
   */
  nextRivalHeroNumber: number;
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
