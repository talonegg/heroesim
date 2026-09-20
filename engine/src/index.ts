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
  daysUntilBoardRefresh,
  daysUntilUpkeep,
  heroById,
  injuredHeroes,
  proposeParty,
  standing,
  upkeepDue,
  REASON_TIME_PASSED,
  REASON_WORK_FINISHED,
  REASON_WORK_NOT_FINISHED,
} from './career.js';
export { REASON_CAME_WITH_THE_GUILD } from './world.js';
// `postingPatrons` has been in `board.ts` since E1 and is what `refreshBoard` itself asks.
// It is re-exported for the Patrons view, which has to say that a Patron at the floor is
// posting nothing and must not decide for itself where the floor is (E1's data, E7's
// need; the rule DL-18 §1 followed for `unavailableAmong`, recorded in DL-25 §2).
export { postingPatrons, REASON_PASSED_OVER } from './board.js';

// ── Refusals, drift and Departure (E2) ──────────────────────────────────────
export { unavailableAmong } from './refusal.js';
export type {
  PartyProposal,
  Refusal,
  RefusalReason,
  Unavailable,
  UnavailableReason,
} from './refusal.js';
export { REASON_DRIFTED, REASON_INSISTED, REASON_TALKED_ROUND } from './regard.js';

// ── Injuries, Scars, Death, age and the Hall (E3) ───────────────────────────
export { injuryOutcome, REASON_DIED_ON_THE_WORK } from './harm.js';
export type { InjuryOutcome } from './harm.js';
export { REASON_REACHED_THE_END, startingAge } from './age.js';
export { hallCost, improveHall } from './hall.js';
export { injuredUntil, isInjured, isInjuryTrait } from './state.js';

// ── Applicants and recruitment (E4) ─────────────────────────────────────────
export {
  acceptApplicant,
  acceptRefusal,
  applicantById,
  applicantFee,
  applicantInterval,
  applicantOffers,
  calibreOfStats,
  calibreStatBudget,
  declineApplicant,
  maxCalibre,
  REASON_CAME_BACK,
  REASON_TAKEN_ON,
} from './applicant.js';
export type { AcceptRefusal, AcceptRefusalCode, ApplicantOffer } from './applicant.js';

// ── Rivals, Transfers and the League (E5) ───────────────────────────────────
export {
  employerRegard,
  hasRoomForAnother,
  isPoachable,
  league,
  poachFee,
  retaliationRisks,
  rivalById,
  rivalHeroById,
  souredRivals,
  transferFee,
  REASON_BROUGHT_OVER,
  REASON_NEW_TO_THE_GUILD,
  REASON_NOTHING_BETWEEN_YOU,
  REASON_POACHED_FROM_THEM,
  REASON_TOOK_ANOTHER_OFFER,
  REASON_WHO_THEY_WORK_FOR,
} from './rival.js';
export type { RetaliationRisk } from './rival.js';
export {
  moveRefusal,
  poachHero,
  rivalHeroOffer,
  rivalOffers,
  transferHero,
} from './transfer.js';
export type { MoveKind, MoveRefusal, RivalHeroOffer } from './transfer.js';
export { maxCalibreFor, statTotal } from './people.js';

// ── Decisions mid-Commission (E6) ───────────────────────────────────────────
export {
  answerParty,
  awaitingParties,
  decisionById,
  projectedReturn,
  turnBackFee,
  turnBackOutcome,
  wordOffer,
  wordOffers,
} from './decision.js';
export type { TurnBackOutcome, WordOffer, WordOption, WordRefusal } from './decision.js';

// ── Saves ───────────────────────────────────────────────────────────────────
export { deserialiseCareer, serialiseCareer, SAVE_FORMAT_VERSION } from './save.js';

// ── Content ─────────────────────────────────────────────────────────────────
export { validateContent, NARRATIVE_TOKENS } from './content.js';
export type {
  BackgroundDef,
  CommissionTitleDef,
  Consequence,
  Content,
  DecisionDef,
  DecisionEffect,
  DecisionOption,
  DecisionOptionKind,
  DecisionRequires,
  HeroSlotRule,
  NamePools,
  SphereDef,
  TraitDef,
  TraitModifier,
  TraitRefusal,
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
export { dayOfYear, yearOf } from './state.js';
export {
  CALIBRES,
  HALL_IMPROVEMENTS,
  HALL_INFIRMARY,
  HALL_QUARTERS,
  HALL_TRAINING_YARD,
  STATS,
} from './types.js';
export type {
  AnyHero,
  Applicant,
  BeatResult,
  Calibre,
  Career,
  CareerEnd,
  CareerLedger,
  Commission,
  Guild,
  Guildmaster,
  HallImprovement,
  Hero,
  HeroExit,
  HeroExitKind,
  HeroTrait,
  LeagueRow,
  Party,
  Patron,
  PendingWord,
  Pronouns,
  Reckoning,
  Regard,
  RegardNature,
  Rival,
  RivalHero,
  Stat,
  Stats,
  Step,
  TraitKind,
} from './types.js';

// ── Events ──────────────────────────────────────────────────────────────────
export type {
  ApplicantAcceptedEvent,
  ApplicantDeclinedEvent,
  ApplicantsArrivedEvent,
  BeatResolvedEvent,
  BeatSlots,
  BoardRefreshedEvent,
  CareerEndedEvent,
  CareerStartedEvent,
  CoinChangedEvent,
  CoinReason,
  CommissionExpiredEvent,
  CommissionPostedEvent,
  CommissionRefusedEvent,
  CommissionTakenByRivalEvent,
  ConsequenceAppliedEvent,
  GameEvent,
  GameEventType,
  HallImprovedEvent,
  HeroDepartedEvent,
  HeroDiedEvent,
  HeroInjuredEvent,
  HeroJoinedEvent,
  HeroRegardForGuildmasterChangedEvent,
  HeroPoachedEvent,
  HeroRetiredEvent,
  HeroScarredEvent,
  HeroTransferredEvent,
  InjuryLiftedEvent,
  InsistenceAppliedEvent,
  PartyAnsweredEvent,
  PartyAwaitingWordEvent,
  PartyCommittedEvent,
  PartyReturnedEvent,
  PartyTurnedBackEvent,
  PatronRegardChangedEvent,
  RivalPoachedHeroEvent,
  RivalRegardChangedEvent,
  RivalRosterChangedEvent,
  TraitGainedEvent,
  TraitLiftedEvent,
  TransferRefusedEvent,
  TransferRefusedReason,
  UpkeepOwedEvent,
  WordOptionOffered,
} from './events.js';

// ── Randomness (DL-07) ──────────────────────────────────────────────────────
export type { RngState } from './rng.js';
