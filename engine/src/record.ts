// What the History records of the events a play emits (DL-206 items 20 and 21, DL-211). Every
// event is returned to the caller, for the Turn's log, the stops and the harness; each is appended
// to the History through `append` but the Unattached pool's comings and goings of a Hero no entry
// names: a Hero generated into the pool, and their leaving it unhired. Such a Hero is History only
// once something else is: their signing (`hero.recruited`), where a hired Hero's History begins,
// or any other entry, a module's among them. Nothing is removed from the History; these are never
// written (ADR-0008 as amended, data-model rules 8 and 10).
//
// The pool refresh reads the same `names` when a Hero leaves: their row goes exactly when their
// `hero.left-pool` is not recorded (data-model rule 8).

import type { EntityId, Entry, History } from './document.js';
import type { HeroGenerated, HeroLeftPool } from './events.js';
import { append, names } from './history.js';

/**
 * Appends to `history`, in order, each of `events` it records (`recorded`), each read against the
 * History as the ones before it have left it: an event earlier in the same batch that names a pool
 * Hero records their leaving.
 */
export function record(history: History, events: readonly Entry[]): void {
  for (const event of events) if (recorded(history, event)) append(history, event);
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

/** The Hero `event` brings into the Unattached pool or takes out of it unhired, or `null` for any other event. */
function poolPassageOf(event: Entry): EntityId | null {
  if (event.type === 'hero.generated') {
    const { payload } = event as HeroGenerated;
    return payload.guildId === null ? payload.heroId : null;
  }
  return event.type === 'hero.left-pool' ? (event as HeroLeftPool).payload.heroId : null;
}
