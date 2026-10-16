import { beforeAll, describe, expect, test } from 'vitest';
import { advance } from './advance.js';
import { createWorld } from './create.js';
import type { World, WorldDocument } from './document.js';
import { deserialise, serialise } from './serialise.js';
import { copyWorld, writeOnce } from './world-copy.js';
import { testDeps } from './world.test-support.js';

// ADR-0011, DL-203: the per-Turn copy by hand. It must be the copy `structuredClone`
// made, key for key and in the same order at every depth, so the save is the same to the byte; the
// write-once rows frozen all the way down and shared by reference; everything else copied anew.
//
// One game is played, once (DL-246): every Turn's world is copied and compared as it is played, and
// the end is kept as its save's text, which each test loads afresh, so that no test plays a shared
// game forward (ADR-0008).

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
// A short year, so that Heroes age, retire and die, and the pool's Heroes leave it, within a test.
const deps = testDeps({ turnsPerYear: 12 });
const tables = ['heroes', 'guildmasters', 'guilds'] as const;

/**
 * Where `a` and `b` differ, at every depth: a value, an array for an object, a prototype, an
 * object's keys or their order, or a key's enumerability. Empty when they are equal with every
 * object's keys in the same order. A plain walk, asserted once by its caller: an `expect` a node
 * made the walk of a played world cost seconds (DL-246).
 */
function differences(a: unknown, b: unknown, path = 'world', found: string[] = []): string[] {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    if (!Object.is(a, b)) found.push(`${path}: ${String(a)} for ${String(b)}`);
    return found;
  }
  if (Array.isArray(a) !== Array.isArray(b)) found.push(`${path}: an array for an object, or the other way`);
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) found.push(`${path}: another prototype`);
  const keys = Reflect.ownKeys(a);
  const others = Reflect.ownKeys(b);
  if (keys.length !== others.length || keys.some((key, at) => key !== others[at])) {
    found.push(`${path}: keys ${keys.map(String).join(',')} for ${others.map(String).join(',')}`);
    return found;
  }
  for (const key of keys) {
    const one = Object.getOwnPropertyDescriptor(a, key);
    const other = Object.getOwnPropertyDescriptor(b, key);
    if (one?.enumerable !== other?.enumerable) found.push(`${path}.${String(key)}: enumerable ${String(one?.enumerable)}`);
    differences(one?.value, other?.value, `${path}.${String(key)}`, found);
  }
  return found;
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

/** The game every test reads: what its copies Turn by Turn showed, and its end as a save. */
interface Played {
  /** Every Turn's copy against `structuredClone`: where they differed, and whether their JSON did. */
  mismatches: string[];
  /** The write-once rows of every Turn's world, summed. */
  writtenOnce: number;
  /** The played end, which only the test that compares a load with it reads, never playing it on. */
  document: WorldDocument;
  /** The end's save. */
  text: string;
}

/** `seed`'s world played `turns` Turns, each Turn's world, and the last, copied and compared before the next is played. */
function play(seed: string, turns: number): Played {
  const mismatches: string[] = [];
  let writtenOnce = 0;
  const look = (world: World, turn: number): void => {
    const cloned = structuredClone(world);
    const copy = copyWorld(world);
    mismatches.push(...differences(copy, cloned).map((at) => `Turn ${turn}: ${at}`));
    if (JSON.stringify(copy) !== JSON.stringify(cloned)) mismatches.push(`Turn ${turn}: the JSON differs`);
    writtenOnce += writeOnceRows(world).length;
  };
  let document = createWorld(seed, setup, deps).document;
  for (let turn = 0; turn < turns; turn += 1) {
    look(document.world, turn);
    document = advance(document, deps).document;
  }
  look(document.world, turns);
  return { mismatches, writtenOnce, document, text: serialise(document) };
}

let played: Played;
beforeAll(() => {
  played = play('copy-a', 240);
}, 60_000);

/** The played game's end, loaded afresh: a document of the test's own. */
function loadedEnd(): WorldDocument {
  const loaded = deserialise(played.text, deps);
  if (!loaded.ok) throw new Error('the save did not load');
  return loaded.document;
}

/**
 * The end loaded afresh, with its first Hero retired: the game played to the end holds no Hero out of play
 * since the Contracts moved its play (DL-315), and these tests need one to share and to write to.
 */
function loadedEndWithARetiredHero(): World {
  const { world } = loadedEnd();
  const hero = Object.values(world.heroes)[0];
  if (hero === undefined) throw new Error('no Hero');
  hero.retiredOnTurn = world.turn;
  return world;
}

describe('copyWorld', () => {
  test("copies a played world as structuredClone does, every Turn: equal, every object's keys in the same order, the same save", () => {
    expect(played.mismatches).toEqual([]);
    // The played worlds held write-once rows to share: dead, retired and gone Heroes among them.
    expect(played.writtenOnce).toBeGreaterThan(0);
  });

  test('shares each write-once row frozen all the way down, and copies every other object anew, none frozen', () => {
    const world = loadedEndWithARetiredHero();
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
    expect(differences(copy, structuredClone(world))).toEqual([]);
    const proto = ((copy.modules.odd as Record<string, unknown[]>)['2'] as unknown[])[1] as object;
    expect(Object.getPrototypeOf(proto)).toBe(Object.prototype);
    expect(Object.keys(proto)).toEqual(['__proto__']);
  });

  test('advance shares the write-once rows between the document given and the one it returns, and leaves the given one as it was', () => {
    const given = loadedEnd();
    // The History is shared and appended to (ADR-0008): the world given is what must stay as it was.
    const text = JSON.stringify(given.world);
    const { document: next } = advance(given, deps);

    expect(JSON.stringify(given.world)).toBe(text);
    const shared = writeOnceRows(given.world);
    expect(shared.length).toBeGreaterThan(0);
    for (const table of tables) {
      for (const [id, row] of Object.entries(given.world[table])) {
        if (writeOnce[table](row as never)) expect((next.world[table] as Record<string, object>)[id]).toBe(row);
      }
    }
  });

  test("a loaded save's write-once rows are not frozen until its first copy, and it plays on as the document it was saved from", () => {
    const loaded = loadedEnd();
    const rows = writeOnceRows(loaded.world);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => Object.isFrozen(row))).toBe(false);

    // The played document, given a History of its own, so that playing it on appends to no shared
    // one; `advance` copies its world and leaves it as it was.
    let saved: WorldDocument = { ...played.document, history: structuredClone(played.document.history) };
    let again = loaded;
    for (let turn = 0; turn < 24; turn += 1) {
      saved = advance(saved, deps).document;
      again = advance(again, deps).document;
      // A save's keys are sorted (`serialise`), so the two compare as saves.
      expect(serialise(again)).toBe(serialise(saved));
    }
    expect(rows.every((row) => frozenThrough(row))).toBe(true);
  });

  test('a write to a write-once row throws once it is shared, in the engine as in this strict-mode test', () => {
    const world = loadedEndWithARetiredHero();
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
