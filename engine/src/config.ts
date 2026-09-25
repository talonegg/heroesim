// Every tunable is a `GameConfig` field with its default in `defaultConfig` (principle 8): a
// literal balance number in rules code is a defect. Rules read `deps.config`, never
// `meta.config` (data-model §2). A front end passes `{ ...defaultConfig, ...meta.config }`, so a
// loaded game plays under the rules it started with and a field its save predates reads as the
// current default; the harness passes its own; `rebase` adopts the current defaults (M2-S1).
//
// Each story adds the fields it introduces: M1-S1 the document's clock and the two versions;
// M1-S5 and M1-S6 the starting world (DL-19). Every "Min/Max" pair is an inclusive range drawn
// with `int`.

import type { ContentSet } from './content-types.js';
import type { ModuleId } from './document.js';

export interface GameConfig {
  /** The World State schema this engine writes as `meta.version`; a load compares the two (M1-S8). */
  schemaVersion: number;
  /**
   * Raised, with a decision-log entry, whenever a default in `defaultConfig` changes; `rebase`
   * records the old and the new (data-model §2, pre-M0 review D1).
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
  /** Wealth deducted per Level of each living Hero on the Roster, each Upkeep. */
  wagePerLevel: number;
  /** Wealth deducted per grade of each Hall facility, summed, each Upkeep. */
  hallMaintenancePerGrade: number;
  /** Wealth below this sets `belowFloorSince`; at or above it, `belowFloorSince` is cleared. */
  bankruptcyFloor: number;
  /** Days a Guild may stay below `bankruptcyFloor` before the Bankruptcy ending (read by M2-S10). */
  bankruptcyGraceDays: number;
  /** Fame never falls below this (pre-M0 review D10.3: an explicit floor, not negative Fame). */
  fameFloor: number;
}

export const defaultConfig: Readonly<GameConfig> = Object.freeze({
  schemaVersion: 1,
  configVersion: 1,
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
  wagePerLevel: 5,
  hallMaintenancePerGrade: 10,
  bankruptcyFloor: 0,
  bankruptcyGraceDays: 30,
  fameFloor: 0,
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
