// The per-Turn copy of the World State (data-model §1, ADR-0008 as amended by ADR-0011): `advance`
// and the actions' `applyToCopy` each play on a copy of `world`, made here, so that the document
// they were given is left as it was. One named function, so the copy can be timed by the harness
// (v1.1.6-S17, DL-186 item 11, DL-203).
//
// The copy is by hand, not `structuredClone` (ADR-0011, the owner's answers in DL-203). The write-once
// rows, those out of play that no rule writes again (`writeOnce`: dead, retired and gone Heroes,
// retired Guildmasters, folded Guilds), are frozen all the way down and shared by reference between
// the world copied and its copy, as the History is between documents (ADR-0008); every other value
// is copied, each object's keys in their order, so the copy is the one `structuredClone` makes and
// the save is the same to the byte. A row is frozen by the first copy made of a world in which it
// is write-once: the Turn or action that took it out of play has ended by then, with every write of
// that night made (a Hero retired on a night is written, then their gear moved, the same night), so
// a write to it after that is a bug, and in the engine's strict-mode modules it throws. Texts are
// strings, which are never copied: the hand copy shares every Appearance and Biography by reference
// without freezing anything for it.

import type { Guild, Guildmaster, Hero, World } from './document.js';

/**
 * Whether each table's row is out of play for good, never written again by a rule (DL-84 item 6,
 * ADR-0011): a Hero dead, retired, or gone from the pool unrecruited (DL-27); a retired Guildmaster
 * (DL-100 item 3); a folded Guild (M2-S10).
 */
export const writeOnce = {
  heroes: (hero: Pick<Hero, 'diedOnTurn' | 'retiredOnTurn' | 'leftPoolOnTurn'>): boolean =>
    hero.diedOnTurn !== null || hero.retiredOnTurn !== null || hero.leftPoolOnTurn !== null,
  guildmasters: (guildmaster: Pick<Guildmaster, 'retiredOnTurn'>): boolean => guildmaster.retiredOnTurn !== null,
  guilds: (guild: Pick<Guild, 'foldedOnTurn'>): boolean => guild.foldedOnTurn !== null,
} as const;

/** The tables that hold write-once rows. */
type WriteOnceTable = keyof typeof writeOnce;

const isWriteOnceTable = (key: string): key is WriteOnceTable => Object.hasOwn(writeOnce, key);

/**
 * A copy of `world` for the next Turn or action to play on, `world` itself left as it was but for
 * its write-once rows, frozen all the way down where they were not yet and shared with the copy.
 * Equal to `structuredClone(world)`, key for key and in the same order, at every depth.
 */
export function copyWorld(world: World): World {
  const copy: Record<string, unknown> = {};
  for (const key in world) {
    const value: unknown = world[key as keyof World];
    copy[key] = isWriteOnceTable(key) ? copyTable(value as Record<string, never>, writeOnce[key]) : copied(value);
  }
  return copy as unknown as World;
}

/** `table` copied row by row, a write-once row frozen and shared, every other copied. */
function copyTable(table: Readonly<Record<string, object>>, isWriteOnce: (row: never) => boolean): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const id in table) {
    const row = table[id] as object;
    copy[id] = isWriteOnce(row as never) ? frozen(row) : copied(row);
  }
  return copy;
}

/** `value` copied as `structuredClone` copies a JSON-safe value: each list and object anew, keys in order. */
function copied(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) {
    const list: unknown[] = [];
    for (const item of value) list.push(copied(item));
    return list;
  }
  const object: Record<string, unknown> = {};
  for (const key in value) {
    const inner = copied((value as Record<string, unknown>)[key]);
    // `__proto__` as an own key, as `JSON.parse` makes it, stays one; assigned, it would set the prototype.
    if (key === '__proto__') Object.defineProperty(object, key, { value: inner, enumerable: true, writable: true, configurable: true });
    else object[key] = inner;
  }
  return object;
}

/** `value` frozen all the way down, and itself: a row frozen once is left as it is. */
function frozen<T extends object>(value: T): T {
  if (Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) {
    const inner: unknown = (value as Record<string, unknown>)[key];
    if (typeof inner === 'object' && inner !== null) frozen(inner);
  }
  return Object.freeze(value);
}
