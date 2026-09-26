// The Guild Generator, with the Guildmaster Generator inside it (M1-S6): every Guild, the
// player's and each Rival's, comes from this one function, and nothing in it reads `controller`
// (ADR-0002). A Guildmaster exists only with a Guild, so both rows are made together. The draw
// order is DL-19 items 6 and 7; changing it changes every seed's Guilds.

import type { EngineDeps } from '../config.js';
import type { BackgroundKey, ContentSet, DispositionKey } from '../content-types.js';
import {
  facilityKeys,
  takeId,
  type Controller,
  type EntityId,
  type Guild,
  type GuildId,
  type Guildmaster,
  type GuildmasterId,
  type Hall,
  type StatValues,
  type Turn,
  type World,
} from '../document.js';
import type { GuildFounded, GuildmasterGenerated, HeroGenerated } from '../events.js';
import { int, pick, shuffle } from '../rng.js';
import {
  checkName,
  clamp,
  dealEvenly,
  drawCount,
  drawPersonName,
  pickUnused,
  sexes,
  sortedKeys,
  sortedRows,
  streamOf,
  type DrawsFrom,
  type Stream,
} from './draw.js';
import { generateHero } from './heroes.js';

/** A Hall facility's grade before any Improvement (M3-S6). */
const unimprovedGrade = 0;

/** A Guild is founded unknown: Fame rises and falls with Quest outcomes from M2. */
const foundingFame = 0;

export interface GuildOptions extends DrawsFrom {
  /** The one thing a player's Guild and a Rival's differ in (ADR-0002). */
  controller: Controller;
  /** Heroes generated onto the Roster, their Classes dealt evenly (DL-19 item 7). */
  rosterSize: number;
  wealth: number;
  /** Drawn from content's Guild names when omitted: one no Guild has had, while any is left (DL-28). */
  name?: string;
  /** A Background with `owner: "guild"`; drawn from those when omitted. */
  backgroundKey?: BackgroundKey;
  /** Drawn from content's given and family names when omitted. */
  guildmasterName?: string;
}

export interface GeneratedGuild {
  guild: Guild;
  guildmaster: Guildmaster;
  /** `guild.founded`, `guildmaster.generated`, then one `hero.generated` per Roster Hero. */
  events: (GuildFounded | GuildmasterGenerated | HeroGenerated)[];
}

/**
 * Generates a Guild into `world` (DL-19 items 6 and 7): the Guild, its Guildmaster, and its Roster
 * through the Heroes Generator, all drawn from `options.stream` (`generation` by default); ids
 * from the counters; the Hall at grade 0 in every facility and Fame 0. Returns both rows and the
 * events for the caller to append.
 *
 * Throws, changing nothing, on a programming error: a blank name, a key that is not a Guild
 * Background, a Roster size that is not a whole number from 0, a Wealth that is not a finite
 * number, a stream the world does not have, or every Guild name in content held by a Guild in
 * play (`drawGuildName`).
 */
export function generateGuild(world: World, deps: EngineDeps, options: GuildOptions): GeneratedGuild {
  const { content } = deps;
  const { controller, rosterSize, wealth } = options;

  if (options.name !== undefined) checkName(options.name, 'Guild');
  if (options.guildmasterName !== undefined) checkName(options.guildmasterName, 'Guildmaster');
  if (options.backgroundKey !== undefined && content.backgrounds[options.backgroundKey]?.owner !== 'guild') {
    throw new RangeError(`No Guild Background in content is keyed ${JSON.stringify(options.backgroundKey)}`);
  }
  if (!Number.isSafeInteger(rosterSize) || rosterSize < 0) {
    throw new RangeError(`A Roster size is a whole number from 0; got ${rosterSize}`);
  }
  if (!Number.isFinite(wealth)) throw new RangeError(`A Guild's Wealth is a finite number; got ${wealth}`);
  const state = streamOf(world, options.stream);

  const name = options.name ?? drawGuildName(state, content.names.guild, Object.values(world.guilds));
  const backgroundKey =
    options.backgroundKey ?? pick(state, sortedKeys(content.backgrounds, (row) => row.owner === 'guild'));

  const guildId = takeId(world, 'guilds');
  const guildmasterId = takeId(world, 'guildmasters');
  const guildmaster = drawGuildmaster(state, deps, {
    id: guildmasterId,
    guildId,
    turn: world.turn,
    name: options.guildmasterName,
  });
  const guild: Guild = {
    id: guildId,
    name,
    backgroundKey,
    foundedTurn: world.turn,
    guildmasterId,
    rosterIds: [],
    wealth,
    fame: foundingFame,
    belowFloorSince: null,
    foldedOnTurn: null,
    hall: Object.fromEntries(facilityKeys.map((key) => [key, unimprovedGrade])) as Hall,
    // A copy: Rivals given one controller object must not share it.
    controller: { ...controller },
    regard: {},
  };
  world.guilds[guildId] = guild;
  world.guildmasters[guildmasterId] = guildmaster;

  const labels: Record<EntityId, string> = {};
  labels[guildId] = guild.name;
  labels[guildmasterId] = guildmaster.name;
  const events: GeneratedGuild['events'] = [
    {
      turn: world.turn,
      type: 'guild.founded',
      participants: [guildId, guildmasterId],
      labels,
      milestone: true,
      payload: { guildId, guildmasterId },
    },
    {
      turn: world.turn,
      type: 'guildmaster.generated',
      participants: [guildmasterId, guildId],
      labels: { ...labels },
      milestone: false,
      payload: { guildmasterId, guildId },
    },
  ];

  const stream = options.stream === undefined ? {} : { stream: options.stream };
  for (const classKey of dealEvenly(state, sortedKeys(content.classes), rosterSize)) {
    events.push(...generateHero(world, deps, { classKey, guildId, ...stream }).events);
  }
  return { guild, guildmaster, events };
}

