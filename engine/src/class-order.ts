// The Classes' order (v1.1.6-S14, DL-186 item 24, SF8): content declares it (`class-order.json`, each
// Class once, which `validateContent` checks), and every list that shows Classes in order, the
// Roster's, the Board's Party builder's and the Unattached pool's, reads this one comparator. It is
// for display; no rule reads it, and the draws that deal the Classes (`sortedKeys`) keep their own.

import type { ClassKey, ContentSet } from './content-types.js';
import { compareByCodeUnit } from './document.js';

const built = new WeakMap<readonly ClassKey[], (a: ClassKey, b: ClassKey) => number>();

/**
 * Two Class keys in the content's declared order; a Class the content does not define comes after
 * the declared ones, by its key. Built once for each content set's list.
 */
export function classComparator(content: Pick<ContentSet, 'classOrder'>): (a: ClassKey, b: ClassKey) => number {
  const kept = built.get(content.classOrder);
  if (kept !== undefined) return kept;
  const order = content.classOrder;
  const place = (key: ClassKey): number => {
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
  };
  const compare = (a: ClassKey, b: ClassKey): number => place(a) - place(b) || compareByCodeUnit(a, b);
  built.set(order, compare);
  return compare;
}
