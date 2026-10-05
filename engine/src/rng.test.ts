import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { isJsonSafe } from './json-safe.js';
import { chance, createStreams, cyrb128, ensureStreams, int, next, nonZero, pick, shuffle, streamNames, weightedPick } from './rng.js';
import { plannedStreams } from './world.test-support.js';

// A stream's state, reached through the function that draws from it rather than by its name
// (see the last describe block).
type State = Parameters<typeof next>[0];

const seed = 'amber-fox-4821';
const thousand = 1000;

function generation(seedText = seed): State {
  return createStreams(seedText, streamNames).generation;
}

function draws(state: State, count = thousand): number[] {
  return Array.from({ length: count }, () => next(state));
}

/** A state `steps` draws on from a copy of `state`, leaving `state` as it was. */
function advancedCopy(state: State, steps: number): State {
  const copy = structuredClone(state);
  for (let i = 0; i < steps; i += 1) next(copy);
  return copy;
}

/** Pearson's chi-square statistic of `counts` against equal expected counts. */
function chiSquare(counts: readonly number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const expected = total / counts.length;
  return counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
}

// ── The algorithm, pinned ────────────────────────────────────────────────────────────────────
// Changing any of these changes every seed's game: that is a new DL entry superseding DL-12,
// not a test to update.

describe('the generator is pinned', () => {
  test('xoshiro128** matches the reference implementation from state [1, 2, 3, 4]', () => {
    // The outputs of the reference C code (v1.1, prng.di.unimi.it), as pinned by the Rust
    // rand_xoshiro crate's `reference` test for Xoshiro128StarStar.
    const state: State = [1, 2, 3, 4];

    expect(draws(state, 10).map((draw) => draw * 2 ** 32)).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597,
      4258142804,
    ]);
  });

  test('cyrb128 of `${seed}:generation` is pinned', () => {
    expect(cyrb128(`${seed}:generation`)).toEqual([3265190498, 3243802501, 310029124, 3418333199]);
  });

  test("the first thousand draws of a seed's generation stream are pinned", () => {
    const state = generation();
    const first = draws(state);

    expect(first.slice(0, 5)).toEqual([
      0.2781555640976876, 0.028462710790336132, 0.050317246466875076, 0.3661544928327203,
      0.554092067759484,
    ]);
    expect(createHash('sha256').update(JSON.stringify(first)).digest('hex')).toBe(
      '178aab1ad9c43a65308a591538f5916822a87e5733ee30d5b36cdb0899f61a7d',
    );
    expect(state).toEqual([2320208475, 2539003242, 1810700390, 2291291775]);
  });
});

// ── M1-S2 acceptance ─────────────────────────────────────────────────────────────────────────

