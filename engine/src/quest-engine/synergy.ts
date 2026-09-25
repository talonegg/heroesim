// The Synergy term of a Check's capability (M4-S2's seam, DL-42): what a Party's combination of
// Classes and Skills adds on an Encounter (R26, INPUTS 6.4). M4-S3 fills it from
// `content/synergies.json` through its `synergiesFor` selector, a Synergy's `flat` bonus added and
// its `factor` read against `base`, the capability before this term, and only on the Encounter
// kinds it names. Until then no Party has a Synergy, and the term is 0: the neutral value, which
// leaves the Check what it would be without it.

import type { EngineDeps } from '../config.js';
import type { Encounter } from '../content-types.js';
import type { Hero } from '../document.js';

/**
 * The Synergy bonus `heroes`, the Party members still in the sequence, add to their capability on
 * `encounter`, whose capability before it is `base` (Stats and Skills). 0 until M4-S3.
 */
export function synergyBonus(
  heroes: readonly Hero[],
  encounter: Encounter,
  base: number,
  deps: Pick<EngineDeps, 'config' | 'content'>,
): number {
  // M4-S3 reads all four; the seam takes them now so that the Check's call does not change.
  void heroes;
  void encounter;
  void base;
  void deps;
  return 0;
}
