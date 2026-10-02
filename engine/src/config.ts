// Every tunable is a `GameConfig` field with its default in `defaultConfig` (principle 8): a
// literal balance number in rules code is a defect. Rules read `deps.config`, never
// `meta.config` (data-model §2). A front end passes `{ ...defaultConfig, ...meta.config }`, so a
// loaded game plays under the rules it started with and a field its save predates reads as the
// current default; the harness passes its own; `rebase` adopts the current defaults (M2-S1).
//
// Each story adds the fields it introduces: M1-S1 the document's clock and the two versions;
// M1-S5 and M1-S6 the starting world (DL-19); M2-S3 the Board (DL-25); M2-S5 the stub Quest
// Engine and M2-S6 the Hero State Engine (DL-29); M4-S5 Regard, Patron Regard and the
// Guildmaster's Stat rules (DL-43); M4-S4 Regard between Heroes and teamwork (DL-46); M5-S1 the
// gear slots (DL-48); M5-S4 the Market (DL-51); M5-S5 Loot (DL-52); M6-S2 Transfers (DL-57); M9-S2
// the Trait budget (DL-102); v1.1.4-S2 the Degrees (DL-152). Every
// "Min/Max" pair is an inclusive range drawn with `int`. A field holding an object or a list is
// frozen with `defaultConfig`.

import type { ContentSet, SlotKey, StatArea } from './content-types.js';
import type { Module } from './modules.js';

export interface GameConfig {
  /**
   * The World State schema this engine writes as `meta.version`; a load compares the two and
   * migrates an older save (M1-S8). 2 from M2-S8, whose Heroes gained the pool's two fields (DL-27);
   * 3 from the M6 verification, whose Heroes gained `transferredOnTurn` (DL-60); 4 from M9-S2, whose
   * Guildmasters gained the descriptive Attributes and `retiredOnTurn` (DL-102); 5 from v1.1.2-S3,
   * whose Guildmasters gained `portraitKey` and Patrons `sex`, and which refuses every older save
   * rather than migrating it (DL-125 item 10.2, DL-130); 6 from v1.1.3-S6, whose Heroes gained
   * `portraitKey`, `appearance` and `biography`, and which refuses every older save likewise (DL-135
   * item 7).
   */
  schemaVersion: number;
  /**
   * Raised, with a decision-log entry, whenever a default in `defaultConfig` changes; `rebase`
   * records the old and the new (data-model §2, pre-M0 review D1). 2 from M2-S12's first balance
   * pass (DL-35); 3 from M3's wage for Levels (DL-36); 4 twice over, on two lines at once, from
   * M3's Rival reserve (DL-41) and from M4-S2's Quest Engine (DL-42); 5 twice over again, from
   * merging those two (DL-47) and from M3's infirmary factor for its third grade (DL-53); 6 from
   * merging those, so that no save made under either 5 reads as current (DL-55); 7 from merging
   * that main line with M5's Items, whose new fields' defaults were made under 4 (DL-61); 8 from the
   * M5 close's Loot threshold (DL-62); and, on a parallel branch, 5 from M6-S1, which moved the
   * Rivals' two thresholds into their Dispositions' rows (DL-56); 9 from merging the main line's 8
   * with that 5, so that no save made under either reads as current (DL-63); 10 from the M6 close's
   * Transfer lock of a season (DL-69); 11 from M9-S2's Trait budget, `guildmasterTraitBudget`
   * (DL-102); 12 from M9-F1's Guildmasters, 21 to 50 at the start and retiring at 61 (DL-113, DL-114);
   * 13 from v1.1.4-S2's Degrees, `checkDegrees` and `strongTriumphShare` (DL-148, DL-152), which
   * v1.1.4's later stories add their fields under before the release.
   */
  configVersion: number;
  /** Turns in a year: three Turns a Day, so 1,080 is 360 Days (data-model §3.1, INPUTS 3.2). */
  turnsPerYear: number;

