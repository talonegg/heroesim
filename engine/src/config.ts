/**
 * Every tunable in the game is a named, defaulted field here (CLAUDE.md invariant 8).
 * A balance literal in rules code is a defect. The config is stored in the save, so a
 * Career keeps the numbers it was created under.
 *
 * The fields in the first group are the ones baselined in solution architecture §3 and
 * DL-06. The rest were named in DL-09, which added the constants E1's rules and world
 * generation need but that document left as literals.
 */
export interface GameConfig {
  // ── Career shape (architecture §3) ─────────────────────────────────────────
  /** Years a Career runs before the Guildmaster retires. */
  careerYears: number;
  /** Days in a year. Twelve months of thirty. */
  daysPerYear: number;
  /** The Board refreshes on Days that are multiples of this. */
  boardRefreshEveryDays: number;
  /** Fewest Commissions the Board is refilled to. */
  boardSizeMin: number;
  /** Most Commissions the Board is refilled to. */
  boardSizeMax: number;
  /** Upkeep falls due on Days that are multiples of this. */
  upkeepEveryDays: number;
  /** Coin owed per Hero on the Roster at each Upkeep. */
  upkeepPerHero: number;
  /** Coin owed at each Upkeep regardless of the Roster. */
  upkeepBase: number;
  /** Coin the Guild starts with. */
  startingCoin: number;
  /**
   * Coin the Guild already owed when the Guildmaster took it over (E7, DL-25 §1). The
   * design's "you start with a going concern … and a debt": the opening float has already
   * been eaten into by what the last Guildmaster owed, so the Guild opens at
   * `startingCoin - startingDebt` and its peak balance is that same number. Nothing is
   * tracked afterwards — there is no obligation on the Career, no event and no draw — so
   * at the default of 0 the whole of the game is what it was before the field existed.
   * Read in exactly one place, `newCareer`, which `content/tests/e7-starting-debt.test.ts`
   * holds it to.
   */
  startingDebt: number;
  /** Fee for a Commission at `difficultyMin`. */
  feeMin: number;
  /** Fee for a Commission at `difficultyMax`. */
  feeMax: number;
  /** Fewest Days a Commission runs. */
  commissionSpanMin: number;
  /** Most Days a Commission runs. */
  commissionSpanMax: number;
  /** Fewest Beats in a Commission. */
  beatsMin: number;
  /** Most Beats in a Commission. */
  beatsMax: number;
  /** Lowest base DC a Commission can carry. */
  difficultyMin: number;
  /** Highest base DC a Commission can carry. */
  difficultyMax: number;
  /** How far above the DC a Check must total to be critical. */
  criticalMargin: number;
  /** Ceiling on the Stat-derived part of a Party's Backing, and on the whole of it. */
  backingMax: number;
  /** Floor the whole of a Party's Backing is clamped to (E2). */
  backingMin: number;
  /** Mean Party Regard for the Guildmaster is divided by this to give Backing's Regard term (E2). */
  backingRegardDivisor: number;
  /** The Guildmaster's summed Nerve and Guile are divided by this to give Backing's Stat term (DL-15). */
  backingStatDivisor: number;
  /** Subtracted from the divided Nerve-and-Guile sum to give Backing's Stat term (DL-15). */
  backingStatOffset: number;
  /** Unclaimed Commissions a Rival takes at each Board refresh. */
  rivalTakesPerRefresh: number;
  /** Heroes on the Roster when the Career begins. */
  startingHeroes: number;
  /** Patrons in the world. */
  patronCount: number;
  /** Rival Guilds in the world. */
  rivalCount: number;

  // ── Checks and scoring (DL-09) ─────────────────────────────────────────────
  /** Faces on the die a Check rolls. Canonically twenty. */
  diceSides: number;
  /** Floor a Beat's DC is clamped to. */
  dcMin: number;
  /** Ceiling a Beat's DC is clamped to. */
  dcMax: number;
  /** The Commission difficulty that shifts a Beat's DC by nothing. */
  commissionDifficultyPivot: number;
  /** Commission score a critical Beat adds. */
  scoreCritical: number;
  /** Commission score a successful Beat adds. */
  scoreSuccess: number;
  /** Commission score a failed Beat adds. */
  scoreFailure: number;

