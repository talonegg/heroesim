// Morale (INPUTS 4.8, M2-S5, M2-S6, DL-29): a number on the scale `moraleMin` to `moraleMax`, read
// in named bands. A discrete change — a Death on the Roster, a strong success — always emits
// `hero.morale-changed`; the nightly drift toward the baseline emits it only when it crosses a
// band (data-model rule 10, pre-M0 review A7). Both night phases that move Morale share this file.

import { moraleBandNames, type GameConfig, type MoraleBand } from './config.js';
import type { ContentSet } from './content-types.js';
import type { Hero, QuestId, World } from './document.js';
import type { Emit } from './emit.js';
import type { HeroMoraleChanged, MoraleCause } from './events.js';
import { guildmasterOf, inspirationShift, traitMoraleShift } from './guildmaster.js';

/**
 * The band `morale` falls in: the highest of `moraleBands` whose start it has reached, and the
 * lowest band for a value below every start. A selector, for the rules and the front ends alike.
 */
export function moraleBand(morale: number, config: Pick<GameConfig, 'moraleBands'>): MoraleBand {
  let band: MoraleBand = moraleBandNames[0];
  for (const name of moraleBandNames) {
    if (morale >= config.moraleBands[name]) band = name;
  }
  return band;
}

/**
 * The Morale `hero`'s nightly drift returns them to: `moraleBaseline`, plus `quartersMoraleBonus`
 * for each grade of their Guild's quarters (M3-S6, R33), plus their Guildmaster's Inspiration
 * (`inspirationShift`, up to `inspirationMoraleShift`) and `guildMoraleShift` Traits (M4-S5, R8,
 * pre-M0 review B2), rounded to a whole number and held inside `moraleMin` to `moraleMax`. A Hero
 * on no Roster has no quarters and no Guildmaster. The one place the baseline is worked out, for
 * the Hero State Engine and the front ends alike, and for every Guild alike (ADR-0002).
 */
export function moraleBaselineFor(
  hero: Pick<Hero, 'guildId'>,
  world: Pick<World, 'guilds' | 'guildmasters'>,
  config: Pick<
    GameConfig,
    'moraleBaseline' | 'quartersMoraleBonus' | 'moraleMin' | 'moraleMax' | 'inspirationMoraleShift'
  >,
  content: Pick<ContentSet, 'stats' | 'guildmasterTraits'>,
): number {
  const guild = hero.guildId !== null && Object.hasOwn(world.guilds, hero.guildId) ? world.guilds[hero.guildId] : undefined;
  if (guild === undefined) return Math.min(config.moraleMax, Math.max(config.moraleMin, config.moraleBaseline));
  const guildmaster = guildmasterOf(guild, world);
  const baseline =
    config.moraleBaseline +
    config.quartersMoraleBonus * guild.hall.quarters +
    inspirationShift(guildmaster, content, config) +
    traitMoraleShift(guildmaster, content);
  return Math.min(config.moraleMax, Math.max(config.moraleMin, Math.round(baseline)));
}

/**
 * Adds `delta` to `hero`'s Morale, held inside `moraleMin` to `moraleMax`, and returns the
 * `hero.morale-changed` a discrete change always emits, even when the scale's end leaves the value
 * where it was. `questId`, given for a change a Quest's return causes, names the Quest (M9-F1).
 */
export function changeMorale(
  hero: Hero,
  delta: number,
  cause: Exclude<MoraleCause, 'drift'>,
  config: Pick<GameConfig, 'moraleBands' | 'moraleMin' | 'moraleMax'>,
  emit: Emit,
  questId?: QuestId,
): HeroMoraleChanged {
  const before = hero.morale;
  hero.morale = Math.min(config.moraleMax, Math.max(config.moraleMin, before + delta));
  return moraleChanged(hero, before, cause, config, emit, questId);
}

/**
 * The `hero.morale-changed` for `hero`'s Morale having moved from `before` to where it is now,
 * naming the Quest `questId` when given: in the payload, and as a participant (M9-F1, DL-112 item 2).
 */
export function moraleChanged(
  hero: Hero,
  before: number,
  cause: MoraleCause,
  config: Pick<GameConfig, 'moraleBands'>,
  emit: Emit,
  questId?: QuestId,
): HeroMoraleChanged {
  const after = hero.morale;
  return emit({
    type: 'hero.morale-changed',
    participants: questId === undefined ? [hero.id] : [hero.id, questId],
    payload: {
      heroId: hero.id,
      cause,
      ...(questId === undefined ? {} : { questId }),
      before,
      after,
      bandBefore: moraleBand(before, config),
      bandAfter: moraleBand(after, config),
    },
  });
}
