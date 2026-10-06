// Night: the Unattached pool refresh (M2-S8, approach §2, DL-27). Heroes who have been in the pool
// for `unattachedStayDays` leave it, then the Heroes Generator refills it to `unattachedPoolSize`
// from the `pool` stream (pre-M0 review D7), the only stream this phase draws from.
//
// A Hero who leaves keeps their row only when an entry of the History names them (data-model
// rule 8, pre-M0 review A9): the same reading that records their `hero.left-pool` (record.ts), so
// the row goes when the leaving is not recorded. A Hero never hired is named by none, their
// arrival and leaving being emitted and not recorded (DL-211), so the pool never grows the table
// or the History by the Heroes nobody signed.

import type { Hero } from '../document.js';
import type { EngineEvent } from '../events.js';
import { generateHero } from '../generators/heroes.js';
import { names } from '../history.js';
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
    // Read from the History as it stood before this Turn: an entry naming them made earlier in the
    // Turn is missed, and the validator then refuses the row's removal (DL-27 item 3).
    if (names(ctx.history, hero.id)) hero.leftPoolOnTurn = ctx.turn;
    else delete world.heroes[hero.id];
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
