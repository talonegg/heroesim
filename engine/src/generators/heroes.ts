// The Heroes Generator (M1-S5, approach §1): a Hero from content and config, drawn from one
// named stream — `generation` at world creation, `pool` when M2-S8 refills the Unattached pool
// (pre-M0 review D7). The draw order is DL-19 item 4; changing it changes every seed's Heroes.
// Their Portrait and their texts are drawn after, on `hero-portraits` and `hero-descriptions`, one
// draw and thirteen whatever is written, so no draw of the named stream moves (v1.1.3-S6).

import type { EngineDeps } from '../config.js';
import type { Class, ClassKey, SkillKey } from '../content-types.js';
import {
  highestSkillRating,
  lowestSkillRating,
  rowOf,
  takeId,
  type EntityId,
  type Guild,
  type GuildId,
  type Hero,
  type SkillRating,
  type StatValues,
  type World,
} from '../document.js';
import type { HeroGenerated } from '../events.js';
import { describeNewHero, heroDescriptionsStream } from '../descriptions.js';
import { giveHeroPortrait, heroPortraitsStream } from '../portraits.js';
import { xpForLevel } from '../progression.js';
import { int, shuffle, weightedPick } from '../rng.js';
import {
  clamp,
  drawCount,
  drawPersonName,
  pickByWeight,
  sexes,
  sortedRows,
  streamOf,
  type DrawsFrom,
  type Stream,
} from './draw.js';

/** A generated Hero's Level unless the caller gives one. */
const firstLevel = 1;

export interface HeroOptions extends DrawsFrom {
  /** The Hero's Class; drawn from content by the Classes' weights (`pickByWeight`, DL-202) when omitted. */
  classKey?: ClassKey;
  /**
   * Stored as given (DL-19), with the XP that Level takes, `xpForLevel`, so that the Hero's XP and
   * Level agree (DL-36); no growth is applied for the Levels above the first.
   */
  level?: number;
  /** The Guild whose Roster the Hero joins; Unattached when omitted. */
  guildId?: GuildId;
}

export interface GeneratedHero {
  hero: Hero;
  events: HeroGenerated[];
}

/**
 * Generates a Hero into `world` (DL-19 item 4): adds the row, takes its id from the counters,
 * puts the Hero on the named Guild's Roster if any, and returns the Hero and its
 * `hero.generated` event for the caller to append. Draws from `options.stream`, `generation` by
 * default; then the Hero's Portrait from `hero-portraits` (`giveHeroPortrait`) and their Appearance
 * and Biography from `hero-descriptions` (`describeNewHero`), a fixed number of draws of each
 * (v1.1.3-S6, DL-135 items 3 and 6).
 *
 * Throws, changing nothing, on a programming error: an unknown Class, a Guild not in the world,
 * a Level that is not a whole number from 1, a `startingSkillRatingMax` off the Skill scale, or
 * a stream the world does not have.
 */
