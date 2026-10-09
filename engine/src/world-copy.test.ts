import { describe, expect, test } from 'vitest';
import { advance } from './advance.js';
import { createWorld } from './create.js';
import type { World, WorldDocument } from './document.js';
import { deserialise, serialise } from './serialise.js';
import { copyWorld, writeOnce } from './world-copy.js';
import { testDeps } from './world.test-support.js';

// ADR-0011, DL-203: the per-Turn copy by hand. It must be the copy `structuredClone`
// made, key for key and in the same order at every depth, so the save is the same to the byte; the
// write-once rows frozen all the way down and shared by reference; everything else copied anew.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
// A short year, so that Heroes age, retire and die, and the pool's Heroes leave it, within a test.
const deps = testDeps({ turnsPerYear: 12 });
const tables = ['heroes', 'guildmasters', 'guilds'] as const;

/** Fails unless `a` and `b` are equal with every object's keys in the same order, at every depth. */
function expectSameInOrder(a: unknown, b: unknown, path = 'world'): void {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    expect(Object.is(a, b), path).toBe(true);
    return;
  }
  expect(Array.isArray(a), path).toBe(Array.isArray(b));
  expect(Object.getPrototypeOf(a), path).toBe(Object.getPrototypeOf(b));
  const keys = Reflect.ownKeys(a);
  expect(keys, path).toEqual(Reflect.ownKeys(b));
  for (const key of keys) {
    const one = Object.getOwnPropertyDescriptor(a, key);
    const other = Object.getOwnPropertyDescriptor(b, key);
    expect(one?.enumerable, `${path}.${String(key)}`).toBe(other?.enumerable);
    expectSameInOrder(one?.value, other?.value, `${path}.${String(key)}`);
  }
}

/** Every object reached from `value`, but those `skip` holds and what they hold. */
function objectsOf(value: unknown, skip: ReadonlySet<object>, into = new Set<object>()): Set<object> {
  if (typeof value !== 'object' || value === null || skip.has(value) || into.has(value)) return into;
  into.add(value);
  for (const inner of Object.values(value)) objectsOf(inner, skip, into);
  return into;
}

/** Whether `value` and everything it holds is frozen. */
function frozenThrough(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(frozenThrough);
}

/** The write-once rows of `world`, by table. */
function writeOnceRows(world: World): object[] {
  return tables.flatMap((table) => Object.values(world[table] as Record<string, never>).filter((row) => writeOnce[table](row)));
}

/** `seed`'s world played `turns` Turns, every `every`th world handed to `look` before it is copied. */
function play(seed: string, turns: number, every: number, look: (world: World) => void): WorldDocument {
  let document = createWorld(seed, setup, deps).document;
  for (let turn = 0; turn < turns; turn += 1) {
    if (turn % every === 0) look(document.world);
    document = advance(document, deps).document;
  }
  look(document.world);
  return document;
}

