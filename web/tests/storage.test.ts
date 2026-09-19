import { beforeEach, describe, expect, it } from 'vitest';
import { deserialiseCareer, newCareer, serialiseCareer } from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import {
  AUTOSAVE_SLOT,
  careerKey,
  createCareerStorage,
  memoryStore,
  NAMED_SLOTS,
  SLOT_INDEX_KEY,
  yearOf,
  type KeyValueStore,
} from '../src/state/storage';

const content = loadContentFromDisk();
const { career } = newCareer('storage-test', content);

const SAVED_ON = '2026-09-19T10:00:00.000Z';

/** A store whose writes always fail the way a full `localStorage` fails. */
function fullStore(): KeyValueStore {
  const held = memoryStore();
  return {
    getItem: (key) => held.getItem(key),
    removeItem: (key) => {
      held.removeItem(key);
    },
    setItem: () => {
      const error = new Error('the quota has been exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    },
  };
}

describe('browser saves', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('stores exactly what serialiseCareer returns, and reads it back deep-equal', () => {
    const storage = createCareerStorage(globalThis.localStorage);
    expect(storage.save('1', career, SAVED_ON)).toEqual({ ok: true });

    expect(globalThis.localStorage.getItem(careerKey('1'))).toBe(serialiseCareer(career));

    const loaded = storage.load('1');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.career).toEqual(career);
  });

  it('a document written here deserialises with the engine, as the CLI would read it', () => {
    const storage = createCareerStorage(globalThis.localStorage);
    storage.save('2', career, SAVED_ON);
    const raw = globalThis.localStorage.getItem(careerKey('2')) ?? '';
    expect(deserialiseCareer(raw)).toEqual(career);
  });

  it('keeps a slot index that never needs a Career deserialised', () => {
    const storage = createCareerStorage(globalThis.localStorage);
    storage.save('1', career, SAVED_ON);
    expect(storage.listSlots()).toEqual([
      {
        slot: '1',
        guildName: career.guild.name,
        day: career.day,
        year: yearOf(career),
        rosterSize: career.guild.roster.length,
        savedOn: SAVED_ON,
      },
    ]);
    expect(globalThis.localStorage.getItem(SLOT_INDEX_KEY)).toContain(career.guild.name);
  });

  it('has three named slots and an autosave', () => {
    expect(NAMED_SLOTS).toEqual(['1', '2', '3']);
    expect(careerKey(AUTOSAVE_SLOT)).toBe('heroesim.career.autosave');
  });

  it('clearing a slot empties it and drops it from the index', () => {
    const storage = createCareerStorage(globalThis.localStorage);
    storage.save('3', career, SAVED_ON);
    expect(storage.has('3')).toBe(true);
    expect(storage.clear('3')).toEqual({ ok: true });
    expect(storage.has('3')).toBe(false);
    expect(storage.listSlots()).toEqual([]);
    expect(storage.load('3')).toEqual({ ok: false, message: 'Slot 3 is empty.' });
  });

  it('reports a full quota as a sentence naming the slot, and drops nothing silently', () => {
    const storage = createCareerStorage(fullStore());
    const result = storage.save('1', career, SAVED_ON);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('slot 1');
    expect(result.message).toContain('no room');
  });

  it('degrades to memory when localStorage throws, and says so', () => {
    const storage = createCareerStorage(null);
    expect(storage.persistent).toBe(false);
    expect(storage.warning).toContain('memory');
    expect(storage.save('1', career, SAVED_ON)).toEqual({ ok: true });
    const loaded = storage.load('1');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.career.guild.name).toBe(career.guild.name);
  });

  it('refuses a save whose formatVersion does not match, and leaves it untouched', () => {
    const wrong = serialiseCareer(career).replace('"formatVersion": 1', '"formatVersion": 99');
    globalThis.localStorage.setItem(careerKey('1'), wrong);

    const storage = createCareerStorage(globalThis.localStorage);
    const result = storage.load('1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('refused');
    expect(globalThis.localStorage.getItem(careerKey('1'))).toBe(wrong);
  });

  it('survives a slot index that is not the JSON it should be', () => {
    globalThis.localStorage.setItem(SLOT_INDEX_KEY, 'not json at all');
    const storage = createCareerStorage(globalThis.localStorage);
    expect(storage.listSlots()).toEqual([]);
  });
});