export function generateHero(world: World, deps: EngineDeps, options: HeroOptions = {}): GeneratedHero {
  const { config, content } = deps;
  const { classKey, level = firstLevel, guildId } = options;

  const givenClass = classKey === undefined ? undefined : classOf(deps, classKey);
  const guild = guildId === undefined ? undefined : guildOf(world, guildId);
  if (!Number.isSafeInteger(level) || level < firstLevel) {
    throw new RangeError(`A Hero's Level is a whole number from ${firstLevel}; got ${level}`);
  }
  const ratingMax = config.startingSkillRatingMax;
  if (!Number.isSafeInteger(ratingMax) || ratingMax < lowestSkillRating || ratingMax > highestSkillRating) {
    throw new RangeError(
      `startingSkillRatingMax is a Skill rating from ${lowestSkillRating} to ${highestSkillRating}; got ${ratingMax}`,
    );
  }
  const state = streamOf(world, options.stream);
  // The Hero's own two streams, found before anything changes.
  streamOf(world, heroPortraitsStream);
  streamOf(world, heroDescriptionsStream);

  // The sex by its weight in `heroSexWeights` (v1.1.6-S16, DL-202), one draw whatever the weights.
  const sex = weightedPick(state, sexes, sexes.map((one) => config.heroSexWeights[one]));
  const name = drawPersonName(state, content.names, sex);
  const backgroundKey = pickByWeight(state, sortedRows(content.backgrounds, (row) => row.owner === 'hero')).key;
  const heroClass = givenClass ?? pickByWeight(state, sortedRows(content.classes));
  const ageAtEntry = int(state, config.heroStartingAgeMin, config.heroStartingAgeMax);
  const { stats, potential } = drawStats(state, deps, heroClass);
  const skills = drawSkills(state, deps, heroClass);

  const id = takeId(world, 'heroes');
  const hero: Hero = {
    id,
    name,
    sex,
    backgroundKey,
    classKey: heroClass.key,
    enteredTurn: world.turn,
    ageAtEntry,
    guildId: guild?.id ?? null,
    // A Hero generated onto no Roster enters the Unattached pool now (DL-27).
    unattachedSince: guild === undefined ? world.turn : null,
    leftPoolOnTurn: null,
    partyId: null,
    stats,
    potential,
    skills,
    traits: [],
    xp: xpForLevel(level, config),
    level,
    injury: null,
    morale: config.moraleBaseline,
    diedOnTurn: null,
    retiredOnTurn: null,
    transferredOnTurn: null,
    portraitKey: null,
    appearance: '',
    biography: '',
    regard: {},
  };
  // The Portrait, then the texts, each from a stream of its own (ADR-0009 as amended 2026-10-01), so no
  // draw of `options.stream` moves (v1.1.3-S6, DL-135 items 3 and 6). The texts follow the picture.
  giveHeroPortrait(world, content, hero);
  describeNewHero(world, deps, hero);
  world.heroes[id] = hero;
  guild?.rosterIds.push(id);

  // The Guild of any Hero involved is a participant (data-model §4).
  const participants: EntityId[] = [id];
  const labels: Record<EntityId, string> = {};
  labels[id] = name;
  if (guild !== undefined) {
    participants.push(guild.id);
    labels[guild.id] = guild.name;
  }
  const event: HeroGenerated = {
    turn: world.turn,
    type: 'hero.generated',
    participants,
    labels,
    milestone: false,
    payload: { heroId: id, guildId: hero.guildId, classKey: hero.classKey },
  };
  return { hero, events: [event] };
}

/**
 * Base values and Potential for each Hero Stat in key order: a base from `statBaseMin/Max`, the
 * Class bias added on its leading Stats, held to the content range; Potential the base plus a
 * gap, held between the base and the Stat's maximum. Two draws a Stat, three on a leading one.
 */
function drawStats(state: Stream, { config, content }: EngineDeps, heroClass: Class) {
  const stats: StatValues = {};
  const potential: StatValues = {};
  for (const stat of sortedRows(content.stats, (row) => row.owner === 'hero')) {
    const bias = heroClass.leadingStats.includes(stat.key) ? int(state, config.statBiasMin, config.statBiasMax) : 0;
    const base = clamp(int(state, config.statBaseMin, config.statBaseMax) + bias, stat.min, stat.max);
    const gap = int(state, config.potentialGapMin, config.potentialGapMax);
    stats[stat.key] = base;
    potential[stat.key] = clamp(base + gap, base, stat.max);
  }
  return { stats, potential };
}

/**
 * `startingSkillsMin/Max` of the Class's gated Skills, from a shuffle of the gated list, each
 * rated from 1 to `startingSkillRatingMax`.
 */
function drawSkills(state: Stream, { config }: EngineDeps, heroClass: Class): Record<SkillKey, SkillRating> {
  const gated = heroClass.gatedSkills;
  const count = drawCount(state, config.startingSkillsMin, config.startingSkillsMax, gated.length);
  const skills: Record<SkillKey, SkillRating> = {};
  for (const key of shuffle(state, gated).slice(0, count)) {
    skills[key] = int(state, lowestSkillRating, config.startingSkillRatingMax) as SkillRating;
  }
  return skills;
}

function classOf({ content }: EngineDeps, key: ClassKey): Class {
  const found = rowOf(content.classes, key);
  if (found === undefined) throw new RangeError(`No Class in content is keyed ${JSON.stringify(key)}`);
  return found;
}

function guildOf(world: World, id: GuildId): Guild {
  const found = rowOf(world.guilds, id);
  if (found === undefined) throw new RangeError(`No Guild in the world has the id ${id}`);
  return found;
}
