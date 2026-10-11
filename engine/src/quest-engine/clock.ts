// The Quest clock (DL-280 item 2, the architecture review's candidate 2; DL-282): the Day of a Quest
// each of its Encounters falls on, and a Hero's Fatigue on that Day. The resolver meets a Party on the
// night it comes home, after the Hero State Engine has run every night away (pipeline.ts), so a Hero's
// stored Fatigue is the Quest's end's; the clock works each Encounter's out instead, from the Fatigue
// the Party recorded at dispatch (`Party.fatigueAtDispatch`), and the estimate reads it the same way
// from the Fatigue a proposed Party would set out with. Pure: it reads the config and nothing else.
//
// - *An Encounter's Day.* The Quest's Days are counted from 1, Day k coming after k − 1 of its nights
//   away. On a Quest of D Days the last Encounter falls on Day L = ceil(2D ÷ 3), and the Days after
//   it are the trip home, on which Fatigue rises as on any night away (the owner's word, DL-282 item
//   4). The first falls on Day 1, the rest evenly between, each on Day 1 + round(i × (L − 1) ÷ (n − 1)),
//   rounded half up, for the i-th of n Encounters, from 0; a lone Encounter, the Quest's last, falls
//   on Day L.
// - *The Fatigue on it.* A Hero's Fatigue at dispatch, risen by the Quest's Tier (`fatigueRise`) for
//   each Day before the Encounter's, held at `fatigueMax`: what the nights away have made it by then.

import type { GameConfig } from '../config.js';
import type { Quest } from '../document.js';
import { fatigueRise } from '../fatigue.js';
import { durationDaysOf } from '../time.js';

/** A Quest's Days, and the Day of each of its Encounters and the Fatigue on it (`questClock`). */
export interface QuestClock {
  /** The Quest's Days away, from 1. */
  readonly days: number;
  /** The Day of its last Encounter, ceil(2 × `days` ÷ 3); the Days after it are the trip home. */
  readonly lastEncounterDay: number;
  /** The Day of the Quest, from 1, the `index`th Encounter, from 0, falls on. */
  encounterDay(index: number): number;
  /** The Fatigue on the `index`th Encounter's Day of a Hero whose Fatigue at dispatch was `atDispatch`. */
  fatigueAt(index: number, atDispatch: number): number;
}

/**
 * The clock of `quest`, meeting `encounters` Encounters: the Quest's own sequence, or the one drawn on
 * the way for a Quest whose Encounters content no longer defines. Throws on a programming error: a
 * sequence of no Encounter, or an Encounter asked of it outside the sequence.
 */
export function questClock(
  quest: Pick<Quest, 'tier' | 'durationTurns'>,
  encounters: number,
  config: Pick<GameConfig, 'fatigueMax' | 'fatigueRiseByTier'>,
): QuestClock {
  if (!Number.isSafeInteger(encounters) || encounters < 1) throw new RangeError(`A Quest meets one Encounter or more, not ${encounters}`);
  const days = Math.max(1, durationDaysOf(quest));
  // ceil(2D ÷ 3) in whole numbers, so no rounding of a third can misplace it.
  const lastEncounterDay = Math.floor((2 * days + 2) / 3);
  const rise = fatigueRise(quest.tier, config);
  const encounterDay = (index: number): number => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= encounters) {
      throw new RangeError(`Encounter ${index} is not one of the ${encounters} the Quest meets`);
    }
    if (encounters === 1) return lastEncounterDay;
    // round(i × (L − 1) ÷ (n − 1)), half up, in whole numbers.
    const gaps = encounters - 1;
    return 1 + Math.floor((2 * index * (lastEncounterDay - 1) + gaps) / (2 * gaps));
  };
  return {
    days,
    lastEncounterDay,
    encounterDay,
    fatigueAt: (index, atDispatch) => Math.min(config.fatigueMax, Math.max(0, atDispatch + rise * (encounterDay(index) - 1))),
  };
}