  // ── The starting world (M1-S6, INPUTS 3.3, 3.4, 3.7) ─────────────────────────────────────
  /** Heroes on the player's starting Roster; four gives one per Class (DL-19). */
  startingRosterSize: number;
  /** The player's starting Wealth. */
  startingWealth: number;
  /** Rival Guilds generated with the world. */
  rivalCount: number;
  /**
   * Each Rival's starting Roster size is drawn from this range. A Rival whose Roster falls below
   * `rivalRosterMin` hires back towards it while it can keep `rivalHireReserveUpkeeps` Upkeeps
   * (DL-60), and the Transfer Generator keeps its moves within the range (DL-59).
   */
  rivalRosterMin: number;
  rivalRosterMax: number;
  /**
   * A Rival whose Roster is below `rivalRosterMin` hires, from the pool or by Transfer, whenever its
   * Wealth covers the fee with this many times its Upkeep left over, whatever its Disposition's
   * `recruitThreshold` says (DL-60): the need of a Roster too small to staff its Quests, beside the
   * choice of a Disposition that hires above its threshold.
   */
  rivalHireReserveUpkeeps: number;
  /** Each Rival's starting Wealth is drawn from this range. */
  rivalStartingWealthMin: number;
  rivalStartingWealthMax: number;
  /** Patrons generated with the world, their Spheres dealt evenly. */
  patronCount: number;
  /** Unattached Heroes generated with the world; the pool is refilled to it from M2-S8. */
  unattachedPoolSize: number;

  // ── A generated Hero (M1-S5, INPUTS 3.5, 3.6, 3.11, 4.8) ─────────────────────────────────
  /** A generated Hero's age, in whole years. */
  heroStartingAgeMin: number;
  heroStartingAgeMax: number;
  /** A Hero Stat's base value before the Class bias (DL-19). */
  statBaseMin: number;
  statBaseMax: number;
  /** Added to the base of each of the Class's leading Stats. */
  statBiasMin: number;
  statBiasMax: number;
  /** Potential is the base plus this gap, capped at the Stat's maximum. */
  potentialGapMin: number;
  potentialGapMax: number;
  /** How many of the Class's gated Skills a generated Hero holds. */
  startingSkillsMin: number;
  startingSkillsMax: number;
  /** Each starting Skill is rated from 1 to this. */
  startingSkillRatingMax: number;
  /** A Hero's Morale at generation, and what nightly drift returns it to (M2-S6). */
  moraleBaseline: number;

  // ── A generated Guildmaster (M1-S6, INPUTS 3.13, 4.10) ───────────────────────────────────
  /**
   * A generated Guildmaster's age, in whole years, and the range the player chooses from at setup:
   * 21 to 50 from M9-F1 (DL-113 item 4), 30 to 45 before.
   */
  guildmasterStartingAgeMin: number;
  guildmasterStartingAgeMax: number;
  /** Each Guildmaster Stat is drawn from this range (DL-19). */
  guildmasterStatMin: number;
  guildmasterStatMax: number;
  /**
   * How many Guildmaster Traits a Guildmaster is generated with (pre-M0 review B2): the count is
   * drawn from this range, and a smaller set is drawn when no legal set has that many
   * (`guildmasterTraitBudget`, DL-109 item 1). The maximum caps the Traits a player chooses at setup
   * too (DL-100 item 3).
   */
  guildmasterTraitsMin: number;
  guildmasterTraitsMax: number;
  /**
   * The Trait budget (M9-S2, DL-88 item 4, DL-100 item 3): the most a Guildmaster's Traits may cost
   * in all, each Trait's cost being content's (`Trait.cost`), a buff costing and a penalty
   * refunding. A drawn Guildmaster's Traits are one set drawn from every set within it (DL-109
   * item 1); a player's choice at setup is refused over it. At 1, the dearer buffs need a penalty
   * beside them.
   */
  guildmasterTraitBudget: number;

