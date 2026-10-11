// The Tier engine (DL-257 items 1 to 3, DL-262, DL-271): which Tier of the config's ladder a Quest is
// drawn at, and the figures it is drawn and paid by. Each Guild in play unlocks the Tiers whose unlock
// Level the mean Level of its best four reaches; the shared Board offers Tiers up to the highest any
// Guild has unlocked, its top Tier, the same for every Guild (#22's Board scaling), and weighs each
// Tier a template offers by its distance below that top, so the lower Tiers stay on offer all game. A
// Quest's difficulty sits in its Tier's band and its Days at the same place in its Tier's days, so a
// harder Quest of a Tier is a longer one (Q4 a). Pure: nothing here draws or writes.
//
// The engine stays total whatever content or a save holds: a Tier past the ladder reads the ladder's
// last, a template's Tiers are clipped to the ladder, and a Tier wanting more Beats than its template
// has plays those it has. Content's check refuses each of those first (DL-262).

import type { GameConfig, TierRow } from './config.js';
import type { ContentSet, Encounter, EncounterKey, QuestBeat, QuestBeatPool, QuestTemplate } from './content-types.js';
import { rowOf, type Guild, type Quest, type World } from './document.js';
import { clamp } from './generators/draw.js';

/**
 * The mean Level of `guild`'s best four (DL-271): its `unlockHeroes` Heroes of the highest Level on its
 * Roster, a Hero away or injured counted. A place its Roster cannot fill counts as Level 0, the sum
 * divided by `unlockHeroes` whatever the Roster holds, so that one strong Hero does not unlock a Tier
 * alone. A Roster id the world has no Hero for is passed over.
 */
export function bestFourLevel(guild: Pick<Guild, 'rosterIds'>, world: Pick<World, 'heroes'>, config: Pick<GameConfig, 'unlockHeroes'>): number {
  const levels = guild.rosterIds.flatMap((heroId) => {
    const hero = rowOf(world.heroes, heroId);
    return hero === undefined ? [] : [hero.level];
  });
  const best = levels.sort((a, b) => b - a).slice(0, config.unlockHeroes);
  return best.reduce((total, level) => total + level, 0) / config.unlockHeroes;
}

/** The highest Tier whose `unlockLevel` `level` reaches (DL-271): Tier 1 at least, whose is 0. */
export function unlockedTier(level: number, config: Pick<GameConfig, 'tiers'>): number {
  let unlocked = 1;
  config.tiers.forEach((row, index) => {
    if (row.unlockLevel <= level) unlocked = Math.max(unlocked, index + 1);
  });
  return unlocked;
}

/**
 * The Board's top Tier (DL-271): the highest Tier any Guild in play has unlocked by its best four
 * (`bestFourLevel`, `unlockedTier`), the player's and the Rivals' alike, the Unattached pool not;
 * Tier 1 with no Guild in play. Read once for a refresh of the Board, which no draw changes.
 */
export function boardTopTier(world: Pick<World, 'guilds' | 'heroes'>, config: Pick<GameConfig, 'tiers' | 'unlockHeroes'>): number {
  let top = 1;
  for (const guild of Object.values(world.guilds)) {
    if (guild.foldedOnTurn !== null) continue;
    top = Math.max(top, unlockedTier(bestFourLevel(guild, world, config), config));
  }
  return top;
}

/** The Tiers `template` offers, from its `tierMin` to its `tierMax`, held on the ladder: one at least. */
export function offeredTiers(template: Pick<QuestTemplate, 'tierMin' | 'tierMax'>, config: Pick<GameConfig, 'tiers'>): number[] {
  const last = config.tiers.length;
  const low = clamp(template.tierMin, 1, last);
  const high = Math.max(low, clamp(template.tierMax, 1, last));
  return Array.from({ length: high - low + 1 }, (_, index) => low + index);
}

/**
 * Each of `offered`'s weights in the draw of a Quest's Tier (DL-271): a Tier above `top`, the Board's top
 * Tier, weighs 0; one at or below it weighs `tierDrawWeights` at its distance below the top, the last
 * weight held for every Tier further below, so none of them weighs 0 and the lower Tiers stay on offer.
 * A template whose every Tier is above the top, drawn only where its Patron has none open
 * (`templatesOpenAt`), weighs its lowest Tier 1 and the rest 0.
 */
export function tierWeights(offered: readonly number[], top: number, config: Pick<GameConfig, 'tierDrawWeights'>): number[] {
  const weights = config.tierDrawWeights;
  if (offered.every((tier) => tier > top)) return offered.map((_, index) => (index === 0 ? 1 : 0));
  return offered.map((tier) => (tier > top ? 0 : (weights[Math.min(top - tier, weights.length - 1)] ?? 0)));
}

/**
 * The templates a Quest is drawn among at the Board's top Tier `top` (DL-271), in their order: those
 * offering a Tier at or below it (`offeredTiers`), or every one of `templates` where none does, each
 * then drawn at its lowest Tier (`tierWeights`), so a Patron with no template open yet still posts.
 */
export function templatesOpenAt<Template extends Pick<QuestTemplate, 'tierMin' | 'tierMax'>>(
  templates: readonly Template[],
  top: number,
  config: Pick<GameConfig, 'tiers'>,
): Template[] {
  const open = templates.filter((template) => (offeredTiers(template, config)[0] ?? 1) <= top);
  return open.length === 0 ? [...templates] : open;
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

/**
 * What `quest`'s Encounters' Death chances are multiplied by (DL-257 item 5, DL-265): `deathFactor`
 * times its Tier's `deathScale`, its template's override read (`tierFigures`), live as the XP factor is.
 */
export function deathScaleOf(
  quest: Pick<Quest, 'templateKey' | 'tier'>,
  content: Pick<ContentSet, 'questTemplates'>,
  config: Pick<GameConfig, 'tiers' | 'deathFactor'>,
): number {
  return config.deathFactor * tierFigures(rowOf(content.questTemplates, quest.templateKey), quest.tier, config).deathScale;
}

/** An Encounter's Death `chance` times its Quest's `scale` (`deathScaleOf`), held at 1, as a chance is (DL-265). */
export function scaledDeathChance(chance: number, scale: number): number {
  return Math.min(1, chance * scale);
}

/** Whether `encounter` has a Death chance above 0 at any Degree. */
function canKill(encounter: Pick<Encounter, 'consequences'>): boolean {
  const { triumph = [], success, setback = [], failure } = encounter.consequences;
  return [triumph, success, setback, failure].some((list) => list.some((it) => it.kind === 'death' && it.chance > 0));
}

/**
 * Whether `quest` is Deadly (`CONTEXT.md` Deadly, DL-257 item 5, DL-265): its Death scale
 * (`deathScaleOf`) is above 0 and one of its Encounters, drawn at its posting, has a Death chance
 * above 0, so a Hero may die on it. An Encounter content no longer defines is passed over (data-model
 * rule 5). The Board's mark; it gives no figure.
 */
export function isDeadly(
  quest: Pick<Quest, 'templateKey' | 'tier' | 'encounterKeys'>,
  content: Pick<ContentSet, 'questTemplates' | 'encounters'>,
  config: Pick<GameConfig, 'tiers' | 'deathFactor'>,
): boolean {
  if (!(deathScaleOf(quest, content, config) > 0)) return false;
  return quest.encounterKeys.some((key) => {
    const encounter = rowOf(content.encounters, key);
    return encounter !== undefined && canKill(encounter);
  });
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
