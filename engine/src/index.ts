// @heroesim/engine: pure rules, state, generators and engines; imports nothing outside itself.
//
// Its values are what the other packages' production code uses, with the module seam's error and
// tables (v1.1.6-S8, DL-186 item 9): the mutators and the engine's own helpers are not exported, and
// what only tests take is `@heroesim/engine/testing` (testing.ts). Every type stays, but the hidden
// generators' options and results. `export *` stays for the events' types and for modules whose every
// value a caller uses; testing.test.ts holds the entry to this. Content's vocabulary is its own entry,
// `@heroesim/engine/content` (content.ts, DL-243): this one names the content types and lists the
// front ends and the harness take, and testing.test.ts holds it to them.

export {
  applyAction,
  applyActions,
  type Action,
  type ActionListResult,
  type ActionKind,
  type ActionRejection,
  type GuildAction,
  type GuildActionRejection,
  type RejectionOf,
} from './actions/action.js';
export type {
  BuildAction,
  BuildGuildFolded,
  BuildInsufficientWealth,
  BuildRejection,
  BuildRequest,
  MaxGrade,
} from './actions/build.js';
export type {
  BuyAction,
  BuyGuildFolded,
  BuyInsufficientQuantity,
  BuyInsufficientWealth,
  BuyRejection,
  BuyRequest,
  NotInMarket,
} from './actions/buy.js';
export type {
  NameCaptainAction,
  NameCaptainAlreadyCaptain,
  NameCaptainGuildFolded,
  NameCaptainHeroNotOnRoster,
  NameCaptainLocked,
  NameCaptainRejection,
} from './actions/captain.js';
export {
  fameRefusal,
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
  type FameBelowMinimum,
  type HeroNotOnRoster,
  type HeroUnavailable,
  type QuestNotOffered,
  type RequirementKind,
  type RequirementUnmet,
  type Unavailability,
  type UnmetRequirement,
} from './actions/dispatch.js';
export type {
  EquipAction,
  EquipGuildFolded,
  EquipHeroNotOnRoster,
  EquipHeroUnavailable,
  EquipRejection,
  EquipRequest,
  GearRef,
  NotGear,
  NotHeldByGuild,
  SlotEmpty,
  SlotOccupied,
  UnequipAction,
  UnequipGuildFolded,
  UnequipHeroNotOnRoster,
  UnequipHeroUnavailable,
  UnequipRejection,
  UnequipRequest,
  WrongSlot,
} from './actions/equip.js';
export { newRules, type RebaseAction, type RebaseRejection } from './actions/rebase.js';
export type {
  GuildFoldedRejection,
  HeroNotUnattachedRejection,
  InsufficientWealthRejection,
  RecruitAction,
  RecruitRejection,
  SigningRefusedRejection,
} from './actions/recruit.js';
export type { RenewAction, RenewHeroInParty, RenewHeroNotOnRoster, RenewRejection } from './actions/renew.js';
export type { ActionResult, Rejection, WorldActionResult } from './actions/result.js';
export type {
  SellAction,
  SellEquipped,
  SellGuildFolded,
  SellInsufficientQuantity,
  SellItemAction,
  SellNotHeldByGuild,
  SellRejection,
  SellRequest,
  SellStackAction,
  SellUnknownItem,
} from './actions/sell.js';
export type {
  AcceptTransferAction,
  AcceptTransferRejection,
  DeclineTransferAction,
  DeclineTransferRejection,
  NoOfferNeeded,
  OfferNotFound,
  OfferPending,
  OfferTransferAction,
  OfferTransferRejection,
  TransferAction,
  TransferGuildFolded,
  TransferHeroInParty,
  TransferHeroNotOnRoster,
  TransferInAction,
  TransferInRejection,
  TransferInsufficientWealth,
  TransferOutAction,
  TransferOutRejection,
  TransferRefused,
  TransferRejection,
  TransferSameGuild,
} from './actions/transfer.js';
export * from './advance.js';
export {
  configVersion,
  defaultConfig,
  flattenConfig,
  moraleBandNames,
  questBands,
  regardBandNames,
  type ChanceBand,
  type EngineDeps,
  type FatigueBand,
  type GameConfig,
  type LoadDeps,
  type MoraleBand,
  type PotentialHint,
  type QuestBand,
  type RegardBand,
} from './config.js';
export { checkConfig, playConfig, playDeps, type ConfigProblem, type ConfigRule, type UnsoundConfig } from './config-check.js';
export {
  classIcons,
  degrees,
  encounterKinds,
  gearSlotKeys,
  isClassIcon,
  type BackgroundKey,
  type CheckKey,
  type ClassIcon,
  type ClassKey,
  type Consequence,
  type ConsumableEffectKind,
  type ContentSet,
  type Degree,
  type Encounter,
  type EncounterCheck,
  type EncounterKind,
  type FacilityKey,
  type GuildmasterTrait,
  type InjuryTypeKey,
  type ItemDefinition,
  type ItemDefinitionKey,
  type NumQuery,
  type PassFormula,
  type PortraitAppearance,
  type PortraitKey,
  type PortraitRole,
  type QuestTemplate,
  type QuestTemplateKey,
  type SlotKey,
  type StatKey,
  type Synergy,
  type TraitKey,
} from './content-types.js';
export { availableHeroes, bestParties, partyPool, restBandOf, type BestParties, type BestParty } from './best-party.js';
export {
  type TransferAnswer,
  type TransferRefusalReason,
  type TransferSide,
} from './controllers/rival.js';
export { captainChoice, captainLock, type CaptainLock } from './captain.js';
export { classComparator } from './class-order.js';
export { contractWage, type LengthNotOffered } from './contract.js';
export { consumablePurchase, consumablesToCarry, type Carry, type ConsumableKeeping } from './consumable-choices.js';
export { surplusChoices, type SurplusKeeping } from './surplus.js';
export * from './create.js';
export {
  describeGuildmaster,
  type DescribeRequest,
  type DescriptionFacts,
  type GuildmasterDescription,
  type HeroDescription,
  type HeroFacts,
} from './descriptions.js';
export {
  compareByCodeUnit,
  descriptiveAttributeLabels,
  descriptiveAttributeMaxLength,
  descriptiveAttributes,
  isId,
  parseId,
  schemaVersion,
  type Contract,
  type Controller,
  type DescriptiveAttribute,
  type Ending,
  type EndingReason,
  type EntityId,
  type Entry,
  type EventType,
  type Guild,
  type GuildId,
  type Guildmaster,
  type GuildmasterId,
  type Hall,
  type Hero,
  type HeroId,
  type History,
  type Holder,
  type HolderKind,
  type IdOf,
  type IdTypes,
  type Injury,
  type ItemId,
  type Meta,
  type ModuleId,
  type OfferId,
  type Party,
  type PartyId,
  type Patron,
  type PatronId,
  type Quest,
  type QuestId,
  type QuestRequirements,
  type QuestStatus,
  type RegardEntry,
  type RegardMap,
  type Sex,
  type SkillRating,
  type Stack,
  type StackId,
  type StatValues,
  type TableName,
  type TransferOffer,
  type Turn,
  type UniqueItem,
  type World,
  type WorldDocument,
} from './document.js';
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
export { carriedGear, gearChoices, gearPurchase, type GearUnavailability } from './gear.js';
export {
  guildmasterOf,
  guildmasterStatKeys,
  guildmasterStatsOf,
  guildmasterTraitsOf,
  judgedHintBands,
  type GuildmasterContent,
  type GuildmasterRule,
  type GuildmasterTraits,
} from './guildmaster.js';
export { sexes } from './generators/draw.js';
export {
  callingClashes,
  portraitRowOf,
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
export { generateQuest, type GeneratedQuest, type QuestOptions } from './generators/quests.js';
export { relationship, relationshipBandCounts, type HeroRegardContext } from './hero-regard.js';
export { entriesBetween, entriesFor, type HistoryPage } from './history.js';
export { nightsReturnOf, returnOf, type ReturnKey, type ReturnRecord } from './returns.js';
export { addStack, holdings, itemDefinition, type HolderQuery, type Holdings } from './items.js';
export type { JsonUnsafe, JsonUnsafeKind, JsonValue } from './json-safe.js';
export { marketStock, sellPrice, type MarketListing } from './market.js';
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
  probe,
  type ProbeEffectOutcome,
  type ProbeFired,
  type ProbeFiredPayload,
  type ProbeSlice,
  type ProbeTunables,
} from './modules/probe.js';
export type { ReadonlyDeep } from './read-only.js';
export {
  guildmasterRegardForGuild,
  patronRegardFor,
  regardBand,
  regardBandCounts,
  regardValue,
  type RegardChange,
  type RegardConfig,
  type RegardContext,
  type ResolvedForRegard,
} from './regard.js';
export { facilityGrade, facilityUpkeep, topGrade } from './facilities.js';
export { fatigueBand } from './fatigue.js';
export { moraleBand } from './morale.js';
export { potentialHint } from './potential.js';
export * from './preview.js';
export { capability, type CheckDeps, type CheckResult, type EncounterOutcome, type FormDecided } from './quest-engine/check.js';
export {
  describeQuery,
  type HeroAccount,
  type PredAccount,
  type QueryAccount,
  type SetAccount,
  type ValAccount,
} from './quest-engine/describe.js';
export {
  chanceToReach,
  estimateQuest,
  type CheckEstimate,
  type DegreeChances,
  type EncounterEstimate,
  type QuestEstimate,
} from './quest-engine/estimate.js';
export { relievesHurt, type FormConfig, type FormEffect } from './quest-engine/form.js';
export type { ConsumableUse, Kit } from './quest-engine/consumables.js';
export { passDegree, passOf, type Decided } from './quest-engine/degree.js';
export {
  resolveQuest,
  type CheckRoll,
  type EncounterResult,
  type QuestInjury,
  type QuestOutcome,
  type Resolution,
} from './quest-engine/resolve.js';
export { queryParty, type OnQuest, type QueryContent, type QueryMember, type QueryParty } from './quest-engine/query.js';
export {
  affordableImprovement,
  bankruptcyCountdown,
  baseStat,
  cheapestUnattached,
  dispositionOf,
  effectiveStats,
  hallUpkeepParts,
  hallUpkeepSplit,
  nextHallUpkeepDay,
  nextImprovement,
  nextWagesDay,
  offeredQuests,
  playerGuild,
  rankingPlaces,
  rankings,
  signingFee,
  signingRefusal,
  statBreakdown,
  transferFee,
  unattachedHeroes,
  unsignableHeroes,
  upkeep,
  wages,
  type BankruptcyCountdown,
  type HallUpkeepParts,
  type Hire,
  type Ranking,
  type RankingMeasure,
  type RankingPlace,
  type SigningRefusal,
  type StatBreakdown,
  type StatParts,
  type StatSource,
} from './selectors.js';
export { deserialise, serialise, type LoadRefusal, type LoadResult, type Migration, type SavedDocument } from './serialise.js';
export type { ModuleStopReason, PlayedTurn, StopCondition, StopReason, StopReasonKind } from './stops.js';
export { ageOf, dayOf, durationDaysOf, retirementTurn, retiresOn, timeOfDay, turnsPerDay, yearOf, type Aged, type TimeOfDay } from './time.js';
export { bestFourLevel, boardTopTier, difficultyBand, isDeadly, offeredTiers, tierFigures, unlockedTier } from './tiers.js';
export { traitOf, type BonusTarget, type HeroTraitContent, type TraitContent } from './traits.js';
export { offersTo } from './transfer.js';
export {
  validate,
  type RefusalCheck,
  type ValidateOptions,
  type ValidationFailure,
  type ValidationResult,
  type ValidationWarning,
  type WarningCheck,
} from './validate.js';
export { copyWorld, writeOnce } from './world-copy.js';
// A stream's state type stays inside the engine: nothing reaches it except through `world.rng`.
export type { StreamName } from './rng.js';
