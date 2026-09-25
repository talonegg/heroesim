// The Turn pipeline (M2-S2, approach §2): a flat, ordered list of phases, each running on one time
// of day. No registration and no module hook; M8 adds the hooks at the three positions approach §2
// marks. Each phase lives in its own file under phases/, so a story fills in its phase there and
// the order is decided here once; a later milestone's phase (M3's training, M6's transfers) is one
// line inserted in this list. pipeline.test.ts holds the list to a literal.

import type { World } from './document.js';
import type { EngineEvent } from './events.js';
import { ageing } from './phases/ageing.js';
import { boardRefresh } from './phases/board-refresh.js';
import { endings } from './phases/endings.js';
import { guildState } from './phases/guild-state.js';
import { heroState } from './phases/hero-state.js';
import { marketRefresh } from './phases/market-refresh.js';
import type { Phase, PhaseContext } from './phases/phase.js';
import { poolRefresh } from './phases/pool-refresh.js';
import { questsAdvance } from './phases/quests-advance.js';
import { questsConclude } from './phases/quests-conclude.js';
import { rivalControllers } from './phases/rival-controllers.js';
import { timeOfDay } from './time.js';

/**
 * Every phase in the order it runs (approach §2). The player acts through standalone actions in
 * any Turn (pre-M0 review D2), so no phase takes the player's choices.
 */
export const phases: readonly Phase[] = [
  // Morning: the Board refreshes from the Patrons, then the Market.
  { name: 'boardRefresh', timeOfDay: 'morning', run: boardRefresh },
  { name: 'marketRefresh', timeOfDay: 'morning', run: marketRefresh },
  // Afternoon: the Rivals act on what the player left, then Quests in flight advance.
  { name: 'rivalControllers', timeOfDay: 'afternoon', run: rivalControllers },
  { name: 'questsAdvance', timeOfDay: 'afternoon', run: questsAdvance },
  // Night: Quests conclude, the Hero State Engine runs with ageing after its Retirement checks, the
  // Guild State Engine runs, the pool refreshes, and the ending checks come last.
  { name: 'questsConclude', timeOfDay: 'night', run: questsConclude },
  { name: 'heroState', timeOfDay: 'night', run: heroState },
  { name: 'ageing', timeOfDay: 'night', run: ageing },
  { name: 'guildState', timeOfDay: 'night', run: guildState },
  { name: 'poolRefresh', timeOfDay: 'night', run: poolRefresh },
  { name: 'endings', timeOfDay: 'night', run: endings },
];

/**
 * Plays `world`'s Turn: runs, in order, each phase whose time of day is the Turn's, on `world` in
 * place, and returns their events in the order they happened. `world` is the Turn's copy, already
 * advanced to `ctx.turn`; appending the events to the History is the caller's (`advance`).
 * Throws when `ctx` is for another Turn than `world`'s: a programming error.
 */
export function runTurn(world: World, ctx: PhaseContext): EngineEvent[] {
  if (ctx.turn !== world.turn) {
    throw new RangeError(`The context is for Turn ${ctx.turn} and the world is at Turn ${world.turn}`);
  }
  const now = timeOfDay(ctx.turn);
  const events: EngineEvent[] = [];
  for (const phase of phases) {
    if (phase.timeOfDay === now) events.push(...phase.run(world, ctx));
  }
  return events;
}
