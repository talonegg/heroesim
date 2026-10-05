// Every tunable is a `GameConfig` field (principle 8): a literal balance number in rules code is a
// defect. The defaults' values are data, `config.json`, grouped in sections by what they tune,
// beside the defaults' version and its changelog; the engine reads them flat, as `defaultConfig`,
// each setting once and in `GameConfig`'s order, frozen all the way down (DL-186 item 15, DL-204).
// A value changes through the content editor's config kind, `npm run edit -- config`
// (docs/agents/config.md); a setting is added to the file, with its field here and its rule
// (config-check.ts), by the story that adds it. Each field below says what the setting is and why,
// citing the decision that set it; the history of its values is the decision log's
// (docs/agents/comments.md).
//
// Rules read `deps.config`, never `meta.config` (data-model §2). Every front end, the harness and a
// save's load take a game's deps from `playDeps` (config-check.ts), which fills `meta.config`
// forward with the current defaults and checks every setting before any play, so a loaded game
// plays under the rules it started with and a field its save predates reads as the current default;
// `rebase` adopts the current defaults. The document's two versions are `meta`'s, not settings: the
// schema's `schemaVersion` (document.ts) and the defaults' `configVersion`, below (DL-193). The
// gear slots every Hero has are the engine's `gearSlotKeys`, no setting (DL-193). Every "Min/Max"
// pair is an inclusive range drawn with `int`.

import configFile from './config.json' with { type: 'json' };
import type { ContentSet, Degree, StatArea } from './content-types.js';
import type { Sex } from './document.js';
import type { Module } from './modules.js';

export interface GameConfig {
  // ── `world`: the year and the starting world (INPUTS 3.2 to 3.4, 3.7, DL-19) ──────────────
  /** Turns in a year: three Turns a Day, so 1,080 is 360 Days (data-model §3.1, INPUTS 3.2). */
  turnsPerYear: number;
  /** Heroes on the player's starting Roster; four gives one per Class (DL-19). */
  startingRosterSize: number;
  /** The player's starting Wealth. */
  startingWealth: number;
  /** Rival Guilds generated with the world. */
  rivalCount: number;
  /**
   * Each Rival's starting Roster size is drawn from this range. A Rival whose Roster falls below
   * `rivalRosterMin` hires back towards it while it can keep `rivalHireReserveUpkeeps` Upkeeps
   * (DL-60). The range is no cap: no Guild's Roster is capped, and a Roster grows as far as its
   * Guild's finances support (DL-185). The Transfer Generator keeps its own moves within the range
   * (DL-59), its bid needing the bidder below `rivalRosterMax`: a bound kept for now only as a
   * development measure, to constrain testing load, and to be removed (backlog, DL-185).
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
  /** Unattached Heroes generated with the world, and what the pool is refilled to (DL-27). */
  unattachedPoolSize: number;

  // ── `heroes`: a generated Hero (INPUTS 3.5, 3.6, 3.11, 4.8, DL-19) ──────────────────────────
  /** A generated Hero's age, in whole years. */
  heroStartingAgeMin: number;
  heroStartingAgeMax: number;
  /**
   * A new Hero's sex is drawn in proportion to these weights, one draw: each 0 or more, not both 0
   * (DL-186 item 16, DL-202). Equal weights draw each as likely as the other.
   */
  heroSexWeights: Readonly<Record<Sex, number>>;
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
  /** A Hero's Morale at generation, and what nightly drift returns it to (DL-29). */
  moraleBaseline: number;

