import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { setupRefusalWords } from './setup.js';

// `new`'s refusals in its own words (M9-S2, DL-102). Most are met through `new` itself, in
// `main.test.ts`; a sex that is not one never reaches the engine from the command line, since
// `--sex` refuses it first (`args.ts`), so its sentence is held here (the M9 review).

const content = loadContent();

describe("new's words for a setup the engine refuses", () => {
  test("a sex that is not one, naming the sexes and the flag, as the other Guildmaster refusals do", () => {
    expect(setupRefusalWords({ reason: 'unknown-sex', sex: 'other' }, content)).toBe(
      "A Guildmaster's sex is female or male; --sex other is not.",
    );
  });
});
