import { loadContent } from '@heroesim/content/node';
import {
  addStack,
  advance,
  applyAction,
  bestParties,
  compareByCodeUnit,
  createWorld,
  defaultConfig,
  gearChoices,
  holdings,
  partyPool,
  playerGuild,
  serialise,
  signingFee,
  signingRefusal,
  unattachedHeroes,
  upkeep,
  wages,
  type EngineDeps,
  type Guild,
  type GuildAction,
  type Hero,
  type HeroId,
  type Quest,
  type WorldDocument,
} from '@heroesim/engine';
import { createItem, makeId, marketHolder } from '@heroesim/engine/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { harnessSetup } from './creation.js';
import { automaticPolicy, defaultPolicyConfig, type PolicyConfig } from './policy.js';

// The chance the policy reads of a Quest's Party, the Best Party's estimate, set by a test when it
// sets `chances.of`: the Party is still the engine's, and only its chance of success is
// answered, from the Quest and the Party, as the estimate's is. Unset, or answering `undefined`, it is
// the real estimate, as in every other test.
const chances = vi.hoisted(() => ({ of: null as ((quest: Quest, heroIds: readonly HeroId[]) => number | undefined) | null }));
vi.mock('@heroesim/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('@heroesim/engine')>();
  return {
    ...real,
    bestParties: (...args: Parameters<typeof real.bestParties>): ReturnType<typeof real.bestParties> => {
      const opened = real.bestParties(...args);
      return {
        ...opened,
        party: (quest, heroes) => {
          const found = opened.party(quest, heroes);
          const success = found === null || found.estimate === null ? undefined : chances.of?.(quest as Quest, found.heroIds);
          return found === null || found.estimate === null || success === undefined ? found : { ...found, estimate: { ...found.estimate, success } };
        },
      };
    },
  };
});

// The harness's automatic policy (INPUTS 4.14, DL-34) against the core content. The
// Upkeep and fee numbers these tests rely on are pinned here, not read from the defaults: the Hall's
// base and its Heroes' share at 0, so that a new Guild's Upkeep is its wages (DL-298). The
// Market is empty (`marketSize: 0`) unless a test stocks it, so that the armour and consumables it
// would buy (DL-62) stay out of the tests of building and recruiting.

const content = loadContent();
const deps: EngineDeps = {
  config: { ...defaultConfig, wagePerLevel: 5, hallBaseUpkeep: 0, hallUpkeepPerHero: 0, signingFeeBase: 50, marketSize: 0 },
  content,
};

/** A new world, its player's Guild with its post of Captain held (DL-287), so that only a test of naming meets a choice to name, and the Board's Quests. */
function scene(seed = 'policy'): { document: WorldDocument; guild: Guild; quests: Quest[] } {
  const { document } = createWorld(seed, harnessSetup, deps);
  const guild = playerGuild(document.world);
  if (guild === undefined) throw new Error('No player');
  guild.captainId = guild.rosterIds[0] ?? null;
  const quests = document.world.board.map((questId) => {
    const quest = document.world.quests[questId];
    if (quest === undefined) throw new Error(`No Quest ${questId}`);
    return quest;
  });
  return { document, guild, quests };
}

/** Opens every Quest on the Board to a Party of `min` or more (no most, DL-266), rewards rising in Board order. */
function openBoard(quests: Quest[], min = 2): void {
  quests.forEach((quest, index) => {
    quest.requirements = { partySizeMin: min };
    quest.reward = 100 + 10 * index;
  });
}

/** The player's margin at 1: the Best Party is the fewest Heroes each Quest allows, so four Heroes make two Parties. */
const fewest: EngineDeps = { ...deps, config: { ...deps.config, playerPartyMargin: 1 } };

const dispatches = (actions: GuildAction[]) => actions.filter((action) => action.kind === 'dispatch');
const recruits = (actions: GuildAction[]) => actions.filter((action) => action.kind === 'recruit');
const builds = (actions: GuildAction[]) => actions.filter((action) => action.kind === 'build');

/**
 * The policy with building out of reach: its one purchase a Turn is the infirmary's next
 * grade whenever Wealth is three times its cost, which the recruiting tests' Wealth is.
 */
const noBuilding: PolicyConfig = { ...defaultPolicyConfig, buildWealthMultiple: Number.POSITIVE_INFINITY };

afterEach(() => {
  vi.restoreAllMocks();
  chances.of = null;
});

/** Makes every Quest of `quests` alike to the first in what the estimate reads, so that a Party's chance is the same on each. */
function alike(quests: Quest[]): void {
  const [first] = quests;
  if (first === undefined) throw new Error('No Quest');
  for (const quest of quests) {
    quest.difficulty = first.difficulty;
    quest.encounterKeys = [...first.encounterKeys];
    quest.durationTurns = first.durationTurns;
  }
}

/** The chance of success the policy reads of `quest`'s Party from `heroes`: the Best Party's estimate's, held to at most 1 as the Best Party holds it. */
function chanceOf(document: WorldDocument, guild: Guild, quest: Quest, heroes: readonly Hero[], given: EngineDeps = deps): number {
  const found = bestParties(document.world, guild, given).party(quest, heroes);
  if (found === null) throw new Error(`No Party for ${quest.id}`);
  return Math.min(1, found.estimate?.success ?? 0);
}

/** `heroes` without those sent in `heroIds`. */
const without = (heroes: readonly Hero[], heroIds: readonly HeroId[]): Hero[] => heroes.filter((hero) => !heroIds.includes(hero.id));

