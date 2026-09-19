/**
 * Saves in the browser (E8-S4, DL-02). `heroesim.career.<slot>` holds **exactly** what
 * `serialiseCareer` returns, so a document written here loads in the CLI and a
 * `.career/*.json` file pasted in loads here. `heroesim.slots` holds a small index so
 * that listing the slots never deserialises a Career.
 *
 * Nothing here is allowed to lose a Career quietly: a full quota, a `localStorage` that
 * throws (private browsing) and a refused `formatVersion` each come back as a sentence
 * for the player to read, and a refusal leaves the stored document untouched — there is
 * no save migration, by design.
 */

import { deserialiseCareer, serialiseCareer, type Career } from '@heroesim/engine';

/** The three named slots the player chooses between, plus the autosave. */
export const NAMED_SLOTS = ['1', '2', '3'] as const;

/** Written after every action, so a closed tab never costs more than the current Day. */
export const AUTOSAVE_SLOT = 'autosave';

/** Where the slot index lives. */
export const SLOT_INDEX_KEY = 'heroesim.slots';

/** Where one slot's Career document lives. */
export function careerKey(slot: string): string {
  return `heroesim.career.${slot}`;
}

/** What the slot picker shows without deserialising anything. */
export interface SlotIndexEntry {
  slot: string;
  guildName: string;
  day: number;
  year: number;
  rosterSize: number;
  /** When it was written. The front end may read the clock; the engine may not. */
  savedOn: string;
}

/** The part of `localStorage` this module uses, so a test can supply its own. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What a write or a clear came to. */
export interface StorageResult {
  ok: boolean;
  /** A sentence for the player. Present whenever `ok` is false. */
  message?: string;
}

/** What a read came to. */
export type LoadResult = { ok: true; career: Career } | { ok: false; message: string };

/** The storage the app talks to, whether it reached the browser or not. */
export interface CareerStorage {
  /** False when `localStorage` was unusable and Careers are being kept in memory only. */
  readonly persistent: boolean;
  /** A sentence to show the player when `persistent` is false. */
  readonly warning?: string;
  listSlots(): SlotIndexEntry[];
  save(slot: string, career: Career, savedOn: string): StorageResult;
  load(slot: string): LoadResult;
  clear(slot: string): StorageResult;
  /** Whether a slot holds anything, without deserialising it. */
  has(slot: string): boolean;
}

/** A `localStorage` stand-in that never leaves the tab. */
export function memoryStore(): KeyValueStore {
  const held = new Map<string, string>();
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value);
    },
    removeItem: (key) => {
      held.delete(key);
    },
  };
}

/**
 * The browser's `localStorage`, or `null` when it cannot be used — reading the property
 * throws in some privacy modes, and writing throws in others, so both are probed.
 */
export function browserStore(): KeyValueStore | null {
  try {
    const store = globalThis.localStorage;
    if (!store) return null;
    const probe = 'heroesim.probe';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const named = error as { name?: unknown; code?: unknown };
  return (
    named.name === 'QuotaExceededError' ||
    named.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    named.code === 22 ||
    named.code === 1014
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The Year a Day falls in, counting from one. Derived from the Career's own config. */
export function yearOf(career: Career): number {
  return Math.floor((career.day - 1) / career.config.daysPerYear) + 1;
}

/**
 * Build the storage adapter over a key/value store. Pass `browserStore()` in the app and
 * `null` to force the in-memory fallback, which is what a private-browsing window gets.
 */
export function createCareerStorage(backing: KeyValueStore | null): CareerStorage {
  const persistent = backing !== null;
  const store = backing ?? memoryStore();
  const warning = persistent
    ? undefined
    : 'Browser storage is not available in this window, so Careers are held in memory only and will be lost when you close the page.';

  function readIndex(): SlotIndexEntry[] {
    let raw: string | null;
    try {
      raw = store.getItem(SLOT_INDEX_KEY);
    } catch {
      return [];
    }
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry): entry is SlotIndexEntry => {
        if (typeof entry !== 'object' || entry === null) return false;
        const candidate = entry as Partial<SlotIndexEntry>;
        return typeof candidate.slot === 'string' && typeof candidate.day === 'number';
      });
    } catch {
      return [];
    }
  }

  function writeIndex(entries: SlotIndexEntry[]): void {
    store.setItem(SLOT_INDEX_KEY, JSON.stringify(entries));
  }

  return {
    persistent,
    ...(warning === undefined ? {} : { warning }),

    listSlots(): SlotIndexEntry[] {
      return readIndex();
    },

    has(slot: string): boolean {
      try {
        return store.getItem(careerKey(slot)) !== null;
      } catch {
        return false;
      }
    },

    save(slot: string, career: Career, savedOn: string): StorageResult {
      const document = serialiseCareer(career);
      try {
        store.setItem(careerKey(slot), document);
      } catch (error) {
        return {
          ok: false,
          message: isQuotaError(error)
            ? `There is no room left in browser storage, so slot ${slot} was not written. Clear a slot and try again.`
            : `Slot ${slot} could not be written: ${messageOf(error)}`,
        };
      }
      const entry: SlotIndexEntry = {
        slot,
        guildName: career.guild.name,
        day: career.day,
        year: yearOf(career),
        rosterSize: career.guild.roster.length,
        savedOn,
      };
      try {
        writeIndex([...readIndex().filter((held) => held.slot !== slot), entry]);
      } catch (error) {
        return {
          ok: false,
          message: `Slot ${slot} was written but the slot list was not updated: ${messageOf(error)}`,
        };
      }
      return { ok: true };
    },

    load(slot: string): LoadResult {
      let document: string | null;
      try {
        document = store.getItem(careerKey(slot));
      } catch (error) {
        return { ok: false, message: `Slot ${slot} could not be read: ${messageOf(error)}` };
      }
      if (document === null) return { ok: false, message: `Slot ${slot} is empty.` };
      try {
        // A refused save is left exactly where it is: nothing below writes.
        return { ok: true, career: deserialiseCareer(document) };
      } catch (error) {
        return {
          ok: false,
          message: `The save in slot ${slot} was refused and has been left untouched: ${messageOf(error)}`,
        };
      }
    },

    clear(slot: string): StorageResult {
      try {
        store.removeItem(careerKey(slot));
        writeIndex(readIndex().filter((held) => held.slot !== slot));
        return { ok: true };
      } catch (error) {
        return { ok: false, message: `Slot ${slot} could not be cleared: ${messageOf(error)}` };
      }
    },
  };
}
