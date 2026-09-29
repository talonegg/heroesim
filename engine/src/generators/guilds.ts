// The Guild Generator, with the Guildmaster Generator inside it (M1-S6): every Guild, the
// player's and each Rival's, comes from this one function, and nothing in it reads `controller`
// (ADR-0002). A Guildmaster exists only with a Guild, so both rows are made together. The draw
// order is DL-19 items 6 and 7; changing it changes every seed's Guilds.

import type { EngineDeps, GameConfig } from '../config.js';
import type { BackgroundKey, ContentSet, DispositionKey, Trait, TraitKey } from '../content-types.js';
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
  type Sex,
  type StatValues,
  type Turn,
  type World,
} from '../document.js';
import type { GuildFounded, GuildmasterGenerated, HeroGenerated } from '../events.js';
import { guildmasterTraitsOf } from '../guildmaster.js';
import { int, pick } from '../rng.js';
import {
  checkName,
  clamp,
  dealEvenly,
  drawCount,
  drawPersonName,
  drawUnusedPersonName,
  pickInDraws,
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
  /**
   * What the player chose of their Guildmaster at setup (M9-S2, DL-100 item 3); the rest is drawn.
   * `createWorld` has checked it with `setupRefusal`; this trusts it.
   */
  guildmaster?: GuildmasterChoices;
}

/**
 * A Guildmaster's setup, each part optional (M9-S2): what is given replaces what is drawn, and the
 * draws are made either way, so a choice moves no later draw. The descriptive Attributes are
 * stored as given, trimmed by the caller; a drawn Guildmaster's are empty.
 */
