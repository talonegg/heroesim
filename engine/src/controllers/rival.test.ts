import { describe, expect, test } from 'vitest';
import type { DispatchAction } from '../actions/dispatch.js';
import type { EngineDeps } from '../config.js';
import { createWorld } from '../create.js';
import { compareByCodeUnit, type Guild, type Hero, type HeroId, type Quest, type World } from '../document.js';
import { dispositionOf, playerGuild, signingFee, unattachedHeroes, upkeep } from '../selectors.js';
import { deepFreeze, testContent, testDeps } from '../world.test-support.js';
import { applyGuildAction } from '../actions/action.js';
import { availableHeroes, rivalChoices } from './rival.js';

// M2-S9: the `steady` Disposition's choices (INPUTS 4.12, DL-30), read off a world and never
// written to it. The phase that applies them is phases/rival-controllers.test.ts.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

interface Scene {
  world: World;
  rival: Guild;
  deps: EngineDeps;
}

/** A new world under `deps` and its first Rival, by Guild id. */
function scene(seed: string, deps: EngineDeps = testDeps()): Scene {
  const { world } = createWorld(seed, setup, deps).document;
  const [rival] = Object.values(world.guilds)
    .filter((guild) => dispositionOf(guild) !== null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
  if (rival === undefined) throw new Error('No Rival');
  return { world, rival, deps };
}

function heroOf(world: World, heroId: HeroId): Hero {
  const hero = world.heroes[heroId];
  if (hero === undefined) throw new Error(`No Hero ${heroId}`);
  return hero;
}

function boardQuests(world: World): Quest[] {
  return world.board.map((questId) => {
    const quest = world.quests[questId];
    if (quest === undefined) throw new Error(`No Quest ${questId}`);
    return quest;
  });
}

/** Opens every Quest on the Board to any Party of `min` to `max`, at the difficulties given in Board order. */
function openBoard(world: World, difficulties: number[], [min, max]: [number, number] = [1, 4]): Quest[] {
  const quests = boardQuests(world);
  quests.forEach((quest, index) => {
    quest.difficulty = difficulties[index] ?? 100;
    quest.requirements = { partySizeMin: min, partySizeMax: max };
  });
  return quests;
}

/** The only dispatch among `guild`'s choices, or `undefined`. */
function dispatchOf(world: World, guild: Guild, deps: EngineDeps): DispatchAction | undefined {
  const dispatches = rivalChoices(world, guild, deps).filter((action) => action.kind === 'dispatch');
  expect(dispatches.length).toBeLessThanOrEqual(1);
  return dispatches[0];
}

/** How much a Hero brings to a Quest, worked out here as DL-30 states it: demand weight × Stat. */
function strength(hero: Hero, quest: Quest): number {
  return quest.demands.reduce((total, [statKey, weight]) => total + weight * (hero.stats[statKey] ?? 0), 0);
}

/** `heroes`, strongest for `quest` first, ties by id. */
function ranked(heroes: Hero[], quest: Quest): Hero[] {
  return [...heroes].sort((a, b) => strength(b, quest) - strength(a, quest) || compareByCodeUnit(a.id, b.id));
}

describe('steady: which Quest', () => {
  test('takes the easiest Quest on the Board, lowest difficulty first', () => {
    const { world, rival, deps } = scene('easiest');
    const quests = openBoard(world, [60, 40, 25, 90, 30, 55]);

    expect(dispatchOf(world, rival, deps)).toMatchObject({ kind: 'dispatch', guildId: rival.id, questId: quests[2]?.id });
  });

  test('breaks a tie of difficulty by the lower Quest id', () => {
    const { world, rival, deps } = scene('tie');
    const quests = openBoard(world, [60, 20, 70, 20, 30, 20]);
    const [lowest] = [quests[1], quests[3], quests[5]].map((quest) => quest?.id ?? '').sort(compareByCodeUnit);

    expect(dispatchOf(world, rival, deps)?.questId).toBe(lowest);
  });

  test('passes over an easier Quest it cannot staff for the easiest it can', () => {
    const { world, rival, deps } = scene('staffable');
    const quests = openBoard(world, [10, 20, 30, 40, 50, 60]);
    const heroes = availableHeroes(world, rival);
    const classes = new Set(heroes.map((hero) => hero.classKey));
    const missing = Object.keys(testContent.classes).find((classKey) => !classes.has(classKey));
    const [first, second, third] = quests as [Quest, Quest, Quest];
    // More Heroes than the Rival has; then a Class it lacks, or a Skill nobody holds.
    first.requirements = { partySizeMin: heroes.length + 1, partySizeMax: heroes.length + 2 };
    second.requirements =
      missing === undefined
        ? { partySizeMin: 1, partySizeMax: 4, skillKey: 'no-such-skill' }
        : { partySizeMin: 1, partySizeMax: 4, classKey: missing };

    expect(dispatchOf(world, rival, deps)?.questId).toBe(third.id);
  });

  test('takes nothing when it can staff nothing on the Board, or the Board is empty', () => {
    const { world, rival, deps } = scene('nothing');
    const size = availableHeroes(world, rival).length + 1;
    openBoard(world, [10, 20, 30, 40, 50, 60], [size, size + 1]);

    expect(dispatchOf(world, rival, deps)).toBeUndefined();
    world.board = [];
    expect(dispatchOf(world, rival, deps)).toBeUndefined();
  });
});

describe('steady: which Heroes', () => {
  test("sends the fewest the Quest allows, the strongest for its demands first", () => {
    const { world, rival, deps } = scene('party');
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], [2, 4]) as [Quest];

    const action = dispatchOf(world, rival, deps);

    const expected = ranked(availableHeroes(world, rival), quest).slice(0, 2).map((hero) => hero.id);
    expect(action?.heroIds).toEqual(expected);
  });

  test('includes the strongest Hero of a required Class, however weak, and fills the rest by strength', () => {
    const { world, rival, deps } = scene('requires-class');
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], [2, 3]) as [Quest];
    const heroes = ranked(availableHeroes(world, rival), quest);
    const weakest = heroes[heroes.length - 1] as Hero;
    // Only the weakest Hero is of the required Class.
    for (const hero of heroes) hero.classKey = hero === weakest ? 'healer' : 'warrior';
    quest.requirements.classKey = 'healer';

    const action = dispatchOf(world, rival, deps);

    expect(action?.heroIds).toEqual([heroes[0]?.id, weakest.id]);
  });

  test('sends two Heroes to a Quest of one when one holds the required Skill and another is of the Class', () => {
    const { world, rival, deps } = scene('requires-both');
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], [1, 3]) as [Quest];
    const heroes = ranked(availableHeroes(world, rival), quest);
    for (const hero of heroes) {
      hero.classKey = 'warrior';
      hero.skills = {};
    }
    const [strongest, second] = heroes as [Hero, Hero];
    second.classKey = 'rogue';
    second.skills = { lockpicking: 1 };
    quest.requirements = { partySizeMin: 1, partySizeMax: 3, classKey: 'warrior', skillKey: 'lockpicking' };

    expect(dispatchOf(world, rival, deps)?.heroIds).toEqual([strongest.id, second.id]);

    // A Party of one cannot meet both; a Hero who meets both goes alone.
    quest.requirements.partySizeMax = 1;
    expect(dispatchOf(world, rival, deps)?.questId).not.toBe(quest.id);
    second.classKey = 'warrior';
    expect(dispatchOf(world, rival, deps)).toMatchObject({ questId: quest.id, heroIds: [second.id] });
  });

  test('never sends an unavailable Hero: injured, in a Party, dead or retired', () => {
    const { world, rival, deps } = scene('unavailable', testDeps({ rivalRosterMin: 6 }));
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], [2, 2]) as [Quest];
    const heroes = ranked(availableHeroes(world, rival), quest);
    expect(heroes.length).toBeGreaterThanOrEqual(6);
    const [injured, away, dead, retired] = heroes as [Hero, Hero, Hero, Hero];
    injured.injury = { typeKey: 'broken-arm', healsOnTurn: 99 };
    away.partyId = 'party-000001' as Hero['partyId'];
    dead.diedOnTurn = 0;
    retired.retiredOnTurn = 0;

    const action = dispatchOf(world, rival, deps);

    expect(action?.heroIds).toEqual([heroes[4]?.id, heroes[5]?.id]);
    for (const heroId of action?.heroIds ?? []) {
      expect(heroOf(world, heroId)).toMatchObject({ injury: null, partyId: null, diedOnTurn: null, retiredOnTurn: null });
    }
  });

  test('sends no one when no Hero of the Roster is free to go', () => {
    const { world, rival, deps } = scene('all-away');
    for (const heroId of rival.rosterIds) heroOf(world, heroId).injury = { typeKey: 'broken-arm', healsOnTurn: 99 };

    expect(availableHeroes(world, rival)).toEqual([]);
    expect(dispatchOf(world, rival, deps)).toBeUndefined();
  });
});