  // ── The Guild State Engine (M2-S7, INPUTS 4.6, 4.9, pre-M0 review D10.3) ─────────────────
  /** Upkeep falls due every this many Days (DL-26 says which Days precisely). */
  upkeepEveryDays: number;
  /**
   * Wealth deducted per Level of each living Hero on the Roster, each Upkeep. 70, not INPUTS 4.6's
   * 5, since the first balance pass: against Quest rewards of 40 to 450 a wage of 5 cost a Guild
   * nothing (DL-35). 20 since Heroes gain Levels (M3-S1): at 70 a Roster at Level 2 to 4 bankrupted
   * every harness game within months (DL-36).
   */
  wagePerLevel: number;
  /** Wealth deducted per grade of each Hall facility, summed, each Upkeep. */
  hallMaintenancePerGrade: number;
  /** Wealth below this sets `belowFloorSince`; at or above it, `belowFloorSince` is cleared. */
  bankruptcyFloor: number;
  /** Days a Guild may stay below `bankruptcyFloor` before the Bankruptcy ending (read by M2-S10). */
  bankruptcyGraceDays: number;
  /** Fame never falls below this (pre-M0 review D10.3: an explicit floor, not negative Fame). */
  fameFloor: number;
  // ── Recruitment and the Unattached pool (M2-S8, INPUTS 3.7, 4.7, DL-27) ───────────────────
  /** A signing fee is this, plus the per-Level part, plus the Stats part (`signingFee`). */
  signingFeeBase: number;
  /** Added to a signing fee for each of the Hero's Levels. */
  signingFeePerLevel: number;
  /** The sum of the Hero's base Stats is divided by this for a signing fee's Stats part. */
  signingFeeStatDivisor: number;
  /** Whole Days an Unattached Hero stays in the pool before leaving it, at night. */
  unattachedStayDays: number;
  /**
   * Fame's first rule (M3-S5, R10 as amended, pre-M0 review B4, INPUTS 5.6, DL-38): an Unattached
   * Hero refuses to sign for a Guild whose Fame is below this times the Hero's Level less one, so
   * a Level 1 Hero signs anywhere (`signingRefusal`).
   */
  fameRequiredPerLevel: number;
  // ── The Board (M2-S3, INPUTS 4.1, 4.3, DL-25) ─────────────────────────────────────────────
  /** Each morning's refresh draws Quests until the Board holds this many, and never more. */
  boardSize: number;
  /** Days a Quest stays on offer, the Day it is drawn included; it expires the next morning. */
  questOfferDays: number;
  /**
   * The difficulty scale: a template's difficulty range is held inside it before the draw.
   * Durations and rewards are the templates' own (INPUTS 4.2: per template).
   */
  questDifficultyMin: number;
  questDifficultyMax: number;

  // ── The Quest Engine (M4-S2, INPUTS 6.2, DL-42) ────────────────────────────────────────────
  // The stub's fields (M2-S5, DL-29, DL-35) are gone: `stubBands` for `bandBySuccessShare`,
  // `stubVariance` for `checkVariance`, `stubSkillBonusPerRating` for `skillBonusPerRating`, and
  // `stubInjuryChance`/`stubDeathChance` for each Encounter's consequences, which are content.
  /**
   * A Check's roll: the Party's capability times 1 + a draw from −`checkVariance` up to
   * +`checkVariance`, from the `quests` stream (INPUTS 6.2: ±20%).
   */
  checkVariance: number;
  /**
   * Added to a Check's capability, for each of the Encounter's Skills, per rating point of the best
   * rating any member holds (INPUTS 6.2: Skill rating × 2).
   */
  skillBonusPerRating: number;
  /**
   * A Quest's band from the share of its Encounters at Success or better: `strong` at
   * `strongAtLeast` or more, with `strongTriumphShare` of them Triumphs, `success` above
   * `successAbove`, else `fail` (M4-S2: all strong, a majority success). An Encounter a Party wiped
   * out never reached counts as not succeeded.
   */
  bandBySuccessShare: Readonly<{ successAbove: number; strongAtLeast: number }>;
  /**
   * A Check's Degree from its roll ÷ its target (v1.1.4-S2, DL-148 item 8): a Triumph at `triumph`
   * or more, a Success at `success` or more, a Setback at `setback` or more, else a Failure.
   */
  checkDegrees: Readonly<{ triumph: number; success: number; setback: number }>;
  /**
   * The share of a Quest's Encounters that must be Triumphs for a strong success, beside every one
   * at Success or better (v1.1.4-S2, DL-148 item 8: DL-83 item 17's margin, a share of Triumphs).
   * The share is of the whole sequence, as `bandBySuccessShare`'s is.
   */
  strongTriumphShare: number;

