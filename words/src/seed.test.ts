import { describe, expect, test } from 'vitest';
import { readableSeed } from './seed.js';

// The CLI's `new` and the page's new-game form draw their seed here (DL-186 item 1).

function sequence(...draws: number[]): () => number {
  let index = 0;
  return () => draws[index++] ?? 0;
}

describe('a readable seed is an adjective, an animal and four digits', () => {
  test.each([
    ['the first adjective, the fifth animal', [0, 4 / 16, 0.4821], 'amber-fox-4821'],
    ['the last of each', [0.999999, 0.999999, 0.999999], 'wild-wren-9999'],
    ['the first of each', [0, 0, 0], 'amber-badger-0000'],
  ])('%s', (_, draws, seed) => {
    expect(readableSeed(sequence(...draws))).toBe(seed);
  });
});

test('a draw outside [0, 1) is a programming error', () => {
  expect(() => readableSeed(() => 1)).toThrow(RangeError);
});
