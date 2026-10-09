import { describe, expect, test } from 'vitest';
import { boxSeeds, offersOver } from './patron-offers.test-support.js';

// The Patron Regard box (DL-43) over its first 10 seeds; its 50 are `patron-offers.harness.test.ts`,
// run apart by `npm run harness` (DL-246). The play is `patron-offers.test-support.ts`'s.

describe('Patron Regard weighs on the Board (R22)', () => {
  test('a Patron whose Quests always fail offers fewer over a year than one whose succeed, over 10 seeds', () => {
    const seeds = boxSeeds(10);
    const { failing, succeeding, fewer } = offersOver(seeds);

    expect(failing).toBeLessThan(succeeding);
    // Not by a hair: the failing Patron falls silent at the scale's bottom while the other is courted.
    expect(failing).toBeLessThan(succeeding / 2);
    expect(fewer).toBe(seeds.length);
  });
});
