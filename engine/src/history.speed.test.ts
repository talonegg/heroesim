import { describe, expect, test } from 'vitest';
import { append, createHistory, entriesBetween } from './history.js';
import { makeId } from './document.js';

// The History's range read's time limit, apart from `npm test` and played alone at a close, as the
// harness's long runs are (DL-233): a time limit measures the machine as well as the code, and fails
// under the full suite's load. `history.test.ts` holds what the read returns and how few entries it reads.

describe('entriesBetween on 10,000 entries', () => {
  // Three entries on each even Turn, from Turn 0 to Turn 6,666.
  const big = createHistory();
  for (let i = 0; i < 10_000; i += 1) {
    const hero = makeId('heroes', 1 + (i % 50));
    append(big, { turn: 2 * Math.floor(i / 3), type: 'hero.injured', participants: [hero], labels: { [hero]: `Name of ${hero}` }, milestone: false, payload: {} });
  }

  test('runs under 1 ms (median of 100 calls, for a year and for the whole History)', () => {
    for (const [from, to] of [
      [1095, 2190],
      [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
    ] as const) {
      for (let i = 0; i < 20; i += 1) entriesBetween(big, from, to);
      const times: number[] = [];
      for (let i = 0; i < 100; i += 1) {
        const start = performance.now();
        entriesBetween(big, from, to);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      expect(times[50]).toBeLessThan(1);
    }
  });
});
