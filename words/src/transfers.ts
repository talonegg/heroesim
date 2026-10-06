// A Transfer's refusals in words (v1.1.7-S8, DL-214): why a Guild will not deal now, and a Hero a
// Transfer cannot move yet (DL-69). The CLI's `transfer` and the page's refusals each wrote them;
// one place now, as DL-186 item 1 and DL-197 have the front ends' words. A front end names the Hero
// its own way, the CLI by name and id and the page by name, and passes the name in.

import type { Guild, TransferRefusalReason, Turn } from '@heroesim/engine';
import { dateOfTurn, type Calendar } from './calendar.js';

/** Why a Guild will not deal now, after "will not part with …" or "will not take …"; `guild` the Guild's row, if the save holds it. */
export function transferRefusalWords(because: TransferRefusalReason, guild: Pick<Guild, 'rosterIds'> | undefined): string {
  switch (because) {
    case 'roster-size':
      return `its Roster of ${guild?.rosterIds.length ?? 0} is too small for its appetite for Transfers`;
    case 'wealth':
      return 'it is not rich enough to hire now';
    case 'unknown-disposition':
      return 'its Disposition is not one this content knows';
    case 'answers-offers':
      return 'it answers only Transfer Offers';
  }
}

/** A Hero a Transfer cannot move yet (DL-69), `hero` the front end's name for them: the date they were transferred, and the first they may be again. */
export function transferLockedWords(hero: string, transferredOnTurn: Turn, untilTurn: Turn, calendar: Calendar): string {
  return `${hero} was transferred on ${dateOfTurn(transferredOnTurn, calendar)} and cannot be transferred again before ${dateOfTurn(untilTurn, calendar)}.`;
}