  // ── The Hero State Engine (M2-S6, INPUTS 4.5, 4.8, 4.11, DL-29) ──────────────────────────
  /** Morale's scale: no change takes it below `moraleMin` or above `moraleMax`. */
  moraleMin: number;
  moraleMax: number;
  /** How far Morale moves toward `moraleBaseline` each night, never past it. */
  moraleDrift: number;
  /**
   * Where each Morale band starts: a Hero's band is the highest whose start their Morale has
   * reached. Nightly drift emits `hero.morale-changed` only when it crosses from one to another.
   */
  moraleBands: Readonly<Record<MoraleBand, number>>;
  /** Added to the Morale of every Hero left on a Roster when one of its Heroes dies (negative). */
  moraleOnRosterDeath: number;
  /** Added to the Morale of every Hero who comes home from a strong success. */
  moraleOnStrongSuccess: number;
  /** A Hero's Retirement check can first fire past this age. */
  heroRetirementAge: number;
  /** The yearly chance of Retirement for each whole year of age past `heroRetirementAge`. */
  heroRetirementChancePerYear: number;
  /** The Retirement chance is multiplied by this while the Hero is injured. */
  heroRetirementInjuredMultiplier: number;
  /**
   * An Injury's Days to heal are multiplied by the factor at the Guild's infirmary grade when it is
   * inflicted (index 0 is no infirmary), rounded to the nearest Day and at least 1; a grade past
   * the list reads its last factor (INPUTS 4.5: grade 1 halves, grade 2 thirds; and grade 3,
   * content's top, a quarter, so that each grade built does something: DL-53).
   */
  infirmaryHealFactor: readonly number[];
  /**
   * Added to `moraleBaseline` for each grade of the Guild's quarters: what nightly drift returns a
   * Roster Hero's Morale to (`moraleBaselineFor`; M3-S6, R33, DL-38).
   */
  quartersMoraleBonus: number;

  // ── Potential hints and ageing (M3-S3, M3-S4, INPUTS 5.4, 5.5, DL-37) ─────────────────────
  /**
   * Where each Potential hint starts on the gap from a Stat's base to its Potential, in Stat
   * points: a Stat's hint is the highest whose start its gap has reached, and the lowest for a gap
   * below every start, so the three cover every gap (`potentialHint`). M4-S5's Judgement narrows
   * them (pre-M0 review D9).
   */
  potentialHintBands: Readonly<Record<PotentialHint, number>>;
  /**
   * From this age, in whole years, each yearly check (the Retirement check's nights) takes
   * `declinePerYear` from one Stat of `declineAreas`: the first decline falls on the anniversary
   * a Hero reaches it.
   */
  declineAge: number;
  /** What one decline takes from the Stat drawn, never past the Stat's content minimum. */
  declinePerYear: number;
  /** The Stat areas a decline draws from (INPUTS 5.5: the Physical Stats). */
  declineAreas: readonly StatArea[];

  // ── Endings (M2-S10, INPUTS 4.10, pre-M0 review D6, DL-28) ────────────────────────────────
  /**
   * A Guildmaster this old, in whole years, retires, and their Guild reaches its ending, on the night
   * `retirementTurn` gives: 61 from M9-F1 (DL-113 item 4), 65 before.
   */
  guildmasterRetirementAge: number;
  /** Whole Days after a Rival folds until a new Rival is founded in its place, at night. */
  rivalReplacementDays: number;

  // ── Rival controllers (M2-S9, INPUTS 4.12, DL-30) ─────────────────────────────────────────
  // `recruitWealthMultiple` (DL-30, DL-35) and `buildWealthMultiple` (DL-38) are gone: a Rival's
  // thresholds are its Disposition's `recruitThreshold` and `buildThreshold`, content (M6-S1,
  // DL-56). The harness's automatic policy keeps its own multiples (DL-34).

  // ── Progression (M3-S1, M3-S2, INPUTS 5.1–5.3, DL-36) ──────────────────────────────────────
  /**
   * The XP curve: going from Level L to L + 1 takes `xpCurveBase × L^xpCurveExponent` XP, rounded
   * to the nearest whole number (INPUTS 5.2: 100 × Level²). `hero.xp` is cumulative, so a Hero
   * holds Level n once it reaches `xpForLevel(n)`, the sum of those steps below n (progression.ts).
   */
  xpCurveBase: number;
  xpCurveExponent: number;
  /** No Hero rises past this Level; XP still accrues beyond it. */
  levelCap: number;
  /** Stat points each Level applies, each drawn by the Class's growth weights (INPUTS 5.3). */
  growthPointsPerLevel: number;
  /**
   * Quest XP: each Hero home alive gains the Quest's difficulty × `xpPerDifficultyPoint` ×
   * `xpBandFactor` of the band, rounded down (INPUTS 5.1: 1 a point on a success, half on a failure).
   */
  xpPerDifficultyPoint: number;
  xpBandFactor: Readonly<Record<QuestBand, number>>;
  /**
   * Training XP: each night, a Hero on a Roster, in no Party and not injured, gains this times the
   * Guild's training yard grade; grade 0 gives nothing (INPUTS 5.1). A drift: no event (rule 10).
   */
  xpPerTrainingDay: number;

