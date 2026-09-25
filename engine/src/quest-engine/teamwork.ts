// The teamwork scalar of a Check's capability (M4-S2's seam, DL-42): how well a Party works
// together, from the mean pairwise Relationship of its members (R24, INPUTS 6.3: ×0.9 to ×1.1
// across the Relationship range). M4-S4 fills it, with `relationship(a, b, world)` read from the
// Heroes' Regard for each other and `teamworkRange` in the config. Until then every Party works
// together neither better nor worse than its Stats say, and the scalar is 1: the neutral value,
// which leaves the Check what it would be without it.

import type { EngineDeps } from '../config.js';
import type { Hero, World } from '../document.js';

/**
 * What `heroes`, the Party members still in the sequence, multiply their capability by for working
 * together in `world`. 1 until M4-S4.
 */
export function teamwork(heroes: readonly Hero[], world: World, deps: Pick<EngineDeps, 'config' | 'content'>): number {
  // M4-S4 reads all three; the seam takes them now so that the Check's call does not change.
  void heroes;
  void world;
  void deps;
  return 1;
}
