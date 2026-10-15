// The Guildmaster's Stats and Traits (M4-S5, R8, pre-M0 review B2, B6, D4, D9, DL-43): what each
// does, as numbers the selectors and phases that own a quantity read. Every rule is Guild-side —
// the reward agreed and the fees paid, the Morale baseline, training, Patron Regard, the Potential
// hints a Guildmaster reads — and never touches a check: the Guildmaster never joins a Party (R8),
// and `quest-engine/` reads nothing from this file (the epic's lint test greps it).
//
// Every Guild is served alike (ADR-0002): a Rival's Guildmaster's Stats and Traits work on the
// Rival's Heroes and prices exactly as the player's do on the player's.
//
// A Stat's rule reads where its value falls between the Stat's content `min` and `max`, so the
// rule scales with whatever range content gives it: Negotiation from −1 at the bottom to +1 at the
// top, the others from 0 at the bottom to 1 at the top. A Stat content does not define as a
// Guildmaster Stat has no effect; one the row lacks reads as the content's default (rule 5).

import type { GameConfig, PotentialHint } from './config.js';
import type { ClassKey, ContentSet, GuildmasterTrait, GuildmasterTraitEffect, Stat, StatKey } from './content-types.js';
import { rowOf, type Guild, type Guildmaster, type World } from './document.js';
import { sortedRows } from './generators/draw.js';
import { baseStat } from './selectors.js';

/** The content key of the Stat each Guildmaster rule reads (R8 as renamed by pre-M0 review D4). */
export const guildmasterStatKeys = Object.freeze({
  negotiation: 'negotiation',
  inspiration: 'inspiration',
  coaching: 'coaching',
  influence: 'influence',
  judgement: 'judgement',
} as const);

/**
 * Every Guildmaster Trait of `content`, in key order (M9-S2): those a drawn Guildmaster's are drawn
 * from, and a setup may choose from, as the front ends list them (the M9 review). A Hero's Trait is
 * not among them: it is of the other list (v1.1.4-S7).
 */
export function guildmasterTraitsOf(content: Pick<ContentSet, 'guildmasterTraits'>): GuildmasterTrait[] {
  return sortedRows(content.guildmasterTraits);
}

/**
 * Every Guildmaster Stat of `content`, in content's order (v1.1.4-S11): those a player who chooses
 * their Guildmaster's Stats at setup sets, each one, as the front ends list them. A Hero's Stat is
 * not among them.
 */
export function guildmasterStatsOf(content: Pick<ContentSet, 'stats'>): Stat[] {
  return Object.values(content.stats).filter((row) => row.owner === 'guildmaster');
}

/** The Guildmaster rules, each named after the Stat it reads. */
export type GuildmasterRule = keyof typeof guildmasterStatKeys;

/** What the Guildmaster rules read of content. */
export type GuildmasterContent = Pick<ContentSet, 'stats' | 'guildmasterTraits'>;

/** A Guildmaster as the rules read one: their Stats and Traits. */
export type GuildmasterTraits = Pick<Guildmaster, 'stats' | 'traits'>;

/**
 * The Guildmaster of `guild`, or `undefined` for a Guild whose Guildmaster has no row, which the
 * validator refuses; a rule reads that as no Guildmaster, with no effect.
 */
export function guildmasterOf(
  guild: Pick<Guild, 'guildmasterId'>,
  world: Pick<World, 'guildmasters'>,
): Guildmaster | undefined {
  return rowOf(world.guildmasters, guild.guildmasterId);
}

/**
 * Where `guildmaster`'s Stat for `rule` falls in the Stat's range: 0 at content's `min`, 1 at its
 * `max`, held inside 0 to 1; `null` when content defines no such Guildmaster Stat, or a range of
 * one value, which no rule can read a position from.
 */
export function statShare(
  guildmaster: Pick<Guildmaster, 'stats'>,
  rule: GuildmasterRule,
  content: Pick<ContentSet, 'stats'>,
): number | null {
  const key: StatKey = guildmasterStatKeys[rule];
  const stat = rowOf(content.stats, key);
  if (stat === undefined || stat.owner !== 'guildmaster' || !(stat.max > stat.min)) return null;
  const share = (baseStat(guildmaster.stats, stat) - stat.min) / (stat.max - stat.min);
  return Math.min(1, Math.max(0, share));
}

/** The share for `rule`, 0 for no Guildmaster or no such Stat: the rule then has no effect. */
function upTo(guildmaster: Pick<Guildmaster, 'stats'> | undefined, rule: GuildmasterRule, content: Pick<ContentSet, 'stats'>): number {
  return guildmaster === undefined ? 0 : (statShare(guildmaster, rule, content) ?? 0);
}

// ── Negotiation ──────────────────────────────────────────────────────────────────────────────

/**
 * Negotiation's reach for `guildmaster` (R8, INPUTS 6.5, pre-M0 review B6): from −`negotiationRange`
 * at the bottom of the Stat's range to +`negotiationRange` at the top, 0 at its middle. The reward
 * agreed scales by 1 plus it, a fee by 1 less it. 0 for no Guildmaster.
 */
export function negotiation(
  guildmaster: Pick<Guildmaster, 'stats'> | undefined,
  content: Pick<ContentSet, 'stats'>,
  config: Pick<GameConfig, 'negotiationRange'>,
): number {
  if (guildmaster === undefined) return 0;
  const share = statShare(guildmaster, 'negotiation', content);
  return share === null ? 0 : config.negotiationRange * (2 * share - 1);
}

/**
 * The reward a Guild led by `guildmaster` agrees for a Quest offering `reward`: the reward × (1 +
 * `negotiation`), rounded to a whole Wealth. `dispatch` writes it onto the Quest it takes.
 */