  // ── Regard (M4-S5, data-model §3.2 and rule 10, DL-43) ───────────────────────────────────
  /**
   * Regard's scale: every Regard value, whoever holds it, is held inside `regardMin` to
   * `regardMax`. Absence reads as 0, which is neutral (data-model §3.2). M4-S4's Regard between
   * Heroes, and the Relationship read from it, share the scale and the bands (DL-46).
   */
  regardMin: number;
  regardMax: number;
  /**
   * Where each Regard band starts: a value's band is the highest whose start it has reached, and
   * the lowest band for a value below every start (as `moraleBands`). A Regard change emits its
   * event only when it takes the value from one band into another (data-model rule 10).
   */
  regardBands: Readonly<Record<RegardBand, number>>;

  // ── Regard between Heroes and Relationship (M4-S4, R24, INPUTS 6.3, DL-46) ─────────────────
  /**
   * Added to each Hero's Regard for each other Hero of the Party who came home alive with them,
   * once for each resolved Quest, whatever its band; with `regardOnSuccessBonus` on a success and
   * the Encounters' `regard` consequences, summed, in the same one change.
   */
  regardPerSharedQuest: number;
  /** Added beside `regardPerSharedQuest` when the shared Quest succeeded (any band but `fail`). */
  regardOnSuccessBonus: number;
  /**
   * Each night a Hero on a Roster's Regard for another Hero moves toward neutral by this share of
   * the scale's reach a year, spread evenly over the year's nights, once a whole year
   * (`turnsPerYear` Turns) has passed since the two last shared a Quest (the entry's `since`); it
   * stops at neutral, where the entry goes. The unit is `patronRegardRecoveryPerYear`'s. A drift:
   * an event only on a band crossing (rule 10).
   */
  regardDecayPerYear: number;
  /**
   * The teamwork scalar a Check's capability is multiplied by (`teamwork`): 1 plus this times the
   * Party's mean pairwise Relationship as a share of the scale's reach on its side, so from
   * 1 − this at the scale's bottom to 1 + this at its top (INPUTS 6.3: ×0.9 to ×1.1).
   */
  teamworkRange: number;

  // ── Patron Regard and the Board (M4-S5, R22, pre-M0 review B5, DL-43) ─────────────────────
  /** Added to a Patron's Regard for a Guild when the Guild's Party succeeds at one of their Quests. */
  patronRegardOnSuccess: number;
  /** Added (negative) when the Guild's Party fails one of their Quests. */
  patronRegardOnFailure: number;
  /** Added (negative) to the Patron's Regard for every Guild in play when their offer expires untaken. */
  patronRegardOnExpiry: number;
  /**
   * The Patron State Engine: each night a Patron's Regard for each Guild moves toward neutral by
   * this share of the scale's reach (the larger of `regardMax` and −`regardMin`) a year, spread
   * evenly over the year's nights, and stops at neutral. So any value, even the scale's end, is
   * neutral again within 1 / `patronRegardRecoveryPerYear` years. A drift: an event only on a band
   * crossing (rule 10).
   */
  patronRegardRecoveryPerYear: number;
  /**
   * How strongly a Patron's mean Regard across the Guilds in play weights the Board's draw of
   * Patrons (R22): the weight is 1 + this × the mean over the scale's reach on that side, never
   * below 0. At 1 a Patron at the scale's top is drawn twice as often as a neutral one, and one at
   * its bottom never; at 0 the draw is DL-25's uniform one.
   */
  boardRegardWeight: number;

  // ── The Guildmaster's Stats (M4-S5, R8, INPUTS 6.5, pre-M0 review B6, D9, DL-43) ─────────
  // Each Stat's rule reads where its value falls between the Stat's content `min` and `max`:
  // Negotiation from −1 at the bottom to +1 at the top, the others from 0 to 1.
  /**
   * Negotiation: the reward agreed at dispatch is the Quest's reward × (1 + up to this), from −this
   * at the bottom of the Stat's range to +this at the top; a signing fee (and, from M6-S2, a
   * Transfer fee) × (1 − the same), inside the fee's selector (INPUTS 6.5: ±10%).
   */
  negotiationRange: number;
  /** Inspiration: the Morale baseline of the Guild's Heroes is raised by up to this. */
  inspirationMoraleShift: number;
  /** Coaching: training XP × (1 + up to this). */
  coachingFactor: number;
  /** Influence: a gain in a Patron's Regard for the Guild × (1 + up to this). Losses are not scaled. */
  influenceFactor: number;
  /**
   * Judgement: the Potential hint bands the Guildmaster reads are each narrowed, every start
   * scaled by (1 − up to this), so a sharper judge sees promise in a smaller gap (pre-M0 review D9).
   */
  judgementHintSharpening: number;

