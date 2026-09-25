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
  applyDispatch,
  dispatch,
  unavailability,
  unmetRequirements,
  type DispatchAction,
  type DispatchGuildFolded,
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
export { rebase, type RebaseAction, type RebaseRejection } from './actions/rebase.js';
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
export * from './advance.js';
export * from './config.js';
export * from './content-types.js';
export { availableHeroes, partyFor, rivalChoices, staffableQuests, type DispositionRule } from './controllers/rival.js';
export * from './create.js';
export * from './document.js';
export * from './events.js';
export * from './fast-forward.js';
export * from './guildmaster.js';
export { generateGuild, generateRival, type GeneratedGuild, type GuildOptions } from './generators/guilds.js';
export { generateHero, type GeneratedHero, type HeroOptions } from './generators/heroes.js';
export { generatePatron, type GeneratedPatron, type PatronOptions } from './generators/patrons.js';
export { generateQuest, templatesFor, type GeneratedQuest, type QuestOptions } from './generators/quests.js';
export * from './history.js';
export * from './json-safe.js';
export * from './regard.js';
export { moraleBand, moraleBaselineFor } from './morale.js';
export { potentialHint } from './potential.js';
export {
  questBand,
  resolveQuest,
  stubScore,
  type QuestInjury,
  type QuestOutcome,
  type StubDeps,
} from './quest-engine/stub.js';
export * from './selectors.js';
export * from './serialise.js';
export * from './stops.js';
export * from './time.js';
export * from './validate.js';
// A stream's state type stays inside the engine: nothing reaches it except through `world.rng`.
export { streamNames, type StreamName } from './rng.js';
