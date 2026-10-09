import { describe, expect, test } from 'vitest';
import { potentialHints, type GameConfig, type PotentialHint } from './config.js';
import { createWorld } from './create.js';
import type { Hero } from './document.js';
import { potentialHint } from './potential.js';
import { testContent, testDeps, withValid } from './world.test-support.js';

// Potential hints (INPUTS 5.4, data-model rule 9, DL-37). The bands are pinned here, not read
// from the defaults a balance pass may move.

const bands = { modest: 0, promising: 6, exceptional: 10 };
const config: Pick<GameConfig, 'potentialHintBands'> = { potentialHintBands: bands };

/** A Hero with one Stat, `strength`, at `base`, whose Potential is `gap` above it. */
const withGap = (gap: number, base = 1): Pick<Hero, 'stats' | 'potential'> => ({
  stats: { strength: base },
  potential: { strength: base + gap },
});

/** The widest gap content allows: a Hero Stat at its minimum with its Potential at its maximum. */
const maximumGap = Math.max(
  ...Object.values(testContent.stats)
    .filter((stat) => stat.owner === 'hero')
    .map((stat) => stat.max - stat.min),
);

describe('potentialHint', () => {
  test('the three bands partition the whole gap range, 0 to the widest content allows, with no hole', () => {
    expect(maximumGap).toBe(19);
    const hints = Array.from({ length: maximumGap + 1 }, (_, gap) => potentialHint(withGap(gap), 'strength', config));

    // Every gap has exactly one of the three words.
    for (const hint of hints) expect(potentialHints).toContain(hint);
    // They rise with the gap and never fall back, so each band is one unbroken run of gaps.
    const ranks = hints.map((hint) => potentialHints.indexOf(hint));
    for (let gap = 1; gap < ranks.length; gap += 1) expect(ranks[gap]).toBeGreaterThanOrEqual(ranks[gap - 1] ?? 0);
    // Each run starts where its band says, and all three are used.
    const firstGapOf = (hint: PotentialHint): number => hints.indexOf(hint);
    expect(potentialHints.map(firstGapOf)).toEqual([0, 6, 10]);
    expect(hints[0]).toBe('modest');
    expect(hints[maximumGap]).toBe('exceptional');
  });

  test('reads the gap, not the base or the Potential alone', () => {
    expect(potentialHint(withGap(4, 1), 'strength', config)).toBe('modest');
    expect(potentialHint(withGap(4, 16), 'strength', config)).toBe('modest');
    expect(potentialHint(withGap(12, 1), 'strength', config)).toBe('exceptional');
    expect(potentialHint(withGap(12, 8), 'strength', config)).toBe('exceptional');
  });

  test('gives a gap below every start, which only a hand edit makes, the lowest band', () => {
    expect(potentialHint(withGap(-3, 10), 'strength', config)).toBe('modest');
    expect(potentialHint(withGap(0), 'strength', { potentialHintBands: { modest: 2, promising: 6, exceptional: 10 } })).toBe(
      'modest',
    );
  });

  test('reads a Stat the row lacks, in its base or its Potential, as no gap (data-model rule 5)', () => {
    const hero = { stats: { strength: 3 }, potential: { strength: 18, dexterity: 18 } };

    expect(potentialHint(hero, 'dexterity', config)).toBe('modest');
    expect(potentialHint({ stats: hero.stats, potential: {} }, 'strength', config)).toBe('modest');
    expect(potentialHint(hero, 'no-such-stat', config)).toBe('modest');
  });

  test('takes its bands from config alone, so narrower bands change the hint and not the Hero', () => {
    const hero = withGap(4);
    const before = structuredClone(hero);
    const narrowed = { potentialHintBands: { modest: 0, promising: 3, exceptional: 4 } };

    expect(potentialHint(hero, 'strength', config)).toBe('modest');
    expect(potentialHint(hero, 'strength', narrowed)).toBe('exceptional');
    expect(hero).toEqual(before);
  });

  test('every generated Hero has a hint for every Hero Stat, and the defaults use all three words', () => {
    const deps = testDeps({ potentialHintBands: bands, potentialGapMin: 3, potentialGapMax: 12, unattachedPoolSize: 40 });
    const { document } = createWorld('hints', { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' }, deps);
    withValid(document, deps);
    const seen = new Set<PotentialHint>();

    for (const hero of Object.values(document.world.heroes)) {
      for (const stat of Object.values(testContent.stats).filter((row) => row.owner === 'hero')) {
        const hint = potentialHint(hero, stat.key, deps.config);
        expect(potentialHints).toContain(hint);
        seen.add(hint);
      }
    }

    expect([...seen].sort()).toEqual([...potentialHints].sort());
  });
});
