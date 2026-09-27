// Night, before the ending checks: Transfer Offers that can stand no longer are removed (M6-S2,
// data-model §3.2, DL-57). An offer whose last night has come goes with `guild.transfer-offer-expired`
// for `expired`; one whose Hero has left the Roster it was made for (a Death on a Quest earlier
// tonight, a Retirement at tonight's yearly check) goes for `hero-left`; one naming a folded Guild,
// which the fold itself withdraws (phases/endings.ts), would go for `guild-folded`. In offer id
// order; it draws nothing.
//
// Its own phase, as `gearReturn` is, so that one sweep catches every way an offer lapses and the
// rules that kill or retire a Hero stay as they were. The Transfer rules withdraw an offer whose Hero
// they move at once (`makeTransfer`), since those run between the phases.

import { offerExpiresBy, offerLapse, withdrawOffers } from '../transfer.js';
import type { PhaseRun } from './phase.js';

export const offerExpiry: PhaseRun = (world, ctx) =>
  withdrawOffers(world, (offer) => offerLapse(world, offer) ?? (offerExpiresBy(offer, ctx.turn) ? 'expired' : null), ctx.emit);
