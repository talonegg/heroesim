/**
 * The Career's randomness: a seeded xoshiro128** generator whose four 32-bit words live
 * on the Career and are serialised with it (DL-07). Nothing here consults `Math.random`.
 *
 * Every function is pure: it takes a state and returns a value together with the next
 * state. Callers thread the state themselves, or use {@link rngOn}, which reads and
 * writes `career.rng` on a Career draft the caller already owns.
 */

import { EngineError } from './errors.js';

/** The four 32-bit words of a xoshiro128** generator. Plain data; part of the save. */
export type RngState = [number, number, number, number];

/** A drawn value together with the state to draw from next. */
export interface RngDraw<T> {
  /** The value drawn. */
  value: T;
  /** The generator state after the draw. */
  state: RngState;
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** FNV-1a over the seed text, as the starting point for the word expansion. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** splitmix32, used only to expand the seed hash into four well-mixed words. */
function splitmix32(state: number): { value: number; next: number } {
  const next = (state + 0x9e3779b9) >>> 0;
  let mixed = next;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x21f0aaad);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x735a2d97);
  mixed ^= mixed >>> 15;
  return { value: mixed >>> 0, next };
}

/**
 * Turn a seed string into a generator state. The same seed always gives the same state,
 * and no word is ever zero (an all-zero xoshiro state never leaves zero).
 */
export function seedRng(seed: string): RngState {
  let carry = fnv1a(seed);
  const words: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const drawn = splitmix32(carry);
    carry = drawn.next;
    words.push(drawn.value === 0 ? 0x9e3779b9 + index : drawn.value);
  }
  const [a, b, c, d] = words;
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new EngineError('InternalError', 'the seed expansion produced fewer than four words');
  }
  return [a, b, c, d];
}

/** One raw 32-bit draw from xoshiro128**. */
export function nextUint32(state: RngState): RngDraw<number> {
  const [s0, s1, s2, s3] = state;
  const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  let n2 = (s2 ^ s0) >>> 0;
  let n3 = (s3 ^ s1) >>> 0;
  const n1 = (s1 ^ n2) >>> 0;
  const n0 = (s0 ^ n3) >>> 0;
  n2 = (n2 ^ t) >>> 0;
  n3 = rotl(n3, 11);
  return { value: result, state: [n0, n1, n2, n3] };
}

/** A draw in `[0, 1)`. */
export function nextFloat(state: RngState): RngDraw<number> {
  const drawn = nextUint32(state);
  return { value: drawn.value / 0x100000000, state: drawn.state };
}

/** A draw in `[0, max)`. `max` must be a positive integer. */
export function nextInt(state: RngState, max: number): RngDraw<number> {
  if (!Number.isInteger(max) || max < 1) {
    throw new EngineError('InternalError', `nextInt needs a positive whole bound, not ${String(max)}`);
  }
  const drawn = nextFloat(state);
  return { value: Math.min(max - 1, Math.floor(drawn.value * max)), state: drawn.state };
}

/** A cursor that draws from a Career draft, advancing `career.rng` as it goes. */
export interface Rng {
  /** A whole number in `[0, max)`. */
  int(max: number): number;
  /** A whole number in `[low, high]`, inclusive at both ends. */
  between(low: number, high: number): number;
  /** A fraction in `[0, 1)`. */
  float(): number;
  /** True with the given probability. */
  chance(probability: number): boolean;
  /** One item, uniformly. The collection must not be empty. */
  pick<T>(items: readonly T[]): T;
  /** A copy of the collection in a random order. */
  shuffle<T>(items: readonly T[]): T[];
}

/** Something carrying a generator state that may be advanced in place. */
interface HasRng {
  rng: RngState;
}

/**
 * Bind a cursor to a draft the caller owns. Every draw writes the new state back, so a
 * caller can never forget to thread it. The draft is always a private copy — public
 * engine functions never mutate their arguments.
 */
export function rngOn(draft: HasRng): Rng {
  const rng: Rng = {
    int(max: number): number {
      const drawn = nextInt(draft.rng, max);
      draft.rng = drawn.state;
      return drawn.value;
    },
    between(low: number, high: number): number {
      if (high <= low) return low;
      return low + rng.int(high - low + 1);
    },
    float(): number {
      const drawn = nextFloat(draft.rng);
      draft.rng = drawn.state;
      return drawn.value;
    },
    chance(probability: number): boolean {
      return rng.float() < probability;
    },
    pick<T>(items: readonly T[]): T {
      const item = items[rng.int(items.length)];
      if (item === undefined) {
        throw new EngineError('InternalError', 'cannot pick from an empty collection');
      }
      return item;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = rng.int(index + 1);
        const here = copy[index];
        const there = copy[swap];
        if (here === undefined || there === undefined) {
          throw new EngineError('InternalError', 'shuffle read past the end of the collection');
        }
        copy[index] = there;
        copy[swap] = here;
      }
      return copy;
    },
  };
  return rng;
}
