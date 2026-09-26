// Morning: Market refresh (approach §2, M5-S4, R31, INPUTS 7.2, DL-51), after the Board's. The
// Market Engine clears the Market's stacks and draws new ones from the `market` stream, and from no
// other: `marketSize` stacks, each of a different definition among those the Market stocks
// (`stockedDefinitions`: common, with a price), each of `marketStackMin` to `marketStackMax` Items.
// The unique Items listed on the Market stay until a Guild buys them: a folded Guild's (pre-M0 review
// D6) are sold to it at night, so a refresh that cleared them would leave them unsold. `createWorld`
// runs the same refresh at Turn 0, as it does the Board's, so a new game opens on a stocked Market.
//
// A refresh emits nothing: what the Market holds is World State, and what a Guild buys or sells
// there is the History's (`item.bought`, `item.sold`).

import { streamOf } from '../generators/draw.js';
import { addStack, holdings } from '../items.js';
import { marketHolder, stockedDefinitions } from '../market.js';
import { int, shuffle } from '../rng.js';
import type { PhaseRun } from './phase.js';

/**
 * Clears every stack the Market holds, then puts on it the first `marketSize` definitions of a
 * shuffle of `stockedDefinitions` (key order before the shuffle), each as a new stack whose quantity
 * is drawn, in the shuffle's order. Draws `stocked - 1` for the shuffle and one per stack, all from
 * `market`; a Market of size 0, or content that stocks nothing, draws nothing.
 */
export const marketRefresh: PhaseRun = (world, { config, content }) => {
  for (const stack of holdings(world, marketHolder).stacks) delete world.stacks[stack.id];

  const stocked = stockedDefinitions(content).map((definition) => definition.key);
  const size = Math.min(config.marketSize, stocked.length);
  if (size <= 0) return [];
  const state = streamOf(world, 'market');
  for (const definitionKey of shuffle(state, stocked).slice(0, size)) {
    addStack(world, definitionKey, int(state, config.marketStackMin, config.marketStackMax), marketHolder);
  }
  return [];
};
