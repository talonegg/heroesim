/**
 * Slots on disk: a write that cannot leave half a document behind, a listing, a load
 * that refuses anything it cannot trust, and a delete (E1-S7, DL-02).
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { newCareer, SaveError, serialiseCareer, type Career } from '@heroesim/engine';
import { loadContentFromDisk } from '@heroesim/content/node';
import {
  AUTOSAVE_SLOT,
  checkSlotName,
  deleteSlot,
  deleteSlotForCareer,
  listSlots,
  loadSlot,
  saveSlot,
  slotPath,
} from '../src/saves.js';

const content = loadContentFromDisk();
const career: Career = newCareer('saves', content).career;
const other: Career = newCareer('saves-elsewhere', content).career;

const root = mkdtempSync(join(tmpdir(), 'heroesim-saves-'));
let dir = root;
let run = 0;

beforeEach(() => {
  run += 1;
  dir = join(root, `run-${run}`);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('saving', () => {
  it('creates the Career directory and writes the slot', () => {
    const path = saveSlot(dir, 'one', career);
    expect(path).toBe(slotPath(dir, 'one'));
    expect(readdirSync(dir)).toEqual(['one.json']);
  });

  it('writes atomically: nothing half-written is left beside the slot', () => {
    saveSlot(dir, 'one', career);
    saveSlot(dir, 'one', career);
    expect(readdirSync(dir).filter((name) => name.includes('.writing'))).toEqual([]);
  });

  it('replaces a slot rather than failing on the second save', () => {
    saveSlot(dir, 'one', career);
    saveSlot(dir, 'one', other);
    expect(loadSlot(dir, 'one').seed).toBe(other.seed);
  });

  it('refuses a slot name that could walk out of the directory', () => {
    expect(() => saveSlot(dir, '../escape', career)).toThrow(SaveError);
    expect(() => saveSlot(dir, 'a/b', career)).toThrow(SaveError);
    expect(() => checkSlotName('')).toThrow(SaveError);
    expect(checkSlotName('auto_save-1.a')).toBe('auto_save-1.a');
  });
});

describe('loading', () => {
  it('gives back exactly the Career that was saved', () => {
    saveSlot(dir, 'one', career);
    expect(loadSlot(dir, 'one')).toEqual(career);
  });

  it('refuses a slot that is not there', () => {
    expect(() => loadSlot(dir, 'nothing')).toThrow(SaveError);
    expect(() => loadSlot(dir, 'nothing')).toThrow(/nothing saved in slot "nothing"/);
  });

  it('refuses a save written by another format version, and says so', () => {
    saveSlot(dir, 'one', career);
    const raw = JSON.parse(readFileSync(slotPath(dir, 'one'), 'utf8')) as Record<string, unknown>;
    raw['formatVersion'] = 2;
    writeFileSync(slotPath(dir, 'one'), JSON.stringify(raw), 'utf8');

    expect(() => loadSlot(dir, 'one')).toThrow(SaveError);
    expect(() => loadSlot(dir, 'one')).toThrow(/format version 2/);
    expect(() => loadSlot(dir, 'one')).toThrow(/slot "one"/);
  });

  it('refuses a save that is not JSON at all', () => {
    saveSlot(dir, 'one', career);
    writeFileSync(slotPath(dir, 'one'), 'not a save', 'utf8');
    expect(() => loadSlot(dir, 'one')).toThrow(SaveError);
  });

  it('refuses a save that is missing part of the world', () => {
    saveSlot(dir, 'one', career);
    const raw = JSON.parse(readFileSync(slotPath(dir, 'one'), 'utf8')) as Record<string, unknown>;
    delete raw['guild'];
    writeFileSync(slotPath(dir, 'one'), JSON.stringify(raw), 'utf8');
    expect(() => loadSlot(dir, 'one')).toThrow(SaveError);
  });
});

describe('listing', () => {
  it('finds nothing in a directory that does not exist', () => {
    expect(listSlots(join(dir, 'never-made'))).toEqual([]);
  });

  it('reports each slot with the Guild, the Day and the seed', () => {
    saveSlot(dir, 'one', career);
    saveSlot(dir, AUTOSAVE_SLOT, other);
    const slots = listSlots(dir);
    expect(slots.map((slot) => slot.name)).toEqual([AUTOSAVE_SLOT, 'one']);
    const one = slots.find((slot) => slot.name === 'one');
    expect(one).toMatchObject({ day: career.day, seed: career.seed, guildName: career.guild.name });
  });

  it('reports a file it cannot read rather than refusing to list at all', () => {
    saveSlot(dir, 'one', career);
    writeFileSync(slotPath(dir, 'broken'), '{ not json', 'utf8');
    const slots = listSlots(dir);
    expect(slots.map((slot) => slot.name)).toEqual(['broken', 'one']);
    expect(slots.find((slot) => slot.name === 'broken')?.problem).toBeDefined();
  });

  it('ignores anything that is not a slot', () => {
    saveSlot(dir, 'one', career);
    writeFileSync(join(dir, 'notes.txt'), 'hello', 'utf8');
    expect(listSlots(dir).map((slot) => slot.name)).toEqual(['one']);
  });
});

describe('deleting', () => {
  it('says whether there was anything to delete', () => {
    saveSlot(dir, 'one', career);
    expect(deleteSlot(dir, 'one')).toBe(true);
    expect(deleteSlot(dir, 'one')).toBe(false);
    expect(listSlots(dir)).toEqual([]);
  });

  it('clears the autosave when the Career it holds is the one that ended', () => {
    saveSlot(dir, AUTOSAVE_SLOT, career);
    expect(deleteSlotForCareer(dir, AUTOSAVE_SLOT, career)).toBe(true);
    expect(listSlots(dir)).toEqual([]);
  });

  it('leaves another Career’s autosave alone', () => {
    saveSlot(dir, AUTOSAVE_SLOT, other);
    expect(deleteSlotForCareer(dir, AUTOSAVE_SLOT, career)).toBe(false);
    expect(listSlots(dir).map((slot) => slot.name)).toEqual([AUTOSAVE_SLOT]);
  });

  it('is content when there is no autosave to clear', () => {
    expect(deleteSlotForCareer(dir, AUTOSAVE_SLOT, career)).toBe(false);
  });
});

describe('the serialiser is the engine’s', () => {
  it('writes exactly what the engine writes', () => {
    const path = saveSlot(dir, 'one', career);
    expect(readFileSync(path, 'utf8')).toBe(serialiseCareer(career));
  });
});
