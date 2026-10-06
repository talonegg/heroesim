// What the History records of the events a play emits (DL-206 items 20 and 21, DL-211). Every
// event is returned to the caller, for the Turn's log, the stops and the harness; each is appended
// to the History through `append` but the Unattached pool's comings and goings of a Hero no entry
// names: a Hero generated into the pool, and their leaving it unhired. Such a Hero is History only
// once something else is: their signing (`hero.recruited`), where a hired Hero's History begins,
// or any other entry, a module's among them. Nothing is removed from the History; these are never
// written (ADR-0008 as amended, data-model rules 8 and 10).
//
// A Hero's leaving the pool is decided over the whole batch: it is recorded when an entry names
// them, before the batch or anywhere in it, and their row is kept exactly then. `record` says whose
// leaving was not recorded, and `advance` removes those rows once the batch is in (data-model rule
// 8, DL-214), so the row and the History are decided by the one reading and never disagree, whether
// the entry naming them comes before their leaving in the Turn or after it (a module's `onNight`).

import type { EntityId, Entry, HeroId, History } from './document.js';
import type { HeroGenerated, HeroLeftPool } from './events.js';
import { append, names } from './history.js';

/**
 * Appends to `history`, in order, each of `events` it records: each read by `recorded` against the
 * History as the ones before it have left it, and a `hero.left-pool` recorded too when an event of
 * the batch that is no pool passage names the Hero, earlier or later (DL-214). Returns the Heroes of
 * the batch's `hero.left-pool` events whom no entry names once the batch is in, those whose leaving
 * was not recorded: theirs are the rows to remove (data-model rule 8).
 */
export function record(history: History, events: readonly Entry[]): HeroId[] {
  const namedInBatch = namedOutsidePassages(events);
  const left: HeroId[] = [];
  for (const event of events) {
    const leaving = event.type === 'hero.left-pool' ? (event as HeroLeftPool).payload.heroId : null;
    if (recorded(history, event) || (leaving !== null && namedInBatch.has(leaving))) append(history, event);
    if (leaving !== null) left.push(leaving);
  }
  return left.filter((heroId) => !names(history, heroId));
}

/**
 * Whether `history` records `event`: every event but a `hero.generated` into the Unattached pool
 * or a `hero.left-pool` whose Hero no entry of `history` names. A Hero's arrival in the pool is
 * never recorded, since no entry names a Hero just made.
 */
export function recorded(history: Readonly<History>, event: Entry): boolean {
  const heroId = poolPassageOf(event);
  return heroId === null || names(history, heroId);
}

/** The entities `events` name outside the pool's passages: each such event is recorded, whatever the History holds. */
function namedOutsidePassages(events: readonly Entry[]): Set<EntityId> {
  const named = new Set<EntityId>();
  for (const event of events) {
    if (poolPassageOf(event) === null) for (const id of event.participants) named.add(id);
  }
  return named;
}

/** The Hero `event` brings into the Unattached pool or takes out of it unhired, or `null` for any other event. */
function poolPassageOf(event: Entry): EntityId | null {
  if (event.type === 'hero.generated') {
    const { payload } = event as HeroGenerated;
    return payload.guildId === null ? payload.heroId : null;
  }
  return event.type === 'hero.left-pool' ? (event as HeroLeftPool).payload.heroId : null;
}