describe('named streams', () => {
  test('the same seed and name produce the same first thousand draws in another process', () => {
    // A fresh Node process, loading rng.ts through tsx, draws for itself; nothing is shared with
    // this one but the source file.
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const child = [
      "const { createStreams, next } = await import(process.argv[1]);",
      'const state = createStreams(process.argv[2], [process.argv[3]])[process.argv[3]];',
      'const out = Array.from({ length: Number(process.argv[4]) }, () => next(state));',
      'process.stdout.write(JSON.stringify(out));',
    ].join('\n');
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        child,
        new URL('./rng.ts', import.meta.url).href,
        seed,
        'generation',
        String(thousand),
      ],
      { cwd: root, encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    const theirs: unknown = JSON.parse(result.stdout);
    expect(theirs).toHaveLength(thousand);
    expect(theirs).toEqual(draws(generation()));
  }, 30_000);

  test('two names from one seed produce different sequences', () => {
    const { generation: one, board: other } = createStreams(seed, ['generation', 'board']);
    const ours = draws(one);
    const theirs = draws(other);

    expect(ours).not.toEqual(theirs);
    expect(ours.filter((draw, i) => draw === theirs[i])).toEqual([]);
  });

  test('similar seeds produce unrelated sequences', () => {
    const ours = draws(generation('seed-0001'));
    const theirs = draws(generation('seed-0002'));

    expect(ours.filter((draw, i) => draw === theirs[i])).toEqual([]);
  });

  test('a stream is the same whatever other streams are created beside it', () => {
    const alone = createStreams(seed, ['generation']).generation;
    const among = createStreams(seed, plannedStreams).generation;

    expect(among).toEqual(alone);
  });

  test('a state is JSON-safe: four unsigned 32-bit integers', () => {
    const streams = createStreams(seed, plannedStreams);

    expect(isJsonSafe(streams)).toBe(true);
    for (const state of Object.values(streams)) {
      expect(state).toHaveLength(4);
      for (const word of state) {
        expect(Number.isInteger(word) && word >= 0 && word < 2 ** 32).toBe(true);
      }
      draws(state);
      expect(state.every((word) => Number.isInteger(word) && word >= 0 && word < 2 ** 32)).toBe(true);
    }
  });

  test('a state serialised and deserialised continues the sequence exactly', () => {
    const state = generation();
    draws(state, 137);
    const restored = JSON.parse(JSON.stringify(state)) as State;
    const cloned = structuredClone(state);

    expect(restored).toEqual(state);
    const expected = draws(state);
    expect(draws(restored)).toEqual(expected);
    expect(draws(cloned)).toEqual(expected);
  });

  test('drawing from board leaves heroes unchanged', () => {
    // `board` and `heroes` arrive with M2; createStreams takes any name, so the property is
    // proved now rather than when the second stream lands.
    const streams = createStreams(seed, ['board', 'heroes']);
    const heroesBefore = structuredClone(streams.heroes);
    const boardBefore = structuredClone(streams.board);

    draws(streams.board);

    expect(streams.heroes).toEqual(heroesBefore);
    expect(streams.board).not.toEqual(boardBefore);
  });

  test('drawing from any planned stream leaves every other deep-equal', () => {
    const streams = createStreams(seed, plannedStreams);

    for (const drawn of plannedStreams) {
      const before = structuredClone(streams);

      next(streams[drawn]);
      int(streams[drawn], 1, 6);
      pick(streams[drawn], ['a', 'b']);
      shuffle(streams[drawn], [1, 2, 3]);
      chance(streams[drawn], 0.5);

      for (const other of plannedStreams) {
        if (other === drawn) expect(streams[other]).not.toEqual(before[other]);
        else expect(streams[other]).toEqual(before[other]);
      }
    }
  });

  test('refuses a stream name that is empty or holds the separator', () => {
    expect(() => createStreams(seed, [''])).toThrow(RangeError);
    expect(() => createStreams(seed, ['board:heroes'])).toThrow(RangeError);
  });
});

describe('ensureStreams, for a save made before a stream existed (M2-S3, DL-25)', () => {
  test("gives the world each core stream it lacks, seeded as a new world's, and moves none it has", () => {
    const fresh = createStreams(seed, streamNames);
    const generation = advancedCopy(fresh.generation, 7);
    // An M1 save: its generation stream drawn from, no board stream.
    const world: { rng: Partial<typeof fresh> } = { rng: { generation } };

    ensureStreams(world, seed);

    expect(world.rng).toEqual({ ...fresh, generation: advancedCopy(fresh.generation, 7) });
    expect(world.rng.generation).toBe(generation);
    expect(Object.keys(world.rng).sort()).toEqual([...streamNames].sort());
  });

  test('changes nothing in a world that has every stream, and keeps a stream it does not know', () => {
    const rng = { ...createStreams(seed, streamNames), ...createStreams(seed, ['a-module']) };
    const board = advancedCopy(rng.board, 3);
    const world = { rng: { ...rng, board } };
    const before = structuredClone(world);

    ensureStreams(world, seed);

    expect(world).toEqual(before);
    expect(world.rng.board).toBe(board);
  });
});