  // ── Guildmaster Regard (M4-S5, R9, pre-M0 review B3, DL-43) ───────────────────────────────
  /** Added to a Guildmaster's Regard for a Patron when their Guild succeeds at one of the Patron's Quests. */
  guildmasterRegardOnPatronSuccess: number;
  /** Added (negative) when their Guild fails one of the Patron's Quests. */
  guildmasterRegardOnPatronFailure: number;
  /** Added to a Guildmaster's Regard for each Hero of the Party who comes home to the Roster from a success. */
  guildmasterRegardOnHeroSuccess: number;
  /** Added (negative) for each such Hero after a failure. */
  guildmasterRegardOnHeroFailure: number;

  // ── Transfers (M6-S2, R28, INPUTS 7.6, pre-M0 review D5, DL-57) ────────────────────────────
  /**
   * A Transfer fee is the Hero's signing fee before Negotiation (`signingFee`'s list price) times
   * this, times the buying Guildmaster's Negotiation, rounded down once (`transferFee`; INPUTS 7.6:
   * two signing fees).
   */
  transferFeeFactor: number;
  /**
   * Added (negative) to the Morale of each Hero who stays on the Roster the Hero transferred leaves, whose own
   * Regard for the Hero transferred is in `transferRegardBand` or above (INPUTS 7.6: −15; pre-M0
   * review D5: pairwise, not the Roster's mean). `hero.morale-changed` only on a band crossing.
   */
  transferMoraleCost: number;
  /** The lowest Regard band whose holders pay `transferMoraleCost` (D5: `warm` or above). */
  transferRegardBand: RegardBand;
  /**
   * Added to each of the two Guildmasters' Regard for the other when a Transfer between their Guilds
   * is made (R9; Guildmaster Regard's third writer, after M4-S5's Patrons and Heroes).
   */
  guildmasterRegardPerTransferDeal: number;
  /**
   * Days a Transfer Offer stands, the Day it is made included: it expires on that last Day's night
   * and is removed then, with `guild.transfer-offer-expired`, unless answered first.
   */
  transferOfferDays: number;
  /**
   * The Transfer Generator (M6-S3, DL-59) runs on the night of every Day this many apart: the Days
   * `d` with `d mod transferGeneratorEveryDays` equal to `transferGeneratorEveryDays − 1`, as
   * `upkeepEveryDays` names its Days (DL-26). Weekly: 7.
   */
  transferGeneratorEveryDays: number;
  /**
   * On a Transfer Generator night, the chance, one draw from `rivals` for each pair of Rivals in play,
   * that the one of the pair with the greater `transferAppetite` bids for a Hero of the other.
   */
  transferGeneratorChance: number;
  /**
   * Days after a Hero's Transfer before they may be transferred again (DL-60): a Transfer on Day `d`
   * holds them on their new Roster through Day `d + transferLockDays − 1`, whoever asks, by any
   * Transfer action, so that no Guild sells a Hero back, or on, the afternoon it bought them. 0 locks
   * no one. 90 since the M6 close (DL-69), for 30: a season, so that no Hero goes back to a Guild
   * that sold them within one.
   */
  transferLockDays: number;

  // ── Items (M5-S1, INPUTS 7.1, DL-48) ──────────────────────────────────────────────────────
  /**
   * The gear slots every Hero has, in the order a front end lists them: each one of content's
   * `gearSlotKeys`, none twice (INPUTS 7.1: weapon, armour, trinket). A Hero holds at most one Item
   * in each; `equip` fills only these, and an Item held in a slot not listed here is warned about
   * by the validator (DL-49).
   */
  gearSlots: readonly SlotKey[];