  // ── `guildmasters`: a generated Guildmaster (INPUTS 3.13, 4.10, DL-19) ───────────────────────
  /**
   * A generated Guildmaster's age, in whole years, and the range the player chooses from at setup
   * (DL-113 item 4).
   */
  guildmasterStartingAgeMin: number;
  guildmasterStartingAgeMax: number;
  /**
   * Each Guildmaster Stat is drawn from this range (DL-19), and a player who chooses the Stats at
   * setup sets each within it (DL-149 item 5).
   */
  guildmasterStatMin: number;
  guildmasterStatMax: number;
  /**
   * The Stat points (DL-149 item 5): what a player who chooses their Guildmaster's Stats at setup
   * shares among them, set at the drawn Stats' mean for each, so that a chosen Guildmaster is no
   * stronger than a drawn one on the mean. The Stats chosen may cost no more in all; points left
   * unspent are lost. A drawn Guildmaster is not held to it.
   */
  guildmasterStatPoints: number;
  /**
   * How many Guildmaster Traits a Guildmaster is generated with (pre-M0 review B2): the count is
   * drawn from this range, and a smaller set is drawn when no legal set has that many
   * (`guildmasterTraitBudget`, DL-109 item 1). The maximum caps the Traits a player chooses at setup
   * too (DL-100 item 3).
   */
  guildmasterTraitsMin: number;
  guildmasterTraitsMax: number;
  /**
   * The Trait budget (DL-88 item 4, DL-100 item 3, DL-102): the most a Guildmaster's Traits may cost
   * in all, each Trait's cost being content's (`GuildmasterTrait.cost`), a buff costing and a penalty
   * refunding. A drawn Guildmaster's Traits are one set drawn from every set within it (DL-109
   * item 1); a player's choice at setup is refused over it. At 1, the dearer buffs need a penalty
   * beside them.
   */
  guildmasterTraitBudget: number;

  // ── `guilds`: the Guild State Engine (INPUTS 4.6, 4.9, pre-M0 review D10.3, DL-26) ─────────
  /** Upkeep falls due every this many Days (DL-26 says which Days precisely). */
  upkeepEveryDays: number;
  /**
   * Wealth deducted per Level of each living Hero on the Roster, each Upkeep: a wage that weighs
   * against the Quest rewards, so that a Guild must keep succeeding, and that a Roster gaining Levels
   * can still bear (DL-35, DL-36).
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

  // ── `recruitment`: signing and the Unattached pool (INPUTS 3.7, 4.7, DL-27) ──────────────────
  /** A signing fee is this, plus the per-Level part, plus the Stats part (`signingFee`). */
  signingFeeBase: number;
  /** Added to a signing fee for each of the Hero's Levels. */
  signingFeePerLevel: number;
  /** The sum of the Hero's base Stats is divided by this for a signing fee's Stats part. */
  signingFeeStatDivisor: number;
  /** Whole Days an Unattached Hero stays in the pool before leaving it, at night. */
  unattachedStayDays: number;
  /**
   * Fame's first rule (R10 as amended, pre-M0 review B4, INPUTS 5.6, DL-38): an Unattached
   * Hero refuses to sign for a Guild whose Fame is below this times the Hero's Level less one, so
   * a Level 1 Hero signs anywhere (`signingRefusal`).
   */
  fameRequiredPerLevel: number;

  // ── `board`: the Board and its Quests' draw (INPUTS 4.1, 4.3, DL-25) ─────────────────────────
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
  /**
   * How much likelier an Encounter is drawn, within its kind, for each tag it shares with its Quest's
   * template (DL-148 item 22, DL-160): its weight in the one `weightedPick` is this to the power of
   * the tags shared, so at 3 one shared tag draws it three times as often as one sharing none. A finite
   * number of 1 or more, so that a tag shared never makes an Encounter rarer; at 1 tags change nothing.
   */
  encounterTagWeight: number;

