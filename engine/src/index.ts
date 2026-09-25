// @heroesim/engine: pure rules, state, generators and engines; imports nothing outside itself.

export * from './config.js';
export * from './content-types.js';
export * from './create.js';
export * from './document.js';
export * from './events.js';
export { generateGuild, type GeneratedGuild, type GuildOptions } from './generators/guilds.js';
export { generateHero, type GeneratedHero, type HeroOptions } from './generators/heroes.js';
export { generatePatron, type GeneratedPatron, type PatronOptions } from './generators/patrons.js';
export * from './history.js';
export * from './json-safe.js';
// A stream's state type stays inside the engine: nothing reaches it except through `world.rng`.
export { streamNames, type StreamName } from './rng.js';
