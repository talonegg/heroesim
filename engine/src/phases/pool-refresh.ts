// Night: the Unattached pool refresh (M2-S8, approach §2, DL-27). Heroes who have been in the pool
// for `unattachedStayDays`, or `releasedStayDays` for a Hero a Guild released (DL-325), leave it, then
// the Heroes Generator refills it to `unattachedPoolSize` from the `pool` stream (pre-M0 review D7),
// the only stream this phase draws from. A released Hero is not counted toward the size (DL-325).
//
// A Hero who leaves is marked gone (`leftPoolOnTurn`) here, and keeps their row only when an entry
// of the History names them once the Turn's events are in (data-model rule 8, pre-M0 review A9):
// `advance` removes the row as `record` decides, the same reading that records their
// `hero.left-pool`, so an entry made earlier or later in the Turn counts (DL-211, DL-214). Until
// then the row stands out of play, so a module's `onNight` sees it as it sees the dead's. A Hero never
// hired is named by none, their arrival and leaving being emitted and not recorded, so the pool
// never grows the table or the History by the Heroes nobody signed.

import type { History, Hero } from '../document.js';
import type { EngineEvent } from '../events.js';
import { generateHero } from '../generators/heroes.js';
import { unattachedHeroes } from '../selectors.js';
import { dayOf } from '../time.js';
import type { PhaseRun } from './phase.js';

export const poolRefresh: PhaseRun = (world, ctx) => {
  const { config, content } = ctx;
  const events: EngineEvent[] = [];

  // Departures, in id order: on the night of the Day their stay after the Day they entered runs out.
  const today = dayOf(ctx.turn);
  for (const hero of unattachedHeroes(world)) {
    const stay = released(hero, ctx.history) ? config.releasedStayDays : config.unattachedStayDays;
    if (today < dayOf(entered(hero)) + stay) continue;
    events.push(ctx.emit({ type: 'hero.left-pool', participants: [hero.id], payload: { heroId: hero.id } }));
    hero.unattachedSince = null;
    hero.leftPoolOnTurn = ctx.turn;
  }

  // The refill, after the departures, so a Hero who left is replaced the same night. A released Hero stays beside
  // the size, not in it (DL-325), so a pool of them brings the usual new recruits.
  const deps = { config, content };
  const staying = unattachedHeroes(world).filter((hero) => !released(hero, ctx.history));
  for (let size = staying.length; size < config.unattachedPoolSize; size += 1) {
    events.push(...generateHero(world, deps, { stream: 'pool' }).events);
  }
  return events;
};

/** The Turn a pool Hero entered the pool. */
function entered(hero: Hero): number {
  if (hero.unattachedSince === null) throw new RangeError(`${hero.id} is not in the Unattached pool`);
  return hero.unattachedSince;
}

/**
 * Whether a pool Hero entered the pool by a release (`hero.released` on the Turn they entered, DL-325),
 * not a fold or the Generator: read from the History, an earlier Turn's, so nothing is stored. Reads back
 * only the Hero's entries since they entered.
 */
function released(hero: Hero, history: Readonly<History>): boolean {
  const since = entered(hero);
  const positions = history.byEntity[hero.id] ?? [];
  for (let at = positions.length - 1; at >= 0; at -= 1) {
    const entry = history.entries[positions[at] as number];
    if (entry === undefined || entry.turn < since) return false;
    if (entry.type === 'hero.released' && entry.turn === since) return true;
  }
  return false;
}