  // ── `quest`: the Quest Engine (INPUTS 6.2, DL-42) ──────────────────────────────────────────
  /**
   * A Check's roll: the Party's capability times 1 + a draw from −`checkVariance` up to
   * +`checkVariance`, from the `quests` stream, wide enough that all four Degrees can happen to a
   * Party whose capability is near the target (DL-162, DL-165). A Check keeps its own `variance` only
   * where it truly differs from the rest.
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
   * `successAbove`, else `fail`: all strong, a majority success (DL-42). An Encounter a Party wiped
   * out never reached counts as not succeeded.
   */
  bandBySuccessShare: Readonly<{ successAbove: number; strongAtLeast: number }>;
  /**
   * A Check's Degree from its roll ÷ its target (DL-148 item 8, DL-152): a Triumph at `triumph` or
   * more, a Success at `success` or more, a Setback at `setback` or more, else a Failure. The Triumph
   * is set, with `strongTriumphShare`, so that fewer Quests are strong successes at no cost in
   * bankruptcies (DL-166); the owner accepted it as the design's value (DL-168 item 9).
   */
  checkDegrees: Readonly<{ triumph: number; success: number; setback: number }>;
  /**
   * The share of a Quest's Encounters that must be Triumphs for a strong success, beside every one
   * at Success or better (DL-148 item 8: DL-83 item 17's margin, a share of Triumphs). The share is
   * of the whole sequence, as `bandBySuccessShare`'s is. Set with `checkDegrees` (DL-166); the owner
   * accepted it as the design's value (DL-168 item 9).
   */
  strongTriumphShare: number;
  /**
   * A Hero's form on a Quest (DL-148 items 9 to 11, DL-154, `CONTEXT.md` Form): the factor on the
   * Stat values they add into a Check's score, by the band of their Morale on the Quest. Narrow, so
   * that a Guild failing and losing Morale is not driven down fast (DL-166). Provisional: the values
   * are to be revisited in the economy pass (#51, DL-168 item 9), not the design's.
   */
  moraleCheckFactor: Readonly<Record<MoraleBand, number>>;
  /**
   * Their form is also multiplied by this once they are hurt on the Quest (DL-148 item 10, DL-154),
   * set with the form factors (DL-166). Provisional, like `moraleCheckFactor`: to be revisited in the
   * economy pass (#51, DL-168 item 9).
   */
  hurtCheckFactor: number;
  /**
   * How much more often harm falls on a Hero weak in the Stats an Injury or a Death is `exposedBy`
   * (DL-148 item 14, DL-155): their weight in the draw of who is hit is 1 + this × (1 − their
   * mean share of those Stats' content range). At 2, the weakest is hit three times as often as the
   * strongest; 0 weights everyone alike.
   */
  exposureRange: number;
  /**
   * How much a Hero strong in the Stats a harm is `guardedBy`, or a Morale loss `steadiedBy`, shrugs
   * off (DL-148 item 14, DL-155): the chance, or the loss, is times 1 − this × their mean share of
   * those Stats' content range. A share from 0 to 1; at 0.5, the strongest halve it.
   */
  guardRange: number;
  /**
   * Where each chance band above `hopeless` starts (DL-148 item 15, DL-156, `chanceBand`): an
   * estimated chance below `unlikely` is `hopeless`, and one at a start or above, up to the next, is
   * that band. Strictly increasing, each above 0 and below 1.
   */
  chanceBands: Readonly<Record<Exclude<ChanceBand, 'hopeless'>, number>>;
  /**
   * The `partyMargin` of a Guild with no Disposition, the player's (DL-148 item 17, DL-157): the
   * Party the engine would send from its free Heroes (`partyFor`), which the Board's card gives as
   * "Your best Party" and the harness's automatic policy sends, keeps adding a Hero only while each
   * raises the estimated chance of success by more than this (DL-175). A share from 0 to 1.
   */
  playerPartyMargin: number;

  // ── `heroState`: the Hero State Engine (INPUTS 4.5, 4.8, 4.11, DL-29) ──────────────────────
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
   * the list reads its last factor (INPUTS 4.5, DL-193). A factor for each grade content has, so that
   * each grade built does something (DL-53).
   */
  infirmaryHealFactor: readonly number[];
  /**
   * Added to `moraleBaseline` for each grade of the Guild's quarters: what nightly drift returns a
   * Roster Hero's Morale to (`moraleBaselineFor`; R33, DL-38).
   */
  quartersMoraleBonus: number;

  // ── `ageing`: Potential hints and decline (INPUTS 5.4, 5.5, DL-37) ───────────────────────────
  /**
   * Where each Potential hint starts on the gap from a Stat's base to its Potential, in Stat
   * points: a Stat's hint is the highest whose start its gap has reached, and the lowest for a gap
   * below every start, so the three cover every gap (`potentialHint`). The Guildmaster's Judgement
   * narrows them (pre-M0 review D9, DL-43).
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

  // ── `endings`: a Guild's ending (INPUTS 4.10, pre-M0 review D6, DL-28) ──────────────────────
  /**
   * A Guildmaster this old, in whole years, retires, and their Guild reaches its ending, on the night
   * `retirementTurn` gives (DL-28, DL-113 item 4).
   */
  guildmasterRetirementAge: number;
  /** Whole Days after a Rival folds until a new Rival is founded in its place, at night. */
  rivalReplacementDays: number;