/**
 * The Disposition dealt to the Rival generated `index`th (from 0), round-robin over content's
 * Dispositions in key order (M6-S1, DL-56): `createWorld`'s first Rival gets the first key, its
 * second the second, and so on, starting again after the last, so that a world with at least as
 * many Rivals as Dispositions has every one of them. No draw: the deal moves no stream.
 *
 * Throws on a programming error: an index that is not a whole number from 0, or content with no
 * Disposition, which the content validator refuses.
 */
export function dealtDisposition(content: Pick<ContentSet, 'dispositions'>, index: number): DispositionKey {
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError(`A Rival's index is a whole number from 0; got ${index}`);
  const keys = sortedKeys(content.dispositions);
  if (keys.length === 0) throw new RangeError('Content defines no Disposition to deal to a Rival');
  return keys[index % keys.length] as DispositionKey;
}

export interface RivalOptions extends DrawsFrom {
  /**
   * What makes the Rival's choices (ADR-0002): a Disposition dealt by `dealtDisposition` when
   * `createWorld` makes it, or the controller of the Rival it replaces (DL-56), copied as it is.
   */
  controller: Controller;
}

/**
 * A Rival Guild, as `createWorld` makes each of its Rivals (DL-19 item 9) and the endings phase
 * makes one to replace a Rival that folded (DL-28): its Roster size drawn from
 * `rivalRosterMin/Max`, then its Wealth from `rivalStartingWealthMin/Max`, then the Guild through
 * `generateGuild` with `options.controller`, every draw from `options.stream` (`generation` by
 * default). The controller draws nothing, so which Disposition a Rival has moves no stream. Throws
 * as `generateGuild` does.
 */
export function generateRival(world: World, deps: EngineDeps, options: RivalOptions): GeneratedGuild {
  const { config } = deps;
  const state = streamOf(world, options.stream);
  const rosterSize = int(state, config.rivalRosterMin, config.rivalRosterMax);
  const wealth = int(state, config.rivalStartingWealthMin, config.rivalStartingWealthMax);
  const stream = options.stream === undefined ? {} : { stream: options.stream };
  return generateGuild(world, deps, { controller: options.controller, rosterSize, wealth, ...stream });
}

/**
 * A Guild's name from `names` (DL-19 item 6, DL-28): one no Guild in `guilds` has ever had, while
 * any is left; once every name has been used, one only folded Guilds have had, so a Rival founded
 * to replace one that folded never finds the list exhausted. Never the name of a Guild in play.
 * One draw either way; with no folded Guild it is DL-19's draw exactly.
 */
function drawGuildName(state: Stream, names: readonly string[], guilds: readonly Guild[]): string {
  const everUsed = new Set(guilds.map((guild) => guild.name));
  const inPlay = new Set(guilds.filter((guild) => guild.foldedOnTurn === null).map((guild) => guild.name));
  const anyFresh = names.some((name) => !everUsed.has(name));
  return pickUnused(state, names, anyFresh ? everUsed : inPlay, 'Guild');
}

interface GuildmasterSetup {
  id: GuildmasterId;
  guildId: GuildId;
  turn: Turn;
  name: string | undefined;
}

/**
 * A Guildmaster: sex, a name unless given, an age, each Guildmaster Stat in key order, and
 * `guildmasterTraitsMin/Max` distinct Traits from a shuffle of the Guildmaster Traits, whose
 * effects stay `null` until M4-S5 (pre-M0 review B2).
 */
function drawGuildmaster(state: Stream, { config, content }: EngineDeps, setup: GuildmasterSetup): Guildmaster {
  const sex = pick(state, sexes);
  const name = setup.name ?? drawPersonName(state, content.names, sex);
  const ageAtEntry = int(state, config.guildmasterStartingAgeMin, config.guildmasterStartingAgeMax);
  const stats: StatValues = {};
  for (const stat of sortedRows(content.stats, (row) => row.owner === 'guildmaster')) {
    stats[stat.key] = clamp(int(state, config.guildmasterStatMin, config.guildmasterStatMax), stat.min, stat.max);
  }
  const traitKeys = sortedKeys(content.traits, (row) => row.owner === 'guildmaster');
  const count = drawCount(state, config.guildmasterTraitsMin, config.guildmasterTraitsMax, traitKeys.length);
  const traits = shuffle(state, traitKeys).slice(0, count);
  return {
    id: setup.id,
    name,
    sex,
    guildId: setup.guildId,
    enteredTurn: setup.turn,
    ageAtEntry,
    stats,
    traits,
    regard: {},
  };
}
