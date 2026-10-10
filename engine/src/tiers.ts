// The Tier engine (DL-257 items 1 to 3, DL-262): which Tier of the config's ladder a Quest is drawn at,
// and the figures it is drawn and paid by. The Board's draw centres on the world's mean Level, the same
// for every Guild (#22's Board scaling), and weighs each Tier a template offers by its distance from
// that centre. A Quest's difficulty sits in its Tier's band and its Days at the same place in its
// Tier's days, so a harder Quest of a Tier is a longer one (Q4 a). Pure: nothing here draws or writes.
//
// The engine stays total whatever content or a save holds: a Tier past the ladder reads the ladder's
// last, a template's Tiers are clipped to the ladder, and a Tier wanting more Beats than its template
// has plays those it has. Content's check refuses each of those first (DL-262).

import type { GameConfig, TierRow } from './config.js';
import type { Encounter, EncounterKey, QuestBeat, QuestBeatPool, QuestTemplate } from './content-types.js';
import { rowOf, type World } from './document.js';
import { clamp } from './generators/draw.js';

/**
 * The world's mean Level (DL-257 item 3): the mean of every Hero on the Roster of a Guild in play, the
 * player's and the Rivals' alike, a Hero away or injured counted, the Unattached pool not; 0 when no
 * Guild in play has a Hero.
 */
export function meanLevel(world: Pick<World, 'guilds' | 'heroes'>): number {
  let heroes = 0;
  let levels = 0;
  for (const guild of Object.values(world.guilds)) {
    if (guild.foldedOnTurn !== null) continue;
    for (const heroId of guild.rosterIds) {
      const hero = rowOf(world.heroes, heroId);
      if (hero === undefined) continue;
      heroes += 1;
      levels += hero.level;
    }
  }
  return heroes === 0 ? 0 : levels / heroes;
}

/** The Tier the Board's draw centres on (DL-257 item 3): 1 + ⌊`mean` ÷ `levelsPerTier`⌋, held on the ladder. */
export function centreTier(mean: number, config: Pick<GameConfig, 'tiers' | 'levelsPerTier'>): number {
  return clamp(1 + Math.floor(mean / config.levelsPerTier), 1, config.tiers.length);
}

/** The Tiers `template` offers, from its `tierMin` to its `tierMax`, held on the ladder: one at least. */
export function offeredTiers(template: Pick<QuestTemplate, 'tierMin' | 'tierMax'>, config: Pick<GameConfig, 'tiers'>): number[] {
  const last = config.tiers.length;
  const low = clamp(template.tierMin, 1, last);
  const high = Math.max(low, clamp(template.tierMax, 1, last));
  return Array.from({ length: high - low + 1 }, (_, index) => low + index);
}

/**
 * Each of `offered`'s weights in the draw of a Quest's Tier (DL-262): `tierDrawWeights` at its distance
 * from `centre`, held inside the Tiers offered, so the nearest offered Tier weighs the centre's and a
 * template wholly above or below the centre is still drawn; a distance past the list weighs 0.
 */
export function tierWeights(offered: readonly number[], centre: number, config: Pick<GameConfig, 'tierDrawWeights'>): number[] {
  const held = clamp(centre, offered[0] ?? centre, offered.at(-1) ?? centre);
  return offered.map((tier) => config.tierDrawWeights[Math.abs(tier - held)] ?? 0);
}

/**
 * The figures a Quest of `template` at `tier` is drawn and paid by (DL-257 item 1): the ladder's row
 * for the Tier, held on the ladder, with each figure the template overrides for it. The ladder's row
 * alone for a template content no longer defines (data-model rule 5).
 */
export function tierFigures(template: Pick<QuestTemplate, 'overrides'> | undefined, tier: number, config: Pick<GameConfig, 'tiers'>): TierRow {
  const held = clamp(tier, 1, config.tiers.length);
  const row = config.tiers[held - 1] as TierRow;
  const override = template?.overrides === undefined ? undefined : rowOf(template.overrides, String(held));
  return override === undefined ? row : { ...row, ...override };
}