  // ── Regard and Standing (DL-09) ────────────────────────────────────────────
  /** Floor every Regard value is clamped to. */
  regardMin: number;
  /** Ceiling every Regard value is clamped to. */
  regardMax: number;
  /** Multiplier turning mean Patron Regard into the Guild's Standing. */
  standingScale: number;
  /** Patron Regard moved by a Commission that succeeded. */
  patronRegardOnSuccess: number;
  /** Patron Regard moved by a Commission that failed. */
  patronRegardOnFailure: number;
  /** Patron Regard moved when their Commission was left on the Board for a Rival. */
  patronRegardOnPassedOver: number;
  /**
   * A Patron is disappointed by work going to a Rival only while their Regard is
   * strictly above this. Below it, only failing their own work moves it down, so no
   * Patron ever falls silent from being passed over alone (DL-13).
   */
  patronPassedOverAboveRegard: number;
  /**
   * Days between a negative Patron Regard recovering one point towards zero.
   * Disappointment fades; goodwill above zero is not touched. Zero switches it off.
   */
  patronRegardRecoveryEveryDays: number;
  /** How far a negative Patron Regard recovers towards zero each time (DL-13). */
  patronRegardRecoveryAmount: number;
  /** A Patron posts to the Board only while their Regard is strictly above this. */
  patronPostsAboveRegard: number;
  /** Standing a Rival gains for taking a Commission. */
  rivalStandingPerCommission: number;
  /** How far a Rival's starting Standing may sit either side of the player's. */
  rivalStandingSpread: number;

  // ── World generation (DL-09) ───────────────────────────────────────────────
  /** Lowest a Stat may be generated at. */
  statMin: number;
  /** Highest a Stat may be generated at. */
  statMax: number;
  /** The Guildmaster's four Stats total this. */
  guildmasterStatTotal: number;
  /** Lowest total a starting Hero's four Stats may come to. */
  heroStatTotalMin: number;
  /** Highest total a starting Hero's four Stats may come to. */
  heroStatTotalMax: number;
  /** Chance a starting Hero is given an epithet as well as a first name. */
  heroEpithetChance: number;
  /** Lowest Regard a starting Hero holds for the Guildmaster. */
  heroRegardForGuildmasterMin: number;
  /** Highest Regard a starting Hero holds for the Guildmaster. */
  heroRegardForGuildmasterMax: number;
  /** Lowest Regard the Guildmaster holds for a starting Hero. */
  guildmasterRegardForHeroMin: number;
  /** Highest Regard the Guildmaster holds for a starting Hero. */
  guildmasterRegardForHeroMax: number;
  /** Pairs of starting Heroes whose Regard for one another is a bond. */
  startingBonds: number;
  /** Pairs of starting Heroes whose Regard for one another is a rivalry. */
  startingRivalries: number;
  /** Lowest value a bond starts at. */
  bondRegardMin: number;
  /** Highest value a bond starts at. */
  bondRegardMax: number;
  /** Lowest value a rivalry starts at. */
  rivalryRegardMin: number;
  /** Highest value a rivalry starts at. */
  rivalryRegardMax: number;
  /** Lowest value a neutral Regard between Heroes starts at. */
  neutralRegardMin: number;
  /** Highest value a neutral Regard between Heroes starts at. */
  neutralRegardMax: number;
  /** Lowest Regard a Patron starts with for the Guild. */
  patronStartingRegardMin: number;
  /** Highest Regard a Patron starts with for the Guild. */
  patronStartingRegardMax: number;

  // ── Refusals, drift and Departure (E2, DL-14) ──────────────────────────────
  /**
   * At or below this, a Hero refuses any Commission because of what they think of the
   * Guildmaster. Above it, only a Trait's own `refusal` can make them decline.
   */
  refusalRegardThreshold: number;
  /** Regard a refusing Hero loses when the Guildmaster insists. A magnitude. */
  insistenceRegardCost: number;
  /** At or below this, a Hero is checked at each Board refresh to see whether they walk out. */
  departureRegardThreshold: number;
  /** What the Guildmaster's Guile Check must reach to keep a Hero who is at the threshold. */
  departureDc: number;
  /**
   * Regard a Hero gains when the Guildmaster talks them round. A signed delta, and it
   * has to be worth enough to carry a Hero from `departureRegardThreshold` back above
   * `refusalRegardThreshold` — below that line a Hero refuses every Commission, so they
   * can no longer be sent anywhere to earn any of it back (DL-14).
   */
  talkedRoundRegardGain: number;
  /** Days a Hero may sit idle before their Regard for the Guildmaster drifts down. */
  regardDecayEveryDays: number;
  /** Regard lost each time idleness tells. A magnitude. */
  regardDecayAmount: number;
  /**
   * How much longer a Hero housed in the Hall's quarters takes to drift. Read since E2;
   * the improvement that switches it on is bought in E3, and until it is bought the
   * threshold is multiplied by 1 rather than by this (DL-14 §5, DL-16 §4).
   */
  regardDecayQuartersFactor: number;