describe('the all-zero state, which xoshiro never leaves', () => {
  test('is replaced when a hash produces it', () => {
    const replaced = nonZero([0, 0, 0, 0]);

    expect(replaced.some((word) => word !== 0)).toBe(true);
    expect(new Set(draws(replaced, 10)).size).toBe(10);
  });

  test('leaves any other state as it is', () => {
    const state: State = [0, 0, 0, 1];

    expect(nonZero(state)).toBe(state);
  });

  test('is refused by next, since only a hand-written state can hold it', () => {
    expect(() => next([0, 0, 0, 0])).toThrow(RangeError);
  });

  test('is never seeded, even from an empty seed', () => {
    for (const text of ['', ':', '0', 'seed-0001']) {
      const state = generation(text);
      expect(state.some((word) => word !== 0)).toBe(true);
    }
  });
});

// ── The draw functions ───────────────────────────────────────────────────────────────────────

describe('next', () => {
  // 100,000 draws: about 0.5 s alone, 1.4 s in a full `npm test` on a busy machine; the timeout
  // bounds a hang with room for a busier one, not the speed.
  test('draws fractions in [0, 1) spread evenly over ten bins', { timeout: 30_000 }, () => {
    const state = generation('uniform-next');
    const bins = new Array<number>(10).fill(0);
    let sum = 0;
    for (const draw of draws(state, 100_000)) {
      expect(draw >= 0 && draw < 1).toBe(true);
      const bin = Math.floor(draw * 10);
      bins[bin] = (bins[bin] ?? 0) + 1;
      sum += draw;
    }

    // Chi-square with 9 degrees of freedom: 27.88 is the 0.1% critical value.
    expect(chiSquare(bins)).toBeLessThan(27.88);
    expect(Math.abs(sum / 100_000 - 0.5)).toBeLessThan(0.005);
  });
});

