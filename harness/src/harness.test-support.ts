// What the harness's tests share: the core content under the default config, the short game most of
// them play, a clock whose readings are known, a game's counters read and an observer of one counter.

import { loadContent } from '@heroesim/content/node';
import { defaultConfig, type EngineDeps, type WorldDocument } from '@heroesim/engine';
import { counterOf, readCounters, type Counter, type Gatherer } from './counter.js';
import type { GameCounters, GameObservations, RivalAfternoons } from './counters.js';
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

/**
 * Every counter a finished game's History gives (`Counter.read`), by key, as `recordGame` reads them
 * into a game's record (`readCounters`, DL-239): with the play loop's sight of the player's Quests'
 * difficulties (DL-62) and of the Rivals' afternoons (DL-69) when a test gives them, else none.
 */
export function countGame(
  document: WorldDocument,
  deps: EngineDeps,
  playerQuestDifficulty?: ReadonlyMap<string, number>,
  afternoons?: RivalAfternoons,
  counters: readonly Counter[] = gameCounters,
): GameCounters {
  const seen = { ...(playerQuestDifficulty === undefined ? {} : { playerQuestDifficulty }), ...(afternoons === undefined ? {} : { afternoons }) };
  return readCounters(counters, document, deps, seen) as unknown as GameCounters;
}

/** A new observer of the core's counter `key`, gathered from the World State as a game is played (DL-239). */
export function observerOf<K extends keyof GameObservations>(key: K): Gatherer<GameObservations[K]> {
  const observe = counterOf(gameCounters, key)?.observe;
  if (observe === undefined) throw new Error(`No counter ${key} is observed`);
  return observe() as Gatherer<GameObservations[K]>;
}