  // ── Loot (M5-S5, R32, INPUTS 7.4, DL-52) ──────────────────────────────────────────────────
  /**
   * A Quest carries its template's Loot table only when the template's `difficultyMin` is above
   * this: the Quest Generator copies `lootTableKey` onto the Quest then, and `null` otherwise. Content
   * chooses each template's table by its difficulty band; this says from which difficulty a Quest
   * awards Loot at all. 35 since the M5 close, so that Loot is for hard Quests (DL-62; 25 before).
   */
  lootDifficultyThreshold: number;
  /** The bands on which a Quest with a Loot table awards one entry of it (INPUTS 7.4: strong only). */
  lootOnBands: readonly QuestBand[];

  // ── The Market (M5-S4, R31, INPUTS 7.2, DL-51) ────────────────────────────────────────────
  /**
   * How many stacks each morning's refresh puts on the Market, each of a different definition, or
   * every definition the Market stocks when there are fewer (INPUTS 7.2: 10).
   */
  marketSize: number;
  /** The fewest Items in a stack the refresh draws. */
  marketStackMin: number;
  /** The most Items in a stack the refresh draws. */
  marketStackMax: number;
  /**
   * What the Market pays for an Item as a share of its Market price, rounded down for each Item
   * (INPUTS 7.2: half). Below 1, so that an Item sells for less than it costs (R31).
   */
  sellRatio: number;
  /**
   * The Market price of an Item whose definition has no `buyPrice`, found only as Loot (DL-48): what
   * a Guild pays for such an Item listed on the Market, as a folded Guild's unique Items are (pre-M0
   * review D6), and, × `sellRatio`, what the Market pays for one.
   */
  lootOnlyPrice: number;
}

/** A Quest's outcome bands, worst first (INPUTS 4.3; from M4-S2, by its Encounters succeeded). */
export const questBands = ['fail', 'success', 'strong'] as const;

export type QuestBand = (typeof questBands)[number];

/** The named ranges Morale falls in, lowest first (M2-S6, pre-M0 review A7). */
export const moraleBandNames = ['wretched', 'low', 'steady', 'high', 'elated'] as const;

export type MoraleBand = (typeof moraleBandNames)[number];

/** The words a Potential hint can be, for the narrowest gap first (M3-S3, INPUTS 5.4). */
export const potentialHints = ['modest', 'promising', 'exceptional'] as const;

export type PotentialHint = (typeof potentialHints)[number];

/** The named ranges Regard falls in, lowest first (M4-S4, M4-S5, `CONTEXT.md` Regard band). */
export const regardBandNames = ['hostile', 'cool', 'neutral', 'warm', 'close'] as const;

export type RegardBand = (typeof regardBandNames)[number];

