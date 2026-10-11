// Fatigue (DL-280 item 2, DL-282, `CONTEXT.md` Fatigue): a number from 0 to `fatigueMax`, rising each
// night a Hero is away on a Quest by its Tier and falling each night at home by their Guild's quarters,
// read in named bands. The Hero State Engine's night (hero-state.ts) is its one writer, and emits
// `hero.fatigue-changed` only when a band is crossed, as Morale's drift does (data-model rule 10). On
// a Quest, a Hero's Fatigue on each Encounter's Day is the Quest clock's (quest-engine/clock.ts), from
// the Fatigue their Party recorded at dispatch.

import { bandOf } from './bands.js';
import { fatigueBandNames, type FatigueBand, type GameConfig } from './config.js';
import type { Hero, Quest } from './document.js';
import type { Emit } from './emit.js';
import type { HeroFatigueChanged } from './events.js';

/** What the Fatigue rules read of the config. */
export type FatigueConfig = Pick<GameConfig, 'fatigueMax' | 'fatigueBands' | 'fatigueRiseByTier' | 'fatigueFallByQuarters'>;

/**
 * The band `fatigue` falls in: the highest of `fatigueBands` whose start it has reached, and the
 * lowest band for a value below every start. A selector, for the rules and the front ends alike.
 */
export function fatigueBand(fatigue: number, config: Pick<GameConfig, 'fatigueBands'>): FatigueBand {
  return bandOf(fatigueBandNames, config.fatigueBands, fatigue);
}

/** Fatigue's rise a night away on a Quest of `tier`: `fatigueRiseByTier`'s, a Tier past the list reading the last. */
export function fatigueRise(tier: number, config: Pick<GameConfig, 'fatigueRiseByTier'>): number {
  return stepAt(config.fatigueRiseByTier, tier - 1);
}

/** Fatigue's fall a night at home under quarters of `grade`: `fatigueFallByQuarters`', a grade past the list reading the last. */
export function fatigueFall(grade: number, config: Pick<GameConfig, 'fatigueFallByQuarters'>): number {
  return stepAt(config.fatigueFallByQuarters, grade);
}

function stepAt(steps: readonly number[], index: number): number {
  return steps[Math.max(0, Math.min(index, steps.length - 1))] as number;
}

/**
 * Where a Hero spends a night, for Fatigue: away on a Quest, which the Quest's Tier tires them by, or
 * at home under their Guild's quarters of `quarters`' grade.
 */
export type FatigueNight = { away: Pick<Quest, 'tier'> } | { quarters: number };

/**
 * One night of `hero`'s Fatigue spent as `night` says: the rise away, the fall at home, held inside 0
 * to `fatigueMax`. Returns the `hero.fatigue-changed` it emits when the night takes Fatigue from one
 * band into another, and nothing otherwise.
 */
export function fatigueNight(hero: Hero, night: FatigueNight, config: FatigueConfig, emit: Emit): HeroFatigueChanged[] {
  const before = hero.fatigue;
  const after = 'away' in night ? before + fatigueRise(night.away.tier, config) : before - fatigueFall(night.quarters, config);
  hero.fatigue = Math.min(config.fatigueMax, Math.max(0, after));
  const [bandBefore, bandAfter] = [fatigueBand(before, config), fatigueBand(hero.fatigue, config)];
  if (bandBefore === bandAfter) return [];
  return [
    emit({
      type: 'hero.fatigue-changed',
      participants: [hero.id],
      payload: { heroId: hero.id, before, after: hero.fatigue, bandBefore, bandAfter },
    }),
  ];
}
