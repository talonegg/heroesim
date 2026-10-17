// Night, before the ending checks: each Transfer Offer meets its night (M6-S2, data-model §3.2, DL-57,
// DL-319), by one rule, `offerTonight` (actions/transfer.ts). An offer whose Hero has left the Roster it
// was made for (a Death on a Quest earlier tonight, a Retirement at tonight's yearly check) goes for
// `hero-left`, and one naming a folded Guild, which the fold itself withdraws (phases/endings.ts), for
// `guild-folded`. A free Offer for a Rival's Hero, made while they were away, is answered at once the
// night they come home. On its last night a free Offer's Hero is taken, and any other Offer goes for
// `expired`. In offer id order; it draws nothing.
//
// Its own phase, as `gearReturn` is, so that one sweep catches every way an offer lapses and the
// rules that kill or retire a Hero stay as they were. The Transfer rules withdraw an offer whose Hero
// they move at once (`makeTransfer`), since those run between the phases.

import { offerTonight } from '../actions/transfer.js';
import type { EngineEvent } from '../events.js';
import { pendingOffers } from '../transfer.js';
import type { PhaseRun } from './phase.js';

export const offerExpiry: PhaseRun = (world, ctx) => {
  const deps = { config: ctx.config, content: ctx.content };
  const events: EngineEvent[] = [];
  for (const offer of pendingOffers(world)) {
    // An Offer an earlier one's Transfer or renewal has ended is gone.
    if (Object.hasOwn(world.offers, offer.id)) events.push(...offerTonight(world, offer, ctx.turn, deps));
  }
  return events;
};