  // ── Harm from a Beat (E3) ──────────────────────────────────────────────────
  /** Chance a plain failed Check leaves the slot Hero with an Injury. */
  injuryChanceOnFailure: number;
  /** Chance a critical failure leaves the slot Hero with a Scar, checked after Death. */
  scarChanceOnCriticalFailure: number;
  /** Chance a critical failure kills the slot Hero. Checked before the Scar, so the rare
   * case is not swallowed by the common one. */
  deathChanceOnCriticalFailure: number;
  /** Fewest Days an Injury runs for, before the infirmary. */
  injurySpanMin: number;
  /** Most Days an Injury runs for, before the infirmary. */
  injurySpanMax: number;

  // ── Age and Retirement (E3) ────────────────────────────────────────────────
  /** Youngest a Hero may start at. E4 generates an Applicant's age in the same range. */
  heroStartingAgeMin: number;
  /** Oldest a Hero may start at. */
  heroStartingAgeMax: number;
  /** At this age a Hero retires, at the next Board refresh or on their return Day. */
  heroRetirementAge: number;

  // ── The Hall (E3) ──────────────────────────────────────────────────────────
  /**
   * What each improvement costs. Three named numbers rather than one table, because the
   * config is copied with a spread, is required to be numbers by `deserialiseCareer`, and
   * is overridable one field at a time by the CLI's `--config key=value` (DL-16 §3).
   */
  hallInfirmaryCost: number;
  hallTrainingYardCost: number;
  hallQuartersCost: number;
  /** Multiplies the span of every Injury given once the Hall holds an infirmary. */
  infirmaryInjuryFactor: number;
  /** Added to every Party's Backing, before the clamp, once the Hall holds a training yard. */
  trainingYardBacking: number;

  // ── Recruitment (E4) ───────────────────────────────────────────────────────
  /** A batch of Applicants arrives on Days that are multiples of this. */
  applicantsEveryDays: number;
  /** The interval instead, while the Roster is below `rosterFloor`. */
  applicantsEveryDaysBelowFloor: number;
  /** Fewest Applicants in a batch, at or above the Roster floor. */
  applicantBatchMin: number;
  /** Most Applicants in a batch. Below the floor every batch is this size. */
  applicantBatchMax: number;
  /** Days an Applicant waits before giving up and going elsewhere. */
  applicantLingerDays: number;
  /** The Roster may never hold more than this. A hard ceiling. */
  rosterCap: number;
  /** Below this the Roster is short-handed: Applicants come sooner and in larger batches. */
  rosterFloor: number;
  /** Standing at which calibre 2 becomes reachable. */
  calibre2Standing: number;
  /** Standing at which calibre 3 becomes reachable. */
  calibre3Standing: number;
  /**
   * What a calibre *is*, numerically: the total an Applicant's four Stats are
   * distributed to, each within `statMin`..`statMax`. Three flat numbers rather than one
   * table, because the config is copied with a spread, is required to be numbers by
   * `deserialiseCareer`, and is overridable one field at a time by `--config key=value`
   * (DL-19 §3, following DL-16 §3).
   */
  calibreStatBudget1: number;
  calibreStatBudget2: number;
  calibreStatBudget3: number;
  /** Coin an Applicant asks for before their calibre is counted. */
  applicantFeeBase: number;
  /** Coin an Applicant asks for per point of calibre. */
  applicantFeePerCalibre: number;
  /** What a newly taken-on Hero thinks of the Guildmaster on the Day they join. */
  joiningRegard: number;
  /**
   * What a newcomer and each Hero already on the Roster think of one another on the Day
   * they meet. Named rather than left as the literal zero "neutral" would put in rules
   * code (CLAUDE.md invariant 8).
   */
  joiningRegardAmongHeroes: number;
  /** Days that must pass after a Departure before that Hero may come back as an Applicant. */
  returnCooldownDays: number;
  /** Chance an eligible former Hero takes one of a batch's slots. */
  returnAsApplicantChance: number;
  /** What a Hero who walked out and came back thinks of the Guildmaster on their return. */
  returningRegard: number;

