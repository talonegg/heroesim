import { beforeAll, describe, expect, test } from 'vitest';
import type { EngineDeps } from '../config.js';
import type { DispositionKey } from '../content-types.js';
import { createWorld } from '../create.js';
import {
  facilityKeys,
  type Guild,
  type GuildId,
  type Guildmaster,
  type HeroId,
  type World,
  type WorldDocument,
} from '../document.js';
import type { EngineEvent } from '../events.js';
import { append } from '../history.js';
import { phaseContext } from '../phases/phase.js';
import { runTurn } from '../pipeline.js';
import { dispositionOf, playerGuild } from '../selectors.js';
import { validate } from '../validate.js';
import { testDeps, withEncounters } from '../world.test-support.js';

// M6-S4's two boxes (DL-58), over twenty years of play:
//
// 1. Rival Hall grades rise over twenty years under `ambitious`, and `miserly` stays at grade 0 the
//    longest;
// 2. Market stacks are bought by Rivals: `item.bought` counted by the buying Guild's kind of
//    controller. The harness's counter is the M6 close's (DL-58); this proves the purchases.
//
// Each seed is a default world, four Rivals dealt the four Dispositions round-robin (DL-56), with the
// player idle and rich, played Turn by Turn for twenty years on the one world, in place, as DL-56's
// month is: nothing here tells a Rival what to do. One thing is pinned. The test content's Quests are
// harder for its Heroes than the core's are for the core's, and at its Encounters' own difficulty
// (a Check asks 0.18 or 0.3 of the Quest's difficulty) its Rivals fail so many of the Quests they
// take that they fold again and again: a sweep of 16 seeds counted 22 folds a seed in twenty years,
// reckless's Rival ten, and the Halls it measured were mostly those of replacements founded with next
// to nothing. Here every Check asks 0.15, under which the Rivals live off their Quests and fold now
// and then (about seven a seed), as the core's do. The Dispositions, the rules and every other number
// are the game's. A seed takes about ten seconds; DL-58 records the sweeps.

const years = 20;
const seeds = ['build-and-buy-1', 'build-and-buy-2', 'build-and-buy-3', 'build-and-buy-4'];
const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };
const dispositions = ['ambitious', 'miserly', 'reckless', 'steady'] as const;
const deps: EngineDeps = testDeps({ rivalCount: 4 }, withEncounters({ difficultyFactor: 0.15 }));
/** Every grade of every facility: three facilities of three grades in the test content, as in the core. */
const wholeHall = 9;

/** What one seed's twenty years showed. */
interface Tally {
  seed: string;
  /** Each Rival's Disposition, by Guild id: those dealt at creation and those founded in a folded one's place. */
  dealt: Map<GuildId, DispositionKey>;
  /** The Turn each Rival was founded: 0 for those dealt at creation. */
  founded: Map<GuildId, number>;
  /** Each Rival's builds in order: the Turn, and its Hall's grades summed over its facilities after it. */
  builds: Map<GuildId, { turn: number; total: number }[]>;
  /** Each Rival's summed grades at each year's end while it stands, in order, with the Turn. */
  yearEnds: Map<GuildId, { turn: number; total: number }[]>;
  /** The nights each Disposition's Rivals spent in play with no grade in any facility. */
  nightsAtZero: Record<(typeof dispositions)[number], number>;
  /** Every Item bought, with the kind of controller of the Guild that bought it. */
  bought: { controller: 'player' | 'rival'; guildId: GuildId; definitionKey: string; stack: boolean }[];
  /** Of the Heroes on the Rosters of the Rivals in play at the end, those wearing armour, and all. */
  armoured: { wearing: number; of: number };
}

const hallTotal = (guild: Pick<Guild, 'hall'>): number => facilityKeys.reduce((sum, key) => sum + guild.hall[key], 0);

/** The Rivals in play, by Guild id. */
const rivalsInPlay = (world: World): Guild[] =>
  Object.values(world.guilds).filter((guild) => guild.foldedOnTurn === null && dispositionOf(guild) !== null);

