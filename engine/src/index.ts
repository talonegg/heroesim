/**
 * `@heroesim/engine` — the pure simulation. No files, no output, no clock, no global
 * random (ADR-0001). Every public function takes a Career and returns a new Career with
 * the events that describe what happened; none of them touches its arguments.
 *
 * Solution architecture §6 is the contract this module exports.
 */

/**
 * The package's own name. Kept so a workspace can prove it resolves the engine from
 * source across package boundaries.
 */
export const PACKAGE_NAME = '@heroesim/engine';

// ── The loop ────────────────────────────────────────────────────────────────
export { newCareer } from './world.js';
export {
  advance,
  advanceUntilAttention,
  availableHeroes,
  commissionById,
  commitParty,
  heroById,
  standing,
  REASON_WORK_FINISHED,
  REASON_WORK_NOT_FINISHED,
} from './career.js';
export { REASON_CAME_WITH_THE_GUILD } from './world.js';
export { REASON_PASSED_OVER } from './board.js';

// ── Saves ───────────────────────────────────────────────────────────────────
export { deserialiseCareer, serialiseCareer, SAVE_FORMAT_VERSION } from './save.js';

// ── Content ─────────────────────────────────────────────────────────────────
export { validateContent, NARRATIVE_TOKENS } from './content.js';
export type {
  BackgroundDef,
  CommissionTitleDef,
  Consequence,
  Content,
  HeroSlotRule,
  NamePools,
  SphereDef,
  TraitDef,
  TraitModifier,
  Vignette,
  VignetteConditions,
  VignetteOutcome,
} from './content.js';

// ── Errors ──────────────────────────────────────────────────────────────────
export { ContentError, EngineError, SaveError } from './errors.js';
export type { EngineErrorCode } from './errors.js';

// ── Configuration ───────────────────────────────────────────────────────────
export { clamp, defaultConfig } from './config.js';
export type { GameConfig } from './config.js';

// ── World state ─────────────────────────────────────────────────────────────
export { STATS } from './types.js';
export type {
  BeatResult,
  Career,
  CareerEnd,
  CareerLedger,
  Commission,
  Guild,
  Guildmaster,
  Hero,
  HeroTrait,
  Party,
  Patron,
  Pronouns,
  Reckoning,
  Regard,
  RegardNature,
  Rival,
  Stat,
  Stats,
  Step,
} from './types.js';

// ── Events ──────────────────────────────────────────────────────────────────
export type {
  BeatResolvedEvent,
  BeatSlots,
  BoardRefreshedEvent,
  CareerEndedEvent,
  CareerStartedEvent,
  CoinChangedEvent,
  CoinReason,
  CommissionExpiredEvent,
  CommissionPostedEvent,
  CommissionTakenByRivalEvent,
  ConsequenceAppliedEvent,
  GameEvent,
  GameEventType,
  HeroRegardForGuildmasterChangedEvent,
  PartyCommittedEvent,
  PartyReturnedEvent,
  PatronRegardChangedEvent,
  TraitGainedEvent,
  TraitLiftedEvent,
  UpkeepOwedEvent,
} from './events.js';

// ── Randomness (DL-07) ──────────────────────────────────────────────────────
export type { RngState } from './rng.js';
