// Night: the Unattached pool refresh (M2-S8, approach §2, DL-27). Heroes who have been in the pool
// for `unattachedStayDays` leave it, then the Heroes Generator refills it to `unattachedPoolSize`
// from the `pool` stream (pre-M0 review D7), the only stream this phase draws from.
//
// A Hero who leaves keeps their row only when the History names them in an entry other than
// their own `hero.generated` and `hero.left-pool` (data-model rule 8, pre-M0 review A9). Those
// two carry the Hero's name as a label and narrate without the row, so the pool never grows the
// table by the Heroes nobody signed.

import type { EntityId, Hero, History } from '../document.js';
import type { EngineEvent } from '../events.js';
import { generateHero } from '../generators/heroes.js';
import { unattachedHeroes } from '../selectors.js';
import { dayOf } from '../time.js';
import { passiveEntryTypes } from '../validate.js';
import type { PhaseRun } from './phase.js';

const passive: ReadonlySet<string> = new Set(passiveEntryTypes);

export const poolRefresh: PhaseRun = (world, ctx) => {
  const { config, content } = ctx;
  const events: EngineEvent[] = [];

  // Departures, in id order: on the night of the Day `unattachedStayDays` after the Day they entered.
  const today = dayOf(ctx.turn);
  for (const hero of unattachedHeroes(world)) {
    if (today < dayOf(entered(hero)) + config.unattachedStayDays) continue;
    events.push(ctx.emit({ type: 'hero.left-pool', participants: [hero.id], payload: { heroId: hero.id } }));
    hero.unattachedSince = null;
    if (namedOnlyPassively(ctx.history, hero.id)) delete world.heroes[hero.id];
    else hero.leftPoolOnTurn = ctx.turn;
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

/**
 * True when every History entry naming `id` is of a passive type (data-model rule 8), read from
 * the History as it stood before this Turn: the Hero's `hero.left-pool`, not yet appended, is
 * passive too.
 */
function namedOnlyPassively(history: Readonly<History>, id: EntityId): boolean {
  const positions = Object.hasOwn(history.byEntity, id) ? (history.byEntity[id] ?? []) : [];
  return positions.every((position) => {
    const entry = history.entries[position];
    return entry !== undefined && passive.has(entry.type);
  });
}