function sweep(seed: string): Tally {
  const document: WorldDocument = createWorld(seed, setup, deps).document;
  const { world } = document;
  // The player takes no Quest, buys nothing and must not run out of Wealth, nor its Guildmaster reach
  // the age of Retirement, which would end the game (M2-S10): the years are the Rivals'.
  const player = playerGuild(world) as Guild;
  player.wealth = 1_000_000_000;
  (world.guildmasters[player.guildmasterId] as Guildmaster).ageAtEntry = deps.config.guildmasterStartingAgeMin;
  const tally: Tally = {
    seed,
    dealt: new Map(),
    founded: new Map(),
    builds: new Map(),
    yearEnds: new Map(),
    nightsAtZero: { ambitious: 0, miserly: 0, reckless: 0, steady: 0 },
    bought: [],
    armoured: { wearing: 0, of: 0 },
  };
  const enter = (guild: Guild, turn: number) => {
    const disposition = dispositionOf(guild);
    if (disposition === null) return;
    tally.dealt.set(guild.id, disposition);
    tally.founded.set(guild.id, turn);
    tally.builds.set(guild.id, []);
    tally.yearEnds.set(guild.id, []);
  };
  for (const guild of rivalsInPlay(world)) enter(guild, 0);
  expect([...tally.dealt.values()].sort()).toEqual([...dispositions]);

  const watch = (event: EngineEvent) => {
    if (event.type === 'guild.founded') {
      enter(world.guilds[event.payload.guildId] as Guild, event.turn);
    } else if (event.type === 'guild.improved') {
      const guild = world.guilds[event.payload.guildId] as Guild;
      tally.builds.get(guild.id)?.push({ turn: event.turn, total: hallTotal(guild) });
    } else if (event.type === 'item.bought') {
      const { guildId, definitionKey, itemIds } = event.payload;
      const controller = (world.guilds[guildId] as Guild).controller.kind;
      tally.bought.push({ controller, guildId, definitionKey, stack: itemIds.length === 0 });
    }
  };

  const end = years * deps.config.turnsPerYear;
  let lastYearFrom = 0;
  while (world.turn < end && world.ended === null) {
    if (world.turn === end - deps.config.turnsPerYear) lastYearFrom = document.history.entries.length;
    world.turn += 1;
    for (const event of runTurn(world, phaseContext(world, deps, document.history))) {
      append(document.history, event);
      watch(event);
    }
    if (world.turn % 3 === 2) {
      for (const guild of rivalsInPlay(world)) {
        const disposition = dispositionOf(guild) as (typeof dispositions)[number];
        if (hallTotal(guild) === 0) tally.nightsAtZero[disposition] += 1;
      }
    }
    if (world.turn % deps.config.turnsPerYear === 0) {
      for (const guild of rivalsInPlay(world)) tally.yearEnds.get(guild.id)?.push({ turn: world.turn, total: hallTotal(guild) });
    }
  }
  expect(world.ended, seed).toBeNull();

  const armour = new Set<HeroId>();
  for (const row of [...Object.values(world.items), ...Object.values(world.stacks)]) {
    if (row.holder.kind === 'hero' && row.holder.slot === 'armour') armour.add(row.holder.id);
  }
  for (const guild of rivalsInPlay(world)) {
    tally.armoured.of += guild.rosterIds.length;
    tally.armoured.wearing += guild.rosterIds.filter((heroId) => armour.has(heroId)).length;
  }
  // The World State in full and the last year's History (DL-34's incremental check), neither refused
  // nor warned about.
  const validated = validate(document, deps, { historyFrom: lastYearFrom });
  expect(validated.ok ? validated.warnings : validated.failures, seed).toEqual([]);
  return tally;
}

/** The Turn a Rival of `disposition` first built anything, or infinity if none did. */
function firstBuild(tally: Tally, disposition: DispositionKey): number {
  const turns = [...tally.builds]
    .filter(([guildId]) => tally.dealt.get(guildId) === disposition)
    .flatMap(([, builds]) => builds.slice(0, 1).map((build) => build.turn));
  return turns.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...turns);
}

