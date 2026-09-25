// Every tunable is a `GameConfig` field with its default in `defaultConfig` (principle 8): a
// literal balance number in rules code is a defect. Rules read `deps.config`, never
// `meta.config` (data-model §2). A front end passes `{ ...defaultConfig, ...meta.config }`, so a
// loaded game plays under the rules it started with and a field its save predates reads as the
// current default; the harness passes its own; `rebase` adopts the current defaults (M2-S1).
//
// Each story adds the fields it introduces. M1-S1 has no rules yet, only the document's clock
// and the two versions.

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
}

export const defaultConfig: Readonly<GameConfig> = Object.freeze({
  schemaVersion: 1,
  configVersion: 1,
  turnsPerYear: 1080,
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
