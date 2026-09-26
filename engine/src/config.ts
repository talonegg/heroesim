// Every tunable is a `GameConfig` field with its default in `defaultConfig` (principle 8): a
// literal balance number in rules code is a defect. Rules read `deps.config`, never
// `meta.config` (data-model §2). A front end passes `{ ...defaultConfig, ...meta.config }`, so a
// loaded game plays under the rules it started with and a field its save predates reads as the
// current default; the harness passes its own; `rebase` adopts the current defaults (M2-S1).
//
// Each story adds the fields it introduces: M1-S1 the document's clock and the two versions;
// M1-S5 and M1-S6 the starting world (DL-19); M2-S3 the Board (DL-25); M2-S5 the stub Quest
// Engine and M2-S6 the Hero State Engine (DL-29). Every "Min/Max" pair is an inclusive range
// drawn with `int`. A field holding an object or a list is frozen with `defaultConfig`.

import type { ContentSet, StatArea } from './content-types.js';
import type { ModuleId } from './document.js';

export interface GameConfig {
  /**
   * The World State schema this engine writes as `meta.version`; a load compares the two and
   * migrates an older save (M1-S8). 2 from M2-S8, whose Heroes gained the pool's two fields (DL-27).
   */
  schemaVersion: number;
  /**
   * Raised, with a decision-log entry, whenever a default in `defaultConfig` changes; `rebase`
   * records the old and the new (data-model §2, pre-M0 review D1). 2 from M2-S12's first balance
   * pass (DL-35); 3 from M3's wage for Levels (DL-36); 4 from M3's Rival reserve (DL-41).
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
  /** Each Rival's starting Roster size is drawn from this range. */
  rivalRosterMin: number;
  rivalRosterMax: number;
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
  /** A generated Guildmaster's age, in whole years. */
  guildmasterStartingAgeMin: number;
  guildmasterStartingAgeMax: number;
  /** Each Guildmaster Stat is drawn from this range (DL-19). */
  guildmasterStatMin: number;
  guildmasterStatMax: number;
  /** How many Guildmaster Traits a Guildmaster is generated with (pre-M0 review B2). */
  guildmasterTraitsMin: number;
  guildmasterTraitsMax: number;

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

  // ── The stub Quest Engine (M2-S5, INPUTS 4.3, 4.4, 5.1, pre-M0 review A4, DL-29) ─────────
  /**
   * Where the bands start on the ratio of score to difficulty: below `successAtLeast` a Quest
   * fails, from it up to and including `strongAbove` it succeeds, and above `strongAbove` it is a
   * strong success. INPUTS 4.3's 0.8 and 1.2 scaled by 0.325 since the first balance pass, a
   * Level-1 Party of the size a Quest requires scoring about a third of its difficulty (DL-35).
   */
  stubBands: Readonly<{ successAtLeast: number; strongAbove: number }>;
  /** The one roll's reach: the score is scaled by 1 + a draw from −`stubVariance` to +`stubVariance`. */
  stubVariance: number;
  /** Added to the score for each rating point of a Quest's Skills held across the Party (R15). */
  stubSkillBonusPerRating: number;
  /** The chance, per band, that one Hero of the Party is injured. */
  stubInjuryChance: Readonly<Record<QuestBand, number>>;
  /** The chance, per band, that one Hero of the Party dies. */
  stubDeathChance: Readonly<Record<QuestBand, number>>;

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
   * the list reads its last factor (INPUTS 4.5: grade 1 halves, grade 2 thirds).
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
  /** A Guildmaster this old, in whole years, retires, and their Guild reaches its ending. */
  guildmasterRetirementAge: number;
  /** Whole Days after a Rival folds until a new Rival is founded in its place, at night. */
  rivalReplacementDays: number;

