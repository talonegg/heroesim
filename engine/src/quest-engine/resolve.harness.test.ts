import { describe, expect, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import type { Consequence, Encounter, InjuryConsequence } from '../content-types.js';
import type { Hero } from '../document.js';
import { resolveQuest } from './resolve.js';
import { contentWith, encounter, scene } from './resolve.test-support.js';

// The epic's third box of harm that reads the Stats (DL-195): over 20,000 resolutions, exposedBy and
// guardedBy move who is hit and how often as their rules say. Its exact units are `harm.test.ts`'s
// (exposure, guard, the draw it lands on) and `rng.test.ts`'s (weightedPick proportional); these are
// their statistical restatement through the resolver, at a size that holds a ratio to 5% and three
// rates to 1.5 points, so they run apart by `npm run harness`, as DL-230's boxes do (DL-246).

describe('harm that reads the Stats', () => {
  /** An Encounter keyed `key` the Party of 8s always fails, with `failure`. */
  const failing = (key: string, failure: Consequence[]): Encounter => encounter(key, false, failure);
  const injury = (fields: Partial<InjuryConsequence> = {}): InjuryConsequence => ({ kind: 'injury', typeKey: 'deep-cut', chance: 1, count: 1, ...fields });

  /** The scene through `encounters`, of `size` Heroes, each set by `set` before they set out. */
  function harmed(seed: string, encounters: Encounter[], { size = 3, set = (() => undefined) as (heroes: Hero[]) => void, config = {} as Partial<EngineDeps['config']> } = {}) {
    const s = scene(seed, { ...contentWith(...encounters), synergies: {} }, encounters.map((it) => it.key), { size });
    set(s.heroes);
    const deps = { ...s.deps, config: { ...s.deps.config, ...config } };
    return { ...s, deps, resolve: () => resolveQuest(s.world, s.quest, s.party, deps) };
  }

  test('over 20,000 draws, the Hero at the bottom of exposedBy is hit about three times as often as the one at the top', { timeout: 30_000 }, () => {
    const h = harmed('exposure', [failing('front', [injury({ exposedBy: ['constitution'] })])], {
      size: 2,
      set: (heroes) => heroes.forEach((hero, index) => (hero.stats['constitution'] = index === 0 ? 1 : 20)),
    });
    const [low, high] = h.heroes as [Hero, Hero];
    const hits = new Map<string, number>();
    for (let draw = 0; draw < 20_000; draw += 1) {
      const hurt = h.resolve().encounters[0]?.injured[0] ?? 'no one';
      hits.set(hurt, (hits.get(hurt) ?? 0) + 1);
    }
    expect(hits.get('no one')).toBeUndefined();
    const ratio = (hits.get(low.id) ?? 0) / (hits.get(high.id) ?? 1);
    expect(ratio).toBeGreaterThan(2.85);
    expect(ratio).toBeLessThan(3.15);
  });

  test('over 20,000 draws, guardedBy at the top halves the chance, and at the bottom leaves it', { timeout: 30_000 }, () => {
    const rate = (constitution: number, kind: 'injury' | 'death'): number => {
      const harm: Consequence = kind === 'injury' ? injury({ chance: 0.8, guardedBy: ['constitution'] }) : { kind, chance: 0.8, guardedBy: ['constitution'] };
      const h = harmed(`guard-${constitution}-${kind}`, [failing('front', [harm])], {
        size: 1,
        set: (heroes) => heroes.forEach((hero) => (hero.stats['constitution'] = constitution)),
      });
      let landed = 0;
      for (let draw = 0; draw < 20_000; draw += 1) {
        const [result] = h.resolve().encounters;
        landed += (result?.injured.length ?? 0) + (result?.died.length ?? 0);
      }
      return landed / 20_000;
    };

    expect(Math.abs(rate(20, 'injury') - 0.4)).toBeLessThan(0.015);
    expect(Math.abs(rate(1, 'injury') - 0.8)).toBeLessThan(0.015);
    expect(Math.abs(rate(20, 'death') - 0.4)).toBeLessThan(0.015);
  });
});