export interface GuildmasterChoices {
  sex?: Sex;
  age?: number;
  /** The Traits in the order given; an empty list is none. */
  traitKeys?: readonly TraitKey[];
  birthplace?: string;
  appearance?: string;
  biography?: string;
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
    chosen: options.guildmaster ?? {},
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
      payload: { guildId, guildmasterId, wealth },
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
 * A successor to `guild`'s Guildmaster (M9-S2, DL-100 item 3): a Guildmaster drawn as a founding
 * Rival's is, by the same draws in the same order (sex, name, age, Stats, Traits on the budget), save
 * that the name is one no one in play has (`namesInUse`), drawn in one draw. Their Regard is empty,
 * neutral for everyone, their descriptive Attributes empty, and they enter the world now. The row
 * is added to `world` with the next Guildmaster id; the Guild is not changed, which is the endings
 * phase's to do. Draws from `options.stream`, `generation` by default, as the Guild Generator does.
 *
 * Throws when every name the content can make for the successor's sex is in use.
 */
export function generateSuccessor(world: World, deps: EngineDeps, guild: Guild, options: DrawsFrom = {}): Guildmaster {
  const state = streamOf(world, options.stream);
  const avoidNames = namesInUse(world);
  const successor = drawGuildmaster(state, deps, {
    id: takeId(world, 'guildmasters'),
    guildId: guild.id,
    turn: world.turn,
    name: undefined,
    avoidNames,
    chosen: {},
  });
  world.guildmasters[successor.id] = successor;
  return successor;
}

/**
 * The names in use (M9-S2): the Guildmasters' of the Guilds in play, and the Heroes' in play, on a
 * Roster or in the Unattached pool. A dead or retired Hero's, one who has left the pool, and a
 * retired Guildmaster's or a folded Guild's are free. DL-88 item 2 leaves which names count as in
 * use open for the other generators; a successor avoids these.
 */
function namesInUse(world: World): Set<string> {
  const names = new Set<string>();
  for (const guild of Object.values(world.guilds)) {
    if (guild.foldedOnTurn !== null) continue;
    const guildmaster = Object.hasOwn(world.guildmasters, guild.guildmasterId) ? world.guildmasters[guild.guildmasterId] : undefined;
    if (guildmaster !== undefined) names.add(guildmaster.name);
  }
  for (const hero of Object.values(world.heroes)) {
    if (hero.diedOnTurn === null && hero.retiredOnTurn === null && hero.leftPoolOnTurn === null) names.add(hero.name);
  }
  return names;
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

/**
 * A drawn Guildmaster's Traits (M9-S2, DL-100 item 3; DL-109 item 1): a count from
 * `guildmasterTraitsMin/Max`, as before; then one set of that many, drawn uniformly from every
 * legal set (`legalTraitSets`): distinct Guildmaster Traits, no excluded pair, and a total cost
 * within `guildmasterTraitBudget`. When no legal set has that many, the largest smaller size that
 * has one is drawn from; the empty set is always legal. The set's Traits are held in key order.
 *
 * It takes the draws DL-19 item 6's shuffle of every Guildmaster Trait took, whatever it draws: one
 * for the count, then one for each Guildmaster Trait but the last, the first of which picks the set
 * and the rest of which are spent (`pickInDraws`). So the costs, the exclusions and the count drawn
 * never move a later draw (draw.ts's rule), and the rest of every seed's world is what it was: only
 * the Guildmasters' Traits changed with the budget (DL-102) and with the whole-set draw (DL-110).
 */
function drawTraits(state: Stream, config: GameConfig, content: ContentSet): TraitKey[] {
  const rows = guildmasterTraitsOf(content);
  const count = drawCount(state, config.guildmasterTraitsMin, config.guildmasterTraitsMax, rows.length);
  const sets = legalTraitSets(rows, count, config.guildmasterTraitBudget);
  return pickInDraws(state, sets, Math.max(0, rows.length - 1)).map((row) => row.key);
}

/**
 * Every legal set of `size` of `rows` (DL-109 item 1): no two of it excluding each other either way,
 * and its costs summing to no more than `budget`; each set in `rows`' order, and the sets in the
 * order of their first difference, so the list is the same for the same content. When none has
 * `size`, those of the largest smaller size that has one, down to the empty set, which is always
 * legal, whatever the budget. `rows` are distinct, and a Guildmaster holds each at most once.
 */
function legalTraitSets(rows: readonly Trait[], size: number, budget: number): Trait[][] {
  for (let wanted = size; wanted > 0; wanted -= 1) {
    const sets: Trait[][] = [];
    const extend = (from: number, held: Trait[], cost: number): void => {
      if (held.length === wanted) {
        if (cost <= budget) sets.push([...held]);
        return;
      }
      for (let index = from; index <= rows.length - (wanted - held.length); index += 1) {
        const row = rows[index] as Trait;
        if (held.some((mine) => mine.excludes.includes(row.key) || row.excludes.includes(mine.key))) continue;
        held.push(row);
        extend(index + 1, held, cost + row.cost);
        held.pop();
      }
    };
    extend(0, [], 0);
    if (sets.length > 0) return sets;
  }
  return [[]];
}

interface GuildmasterSetup {
  id: GuildmasterId;
  guildId: GuildId;
  turn: Turn;
  name: string | undefined;
  /** When given, the name is drawn from those not among these (a successor's, M9-S2). */
  avoidNames?: ReadonlySet<string>;
  chosen: GuildmasterChoices;
}

/**
 * A Guildmaster: sex, a name unless given, an age, each Guildmaster Stat in key order, and their
 * Traits on the budget (`drawTraits`). What `setup.chosen` gives replaces what is drawn, after the
 * draw, so the draws are the same whatever was chosen (M9-S2); a name is drawn for the sex chosen.
 */
function drawGuildmaster(state: Stream, { config, content }: EngineDeps, setup: GuildmasterSetup): Guildmaster {
  const { chosen } = setup;
  const drawnSex = pick(state, sexes);
  const sex = chosen.sex ?? drawnSex;
  const name =
    setup.name ??
    (setup.avoidNames === undefined
      ? drawPersonName(state, content.names, sex)
      : drawUnusedPersonName(state, content.names, sex, setup.avoidNames));
  const drawnAge = int(state, config.guildmasterStartingAgeMin, config.guildmasterStartingAgeMax);
  const ageAtEntry = chosen.age ?? drawnAge;
  const stats: StatValues = {};
  for (const stat of sortedRows(content.stats, (row) => row.owner === 'guildmaster')) {
    stats[stat.key] = clamp(int(state, config.guildmasterStatMin, config.guildmasterStatMax), stat.min, stat.max);
  }
  const drawnTraits = drawTraits(state, config, content);
  const traits = chosen.traitKeys === undefined ? drawnTraits : [...chosen.traitKeys];
  return {
    id: setup.id,
    name,
    sex,
    guildId: setup.guildId,
    enteredTurn: setup.turn,
    ageAtEntry,
    stats,
    traits,
    birthplace: chosen.birthplace ?? '',
    appearance: chosen.appearance ?? '',
    biography: chosen.biography ?? '',
    retiredOnTurn: null,
    regard: {},
  };
}
