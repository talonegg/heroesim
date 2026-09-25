import { describe, expect, test } from 'vitest';
import { findJsonUnsafe, isJsonSafe, type JsonUnsafeKind } from './index.js';

// data-model.md rule 6: no `Map`, `Set`, `Date`, class instances, `undefined`, `NaN` or
// `Infinity` anywhere in the document, so that `structuredClone` and `JSON.stringify` agree.

class Wallet {
  constructor(public coins: number) {}
}

function cyclic(): unknown {
  const guild: Record<string, unknown> = { name: 'The Iron Lantern' };
  guild.self = guild;
  return guild;
}

function holed(): unknown[] {
  const roster: unknown[] = ['hero-000001'];
  roster[2] = 'hero-000003';
  return roster;
}

// The last element, where present, is where the path ends below the value: a cycle is found
// where it closes, a hole at its position.
const forbidden: [name: string, value: () => unknown, kind: JsonUnsafeKind, within?: string][] = [
  ['undefined', () => undefined, 'undefined'],
  ['NaN', () => Number.NaN, 'nan'],
  ['Infinity', () => Number.POSITIVE_INFINITY, 'infinity'],
  ['-Infinity', () => Number.NEGATIVE_INFINITY, 'infinity'],
  ['a Map', () => new Map([['hero-000001', 1]]), 'map'],
  ['a Set', () => new Set(['hero-000001']), 'set'],
  // eslint-disable-next-line no-restricted-syntax -- a fixed instant as test data; nothing reads the clock (ADR-0001)
  ['a Date', () => new Date(0), 'date'],
  ['a function', () => () => 1, 'function'],
  ['a class instance', () => new Wallet(3), 'class-instance'],
  ['a typed array', () => new Uint32Array(4), 'class-instance'],
  ['a boxed number', () => Object(7), 'class-instance'],
  ['a symbol', () => Symbol('hero'), 'symbol'],
  ['a bigint', () => 10n, 'bigint'],
  // Rule 6's purpose, beyond its list: each of these makes the two copies disagree.
  ['negative zero', () => -0, 'negative-zero'],
  ['a cycle', cyclic, 'cycle', '.self'],
  ['an array with a hole', holed, 'array-hole', '[1]'],
];

describe('isJsonSafe', () => {
  test.each(forbidden)('refuses %s at the top level', (_name, value, kind) => {
    const found = value();

    expect(isJsonSafe(found)).toBe(false);
    expect(findJsonUnsafe(found)?.kind).toBe(kind);
  });

  test.each(forbidden)('refuses %s nested deep in a plain document, naming its path', (_name, value, kind, within = '') => {
    const hero = { name: 'Brenna', stats: { strength: 11, courage: value() } };
    const document = { world: { heroes: { 'hero-000001': hero }, board: [] } };

    expect(isJsonSafe(document)).toBe(false);
    expect(findJsonUnsafe(document)).toEqual({
      path: `$.world.heroes["hero-000001"].stats.courage${within}`,
      kind,
    });
  });

  test('names an array position in the path', () => {
    const document = { history: { entries: [{ turn: 0 }, { turn: Number.NaN }] } };

    expect(findJsonUnsafe(document)).toEqual({ path: '$.history.entries[1].turn', kind: 'nan' });
  });

  test('refuses an undefined property even though JSON.stringify would drop it silently', () => {
    expect(findJsonUnsafe({ hero: { injury: undefined } })).toEqual({
      path: '$.hero.injury',
      kind: 'undefined',
    });
  });

  test('accepts a nested plain document of objects, arrays, strings, finite numbers, booleans and null', () => {
    const document = {
      meta: { version: 1, seed: 'amber-fox-4821', createdAt: '2026-09-26' },
      world: {
        turn: 0,
        rng: { generation: [0, 4294967295, 12, 7] },
        ended: null,
        heroes: {
          'hero-000001': {
            stats: { strength: 11, arcana: 0.5, courage: -3 },
            skills: { swordplay: 2 },
            traits: [],
            injury: null,
            regard: { 'guild-000001': { value: 10, since: 0, reason: 'hero.recruited' } },
          },
        },
        board: ['quest-000001', 'quest-000002'],
        modules: { probe: { nested: [[1, [2, [3]]], { deeper: { still: true } }] } },
      },
      history: { entries: [], byEntity: {}, byType: {}, milestones: [] },
    };

    expect(isJsonSafe(document)).toBe(true);
    expect(findJsonUnsafe(document)).toBeNull();
    expect(JSON.parse(JSON.stringify(document))).toEqual(structuredClone(document));
  });

  test('accepts an object with no prototype, which JSON and structuredClone treat as plain', () => {
    const regard = Object.assign(Object.create(null) as object, { 'hero-000002': 3 });

    expect(isJsonSafe({ regard })).toBe(true);
  });

  test('accepts the same plain object reached twice, which is not a cycle', () => {
    const stats = { strength: 11 };

    expect(isJsonSafe({ base: stats, potential: stats })).toBe(true);
  });

  test.each([
    ['a string', 'hero-000001'],
    ['zero', 0],
    ['a boolean', false],
    ['null', null],
    ['an empty array', []],
    ['an empty object', {}],
  ])('accepts %s on its own', (_name, value) => {
    expect(isJsonSafe(value)).toBe(true);
  });
});
