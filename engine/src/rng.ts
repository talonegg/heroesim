// Named random streams, one per subsystem that draws (ADR-0001, ADR-0009 as amended
// 2026-09-26, data-model §3.1). The generator is xoshiro128** seeded through cyrb128 (DL-12).
//
// A stream's state is four unsigned 32-bit integers in a plain array, kept in `world.rng`, so
// it is saved, cloned and compared with the rest of the document (data-model rule 6). Drawing
// mutates that array in place: the state lives inside the per-Turn copy of `world`, so a draw
// never touches a document a caller still holds (data-model §1).
//
// Every draw function takes a fixed number of draws, whatever its arguments: one each for
// `next`, `int`, `pick`, `chance` and `weightedPick`, and `length - 1` for `shuffle`. A rule's draw count, and
// so every later draw, then depends only on which calls it makes, never on the values it
// passes.
//
// Changing anything in this file that changes a draw changes every seed's game. Saves are
// snapshots, so that is survivable (ADR-0001), but it is a DL-12 decision, not a refactor; the
// pinned draws in rng.test.ts fail first.

/**
 * The core streams. Each is added in the milestone that introduces the subsystem that draws
 * from it — `quests`, `encounters`, `pool`, `heroes`, `progression`, `rivals` and `market`
 * follow `board`, in the order their milestones land — and a new subsystem never shares an old
 * stream (ADR-0009 as amended, pre-M0 review D7). M1 draws only to generate the world.
 *
 * Adding one is appending its name here. A stream depends only on the master seed and its own
 * name, so a document saved before the name existed gains the stream a new world would have
 * had, `createStreams(meta.seed, [name])`, the first time it is played: `advance` calls
 * `ensureStreams` on its copy of `world` (M2-S3, DL-25). No migration is needed and no other
 * stream moves.
 *
 * `board` (M2-S3) draws the Quests the Board offers; `quests` (M2-S5) the Quest Engine's
 * resolutions; `pool` (M2-S8) the Unattached pool's refill; `heroes` (M2-S6) the Hero State
 * Engine's Retirement checks; `progression` (M3-S1) the growth points of a Level gained (DL-36);
 * `encounters` (M4-S1) each Quest's Encounter sequence, drawn beside the Board's draws so that
 * the Board a seed produces is what it was before M4 (DL-42).
 * `rivals` (M2-S9) is the Rival controllers' own: a Disposition draws from it and from no other,
 * and `steady` draws nothing (DL-30). `market` (M5-S4) the Market Engine's morning refresh of the
 * Market's stacks (DL-51). `portraits` (v1.1.2-S3) the player's Guildmaster's Portrait when the
 * setup chooses none, one draw at creation (DL-125 item 3, DL-130). `descriptions` (v1.1.2-S5) the
 * descriptive Attributes of each Guildmaster entering play, fifteen draws each, whatever is written
 * (DL-125 item 6, DL-132). The tuple keeps ADR-0009's
 * order, which is also the order of a new world's `rng` keys; an old save gains a missing stream
 * wherever `ensureStreams` puts it.
 */
export const streamNames = [
  'generation',
  'board',
  'quests',
  'encounters',
  'pool',
  'heroes',
  'progression',
  'rivals',
  'market',
  'portraits',
  'descriptions',
] as const;

export type StreamName = (typeof streamNames)[number];

/**
 * One stream's state: xoshiro128**'s four 32-bit words, each an integer in [0, 2^32). Plain
 * numbers, so the document stays JSON-safe. Never all zero: xoshiro never leaves that state.
 * Nothing outside this file and `document.ts` names this type; the rest of the engine reaches a
 * state through `world.rng` (M1-S2).
 */
export type RngState = [number, number, number, number];

/** 2^32: turns a 32-bit word into a fraction in [0, 1). */
const wordRange = 0x1_0000_0000;

/** Separates the master seed from the stream's name in the hashed text. */
const nameSeparator = ':';

/**
 * Replaces an all-zero seed, which cyrb128 produces for one input in 2^128. The fractional bits
 * of the golden ratio, π, e and √2: numbers chosen for having no pattern of their own.
 */
const zeroReplacement: RngState = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x6a09e667];

// ── Seeding ──────────────────────────────────────────────────────────────────────────────────

/**
 * A fresh state for each named stream, from the master seed and the stream's name alone:
 * cyrb128 of `${seed}:${name}`. The same seed and name give the same stream in any process,
 * whatever other streams exist beside it.
 *
 * `names` is any list, not only `streamNames`, so that a module can register a stream of its
 * own (ADR-0009). A name may not be empty or contain the separator, `:`, so that no two
 * (seed, name) pairs hash the same text.
 */
export function createStreams<Name extends string>(
  seed: string,
  names: readonly Name[],
): Record<Name, RngState> {
  const streams: Partial<Record<Name, RngState>> = {};
  for (const name of names) {
    if (name.length === 0 || name.includes(nameSeparator)) {
      throw new RangeError(
        `A stream name is non-empty and has no ${JSON.stringify(nameSeparator)}; got ${JSON.stringify(name)}`,
      );
    }
    streams[name] = nonZero(cyrb128(`${seed}${nameSeparator}${name}`));
  }
  return streams as Record<Name, RngState>;
}