describe('automaticPolicy', () => {
  test('draws no random number and changes nothing: the document serialises as before, and it chooses alike twice', () => {
    const { document, guild } = scene();
    // Every kind of choice on offer: Parties to send, a purchase to make.
    document.world.guilds[guild.id] = { ...guild, wealth: 10_000 };
    const random = vi.spyOn(Math, 'random');
    const before = serialise(document);

    const actions = automaticPolicy(document, deps);
    const noBuild = automaticPolicy(document, deps, noBuilding);

    expect(dispatches(actions).length).toBeGreaterThan(0);
    expect(builds(actions)).toHaveLength(1);
    expect(recruits(noBuild)).toHaveLength(1);
    expect(random).not.toHaveBeenCalled();
    expect(serialise(document)).toBe(before);
    expect(automaticPolicy(document, deps)).toEqual(actions);
    expect(automaticPolicy(document, deps, noBuilding)).toEqual(noBuild);
  });

  test('breaks a tie of chances and rewards by the lower Quest id, and a tie of fees by the lower Hero id, whatever the order it meets them in', () => {
    const { document, guild, quests } = scene();
    openBoard(quests);
    alike(quests);
    for (const quest of quests) quest.reward = 100;
    // The Board in reverse id order, so that its own order would give the other answer.
    document.world.board = [...document.world.board].sort().reverse();
    const pool = unattachedHeroes(document.world);
    const [lowest] = pool;
    for (const hero of pool) hero.stats = { ...lowest?.stats };
    document.world.guilds[guild.id] = { ...guild, wealth: 500 };
    const random = vi.spyOn(Math, 'random');

    const actions = automaticPolicy(document, deps, noBuilding);

    expect(random).not.toHaveBeenCalled();
    const byId = [...quests].sort((a, b) => (a.id < b.id ? -1 : 1)).map((quest) => quest.id);
    expect(dispatches(actions).map((action) => action.questId)).toEqual(byId.slice(0, dispatches(actions).length));
    expect(recruits(actions)).toEqual([{ kind: 'recruit', guildId: guild.id, heroId: lowest?.id, years: defaultPolicyConfig.contractYears }]);
  });

  test('sends the Party the engine’s staffing rule names, by the chance estimate, of equal chances to the highest reward first', () => {
    const { document, guild, quests } = scene();
    openBoard(quests);
    alike(quests);
    const best = quests.at(-1) as Quest;

    const [first] = automaticPolicy(document, deps);

    const party = bestParties(document.world, guild, deps).party(best, partyPool(document.world, guild, deps))?.heroIds ?? null;
    expect(party?.length).toBeGreaterThanOrEqual(2);
    expect(first).toEqual({ kind: 'dispatch', guildId: guild.id, questId: best.id, heroIds: party });
    // At the player's margin of 1, the fewest the Quest allows.
    const [fewer] = automaticPolicy(document, fewest);
    expect(fewer).toMatchObject({ questId: best.id, heroIds: bestParties(document.world, guild, fewest).party(best, partyPool(document.world, guild, deps))?.heroIds });
    expect(fewer?.kind === 'dispatch' && fewer.heroIds).toHaveLength(2);
  });

  // DL-286: the policy chooses from the player's pool, the Heroes `playerRestBand` keeps home left out.
  test("sends no Hero at or past the player's rest band, and every free Hero with no rest band", () => {
    const { document, guild, quests } = scene();
    openBoard(quests);
    const resting = (playerRestBand: EngineDeps['config']['playerRestBand']): EngineDeps => ({ ...fewest, config: { ...fewest.config, playerRestBand } });
    const roster = guild.rosterIds.map((heroId) => document.world.heroes[heroId] as Hero);
    expect(roster).toHaveLength(4);
    const [, , tired, exhausted] = roster as [Hero, Hero, Hero, Hero];
    tired.fatigue = resting('tired').config.fatigueBands.tired;
    exhausted.fatigue = resting('tired').config.fatigueBands.exhausted;

    const sent = dispatches(automaticPolicy(document, resting('tired'))).flatMap((action) => action.heroIds);
    expect(sent).toHaveLength(2);
    expect(sent).not.toContain(tired.id);
    expect(sent).not.toContain(exhausted.id);
    expect(dispatches(automaticPolicy(document, resting(null))).flatMap((action) => action.heroIds)).toHaveLength(4);
  });

  test('keeps sending Parties while it has Heroes, of equal chances each to the next reward, no Hero twice', () => {
    const { document, guild, quests } = scene();
    openBoard(quests);
    alike(quests);

    const sent = dispatches(automaticPolicy(document, fewest));

    expect(guild.rosterIds).toHaveLength(4);
    expect(sent.map((action) => action.questId)).toEqual([quests.at(-1)?.id, quests.at(-2)?.id]);
    const heroIds = sent.flatMap((action) => action.heroIds);
    expect(new Set(heroIds).size).toBe(4);
  });

  test('passes over a Quest it cannot staff for the next, and sends no unavailable Hero', () => {
    const { document, guild, quests } = scene();
    openBoard(quests);
    alike(quests);
    const [hurt] = guild.rosterIds;
    const hero = hurt === undefined ? undefined : document.world.heroes[hurt];
    if (hurt === undefined || hero === undefined) throw new Error('No Hero');
    hero.injury = { typeKey: 'bruised-ribs', healsOnTurn: 30 };
    (quests.at(-1) as Quest).requirements = { partySizeMin: 4 };

    const sent = dispatches(automaticPolicy(document, deps));

    expect(sent[0]?.questId).toBe(quests.at(-2)?.id);
    expect(sent.flatMap((action) => action.heroIds)).not.toContain(hurt);
  });

  // DL-264: the player's Guild takes only what it may, its Fame at least the minimum of the Quest's Tier.
  test("passes over a Quest of a Tier whose Fame minimum is above the Guild's Fame for the next, and every dispatch is accepted", () => {
    const { document, guild, quests } = scene();
    openBoard(quests);
    alike(quests);
    // The richest Quest, the one it would send first, posted at Tier 3, the rest at Tier 1.
    quests.forEach((quest, index) => {
      quest.tier = index === quests.length - 1 ? 3 : 1;
    });
    const tiers = fewest.config.tiers.map((row, index) => ({ ...row, fameMinimum: index === 2 ? guild.fame + 1 : 0 }));
    const closed: EngineDeps = { ...fewest, config: { ...fewest.config, tiers } };

    expect(dispatches(automaticPolicy(document, fewest))[0]?.questId).toBe(quests.at(-1)?.id);
    const sent = dispatches(automaticPolicy(document, closed));
    expect(sent.map((action) => action.questId)).toEqual([quests.at(-2)?.id, quests.at(-3)?.id]);
    let played = document;
    for (const action of sent) {
      const result = applyAction(played, action, closed);
      if (!result.ok) throw new Error(`Refused: ${result.rejection.reason}`);
      played = result.document;
    }
    // Every Tier closed to it: it sends no one.
    const shut: EngineDeps = { ...fewest, config: { ...fewest.config, tiers: tiers.map((row) => ({ ...row, fameMinimum: guild.fame + 1 })) } };
    expect(dispatches(automaticPolicy(document, shut))).toEqual([]);
  });

  describe('chooses its Quests by their chance (DL-168 item 2)', () => {
    /**
     * The Board opened and its Quests alike, then at `base`, the first of the ladder's band tops at which
     * the player's margin leaves a Quest of the Board uncertain (DL-273), the first eased to half of it and
     * the rest made half as hard again: the first the likeliest and the lowest reward, and none so easy
     * that the player's margin makes every Party certain.
     */
    function likeliestLowest() {
      const { document, guild, quests } = scene();
      openBoard(quests);
      alike(quests);
      const [easy] = quests;
      if (easy === undefined) throw new Error('No Quest');
      const heroes = partyPool(document.world, guild, deps);
      const base = deps.config.tiers
        .map((tier) => tier.difficultyMax)
        .find((difficulty) => {
          easy.difficulty = difficulty;
          return chanceOf(document, guild, easy, heroes) < 1;
        });
      if (base === undefined) throw new Error("No band top of the ladder leaves a Quest uncertain at the player's margin");
      for (const quest of quests) quest.difficulty = base * 1.5;
      easy.difficulty = base / 2;
      return { document, guild, quests, easy, base };
    }

    test('sends a Quest of lower reward and higher chance before one of higher reward', () => {
      const { document, guild, quests, easy } = likeliestLowest();
      const top = quests.at(-1) as Quest;
      const heroes = partyPool(document.world, guild, deps);
      expect(easy.reward).toBeLessThan(top.reward);
      expect(chanceOf(document, guild, easy, heroes, fewest)).toBeGreaterThan(chanceOf(document, guild, top, heroes, fewest));

      const sent = dispatches(automaticPolicy(document, fewest));

      // The second Party from the Heroes left, to Quests alike: the highest reward of them.
      expect(sent.map((action) => action.questId)).toEqual([easy.id, top.id]);
      // At the player's own margin too, the likeliest first.
      expect(dispatches(automaticPolicy(document, deps))[0]?.questId).toBe(easy.id);
    });

    test('equal chances go to the higher reward, then the lower Quest id', () => {
      const { document, guild, quests } = scene();
      openBoard(quests);
      alike(quests);
      const heroes = partyPool(document.world, guild, deps);
      expect(new Set(quests.map((quest) => chanceOf(document, guild, quest, heroes, fewest))).size).toBe(1);
      const [lowest] = quests;
      if (lowest === undefined) throw new Error('No Quest');
      lowest.reward = 500;

      expect(dispatches(automaticPolicy(document, fewest)).map((action) => action.questId)).toEqual([lowest.id, quests.at(-1)?.id]);

      for (const quest of quests) quest.reward = 100;
      // The Board in reverse id order, so that its own order would give the other answer.
      document.world.board = [...document.world.board].sort(compareByCodeUnit).reverse();
      const byId = quests.map((quest) => quest.id).sort(compareByCodeUnit);
      expect(dispatches(automaticPolicy(document, fewest)).map((action) => action.questId)).toEqual(byId.slice(0, 2));
    });

    test('passes over the likeliest Quest when it cannot staff it, for the next likeliest', () => {
      const { document, guild, quests, easy, base } = likeliestLowest();
      const next = quests[1] as Quest;
      next.difficulty = base;
      easy.requirements = { partySizeMin: 4 };
      const all = partyPool(document.world, guild, deps);
      expect(chanceOf(document, guild, easy, all, fewest)).toBeGreaterThan(chanceOf(document, guild, next, all, fewest));
      const [hurt] = guild.rosterIds;
      const hero = hurt === undefined ? undefined : document.world.heroes[hurt];
      if (hurt === undefined || hero === undefined) throw new Error('No Hero');
      hero.injury = { typeKey: 'bruised-ribs', healsOnTurn: 30 };
      const heroes = partyPool(document.world, guild, deps);
      expect(heroes).toHaveLength(3);
      expect(bestParties(document.world, guild, fewest).party(easy, heroes)).toBeNull();
      expect(chanceOf(document, guild, next, heroes, fewest)).toBeGreaterThan(chanceOf(document, guild, quests.at(-1) as Quest, heroes, fewest));

      const sent = dispatches(automaticPolicy(document, fewest));

      expect(sent[0]?.questId).toBe(next.id);
      expect(sent.map((action) => action.questId)).not.toContain(easy.id);
      expect(sent.flatMap((action) => action.heroIds)).not.toContain(hurt);
    });

    test('makes its second choice from the Heroes the first left, each Quest estimated again', () => {
      const { document, guild, quests } = scene();
      openBoard(quests);
      const [a, b, c] = quests;
      if (a === undefined || b === undefined || c === undefined) throw new Error('A short Board');
      document.world.board = [a.id, b.id, c.id];
      const heroes = partyPool(document.world, guild, deps);
      expect(heroes).toHaveLength(4);
      const firstParty = bestParties(document.world, guild, fewest).party(a, heroes)?.heroIds ?? [];
      const shares = (heroIds: readonly HeroId[]) => heroIds.some((heroId) => firstParty.includes(heroId));
      // `b`'s Party from every Hero shares one with `a`'s, so that from the Heroes `a` leaves it is another Party.
      expect(shares(bestParties(document.world, guild, fewest).party(b, heroes)?.heroIds ?? [])).toBe(true);
      // `a` the likeliest; `b` next with a Hero `a` takes, and the least likely without; `c` between.
      // By reward the policy would send `c` then `b`; by the chances read once, `a` then `b`.
      chances.of = (quest, heroIds) => (quest.id === a.id ? 0.9 : quest.id === b.id ? (shares(heroIds) ? 0.8 : 0.1) : 0.5);

      const sent = dispatches(automaticPolicy(document, fewest));

      expect(sent.map((action) => action.questId)).toEqual([a.id, c.id]);
      const [first, second] = sent;
      if (first === undefined || second === undefined) throw new Error('Too few Parties');
      expect(first.heroIds).toEqual(bestParties(document.world, guild, fewest).party(a, heroes)?.heroIds ?? null);
      expect(second.heroIds).toEqual(bestParties(document.world, guild, fewest).party(c, without(heroes, first.heroIds))?.heroIds ?? null);
      expect(second.heroIds.some((heroId) => first.heroIds.includes(heroId))).toBe(false);
    });

    test('holds a chance to at most 1, as the Best Party does: one above it by a sum’s rounding ties with a certain one, and the reward decides', () => {
      const { document, quests } = scene();
      openBoard(quests);
      const [low] = quests;
      const top = quests.at(-1) as Quest;
      if (low === undefined) throw new Error('No Quest');
      chances.of = (quest) => (quest.id === low.id ? 1 + Number.EPSILON : quest.id === top.id ? 1 : 0.5);

      expect(dispatches(automaticPolicy(document, fewest))[0]?.questId).toBe(top.id);
    });

    test('reads a Quest with no estimate, its Encounters drawn on the way, as a chance of 0', () => {
      const { document, guild, quests } = scene();
      openBoard(quests);
      const top = quests.at(-1) as Quest;
      const next = quests.at(-2) as Quest;
      // Its Encounters are none the content in use defines (data-model rule 5).
      top.encounterKeys = ['no-such-encounter'];
      expect(bestParties(document.world, guild, fewest).party(top, partyPool(document.world, guild, deps))?.estimate).toBeNull();
      // Every other Quest unlikely, but likelier than none.
      chances.of = () => 0.05;

      expect(dispatches(automaticPolicy(document, fewest))[0]?.questId).toBe(next.id);
    });
  });

  test('chooses only what the rules accept, applied in order: a build, or with building out of reach a recruit', () => {
    for (const seed of ['policy-a', 'policy-b', 'policy-c']) {
      for (const [policy, purchase] of [
        [defaultPolicyConfig, 'build'],
        [noBuilding, 'recruit'],
      ] as const) {
        let { document } = scene(seed);
        const guild = playerGuild(document.world) as Guild;
        document.world.guilds[guild.id] = { ...guild, wealth: 10_000 };
        const actions = automaticPolicy(document, deps, policy);
        expect(dispatches(actions).length).toBeGreaterThan(0);
        expect([...recruits(actions), ...builds(actions)].map((action) => action.kind)).toEqual([purchase]);
        for (const action of actions) {
          const result = applyAction(document, action, deps);
          expect(result.ok).toBe(true);
          if (result.ok) document = result.document;
        }
      }
    }
  });

  describe('recruits (building out of reach)', () => {
    /** The player's Guild with `wealth` and an empty Board, so only recruitment is chosen. */
    function recruiting(wealth: number) {
      const { document, guild } = scene();
      document.world.board = [];
      guild.wealth = wealth;
      return { document, guild, threshold: defaultPolicyConfig.recruitWealthMultiple * upkeep(guild, document.world, deps.config, deps.content) };
    }

    test('the cheapest Unattached Hero, lowest id among equal fees, when Wealth exceeds recruitWealthMultiple Upkeeps', () => {
      const { document, guild } = recruiting(10_000);
      const pool = unattachedHeroes(document.world);
      const cheapest = Math.min(...pool.map((hero) => signingFee(hero, deps)));
      const expected = pool.find((hero) => signingFee(hero, deps) === cheapest);

      expect(automaticPolicy(document, deps, noBuilding)).toEqual([{ kind: 'recruit', guildId: guild.id, heroId: expected?.id, years: defaultPolicyConfig.contractYears }]);
    });

    test('only when Wealth is strictly above the threshold and covers the fee', () => {
      const at = recruiting(0);
      at.guild.wealth = at.threshold;
      expect(automaticPolicy(at.document, deps, noBuilding)).toEqual([]);

      const above = recruiting(at.threshold + 1);
      const fees = unattachedHeroes(above.document.world).map((hero) => signingFee(hero, deps));
      expect(Math.min(...fees)).toBeGreaterThan(at.threshold + 1);
      expect(automaticPolicy(above.document, deps, noBuilding)).toEqual([]);
    });

    test("passing over a Hero who would refuse the Guild's Fame for the cheapest who would sign, by the engine's own test", () => {
      const gated: EngineDeps = { ...deps, config: { ...deps.config, fameRequiredPerLevel: 10 } };
      const { document, guild } = recruiting(10_000);
      guild.fame = 0;
      const pool = unattachedHeroes(document.world);
      const [first, second] = pool;
      if (first === undefined || second === undefined) throw new Error('A short pool');
      // The first the cheapest by far, at Level 3, which asks Fame 20 of a Guild; the second next.
      const statsAt = (value: number) => Object.fromEntries(Object.keys(first.stats).map((key) => [key, value]));
      for (const hero of pool) hero.stats = statsAt(20);
      first.stats = statsAt(1);
      first.level = 3;
      second.stats = statsAt(12);
      expect(signingFee(first, gated)).toBeLessThan(signingFee(second, gated));
      expect(signingRefusal(guild, first, gated.config)).toEqual({ fameRequired: 20, fame: 0, shortfall: 20 });

      expect(automaticPolicy(document, gated, noBuilding)).toEqual([{ kind: 'recruit', guildId: guild.id, heroId: second.id, years: defaultPolicyConfig.contractYears }]);

      guild.fame = 20;
      expect(automaticPolicy(document, gated, noBuilding)).toEqual([{ kind: 'recruit', guildId: guild.id, heroId: first.id, years: defaultPolicyConfig.contractYears }]);

      guild.fame = 0;
      for (const hero of pool) hero.level = 2;
      expect(automaticPolicy(document, gated, noBuilding)).toEqual([]);
    });

    test('only while the Roster is below the limit the policy sets', () => {
      const { document, guild } = recruiting(10_000);
      expect(guild.rosterIds).toHaveLength(4);
      expect(automaticPolicy(document, deps, { ...noBuilding, rosterLimit: 5 })).toHaveLength(1);
      expect(automaticPolicy(document, deps, { ...noBuilding, rosterLimit: 4 })).toEqual([]);
    });

    test("counts the Hall's upkeep among its Upkeeps, with the wages, as every reader of Upkeeps does (DL-298)", () => {
      const { document, guild } = recruiting(0);
      guild.hallBaseUpkeep = 3_000;
      const threshold = defaultPolicyConfig.recruitWealthMultiple * upkeep(guild, document.world, deps.config, deps.content);
      expect(threshold).toBeGreaterThan(defaultPolicyConfig.recruitWealthMultiple * (wages(guild, document.world) + 800));

      guild.wealth = threshold;
      expect(automaticPolicy(document, deps, noBuilding)).toEqual([]);
      guild.wealth = threshold + 1;
      expect(automaticPolicy(document, deps, noBuilding)).toEqual([expect.objectContaining({ kind: 'recruit', guildId: guild.id })]);
    });
  });

  describe('builds', () => {
    /** The player's Guild with `wealth`, its infirmary at `grade`, and an empty Board. */
    function building(wealth: number, grade = 0) {
      const { document, guild } = scene();
      document.world.board = [];
      guild.wealth = wealth;
      guild.hall.infirmary = grade;
      return { document, guild };
    }

    test("the infirmary's next grade, in place of a recruit, only while Wealth exceeds three times its cost", () => {
      const multiple = defaultPolicyConfig.buildWealthMultiple;
      const at = building(multiple * 200);
      expect(automaticPolicy(at.document, deps).map((action) => action.kind)).toEqual(['recruit']);

      const above = building(multiple * 200 + 1);
      expect(automaticPolicy(above.document, deps)).toEqual([{ kind: 'build', guildId: above.guild.id, facility: 'infirmary' }]);

      const second = building(multiple * 500 + 1, 1);
      expect(automaticPolicy(second.document, deps)).toEqual([{ kind: 'build', guildId: second.guild.id, facility: 'infirmary' }]);
      expect(automaticPolicy(building(multiple * 500, 1).document, deps).map((action) => action.kind)).toEqual(['recruit']);
    });

    // DL-297: the Facility it builds is content's first with the heal effect, the infirmary in the core.
    test("builds the first Facility in content's order with the heal effect, and nothing where none has it", () => {
      const { document, guild } = building(1_000_000);
      const { facilities, improvements } = deps.content;
      const hospice = { key: 'hospice', name: 'hospice', plural: false, upkeep: 15, effects: { healFactor: 1 } };
      const hospice1 = { key: 'hospice-1', name: 'Hospice', facility: 'hospice', grade: 1, cost: 200, effects: { healFactor: 0.5 } };
      const first = { ...deps, content: { ...deps.content, facilities: { hospice, ...facilities }, improvements: { ...improvements, 'hospice-1': hospice1 } } };
      const unhealing = Object.fromEntries(Object.entries(facilities).map(([key, row]) => [key, { ...row, effects: { moraleBaseline: 0 } }]));
      const none = { ...deps, content: { ...deps.content, facilities: unhealing } };

      expect(automaticPolicy(document, first)).toContainEqual({ kind: 'build', guildId: guild.id, facility: 'hospice' });
      expect(automaticPolicy(document, none).map((action) => action.kind)).toEqual(['recruit']);
    });

    test('nothing past the top grade, and no other facility: then it recruits', () => {
      const { document } = building(1_000_000, 3);
      expect(automaticPolicy(document, deps).map((action) => action.kind)).toEqual(['recruit']);
    });

    test('reads its own multiple, not a Rival’s Disposition’s (the game’s is in the rows, DL-56)', () => {
      const { document, guild } = building(1_000);
      expect(automaticPolicy(document, deps, { ...defaultPolicyConfig, buildWealthMultiple: 5 })).not.toContainEqual(
        expect.objectContaining({ kind: 'build' }),
      );
      const dispositions = Object.fromEntries(Object.entries(deps.content.dispositions).map(([key, row]) => [key, { ...row, buildThreshold: 100 }]));
      const game = { ...deps, content: { ...deps.content, dispositions } };
      expect(automaticPolicy(document, game)).toContainEqual({ kind: 'build', guildId: guild.id, facility: 'infirmary' });
    });
  });

  test('equips the gear its Guild holds first, by the engine’s gearChoices, before sending anyone away (DL-49)', () => {
    const scened = scene('policy-gear');
    const { guild, quests } = scened;
    let { document } = scened;
    openBoard(quests);
    const vault = { kind: 'guild', id: guild.id } as const;
    addStack(document.world, 'mail-shirt', 2, vault);
    addStack(document.world, 'short-sword', 1, vault);

    const actions = automaticPolicy(document, deps, noBuilding);
    const gear = gearChoices(document.world, guild, deps);

    expect(gear).toHaveLength(3);
    expect(actions.slice(0, gear.length)).toEqual(gear);
    expect(dispatches(actions).length).toBeGreaterThan(0);
    // Applied in order, every one is accepted: the equipped Heroes are still home to be sent.
    for (const action of actions) {
      const result = applyAction(document, action, deps);
      expect(result.ok, action.kind).toBe(true);
      if (result.ok) document = result.document;
    }
    expect(holdings(document.world, vault)).toEqual({ items: [], stacks: [] });
  });

  describe('buys armour', () => {
    /**
     * The player's Guild with `wealth`, its infirmary at the top grade so that it builds nothing, an
     * empty Board, and a Market holding two of each common armour and nothing else.
     */
    function shopping(wealth: number) {
      const { document, guild } = scene();
      document.world.board = [];
      guild.wealth = wealth;
      guild.hall.infirmary = 3;
      for (const key of ['padded-jack', 'mail-shirt', 'plate-harness', 'short-sword']) {
        addStack(document.world, key, 2, marketHolder);
      }
      return { document, guild };
    }

    const buying = (guildId: string, definitionKey: string) => ({ kind: 'buy', guildId, definitionKey, quantity: 1 });

    test('one piece, the dearest armour on the Market whose price Wealth is above three times, in place of a recruit', () => {
      const multiple = defaultPolicyConfig.buyWealthMultiple;
      const rich = shopping(multiple * 300 + 1);
      expect(automaticPolicy(rich.document, deps)).toEqual([buying(rich.guild.id, 'plate-harness')]);
      const at = shopping(multiple * 300);
      expect(automaticPolicy(at.document, deps)).toEqual([buying(at.guild.id, 'mail-shirt')]);
      const poor = shopping(multiple * 40);
      expect(automaticPolicy(poor.document, deps)).not.toContainEqual(expect.objectContaining({ kind: 'buy' }));
    });

    test('is a purchase the rules accept', () => {
      const { document, guild } = shopping(1_000);
      const [action] = automaticPolicy(document, deps);

      const result = action === undefined ? null : applyAction(document, action, deps);

      expect(result?.ok).toBe(true);
      expect(result?.ok && playerGuild(result.document.world)?.wealth).toBe(1_000 - 300);
      expect(guild.rosterIds.length).toBeGreaterThan(0);
    });

    test('a build comes first, and nothing once every Hero is armoured or has armour waiting', () => {
      const { document, guild } = shopping(10_000);
      guild.hall.infirmary = 0;
      expect(automaticPolicy(document, deps)).toEqual([{ kind: 'build', guildId: guild.id, facility: 'infirmary' }]);
      guild.hall.infirmary = 3;

      // Armour held for all but one Hero, then worn by that one: then it recruits. The armour held
      // is put on first, by gearChoices (DL-54), and the purchase is for the Hero left bare.
      const [first, ...rest] = guild.rosterIds;
      addStack(document.world, 'padded-jack', rest.length, { kind: 'guild', id: guild.id });
      const held = gearChoices(document.world, guild, deps);
      expect(held).toHaveLength(rest.length);
      expect(automaticPolicy(document, deps)).toEqual([...held, buying(guild.id, 'plate-harness')]);
      if (first === undefined) throw new Error('An empty Roster');
      addStack(document.world, 'mail-shirt', 1, { kind: 'hero', id: first, slot: 'armour' });
      const worn = gearChoices(document.world, guild, deps);
      expect(worn.map((action) => action.heroId)).toEqual(rest);
      expect(automaticPolicy(document, deps).map((action) => action.kind)).toEqual([...worn.map(() => 'equip'), 'recruit']);
    });

    test('the armour it buys is worn: its first choice the next Turn puts it on a bare Hero (DL-54)', () => {
      const { document, guild } = shopping(defaultPolicyConfig.buyWealthMultiple * 300 + 1);
      const [first] = guild.rosterIds;
      if (first === undefined) throw new Error('An empty Roster');
      let current = document;
      const apply = (actions: GuildAction[]) => {
        for (const action of actions) {
          const result = applyAction(current, action, deps);
          expect(result.ok, action.kind).toBe(true);
          if (result.ok) current = result.document;
        }
      };

      apply(automaticPolicy(current, deps));
      const [bought] = holdings(current.world, { kind: 'guild', id: guild.id }).stacks;
      expect(bought?.definitionKey).toBe('plate-harness');
      current = advance(current, deps).document;
      const next = automaticPolicy(current, deps);
      apply(next);

      expect(next[0]).toEqual({ kind: 'equip', guildId: guild.id, heroId: first, stackId: bought?.id });
      const armour = holdings(current.world, { kind: 'hero', id: first, slot: 'armour' });
      expect(armour.stacks.map((stack) => stack.definitionKey)).toEqual(['plate-harness']);
    });

    test('nothing when the Market has no armour, or it reads its own multiple', () => {
      const { document, guild } = scene();
      document.world.board = [];
      guild.wealth = 10_000;
      guild.hall.infirmary = 3;
      addStack(document.world, 'short-sword', 2, marketHolder);
      expect(automaticPolicy(document, deps).map((action) => action.kind)).toEqual(['recruit']);

      addStack(document.world, 'padded-jack', 1, marketHolder);
      const choices = automaticPolicy(document, deps, { ...defaultPolicyConfig, buyWealthMultiple: 1_000 });
      expect(choices.map((action) => action.kind)).toEqual(['recruit']);
    });
  });

  // DL-287: the player's Guild names a Captain as a Rival does, so a harness game meets the Captain's effects.
  test("names to an empty post its Hero highest in the captaincy Stat, by the engine's captainChoice, before it sends anyone, and no one while the post is held", () => {
    const { document, guild, quests } = scene('policy-captain');
    guild.captainId = null;
    openBoard(quests);
    const heroes = guild.rosterIds.map((id) => document.world.heroes[id] as Hero);
    heroes.forEach((hero, at) => Object.assign(hero, { traits: [], stats: { ...hero.stats, leadership: at === 2 ? 19 : 4 } }));

    const actions = automaticPolicy(document, deps, noBuilding);

    expect(actions.filter((action) => action.kind === 'nameCaptain')).toEqual([{ kind: 'nameCaptain', guildId: guild.id, heroId: heroes[2]?.id }]);
    expect(actions.findIndex((action) => action.kind === 'nameCaptain')).toBeLessThan(actions.findIndex((action) => action.kind === 'dispatch'));
    let current = document;
    for (const action of actions) {
      const result = applyAction(current, action, deps);
      expect(result.ok, action.kind).toBe(true);
      if (result.ok) current = result.document;
    }
    expect(current.world.guilds[guild.id]?.captainId).toBe(heroes[2]?.id);
    expect(automaticPolicy(current, deps, noBuilding).some((action) => action.kind === 'nameCaptain')).toBe(false);
  });

  test('declines every Transfer Offer made for its Heroes, first, and makes no Transfer itself (DL-57)', () => {
    const { document, guild, quests } = scene('policy-offers');
    openBoard(quests);
    let current = document;
    const rivals = Object.values(current.world.guilds).filter((row) => row.id !== guild.id);
    const offered = rivals.slice(0, 2).map((rival, index) => {
      const heroId = guild.rosterIds[index];
      if (heroId === undefined) throw new Error('Too few Heroes');
      (current.world.guilds[rival.id] as Guild).wealth = 10_000;
      const result = applyAction(current, { kind: 'offerTransfer', guildId: rival.id, heroId, years: 2 }, deps);
      if (!result.ok) throw new Error(`Refused: ${JSON.stringify(result.rejection)}`);
      current = result.document;
      return Object.keys(current.world.offers).sort().at(-1);
    });

    const actions = automaticPolicy(current, deps, noBuilding);

    expect(actions.slice(0, 2)).toEqual(offered.map((offerId) => ({ kind: 'declineTransfer', guildId: guild.id, offerId })));
    const transfers = ['transferIn', 'transferOut', 'offerTransfer', 'acceptTransfer'];
    expect(actions.filter((action) => transfers.includes(action.kind))).toEqual([]);
    // Applied in order, every one is accepted, and no offer is left.
    for (const action of actions) {
      const result = applyAction(current, action, deps);
      expect(result.ok, action.kind).toBe(true);
      if (result.ok) current = result.document;
    }
    expect(current.world.offers).toEqual({});
    // Every Hero it had is still on its Roster (a recruit may have joined them).
    expect(current.world.guilds[guild.id]?.rosterIds).toEqual(expect.arrayContaining(guild.rosterIds));
  });

  describe('answers a free Offer for its Hero Out of Contract as a Rival does (Q15, DL-319)', () => {
    // A new Guild's Roster is 4, the floor's default: the floor is set below it where the median is the test.
    const below: PolicyConfig = { ...noBuilding, rosterFloor: 3 };

    /** A free Offer from a Rival for the player's Hero `index`, its Roster's Levels set to `levels`, and the policy's answer. */
    function freeOffered(seed: string, levels: readonly number[], index: number, policy: PolicyConfig = noBuilding) {
      const { document, guild, quests } = scene(seed);
      openBoard(quests);
      const { world } = document;
      guild.rosterIds.forEach((id, at) => {
        (world.heroes[id] as Hero).level = levels[at] ?? 1;
      });
      const hero = world.heroes[guild.rosterIds[index] as HeroId] as Hero;
      world.turn = 9;
      hero.contract = { ...(hero.contract as NonNullable<Hero['contract']>), endDay: 2 };
      const rival = Object.values(world.guilds).find((row) => row.id !== guild.id) as Guild;
      const result = applyAction(document, { kind: 'offerTransfer', guildId: rival.id, heroId: hero.id, years: 2 }, deps);
      if (!result.ok) throw new Error(`Refused: ${JSON.stringify(result.rejection)}`);
      const [offerId] = Object.keys(result.document.world.offers);
      return { document: result.document, guild, hero, offerId, actions: automaticPolicy(result.document, deps, policy) };
    }

    test("renews, at its length, a Hero at or above its Roster's median Level, first; the Hero then free to be sent", () => {
      const { document, guild, hero, actions } = freeOffered('policy-free-renews', [4, 1, 1, 1, 1, 1, 1, 1], 0, below);
      expect(actions[0]).toEqual({ kind: 'renew', guildId: guild.id, heroId: hero.id, years: defaultPolicyConfig.contractYears });
      expect(actions.some((action) => action.kind === 'declineTransfer')).toBe(false);
      let current = document;
      for (const action of actions) {
        const result = applyAction(current, action, deps);
        expect(result.ok, `${action.kind}: ${result.ok ? '' : JSON.stringify(result.rejection)}`).toBe(true);
        if (result.ok) current = result.document;
      }
      expect(current.world.offers).toEqual({});
    });

    test('lets a Hero below the median run out, its Roster above the floor: no answer, and the Hero kept home', () => {
      const { guild, hero, actions } = freeOffered('policy-free-lets-go', [1, 4, 4, 4, 4, 4, 4, 4], 0, below);
      expect(guild.rosterIds.length).toBeGreaterThan(below.rosterFloor);
      expect(actions.filter((action) => action.kind === 'renew' || action.kind === 'declineTransfer')).toEqual([]);
      expect(actions.flatMap((action) => (action.kind === 'dispatch' ? action.heroIds : []))).not.toContain(hero.id);
    });

    test('renews a Hero below the median when its Roster is at the floor, rosterFloor (4)', () => {
      expect(defaultPolicyConfig.rosterFloor).toBe(4);
      const { guild, hero, actions } = freeOffered('policy-free-floor', [1, 4, 4, 4, 4, 4, 4, 4], 0);
      expect(guild.rosterIds).toHaveLength(4);
      expect(actions[0]).toEqual({ kind: 'renew', guildId: guild.id, heroId: hero.id, years: defaultPolicyConfig.contractYears });
    });
  });

  describe('carries and buys consumables (the M5 close, DL-62)', () => {
    test('each Party carries one of each consumable held that serves its Quest, never more than the Guild holds that Turn', () => {
      const scened = scene('policy-consumables');
      const { guild, quests } = scened;
      let { document } = scened;
      openBoard(quests);
      // Two Quests the likeliest, in this order (their chances set, DL-168): a fight on the road, then a quiet word.
      const [second, first] = quests.slice(-2);
      if (first === undefined || second === undefined) throw new Error('Fewer than two Quests');
      first.encounterKeys = ['ambush-on-the-road', 'the-long-march'];
      second.encounterKeys = ['a-hostile-reeve', 'the-patrons-steward'];
      chances.of = (quest) => (quest.id === first.id ? 0.9 : quest.id === second.id ? 0.8 : 0.1);
      const vault = { kind: 'guild', id: guild.id } as const;
      addStack(document.world, 'whetstone', 3, vault); // combat: the fight's
      addStack(document.world, 'lockpicks', 3, vault); // stealth: neither's
      addStack(document.world, 'grappling-line', 1, vault); // travel: the fight's
      addStack(document.world, 'blessed-candle', 2, vault); // social: the quiet word's
      addStack(document.world, 'healing-draught', 1, vault); // a heal serves any Quest: the first sent

      const actions = automaticPolicy(document, fewest, noBuilding);

      const sent = dispatches(actions);
      expect(sent.slice(0, 2).map((action) => action.questId)).toEqual([first.id, second.id]);
      expect(sent[0]?.consumables).toEqual([
        { definitionKey: 'grappling-line', quantity: 1 },
        { definitionKey: 'healing-draught', quantity: 1 },
        { definitionKey: 'whetstone', quantity: 1 },
      ]);
      expect(sent[1]?.consumables).toEqual([{ definitionKey: 'blessed-candle', quantity: 1 }]);
      // Applied in order, every one is accepted, and what was not carried or sold as surplus stays at home.
      for (const action of actions) {
        const result = applyAction(document, action, deps);
        expect(result.ok, action.kind).toBe(true);
        if (result.ok) document = result.document;
      }
      const home = holdings(document.world, vault).stacks.map((stack) => [stack.definitionKey, stack.quantity]);
      expect(home).toEqual(
        expect.arrayContaining([
          ['whetstone', 1],
          ['lockpicks', 2],
          ['blessed-candle', 1],
        ]),
      );
      expect(home.map(([key]) => key)).not.toContain('healing-draught');
    });

    test('a Party of a Guild holding no consumable carries none, and its dispatch names none', () => {
      const { document, quests } = scene('policy-consumables-none');
      openBoard(quests);
      for (const action of dispatches(automaticPolicy(document, deps, noBuilding))) {
        expect(Object.hasOwn(action, 'consumables')).toBe(false);
      }
    });

    /**
     * The player's Guild with `wealth`, nothing to build, no one to recruit and no armour to buy: its
     * infirmary at the top grade, every Hero in a padded jack, a Roster at the policy's limit, an
     * empty Board, and a Market holding `stock`.
     */
    function stocking(wealth: number, stock: [string, number][]) {
      const { document, guild } = scene('policy-stocking');
      document.world.board = [];
      guild.wealth = wealth;
      guild.hall.infirmary = 3;
      for (const heroId of guild.rosterIds) addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: heroId, slot: 'armour' });
      for (const [key, quantity] of stock) addStack(document.world, key, quantity, marketHolder);
      const policy: PolicyConfig = { ...defaultPolicyConfig, rosterLimit: guild.rosterIds.length };
      return { document, guild, policy };
    }

    test('buys, when nothing else is bought, the consumable it has fewest of, as many as it lacks and the Market has', () => {
      const stock = defaultPolicyConfig.consumableStock;
      const { document, guild, policy } = stocking(10_000, [
        ['whetstone', 5],
        ['healing-draught', 1],
        ['physicians-kit', 4],
      ]);
      const vault = { kind: 'guild', id: guild.id } as const;
      addStack(document.world, 'healing-draught', 1, vault);
      addStack(document.world, 'physicians-kit', 1, vault);
      // Fewest held: whetstone, none; the stock lacking, and the Market has five.
      expect(automaticPolicy(document, deps, policy)).toEqual([{ kind: 'buy', guildId: guild.id, definitionKey: 'whetstone', quantity: stock }]);

      // With the stock of whetstones held, the healing draught and the physician's kit each lack one: the lower key.
      addStack(document.world, 'whetstone', stock, vault);
      const [action] = automaticPolicy(document, deps, policy);
      expect(action).toEqual({ kind: 'buy', guildId: guild.id, definitionKey: 'healing-draught', quantity: 1 });
      const result = action === undefined ? null : applyAction(document, action, deps);
      expect(result?.ok).toBe(true);
    });

    test('counts what its Parties carry, buys nothing once stocked, and reads its own multiple and stock', () => {
      const { document, guild, policy } = stocking(10_000, [['whetstone', 5]]);
      const vault = { kind: 'guild', id: guild.id } as const;
      addStack(document.world, 'whetstone', 1, vault);
      // A Party away with one more makes two: stocked.
      const [heroId] = guild.rosterIds;
      if (heroId === undefined) throw new Error('An empty Roster');
      const partyId = makeId('parties', 77);
      document.world.parties[partyId] = { id: partyId, questId: makeId('quests', 77), guildId: guild.id, heroIds: [heroId], departedOnTurn: 0, returnsOnTurn: 5, fatigueAtDispatch: { [heroId]: 0 } };
      addStack(document.world, 'whetstone', 1, { kind: 'party', id: partyId });
      expect(automaticPolicy(document, deps, policy)).toEqual([]);

      expect(automaticPolicy(document, deps, { ...policy, consumableStock: 4 })).toEqual([
        { kind: 'buy', guildId: guild.id, definitionKey: 'whetstone', quantity: 2 },
      ]);
      // Two whetstones cost 50: Wealth must be above three times that, with no reserve asked for.
      const unreserved = { ...policy, consumableStock: 4, consumableReserveUpkeeps: 0 };
      guild.wealth = 150;
      expect(automaticPolicy(document, deps, unreserved)).toEqual([]);
      guild.wealth = 151;
      expect(automaticPolicy(document, deps, unreserved)).toHaveLength(1);
      // And, once paid, leave more than the policy's reserve of Upkeeps for consumables.
      const reserve = defaultPolicyConfig.consumableReserveUpkeeps * upkeep(guild, document.world, deps.config, deps.content);
      expect(reserve + 50).toBeGreaterThan(3 * 50); // so the reserve, not the multiple, is the bar
      guild.wealth = reserve + 50;
      expect(automaticPolicy(document, deps, { ...policy, consumableStock: 4 })).toEqual([]);
      guild.wealth = reserve + 51;
      expect(automaticPolicy(document, deps, { ...policy, consumableStock: 4 })).toHaveLength(1);
    });

    test('a recruit comes first', () => {
      const { document, guild, policy } = stocking(10_000, [['whetstone', 5]]);
      const choices = automaticPolicy(document, deps, { ...policy, rosterLimit: 8 });
      expect(choices).toEqual([expect.objectContaining({ kind: 'recruit', guildId: guild.id })]);
    });
  });

  test('chooses nothing once the game has ended', () => {
    const { document, quests } = scene();
    openBoard(quests);
    document.world.ended = { turn: 0, reason: 'bankruptcy' };
    expect(automaticPolicy(document, deps)).toEqual([]);
  });

  describe('sells surplus outside its purchase step (DL-301, Q18)', () => {
    test('sells surplus gear, consumables above stock, and loot-only items in holding', () => {
      const { document, guild } = scene('policy-surplus');
      const vault = { kind: 'guild', id: guild.id } as const;
      for (const heroId of guild.rosterIds) {
        addStack(document.world, 'short-sword', 1, { kind: 'hero', id: heroId, slot: 'weapon' });
        addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: heroId, slot: 'armour' });
        addStack(document.world, 'lucky-charm', 1, { kind: 'hero', id: heroId, slot: 'trinket' });
      }
      const sword = addStack(document.world, 'short-sword', 1, vault);
      const draughts = addStack(document.world, 'healing-draught', 3, vault);
      const blade = createItem(document.world, 'barrow-kings-blade', vault);

      const actions = automaticPolicy(document, deps, noBuilding);
      const sells = actions.filter((a) => a.kind === 'sell');
      expect(sells).toEqual([
        { kind: 'sell', guildId: guild.id, itemId: blade },
        { kind: 'sell', guildId: guild.id, stackId: sword, quantity: 1 },
        { kind: 'sell', guildId: guild.id, stackId: draughts, quantity: 1 },
      ]);
    });

    test('in debt, sells the entire holding', () => {
      const { document, guild } = scene('policy-debt');
      document.world.board = [];
      for (const heroId of guild.rosterIds) {
        addStack(document.world, 'short-sword', 1, { kind: 'hero', id: heroId, slot: 'weapon' });
        addStack(document.world, 'padded-jack', 1, { kind: 'hero', id: heroId, slot: 'armour' });
        addStack(document.world, 'lucky-charm', 1, { kind: 'hero', id: heroId, slot: 'trinket' });
      }
      guild.belowFloorSince = 0;
      const vault = { kind: 'guild', id: guild.id } as const;
      const blade = createItem(document.world, 'barrow-kings-blade', vault);
      const draughts = addStack(document.world, 'healing-draught', 2, vault);
      const sword = addStack(document.world, 'short-sword', 1, vault);

      const actions = automaticPolicy(document, deps, noBuilding);
      const sells = actions.filter((a) => a.kind === 'sell');
      expect(sells).toEqual([
        { kind: 'sell', guildId: guild.id, itemId: blade },
        { kind: 'sell', guildId: guild.id, stackId: draughts, quantity: 2 },
        { kind: 'sell', guildId: guild.id, stackId: sword, quantity: 1 },
      ]);
    });

    test('a loot-only Item it puts on a bare Hero is kept, not sold, and every action is accepted in order', () => {
      const scened = scene('policy-surplus-equip');
      const { guild } = scened;
      let { document } = scened;
      document.world.board = [];
      const blade = createItem(document.world, 'barrow-kings-blade', { kind: 'guild', id: guild.id });

      const actions = automaticPolicy(document, deps, noBuilding);
      expect(actions).toContainEqual(expect.objectContaining({ kind: 'equip', itemId: blade }));
      expect(actions.filter((a) => a.kind === 'sell')).toEqual([]);
      for (const action of actions) {
        const result = applyAction(document, action, deps);
        expect(result.ok, action.kind).toBe(true);
        if (result.ok) document = result.document;
      }
    });

    test('sells its surplus and still makes its one purchase the same Turn', () => {
      const { document, guild } = scene('policy-surplus-purchase');
      document.world.board = [];
      guild.wealth = defaultPolicyConfig.buyWealthMultiple * 300 + 1;
      guild.hall.infirmary = 3;
      addStack(document.world, 'plate-harness', 2, marketHolder);
      const whetstones = addStack(document.world, 'whetstone', 5, { kind: 'guild', id: guild.id });

      expect(automaticPolicy(document, deps)).toEqual([
        { kind: 'sell', guildId: guild.id, stackId: whetstones, quantity: 5 - defaultPolicyConfig.consumableStock },
        { kind: 'buy', guildId: guild.id, definitionKey: 'plate-harness', quantity: 1 },
      ]);
    });
  });
});
