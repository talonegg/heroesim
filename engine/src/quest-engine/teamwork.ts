// The teamwork scalar of a Check's capability (a seam of DL-42's, which DL-46 fills): how
// well a Party works together, from the mean pairwise Relationship of its members (R24, INPUTS 6.3:
// ×0.9 to ×1.1 across the Relationship range). The Relationship of each pair is read from the two
// Heroes' Regard for each other (`relationshipBetween`, hero-regard.ts), never stored.
//
// The scalar is 1 plus `teamworkRange` times the mean as a share of the scale's reach on its side
// (`regardShare`): 1 at neutral, 1 + `teamworkRange` for a Party whose every pair is at the scale's
// top, 1 − `teamworkRange` for one at its bottom. A Party of one has no pair and works as its
// Stats say: 1, the neutral value (DL-46).

import type { EngineDeps } from '../config.js';
import type { Hero, World } from '../document.js';
import { meanPairwiseRelationship } from '../hero-regard.js';
import { regardShare } from '../regard.js';

/**
 * What `heroes`, the Party members still in the sequence, multiply their capability by for working
 * together (M4-S4). Reads the Heroes' own Regard maps.
 */
export function teamwork(heroes: readonly Hero[], world: World, deps: Pick<EngineDeps, 'config' | 'content'>): number {
  // The seam's signature, kept so that the Check's call does not change; nothing here reads it yet.
  void world;
  const { config } = deps;
  if (heroes.length < 2) return 1;
  return 1 + config.teamworkRange * regardShare(meanPairwiseRelationship(heroes, config), config);
}
