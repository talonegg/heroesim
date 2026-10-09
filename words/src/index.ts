// @heroesim/words: the words the CLI, the page and the tools share (DL-186 item 1, DL-197), so that
// one thing reads one way in both ("an Offer", never "an offer"). It runs in a browser as well as on
// Node: it imports the engine's types and values by name and nothing else of ours, no Node built-in and
// no React (eslint.config.js, `src/imports.test.ts`). Words only; no rule: every reason, band and
// effect it words is the engine's.
//
// It holds the shared tables (DL-197); the narration, behind a Namer seam that fills each name for the
// CLI or the page, why time stopped among it (DL-198, DL-209); the Quest review's page, which the
// harness and the tools may read (DL-198); a Stat's breakdown, the engine's `statBreakdown`, in words
// (DL-199); a date as a player reads it, `Year 2 Day 45`, the Year and the Day counted from 1
// (DL-210); every refusal a play can meet, behind the same Namer seam (DL-240); and the readings of a
// Hero, a Quest and a pool or Roster row, through the player's reading (DL-241).

export { atHallWords, gearUnavailableWords, unavailableChipWords, unavailableWords } from './availability.js';
export {
  calendarOf,
  dateOfDay,
  dateOfTurn,
  fileDateOfTurn,
  nightOfDay,
  nightOfTurn,
  whenOfTurn,
  type Calendar,
  type CalendarDate,
} from './calendar.js';
export {
  consumableEffectWords,
  itemEffectWords,
  kindOf,
  kindWords,
  modifierWords,
  traitEffectWords,
  type EffectNames,
} from './effects.js';
export { capitalised, listed, nameIn, rowOf, signed } from './names.js';
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
  resolvedParts,
  sentenceText,
  type CommandSlot,
  type DateSlot,
  type EntrySlot,
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
export {
  bestPartyReading,
  boardReading,
  heroReading,
  heroSkills,
  heroTraits,
  playerReading,
  poolNote,
  poolReading,
  questReading,
  rosterReading,
  signsWords,
  type BestPartyReading,
  type GearReading,
  type HeroReading,
  type HeroRow,
  type PlayerReading,
  type PoolRowReading,
  type QuestReading,
  type RelationshipReading,
  type RosterRowReading,
  type Signs,
  type StatReading,
} from './readings.js';
export {
  endedSentence,
  refusalKind,
  refusalKinds,
  refusalSentence,
  requirementWords,
  type GameEnded,
  type NewGameRejection,
  type NoPlayerGuild,
  type Refusal,
  type RefusalKind,
  type RefusalSetting,
} from './refusals.js';
export { readableSeed, type Random } from './seed.js';
export { statPartsWords, statSourcesMoving, statSourceWords } from './stats.js';
