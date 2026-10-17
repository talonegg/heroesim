// The Turn pipeline (M2-S2, approach §2): a flat, ordered list of phases, each running on one time
// of day. Each phase lives in its own file under phases/, so a story fills in its phase there and
// the order is decided here once; a later milestone's phase (M3's training, M6's transfers) is one
// line inserted in this list. pipeline.test.ts holds the list to a literal.
//
// The modules' hooks are three entries of the list, at the positions approach §2 marks
// `[modules: on…]` (M8-S1, DL-76): each calls the installed modules (modules.ts), and with none
// installed does nothing.

import type { World } from './document.js';
import type { TurnEvent } from './events.js';
import { hookPhase } from './modules.js';
import { ageing } from './phases/ageing.js';
import { boardRefresh } from './phases/board-refresh.js';
import { endings } from './phases/endings.js';
import { gearReturn } from './phases/gear-return.js';
import { guildState } from './phases/guild-state.js';
import { heroState } from './phases/hero-state.js';
import { levelUps } from './phases/level-ups.js';
import { marketRefresh } from './phases/market-refresh.js';
import { offerExpiry } from './phases/offer-expiry.js';
import { patronState } from './phases/patron-state.js';
import type { Phase, PhaseContext } from './phases/phase.js';
import { poolRefresh } from './phases/pool-refresh.js';
import { questsAdvance } from './phases/quests-advance.js';
import { questsConclude } from './phases/quests-conclude.js';
import { rivalControllers } from './phases/rival-controllers.js';
import { training } from './phases/training.js';
import { transfers } from './phases/transfers.js';
import { timeOfDay } from './time.js';

/**
 * Every phase in the order it runs (approach §2). The player acts through standalone actions in
 * any Turn (pre-M0 review D2), so no phase takes the player's choices.
 */
export const phases: readonly Phase[] = [
  // Morning: the Board refreshes from the Patrons, then the Market, then the modules.
  { name: 'boardRefresh', timeOfDay: 'morning', run: boardRefresh },
  { name: 'marketRefresh', timeOfDay: 'morning', run: marketRefresh },
  { name: 'onMorning', timeOfDay: 'morning', run: hookPhase('onMorning') },
  // Afternoon: the Rivals act on what the player left, then Quests in flight advance, then the
  // modules.
  { name: 'rivalControllers', timeOfDay: 'afternoon', run: rivalControllers },
  { name: 'questsAdvance', timeOfDay: 'afternoon', run: questsAdvance },
  { name: 'onAfternoon', timeOfDay: 'afternoon', run: hookPhase('onAfternoon') },
  // Night: the Hall's training XP for the Day just spent at it, Quests conclude, Heroes gain
  // the Levels their XP has reached (DL-36), the Hero State Engine runs with ageing after its
  // Retirement checks (DL-37), the gear of the dead and the retired goes back to their Guilds
  // (DL-49), the Guild State Engine runs, the Transfer Generator moves Heroes between Guilds on its
  // night (DL-59, DL-319), the Patron State Engine returns Patron Regard toward neutral (DL-43), the
  // pool refreshes, the modules run, Transfer Offers meet their night, those past it or whose Hero has
  // left going and a free Offer's Hero answered or taken (DL-57, DL-319), and the ending checks come last.
  { name: 'training', timeOfDay: 'night', run: training },
  { name: 'questsConclude', timeOfDay: 'night', run: questsConclude },
  { name: 'levelUps', timeOfDay: 'night', run: levelUps },
  { name: 'heroState', timeOfDay: 'night', run: heroState },
  { name: 'ageing', timeOfDay: 'night', run: ageing },
  { name: 'gearReturn', timeOfDay: 'night', run: gearReturn },
  { name: 'guildState', timeOfDay: 'night', run: guildState },
  { name: 'transfers', timeOfDay: 'night', run: transfers },
  { name: 'patronState', timeOfDay: 'night', run: patronState },
  { name: 'poolRefresh', timeOfDay: 'night', run: poolRefresh },
  { name: 'onNight', timeOfDay: 'night', run: hookPhase('onNight') },
  { name: 'offerExpiry', timeOfDay: 'night', run: offerExpiry },
  { name: 'endings', timeOfDay: 'night', run: endings },
];

/**
 * Plays `world`'s Turn: runs, in order, each phase whose time of day is the Turn's, on `world` in
 * place, and returns their events in the order they happened, the modules' own among them. `world`
 * is the Turn's copy, already advanced to `ctx.turn`; appending the events to the History is the
 * caller's (`advance`), as is reading the stops the modules asked for (`ctx.moduleStops`).
 * Throws when `ctx` is for another Turn than `world`'s: a programming error.
 */
export function runTurn(world: World, ctx: PhaseContext): TurnEvent[] {
  if (ctx.turn !== world.turn) {
    throw new RangeError(`The context is for Turn ${ctx.turn} and the world is at Turn ${world.turn}`);
  }
  const now = timeOfDay(ctx.turn);
  const events: TurnEvent[] = [];
  for (const phase of phases) {
    if (phase.timeOfDay === now) events.push(...phase.run(world, ctx));
  }
  return events;
}
