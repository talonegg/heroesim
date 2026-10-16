// A Hero's Contract in words (DL-323), once for the CLI and the page: the cell of a Roster that says the
// Days left, Out of Contract or Under Offer, and the warning for releasing a Guild's last Hero. The
// rules are the engine's (`outOfContract`, `releaseWarning`); these only name them.

import { dayOf, outOfContract, type Hero, type ReleaseWarning, type Turn } from '@heroesim/engine';
import { coinWords } from './coins.js';

/** The Days from the Day of `turn` to `day`: 0 on `day` itself and once it has passed. A Contract or an Offer ends on the night of its last Day. */
export function daysUntil(turn: Turn, day: number): number {
  return Math.max(0, day - dayOf(turn));
}

/** `1 Day`, `3 Days`: Day is a glossary term (ui-text.md). */
export function daysWords(days: number): string {
  return `${days} ${days === 1 ? 'Day' : 'Days'}`;
}

/**
 * A Hero's Contract as a cell reads it at `turn`: `120 Days left`, or `Out of Contract` from the night
 * its end Day falls, then `, Under Offer` while an Offer stands for them at home (DL-319). Empty for a
 * Hero with no Contract, the pool's.
 */
export function contractWords(hero: Pick<Hero, 'contract'>, turn: Turn, underOffer: boolean): string {
  if (hero.contract === null) return '';
  const standing = outOfContract(hero, turn) ? 'Out of Contract' : `${daysWords(daysUntil(turn, hero.contract.endDay))} left`;
  return underOffer ? `${standing}, Under Offer` : standing;
}

/**
 * What releasing the Guild's last Hero would do (`releaseWarning`, DL-317), said as an estimate: the
 * night's Hall upkeep and the pool's refresh fall before the Roster is checked, and the warning reads
 * neither (DL-323). `name` is the Hero.
 */
export function releaseWarningWords(name: string, { payout, wealthAfter, cheapestFee, covers }: ReleaseWarning): string {
  const head = `${name} is your Guild's last Hero. Releasing them pays ${coinWords(payout)}, leaving ${coinWords(wealthAfter)}`;
  return covers
    ? `${head}, which covers the cheapest signing fee, ${coinWords(cheapestFee)}, as an estimate: the night's Hall upkeep and the pool's refresh come before the Roster is checked.`
    : `${head}, short of the cheapest signing fee, ${coinWords(cheapestFee)}: the Roster would be wiped and the game would end.`;
}
