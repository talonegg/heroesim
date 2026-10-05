import type { StatParts } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { statPartsWords, statSourcesMoving, statSourceWords } from './stats.js';

// v1.1.6-S13 (DL-186 item 3): a Stat's breakdown, the engine's, in the Roster's words.

/** A Stat's parts: its base, the Class bonus, the Gear and the Traits, its effective value and whether it was held. */
function parts(base: number, [classBonus, gear, traits]: [number, number, number], effective: number, clamped = false): StatParts {
  return {
    base,
    sources: [
      { source: 'classBonus', change: classBonus },
      { source: 'gear', change: gear },
      { source: 'traits', change: traits },
    ],
    effective,
    clamped,
  };
}

describe("a Stat's breakdown in words", () => {
  test('names each source', () => {
    expect(statSourceWords).toEqual({ classBonus: "the Guildmaster's Class bonus", gear: 'Gear', traits: 'Traits' });
  });

  test.each([
    [parts(10, [0, 0, 0], 10), null, []],
    [parts(10, [0, 2, 0], 12), 'Base 10, +2 from Gear', [{ from: 'Gear', change: 2 }]],
    [
      parts(10, [1, 2, -1], 12),
      "Base 10, +1 from the Guildmaster's Class bonus, +2 from Gear, -1 from Traits",
      [
        { from: "the Guildmaster's Class bonus", change: 1 },
        { from: 'Gear', change: 2 },
        { from: 'Traits', change: -1 },
      ],
    ],
    [parts(14, [-1, 0, 0], 13), "Base 14, -1 from the Guildmaster's Class bonus", [{ from: "the Guildmaster's Class bonus", change: -1 }]],
    // Sources that cancel: their words kept.
    [
      parts(10, [0, 1, -1], 10),
      'Base 10, +1 from Gear, -1 from Traits',
      [
        { from: 'Gear', change: 1 },
        { from: 'Traits', change: -1 },
      ],
    ],
    // Held at the top, and a base beyond the range with nothing moving it.
    [
      parts(20, [1, 2, 0], 20, true),
      "Base 20, +1 from the Guildmaster's Class bonus, +2 from Gear, held at 20",
      [
        { from: "the Guildmaster's Class bonus", change: 1 },
        { from: 'Gear', change: 2 },
      ],
    ],
    [parts(23, [0, 0, 0], 20, true), 'Base 23, held at 20', []],
  ])('%j: %s', (stat, words, moving) => {
    expect(statPartsWords(stat)).toBe(words);
    expect(statSourcesMoving(stat)).toEqual(moving);
  });
});