  // ── Rival controllers (M2-S9, INPUTS 4.12, DL-30) ─────────────────────────────────────────
  /**
   * `steady` recruits only while its Wealth is above this many times its Upkeep (INPUTS 4.12:
   * "when Wealth exceeds three Upkeeps"; ten since the first balance pass, so that a Rival keeps
   * more than a month's Upkeep in hand, DL-35; sixty since Heroes gain Levels, so that a Rival stops
   * recruiting before its Roster's rising wages outrun its one Quest a day, DL-41). M6-S1 moves the
   * threshold into each Disposition's row. The harness's automatic policy has its own (DL-34).
   */
  recruitWealthMultiple: number;
  /**
   * `steady` builds its infirmary's next grade only while its Wealth is above this many times that
   * grade's cost (M3-S6: "when Wealth exceeds three times its cost", DL-38). The harness's
   * automatic policy has its own multiple, as it has its own `recruitWealthMultiple` (DL-34).
   */
  buildWealthMultiple: number;

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
}

/** The stub Quest Engine's outcome bands, worst first (INPUTS 4.3). */
export const questBands = ['fail', 'success', 'strong'] as const;

export type QuestBand = (typeof questBands)[number];

/** The named ranges Morale falls in, lowest first (M2-S6, pre-M0 review A7). */
export const moraleBandNames = ['wretched', 'low', 'steady', 'high', 'elated'] as const;

export type MoraleBand = (typeof moraleBandNames)[number];

/** The words a Potential hint can be, for the narrowest gap first (M3-S3, INPUTS 5.4). */
export const potentialHints = ['modest', 'promising', 'exceptional'] as const;

export type PotentialHint = (typeof potentialHints)[number];

export const defaultConfig: Readonly<GameConfig> = Object.freeze({
  schemaVersion: 2,
  configVersion: 4,
  turnsPerYear: 1080,

  startingRosterSize: 4,
  startingWealth: 500,
  rivalCount: 4,
  rivalRosterMin: 4,
  rivalRosterMax: 8,
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

  guildmasterStartingAgeMin: 30,
  guildmasterStartingAgeMax: 45,
  guildmasterStatMin: 5,
  guildmasterStatMax: 15,
  guildmasterTraitsMin: 0,
  guildmasterTraitsMax: 2,

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

  stubBands: Object.freeze({ successAtLeast: 0.26, strongAbove: 0.39 }),
  stubVariance: 0.2,
  stubSkillBonusPerRating: 2,
  stubInjuryChance: Object.freeze({ fail: 0.4, success: 0.1, strong: 0 }),
  stubDeathChance: Object.freeze({ fail: 0.05, success: 0, strong: 0 }),

  moraleMin: 0,
  moraleMax: 100,
  moraleDrift: 1,
  moraleBands: Object.freeze({ wretched: 0, low: 20, steady: 40, high: 75, elated: 90 }),
  moraleOnRosterDeath: -10,
  moraleOnStrongSuccess: 5,
  heroRetirementAge: 45,
  heroRetirementChancePerYear: 0.02,
  heroRetirementInjuredMultiplier: 2,
  infirmaryHealFactor: Object.freeze([1, 1 / 2, 1 / 3]),
  quartersMoraleBonus: 5,

  potentialHintBands: Object.freeze({ modest: 0, promising: 6, exceptional: 10 }),
  declineAge: 40,
  declinePerYear: 1,
  declineAreas: Object.freeze(['physical' as const]),

  guildmasterRetirementAge: 65,
  rivalReplacementDays: 30,
  recruitWealthMultiple: 60,
  buildWealthMultiple: 3,

  xpCurveBase: 100,
  xpCurveExponent: 2,
  levelCap: 20,
  growthPointsPerLevel: 3,
  xpPerDifficultyPoint: 1,
  xpBandFactor: Object.freeze({ fail: 0.5, success: 1, strong: 1 }),
  xpPerTrainingDay: 2,
});

/** A module as the core knows it until M8-S1 writes the module contract: its id. */
export interface Module {
  readonly id: ModuleId;
}

/** The one object every engine entry point takes (approach §3, pre-M0 review D1). */
export interface EngineDeps {
  config: GameConfig;
  content: ContentSet;
  modules?: readonly Module[];
}