describe('Rivals build and buy over twenty years (M6-S4)', () => {
  let tallies: Tally[] = [];
  beforeAll(() => {
    tallies = seeds.map(sweep);
  }, 300_000);

  test('Rival Hall grades rise over twenty years under ambitious: from nothing, grade by grade, to the whole Hall', () => {
    for (const tally of tallies) {
      for (const [guildId, disposition] of tally.dealt) {
        const builds = tally.builds.get(guildId) ?? [];
        // Every Rival's Hall rises a grade at a time and never falls while it stands.
        expect(builds.map((build) => build.total), `${tally.seed} ${guildId}`).toEqual(builds.map((_, index) => index + 1));
        const yearEnds = (tally.yearEnds.get(guildId) ?? []).map((sample) => sample.total);
        expect(yearEnds, `${tally.seed} ${guildId}`).toEqual([...yearEnds].sort((a, b) => a - b));
        if (disposition !== 'ambitious') continue;
        // An ambitious Rival, at every year's end a year or more after it was founded, has built past the
        // infirmary's three grades, all a Rival built before M6-S4, to every grade of every facility.
        const founded = tally.founded.get(guildId) ?? 0;
        const settled = (tally.yearEnds.get(guildId) ?? []).filter((sample) => sample.turn - founded >= deps.config.turnsPerYear);
        for (const sample of settled) expect(sample.total, `${tally.seed} ${guildId} Turn ${sample.turn}`).toBe(wholeHall);
      }
      // The ambitious Rival dealt at creation raised its Hall from nothing to the whole of it in its first year.
      const [original] = [...tally.dealt].filter(([guildId, key]) => key === 'ambitious' && tally.founded.get(guildId) === 0);
      if (original === undefined) throw new Error(`${tally.seed}: no ambitious Rival at creation`);
      const whole = tally.builds.get(original[0])?.find((build) => build.total === wholeHall);
      expect(whole?.turn, tally.seed).toBeLessThan(deps.config.turnsPerYear);
    }
  });

  test('miserly stays at grade 0 the longest: in every seed its first Improvement is the last, and its nights at 0 the most', () => {
    const others = dispositions.filter((key) => key !== 'miserly');
    for (const tally of tallies) {
      const latestOther = Math.max(...others.map((key) => firstBuild(tally, key)));
      expect(firstBuild(tally, 'miserly'), tally.seed).toBeGreaterThan(latestOther);
      expect(firstBuild(tally, 'miserly'), tally.seed).toBeLessThan(Number.POSITIVE_INFINITY);
    }
    // The nights a Disposition's Rivals spent in play with a bare Hall, over the seeds: replacements
    // founded after a fold start bare too, so this is summed rather than held to seed by seed (DL-58).
    const nights = (key: (typeof dispositions)[number]) => tallies.reduce((sum, tally) => sum + tally.nightsAtZero[key], 0);
    for (const key of others) expect(nights('miserly'), key).toBeGreaterThan(nights(key));
  });

  test('Market stacks are bought by Rivals: item.bought by the kind of controller that bought', () => {
    for (const tally of tallies) {
      const byController = { player: 0, rival: 0 };
      for (const purchase of tally.bought) byController[purchase.controller] += 1;
      // The player, idle, bought nothing; the Rivals bought, from the Market's stacks.
      expect(byController.player, tally.seed).toBe(0);
      expect(tally.bought.filter((purchase) => purchase.controller === 'rival' && purchase.stack).length, tally.seed).toBeGreaterThan(0);
      // Every Disposition bought, each by its own row's gearThreshold.
      const buyers = new Set(tally.bought.map((purchase) => tally.dealt.get(purchase.guildId)));
      expect([...buyers].sort(), tally.seed).toEqual([...dispositions]);
      // And what they bought, they wear: most of the Rivals' Heroes at the end wear armour.
      expect(tally.armoured.wearing, tally.seed).toBeGreaterThan(tally.armoured.of / 2);
    }
  });
});