describe('steady: recruiting', () => {
  // Ten Upkeeps, so that Wealth just above the threshold covers any signing fee; and no building,
  // which `steady` chooses first once its Wealth is three times the infirmary's cost (M3-S6).
  // Negotiation still too (M4-S5): the fees are compared at the list price.
  const noBuilding = { buildWealthMultiple: 1_000_000, negotiationRange: 0 };
  const deps = testDeps({ recruitWealthMultiple: 10, ...noBuilding });

  /** The Hero in the pool with the lowest fee, lowest id among equals. */
  function cheapest(world: World): Hero {
    const [hero] = [...unattachedHeroes(world)].sort(
      (a, b) => signingFee(a, deps) - signingFee(b, deps) || compareByCodeUnit(a.id, b.id),
    );
    if (hero === undefined) throw new Error('The pool is empty');
    return hero;
  }

  const recruits = (world: World, guild: Guild) => rivalChoices(world, guild, deps).filter((action) => action.kind === 'recruit');

  test('recruits the cheapest Unattached Hero only while Wealth exceeds recruitWealthMultiple Upkeeps', () => {
    const { world, rival } = scene('threshold', deps);
    const threshold = deps.config.recruitWealthMultiple * upkeep(rival, world, deps.config, deps.content);
    expect(threshold).toBeGreaterThan(0);

    rival.wealth = threshold;
    expect(recruits(world, rival)).toEqual([]);

    rival.wealth = threshold + 1;
    expect(recruits(world, rival)).toEqual([{ kind: 'recruit', guildId: rival.id, heroId: cheapest(world).id }]);
  });

  test('reads the multiple from the config: ten Upkeeps by default since the first balance pass (DL-35)', () => {
    // INPUTS 4.12 says three; DL-35 raised the default to ten.
    expect(testDeps().config.recruitWealthMultiple).toBe(10);
    const { world, rival } = scene('multiple', deps);
    const wealth = 5 * upkeep(rival, world, deps.config, deps.content);
    rival.wealth = wealth;

    expect(recruits(world, rival)).toEqual([]);
    const lower = testDeps({ recruitWealthMultiple: 4, ...noBuilding });
    expect(rivalChoices(world, rival, lower).filter((action) => action.kind === 'recruit')).toHaveLength(1);
  });

  test('breaks a tie of fees by the lower Hero id', () => {
    const { world, rival } = scene('fee-tie', deps);
    rival.wealth = 100_000;
    const pool = unattachedHeroes(world);
    const [lowestId] = pool;
    // Every Hero in the pool alike: the same Stats and Level, so the same fee.
    for (const hero of pool) hero.stats = { ...lowestId?.stats };

    expect(recruits(world, rival)).toEqual([{ kind: 'recruit', guildId: rival.id, heroId: lowestId?.id }]);
  });

  test("passes over a Hero who would refuse its Fame for the cheapest who would sign (M3-S5), and asks no one when none would", () => {
    const gated = testDeps({ recruitWealthMultiple: 10, fameRequiredPerLevel: 10, ...noBuilding });
    const { world, rival } = scene('fame-skip', gated);
    rival.wealth = 100_000;
    rival.fame = 0;
    const first = cheapest(world);
    // Level 2 asks Fame 10 of a Guild and costs 25 more, so give the others dearer Stats to keep it cheapest.
    first.level = 2;
    for (const hero of unattachedHeroes(world)) {
      if (hero.id !== first.id) hero.stats = Object.fromEntries(Object.keys(hero.stats).map((key) => [key, 20]));
    }
    expect(cheapest(world).id).toBe(first.id);
    const hires = () => rivalChoices(world, rival, gated).filter((action) => action.kind === 'recruit');

    const [hire] = hires();
    expect(hire).toMatchObject({ kind: 'recruit', guildId: rival.id });
    expect(hire?.kind === 'recruit' && hire.heroId).not.toBe(first.id);

    rival.fame = 10;
    expect(hires()).toEqual([{ kind: 'recruit', guildId: rival.id, heroId: first.id }]);

    rival.fame = 0;
    for (const hero of unattachedHeroes(world)) hero.level = 3;
    expect(hires()).toEqual([]);
  });

  test('recruits no one it cannot pay for, and no one from an empty pool', () => {
    const noThreshold = testDeps({ recruitWealthMultiple: 0, negotiationRange: 0 });
    const { world, rival } = scene('afford', noThreshold);
    const fee = signingFee(cheapest(world), noThreshold);
    const hires = () => rivalChoices(world, rival, noThreshold).filter((action) => action.kind === 'recruit');

    rival.wealth = fee - 1;
    expect(hires()).toEqual([]);
    rival.wealth = fee;
    expect(hires()).toHaveLength(1);
    for (const hero of unattachedHeroes(world)) hero.unattachedSince = null;
    expect(hires()).toEqual([]);
  });
});

