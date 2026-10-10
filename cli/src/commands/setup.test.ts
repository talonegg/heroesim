import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { setupRefusalWords } from './setup.js';

// `new`'s refusals in its own words (DL-102). The others are met through `new` itself, in
// `main.test.ts` and `portrait.test.ts`; a Portrait content lacks, in a content with no pictures,
// is held here.

const content = loadContent();

describe("new's words for a setup the engine refuses", () => {
  test('a Portrait content lacks, saying there are none when content has none', () => {
    const none = { female: [], male: [] };
    const bare = { ...content, portraits: { guildmaster: none, hero: none, patron: none } };
    expect(setupRefusalWords({ reason: 'unknown-portrait', portraitKey: 'gm-male-09' }, bare)).toBe(
      'No Guildmaster Portrait is called "gm-male-09". There are none yet: leave out --portrait.',
    );
  });
});