  // ── Rivals, Transfers and the League (E5) ──────────────────────────────────
  /** Fewest Heroes a Rival's Roster holds. Churn never takes one below it. */
  rivalRosterMin: number;
  /** Most Heroes a Rival's Roster holds. Churn never takes one above it. */
  rivalRosterMax: number;
  /** Chance a Rival's Roster gains or loses somebody at each Board refresh. */
  rivalChurnChance: number;
  /**
   * Chance that churn, having fired on a Rival whose Roster is inside its bounds, is a
   * gain rather than a loss. At the bounds the direction is decided for it. Named rather
   * than left as the literal coin-flip a rule would otherwise carry (invariant 8).
   */
  rivalChurnGainChance: number;
  /** What a Rival thinks of your Guild before anything has passed between you. */
  rivalStartingRegard: number;
  /** Lowest Regard one of a Rival's Heroes holds for the Rival who employs them. */
  rivalHeroRegardMin: number;
  /** Highest Regard one of a Rival's Heroes holds for the Rival who employs them. */
  rivalHeroRegardMax: number;
  /** Coin a Transfer costs before the Hero's calibre is counted. */
  transferFeeBase: number;
  /** Coin a Transfer costs per point of the Hero's calibre. */
  transferFeePerCalibre: number;
  /** A Rival consents to a Transfer while their Regard for your Guild is at or above this. */
  transferConsentRegard: number;
  /** What a Hero who has just changed employer thinks of the one they have moved to. */
  transferJoiningRegard: number;
  /** A Poaching costs this share of the Transfer fee, rounded. */
  poachFeeFactor: number;
  /**
   * A Hero can be approached without their employer's consent only while their Regard
   * for that employer is at or below this. The same number in both directions: it is
   * what makes a Rival poaching from you and you poaching from a Rival one rule (E5-S4).
   */
  poachRegardThreshold: number;
  /** Regard a Rival loses for your Guild when you poach from them. A magnitude. */
  poachRivalRegardCost: number;
  /** At or below this, a Rival poaches back at each Board refresh. */
  retaliationRegardThreshold: number;
  /** At or below this, a Rival is soured, and takes more off your Board. */
  souredRivalThreshold: number;
  /** Extra unclaimed Commissions taken per refresh, for each soured Rival. */
  souredRivalExtraTakes: number;
  /** The most unclaimed Commissions Rivals take in one refresh, however many are soured. */
  rivalTakesMax: number;

  // ── Decisions mid-Commission (E6) ──────────────────────────────────────────
  /**
   * Chance a Party stops and asks, considered at each Beat Day **after the first** (E6-S2).
   * One of two independent brakes on how often the game interrupts itself; the other is
   * `decisionsPerCommission`. Zero switches Decisions off and takes not one draw.
   */
  decisionChancePerBeat: number;
  /**
   * How many times one Commission may stop to ask. A cap and not a target: at zero no
   * Commission ever stops, and at one or more it stops at most once, because more than one
   * per Commission is deferred (E6 §0) and `Party.decisionUsed` is a flag (DL-23 §7).
   */
  decisionsPerCommission: number;
  /** Days a Party waits for word before the Decision's `default` option is taken for them. */
  wordTimeoutDays: number;
  /** Days a Party told to come home spends on the road before it arrives. */
  turnBackTravelDays: number;
  /**
   * The share of the fee a Commission called off part-way through pays, before the score
   * is counted: the fee paid is `max(0, round(fee × turnBackFeeFactor × score / beatCount))`.
   * A number rather than E6 §4's boolean `turnBackPaysProRata`, because every `GameConfig`
   * field is one (DL-23 §6): 1 is that boolean's `true`, 0 is its `false`, and the range
   * between is a half-measure the balance pass can reach for.
   */
  turnBackFeeFactor: number;

  // ── Bookkeeping (DL-09) ────────────────────────────────────────────────────
  /** How many finished Commissions stay readable after their Party has returned. */
  recentCommissionsKept: number;
}

/**
 * The defaults. Overridable per Career through `newCareer`'s third argument, and stored
 * in the save so a Career is never re-balanced underneath itself.
 */
