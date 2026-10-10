// What the harness's tests share: the core content under the default config, the short game most of
// them play, a clock whose readings are known, and an observer of one counter.

import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps } from '@heroesim/engine';
import { counterOf, type Gatherer } from './counter.js';
import type { GameObservations } from './counters.js';
import { gameCounters } from './game-counters.js';

/** The content the game ships. */
export const content = loadContent();

/** The core content under the default config, as a front end plays it. */
export const coreDeps: EngineDeps = { config: { ...defaultConfig }, content };

/** Twenty Days, in years of the default config: long enough for Parties to leave and come home, and short for `npm test`. */
export const twentyDays = 60 / defaultConfig.turnsPerYear;

/** A clock that advances one millisecond a read, so timings are known. */
export function tickingClock(): () => number {
  let t = 0;
  return () => (t += 1);
}

/** A new observer of the core's counter `key`, gathered from the World State as a game is played (DL-239). */
export function observerOf<K extends keyof GameObservations>(key: K): Gatherer<GameObservations[K]> {
  const observe = counterOf(gameCounters, key)?.observe;
  if (observe === undefined) throw new Error(`No counter ${key} is observed`);
  return observe() as Gatherer<GameObservations[K]>;
}
