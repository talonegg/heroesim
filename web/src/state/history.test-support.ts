// On which page of a History an entry stands, for the History's page-edge tests (M9-F7, DL-120 item
// 10). The page's code called it for "Read it in the History" until M9-F5 took that away (DL-118 item
// 5, DL-119 finding 5); it lives here now, with the index of the scope it read, as an oracle of the
// pages' edges read apart from `historyView`: `historyPageSize` entries counted from the newest; past
// them, in the player's Guild's History, the return a page's last Loot, Injury or Death stands beside
// (M9-F7); and every step of a Party whose outcome the page holds, save in the World History and the
// whole History, which fold nothing.

import { playerGuild, type EntityId, type Entry, type WorldDocument } from '@heroesim/engine';
import { historyFilter, type HistoryWhose } from './history';
import { historyPageSize } from './selectors';

/** A Party's steps on a Quest: its Encounters and the consumables it used. */
function isStep(entry: Entry | undefined): boolean {
  return entry?.type === 'quest.encounter' || entry?.type === 'item.expended';
}

function partyOf(entry: Entry): unknown {
  return (entry.payload as { partyId?: unknown } | null)?.partyId;
}

// v1.1.4-S7: a Trait a Hero earned on the Quest stands beside its return too.
const beside = new Set(['quest.loot', 'hero.injured', 'hero.died', 'hero.trait-gained']);

/** Whether `next`, older than `last`, is the return `last` stands beside, or another thing beside it. */
function besideItsReturn(last: Entry | undefined, next: Entry | undefined): boolean {
  const questOf = (entry: Entry): unknown => (entry.payload as { questId?: unknown } | null)?.questId;
  if (last === undefined || next === undefined || !beside.has(last.type) || questOf(last) === null || questOf(last) === undefined) return false;
  return questOf(next) === questOf(last) && (next.type === 'quest.resolved' || beside.has(next.type));
}

/** The places in the History of `target`'s entries as its filter leaves them, newest first. */
function newestFirst(document: WorldDocument, target: EntityId | 'world' | 'all'): number[] {
  const { history } = document;
  const shows = historyFilter(document, target);
  const ascending =
    target === 'all' || target === 'world'
      ? history.entries.flatMap((entry, position) => (shows(entry) ? [position] : []))
      : (Object.hasOwn(history.byEntity, target) ? (history.byEntity[target] ?? []) : []).filter((position) => shows(history.entries[position] as Entry));
  return ascending.reverse();
}

/**
 * On which page of `whose` History `entry` stands, from 0; `null` when that History does not hold it.
 * `entry` is the History's own. `whose` is `null` for the player's Guild's, as `historyView` reads it.
 */
export function pageOfEntry(document: WorldDocument, whose: HistoryWhose, entry: Entry): number | null {
  const { entries } = document.history;
  const target = whose ?? playerGuild(document.world)?.id ?? 'world';
  const places = newestFirst(document, target);
  const index = places.indexOf(entries.lastIndexOf(entry));
  if (index < 0) return null;
  const folds = target !== 'all' && target !== 'world';
  const mine = target === playerGuild(document.world)?.id;
  const at = (i: number): Entry | undefined => entries[places[i] ?? -1];
  // Where, counted from the newest, the outcome is that the step at `i` folds under; -1 when none is.
  const outcomeOf = (i: number): number => {
    const step = at(i) as Entry;
    for (let newer = i - 1; newer >= 0; newer -= 1) {
      const each = at(newer);
      if (each === undefined || each.turn !== step.turn || partyOf(each) !== partyOf(step)) return -1;
      if (each.type === 'quest.resolved') return newer;
      if (!isStep(each)) return -1;
    }
    return -1;
  };
  for (let start = 0, page = 0; start < places.length; page += 1) {
    let end = Math.min(places.length, start + historyPageSize);
    // In the player's Guild's, a page that ends on a return's Loot, Injury or Death takes the return (M9-F7).
    while (mine && end < places.length && besideItsReturn(at(end - 1), at(end))) end += 1;
    while (folds && end < places.length && isStep(at(end)) && outcomeOf(end) >= start) end += 1;
    if (index < end) return page;
    start = end;
  }
  return null;
}
