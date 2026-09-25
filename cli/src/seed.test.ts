import { expect, test } from 'vitest';
import { readableSeed } from './seed.js';

function sequence(...draws: number[]): () => number {
  let index = 0;
  return () => draws[index++] ?? 0;
}

test('a readable seed is an adjective, an animal and four digits', () => {
  expect(readableSeed(sequence(0, 4 / 16, 0.4821))).toBe('amber-fox-4821');
  expect(readableSeed(sequence(0.999999, 0.999999, 0.999999))).toBe('wild-wren-9999');
  expect(readableSeed(sequence(0, 0, 0))).toBe('amber-badger-0000');
});

test('Math.random gives seeds of the same form', () => {
  for (let draw = 0; draw < 100; draw += 1) {
    expect(readableSeed(Math.random)).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
  }
});

test('a draw outside [0, 1) is a programming error', () => {
  expect(() => readableSeed(() => 1)).toThrow(RangeError);
});