describe('steady: building (M3-S6)', () => {
  // Pinned: three times the cost, and a recruit threshold low enough that recruiting is on offer.
  const deps = testDeps({ buildWealthMultiple: 3, recruitWealthMultiple: 1 });
  const purchases = (world: World, guild: Guild) => rivalChoices(world, guild, deps).filter((action) => action.kind !== 'dispatch');

  test("builds the infirmary's next grade, in place of a recruit, only while Wealth exceeds three times its cost", () => {
    const { world, rival } = scene('build-threshold', deps);
    expect(testDeps().config.buildWealthMultiple).toBe(3);

    rival.wealth = 3 * 200;
    expect(purchases(world, rival)).toEqual([expect.objectContaining({ kind: 'recruit' })]);
    rival.wealth = 3 * 200 + 1;
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'infirmary' }]);

    rival.hall.infirmary = 1; // the next grade costs 500
    rival.wealth = 3 * 500;
    expect(purchases(world, rival)).toEqual([expect.objectContaining({ kind: 'recruit' })]);
    rival.wealth = 3 * 500 + 1;
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'infirmary' }]);
  });

  test('builds nothing once the infirmary is at its top grade, and no other facility', () => {
    const { world, rival } = scene('build-top', deps);
    rival.wealth = 1_000_000;
    rival.hall = { infirmary: 3, trainingYard: 0, quarters: 0 };

    expect(purchases(world, rival).map((action) => action.kind)).toEqual(['recruit']);
  });

  test('its build is accepted by the rule, and climbs the infirmary afternoon by afternoon', () => {
    const { world, rival } = scene('build-climb', deps);
    rival.wealth = 100_000;

    for (const grade of [1, 2, 3]) {
      const [build] = purchases(world, rival);
      expect(build).toEqual({ kind: 'build', guildId: rival.id, facility: 'infirmary' });
      if (build === undefined) throw new Error('No build');
      expect(applyGuildAction(world, build, deps)).toMatchObject({ ok: true });
      expect(rival.hall.infirmary).toBe(grade);
    }
    expect(rival.wealth).toBe(100_000 - 1700);
    expect(purchases(world, rival).map((action) => action.kind)).toEqual(['recruit']);
  });
});

