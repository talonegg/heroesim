import { afterEach, describe, expect, test, vi } from 'vitest';
import type { WorldDocument } from './document.js';
import { findJsonUnsafe } from './json-safe.js';
import { serialise } from './serialise.js';
import { buildDocument } from './world.test-support.js';

// The save written in one walk (DL-238): `serialise` checks that a document is JSON-safe (data-model
// rule 6) as it writes it, and walks it again with `findJsonUnsafe` only to name what it refuses.

// The engine's check, watched as it is, to count the walks a save takes.
vi.mock('./json-safe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./json-safe.js')>();
  return { ...actual, findJsonUnsafe: vi.fn(actual.findJsonUnsafe) };
});

afterEach(() => {
  vi.mocked(findJsonUnsafe).mockClear();
});

class Thing {
  value = 1;
}

/** A cycle: an object holding itself, its keys in order (`sorted`) or not. */
function cycle(sorted: boolean): object {
  const object: Record<string, unknown> = sorted ? { a: 1 } : { z: 1, a: 1 };
  object.self = sorted ? { b: object } : { z: 1, b: object };
  return object;
}

/** Every value rule 6 refuses, by the kind `findJsonUnsafe` names. */
const unsafe: [string, () => unknown][] = [
  ['undefined', () => undefined],
  ['nan', () => Number.NaN],
  ['infinity', () => Number.POSITIVE_INFINITY],
  ['negative infinity', () => Number.NEGATIVE_INFINITY],
  ['negative-zero', () => -0],
  ['bigint', () => 1n],
  ['symbol', () => Symbol('s')],
  ['function', () => () => 1],
  ['map', () => new Map()],
  ['set', () => new Set()],
  // eslint-disable-next-line no-restricted-syntax -- a fixed instant as test data; nothing reads the clock (ADR-0001)
  ['date', () => new Date(0)],
  ['class-instance', () => new Thing()],
  ['an object of another prototype', () => Object.create({ inherited: 1 }) as object],
  ['an array of another class', () => new (class extends Array {})()],
  ['a boxed number', () => new Number(1)],
  ['array-hole', () => [1, , 2]], // eslint-disable-line no-sparse-arrays -- the hole is the case
  ['an own toJSON', () => ({ toJSON: () => 1 })],
  ['a sorted cycle', () => cycle(true)],
  ['an unsorted cycle', () => cycle(false)],
];

/** Where in a document a value stands: each a different way the writer meets it. */
const places: [string, (value: unknown) => unknown][] = [
  ['alone in its object', (value) => ({ a: value })],
  ['in an object whose keys are out of order', (value) => ({ z: 1, a: value })],
  ['in a list', (value) => [1, value]],
  ['deep among sorted objects', (value) => ({ a: { b: [{ c: value }] } })],
  ['under an array-index key', (value) => ({ z: 1, 10: value })],
  ['under an own __proto__ key', (value) => Object.defineProperty({ z: 1 }, '__proto__', { value, enumerable: true, writable: true, configurable: true })],
];

describe('serialise checks the document as it writes it', () => {
  test('writes a JSON-safe save in one walk: no second walk to check it', () => {
    const { document } = buildDocument();

    const text = serialise(document);

    expect(JSON.parse(text)).toEqual(document);
    expect(vi.mocked(findJsonUnsafe)).not.toHaveBeenCalled();
  });

  test.each(places)('refuses every unsafe value %s, naming its path and kind as findJsonUnsafe does', (_place, put) => {
    for (const [name, make] of unsafe) {
      const document = { ...buildDocument().document, odd: put(make()) } as unknown as WorldDocument;
      const found = findJsonUnsafe(document);
      expect(found, name).not.toBeNull();

      expect(() => serialise(document), name).toThrow(
        new TypeError(`Only a JSON-safe document serialises: ${found?.path} is ${found?.kind} (data-model rule 6)`),
      );
    }
  });

  test('refuses an unsafe value in a row and in a History entry, as findJsonUnsafe names it', () => {
    const { document, ids } = buildDocument();
    Object.assign(document.world.heroes[ids.idleHero as never] as object, { morale: Number.NaN });
    expect(() => serialise(document)).toThrow(`$.world.heroes["${ids.idleHero}"].morale is nan`);

    const other = buildDocument().document;
    // eslint-disable-next-line no-restricted-syntax -- a fixed instant as test data; nothing reads the clock (ADR-0001)
    Object.assign(other.history.entries[3]?.payload as object, { when: new Date(0) });
    expect(() => serialise(other)).toThrow('$.history.entries[3].payload.when is date');
  });
});
