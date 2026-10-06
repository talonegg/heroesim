// Night: the Unattached pool refresh (M2-S8, approach §2, DL-27). Heroes who have been in the pool
// for `unattachedStayDays` leave it, then the Heroes Generator refills it to `unattachedPoolSize`
// from the `pool` stream (pre-M0 review D7), the only stream this phase draws from.
//
// A Hero who leaves is marked gone (`leftPoolOnTurn`) here, and keeps their row only when an entry
// of the History names them once the Turn's events are in (data-model rule 8, pre-M0 review A9):
// `advance` removes the row as `record` decides, the same reading that records their
// `hero.left-pool`, so an entry made earlier or later in the Turn counts (DL-211, DL-214). Until
// then the row stands out of play, so a module's `onNight` sees it as it sees the dead's. A Hero never
// hired is named by none, their arrival and leaving being emitted and not recorded, so the pool
// never grows the table or the History by the Heroes nobody signed.

import type { Hero } from '../document.js';
import type { EngineEvent } from '../events.js';
import { generateHero } from '../generators/heroes.js';
import { unattachedHeroes } from '../selectors.js';
import { dayOf } from '../time.js';
import type { PhaseRun } from './phase.js';

export const poolRefresh: PhaseRun = (world, ctx) => {
  const { config, content } = ctx;
  const events: EngineEvent[] = [];

  // Departures, in id order: on the night of the Day `unattachedStayDays` after the Day they entered.
  const today = dayOf(ctx.turn);
  for (const hero of unattachedHeroes(world)) {
    if (today < dayOf(entered(hero)) + config.unattachedStayDays) continue;
    events.push(ctx.emit({ type: 'hero.left-pool', participants: [hero.id], payload: { heroId: hero.id } }));
    hero.unattachedSince = null;
    hero.leftPoolOnTurn = ctx.turn;
  }

  // The refill, after the departures, so a Hero who left is replaced the same night.
  const deps = { config, content };
  for (let size = unattachedHeroes(world).length; size < config.unattachedPoolSize; size += 1) {
    events.push(...generateHero(world, deps, { stream: 'pool' }).events);
  }
  return events;
};

/** The Turn a pool Hero entered the pool. */
function entered(hero: Hero): number {
  if (hero.unattachedSince === null) throw new RangeError(`${hero.id} is not in the Unattached pool`);
  return hero.unattachedSince;
}
