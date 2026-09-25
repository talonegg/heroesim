// Time as the rules and the front ends read it (data-model §3.1, rule 1). The World State stores
// the absolute Turn, and each Hero's and Guildmaster's age when they entered the world; every
// other measure of time is derived here, so no front end does the arithmetic itself.
//
// Day, time of day and Year count from 0, as the Turn does: Turn 0 is the morning of Day 0 in
// Year 0 (DL-24). M1-S9 added `ageOf`, the first reader; M2-S1 adds the rest.

import type { GameConfig } from './config.js';
import type { Hero, Quest, Turn } from './document.js';

/** The three Turns of a Day, in order (`CONTEXT.md`, Day). */
export const timesOfDay = ['morning', 'afternoon', 'night'] as const;

export type TimeOfDay = (typeof timesOfDay)[number];

/**
 * Turns in a Day, one per time of day: a fact of the calendar rather than a balance number, so it
 * is not a `GameConfig` field. The length of a year in Turns is (`turnsPerYear`).
 */
export const turnsPerDay = timesOfDay.length;

/** The Day `turn` falls in: Turns 0–2 are Day 0, Turns 3–5 Day 1. */
export function dayOf(turn: Turn): number {
  checkWhole('Turn', turn);
  return Math.floor(turn / turnsPerDay);
}

/** Whether `turn` is a morning, an afternoon or a night: Turn 0 is a morning. */
export function timeOfDay(turn: Turn): TimeOfDay {
  checkWhole('Turn', turn);
  return timesOfDay[turn % turnsPerDay] as TimeOfDay;
}

/** The Year `turn` falls in, a year being `config.turnsPerYear` Turns: Turn 0 is in Year 0. */
export function yearOf(turn: Turn, config: Pick<GameConfig, 'turnsPerYear'>): number {
  checkWhole('Turn', turn);
  return Math.floor(turn / config.turnsPerYear);
}

/**
 * The night Turn of Day `day`: the Turn a Party returns on and its Quest resolves (data-model
 * §3.2, pre-M0 review C4). `nightOf(dayOf(turn) + days)` is the night `days` Days after `turn`'s
 * Day, whichever Turn of its Day `turn` is.
 */
export function nightOf(day: number): Turn {
  checkWhole('Day', day);
  return day * turnsPerDay + timesOfDay.indexOf('night');
}

/**
 * How many Days a Quest lasts. A Quest stores `durationTurns`, its template's Days times three
 * (data-model §3.2, pre-M0 review C4), so this is a whole number; one that is not, which only a
 * hand-made row could hold, counts a part-Day as a Day.
 */
export function durationDaysOf(quest: Pick<Quest, 'durationTurns'>): number {
  checkWhole('duration in Turns', quest.durationTurns);
  return Math.ceil(quest.durationTurns / turnsPerDay);
}

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

/** Throws unless `value` is a whole number from 0, as every Turn and Day is. */
function checkWhole(what: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`A ${what} is a whole number from 0; got ${value}`);
  }
}
