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
      "A Guildmaster's Sex is female or male; --sex other is not.",
    );
  });

  // v1.1.2-S3: held over content with more pictures than the core's two (v1.1.2-S4), and with none.
  const pictured = {
    ...content,
    portraits: { ...content.portraits, guildmaster: { female: ['gm-female-01'], male: ['gm-male-01', 'gm-male-02'] } },
  };

  test('a Portrait content lacks, naming the pictures by sex, or saying there are none', () => {
    expect(setupRefusalWords({ reason: 'unknown-portrait', portraitKey: 'gm-male-09' }, pictured)).toBe(
      'No Guildmaster Portrait is called "gm-male-09". Choose from: gm-female-01 (female), gm-male-01 (male), gm-male-02 (male).',
    );
    const none = { female: [], male: [] };
    const bare = { ...content, portraits: { guildmaster: none, hero: none, patron: none } };
    expect(setupRefusalWords({ reason: 'unknown-portrait', portraitKey: 'gm-male-09' }, bare)).toBe(
      'No Guildmaster Portrait is called "gm-male-09". There are none yet: leave out --portrait.',
    );
  });

  test('a Portrait of the other sex, naming both flags', () => {
    expect(
      setupRefusalWords({ reason: 'portrait-of-another-sex', portraitKey: 'gm-male-01', sex: 'female', portraitSex: 'male' }, pictured),
    ).toBe("That Portrait is of a male Guildmaster, and your Guildmaster's Sex is female: choose a Portrait of that Sex, or leave out --sex.");
  });
});
