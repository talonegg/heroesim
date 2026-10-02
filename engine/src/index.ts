// @heroesim/engine: pure rules, state, generators and engines; imports nothing outside itself.

export * from './actions/action.js';
export {
  applyBuild,
  build,
  type BuildAction,
  type BuildGuildFolded,
  type BuildInsufficientWealth,
  type BuildRejection,
  type BuildRequest,
  type MaxGrade,
} from './actions/build.js';
export {
  applyBuy,
  buy,
  type BuyAction,
  type BuyGuildFolded,
  type BuyInsufficientQuantity,
  type BuyInsufficientWealth,
  type BuyRejection,
  type BuyRequest,
  type NotInMarket,
} from './actions/buy.js';
export {
  applyDispatch,
  dispatch,
  dispatchRefusal,
  unavailability,
  unmetRequirements,
  type ConsumableRequest,
  type DispatchAction,
  type DispatchGuildFolded,
  type DispatchInsufficientQuantity,
  type DispatchNotConsumable,
  type DispatchNotHeldByGuild,
  type DispatchRejection,
  type DispatchRequest,
  type HeroNotOnRoster,
  type HeroUnavailable,
  type QuestNotOffered,
  type RequirementKind,
  type RequirementUnmet,
  type UnmetRequirement,
  type Unavailability,
} from './actions/dispatch.js';
export {
  applyEquip,
  applyUnequip,
  equip,
  unequip,
  type EquipAction,
  type EquipGuildFolded,
  type EquipHeroNotOnRoster,
  type EquipHeroUnavailable,
  type EquipRejection,
  type EquipRequest,
  type GearRef,
  type NotGear,
  type NotHeldByGuild,
  type SlotEmpty,
  type SlotOccupied,
  type UnequipAction,
  type UnequipGuildFolded,
  type UnequipHeroNotOnRoster,
  type UnequipHeroUnavailable,
  type UnequipRejection,
  type UnequipRequest,
  type WrongSlot,
} from './actions/equip.js';
export { newRules, rebase, type RebaseAction, type RebaseRejection } from './actions/rebase.js';
export {
  applyRecruit,
  recruit,
  type GuildFoldedRejection,
  type HeroNotUnattachedRejection,
  type InsufficientWealthRejection,
  type RecruitAction,
  type RecruitRejection,
  type SigningRefusedRejection,
} from './actions/recruit.js';
export * from './actions/result.js';
export {
  applySell,
  sell,
  type SellAction,
  type SellEquipped,
  type SellGuildFolded,
  type SellInsufficientQuantity,
  type SellItemAction,
  type SellNotHeldByGuild,
  type SellRejection,
  type SellRequest,
  type SellStackAction,
  type SellUnknownItem,
} from './actions/sell.js';
export {
  acceptTransfer,
  applyAcceptTransfer,
  applyDeclineTransfer,
  applyOfferTransfer,
  applyTransferIn,
  applyTransferOut,
  declineTransfer,
  offerTransfer,
  transferIn,
  transferOut,
  type AcceptTransferAction,
  type AcceptTransferRejection,
  type DeclineTransferAction,
  type DeclineTransferRejection,
  type NoOfferNeeded,
  type OfferNotFound,
  type OfferPending,
  type OfferTransferAction,
  type OfferTransferRejection,
  type TransferAction,
  type TransferGuildFolded,
  type TransferHeroInParty,
  type TransferHeroNotOnRoster,
  type TransferInAction,
  type TransferInRejection,
  type TransferInsufficientWealth,
  type TransferOutAction,
  type TransferOutRejection,
  type TransferRefused,
  type TransferRejection,
  type TransferSameGuild,
} from './actions/transfer.js';
export * from './advance.js';
export * from './config.js';
export * from './content-types.js';
export {
  availableHeroes,
  bestParty,
  partyFor,
  rivalChoices,
  staffableQuests,
  transferAnswer,
  type BestParty,
  type TransferAnswer,
  type TransferRefusalReason,
  type TransferSide,
} from './controllers/rival.js';
export * from './create.js';
export {
  biographyTraitSentences,
  describeGuildmaster,
  describeHero,
  heroBiographyTraitSentences,
  heroDescriptionDraws,
  heroDescriptionsStream,
  type DescribeRequest,
  type DescriptionFacts,
  type GuildmasterDescription,
  type HeroDescription,
  type HeroFacts,
} from './descriptions.js';
export * from './document.js';
export {
  moduleEffectKinds,
  type AdjustMorale,
  type AdjustRegard,
  type AdjustWealth,
  type EffectRejection,
  type EffectResult,
  type Injure,
  type ModuleEffect,
  type ModuleEffectKind,
  type ModuleEffects,
  type OfferQuest,
} from './effects.js';
export type { ModuleEmit, ModuleEventDraft } from './emit.js';
export * from './events.js';
export * from './fast-forward.js';
export * from './gear.js';
export * from './guildmaster.js';
export {
  dealtDisposition,
  generateGuild,
  generateRival,
  type GeneratedGuild,
  type GuildOptions,
  type RivalOptions,
} from './generators/guilds.js';
export { sexes } from './generators/draw.js';
export {
  ageIntoPortrait,
  ageSpanOf,
  callingClashes,
  choosePortrait,
  guildmasterPortraitsInUse,
  heroPortraitsInUse,
  heroPortraitsStream,
  portraitNotes,
  portraitRowOf,
  portraitSexOf,
  portraitsOf,
  type AgeSpan,
  type CallingClash,
  type ChosenRole,
  type PortraitNote,
  type PortraitPerson,
} from './portraits.js';
export { generateHero, type GeneratedHero, type HeroOptions } from './generators/heroes.js';
// A Level's growth, for the harness's calibration (v1.1.4-S9, DL-162), which raises a generated Hero
// to a Level as the `levelUps` phase would.
export { growOneLevel, type Growth } from './progression.js';
export { generatePatron, type GeneratedPatron, type PatronOptions } from './generators/patrons.js';
export { generateQuest, templatesFor, type GeneratedQuest, type QuestOptions } from './generators/quests.js';
export * from './hero-regard.js';
export * from './history.js';
export * from './items.js';
export * from './json-safe.js';
export * from './market.js';
export {
  hookNames,
  ModuleError,
  type HookName,
  type Module,
  type ModuleContext,
  type ModuleRandom,
  type ModuleResult,
  type ModuleSelectors,
  type ReadonlyWorld,
  type SliceContext,
  type SliceFailure,
} from './modules.js';
// The probe module (M8-S3, DL-78) is test-only: for tests, the harness (`HEROESIM_MODULES=probe`)
// and the front ends' test-only switches, never installed by default or by a front end on its own.
export {
  createProbe,
  probe,
  probeDefaults,
  probeId,
  probeSliceFailures,
  probeSliceVersion,
  type ProbeEffectOutcome,
  type ProbeFired,
  type ProbeFiredPayload,
  type ProbeSlice,
  type ProbeTunables,
} from './modules/probe.js';
export type { ReadonlyDeep } from './read-only.js';
export * from './regard.js';
export { moraleBand, moraleBaselineFor } from './morale.js';
export { potentialHint } from './potential.js';
export * from './preview.js';
export { capability, check, targetOf, type CheckDeps, type CheckResult, type EncounterOutcome, type FormDecided } from './quest-engine/check.js';
export {
  describeQuery,
  statsIn,
  type HeroAccount,
  type PredAccount,
  type QueryAccount,
  type SetAccount,
  type ValAccount,
} from './quest-engine/describe.js';
export {
  chanceBand,
  chanceToReach,
  estimateQuest,
  questEstimator,
  type CheckEstimate,
  type DegreeChances,
  type EncounterEstimate,
  type QuestEstimate,
} from './quest-engine/estimate.js';
export { formEffect, formEffects, formOf, meanForm, workingMorale, type FormConfig, type FormEffect } from './quest-engine/form.js';
export { expendUsed, kitOf, sendHome, type ConsumableUse, type Kit } from './quest-engine/consumables.js';
export { degreeOf, passDegree, passOf, succeeded, type Decided } from './quest-engine/degree.js';
export { encounterCount, sequenceFor, storedSequence } from './quest-engine/encounters.js';
export { teamwork } from './quest-engine/teamwork.js';
export {
  questBand,
  resolveQuest,
  type CheckRoll,
  type EncounterResult,
  type QuestInjury,
  type QuestOutcome,
  type Resolution,
} from './quest-engine/resolve.js';
export {
  evaluate,
  heroOf,
  holds,
  is,
  membersOf,
  queryParty,
  valueOf,
  type QueryContent,
  type OnQuest,
  type QueryMember,
  type QueryParty,
} from './quest-engine/query.js';
export { appliesOn, meetsRequirement, synergiesFor, synergiesOn, synergyBonus } from './quest-engine/synergy.js';
export * from './selectors.js';
export * from './serialise.js';
export * from './stops.js';
export * from './time.js';
export * from './traits.js';
export {
  offerExpiresBy,
  offerExpiresOnTurn,
  offersTo,
  pendingOffers,
} from './transfer.js';
export * from './validate.js';
// A stream's state type stays inside the engine: nothing reaches it except through `world.rng`.
export { streamNames, type StreamName } from './rng.js';
