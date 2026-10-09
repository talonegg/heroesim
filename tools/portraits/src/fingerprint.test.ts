import { describe, expect, test } from 'vitest';
import { dHash, distance, drawnHeight, drawnWidth, hashBits, hashDistance, type Fingerprint } from './fingerprint.js';

// The fingerprint's arithmetic, on pixels made here: Chromium's part is proved on the
// committed pictures (chromium.test.ts) and on the owner's 40 (owner.test.ts).

/** RGBA pixels of the drawn size, each grey as `shade(x, y)` gives it. */
function pixels(shade: (x: number, y: number) => number): Uint8Array {
  const out = new Uint8Array(drawnWidth * drawnHeight * 4);
  for (let y = 0; y < drawnHeight; y += 1) {
    for (let x = 0; x < drawnWidth; x += 1) {
      const value = shade(x, y);
      out.set([value, value, value, 255], (y * drawnWidth + x) * 4);
    }
  }
  return out;
}

const bitsOf = (hash: string): string => [...hash].map((digit) => Number.parseInt(digit, 16).toString(2).padStart(4, '0')).join('');

describe('dHash()', () => {
  test('is 512 bits, 256 across and 256 down, in hexadecimal', () => {
    const hash = dHash(pixels(() => 128));
    expect(hashBits).toBe(512);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });

  test('sets each bit across where a cell is brighter than the next, and each bit down where it is brighter than the one below', () => {
    const darkeningRightwards = bitsOf(dHash(pixels((x) => 255 - x)));
    expect(darkeningRightwards.slice(0, 256)).toBe('1'.repeat(256));
    const darkeningDownwards = bitsOf(dHash(pixels((_x, y) => 255 - y)));
    expect(darkeningDownwards.slice(256)).toBe('1'.repeat(256));
  });

  test('is the same for a picture a little brighter, since it compares neighbours', () => {
    const drawing = (x: number, y: number): number => 100 + 60 * Math.sin(x / 9) * Math.cos(y / 13);
    expect(hashDistance(dHash(pixels(drawing)), dHash(pixels((x, y) => drawing(x, y) + 20)))).toBe(0);
  });

  test('refuses pixels of another size', () => {
    expect(() => dHash(new Uint8Array(16))).toThrow(/192 × 256 pixels were wanted/);
  });
});

describe('hashDistance() and distance()', () => {
  test('count the bits two hashes differ in', () => {
    expect(hashDistance('00', '00')).toBe(0);
    expect(hashDistance('0f', 'f0')).toBe(8);
    expect(hashDistance('81', '80')).toBe(1);
    expect(() => hashDistance('00', '000')).toThrow(/cannot be compared/);
  });

  test("take the nearest of one picture's whole hash to the other's whole or trimmed hashes, either way round", () => {
    const a: Fingerprint = { hash: 'ff', trimmed: ['0f'] };
    const b: Fingerprint = { hash: '00', trimmed: ['f0', 'fe'] };
    // ff–00 is 8; a's trimmed 0f–00 is 4; ff–b's trimmed fe is 1.
    expect(distance(a, b)).toBe(1);
    expect(distance(b, a)).toBe(1);
    expect(distance({ hash: 'ff', trimmed: [] }, { hash: '0f', trimmed: [] })).toBe(4);
  });
});
