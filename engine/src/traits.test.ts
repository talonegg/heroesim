import { describe, expect, test } from 'vitest';
import type { ContentSet } from './content-types.js';
import { traitEffects, traitMoraleShift, traitUpkeepFactor } from './guildmaster.js';
import { excludedPair, excludeEachOther, traitOf } from './traits.js';
import { testContent } from './world.test-support.js';

// DL-150 items 1 to 3: the two lists of Traits, each Trait a list of effects, and no two
// Traits held of which one excludes the other.

describe('traitOf', () => {
  test("finds a key in either list, and a key in neither is content's to lack (rule 5)", () => {
    expect(traitOf(testContent, 'miser')).toBe(testContent.guildmasterTraits.miser);
    expect(traitOf(testContent, 'scarred')).toBe(testContent.heroTraits.scarred);
    expect(traitOf(testContent, 'luck-of-the-draw')).toBeUndefined();
    expect(traitOf(testContent, 'constructor')).toBeUndefined();
  });
});

describe('excludeEachOther and excludedPair', () => {
  const row = (key: string, ...excludes: string[]) => ({ key, excludes });

  test('an exclusion counts from either side', () => {
    expect(excludeEachOther(row('a', 'b'), row('b'))).toBe(true);
    expect(excludeEachOther(row('a'), row('b', 'a'))).toBe(true);
    expect(excludeEachOther(row('a'), row('b'))).toBe(false);
  });

  test('gives the first pair in the order held, the earlier first, or null', () => {
    expect(excludedPair([row('a'), row('b', 'd'), row('c', 'a'), row('d')])).toEqual([row('a'), row('c', 'a')]);
    expect(excludedPair([row('a'), row('b'), row('c')])).toBeNull();
    expect(excludedPair([])).toBeNull();
  });
});

describe("a Guildmaster Trait's list of effects (DL-150 item 2)", () => {
  const twoEffects: Pick<ContentSet, 'guildmasterTraits'> = {
    guildmasterTraits: {
      ...testContent.guildmasterTraits,
      miser: {
        key: 'miser',
        name: 'Miser',
        cost: -2,
        excludes: ['well-liked', 'spendthrift'],
        effects: [
          { kind: 'guildMoraleShift', delta: -5 },
          { kind: 'upkeepFactor', factor: 0.8 },
        ],
      },
    },
  };

  test("applies every effect of each Trait held, in the Traits' order and then each Trait's", () => {
    const guildmaster = { traits: ['old-soldier', 'miser'] };
    expect(traitEffects(guildmaster, twoEffects).map((effect) => effect.kind)).toEqual(['classStatBonus', 'guildMoraleShift', 'upkeepFactor']);
    expect(traitMoraleShift(guildmaster, twoEffects)).toBe(-5);
    expect(traitUpkeepFactor(guildmaster, twoEffects)).toBe(0.8);
  });

  test('a Hero Trait held by a Guildmaster bears on nothing: it is of the other list (rule 5)', () => {
    expect(traitEffects({ traits: ['scarred', 'thrifty'] }, testContent)).toEqual([{ kind: 'upkeepFactor', factor: 0.9 }]);
  });
});
