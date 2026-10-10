import { describe, expect, test } from 'vitest';
import { gearUnavailableWords, unavailableChipWords, unavailableWords } from './availability.js';

// DL-186 item 1: why a Hero cannot go, the CLI's words and the page's, one table. The
// CLI's `equip` says "their Gear" (DL-197); Gear is a glossary term (docs/agents/ui-text.md).

describe('why a Hero cannot go', () => {
  test.each([
    ['injured', 'is injured', 'injured'],
    ['dead', 'is dead', 'dead'],
    ['retired', 'has retired', 'retired'],
    ['in-party', 'is away with a Party', 'away'],
  ] as const)('%s: after their name, and on the chip', (because, words, chip) => {
    expect(unavailableWords[because]).toBe(words);
    expect(unavailableChipWords[because]).toBe(chip);
  });

  test.each([
    ['dead', 'is dead'],
    ['retired', 'has retired'],
    ['in-party', 'is away on a Quest, and their Gear is with them'],
  ] as const)("%s: why their Gear cannot be changed", (because, words) => {
    expect(gearUnavailableWords[because]).toBe(words);
  });

  test('each table words every reason and nothing else', () => {
    expect(Object.keys(unavailableWords)).toEqual(['injured', 'dead', 'retired', 'in-party']);
    expect(Object.keys(unavailableChipWords)).toEqual(Object.keys(unavailableWords));
    expect(Object.keys(gearUnavailableWords)).toEqual(['dead', 'retired', 'in-party']);
  });
});