export const defaultConfig: GameConfig = {
  careerYears: 20,
  daysPerYear: 360,
  boardRefreshEveryDays: 10,
  boardSizeMin: 4,
  boardSizeMax: 6,
  upkeepEveryDays: 10,
  upkeepPerHero: 20,
  upkeepBase: 8,
  startingCoin: 500,
  // Zero, so the mechanism is present and off (E7 §3's adopted default, DL-25 §1). Set
  // it and the first years bite.
  startingDebt: 0,
  feeMin: 45,
  feeMax: 115,
  commissionSpanMin: 5,
  commissionSpanMax: 10,
  beatsMin: 3,
  beatsMax: 5,
  difficultyMin: 8,
  difficultyMax: 15,
  criticalMargin: 9,
  backingMax: 3,
  backingMin: -2,
  backingRegardDivisor: 2,
  backingStatDivisor: 2,
  backingStatOffset: 2,
  rivalTakesPerRefresh: 1,
  startingHeroes: 4,
  patronCount: 5,
  rivalCount: 4,

  diceSides: 20,
  dcMin: 5,
  dcMax: 20,
  commissionDifficultyPivot: 11,
  scoreCritical: 2,
  scoreSuccess: 1,
  scoreFailure: -1,

  regardMin: -5,
  regardMax: 5,
  standingScale: 10,
  patronRegardOnSuccess: 1,
  patronRegardOnFailure: -1,
  patronRegardOnPassedOver: -1,
  patronPassedOverAboveRegard: -3,
  patronRegardRecoveryEveryDays: 60,
  patronRegardRecoveryAmount: 1,
  patronPostsAboveRegard: -4,
  rivalStandingPerCommission: 1,
  rivalStandingSpread: 3,

  statMin: 1,
  statMax: 5,
  guildmasterStatTotal: 12,
  heroStatTotalMin: 11,
  heroStatTotalMax: 13,
  heroEpithetChance: 0.5,
  heroRegardForGuildmasterMin: -1,
  heroRegardForGuildmasterMax: 2,
  guildmasterRegardForHeroMin: 0,
  guildmasterRegardForHeroMax: 1,
  startingBonds: 2,
  startingRivalries: 1,
  bondRegardMin: 2,
  bondRegardMax: 3,
  rivalryRegardMin: -3,
  rivalryRegardMax: -2,
  neutralRegardMin: -1,
  neutralRegardMax: 1,
  patronStartingRegardMin: 0,
  patronStartingRegardMax: 1,

  refusalRegardThreshold: -3,
  insistenceRegardCost: 2,
  departureRegardThreshold: -5,
  departureDc: 12,
  talkedRoundRegardGain: 3,
  regardDecayEveryDays: 30,
  regardDecayAmount: 1,
  regardDecayQuartersFactor: 2,

  injuryChanceOnFailure: 0.25,
  scarChanceOnCriticalFailure: 0.3,
  deathChanceOnCriticalFailure: 0.03,
  injurySpanMin: 15,
  injurySpanMax: 30,

  heroStartingAgeMin: 22,
  heroStartingAgeMax: 40,
  heroRetirementAge: 55,

  hallInfirmaryCost: 200,
  hallTrainingYardCost: 250,
  hallQuartersCost: 250,
  infirmaryInjuryFactor: 0.5,
  trainingYardBacking: 1,

  applicantsEveryDays: 20,
  applicantsEveryDaysBelowFloor: 10,
  applicantBatchMin: 2,
  applicantBatchMax: 3,
  applicantLingerDays: 20,
  rosterCap: 12,
  rosterFloor: 6,
  calibre2Standing: 10,
  calibre3Standing: 30,
  calibreStatBudget1: 10,
  calibreStatBudget2: 12,
  calibreStatBudget3: 14,
  applicantFeeBase: 40,
  applicantFeePerCalibre: 40,
  joiningRegard: 1,
  joiningRegardAmongHeroes: 0,
  returnCooldownDays: 60,
  returnAsApplicantChance: 0.25,
  returningRegard: -1,

  rivalRosterMin: 4,
  rivalRosterMax: 8,
  rivalChurnChance: 0.3,
  rivalChurnGainChance: 0.5,
  rivalStartingRegard: 0,
  rivalHeroRegardMin: -3,
  rivalHeroRegardMax: 2,
  transferFeeBase: 100,
  transferFeePerCalibre: 50,
  transferConsentRegard: 0,
  transferJoiningRegard: 0,
  poachFeeFactor: 0.5,
  poachRegardThreshold: -2,
  poachRivalRegardCost: 3,
  retaliationRegardThreshold: -3,
  souredRivalThreshold: -3,
  souredRivalExtraTakes: 1,
  rivalTakesMax: 3,

  // Lowered from 0.2 by the balance pass: the design says "RARELY, a Party sends word"
  // and E6 §0 says rare is a rule, not a hope. At 0.2 it compounded to about one
  // Commission in two and a half; at 0.1 the measured rate is 0.210 words per Commission,
  // one in 4.8 (DL-24 §B2).
  decisionChancePerBeat: 0.1,
  decisionsPerCommission: 1,
  wordTimeoutDays: 5,
  turnBackTravelDays: 1,
  turnBackFeeFactor: 1,

  recentCommissionsKept: 24,
};

/** Hold a number within an inclusive range. */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