  // ── `progression`: XP and Levels (INPUTS 5.1–5.3, DL-36) ──────────────────────────────────
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
   * Quest XP: the Quest's difficulty × `xpPerDifficultyPoint` × `xpBandFactor` of the band (INPUTS
   * 5.1: 1 a point on a success, half on a failure), split across the Party sent, its Dead counted:
   * each Hero home alive gains that divided by the Party's size, rounded down (DL-182, DL-184).
   */
  xpPerDifficultyPoint: number;
  xpBandFactor: Readonly<Record<QuestBand, number>>;
  /**
   * Training XP: each night, a Hero on a Roster, in no Party and not injured, gains this times the
   * Guild's training yard grade; grade 0 gives nothing (INPUTS 5.1). A drift: no event (rule 10).
   */
  xpPerTrainingDay: number;

  // ── `regard`: Regard's scale, and Regard between Heroes (data-model §3.2, rule 10, DL-43) ─────
  /**
   * Regard's scale: every Regard value, whoever holds it, is held inside `regardMin` to
   * `regardMax`. Absence reads as 0, which is neutral (data-model §3.2). Regard between Heroes, and
   * the Relationship read from it, share the scale and the bands (DL-46).
   */
  regardMin: number;
  regardMax: number;
  /**
   * Where each Regard band starts: a value's band is the highest whose start it has reached, and
   * the lowest band for a value below every start (as `moraleBands`). A Regard change emits its
   * event only when it takes the value from one band into another (data-model rule 10).
   */
  regardBands: Readonly<Record<RegardBand, number>>;

  // Regard between Heroes and Relationship (R24, INPUTS 6.3, DL-46).
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

  // ── `patrons`: Patron Regard and the Board's draw of Patrons (R22, pre-M0 review B5, DL-43) ──
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

  // ── `guildmasterStats`: the Guildmaster's Stats (R8, INPUTS 6.5, pre-M0 review B6, D9, DL-43) ─
  // Each Stat's rule reads where its value falls between the Stat's content `min` and `max`:
  // Negotiation from −1 at the bottom to +1 at the top, the others from 0 to 1.
  /**
   * Negotiation: the reward agreed at dispatch is the Quest's reward × (1 + up to this), from −this
   * at the bottom of the Stat's range to +this at the top; a signing fee and a Transfer fee × (1 −
   * the same), inside the fee's selector (INPUTS 6.5: ±10%; DL-57).
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

  // ── `guildmasterRegard`: Guildmaster Regard (R9, pre-M0 review B3, DL-43) ─────────────────────
  /** Added to a Guildmaster's Regard for a Patron when their Guild succeeds at one of the Patron's Quests. */
  guildmasterRegardOnPatronSuccess: number;
  /** Added (negative) when their Guild fails one of the Patron's Quests. */
  guildmasterRegardOnPatronFailure: number;
  /** Added to a Guildmaster's Regard for each Hero of the Party who comes home to the Roster from a success. */
  guildmasterRegardOnHeroSuccess: number;
  /** Added (negative) for each such Hero after a failure. */
  guildmasterRegardOnHeroFailure: number;

  // ── `transfers`: Transfers (R28, INPUTS 7.6, pre-M0 review D5, DL-57) ─────────────────────────
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
   * is made (R9, DL-57; Guildmaster Regard's third writer, after the Patrons and the Heroes).
   */
  guildmasterRegardPerTransferDeal: number;
  /**
   * Days a Transfer Offer stands, the Day it is made included: it expires on that last Day's night
   * and is removed then, with `guild.transfer-offer-expired`, unless answered first.
   */
  transferOfferDays: number;
  /**
   * The Transfer Generator (DL-59) runs on the night of every Day this many apart: the Days
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
   * no one. A season, so that no Hero goes back to a Guild that sold them within one (DL-69).
   */
  transferLockDays: number;

  // ── `loot`: Loot (R32, INPUTS 7.4, DL-52) ──────────────────────────────────────────────────────
  /**
   * A Quest carries its template's Loot table only when the template's `difficultyMin` is above
   * this: the Quest Generator copies `lootTableKey` onto the Quest then, and `null` otherwise. Content
   * chooses each template's table by its difficulty band; this says from which difficulty a Quest
   * awards Loot at all: set so that Loot is for hard Quests (DL-62).
   */
  lootDifficultyThreshold: number;
  /** The bands on which a Quest with a Loot table awards one entry of it (INPUTS 7.4: strong only). */
  lootOnBands: readonly QuestBand[];
  /**
   * A Quest whose template names a Finale awards Loot only when the Finale ended at one of these Degrees;
   * a Quest with no Finale is unaffected, and one whose Party never reached its Finale awards none
   * (DL-148 item 23, DL-202).
   */
  lootOnFinaleDegrees: readonly Degree[];

  // ── `market`: the Market (R31, INPUTS 7.2, DL-51) ──────────────────────────────────────────────
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

/**
 * The words an estimated chance is shown in, least likely first (v1.1.4-S5, DL-148 item 15): the
 * engine gives the key, and the front ends word it.
 */
export const chanceBandNames = ['hopeless', 'unlikely', 'even', 'likely', 'near-certain'] as const;

export type ChanceBand = (typeof chanceBandNames)[number];

/** The words a Potential hint can be, for the narrowest gap first (M3-S3, INPUTS 5.4). */
export const potentialHints = ['modest', 'promising', 'exceptional'] as const;

export type PotentialHint = (typeof potentialHints)[number];

/** The named ranges Regard falls in, lowest first (M4-S4, M4-S5, `CONTEXT.md` Regard band). */
export const regardBandNames = ['hostile', 'cool', 'neutral', 'warm', 'close'] as const;

export type RegardBand = (typeof regardBandNames)[number];

/** The settings `config.json` holds, by section, as its type gives them. */
export type ConfigSections = typeof configFile.sections;

/** `config.json`'s sections, frozen all the way down: what the content editor's `config show` lists by section. */
export const configSections: Readonly<ConfigSections> = frozen(configFile.sections);

/**
 * The defaults' version, written as `meta.configVersion` (DL-193): `config.json`'s `version`, raised
 * with a line of its changelog and a decision-log entry whenever a default changes; `rebase` records
 * the old and the new (data-model §2, pre-M0 review D1). The editor's config kind raises it at
 * "Finish" (DL-204).
 */
export const configVersion: number = configFile.version;

/** Why each `configVersion` was raised, a line each, oldest first: `config.json`'s `changelog`. */
export const configChangelog: readonly string[] = frozen(configFile.changelog);

/** `value` frozen, and every object and list in it. */
function frozen<Value>(value: Value): Value {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const each of Object.values(value)) frozen(each);
    Object.freeze(value);
  }
  return value;
}

/**
 * The settings of `sections` as one flat record, the sections end to end, each in its own order: how
 * the engine reads `config.json` (DL-186 item 15). A setting in two sections is refused, naming both.
 */
export function flattenConfig(sections: Readonly<Record<string, Readonly<Record<string, unknown>>>>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const sectionOf = new Map<string, string>();
  for (const [section, settings] of Object.entries(sections)) {
    for (const [setting, value] of Object.entries(settings)) {
      const first = sectionOf.get(setting);
      if (first !== undefined) throw new Error(`${setting} is in both ${first} and ${section}`);
      sectionOf.set(setting, section);
      flat[setting] = value;
    }
  }
  return flat;
}

/** Every setting's default: `config.json`'s, flat, in `GameConfig`'s order (config.test.ts holds both). */
export const defaultConfig: Readonly<GameConfig> = frozen(flattenConfig(configSections)) as unknown as GameConfig;

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
 * What reading a save takes (`deserialise`, `validate`): the content and the modules, and no config,
 * since the game's own is in the save and `playDeps` makes it the play config (v1.1.6-S7, DL-193).
 */
export type LoadDeps = Pick<EngineDeps, 'content' | 'modules'>;
