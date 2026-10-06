// @heroesim/words: the words the CLI, the page and the tools share (v1.1.6-S11, DL-186 item 1), so
// that the copies that drifted ("an offer" and "an Offer") are one. It runs in a browser as well as on
// Node: it imports the engine's types and values by name and nothing else of ours, no Node built-in and
// no React (eslint.config.js, `src/imports.test.ts`). Words only; no rule: every reason, band and
// effect it words is the engine's.
//
// The shared tables came in v1.1.6-S11; the narration, behind a Namer seam that fills each name for
// the CLI or the page, and the Quest review's page, which the harness and the tools may read, in
// v1.1.6-S12. A Stat's breakdown, the engine's `statBreakdown`, in words in v1.1.6-S13.

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
  crossed,
  degreeWords,
  endingWords,
  facilityIs,
  facilityNames,
  itemsWords,
  narrate,
  narrateStop,
  narratedTypes,
  nightOf,
  resolvedParts,
  sentenceText,
  type CommandSlot,
  type IdsSlot,
  type NameSlot,
  type Namer,
  type OfferSlot,
  type PartiesSlot,
  type Part,
  type PartySlot,
  type QuestSlot,
  type Sentence,
  type Slot,
} from './narrate.js';
export {
  chanceWords,
  encounterReadings,
  queryWords,
  readsAsOne,
  shownPercent,
  type EncounterReading,
  type QueryNames,
} from './query.js';
export {
  consequenceWords,
  passWords,
  reviewPage,
  type ReviewCalibration,
  type ReviewCell,
  type ReviewInput,
  type ReviewNotes,
} from './quest-review.js';
export { readableSeed, type Random } from './seed.js';
export { statPartsWords, statSourcesMoving, statSourceWords } from './stats.js';