describe('int', () => {
  test('includes both bounds and nothing outside them', () => {
    const state = generation('int-bounds');
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i += 1) {
      const value = int(state, -3, 3);
      expect(Number.isInteger(value) && value >= -3 && value <= 3).toBe(true);
      seen.add(value);
    }

    expect([...seen].sort((a, b) => a - b)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  test('returns the bound when min equals max, still taking one draw', () => {
    const state = generation();
    const expected = advancedCopy(state, 1);

    expect(int(state, 5, 5)).toBe(5);
    expect(state).toEqual(expected);
  });

  test('spreads a d20 over every face (chi-square)', () => {
    const state = generation('uniform-int');
    const faces = new Array<number>(20).fill(0);
    for (let i = 0; i < 100_000; i += 1) {
      const face = int(state, 1, 20);
      faces[face - 1] = (faces[face - 1] ?? 0) + 1;
    }

    // Chi-square with 19 degrees of freedom: 43.82 is the 0.1% critical value.
    expect(chiSquare(faces)).toBeLessThan(43.82);
  });

  test('reaches the whole 32-bit range', () => {
    const state = generation();
    for (let i = 0; i < 100; i += 1) {
      const value = int(state, 0, 2 ** 32 - 1);
      expect(Number.isInteger(value) && value >= 0 && value < 2 ** 32).toBe(true);
    }
  });

  test('refuses bounds that are reversed, fractional or too far apart', () => {
    const state = generation();

    expect(() => int(state, 2, 1)).toThrow(RangeError);
    expect(() => int(state, 0, 2.5)).toThrow(RangeError);
    expect(() => int(state, Number.NaN, 3)).toThrow(RangeError);
    expect(() => int(state, 0, 2 ** 32)).toThrow(RangeError);
  });
});

describe('pick', () => {
  test('picks every element, each with one draw', () => {
    const state = generation('pick');
    const items = ['warrior', 'mage', 'rogue', 'cleric'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const expected = advancedCopy(state, 1);
      seen.add(pick(state, items));
      expect(state).toEqual(expected);
    }

    expect([...seen].sort()).toEqual([...items].sort());
  });

  test('refuses an empty list', () => {
    expect(() => pick(generation(), [])).toThrow(RangeError);
  });
});

describe('shuffle', () => {
  test('returns a new array holding the same elements and leaves its argument alone', () => {
    const state = generation('shuffle');
    const items = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f']);
    for (let round = 0; round < 50; round += 1) {
      const shuffled = shuffle(state, items);
      expect(shuffled).not.toBe(items);
      expect([...shuffled].sort()).toEqual([...items]);
    }

    expect(items).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  test('takes length - 1 draws, and none for zero or one element', () => {
    for (const items of [[], ['a'], ['a', 'b'], ['a', 'b', 'c', 'd', 'e']]) {
      const state = generation();
      const expected = advancedCopy(state, Math.max(0, items.length - 1));
      shuffle(state, items);
      expect(state).toEqual(expected);
    }
  });

  test('produces every order of three equally often (chi-square)', () => {
    // A shuffle drawing from the wrong range (Sattolo's off-by-one) never yields the identity
    // and fails here.
    const state = generation('shuffle-uniform');
    const counts = new Map<string, number>();
    for (let i = 0; i < 60_000; i += 1) {
      const order = shuffle(state, ['a', 'b', 'c']).join('');
      counts.set(order, (counts.get(order) ?? 0) + 1);
    }

    expect(counts.size).toBe(6);
    // Chi-square with 5 degrees of freedom: 20.52 is the 0.1% critical value.
    expect(chiSquare([...counts.values()])).toBeLessThan(20.52);
  });
});

describe('chance', () => {
  test('is never true at 0 and always true at 1, taking one draw either way', () => {
    const state = generation('chance-edges');
    for (let i = 0; i < 1000; i += 1) {
      const afterOne = advancedCopy(state, 1);
      expect(chance(state, 0)).toBe(false);
      expect(state).toEqual(afterOne);
      expect(chance(state, 1)).toBe(true);
    }
  });

  test('comes true at about its probability', () => {
    const state = generation('chance-rate');
    let hits = 0;
    for (let i = 0; i < 100_000; i += 1) if (chance(state, 0.3)) hits += 1;

    expect(Math.abs(hits / 100_000 - 0.3)).toBeLessThan(0.005);
  });

  test('refuses a probability outside 0 to 1', () => {
    const state = generation();

    expect(() => chance(state, -0.1)).toThrow(RangeError);
    expect(() => chance(state, 1.1)).toThrow(RangeError);
    expect(() => chance(state, Number.NaN)).toThrow(RangeError);
  });
});

describe('weightedPick (M4-S5, DL-43)', () => {
  test('takes one draw, and with every weight 1 picks what pick picks from the same state', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const ones = items.map(() => 1);
    const weighted = generation('weighted-even');
    const uniform = generation('weighted-even');
    for (let i = 0; i < 1000; i += 1) {
      const afterOne = advancedCopy(weighted, 1);
      expect(weightedPick(weighted, items, ones)).toBe(pick(uniform, items));
      expect(weighted).toEqual(afterOne);
    }
  });

  // v1.1.4-S4 (DL-155): who harm falls on is drawn by weightedPick, where before it was `int` from 0
  // to the last of the Heroes it could fall on, `pick`'s draw; with no field that reads the Stats,
  // every weight is 1 and the draw must be the same, for any Party's size.
  test('with every weight 1, for every length from 1 to 8, picks the item int and pick pick from the same state', () => {
    for (let length = 1; length <= 8; length += 1) {
      const items = Array.from({ length }, (_, index) => index);
      const ones = items.map(() => 1);
      const weighted = generation(`weighted-ones-${length}`);
      const byInt = generation(`weighted-ones-${length}`);
      const byPick = generation(`weighted-ones-${length}`);
      // The draws that differ, compared without an expect each: 320,000 expects took five seconds (DL-164).
      const differing: { draw: number; drawn: number; int: number; pick: number }[] = [];
      for (let i = 0; i < 20_000; i += 1) {
        const drawn = weightedPick(weighted, items, ones);
        const [byIntDrawn, byPickDrawn] = [int(byInt, 0, length - 1), pick(byPick, items)];
        if (drawn !== byIntDrawn || drawn !== byPickDrawn) differing.push({ draw: i, drawn, int: byIntDrawn, pick: byPickDrawn });
      }
      expect(differing, `length ${length}`).toEqual([]);
      expect(weighted).toEqual(byInt);
    }
  });

  // v1.1.6-S16 (DL-202): a Class, Background, Quest template and Sphere draw by weight, 1 when none is
  // given, and every game must play as it did. Both sides take the one draw and multiply it by the list's
  // size (the weights' total) before comparing it to a whole number, so the floating-point rounding of the
  // product is the same on both and no bucket's edge falls differently; held here for the list sizes a draw
  // is made over and a few beyond them.
  test('with every weight 1, for every length from 1 to 64 and some beyond, is pick from the same state, one draw', () => {
    for (const length of [...Array.from({ length: 64 }, (_, index) => index + 1), 97, 128, 255, 1000]) {
      const items = Array.from({ length }, (_, index) => index);
      const ones = items.map(() => 1);
      const weighted = generation(`weighted-sizes-${length}`);
      const picked = generation(`weighted-sizes-${length}`);
      const differing: { draw: number; drawn: number; pick: number }[] = [];
      for (let i = 0; i < 5000; i += 1) {
        const afterOne = advancedCopy(picked, 1);
        const drawn = weightedPick(weighted, items, ones);
        const pickedItem = pick(picked, items);
        if (drawn !== pickedItem || weighted.join() !== picked.join() || picked.join() !== afterOne.join()) {
          differing.push({ draw: i, drawn, pick: pickedItem });
        }
      }
      expect(differing, `length ${length}`).toEqual([]);
    }
  });

  test('draws in proportion to the weights, never a weight of 0, and uniformly when every weight is 0', () => {
    const state = generation('weighted-rate');
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 60_000; i += 1) counts[weightedPick(state, ['a', 'b', 'c'] as const, [3, 0, 1])] += 1;
    expect(counts.b).toBe(0);
    expect(Math.abs(counts.a / 60_000 - 0.75)).toBeLessThan(0.01);

    const zero = { a: 0, b: 0 };
    for (let i = 0; i < 20_000; i += 1) zero[weightedPick(state, ['a', 'b'] as const, [0, 0])] += 1;
    expect(Math.abs(zero.a / 20_000 - 0.5)).toBeLessThan(0.02);
  });

  test('refuses an empty list, lists of different lengths, and a weight below 0 or not finite', () => {
    const state = generation();

    expect(() => weightedPick(state, [], [])).toThrow(RangeError);
    expect(() => weightedPick(state, ['a'], [1, 1])).toThrow(RangeError);
    expect(() => weightedPick(state, ['a', 'b'], [1, -1])).toThrow(RangeError);
    expect(() => weightedPick(state, ['a'], [Number.POSITIVE_INFINITY])).toThrow(RangeError);
  });
});

// ── Where the state type may be named ────────────────────────────────────────────────────────

describe("rng.ts's state type", () => {
  test('is named only by rng.ts and document.ts: the rest of the engine reaches it through world.rng', () => {
    // Assembled, so that this file does not match itself.
    const typeName = ['Rng', 'State'].join('');
    const pattern = new RegExp(`\\b${typeName}\\b`);
    const owners = new Set(['rng.ts', 'document.ts']);
    const src = fileURLToPath(new URL('./', import.meta.url));
    // boundary.test.ts writes and deletes probe files here while other tests run.
    const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
      (file) => file.endsWith('.ts') && !/(^|[\\/])boundary-probe-/.test(file),
    );

    expect(files).toContain('rng.ts');
    expect(files).toContain('index.ts');
    const offenders = files.filter(
      (file) => !owners.has(file) && pattern.test(readFileSync(`${src}${file}`, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
