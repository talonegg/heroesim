// Levels, XP and growth (M3-S1, INPUTS 5.2, 5.3, DL-36): the XP curve, and what one Level gained
// does to a Hero's Stats. The night phase `levelUps` (phases/level-ups.ts) applies it.
//
// `hero.xp` is every XP the Hero has earned, never spent: a Hero holds Level n once their XP
// reaches `xpForLevel(n)`, and XP past `levelCap` still accrues. Each Level applies
// `growthPointsPerLevel` Stat points, each one draw from the `progression` stream weighed by the
// Class's growth weights (content, DL-17). A point that falls on a Stat already at its Potential is
// lost, not redirected, so Potential binds.

import type { EngineDeps, GameConfig } from './config.js';
import type { StatKey } from './content-types.js';
import { compareByCodeUnit, rowOf, type Hero } from './document.js';
import type { Stream } from './generators/draw.js';
import { next } from './rng.js';
import { baseStat } from './selectors.js';

/** The Level every Hero starts from. */
const firstLevel = 1;

type Curve = Pick<GameConfig, 'xpCurveBase' | 'xpCurveExponent'>;

/**
 * The XP it takes to go from `level` to the next (INPUTS 5.2's "XP to next Level"):
 * `xpCurveBase × level^xpCurveExponent`, rounded to the nearest whole number; 100 × Level² by
 * default. Throws on a Level that is not a whole number from 1: a programming error.
 */
export function xpToNextLevel(level: number, config: Curve): number {
  checkLevel(level);
  return Math.round(config.xpCurveBase * level ** config.xpCurveExponent);
}

/**
 * The XP a Hero has earned on reaching `level`: the sum of `xpToNextLevel` over every Level below
 * it, so 0 at Level 1 and, by default, 100 at 2, 500 at 3 and 1,400 at 4. A Hero whose `xp` has
 * reached it holds that Level, up to `levelCap`. Throws on a Level that is not a whole number
 * from 1.
 */
export function xpForLevel(level: number, config: Curve): number {
  checkLevel(level);
  let total = 0;
  for (let below = firstLevel; below < level; below += 1) total += xpToNextLevel(below, config);
  return total;
}

/**
 * How many Levels `hero` gains now: one for each Level from the next up to `levelCap` whose
 * `xpForLevel` their XP has reached. None at the cap, however much XP the Hero holds.
 */
export function levelsDue(
  hero: Pick<Hero, 'level' | 'xp'>,
  config: Pick<GameConfig, 'xpCurveBase' | 'xpCurveExponent' | 'levelCap'>,
): number {
  let level = hero.level;
  if (level >= config.levelCap) return 0;
  let threshold = xpForLevel(level + 1, config);
  while (level < config.levelCap && hero.xp >= threshold) {
    level += 1;
    threshold += xpToNextLevel(level, config);
  }
  return level - hero.level;
}

/** What one Level's growth did: the Stats that rose and by how much, and the points lost. */
export interface Growth {
  statDeltas: Record<StatKey, number>;
  pointsLost: number;
}

/**
 * Applies one Level's growth to `hero`'s base Stats (INPUTS 5.3): `growthPointsPerLevel` points,
 * each one `next` draw from `state` (the `progression` stream) times the sum of the Class's growth
 * weights, falling in one Stat's share of them, taken in key order. A point on a Stat at its
 * Potential, or at content's maximum should Potential ever exceed it, is lost. Every point takes
 * its draw whatever it lands on, so a Level always takes `growthPointsPerLevel` draws; a Class, or
 * a Stat, content no longer defines grows nothing (data-model rule 5). Does not change the Level.
 */
export function growOneLevel(hero: Hero, state: Stream, deps: Pick<EngineDeps, 'config' | 'content'>): Growth {
  const { config, content } = deps;
  const heroClass = rowOf(content.classes, hero.classKey);
  const weights = Object.entries(heroClass?.growth ?? {})
    .filter(([, weight]) => weight > 0)
    .sort(([a], [b]) => compareByCodeUnit(a, b));
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);

  const statDeltas: Record<StatKey, number> = {};
  let pointsLost = 0;
  for (let point = 0; point < config.growthPointsPerLevel; point += 1) {
    const statKey = weighedKey(weights, next(state) * total);
    const stat = statKey !== undefined ? rowOf(content.stats, statKey) : undefined;
    if (stat === undefined || stat.owner !== 'hero') {
      pointsLost += 1;
      continue;
    }
    const value = baseStat(hero.stats, stat);
    if (value >= Math.min(baseStat(hero.potential, stat), stat.max)) {
      pointsLost += 1;
      continue;
    }
    hero.stats[stat.key] = value + 1;
    statDeltas[stat.key] = (statDeltas[stat.key] ?? 0) + 1;
  }
  return { statDeltas, pointsLost };
}

/** The key whose share of the running sum of `weights` holds `at`; the last for a sum rounded short. */
function weighedKey(weights: readonly [StatKey, number][], at: number): StatKey | undefined {
  let reached = 0;
  for (const [key, weight] of weights) {
    reached += weight;
    if (at < reached) return key;
  }
  return weights.at(-1)?.[0];
}

function checkLevel(level: number): void {
  if (!Number.isSafeInteger(level) || level < firstLevel) {
    throw new RangeError(`A Level is a whole number from ${firstLevel}; got ${level}`);
  }
}
