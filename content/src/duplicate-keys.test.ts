import { describe, expect, test } from 'vitest';
import { findDuplicateKeys } from './duplicate-keys.js';

// JSON.parse keeps the last of two equal keys in an object and says nothing, so a row written
// twice would silently replace the first. findDuplicateKeys reads the raw text instead.

describe('findDuplicateKeys', () => {
  test('finds none in an object whose keys are distinct', () => {
    expect(findDuplicateKeys('{ "a": 1, "b": { "a": 2 }, "c": [{ "a": 3 }, { "a": 4 }] }')).toEqual([]);
  });

  test('finds a key repeated at the top level, with its line', () => {
    expect(findDuplicateKeys('{\n  "a": 1,\n  "b": 2,\n  "a": 3\n}')).toEqual([
      { key: 'a', path: [], line: 4 },
    ]);
  });

  test('finds a key repeated inside a nested object, naming the path to it', () => {
    expect(findDuplicateKeys('{ "warrior": { "growth": { "strength": 1, "strength": 2 } } }')).toEqual([
      { key: 'strength', path: ['warrior', 'growth'], line: 1 },
    ]);
  });

  test('finds a key repeated inside an object in an array, naming its index', () => {
    expect(findDuplicateKeys('{ "rows": [{ "x": 1 }, { "x": 1, "x": 2 }] }')).toEqual([
      { key: 'x', path: ['rows', '1'], line: 1 },
    ]);
  });

  test('is not misled by strings that hold quotes, braces, commas or colons', () => {
    const text = '{ "a": "x\\"}, \\"a\\": {", "b": ["{", "\\\\"], "c\\"d": 1, "c\\"d": 2 }';

    expect(JSON.parse(text)).toBeDefined();
    expect(findDuplicateKeys(text)).toEqual([{ key: 'c"d', path: [], line: 1 }]);
  });

  test('compares keys as JSON reads them, escapes decoded', () => {
    expect(findDuplicateKeys('{ "a": 1, "\\u0061": 2 }')).toEqual([{ key: 'a', path: [], line: 1 }]);
  });
});