/**
 * Gives `world` each core stream it lacks, seeded as `createStreams(seed, [name])` would seed it,
 * and leaves the streams it has alone: a save made before a stream was added plays on, drawing
 * what a new world from the same seed would have drawn from that stream (M2-S3, DL-25). `seed` is
 * the document's `meta.seed`. Changes `world.rng` in place; `advance` calls it on its copy.
 */
export function ensureStreams(world: { rng: Partial<Record<StreamName, RngState>> }, seed: string): void {
  const missing = streamNames.filter((name) => !Object.hasOwn(world.rng, name));
  Object.assign(world.rng, createStreams(seed, missing));
}

/**
 * cyrb128, bryc's 128-bit string hash (his answer to "Seeding the random number generator in
 * JavaScript", stackoverflow.com/q/521295): four 32-bit words from a string's UTF-16 code
 * units. Not cryptographic; it only has to spread similar seeds such as `seed-0001` and
 * `seed-0002` far apart. Exported for its pinned test.
 */
export function cyrb128(text: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i += 1) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** `words`, unless all four are zero, which xoshiro would never leave; then a fixed state. */
export function nonZero(words: RngState): RngState {
  return isAllZero(words) ? [...zeroReplacement] : words;
}

function isAllZero([s0, s1, s2, s3]: RngState): boolean {
  return (s0 | s1 | s2 | s3) === 0;
}

// ── Drawing ──────────────────────────────────────────────────────────────────────────────────

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/**
 * The next draw, a fraction in [0, 1) with 32 bits of resolution, advancing `state` in place:
 * one step of xoshiro128** (Blackman and Vigna, prng.di.unimi.it). Throws on an all-zero
 * state, which no seeded stream reaches: it can only have been written by hand.
 */
export function next(state: RngState): number {
  const [s0, s1, s2, s3] = state;
  if (isAllZero(state)) {
    throw new RangeError('A random stream is all zero, a state no seeded stream reaches');
  }
  const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
  const t = s1 << 9;
  const n2 = s2 ^ s0;
  const n3 = s3 ^ s1;
  state[0] = (s0 ^ n3) >>> 0;
  state[1] = (s1 ^ n2) >>> 0;
  state[2] = (n2 ^ t) >>> 0;
  state[3] = rotl(n3, 11);
  return result / wordRange;
}

/**
 * A whole number from `min` to `max`, both included, from one draw. Throws unless both are
 * safe integers with `min <= max` and at most 2^32 values between them. Each value's chance
 * differs from exact by less than one part in 2^32 per value in the range: nothing a game shows.
 */
export function int(state: RngState, min: number, max: number): number {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
    throw new RangeError(`int needs whole bounds with min <= max; got ${min} and ${max}`);
  }
  const span = max - min + 1;
  if (span > wordRange) {
    throw new RangeError(`int draws from at most 2^32 values; ${min} to ${max} is ${span}`);
  }
  return min + Math.floor(next(state) * span);
}

/** One element of `items`, each equally likely, from one draw. Throws on an empty list. */
export function pick<T>(state: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick needs at least one item');
  return items[int(state, 0, items.length - 1)] as T;
}

/**
 * A new array holding `items` in a uniformly random order; `items` is not changed. A
 * Fisher–Yates shuffle from the last position down, one draw per position but the first:
 * `length - 1` draws, none for a list of zero or one.
 */
export function shuffle<T>(state: RngState, items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = int(state, 0, i);
    const here = shuffled[i] as T;
    shuffled[i] = shuffled[j] as T;
    shuffled[j] = here;
  }
  return shuffled;
}

/**
 * True with probability `p`, from one draw even when `p` is 0 or 1, so that tuning a chance
 * never shifts the draws after it. Throws unless `p` is from 0 to 1.
 */
export function chance(state: RngState, p: number): boolean {
  if (!(p >= 0 && p <= 1)) throw new RangeError(`chance needs a probability from 0 to 1; got ${p}`);
  return next(state) < p;
}

/**
 * One element of `items`, each drawn in proportion to its weight in `weights` (the same length),
 * from one draw (M4-S5, DL-43). A weight of 0 is never drawn; when every weight is 0 the draw is
 * uniform, as `pick`'s. With every weight equal to 1 it draws exactly what `pick` draws from the
 * same state, so a Board whose Patrons all stand at neutral is drawn as DL-25's uniform one was.
 * Throws on an empty list, lists of different lengths, or a weight that is negative or not finite.
 */
export function weightedPick<T>(state: RngState, items: readonly T[], weights: readonly number[]): T {
  if (items.length === 0) throw new RangeError('weightedPick needs at least one item');
  if (weights.length !== items.length) {
    throw new RangeError(`weightedPick needs a weight for each of ${items.length} items; got ${weights.length}`);
  }
  let total = 0;
  for (const weight of weights) {
    if (!(Number.isFinite(weight) && weight >= 0)) throw new RangeError(`A weight is 0 or more; got ${weight}`);
    total += weight;
  }
  const draw = next(state);
  if (total === 0) return items[Math.floor(draw * items.length)] as T;
  const target = draw * total;
  let reached = 0;
  let last = 0;
  for (let index = 0; index < items.length; index += 1) {
    const weight = weights[index] as number;
    if (weight === 0) continue;
    reached += weight;
    last = index;
    if (target < reached) return items[index] as T;
  }
  // Only rounding leaves the target at the total: the last item that can be drawn.
  return items[last] as T;
}
