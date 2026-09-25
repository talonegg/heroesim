// Time as the rules and the front ends read it (data-model §3.1, rule 1). The World State stores
// the absolute Turn, and each Hero's and Guildmaster's age when they entered the world; every
// other measure of time is derived here, so no front end does the arithmetic itself.
//
// M1-S9 adds `ageOf`, the first reader; M2-S1 adds `dayOf`, `timeOfDay` and `yearOf` beside it.

import type { GameConfig } from './config.js';
import type { Hero, Turn } from './document.js';

/** Anyone with an age: a Hero or a Guildmaster, who store it the same way. */
export type Aged = Pick<Hero, 'ageAtEntry' | 'enteredTurn'>;

/**
 * A Hero's or Guildmaster's age at `turn` in whole years: their age at entry plus the years
 * completed since, a year being `config.turnsPerYear` Turns (data-model §3.2). The age rises on
 * the Turn a year completes. Throws on a Turn before the person entered the world, where they
 * have no age.
 */
export function ageOf(person: Aged, turn: Turn, config: Pick<GameConfig, 'turnsPerYear'>): number {
  const elapsed = turn - person.enteredTurn;
  if (elapsed < 0) {
    throw new RangeError(`No age at Turn ${turn}: they entered the world on Turn ${person.enteredTurn}`);
  }
  return person.ageAtEntry + Math.floor(elapsed / config.turnsPerYear);
}
