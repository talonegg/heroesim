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
  /** Ceiling on the Stat-derived part of a Party's Backing. */
  backingMax: number;
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

  recentCommissionsKept: 24,
};

/** Hold a number within an inclusive range. */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
