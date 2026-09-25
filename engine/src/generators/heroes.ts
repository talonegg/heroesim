// The Heroes Generator (M1-S5, approach §1): a Hero from content and config, drawn from one
// named stream — `generation` at world creation, `pool` when M2-S8 refills the Unattached pool
// (pre-M0 review D7). The draw order is DL-19 item 4; changing it changes every seed's Heroes.

import type { EngineDeps } from '../config.js';
import type { Class, ClassKey, SkillKey } from '../content-types.js';
import {
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
import { int, pick, shuffle } from '../rng.js';
import {
  clamp,
  drawCount,
  drawPersonName,
  sexes,
  sortedKeys,
  sortedRows,
  streamOf,
  type DrawsFrom,
  type Stream,
} from './draw.js';

/** A generated Hero's Level unless the caller gives one. */
const firstLevel = 1;

/** The Skill scale, `SkillRating`: a Hero's rating runs from 1 to 5. */
const lowestSkillRating = 1;
const highestSkillRating = 5;

export interface HeroOptions extends DrawsFrom {
  /** The Hero's Class; drawn uniformly from content when omitted. */
  classKey?: ClassKey;
  /** Stored as given; no growth is applied for a Level above the first until M3 (DL-19). */
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
 * default, and from no other stream.
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

  const sex = pick(state, sexes);
  const name = drawPersonName(state, content.names, sex);
  const backgroundKey = pick(state, sortedKeys(content.backgrounds, (row) => row.owner === 'hero'));
  const heroClass = givenClass ?? classOf(deps, pick(state, sortedKeys(content.classes)));
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
    xp: 0,
    level,
    injury: null,
    morale: config.moraleBaseline,
    diedOnTurn: null,
    retiredOnTurn: null,
    regard: {},
  };
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
  const found = Object.hasOwn(content.classes, key) ? content.classes[key] : undefined;
  if (found === undefined) throw new RangeError(`No Class in content is keyed ${JSON.stringify(key)}`);
  return found;
}

function guildOf(world: World, id: GuildId): Guild {
  const found = Object.hasOwn(world.guilds, id) ? world.guilds[id] : undefined;
  if (found === undefined) throw new RangeError(`No Guild in the world has the id ${id}`);
  return found;
}
