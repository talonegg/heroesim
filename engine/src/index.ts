// @heroesim/engine: pure rules, state, generators and engines; imports nothing outside itself.

export * from './actions/action.js';
export {
  dispatch,
  type DispatchAction,
  type DispatchRejection,
  type DispatchRequest,
  type HeroNotOnRoster,
  type HeroUnavailable,
  type PartySize,
  type QuestNotOffered,
  type RequirementUnmet,
  type Unavailability,
} from './actions/dispatch.js';
export { rebase, type RebaseAction, type RebaseRejection } from './actions/rebase.js';
export {
  recruit,
  type GuildFoldedRejection,
  type HeroNotUnattachedRejection,
  type InsufficientWealthRejection,
  type RecruitAction,
  type RecruitRejection,
} from './actions/recruit.js';
export * from './actions/result.js';
export * from './advance.js';
export * from './config.js';
export * from './content-types.js';
export * from './create.js';
export * from './document.js';
export * from './events.js';
export { generateGuild, type GeneratedGuild, type GuildOptions } from './generators/guilds.js';
export { generateHero, type GeneratedHero, type HeroOptions } from './generators/heroes.js';
export { generatePatron, type GeneratedPatron, type PatronOptions } from './generators/patrons.js';
export { generateQuest, templatesFor, type GeneratedQuest, type QuestOptions } from './generators/quests.js';
export * from './history.js';
export * from './json-safe.js';
export * from './selectors.js';
export * from './serialise.js';
export * from './time.js';
export * from './validate.js';
// A stream's state type stays inside the engine: nothing reaches it except through `world.rng`.
export { streamNames, type StreamName } from './rng.js';
