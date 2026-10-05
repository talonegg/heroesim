// @heroesim/words: the words the CLI, the page and the tools share (v1.1.6-S11, DL-186 item 1), so
// that the copies that drifted ("an offer" and "an Offer") are one. It runs in a browser as well as on
// Node: it imports the engine's types and values by name and nothing else of ours, no Node built-in and
// no React (eslint.config.js, `src/imports.test.ts`). Words only; no rule: every reason, band and
// effect it words is the engine's.
//
// The shared tables are here; the narration, behind a Namer seam that fills each name for the CLI or
// the page, joins them in v1.1.6-S12.

export { gearUnavailableWords, unavailableChipWords, unavailableWords } from './availability.js';
export {
  consumableEffectWords,
  itemEffectWords,
  kindOf,
  kindWords,
  modifierWords,
  traitEffectWords,
  type EffectNames,
} from './effects.js';
export { capitalised, listed, nameIn, signed } from './names.js';
export {
  chanceWords,
  encounterReadings,
  queryWords,
  readsAsOne,
  shownPercent,
  type EncounterReading,
  type QueryNames,
} from './query.js';
export { readableSeed, type Random } from './seed.js';