export const defaultConfig: Readonly<GameConfig> = Object.freeze({
  schemaVersion: 6,
  configVersion: 13,
  turnsPerYear: 1080,

  startingRosterSize: 4,
  startingWealth: 500,
  rivalCount: 4,
  rivalRosterMin: 4,
  rivalRosterMax: 8,
  rivalHireReserveUpkeeps: 3,
  rivalStartingWealthMin: 300,
  rivalStartingWealthMax: 700,
  patronCount: 12,
  unattachedPoolSize: 8,

  heroStartingAgeMin: 18,
  heroStartingAgeMax: 36,
  statBaseMin: 3,
  statBaseMax: 10,
  statBiasMin: 2,
  statBiasMax: 4,
  potentialGapMin: 3,
  potentialGapMax: 12,
  startingSkillsMin: 1,
  startingSkillsMax: 2,
  startingSkillRatingMax: 2,
  moraleBaseline: 60,

  guildmasterStartingAgeMin: 21,
  guildmasterStartingAgeMax: 50,
  guildmasterStatMin: 5,
  guildmasterStatMax: 15,
  guildmasterTraitsMin: 0,
  guildmasterTraitsMax: 2,
  guildmasterTraitBudget: 1,

  upkeepEveryDays: 10,
  wagePerLevel: 20,
  hallMaintenancePerGrade: 10,
  bankruptcyFloor: 0,
  bankruptcyGraceDays: 30,
  fameFloor: 0,
  signingFeeBase: 50,
  signingFeePerLevel: 25,
  signingFeeStatDivisor: 4,
  unattachedStayDays: 10,
  fameRequiredPerLevel: 10,
  boardSize: 6,
  questOfferDays: 3,
  questDifficultyMin: 10,
  questDifficultyMax: 100,

  checkVariance: 0.2,
  skillBonusPerRating: 2,
  bandBySuccessShare: Object.freeze({ successAbove: 0.5, strongAtLeast: 1 }),
  checkDegrees: Object.freeze({ triumph: 1.25, success: 1, setback: 0.75 }),
  strongTriumphShare: 0.5,

  moraleMin: 0,
  moraleMax: 100,
  moraleDrift: 1,
  moraleBands: Object.freeze({ wretched: 0, low: 20, steady: 40, high: 75, elated: 90 }),
  moraleOnRosterDeath: -10,
  moraleOnStrongSuccess: 5,
  heroRetirementAge: 45,
  heroRetirementChancePerYear: 0.02,
  heroRetirementInjuredMultiplier: 2,
  infirmaryHealFactor: Object.freeze([1, 1 / 2, 1 / 3, 1 / 4]),
  quartersMoraleBonus: 5,

  potentialHintBands: Object.freeze({ modest: 0, promising: 6, exceptional: 10 }),
  declineAge: 40,
  declinePerYear: 1,
  declineAreas: Object.freeze(['physical' as const]),

  guildmasterRetirementAge: 61,
  rivalReplacementDays: 30,

  xpCurveBase: 100,
  xpCurveExponent: 2,
  levelCap: 20,
  growthPointsPerLevel: 3,
  xpPerDifficultyPoint: 1,
  xpBandFactor: Object.freeze({ fail: 0.5, success: 1, strong: 1 }),
  xpPerTrainingDay: 2,

  regardMin: -20,
  regardMax: 20,
  regardBands: Object.freeze({ hostile: -20, cool: -12, neutral: -4, warm: 4, close: 12 }),
  regardPerSharedQuest: 1,
  regardOnSuccessBonus: 0.5,
  regardDecayPerYear: 0.25,
  teamworkRange: 0.1,
  patronRegardOnSuccess: 1,
  patronRegardOnFailure: -2,
  patronRegardOnExpiry: -1,
  patronRegardRecoveryPerYear: 0.5,
  boardRegardWeight: 1,
  negotiationRange: 0.1,
  inspirationMoraleShift: 10,
  coachingFactor: 0.5,
  influenceFactor: 0.5,
  judgementHintSharpening: 0.25,
  guildmasterRegardOnPatronSuccess: 1,
  guildmasterRegardOnPatronFailure: -1,
  guildmasterRegardOnHeroSuccess: 1,
  guildmasterRegardOnHeroFailure: -1,

  transferFeeFactor: 2,
  transferMoraleCost: -15,
  transferRegardBand: 'warm',
  guildmasterRegardPerTransferDeal: 2,
  transferOfferDays: 3,
  transferGeneratorEveryDays: 7,
  transferGeneratorChance: 0.5,
  transferLockDays: 90,

  gearSlots: Object.freeze(['weapon' as const, 'armour' as const, 'trinket' as const]),

  lootDifficultyThreshold: 35,
  lootOnBands: Object.freeze(['strong' as const]),

  marketSize: 10,
  marketStackMin: 1,
  marketStackMax: 5,
  sellRatio: 0.5,
  lootOnlyPrice: 600,
});

/** The one object every engine entry point takes (approach §3, pre-M0 review D1). */
export interface EngineDeps {
  config: GameConfig;
  content: ContentSet;
  /**
   * The installed modules, in the order their hooks run (M8-S1, modules.ts); none when absent,
   * which is every game the front ends and the harness play.
   */
  modules?: readonly Module[];
}

/**
 * What is wrong with `config`'s Quest Engine fields, each a sentence naming its field; none for a
 * sound one (v1.1.4-S2's verification, DL-152). A Degree means something only while its thresholds
 * are ordered, `triumph` > `success` > `setback` > 0, and `strongTriumphShare` is a share from 0 to
 * 1. The Quest Engine refuses to resolve under a config with a problem (`resolveQuest`).
 */
export function configProblems(config: Pick<GameConfig, 'checkDegrees' | 'strongTriumphShare'>): string[] {
  const problems: string[] = [];
  const { triumph, success, setback } = config.checkDegrees;
  if (!(triumph > success && success > setback && setback > 0)) {
    problems.push(`checkDegrees is ${JSON.stringify(config.checkDegrees)}; triumph > success > setback > 0`);
  }
  const share = config.strongTriumphShare;
  if (!(share >= 0 && share <= 1)) problems.push(`strongTriumphShare is ${share}; it is a share from 0 to 1`);
  return problems;
}
