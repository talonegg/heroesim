// The calendar as a player reads it (DL-206 items 30 to 33, DL-210): "Year Y Day D", the Year from 1
// and the Day of the Year from 1, with no padding; "Year 2 Day 45, afternoon" where the time of day
// shows; "the night of Year 2 Day 45". The engine's Turn, Day and Year count from 0 and the Day never
// resets (DL-24 item 1, `engine/src/time.ts`): every rule reads those, and only these words count
// from 1. A Year holds whole Days (`turnsPerYear` a multiple of the Turns of a Day, DL-206 item 8), so
// a date is the same for each Turn of its Day.

import { dayOf, timeOfDay, turnsPerDay, yearOf, type GameConfig, type TimeOfDay, type Turn } from '@heroesim/engine';

/** What a date reads of the config: the length of a Year. */
export type Calendar = Pick<GameConfig, 'turnsPerYear'>;

/** A date's parts as a player reads them: the Year from 1, the Day of the Year from 1, and the time of day. */
export interface CalendarDate {
  year: number;
  day: number;
  timeOfDay: TimeOfDay;
}

/**
 * `turn`'s date in parts: Turn 0 is Year 1 Day 1, morning. Throws on a Turn that is not a whole
 * number from 0, as the engine does.
 */
export function calendarOf(turn: Turn, config: Calendar): CalendarDate {
  return { year: yearOf(turn, config) + 1, day: dayOf(turn % config.turnsPerYear) + 1, timeOfDay: timeOfDay(turn) };
}

/** `Year 2 Day 45`: the date `turn` falls on. */
export function dateOfTurn(turn: Turn, config: Calendar): string {
  const { year, day } = calendarOf(turn, config);
  return `Year ${year} Day ${day}`;
}

/** `Year 2 Day 45, afternoon`: the date and the time of day of `turn`. */
export function whenOfTurn(turn: Turn, config: Calendar): string {
  return `${dateOfTurn(turn, config)}, ${timeOfDay(turn)}`;
}

/** `the night of Year 2 Day 45`: the night of the Day `turn` falls in, whichever Turn of it. */
export function nightOfTurn(turn: Turn, config: Calendar): string {
  return `the night of ${dateOfTurn(turn, config)}`;
}

/** `Year 2 Day 45`: the date of `day`, a Day as the engine counts it, from 0 (a Bankruptcy's `dueDay`). */
export function dateOfDay(day: number, config: Calendar): string {
  return dateOfTurn(day * turnsPerDay, config);
}

/** `the night of Year 2 Day 45`: the night of `day`, a Day as the engine counts it, from 0. */
export function nightOfDay(day: number, config: Calendar): string {
  return nightOfTurn(day * turnsPerDay, config);
}

/** `year-2-day-45`: the date of `turn` in a file's name, as the save's (`heroesim-<seed>-year-2-day-45.json`). */
export function fileDateOfTurn(turn: Turn, config: Calendar): string {
  const { year, day } = calendarOf(turn, config);
  return `year-${year}-day-${day}`;
}