export function negotiatedReward(
  reward: number,
  guildmaster: Pick<Guildmaster, 'stats'> | undefined,
  content: Pick<ContentSet, 'stats'>,
  config: Pick<GameConfig, 'negotiationRange'>,
): number {
  return Math.round(reward * (1 + negotiation(guildmaster, content, config)));
}

/** What a fee is multiplied by for a buyer led by `guildmaster`: 1 − `negotiation`. */
export function feeFactor(
  guildmaster: Pick<Guildmaster, 'stats'> | undefined,
  content: Pick<ContentSet, 'stats'>,
  config: Pick<GameConfig, 'negotiationRange'>,
): number {
  return 1 - negotiation(guildmaster, content, config);
}

// ── Inspiration, Coaching, Influence, Judgement ──────────────────────────────────────────────

/** Inspiration: the rise in the Morale baseline of `guildmaster`'s Heroes, 0 to `inspirationMoraleShift`. */
export function inspirationShift(
  guildmaster: Pick<Guildmaster, 'stats'> | undefined,
  content: Pick<ContentSet, 'stats'>,
  config: Pick<GameConfig, 'inspirationMoraleShift'>,
): number {
  return config.inspirationMoraleShift * upTo(guildmaster, 'inspiration', content);
}

/** Coaching: what training XP is multiplied by, 1 to 1 + `coachingFactor`. */
export function coachingMultiplier(
  guildmaster: Pick<Guildmaster, 'stats'> | undefined,
  content: Pick<ContentSet, 'stats'>,
  config: Pick<GameConfig, 'coachingFactor'>,
): number {
  return 1 + config.coachingFactor * upTo(guildmaster, 'coaching', content);
}

/** Influence: what a gain in a Patron's Regard for the Guild is multiplied by, 1 to 1 + `influenceFactor`. */
export function influenceMultiplier(
  guildmaster: Pick<Guildmaster, 'stats'> | undefined,
  content: Pick<ContentSet, 'stats'>,
  config: Pick<GameConfig, 'influenceFactor'>,
): number {
  return 1 + config.influenceFactor * upTo(guildmaster, 'influence', content);
}

/**
 * Judgement (pre-M0 review D9): the Potential hint bands `guildmaster` reads, each start of
 * `potentialHintBands` scaled by 1 − up to `judgementHintSharpening`, so every band but the last
 * is narrower and a sharper judge calls a smaller gap promising. Passed to `potentialHint` as its
 * bands (DL-37 item 4); `potentialHint` itself is unchanged. The bands in force for no Guildmaster.
 */
export function judgedHintBands(
  guildmaster: Pick<Guildmaster, 'stats'> | undefined,
  content: Pick<ContentSet, 'stats'>,
  config: Pick<GameConfig, 'potentialHintBands' | 'judgementHintSharpening'>,
): Readonly<Record<PotentialHint, number>> {
  const scale = 1 - config.judgementHintSharpening * upTo(guildmaster, 'judgement', content);
  const bands = config.potentialHintBands;
  return { modest: bands.modest * scale, promising: bands.promising * scale, exceptional: bands.exceptional * scale };
}

// ── Traits ───────────────────────────────────────────────────────────────────────────────────

/**
 * The effects of `guildmaster`'s Traits, in the order the Traits are held and each Trait's in its own
 * order (v1.1.4-S7, DL-150 item 2). A key that is no Guildmaster Trait of content, such as a Hero
 * Trait held by mistake, contributes none (rule 5).
 */
export function traitEffects(
  guildmaster: Pick<Guildmaster, 'traits'> | undefined,
  content: Pick<ContentSet, 'guildmasterTraits'>,
): GuildmasterTraitEffect[] {
  if (guildmaster === undefined) return [];
  const effects: GuildmasterTraitEffect[] = [];
  for (const key of guildmaster.traits) {
    if (Object.hasOwn(content.guildmasterTraits, key)) effects.push(...(content.guildmasterTraits[key]?.effects ?? []));
  }
  return effects;
}

/** The sum of `guildMoraleShift` effects among `guildmaster`'s Traits: added to the Morale baseline. */
export function traitMoraleShift(guildmaster: Pick<Guildmaster, 'traits'> | undefined, content: Pick<ContentSet, 'guildmasterTraits'>): number {
  let shift = 0;
  for (const effect of traitEffects(guildmaster, content)) if (effect.kind === 'guildMoraleShift') shift += effect.delta;
  return shift;
}

/** The product of `upkeepFactor` effects among `guildmaster`'s Traits: what the Hall's upkeep is multiplied by, the wages not (DL-298). */
export function traitUpkeepFactor(guildmaster: Pick<Guildmaster, 'traits'> | undefined, content: Pick<ContentSet, 'guildmasterTraits'>): number {
  let factor = 1;
  for (const effect of traitEffects(guildmaster, content)) if (effect.kind === 'upkeepFactor') factor *= effect.factor;
  return factor;
}

/**
 * The sum of `classStatBonus` effects among `guildmaster`'s Traits for a Hero of `classKey`, by
 * Stat: what `effectiveStats` adds to that Hero's base Stats.
 */
export function traitStatBonuses(
  guildmaster: Pick<Guildmaster, 'traits'> | undefined,
  classKey: ClassKey,
  content: Pick<ContentSet, 'guildmasterTraits'>,
): Record<StatKey, number> {
  const bonuses: Record<StatKey, number> = {};
  for (const effect of traitEffects(guildmaster, content)) {
    if (effect.kind !== 'classStatBonus' || effect.classKey !== classKey) continue;
    bonuses[effect.statKey] = (bonuses[effect.statKey] ?? 0) + effect.delta;
  }
  return bonuses;
}