/** A Tier's difficulty band held inside the difficulty scale, as the Quest Generator draws it. */
export function difficultyBand(
  figures: Pick<TierRow, 'difficultyMin' | 'difficultyMax'>,
  config: Pick<GameConfig, 'questDifficultyMin' | 'questDifficultyMax'>,
): [low: number, high: number] {
  const scale = (value: number): number => clamp(value, config.questDifficultyMin, config.questDifficultyMax);
  return [scale(figures.difficultyMin), scale(figures.difficultyMax)];
}

/**
 * A Quest's Days away at `difficulty` (DL-257 item 1, Q4 a): the place `difficulty` has in its Tier's
 * band (`difficultyBand`), from 0 at its bottom to 1 at its top, taken in the Tier's days and rounded
 * to a whole Day; a band of one value gives `daysMin`. Draws nothing.
 */
export function daysAt(
  difficulty: number,
  figures: Pick<TierRow, 'difficultyMin' | 'difficultyMax' | 'daysMin' | 'daysMax'>,
  config: Pick<GameConfig, 'questDifficultyMin' | 'questDifficultyMax'>,
): number {
  const [low, high] = difficultyBand(figures, config);
  const share = high > low ? clamp((difficulty - low) / (high - low), 0, 1) : 0;
  return Math.round(figures.daysMin + share * (figures.daysMax - figures.daysMin));
}

/**
 * The Beats a Quest of `template` plays at a Tier of `count` Beats (DL-262): the template's first
 * `count` − 1 and then its Finale, or its first `count` where it has no Finale, never more than it
 * has. A higher Tier plays further into the template.
 */
export function beatsPlayed(
  template: Pick<QuestTemplate, 'beats' | 'finale'>,
  count: number,
): { beats: QuestBeat[]; finale: EncounterKey | null } {
  const finale = template.finale ?? null;
  return { beats: template.beats.slice(0, beatsDrawn(template.beats.length, finale !== null, count)), finale };
}

/** How many of a template's `beats` a Quest of `count` Beats draws: `count`, one fewer for a Finale, never more than it has. */
export function beatsDrawn(beats: number, finale: boolean, count: number): number {
  return clamp(finale ? count - 1 : count, 0, beats);
}

/**
 * Whether `encounter` is in a Beat's `pool` (DL-262): named in its `encounters`, or matching every
 * criterion it gives among `kinds` (its kind one of them) and `tags` (it shares one of them); a pool
 * giving neither matches none but those it names. A Finale is left out by the caller, which knows them.
 */
export function inBeatPool(encounter: Pick<Encounter, 'key' | 'kind' | 'tags'>, pool: QuestBeatPool): boolean {
  if (pool.encounters?.includes(encounter.key) === true) return true;
  const { kinds, tags } = pool;
  if (kinds === undefined && tags === undefined) return false;
  const ofKind = kinds === undefined || kinds.includes(encounter.kind);
  const tagged = tags === undefined || (encounter.tags ?? []).some((tag) => tags.includes(tag));
  return ofKind && tagged;
}

/**
 * The Beats whose pools, each a list of the Encounters it may draw in a template's order, are too
 * small to draw from whatever the Beats before them drew (DL-262), each with how many it needs: one,
 * and one more for each earlier Beat whose pool shares an Encounter with it, since that Beat may have
 * drawn it. A sufficient rule: a template none of whose Beats is short never draws a Beat empty.
 */
export function shortBeats(pools: readonly (readonly string[])[]): { beat: number; size: number; needs: number }[] {
  const sets = pools.map((pool) => new Set(pool));
  return sets.flatMap((pool, beat) => {
    const sharing = sets.slice(0, beat).filter((earlier) => [...earlier].some((key) => pool.has(key))).length;
    return pool.size < 1 + sharing ? [{ beat, size: pool.size, needs: 1 + sharing }] : [];
  });
}
