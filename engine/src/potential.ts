// Potential hints (M3-S3, INPUTS 5.4, DL-37). Potential is stored plainly and never shown
// (data-model rule 9): a front end shows, beside each Stat, one of three words read from the gap
// between the Stat's base and its Potential, and never the number. A selector, for the front ends
// and any rule alike.
//
// The bands are config and the only thing the hint reads beside the Hero, so M4-S5's Judgement
// sharpens hints by passing narrowed bands (pre-M0 review D9), with no change here.

import { bandOf } from './bands.js';
import { potentialHints, type GameConfig, type PotentialHint } from './config.js';
import type { StatKey } from './content-types.js';
import type { Hero } from './document.js';

/**
 * The hint for `hero`'s Stat `statKey`: the highest of `potentialHintBands` whose start the gap
 * from base to Potential has reached, and the lowest band for a gap below every start. Every gap
 * so reads as exactly one word, whatever the bands, and a gap of 0 is the lowest band while it
 * starts at 0 or above.
 *
 * A Stat the row lacks in its base or its Potential, such as one content added after the save was
 * made (data-model rule 5), has no Potential to hint at and reads as a gap of 0.
 */
export function potentialHint(
  hero: Pick<Hero, 'stats' | 'potential'>,
  statKey: StatKey,
  config: Pick<GameConfig, 'potentialHintBands'>,
): PotentialHint {
  return bandOf(potentialHints, config.potentialHintBands, potentialGap(hero, statKey));
}

/** Potential less the base, in Stat points; 0 when the row lacks either. */
function potentialGap({ stats, potential }: Pick<Hero, 'stats' | 'potential'>, statKey: StatKey): number {
  const base = Object.hasOwn(stats, statKey) ? stats[statKey] : undefined;
  const ceiling = Object.hasOwn(potential, statKey) ? potential[statKey] : undefined;
  return base === undefined || ceiling === undefined ? 0 : ceiling - base;
}