describe('rivalChoices', () => {
  test('dispatches, then recruits, as Action values a front end would produce', () => {
    const { world, rival, deps } = scene('both');
    rival.wealth = 100_000;
    rival.hall.infirmary = 3; // built to its top (M3-S6), so that its purchase is a recruit

    const choices = rivalChoices(world, rival, deps);

    expect(choices.map((action) => action.kind)).toEqual(['dispatch', 'recruit']);
    expect(choices.every((action) => action.guildId === rival.id)).toBe(true);
  });

  test('chooses nothing for the player, whose choices are the player’s, or for a folded Guild', () => {
    const { world, rival, deps } = scene('none');
    const player = playerGuild(world) as Guild;
    player.wealth = 100_000;

    expect(rivalChoices(world, player, deps)).toEqual([]);
    expect(rivalChoices(world, rival, deps)).not.toEqual([]);
    rival.foldedOnTurn = 0;
    expect(rivalChoices(world, rival, deps)).toEqual([]);
  });

  test('chooses nothing for a Disposition content does not define (rule 5) or the engine has no rule for', () => {
    const { world, rival, deps } = scene('unknown');
    expect(rivalChoices(world, rival, deps)).not.toEqual([]);

    const withoutSteady: EngineDeps = { ...deps, content: { ...testContent, dispositions: {} } };
    expect(rivalChoices(world, rival, withoutSteady)).toEqual([]);

    rival.controller = { kind: 'rival', disposition: 'reckless' };
    const withReckless: EngineDeps = {
      ...deps,
      content: { ...testContent, dispositions: { ...testContent.dispositions, reckless: { key: 'reckless', name: 'Reckless' } } },
    };
    expect(rivalChoices(world, rival, withReckless)).toEqual([]);
  });

  test('reads the world and changes nothing in it, its random streams included', () => {
    const { world, rival, deps } = scene('pure');
    rival.wealth = 100_000;
    const before = structuredClone(world);
    deepFreeze(world);

    expect(rivalChoices(world, rival, deps)).toHaveLength(2);
    expect(world).toEqual(before);
  });
});
