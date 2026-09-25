import { expect, test } from 'vitest';

// Stands in for the harness runs M1-S10 adds; proves `npm run harness` sets the flag on any
// platform and that only the harness-run project collects *.harness.test.ts files.
test('a harness run sees HEROESIM_HARNESS', () => {
  expect(process.env.HEROESIM_HARNESS).toBe('1');
});
