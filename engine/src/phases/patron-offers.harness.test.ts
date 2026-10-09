import { describe, expect, test } from 'vitest';
import { boxSeeds, offersOver } from './patron-offers.test-support.js';

// The Patron Regard box (DL-43) whole, over its 50 seeds, run apart by `npm run harness` as DL-230's
// boxes are (DL-246); `patron-offers.test.ts` plays its first 10 in `npm test`.

describe('Patron Regard weighs on the Board (R22)', () => {
  test('a Patron whose Quests always fail offers fewer over a year than one whose succeed, over 50 seeds', { timeout: 120_000 }, () => {
    const seeds = boxSeeds(50);
    const { failing, succeeding, fewer } = offersOver(seeds);

    expect(failing).toBeLessThan(succeeding);
    // Not by a hair: the failing Patron falls silent at the scale's bottom while the other is courted.
    expect(failing).toBeLessThan(succeeding / 2);
    expect(fewer).toBe(seeds.length);
  });
});