describe('copyWorld', () => {
  test("copies a played world as structuredClone does: equal, every object's keys in the same order, the same save", { timeout: 60_000 }, () => {
    let writtenOnce = 0;
    for (const seed of ['copy-a', 'copy-b', 'copy-c']) {
      play(seed, 240, 7, (world) => {
        const cloned = structuredClone(world);
        const copy = copyWorld(world);
        expect(copy).toEqual(cloned);
        expectSameInOrder(copy, cloned);
        expect(JSON.stringify(copy)).toBe(JSON.stringify(cloned));
        writtenOnce += writeOnceRows(world).length;
      });
    }
    // The played worlds held write-once rows to share: dead, retired and gone Heroes among them.
    expect(writtenOnce).toBeGreaterThan(0);
  });

  test('a document with the copy saves to the same text as one with structuredClone, Turn after Turn', { timeout: 30_000 }, () => {
    let document = createWorld('copy-save', setup, deps).document;
    for (let turn = 0; turn < 120; turn += 1) {
      document = advance(document, deps).document;
      const { meta, history } = document;
      expect(serialise({ meta, world: copyWorld(document.world), history })).toBe(serialise({ meta, world: structuredClone(document.world), history }));
    }
  });

  test('shares each write-once row frozen all the way down, and copies every other object anew, none frozen', () => {
    const world = play('copy-share', 240, 1000, () => {}).world;
    const shared = writeOnceRows(world);
    const kinds = tables.map((table) => Object.values(world[table] as Record<string, never>).filter((row) => writeOnce[table](row)).length);
    expect(kinds[0]).toBeGreaterThan(0);

    const copy = copyWorld(world);
    for (const table of tables) {
      for (const [id, row] of Object.entries(world[table])) {
        const copied = (copy[table] as Record<string, object>)[id];
        if (writeOnce[table](row as never)) {
          expect(copied).toBe(row);
          expect(frozenThrough(row)).toBe(true);
        } else {
          expect(copied).not.toBe(row);
          expect(Object.isFrozen(copied)).toBe(false);
        }
      }
    }
    // Nothing but the shared rows is shared: no object of the copy outside them is the world's.
    const skip = new Set<object>(shared);
    const ours = objectsOf(world, skip);
    for (const object of objectsOf(copy, skip)) expect(ours.has(object)).toBe(false);
    for (const object of objectsOf(copy, skip)) expect(Object.isFrozen(object)).toBe(false);
  });

  test('copies what a JSON-safe value may hold as structuredClone does: keys that are indexes, `__proto__` as an own key, undefined, -0', () => {
    const world = createWorld('copy-odd', setup, deps).document.world;
    const odd = JSON.parse('{"b": 1, "2": [1, {"__proto__": {"x": 1}}], "a": {"1": null, "z": -0}, "10": "ten"}') as Record<string, unknown>;
    (odd.a as Record<string, unknown>).gone = undefined;
    world.modules = { odd };
    const copy = copyWorld(world);
    expectSameInOrder(copy, structuredClone(world));
    const proto = ((copy.modules.odd as Record<string, unknown[]>)['2'] as unknown[])[1] as object;
    expect(Object.getPrototypeOf(proto)).toBe(Object.prototype);
    expect(Object.keys(proto)).toEqual(['__proto__']);
  });

  test('advance shares the write-once rows between the document given and the one it returns, and leaves the given one as it was', () => {
    const played = play('copy-advance', 240, 1000, () => {});
    // The History is shared and appended to (ADR-0008): the world given is what must stay as it was.
    const text = JSON.stringify(played.world);
    const { document: next } = advance(played, deps);

    expect(JSON.stringify(played.world)).toBe(text);
    const shared = writeOnceRows(played.world);
    expect(shared.length).toBeGreaterThan(0);
    for (const table of tables) {
      for (const [id, row] of Object.entries(played.world[table])) {
        if (writeOnce[table](row as never)) expect((next.world[table] as Record<string, object>)[id]).toBe(row);
      }
    }
  });

  test("a loaded save's write-once rows are not frozen until its first copy, and it plays on as the document it was saved from", () => {
    const played = play('copy-load', 240, 1000, () => {});
    const loaded = deserialise(serialise(played), deps);
    if (!loaded.ok) throw new Error('the save did not load');
    const rows = writeOnceRows(loaded.document.world);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => Object.isFrozen(row))).toBe(false);

    let saved = played;
    let again = loaded.document;
    for (let turn = 0; turn < 24; turn += 1) {
      saved = advance(saved, deps).document;
      again = advance(again, deps).document;
      // A save's keys are sorted (`serialise`), so the two compare as saves.
      expect(serialise(again)).toBe(serialise(saved));
    }
    expect(rows.every((row) => frozenThrough(row))).toBe(true);
  });

  test('a write to a write-once row throws once it is shared, in the engine as in this strict-mode test', () => {
    const world = play('copy-write', 240, 1000, () => {}).world;
    copyWorld(world);
    const hero = Object.values(world.heroes).find((row) => writeOnce.heroes(row));
    if (hero === undefined) throw new Error('no Hero out of play');
    expect(() => {
      hero.morale = 1;
    }).toThrow(TypeError);
    expect(() => {
      hero.traits.push('brave' as never);
    }).toThrow(TypeError);
    expect(() => {
      (hero.regard as Record<string, unknown>)['hero-999999'] = { value: 1, since: 0, reason: 'writer' };
    }).toThrow(TypeError);
    expect(() => {
      (hero.stats as Record<string, number>).strength = 99;
    }).toThrow(TypeError);
  });
});
