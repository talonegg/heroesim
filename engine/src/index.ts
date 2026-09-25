// @heroesim/engine: pure rules, state, generators and engines; imports nothing outside itself.

export * from './config.js';
export * from './content-types.js';
export * from './document.js';
export * from './json-safe.js';
// A stream's state type stays inside the engine: nothing reaches it except through `world.rng`.
export { streamNames, type StreamName } from './rng.js';
