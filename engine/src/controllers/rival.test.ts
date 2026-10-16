import { describe, expect, test, vi } from 'vitest';
import { dispatchRefusal, unmetRequirements, type DispatchAction } from '../actions/dispatch.js';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import type { ContentSet, Disposition, DispositionKey } from '../content-types.js';
import { createWorld } from '../create.js';
import { compareByCodeUnit, makeId, type Contract, type Guild, type Hero, type HeroId, type Quest, type QuestId, type World, type WorldDocument } from '../document.js';
import { addStack, createItem, holdings } from '../items.js';
import { marketHolder } from '../market.js';
import { createStreams, next } from '../rng.js';
import { dispositionOf, playerGuild, signingFee, transferFee, unattachedHeroes, upkeep } from '../selectors.js';
import { guildmasterOf } from '../guildmaster.js';
import { applyTransferOut } from '../actions/transfer.js';
import type { TurnEvent } from '../events.js';
import { deepFreeze, harmlessContent, setEncounters, setup, testContent, testDeps, withCaptaincy, withDispositions, withEncounters, withValid } from '../world.test-support.js';
import { applyAction, applyGuildAction, type GuildAction } from '../actions/action.js';
import { availableHeroes, bestParties, partyPool, requiredParty } from '../best-party.js';
import { rivalChoices, staffableQuests } from './rival.js';
import { estimateQuest } from '../quest-engine/estimate.js';

// DL-175: a test may name the chance of success by the size of the Party, in place of
// the estimate, to set a gain exactly; none set, `partyEstimator` is the real one. `asked` counts the
// Parties so weighed (DL-175).
const chances = vi.hoisted(() => ({ bySize: null as ((size: number) => number) | null, asked: 0 }));
vi.mock('../quest-engine/estimate.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../quest-engine/estimate.js')>();
  return {
    ...real,
    partyEstimator: (...args: Parameters<typeof real.partyEstimator>) => {
      const estimate = real.partyEstimator(...args);
      return (...asked: Parameters<typeof estimate>) => {
        const [, heroes] = asked;
        if (chances.bySize === null) return estimate(...asked);
        chances.asked += 1;
        const success = chances.bySize(heroes.length);
        return { success, bands: { strong: success } } as unknown as ReturnType<typeof estimate>;
      };
    },
  };
});

// The Rivals' choices (INPUTS 4.12, DL-30), read off a world, which they change only by the
// draws they take from `rivals`; one rule reading each Disposition's weights (INPUTS 7.5,
// DL-56). `steady` keeps DL-30's choices, so its tests stand as they were. The phase that applies
// them is phases/rival-controllers.test.ts.

interface Scene {
  world: World;
  rival: Guild;
  deps: EngineDeps;
}

/** A new world under `deps` and its first Rival, by Guild id, dealt `disposition` (`steady` by default). */
function scene(seed: string, deps: EngineDeps = testDeps(), disposition: DispositionKey = 'steady'): Scene {
  const { world } = createWorld(seed, setup, deps).document;
  const [rival] = rivalsOf(world).filter((guild) => dispositionOf(guild) === disposition);
  if (rival === undefined) throw new Error(`No ${disposition} Rival`);
  return { world, rival, deps };
}

/** Every Rival of `world`, by Guild id. */
function rivalsOf(world: World): Guild[] {
  return Object.values(world.guilds)
    .filter((guild) => dispositionOf(guild) !== null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
}

/** `guild`'s Disposition row under `deps`. */
function rowOf(guild: Guild, deps: EngineDeps): Disposition {
  const row = deps.content.dispositions[dispositionOf(guild) ?? ''];
  if (row === undefined) throw new Error(`No Disposition row for ${guild.id}`);
  return row;
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

/** Opens every Quest on the Board to any Party of `min` or more, at the difficulties given in Board order. */
function openBoard(world: World, difficulties: number[], min = 1): Quest[] {
  const quests = boardQuests(world);
  quests.forEach((quest, index) => {
    quest.difficulty = difficulties[index] ?? 100;
    quest.requirements = { partySizeMin: min };
  });
  return quests;
}

/**
 * Freezes everything in `world` but the one stream a Rival may draw from, and returns the world as it
 * must stand after one draw from that stream: a Rival's dispatch takes it, and nothing else changes.
 */
function frozenButRivals(world: World): World {
  const before = structuredClone(world);
  for (const [key, value] of Object.entries(world)) if (key !== 'rng') deepFreeze(value);
  for (const [name, state] of Object.entries(world.rng)) if (name !== 'rivals') deepFreeze(state);
  Object.freeze(world.rng);
  Object.freeze(world);
  const drawn = structuredClone(before.rng.rivals);
  next(drawn);
  return { ...before, rng: { ...before.rng, rivals: drawn } };
}

/** The only dispatch among `guild`'s choices, or `undefined`. */
function dispatchOf(world: World, guild: Guild, deps: EngineDeps): DispatchAction | undefined {
  const dispatches = rivalChoices(world, guild, deps).filter((action) => action.kind === 'dispatch');
  expect(dispatches.length).toBeLessThanOrEqual(1);
  return dispatches[0];
}

/** The difficulty of the Quest `guild` dispatches to, or `undefined` when it sends no one. */
function takenDifficulty(world: World, guild: Guild, deps: EngineDeps): number | undefined {
  const questId = dispatchOf(world, guild, deps)?.questId;
  return questId === undefined ? undefined : world.quests[questId]?.difficulty;
}

/** Empties the Market of every stack and Item and stocks it with `stacks` alone (DL-58's tests). */
function stockMarket(world: World, stacks: readonly (readonly [string, number])[]): void {
  const held = holdings(world, marketHolder);
  for (const stack of held.stacks) delete world.stacks[stack.id];
  for (const item of held.items) delete world.items[item.id];
  for (const [definitionKey, quantity] of stacks) addStack(world, definitionKey, quantity, marketHolder);
}

/** A chance as the greedy rule weighs it: of a success or better, at most 1, then of a strong success. */
function chanceOf(world: World, quest: Quest, heroes: readonly Hero[], deps: EngineDeps): [number, number] {
  const estimate = estimateQuest(world, quest, heroes, deps);
  return estimate === null ? [0, 0] : [Math.min(1, estimate.success), estimate.bands.strong];
}

/**
 * The Party DL-148 item 17's greedy rule names, worked out here from `estimateQuest` alone, a fresh
 * estimate for every Party weighed: the Heroes the requirements take, each the one who
 * most raises the chance of success; then the one who most raises it up to `partySizeMin`; then the
 * one who most raises it while it raises it by more than `margin`, of any number (DL-266). Ties go to
 * the better chance of a strong success, then the lower Hero id.
 */
function greedyParty(world: World, quest: Quest, available: readonly Hero[], deps: EngineDeps, margin: number): HeroId[] | null {
  const { partySizeMin, classKey, skillKey } = quest.requirements;
  const ofClass = (hero: Hero) => classKey === undefined || hero.classKey === classKey;
  const withSkill = (hero: Hero) => skillKey === undefined || Object.hasOwn(hero.skills, skillKey);
  const party: Hero[] = [];
  const pick = (candidates: readonly Hero[]): { hero: Hero; chance: [number, number] } => {
    const weighed = candidates.map((hero) => ({ hero, chance: chanceOf(world, quest, [...party, hero], deps) }));
    weighed.sort((a, b) => b.chance[0] - a.chance[0] || b.chance[1] - a.chance[1] || compareByCodeUnit(a.hero.id, b.hero.id));
    return weighed[0] as { hero: Hero; chance: [number, number] };
  };
  const rest = () => available.filter((hero) => !party.includes(hero));

  let places = 0;
  if (classKey !== undefined || skillKey !== undefined) {
    if (available.some((hero) => ofClass(hero) && withSkill(hero))) places = 1;
    else if (available.some(ofClass) && available.some(withSkill)) places = 2;
    else return null;
  }
  const size = Math.max(partySizeMin, places);
  if (size > available.length) return null;
  if (places === 1) party.push(pick(available.filter((hero) => ofClass(hero) && withSkill(hero))).hero);
  if (places === 2) {
    const first = pick(available.filter((hero) => ofClass(hero) || withSkill(hero))).hero;
    party.push(first, pick(available.filter(ofClass(first) ? withSkill : ofClass)).hero);
  }
  while (party.length < partySizeMin) party.push(pick(rest()).hero);
  let chance = chanceOf(world, quest, party, deps)[0];
  while (rest().length > 0) {
    const next = pick(rest());
    if (!(next.chance[0] - chance > margin)) break;
    party.push(next.hero);
    chance = next.chance[0];
  }
  return party.map((hero) => hero.id);
}

/** `heroes` by Hero id. */
function byId(heroes: readonly Hero[]): Hero[] {
  return [...heroes].sort((a, b) => compareByCodeUnit(a.id, b.id));
}

describe('steady: which Quest', () => {
  test('takes the easiest Quest on the Board, lowest difficulty first', () => {
    const { world, rival, deps } = scene('easiest');
    const quests = openBoard(world, [60, 40, 25, 90, 30, 55]);

    expect(dispatchOf(world, rival, deps)).toMatchObject({ kind: 'dispatch', guildId: rival.id, questId: quests[2]?.id });
  });

  // DL-56: a tie the weights leave is broken by a draw from `rivals`, where DL-30 took the
  // lower Quest id.
  test('breaks a tie of difficulty with one draw from rivals, among the tied Quests only', () => {
    const { world, rival, deps } = scene('tie');
    const quests = openBoard(world, [60, 20, 70, 20, 30, 20]);
    const tied = [quests[1], quests[3], quests[5]].map((quest) => quest?.id);
    const chosen = new Set<string | undefined>();

    for (let state = 0; state < 30; state += 1) {
      world.rng.rivals = createStreams(`tie-${state}`, ['rivals']).rivals;
      const once = structuredClone(world.rng.rivals);
      next(once);

      const questId = dispatchOf(world, rival, deps)?.questId;

      expect(tied).toContain(questId);
      expect(world.rng.rivals).toEqual(once);
      chosen.add(questId);
    }
    expect([...chosen].sort()).toEqual([...tied].sort());
  });

  test('passes over an easier Quest it cannot staff for the easiest it can', () => {
    const { world, rival, deps } = scene('staffable');
    const quests = openBoard(world, [10, 20, 30, 40, 50, 60]);
    const heroes = availableHeroes(world, rival);
    const classes = new Set(heroes.map((hero) => hero.classKey));
    const missing = Object.keys(testContent.classes).find((classKey) => !classes.has(classKey));
    const [first, second, third] = quests as [Quest, Quest, Quest];
    // More Heroes than the Rival has; then a Class it lacks, or a Skill nobody holds.
    first.requirements = { partySizeMin: heroes.length + 1 };
    second.requirements =
      missing === undefined
        ? { partySizeMin: 1, skillKey: 'no-such-skill' }
        : { partySizeMin: 1, classKey: missing };

    expect(dispatchOf(world, rival, deps)?.questId).toBe(third.id);
  });

  // DL-264: a Rival chooses only what it may take, its Fame at least the minimum of the Quest's Tier.
  test("passes over a Quest of a Tier whose Fame minimum is above its Fame, as dispatch would refuse it, for the easiest it may take", () => {
    const { world, rival, deps } = scene('fame-minimum');
    const quests = openBoard(world, [10, 20, 30, 40, 50, 60]);
    // The easiest two posted at Tier 3, the rest at Tier 1; Tier 3's minimum one above the Rival's Fame.
    quests.forEach((quest, index) => {
      quest.tier = index < 2 ? 3 : 1;
    });
    const tiers = deps.config.tiers.map((row, index) => ({ ...row, fameMinimum: index === 2 ? rival.fame + 1 : 0 }));
    const closed = { ...deps, config: { ...deps.config, tiers } };

    expect(dispatchOf(world, rival, deps)?.questId).toBe(quests[0]?.id);
    expect(dispatchOf(world, rival, closed)?.questId).toBe(quests[2]?.id);
    expect(staffableQuests(world, rival, closed).map((quest) => quest.id)).toEqual(quests.slice(2).map((quest) => quest.id));
    // Every Quest closed to it: it sends no one.
    const shut = { ...deps, config: { ...deps.config, tiers: tiers.map((row) => ({ ...row, fameMinimum: rival.fame + 1 })) } };
    expect(dispatchOf(world, rival, shut)).toBeUndefined();
    expect(staffableQuests(world, rival, shut)).toEqual([]);
  });

  test('takes nothing when it can staff nothing on the Board, or the Board is empty', () => {
    const { world, rival, deps } = scene('nothing');
    const size = availableHeroes(world, rival).length + 1;
    openBoard(world, [10, 20, 30, 40, 50, 60], size);

    expect(dispatchOf(world, rival, deps)).toBeUndefined();
    world.board = [];
    expect(dispatchOf(world, rival, deps)).toBeUndefined();
  });
});

// DL-148 item 17: a Rival chooses its Party by the chance estimate, the greedy rule
// the Best Party states (best-party.ts), where DL-30 sent the fewest the Quest allowed, strongest for its demands first.
describe('which Heroes: the greedy rule by the chance estimate', () => {
  const margins = [0, 0.02, 0.05, 0.1, 0.3, 1];

  test('each Disposition, at each margin set in its row, sends the Party the greedy rule names', () => {
    const sizes = new Map<number, number[]>();
    for (const disposition of ['ambitious', 'miserly', 'reckless', 'steady']) {
      // One world a Disposition: a margin draws nothing at creation, so only the deps read differ.
      const made = scene(`greedy-${disposition}`, testDeps(), disposition);
      openBoard(made.world, [70, 75, 80, 85, 90, 95], 1);
      for (const partyMargin of margins) {
        const deps = testDeps({}, withDispositions({ partyMargin }));
        const world = structuredClone(made.world);
        const rival = world.guilds[made.rival.id] as Guild;

        const action = dispatchOf(world, rival, deps);
        const quest = world.quests[action?.questId as QuestId] as Quest;

        const expected = greedyParty(world, quest, availableHeroes(world, rival), deps, partyMargin);
        expect(action?.heroIds, `${disposition} at ${partyMargin}`).toEqual(expected);
        sizes.set(partyMargin, [...(sizes.get(partyMargin) ?? []), expected?.length ?? 0]);
        // DL-175: at 0 a Party stops short of every Hero free only when no Hero left raises its
        // chance at all, no Quest having a most (DL-266).
        if (partyMargin === 0 && expected !== null) {
          const party = expected.map((id) => world.heroes[id] as Hero);
          const chance = chanceOf(world, quest, party, deps)[0];
          for (const hero of availableHeroes(world, rival).filter((it) => !expected.includes(it.id))) {
            expect(chanceOf(world, quest, [...party, hero], deps)[0], `${disposition} with ${hero.id}`).toBeLessThanOrEqual(chance);
          }
        }
      }
    }
    // The margin decides how many go: at 0 each Hero who raises the chance at all, at 1 the fewest.
    expect(sizes.get(1)).toEqual([1, 1, 1, 1]);
    // (DL-175: a Party already sure of the Quest gains nothing from a Hero, so it is not always more than one.)
    expect(sizes.get(0)?.some((size) => size > 1)).toBe(true);
    // And some stop short here, so the check of a Party stopped short above is exercised.
    expect(sizes.get(0)?.some((size) => size < 4)).toBe(true);
    for (const [margin, counted] of sizes) {
      const looser = margins.filter((it) => it < margin).map((it) => sizes.get(it) ?? []);
      for (const other of looser) counted.forEach((size, index) => expect(size).toBeLessThanOrEqual(other[index] ?? 0));
    }
  });

  test("the player's Guild, which has no Disposition, goes by the configuration's playerPartyMargin", () => {
    for (const playerPartyMargin of margins) {
      const deps = testDeps({ playerPartyMargin });
      const { world } = createWorld('greedy-player', setup, deps).document;
      const guild = playerGuild(world) as Guild;
      const [quest] = openBoard(world, [80], 1) as [Quest];
      const available = availableHeroes(world, guild);

      expect(bestParties(world, guild, deps).party(quest, available)?.heroIds ?? null, String(playerPartyMargin)).toEqual(
        greedyParty(world, quest, available, deps, playerPartyMargin),
      );
    }
  });

  // DL-175, R1: past the minimum size a Hero joins only for more than the margin.
  describe('a Hero joins only for more than the margin', () => {
    /**
     * On a Quest of one to four places, the chance of success a function of the Party's size: how many
     * go, how many Parties were weighed, and how many Heroes could go.
     */
    function weigh(playerPartyMargin: number, bySize: (size: number) => number): { size: number; asked: number; available: number } {
      const deps = testDeps({ playerPartyMargin });
      const { world } = createWorld('gain-strict', setup, deps).document;
      const guild = playerGuild(world) as Guild;
      const [quest] = openBoard(world, [80], 1) as [Quest];
      const available = availableHeroes(world, guild);
      chances.bySize = bySize;
      chances.asked = 0;
      try {
        const size = (bestParties(world, guild, deps).party(quest, available)?.heroIds as HeroId[]).length;
        return { size, asked: chances.asked, available: available.length };
      } finally {
        chances.bySize = null;
      }
    }
    /** How many go, as `weigh`. */
    function sent(playerPartyMargin: number, bySize: (size: number) => number): number {
      return weigh(playerPartyMargin, bySize).size;
    }

    test('at a margin of 0 a Hero who raises the chance by nothing is not added, and one who raises it at all is', () => {
      expect(sent(0, () => 0.5)).toBe(1);
      expect(sent(0, (size) => (size === 1 ? 0.5 : 0.5 + 2 ** -30 * (size - 1)))).toBe(4);
      expect(sent(0, (size) => (size <= 2 ? 0.5 * size : 0.5 + 0.0 * size))).toBe(2);
    });

    test('at a margin of 0.05 a gain of exactly 0.05 is not added, and one above it is', () => {
      // 0.05 - 0 is 0.05 to the bit (a subtraction of zero is exact), so the gain is the margin itself.
      expect(0.05 - 0).toBe(0.05);
      expect(sent(0.05, (size) => (size === 1 ? 0 : 0.05))).toBe(1);
      expect(sent(0.05, (size) => (size === 1 ? 0 : 0.05 + 2 ** -30))).toBe(2);
      // Each further Hero is judged by its own gain: 0.05 after the one who went by more than it, again
      // exact to the bit.
      expect(0.0625 + 0.05 - 0.0625).toBe(0.05);
      expect(sent(0.05, (size) => [0, 0, 0.0625, 0.0625 + 0.05, 0.0625 + 0.05][size] as number)).toBe(2);
    });

    test('at a margin of 1 no Hero joins past the minimum, even for the whole of the chance', () => {
      expect(sent(1, (size) => (size === 1 ? 0 : 1))).toBe(1);
    });

    // DL-175: the loop's guard. No Hero can raise the chance by more than what is
    // left of it below 1, so once that is the margin or less no Hero past the minimum is weighed: only
    // the first place's, one Party each.
    test('once what is left of the chance is not more than the margin, no Hero past the minimum is weighed', () => {
      for (const [margin, chance] of [[0, 1], [0.5, 0.5], [0.05, 1]] as const) {
        const { size, asked, available } = weigh(margin, () => chance);
        expect(available, `${margin}`).toBeGreaterThan(1);
        expect(size, `${margin}`).toBe(1);
        expect(asked, `${margin}`).toBe(available);
      }
      // What is left more than the margin, the next place's Heroes are weighed too, and none goes.
      const { size, asked, available } = weigh(0.5 - 2 ** -30, () => 0.5);
      expect(size).toBe(1);
      expect(asked).toBe(available + available - 1);
    });
  });

  test('adds first the Hero who most raises the chance, however the Roster is ordered', () => {
    const { world, rival, deps } = scene('greedy-first', testDeps({}, withDispositions({ partyMargin: 1 })));
    const [quest] = openBoard(world, [60, 90, 90, 90, 90, 90], 1) as [Quest];
    const heroes = availableHeroes(world, rival);
    const last = byId(heroes).at(-1) as Hero;
    // The last Hero by id is made far the strongest in every Stat.
    for (const statKey of Object.keys(last.stats)) last.stats[statKey] = 20;
    for (const hero of heroes) if (hero !== last) for (const statKey of Object.keys(hero.stats)) hero.stats[statKey] = 3;

    expect(dispatchOf(world, rival, deps)?.heroIds).toEqual([last.id]);
    expect(greedyParty(world, quest, heroes, deps, 1)).toEqual([last.id]);
  });

  test('includes a Hero of the required Class, however weak, and then whoever most raises the chance', () => {
    const { world, rival, deps } = scene('requires-class', testDeps({}, withDispositions({ partyMargin: 1 })));
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], 2) as [Quest];
    const heroes = byId(availableHeroes(world, rival));
    const weakest = heroes[0] as Hero;
    for (const statKey of Object.keys(weakest.stats)) weakest.stats[statKey] = 1;
    // Only the weakest Hero is of the required Class.
    for (const hero of heroes) hero.classKey = hero === weakest ? 'healer' : 'warrior';
    quest.requirements.classKey = 'healer';

    const action = dispatchOf(world, rival, deps);

    expect(action?.heroIds[0]).toBe(weakest.id);
    expect(action?.heroIds).toHaveLength(2);
    expect(action?.heroIds).toEqual(greedyParty(world, quest, heroes, deps, 1));
  });

  test('sends two Heroes to a Quest of one when one holds the required Skill and another is of the Class', () => {
    const { world, rival, deps } = scene('requires-both', testDeps({}, withDispositions({ partyMargin: 1 })));
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], 1) as [Quest];
    const heroes = byId(availableHeroes(world, rival));
    for (const hero of heroes) {
      hero.classKey = 'warrior';
      hero.skills = {};
    }
    const second = heroes[1] as Hero;
    second.classKey = 'rogue';
    second.skills = { lockpicking: 1 };
    quest.requirements = { partySizeMin: 1, classKey: 'warrior', skillKey: 'lockpicking' };

    const heroIds = dispatchOf(world, rival, deps)?.heroIds ?? [];
    expect(heroIds).toHaveLength(2);
    expect(heroIds).toContain(second.id);
    expect(heroOf(world, heroIds.find((id) => id !== second.id) as HeroId).classKey).toBe('warrior');
    expect(heroIds).toEqual(greedyParty(world, quest, heroes, deps, 1));

    // A Hero who meets both goes alone.
    second.classKey = 'warrior';
    expect(dispatchOf(world, rival, deps)).toMatchObject({ questId: quest.id, heroIds: [second.id] });
  });

  test('a Quest whose Encounters are drawn on the way has no estimate: the fewest it allows, by Hero id', () => {
    const { world, rival, deps } = scene('greedy-unknown', testDeps({}, withDispositions({ partyMargin: 0.05 })));
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], 2) as [Quest];
    // Content defines none of its Encounters (data-model rule 5).
    setEncounters(quest, ['no-such-encounter']);

    expect(dispatchOf(world, rival, deps)?.heroIds).toEqual(byId(availableHeroes(world, rival)).slice(0, 2).map((hero) => hero.id));
  });

  test('never sends an unavailable Hero: injured, in a Party, dead or retired', () => {
    const { world, rival, deps } = scene('unavailable', testDeps({ rivalRosterMin: 6 }, withDispositions({ partyMargin: 0 })));
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], 2) as [Quest];
    const heroes = byId(availableHeroes(world, rival));
    expect(heroes.length).toBeGreaterThanOrEqual(6);
    const [injured, away, dead, retired] = heroes as [Hero, Hero, Hero, Hero];
    injured.injury = { typeKey: 'broken-arm', healsOnTurn: 99 };
    away.partyId = 'party-000001' as Hero['partyId'];
    dead.diedOnTurn = 0;
    retired.retiredOnTurn = 0;

    const action = dispatchOf(world, rival, deps);

    expect(action?.heroIds).toEqual(greedyParty(world, quest, heroes.slice(4), deps, 0));
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

// The `party-size` rejection is folded into `requirement-unmet` (DL-43 item 1): the staffing
// rule the Rivals and the harness's policy share is held to the one test `dispatch` applies (DL-44).
describe('staffing agrees with dispatch', () => {
  test('every Best Party meets unmetRequirements, size, Class and Skill alike', () => {
    let named = 0;
    for (const seed of ['agree-a']) {
      const { world, rival, deps } = scene(seed, testDeps({ rivalRosterMin: 6, rivalRosterMax: 8 }));
      const available = availableHeroes(world, rival);
      const shapes = [
        {},
        { classKey: 'healer' },
        { skillKey: 'lockpicking' },
        { classKey: 'warrior', skillKey: 'tactics' },
      ];
      for (const quest of boardQuests(world)) {
        for (const min of [1, 2, 3]) {
          for (const shape of shapes) {
            const asked = { ...quest, requirements: { partySizeMin: min, ...shape } };
            const heroIds = bestParties(world, rival, deps).party(asked, available)?.heroIds ?? null;
            expect(heroIds, `${seed} ${quest.id} ${min}`).toEqual(greedyParty(world, asked, available, deps, rowOf(rival, deps).partyMargin));
            if (heroIds === null) continue;
            named += 1;
            expect(unmetRequirements(asked, heroIds.map((id) => heroOf(world, id))), `${seed} ${quest.id} ${min}`).toEqual([]);
          }
        }
      }
    }
    expect(named).toBeGreaterThan(20);
  });

  // DL-157: the stops search the Board with the Best Party's first step, which asks no estimate.
  test('staffableQuests names exactly the Quests for which the Best Party is one dispatch would send', () => {
    for (const seed of ['agree-a', 'agree-b', 'agree-c']) {
      const { world, rival, deps } = scene(seed, testDeps({ rivalRosterMin: 6, rivalRosterMax: 8 }));
      const quests = boardQuests(world);
      quests.forEach((quest, index) => {
        quest.requirements = [{ partySizeMin: 1 }, { partySizeMin: 9 }, { partySizeMin: 1, classKey: 'healer' }][index % 3] as Quest['requirements'];
      });
      const available = availableHeroes(world, rival);
      const byBestParty = quests.filter((quest) => {
        const heroIds = bestParties(world, rival, deps).party(quest, available)?.heroIds ?? null;
        return heroIds !== null && dispatchRefusal(world, { guildId: rival.id, questId: quest.id, heroIds }, deps) === null;
      });

      expect(staffableQuests(world, rival, deps).map((quest) => quest.id), seed).toEqual(byBestParty.map((quest) => quest.id));
    }
  });
});

// The rest band (DL-280 item 5, Q4 a; DL-286): a Rival chooses its Quest and its Party from its pool,
// its free Heroes less those its Disposition's rest band keeps home, so it never picks a Quest it
// then cannot staff.
describe('the rest band: a Rival chooses from its pool', () => {
  const restDeps = (restBand: Disposition['restBand']): EngineDeps =>
    testDeps(
      { rivalRosterMin: 6, rivalRosterMax: 6, fatigueBands: { fresh: 0, weary: 25, tired: 50, exhausted: 75 } },
      withDispositions({ restBand, partyMargin: 1 }),
    );

  test('passes over a Quest only the Heroes it keeps home could staff, and sends none of them', () => {
    const { world, rival, deps } = scene('rest-pass-over', restDeps('tired'));
    // The easiest Quest, steady's, needs four; the rest one.
    const [easiest, ...rest] = openBoard(world, [10, 50, 60, 70, 80, 90], 1) as [Quest, ...Quest[]];
    easiest.requirements = { partySizeMin: 4 };
    const heroes = byId(availableHeroes(world, rival));
    expect(heroes).toHaveLength(6);
    // Three rested, three tired or worse.
    heroes.forEach((hero, index) => (hero.fatigue = [0, 49, 50, 10, 75, 100][index] as number));

    // Free, the six could staff the easiest; its pool of three cannot.
    expect(requiredParty(easiest, heroes)).not.toBeNull();
    expect(partyPool(world, rival, deps).map((hero) => hero.fatigue)).toEqual([0, 49, 10]);
    const action = dispatchOf(world, rival, deps);
    expect(action?.questId).toBe(rest[0]?.id);
    for (const heroId of action?.heroIds ?? []) expect(heroOf(world, heroId).fatigue, heroId).toBeLessThan(50);
    expect(staffableQuests(world, rival, deps).map((quest) => quest.id)).toEqual(rest.map((quest) => quest.id));

    // With no rest band it takes the easiest, as before.
    const { world: free, rival: freeRival, deps: freeDeps } = scene('rest-pass-over', restDeps(null));
    openBoard(free, [10, 50, 60, 70, 80, 90], 1)[0]!.requirements = { partySizeMin: 4 };
    byId(availableHeroes(free, freeRival)).forEach((hero, index) => (hero.fatigue = [0, 49, 50, 10, 75, 100][index] as number));
    expect(dispatchOf(free, freeRival, freeDeps)?.questId).toBe(easiest.id);
  });

  test('sends no one, and can staff nothing, when its rest band keeps every free Hero home', () => {
    const { world, rival, deps } = scene('rest-all-home', restDeps('weary'));
    openBoard(world, [10, 50, 60, 70, 80, 90], 1);
    for (const hero of availableHeroes(world, rival)) hero.fatigue = 25;

    expect(partyPool(world, rival, deps)).toEqual([]);
    expect(dispatchOf(world, rival, deps)).toBeUndefined();
    expect(staffableQuests(world, rival, deps)).toEqual([]);
  });

  test('never picks a Quest it cannot staff from its pool, whatever its Disposition and its Heroes’ Fatigue', () => {
    let dispatched = 0;
    for (const disposition of ['steady', 'ambitious', 'miserly', 'reckless'] as const) {
      for (const restBand of [null, 'weary', 'tired', 'exhausted'] as const) {
        for (const seed of ['a', 'b', 'c']) {
          const { world, rival, deps } = scene(`rest-any-${seed}`, restDeps(restBand), disposition);
          const quests = openBoard(world, [10, 30, 50, 70, 90, 95], 1);
          quests.forEach((quest, index) => (quest.requirements = { partySizeMin: 1 + (index % 4) }));
          // Fatigues spread over the scale, differently for each seed.
          availableHeroes(world, rival).forEach((hero, index) => (hero.fatigue = (index * 37 + seed.charCodeAt(0) * 11) % 101));
          const pool = partyPool(world, rival, deps);

          const action = dispatchOf(world, rival, deps);

          const where = `${disposition} ${restBand} ${seed}`;
          if (action === undefined) {
            expect(staffableQuests(world, rival, deps), where).toEqual([]);
            continue;
          }
          dispatched += 1;
          const quest = world.quests[action.questId] as Quest;
          expect(requiredParty(quest, pool), where).not.toBeNull();
          for (const heroId of action.heroIds) expect(pool.map((hero) => hero.id), where).toContain(heroId);
          expect(dispatchRefusal(world, action, deps), where).toBeNull();
        }
      }
    }
    expect(dispatched).toBeGreaterThan(20);
  });
});

describe('steady: recruiting', () => {
  // Ten Upkeeps, so that Wealth just above the threshold covers any signing fee; and no building,
  // which `steady` chooses first once its Wealth is three times the infirmary's cost. Both
  // on the row (DL-56). Negotiation still too: the fees are compared at the list price.
  // Transfers stilled too (DL-57): a Rival that would hire weighs a Transfer before a recruit;
  // and gear, which it buys before it hires (DL-58).
  const noBuilding = { buildThreshold: 1_000_000, gearThreshold: 1_000_000, transferAppetite: 0 };
  const still = { negotiationRange: 0 };
  const deps = testDeps(still, withDispositions({ recruitThreshold: 10, ...noBuilding }));

  /** The Hero in the pool with the lowest fee, lowest id among equals. */
  function cheapest(world: World): Hero {
    const [hero] = [...unattachedHeroes(world)].sort(
      (a, b) => signingFee(a, deps) - signingFee(b, deps) || compareByCodeUnit(a.id, b.id),
    );
    if (hero === undefined) throw new Error('The pool is empty');
    return hero;
  }

  const recruits = (world: World, guild: Guild) => rivalChoices(world, guild, deps).filter((action) => action.kind === 'recruit');

  test("recruits the cheapest Unattached Hero only while Wealth exceeds its row's recruitThreshold of Upkeeps", () => {
    const { world, rival } = scene('threshold', deps);
    const threshold = rowOf(rival, deps).recruitThreshold * upkeep(rival, world, deps.config, deps.content);
    expect(threshold).toBeGreaterThan(0);

    rival.wealth = threshold;
    expect(recruits(world, rival)).toEqual([]);

    rival.wealth = threshold + 1;
    expect(recruits(world, rival)).toEqual([{ kind: 'recruit', guildId: rival.id, heroId: cheapest(world).id, years: rowOf(rival, deps).contractYears }]);
  });

  test('breaks a tie of fees by the lower Hero id', () => {
    const { world, rival } = scene('fee-tie', deps);
    rival.wealth = 100_000;
    const pool = unattachedHeroes(world);
    const [lowestId] = pool;
    // Every Hero in the pool alike: the same Stats and Level, so the same fee.
    for (const hero of pool) hero.stats = { ...lowestId?.stats };

    expect(recruits(world, rival)).toEqual([{ kind: 'recruit', guildId: rival.id, heroId: lowestId?.id, years: rowOf(rival, deps).contractYears }]);
  });

  test("passes over a Hero who would refuse its Fame for the cheapest who would sign, and asks no one when none would", () => {
    const gated = testDeps({ fameRequiredPerLevel: 10, ...still }, withDispositions({ recruitThreshold: 10, ...noBuilding }));
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
    expect(hires()).toEqual([{ kind: 'recruit', guildId: rival.id, heroId: first.id, years: rowOf(rival, deps).contractYears }]);

    rival.fame = 0;
    for (const hero of unattachedHeroes(world)) hero.level = 3;
    expect(hires()).toEqual([]);
  });

  test('recruits no one it cannot pay for, and no one from an empty pool', () => {
    const noThreshold = testDeps(still, withDispositions({ recruitThreshold: 0, gearThreshold: 1_000_000 }));
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

describe('a Rival whose Roster is below rivalRosterMin hires by need (DL-60)', () => {
  // A threshold out of any Rival's reach, so that only the need hires; Negotiation, building, gear and
  // Transfers stilled, as for `steady`'s recruiting above; an empty Board, so that no Rival dispatches.
  const pins = { negotiationRange: 0, rivalRosterMin: 4, rivalHireReserveUpkeeps: 3 };
  const unreachable = { recruitThreshold: 1_000_000, buildThreshold: 1_000_000, gearThreshold: 1_000_000, transferAppetite: 0 };
  const deps = testDeps(pins, withDispositions(unreachable));

  /** `rival`'s Roster cut to its first `size` Heroes, the others dead (off the Roster, out of the pool). */
  function cut(world: World, rival: Guild, size: number): void {
    for (const heroId of rival.rosterIds.splice(size)) Object.assign(heroOf(world, heroId), { diedOnTurn: world.turn, contract: null });
  }

  /** The fee of the cheapest Hero in the pool, and what `rival` must hold to hire them by need: the fee and its reserve. */
  function needed(world: World, rival: Guild, with_: EngineDeps): { heroId: HeroId; wealth: number } {
    const [hero] = [...unattachedHeroes(world)].sort((a, b) => signingFee(a, with_) - signingFee(b, with_) || compareByCodeUnit(a.id, b.id));
    if (hero === undefined) throw new Error('The pool is empty');
    const reserve = with_.config.rivalHireReserveUpkeeps * upkeep(rival, world, with_.config, with_.content);
    return { heroId: hero.id, wealth: signingFee(hero, with_) + reserve };
  }

  test('below it, recruits the cheapest who would sign while its Wealth covers the fee with rivalHireReserveUpkeeps Upkeeps to spare', () => {
    const { world, rival } = scene('need', deps);
    world.board = [];
    cut(world, rival, 3);
    const { heroId, wealth } = needed(world, rival, deps);
    expect(wealth).toBeLessThan(rowOf(rival, deps).recruitThreshold * upkeep(rival, world, deps.config, deps.content));

    rival.wealth = wealth - 1;
    expect(rivalChoices(world, rival, deps)).toEqual([]);
    rival.wealth = wealth;
    expect(rivalChoices(world, rival, deps)).toEqual([{ kind: 'recruit', guildId: rival.id, heroId, years: rowOf(rival, deps).contractYears }]);
  });

  test('in play, a Rival of every Disposition cut to two Heroes recruits back to rivalRosterMin within ten Days, under its own row', () => {
    // The rows as content has them (the test content's are the core's, DL-56), with a Wealth under every
    // one's threshold: only the need hires. Every Hall built to its top, so that none spends the Wealth
    // on a build first (DL-58's order); harmless Encounters, so that no Hero is lost meanwhile.
    const rows = testDeps({ negotiationRange: 0, marketSize: 0, rivalRosterMin: 4, rivalHireReserveUpkeeps: 1 }, harmlessContent);
    const top = Object.fromEntries(Object.keys(rows.content.facilities).map((key) => [key, Math.max(...Object.values(rows.content.improvements).filter((row) => row.facility === key).map((row) => row.grade))]));
    let document = createWorld('need-play', setup, rows).document;
    for (const rival of rivalsOf(document.world)) {
      cut(document.world, rival, 2);
      rival.hall = { ...rival.hall, ...top };
      rival.wealth = 1_000;
      expect(rival.wealth, dispositionOf(rival) ?? '').toBeLessThan(rowOf(rival, rows).recruitThreshold * upkeep(rival, document.world, rows.config, rows.content));
    }
    document = withValid(document, rows);
    const recruited = new Map<string, number>();
    while (document.world.turn < 30) {
      const result = advance(document, rows);
      document = withValid(result.document, rows);
      for (const event of result.events) {
        if (event.type === 'hero.recruited') recruited.set(event.payload.guildId, (recruited.get(event.payload.guildId) ?? 0) + 1);
      }
    }

    for (const rival of rivalsOf(document.world)) {
      const disposition = dispositionOf(rival) ?? '';
      expect(recruited.get(rival.id) ?? 0, disposition).toBeGreaterThan(0);
      expect(rival.rosterIds.length, disposition).toBeGreaterThanOrEqual(4);
    }
  });

  test('at rivalRosterMin, hires only by its threshold, however rich', () => {
    const { world, rival } = scene('need-met', deps);
    world.board = [];
    cut(world, rival, 4);
    rival.wealth = 100_000;

    expect(rivalChoices(world, rival, deps)).toEqual([]);
    cut(world, rival, 3);
    expect(rivalChoices(world, rival, deps).map((action) => action.kind)).toEqual(['recruit']);
  });

  test('every Disposition hires by need alike: one rule, whatever the row', () => {
    for (const disposition of ['ambitious', 'miserly', 'reckless', 'steady']) {
      const { world, rival } = scene(`need-${disposition}`, deps, disposition);
      world.board = [];
      cut(world, rival, 2);
      const { heroId, wealth } = needed(world, rival, deps);
      rival.wealth = wealth;

      expect(rivalChoices(world, rival, deps), disposition).toEqual([{ kind: 'recruit', guildId: rival.id, heroId, years: rowOf(rival, deps).contractYears }]);
    }
  });

  test('takes a Hero in by Transfer by need too: it consents to a transferOut to it below rivalRosterMin, and not at it', () => {
    const dealing = testDeps(pins, withDispositions({ ...unreachable, transferAppetite: 1 }));
    const document = createWorld('need-transfer', setup, dealing).document;
    const { world } = document;
    const [rival] = rivalsOf(world);
    const player = playerGuild(world);
    if (rival === undefined || player === undefined) throw new Error('No Rival or player');
    rival.wealth = 10_000;
    const [heroId] = player.rosterIds as [HeroId];
    const send = () => applyTransferOut(structuredClone(world), { guildId: player.id, heroId, toGuildId: rival.id }, dealing);

    cut(world, rival, 4);
    expect(send()).toMatchObject({ ok: false, rejection: { reason: 'transfer-refused', side: 'in', because: 'wealth' } });
    cut(world, rival, 3);
    expect(send()).toMatchObject({ ok: true });
  });

  test('seeks a Transfer by need with no more than it would spend: never the Hero whose fee would eat its reserve', () => {
    const dealing = testDeps(pins, withDispositions({ ...unreachable, transferAppetite: 1 }));
    const { world, rival } = scene('need-budget', dealing);
    world.board = [];
    cut(world, rival, 3);
    const reserve = dealing.config.rivalHireReserveUpkeeps * upkeep(rival, world, dealing.config, dealing.content);
    const other = rivalsOf(world).find((guild) => guild.id !== rival.id) as Guild;
    const [dearest] = other.rosterIds as [HeroId];
    // The dearest by the wages left on a long Contract, which the fee reads, not the Stats (DL-318).
    heroOf(world, dearest).contract = { ...(heroOf(world, dearest).contract as Contract), wage: 100, endDay: 1_080 };
    const fee = transferFee(heroOf(world, dearest), guildmasterOf(rival, world), world.turn, dealing);
    expect(Math.max(...other.rosterIds.map((id) => transferFee(heroOf(world, id), guildmasterOf(rival, world), world.turn, dealing)))).toBe(fee);
    // Enough for the dearest Hero's fee, but not with the reserve kept.
    rival.wealth = fee + reserve - 1;

    const [choice] = rivalChoices(world, rival, dealing) as [Extract<GuildAction, { heroId: HeroId }>];

    expect(choice.heroId).not.toBe(dearest);
    expect(applyGuildAction(world, choice, dealing)).toMatchObject({ ok: true });
    expect(rival.wealth).toBeGreaterThanOrEqual(reserve);
  });
});

describe('steady: building', () => {
  // Pinned: three times the cost, and a recruit threshold low enough that recruiting is on offer;
  // Transfers stilled, which a Rival that would hire weighs before a recruit (DL-57); and gear,
  // which it buys after it builds and before it hires (DL-58).
  const deps = testDeps({}, withDispositions({ buildThreshold: 3, recruitThreshold: 1, gearThreshold: 1_000_000, transferAppetite: 0 }));
  const purchases = (world: World, guild: Guild) => rivalChoices(world, guild, deps).filter((action) => action.kind !== 'dispatch');

  test("builds the infirmary's next grade, in place of a recruit, only while Wealth exceeds three times its cost", () => {
    const { world, rival } = scene('build-threshold', deps);

    rival.wealth = 3 * 200;
    expect(purchases(world, rival)).toEqual([expect.objectContaining({ kind: 'recruit' })]);
    rival.wealth = 3 * 200 + 1;
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'infirmary' }]);

    // The next grade costs 500; the other facilities built to their top, so that the infirmary is the
    // only one with a grade to build (DL-58: it builds every facility, the next test).
    rival.hall = { infirmary: 1, 'training-yard': 3, quarters: 3 };
    rival.wealth = 3 * 500;
    expect(purchases(world, rival)).toEqual([expect.objectContaining({ kind: 'recruit' })]);
    rival.wealth = 3 * 500 + 1;
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'infirmary' }]);
  });

  // DL-58: a Rival builds every facility of its Hall, not the infirmary alone.
  test('builds the next facility in the Hall’s order once the infirmary is at its top grade, and nothing once all are', () => {
    const { world, rival } = scene('build-top', deps);
    rival.wealth = 1_000_000;

    rival.hall = { infirmary: 3, 'training-yard': 0, quarters: 0 };
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'training-yard' }]);
    rival.hall = { infirmary: 3, 'training-yard': 3, quarters: 1 };
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'quarters' }]);
    rival.hall = { infirmary: 3, 'training-yard': 3, quarters: 3 };
    expect(purchases(world, rival).map((action) => action.kind)).toEqual(['recruit']);
  });

  test("a dearer grade out of its reach gives way to a cheaper grade of the next facility, each at its own threshold", () => {
    const { world, rival } = scene('build-next', deps);
    rival.hall = { infirmary: 1, 'training-yard': 0, quarters: 0 }; // the infirmary's next grade costs 500

    rival.wealth = 3 * 200;
    expect(purchases(world, rival)).toEqual([expect.objectContaining({ kind: 'recruit' })]);
    rival.wealth = 3 * 200 + 1; // below 3 × 500, above 3 × 200: the practice yard, not the infirmary ward
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'training-yard' }]);
    rival.wealth = 3 * 500 + 1;
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'infirmary' }]);
  });

  test('its builds are accepted by the rule, and climb the whole Hall afternoon by afternoon, facility by facility', () => {
    const { world, rival } = scene('build-climb', deps);
    rival.wealth = 100_000;
    const built: string[] = [];

    for (let afternoon = 0; afternoon < 9; afternoon += 1) {
      const [build] = purchases(world, rival);
      if (build?.kind !== 'build') throw new Error(`No build on afternoon ${afternoon}`);
      expect(applyGuildAction(world, build, deps)).toMatchObject({ ok: true });
      built.push(`${build.facility} ${rival.hall[build.facility]}`);
    }
    expect(built).toEqual([
      'infirmary 1', 'infirmary 2', 'infirmary 3',
      'training-yard 1', 'training-yard 2', 'training-yard 3',
      'quarters 1', 'quarters 2', 'quarters 3',
    ]);
    expect(rival.wealth).toBe(100_000 - 3 * 1700);
    expect(purchases(world, rival).map((action) => action.kind)).toEqual(['recruit']);
  });
});

describe('rivalChoices', () => {
  test('dispatches, then recruits, as Action values a front end would produce', () => {
    // Transfers stilled: a Rival that would hire weighs a Transfer before a recruit (DL-57);
    // and gear, which it buys before it hires (DL-58).
    const { world, rival, deps } = scene('both', testDeps({}, withDispositions({ transferAppetite: 0, gearThreshold: 1_000_000 })));
    rival.wealth = 100_000;
    rival.hall = { infirmary: 3, 'training-yard': 3, quarters: 3 }; // built to the top, so that its purchase is a recruit

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

  test('chooses nothing for a Disposition content does not define (rule 5), and the validator warns', () => {
    const { world, rival, deps } = scene('unknown');
    expect(rivalChoices(world, rival, deps)).not.toEqual([]);

    const others = Object.fromEntries(Object.entries(testContent.dispositions).filter(([key]) => key !== 'steady'));
    const withoutSteady: EngineDeps = { ...deps, content: { ...testContent, dispositions: others } };
    expect(rivalChoices(world, rival, withoutSteady)).toEqual([]);

    rival.controller = { kind: 'rival', disposition: 'no-such-disposition' };
    expect(rivalChoices(world, rival, deps)).toEqual([]);
  });

  test('changes nothing in the world but the rivals stream, which its dispatch advances by one draw', () => {
    const { world, rival, deps } = scene('pure');
    rival.wealth = 100_000;
    const expected = frozenButRivals(world);

    expect(rivalChoices(world, rival, deps).map((action) => action.kind)).toEqual(['dispatch', 'build']);
    expect(world).toEqual(expected);
  });
});

// DL-280 item 6, DL-287: a Rival names to an empty post its Hero highest in the captaincy Stat, first
// of all its choices and beside them, drawing nothing; a post held, or content marking no captaincy Stat,
// it names no one. The test content marks none, so these tests mark Leadership.
describe('a Rival names its Captain', () => {
  const captained = testDeps({}, withCaptaincy(withDispositions({ transferAppetite: 0, gearThreshold: 1_000_000 })));

  test('to an empty post, first, its Hero highest in the captaincy Stat, ties to the first in Roster order, drawing nothing', () => {
    const { world, rival, deps } = scene('rival-captain', captained);
    const heroes = rival.rosterIds.map((id) => heroOf(world, id));
    heroes.forEach((hero, at) => Object.assign(hero, { traits: [], stats: { ...hero.stats, leadership: at === 1 ? 18 : 6 } }));
    const held = structuredClone(world);
    const heldRival = held.guilds[rival.id] as Guild;
    heldRival.captainId = heroes[0]?.id ?? null;

    const choices = rivalChoices(world, rival, deps);
    expect(choices[0]).toEqual({ kind: 'nameCaptain', guildId: rival.id, heroId: heroes[1]?.id });
    // Beside its other choices, which are as they would be with the post held, and with the same draws.
    expect(choices.slice(1)).toEqual(rivalChoices(held, heldRival, deps));
    expect(world.rng).toEqual(held.rng);

    const tied = scene('rival-captain', captained);
    for (const id of tied.rival.rosterIds) Object.assign(heroOf(tied.world, id), { traits: [], stats: { ...heroOf(tied.world, id).stats, leadership: 12 } });
    expect(rivalChoices(tied.world, tied.rival, deps)[0]).toEqual({ kind: 'nameCaptain', guildId: tied.rival.id, heroId: tied.rival.rosterIds[0] });
  });

  test('none while its post is held, nor where content marks no captaincy Stat', () => {
    const { world, rival, deps } = scene('rival-captain-held', captained);
    rival.captainId = rival.rosterIds[0] ?? null;
    expect(rivalChoices(world, rival, deps).some((action) => action.kind === 'nameCaptain')).toBe(false);
    rival.captainId = null;
    expect(rivalChoices(world, rival, testDeps({}, withDispositions({ transferAppetite: 0, gearThreshold: 1_000_000 }))).some((action) => action.kind === 'nameCaptain')).toBe(false);
  });

  test('applied in the afternoon, the post filled with no cost and no lock; a Captain gone is replaced the next afternoon', () => {
    // A Rival that sells whatever it is asked (transferAppetite 1), so the player's Guild can take its Captain.
    const deps = testDeps({ rivalCount: 1 }, withCaptaincy(withDispositions({ transferAppetite: 1 })));
    let document = createWorld('rival-captain-play', setup, deps).document;
    const rivalId = (rivalsOf(document.world)[0] as Guild).id;
    const rivalOf = (it: WorldDocument): Guild => it.world.guilds[rivalId] as Guild;
    // The first afternoon, its first.
    for (let turn = 0; turn < 4 && rivalOf(document).captainId === null; turn += 1) document = withValid(advance(document, deps).document, deps);
    const first = rivalOf(document).captainId as HeroId;
    expect(first).not.toBeNull();
    const named = document.history.byType['guild.captain-named'] ?? [];
    expect(named).toHaveLength(1);
    expect(document.history.entries[named[0] as number]).toMatchObject({ payload: { guildId: rivalId, replacedId: null, lockedUntilTurn: null } });
    expect(rivalOf(document).captainChangedOnTurn).toBeNull();

    // The player's Guild takes the Rival's Captain once they are home: the post is empty, and filled the next afternoon, free.
    while ((document.world.heroes[first] as Hero).partyId !== null) document = withValid(advance(document, deps).document, deps);
    (playerGuild(document.world) as Guild).wealth = 1_000_000;
    const taken = applyAction(document, { kind: 'transferIn', guildId: (playerGuild(document.world) as Guild).id, heroId: first, years: 2 }, deps);
    if (!taken.ok) throw new Error(taken.rejection.reason);
    document = withValid(taken.document, deps);
    expect(rivalOf(document).captainId).toBeNull();
    for (let turn = 0; turn < 4 && rivalOf(document).captainId === null; turn += 1) document = withValid(advance(document, deps).document, deps);
    const again = (document.history.byType['guild.captain-named'] ?? []).map((at) => document.history.entries[at]);
    expect(again).toHaveLength(2);
    expect(again[1]).toMatchObject({ payload: { guildId: rivalId, replacedId: null, lockedUntilTurn: null } });
    expect(rivalOf(document).captainId).not.toBe(first);
  });
});

// ── One rule, reading each Disposition's row (INPUTS 7.5, DL-56) ─────────────────────────

describe('one rule for every Disposition, reading its row', () => {
  // Six Quests every Rival can staff, at six difficulties: ranked, 25 30 40 55 60 90.
  const difficulties = [60, 40, 25, 90, 30, 55];
  const ranked = [...difficulties].sort((a, b) => a - b);

  test("each Disposition takes the Quest at its questRiskAppetite's place among those it can staff, by difficulty", () => {
    const deps = testDeps();
    const { world } = createWorld('appetite', setup, deps).document;
    openBoard(world, difficulties);
    const taken: Record<string, number | undefined> = {};

    for (const rival of rivalsOf(world)) {
      const questId = dispatchOf(world, rival, deps)?.questId;
      taken[dispositionOf(rival) ?? ''] = questId === undefined ? undefined : world.quests[questId]?.difficulty;
      const place = Math.round(rowOf(rival, deps).questRiskAppetite * (ranked.length - 1));
      expect(taken[dispositionOf(rival) ?? ''], dispositionOf(rival) ?? '').toBe(ranked[place]);
    }
    // steady 0: the easiest; miserly 0.25: the second; ambitious 0.6: the fourth; reckless 1: the hardest.
    expect(taken).toEqual({ steady: 25, miserly: 30, ambitious: 55, reckless: 90 });
  });

  test('ranks only the Quests it can staff: reckless takes the hardest it can staff, not the hardest on the Board', () => {
    const { world, rival, deps } = scene('staffable-hardest', testDeps(), 'reckless');
    const quests = openBoard(world, difficulties);
    const size = availableHeroes(world, rival).length + 1;
    // The two hardest ask for more Heroes than it has.
    for (const quest of quests.filter((it) => it.difficulty >= 60)) quest.requirements = { partySizeMin: size };

    expect(takenDifficulty(world, rival, deps)).toBe(55);
  });

  test("each Disposition recruits above its row's recruitThreshold of Upkeeps and builds above its buildThreshold times the cost", () => {
    // Transfers stilled: a Rival that would hire weighs a Transfer before a recruit (DL-57);
    // gear too, which it buys before it hires (DL-58: its gearThreshold's own test is below).
    const deps = testDeps({ negotiationRange: 0 }, withDispositions({ transferAppetite: 0, gearThreshold: 1_000_000 }));
    for (const disposition of ['ambitious', 'miserly', 'reckless', 'steady']) {
      const { world, rival } = scene(`thresholds-${disposition}`, deps, disposition);
      const row = rowOf(rival, deps);
      const purchase = () => rivalChoices(world, rival, deps).find((action) => action.kind !== 'dispatch' && action.kind !== 'equip');

      // Building: the infirmary's first grade costs 200.
      rival.wealth = row.buildThreshold * 200;
      expect(purchase()?.kind, disposition).not.toBe('build');
      rival.wealth = row.buildThreshold * 200 + 1;
      expect(purchase(), disposition).toEqual({ kind: 'build', guildId: rival.id, facility: 'infirmary' });

      // Recruiting, with the Hall built to its top (a Rival builds every facility, DL-58).
      rival.hall = { infirmary: 3, 'training-yard': 3, quarters: 3 };
      const threshold = row.recruitThreshold * upkeep(rival, world, deps.config, deps.content);
      rival.wealth = threshold;
      expect(purchase(), disposition).toBeUndefined();
      rival.wealth = threshold + 1;
      expect(purchase(), disposition).toMatchObject({ kind: 'recruit', guildId: rival.id });
    }
    // The rows differ where the story says they should: ambitious builds soonest (DL-56).
    const rows = Object.values(testContent.dispositions);
    expect(Math.min(...rows.map((row) => row.buildThreshold))).toBe(testContent.dispositions['ambitious']?.buildThreshold);
  });

  // The second acceptance box: a fifth Disposition is a row, and plays with no code change.
  describe('a fifth Disposition, added to the content with weights of its own', () => {
    const cautious: Disposition = {
      key: 'cautious',
      name: 'Cautious',
      questRiskAppetite: 0.75,
      recruitThreshold: 7,
      buildThreshold: 2.5,
      gearThreshold: 4,
      transferAppetite: 0.3,
      partyMargin: 0.2,
      restBand: 'weary',
      contractYears: 2,
    };
    const withFifth = (row: Disposition = cautious): ContentSet =>
      deepFreeze({ ...testContent, dispositions: { ...testContent.dispositions, [row.key]: row } });
    const deps = testDeps({ rivalCount: 5, negotiationRange: 0 }, withFifth());

    function created(seed: string, with5 = deps): WorldDocument {
      return withValid(createWorld(seed, setup, with5).document, with5);
    }

    test('is dealt to a Rival round-robin, and the validator knows it', () => {
      const document = created('fifth-dealt');

      expect(rivalsOf(document.world).map(dispositionOf)).toEqual(['ambitious', 'cautious', 'miserly', 'reckless', 'steady']);
    });

    test("chooses by its own weights: the Quest at its appetite's place, and its thresholds exactly", () => {
      const { world } = created('fifth-weights');
      const [rival] = rivalsOf(world).filter((guild) => dispositionOf(guild) === 'cautious') as [Guild];
      openBoard(world, difficulties);

      // 0.75 of the way along six: the fifth, 60; no other Disposition's place.
      expect(takenDifficulty(world, rival, deps)).toBe(60);

      // Transfers stilled for the purchase: a Rival that would hire weighs one first (DL-57);
      // gear too, which it buys before it hires (DL-58), until its own threshold is tried below.
      const still = testDeps(
        { rivalCount: 5, negotiationRange: 0 },
        withDispositions({ transferAppetite: 0, gearThreshold: 1_000_000 }, withFifth()),
      );
      const purchase = () => rivalChoices(world, rival, still).find((action) => action.kind === 'build' || action.kind === 'recruit');
      rival.wealth = 2.5 * 200;
      expect(purchase()?.kind).not.toBe('build');
      rival.wealth = 2.5 * 200 + 1;
      expect(purchase()).toEqual({ kind: 'build', guildId: rival.id, facility: 'infirmary' });
      rival.hall = { infirmary: 3, 'training-yard': 3, quarters: 3 };
      const threshold = 7 * upkeep(rival, world, deps.config, deps.content);
      rival.wealth = threshold;
      expect(purchase()).toBeUndefined();
      rival.wealth = threshold + 1;
      expect(purchase()).toMatchObject({ kind: 'recruit', guildId: rival.id });

      // Its gearThreshold, 4, read as every row's is: armour at four times its price, and no
      // more, with nothing else to buy. A Market of padded jacks alone; it would not hire.
      const gearing = testDeps({ rivalCount: 5, negotiationRange: 0 }, withDispositions({ transferAppetite: 0, recruitThreshold: 1_000_000 }, withFifth()));
      stockMarket(world, [['padded-jack', 5]]);
      const buys = () => rivalChoices(world, rival, gearing).filter((action) => action.kind === 'buy');
      rival.wealth = 4 * 40;
      expect(buys()).toEqual([]);
      rival.wealth = 4 * 40 + 1;
      expect(buys()).toEqual([{ kind: 'buy', guildId: rival.id, definitionKey: 'padded-jack', quantity: 1 }]);

      // Other weights in the same row, other choices: the row is what decides.
      const bolder = testDeps({ rivalCount: 5, negotiationRange: 0 }, withFifth({ ...cautious, questRiskAppetite: 1 }));
      expect(takenDifficulty(world, rival, bolder)).toBe(90);
    });

    test('plays ten Days beside the four, every document valid, taking Quests and making its purchases', () => {
      let document = created('fifth-plays');
      const cautiousId = rivalsOf(document.world).find((guild) => dispositionOf(guild) === 'cautious')?.id;
      const acts = new Set<string>();
      while (document.world.turn < 30) {
        const result = advance(document, deps);
        document = withValid(result.document, deps);
        for (const event of result.events) {
          if (['quest.taken', 'hero.recruited', 'guild.improved'].includes(event.type) && cautiousId !== undefined && event.participants.includes(cautiousId)) {
            acts.add(event.type);
          }
        }
      }

      expect(acts).toContain('quest.taken');
      expect(acts.has('hero.recruited') || acts.has('guild.improved')).toBe(true);
    });
  });
});

// ── Buying gear at the Market, armour first, by the row's gearThreshold (DL-58) ──────────

describe('buying gear at the Market', () => {
  /** Nothing else on offer: no hiring and no Transfer, Negotiation still. */
  const buying = (gearThreshold: number, config: Partial<EngineDeps['config']> = {}): EngineDeps =>
    testDeps(
      { negotiationRange: 0, ...config },
      withDispositions({ gearThreshold, recruitThreshold: 1_000_000, transferAppetite: 0 }),
    );
  const fullHall = { infirmary: 3, 'training-yard': 3, quarters: 3 } as const;

  /** A `disposition` Rival with its Hall built (nothing left to build first), rich, and the Market holding `stacks` alone. */
  function outfitting(
    seed: string,
    deps: EngineDeps,
    stacks: readonly (readonly [string, number])[],
    disposition: DispositionKey = 'steady',
  ): Scene {
    const found = scene(seed, deps, disposition);
    found.rival.hall = { ...fullHall };
    found.rival.wealth = 100_000;
    stockMarket(found.world, stacks);
    return found;
  }

  const buysOf = (world: World, guild: Guild, deps: EngineDeps) =>
    rivalChoices(world, guild, deps).filter((action) => action.kind === 'buy');

  test('buys armour first, the dearest the Market has, a piece for each Hero who lacks it; then weapons, then trinkets', () => {
    const deps = buying(3);
    const { world, rival } = outfitting('armour-first', deps, [
      ['lucky-charm', 20],
      ['masterwork-blade', 20],
      ['padded-jack', 20],
      ['plate-harness', 2],
      ['mail-shirt', 20],
    ]);
    const heroes = rival.rosterIds.length;
    expect(heroes).toBeGreaterThanOrEqual(3);
    const bought: string[] = [];

    for (let afternoon = 0; afternoon < 4 * heroes; afternoon += 1) {
      const [buy] = buysOf(world, rival, deps);
      if (buy === undefined) break;
      expect(applyGuildAction(world, buy, deps)).toMatchObject({ ok: true });
      bought.push(buy.definitionKey);
    }

    // The Market's two plate harnesses, then mail, the next dearest armour; a blade and a charm each;
    // then nothing, every Hero having a piece for every slot waiting in the holding.
    expect(bought).toEqual([
      'plate-harness',
      'plate-harness',
      ...Array<string>(heroes - 2).fill('mail-shirt'),
      ...Array<string>(heroes).fill('masterwork-blade'),
      ...Array<string>(heroes).fill('lucky-charm'),
    ]);
    expect(buysOf(world, rival, deps)).toEqual([]);
  });

  test("each Disposition buys only what its Wealth is above its row's gearThreshold times, the dearest such", () => {
    const deps = testDeps({ negotiationRange: 0 }, withDispositions({ recruitThreshold: 1_000_000, transferAppetite: 0 }));
    for (const disposition of ['ambitious', 'miserly', 'reckless', 'steady']) {
      const stacks = [['padded-jack', 5], ['mail-shirt', 5], ['plate-harness', 5]] as const;
      const { world, rival } = outfitting(`means-${disposition}`, deps, stacks, disposition);
      const { gearThreshold } = rowOf(rival, deps);
      const bought = () => buysOf(world, rival, deps).map((buy) => buy.definitionKey);

      rival.wealth = gearThreshold * 40;
      expect(bought(), disposition).toEqual([]);
      rival.wealth = gearThreshold * 40 + 1;
      expect(bought(), disposition).toEqual(['padded-jack']);
      rival.wealth = gearThreshold * 300;
      expect(bought(), disposition).toEqual(['mail-shirt']);
      rival.wealth = gearThreshold * 300 + 1;
      expect(bought(), disposition).toEqual(['plate-harness']);
    }
    // The rows differ (DL-56, DL-58): gear is dearest to miserly, cheapest to ambitious.
    const thresholds = Object.fromEntries(Object.values(testContent.dispositions).map((row) => [row.key, row.gearThreshold]));
    expect(thresholds).toEqual({ ambitious: 2, miserly: 10, reckless: 3, steady: 3 });
  });

  test('a slot the Market has nothing for within its means gives way to the next: no armour, then a weapon', () => {
    const deps = buying(3);
    const { world, rival } = outfitting('fall-through', deps, [['masterwork-blade', 5], ['short-sword', 5]]);
    const bought = () => buysOf(world, rival, deps).map((buy) => buy.definitionKey);

    expect(bought()).toEqual(['masterwork-blade']);
    rival.wealth = 3 * 300; // the blade out of reach
    expect(bought()).toEqual(['short-sword']);
    rival.wealth = 3 * 40;
    expect(bought()).toEqual([]);
  });

  test('buys for no Hero twice: a piece worn or held counts, and a Hero away with a Party still lacks one', () => {
    const deps = buying(3);
    const { world, rival } = outfitting('held', deps, [['padded-jack', 20]]);
    const [first, ...rest] = rival.rosterIds as [HeroId, ...HeroId[]];
    const bought = () => buysOf(world, rival, deps).map((buy) => buy.definitionKey);
    // Every Hero but the first wears armour: one piece to buy, the first's.
    for (const heroId of rest) addStack(world, 'mail-shirt', 1, { kind: 'hero', id: heroId, slot: 'armour' });
    expect(bought()).toEqual(['padded-jack']);

    // Away with a Party, the first still lacks it: equipped when home (DL-54).
    heroOf(world, first).partyId = 'party-000001' as Hero['partyId'];
    expect(bought()).toEqual(['padded-jack']);

    // A piece held for them is theirs: nothing more to buy, the Market having no weapon or trinket.
    addStack(world, 'padded-jack', 1, { kind: 'guild', id: rival.id });
    expect(bought()).toEqual([]);
  });

  test('buys nothing that is not gear', () => {
    const deps = buying(3);
    const { world, rival } = outfitting('not-gear', deps, [['plate-harness', 5]]);

    expect(buysOf(world, rival, deps).map((buy) => buy.definitionKey)).toEqual(['plate-harness']);
    stockMarket(world, [['whetstone', 5]]); // a consumable is not gear
    expect(buysOf(world, rival, deps)).toEqual([]);
  });

  test('buys after it builds and before it hires: build, then buy, then recruit', () => {
    const deps = testDeps(
      { negotiationRange: 0 },
      withDispositions({ buildThreshold: 3, gearThreshold: 3, recruitThreshold: 1, transferAppetite: 0 }),
    );
    const { world, rival } = scene('purchase-order', deps);
    rival.wealth = 100_000;
    stockMarket(world, [['padded-jack', 20]]);
    const purchase = () =>
      rivalChoices(world, rival, deps)
        .filter((action) => action.kind !== 'dispatch' && action.kind !== 'equip')
        .map((action) => action.kind);

    expect(purchase()).toEqual(['build']);
    rival.hall = { ...fullHall };
    expect(purchase()).toEqual(['buy']);
    addStack(world, 'padded-jack', rival.rosterIds.length, { kind: 'guild', id: rival.id }); // a jack held for every Hero
    expect(purchase()).toEqual(['recruit']);
  });

  test('changes nothing in the world but the rivals stream when it buys, which only its dispatch draws from', () => {
    const deps = buying(3);
    const { world, rival } = outfitting('pure-buy', deps, [['mail-shirt', 5]]);
    const expected = frozenButRivals(world);

    expect(rivalChoices(world, rival, deps).map((action) => action.kind)).toEqual(['dispatch', 'buy']);
    expect(world).toEqual(expected);
  });
});

// ── Heal Items: bought in the gear step after any wearable, carried on dispatch (DL-288) ──────

describe('heal Items: a Rival buys them in its gear step and carries them on dispatch', () => {
  /** No hiring, no building and no Transfer, so that the gear step is the afternoon's purchase. */
  const healing = (gearThreshold: number, config: Partial<EngineDeps['config']> = {}, content: ContentSet = testContent): EngineDeps =>
    testDeps(
      { negotiationRange: 0, ...config },
      withDispositions({ gearThreshold, buildThreshold: 1_000_000, recruitThreshold: 1_000_000, transferAppetite: 0 }, content),
    );
  /** A `disposition` Rival, rich, with the Market holding `stacks` alone. */
  function stocked(seed: string, deps: EngineDeps, stacks: readonly (readonly [string, number])[], disposition: DispositionKey = 'steady'): Scene {
    const found = scene(seed, deps, disposition);
    found.rival.wealth = 100_000;
    stockMarket(found.world, stacks);
    return found;
  }
  const buysOf = (world: World, guild: Guild, deps: EngineDeps): string[] =>
    rivalChoices(world, guild, deps).flatMap((action) => (action.kind === 'buy' ? [`${action.definitionKey}×${action.quantity}`] : []));
  const vaultOf = (guild: Guild) => ({ kind: 'guild', id: guild.id }) as const;

  test("each Disposition buys them only while its Wealth is above its row's gearThreshold times their cost: rivalHealItemStock of each, the draught first", () => {
    const deps = testDeps({ negotiationRange: 0 }, withDispositions({ buildThreshold: 1_000_000, recruitThreshold: 1_000_000, transferAppetite: 0 }));
    const stock = deps.config.rivalHealItemStock;
    expect(stock).toBeGreaterThan(0);
    for (const disposition of ['ambitious', 'miserly', 'reckless', 'steady'] as const) {
      const { world, rival } = stocked(`heal-means-${disposition}`, deps, [['healing-draught', 5], ['physicians-kit', 5]], disposition);
      const { gearThreshold } = rowOf(rival, deps);
      const bought = () => buysOf(world, rival, deps);

      rival.wealth = gearThreshold * 30 * stock;
      expect(bought(), disposition).toEqual([]);
      rival.wealth = gearThreshold * 30 * stock + 1;
      expect(bought(), disposition).toEqual([`healing-draught×${stock}`]);
      addStack(world, 'healing-draught', stock, vaultOf(rival));
      rival.wealth = gearThreshold * 70 * stock;
      expect(bought(), disposition).toEqual([]);
      rival.wealth = gearThreshold * 70 * stock + 1;
      expect(bought(), disposition).toEqual([`physicians-kit×${stock}`]);
      addStack(world, 'physicians-kit', stock, vaultOf(rival));
      expect(bought(), disposition).toEqual([]);
    }
  });

  test('keeps rivalHealItemStock of each, counting what its Parties carry; 0 keeps none', () => {
    const { world, rival } = stocked('heal-stock', healing(3), [['healing-draught', 5]]);
    expect(buysOf(world, rival, healing(3, { rivalHealItemStock: 3 }))).toEqual(['healing-draught×3']);
    expect(buysOf(world, rival, healing(3, { rivalHealItemStock: 0 }))).toEqual([]);
    const [heroId] = rival.rosterIds as [HeroId];
    const partyId = makeId('parties', 99);
    world.parties[partyId] = { id: partyId, questId: makeId('quests', 99), guildId: rival.id, heroIds: [heroId], departedOnTurn: 0, returnsOnTurn: 5, fatigueAtDispatch: { [heroId]: 0 } };
    addStack(world, 'healing-draught', 2, { kind: 'party', id: partyId });
    expect(buysOf(world, rival, healing(3, { rivalHealItemStock: 3 }))).toEqual(['healing-draught×1']);
  });

  test('buys no consumable but a heal Item', () => {
    const { world, rival } = stocked('heal-only', healing(3), [['whetstone', 5], ['grappling-line', 5], ['lockpicks', 5], ['blessed-candle', 5]]);
    expect(buysOf(world, rival, healing(3))).toEqual([]);
  });

  test('follows a wearable: the gear step buys a piece while a Hero lacks one it can afford, then heal Items', () => {
    const deps = healing(3);
    const { world, rival } = stocked('heal-after-gear', deps, [['padded-jack', 20], ['healing-draught', 5]]);
    const heroes = rival.rosterIds.length;
    const bought: string[] = [];
    for (let afternoon = 0; afternoon < heroes + 3; afternoon += 1) {
      const [buy] = rivalChoices(world, rival, deps).filter((action) => action.kind === 'buy');
      if (buy === undefined) break;
      expect(applyGuildAction(world, buy, deps)).toMatchObject({ ok: true });
      bought.push(`${buy.definitionKey}×${buy.quantity}`);
    }
    expect(bought).toEqual([...Array<string>(heroes).fill('padded-jack×1'), `healing-draught×${deps.config.rivalHealItemStock}`]);
  });

  test('one purchase an afternoon: a heal purchase takes the place of the recruit after it, which waits until it is stocked', () => {
    const deps = testDeps({ negotiationRange: 0 }, withDispositions({ buildThreshold: 1_000_000, gearThreshold: 3, recruitThreshold: 1, transferAppetite: 0 }));
    const { world, rival } = stocked('heal-then-recruit', deps, [['healing-draught', 5]]);
    const purchase = () =>
      rivalChoices(world, rival, deps)
        .filter((action) => !['dispatch', 'equip', 'nameCaptain'].includes(action.kind))
        .map((action) => action.kind);

    expect(purchase()).toEqual(['buy']);
    addStack(world, 'healing-draught', deps.config.rivalHealItemStock, vaultOf(rival));
    expect(purchase()).toEqual(['recruit']);
  });

  test('carries one of each heal Item it holds on its dispatch, and nothing else it holds', () => {
    const deps = healing(1_000_000);
    const { world, rival } = scene('heal-carry', deps);
    openBoard(world, [10, 20, 30]);
    expect(dispatchOf(world, rival, deps)).not.toHaveProperty('consumables');

    addStack(world, 'whetstone', 3, vaultOf(rival));
    addStack(world, 'physicians-kit', 1, vaultOf(rival));
    addStack(world, 'healing-draught', 2, vaultOf(rival));
    const dispatch = dispatchOf(world, rival, deps) as DispatchAction;
    expect(dispatch.consumables).toEqual([
      { definitionKey: 'healing-draught', quantity: 1 },
      { definitionKey: 'physicians-kit', quantity: 1 },
    ]);
    expect(dispatchRefusal(world, dispatch, deps)).toBeNull();
  });

  test('changes nothing in the world but the rivals stream when it buys and carries them, which only its dispatch draws from', () => {
    const deps = healing(3);
    const { world, rival } = stocked('heal-pure', deps, [['healing-draught', 5]]);
    addStack(world, 'physicians-kit', 1, vaultOf(rival));
    const expected = frozenButRivals(world);

    const choices = rivalChoices(world, rival, deps);
    expect(choices.map((action) => action.kind)).toEqual(['dispatch', 'buy']);
    expect(choices[0]).toHaveProperty('consumables', [{ definitionKey: 'physicians-kit', quantity: 1 }]);
    expect(world).toEqual(expected);
  });

  test("played: the heal Items its Party carries are spent at its Heroes' Injuries, and what is left comes home", () => {
    // Every Encounter, passed or failed, injures one Hero, and none dies: a Party meets an Injury on its first.
    const injury = { kind: 'injury', typeKey: 'broken-arm', chance: 1, count: 1 } as const;
    const deps = healing(1_000_000, { rivalCount: 1 }, withEncounters({ success: [injury], failure: [injury] }));
    let document = createWorld('heal-spent', setup, deps).document;
    const rival = rivalsOf(document.world)[0] as Guild;
    addStack(document.world, 'healing-draught', 2, vaultOf(rival));
    addStack(document.world, 'physicians-kit', 1, vaultOf(rival));

    const events: TurnEvent[] = [];
    const payloadOf = (event: TurnEvent | undefined) => (event?.payload ?? {}) as Record<string, unknown>;
    const ofRival = (type: string) => events.filter((event) => event.type === type && payloadOf(event)['guildId'] === rival.id);
    const firstQuest = () => payloadOf(ofRival('quest.taken')[0])['questId'];
    const home = () => ofRival('quest.resolved').some((event) => payloadOf(event)['questId'] === firstQuest());
    for (let turn = 0; turn < 300 && !home(); turn += 1) {
      const result = advance(document, deps);
      document = withValid(result.document, deps);
      events.push(...result.events);
    }
    expect(home()).toBe(true);

    expect(payloadOf(ofRival('quest.taken')[0])['consumables']).toEqual([
      { definitionKey: 'healing-draught', quantity: 1 },
      { definitionKey: 'physicians-kit', quantity: 1 },
    ]);
    const spent = ofRival('item.expended').map((event) => payloadOf(event) as { questId: string; effect: string; definitionKey: string; heroId: HeroId });
    // Its first Party's first Injury took the kit, healing most Days (DL-285); every use a heal, at an
    // Injury of one of the Rival's own Heroes.
    expect(spent.find((use) => use.questId === firstQuest())).toMatchObject({ effect: 'heal', definitionKey: 'physicians-kit' });
    for (const use of spent) expect(use.effect).toBe('heal');
    for (const use of spent) expect(document.world.guilds[rival.id]?.rosterIds).toContain(use.heroId);
    // What was not spent is the Guild's still, at home or carried by a Party away.
    const parties = Object.values(document.world.parties).filter((party) => party.guildId === rival.id);
    const holders = [vaultOf(rival), ...parties.map((party) => ({ kind: 'party', id: party.id }) as const)];
    const left = (key: string) =>
      holders.flatMap((holder) => holdings(document.world, holder).stacks).reduce((sum, stack) => sum + (stack.definitionKey === key ? stack.quantity : 0), 0);
    expect(left('healing-draught')).toBe(2 - spent.filter((use) => use.definitionKey === 'healing-draught').length);
    expect(left('physicians-kit')).toBe(0);
  });
});

// ── Surplus and debt (DL-301, Q18) ────────────────────────────────────────────────────────────

describe('surplus and debt (DL-301, Q18)', () => {
  const vaultOf = (guild: Guild) => ({ kind: 'guild', id: guild.id }) as const;
  test('sells surplus outside its purchase step', () => {
    const deps = testDeps({ rivalHealItemStock: 2 });
    const { world, rival } = scene('surplus-sale', deps);
    // Equip all heroes with weapon, armour, trinket:
    for (const heroId of rival.rosterIds) {
      addStack(world, 'short-sword', 1, { kind: 'hero', id: heroId, slot: 'weapon' });
      addStack(world, 'padded-jack', 1, { kind: 'hero', id: heroId, slot: 'armour' });
      addStack(world, 'lucky-charm', 1, { kind: 'hero', id: heroId, slot: 'trinket' });
    }
    // Add extra gear, non-heal consumable and loot-only item to vault:
    const sword = addStack(world, 'short-sword', 1, vaultOf(rival));
    const whetstone = addStack(world, 'whetstone', 2, vaultOf(rival));
    const blade = createItem(world, 'barrow-kings-blade', vaultOf(rival));

    const choices = rivalChoices(world, rival, deps);
    const sells = choices.filter((a) => a.kind === 'sell');
    expect(sells).toEqual([
      { kind: 'sell', guildId: rival.id, itemId: blade },
      { kind: 'sell', guildId: rival.id, stackId: sword, quantity: 1 },
      { kind: 'sell', guildId: rival.id, stackId: whetstone, quantity: 2 },
    ]);
  });

  test('a Rival in debt sells its holding first before transferring a Hero out', () => {
    const deps = testDeps({ rivalHealItemStock: 2 });
    const { world, rival } = scene('debt-holding-first', deps, 'ambitious');
    for (const other of rivalsOf(world)) {
      if (other.id !== rival.id) other.wealth = 100_000;
    }
    rival.wealth = -2000;
    rival.belowFloorSince = 0;

    // Put a piece of gear and a consumable in the holding:
    const blade = createItem(world, 'barrow-kings-blade', vaultOf(rival));
    const draughts = addStack(world, 'healing-draught', 2, vaultOf(rival));

    const choices = rivalChoices(world, rival, deps);
    // It sells the holding items, and DOES NOT transfer a hero out!
    expect(choices.filter((a) => a.kind === 'sell')).toEqual([
      { kind: 'sell', guildId: rival.id, itemId: blade },
      { kind: 'sell', guildId: rival.id, stackId: draughts, quantity: 2 },
    ]);
    expect(choices.some((a) => a.kind === 'transferOut')).toBe(false);

    // Apply the sales:
    for (const action of choices.filter((a) => a.kind === 'sell')) {
      expect(applyGuildAction(world, action, deps)).toMatchObject({ ok: true });
    }

    // Now the holding is empty of saleable items; next afternoon in debt, it transfers out:
    const nextChoices = rivalChoices(world, rival, deps);
    expect(nextChoices.some((a) => a.kind === 'transferOut')).toBe(true);
  });

  test('a loot-only Item its gear step puts on a bare Hero is kept, not sold, and every choice is accepted in order', () => {
    const deps = testDeps({ rivalHealItemStock: 2 });
    const { world, rival } = scene('surplus-equipped', deps);
    const blade = createItem(world, 'barrow-kings-blade', vaultOf(rival));

    const choices = rivalChoices(world, rival, deps);
    expect(choices).toContainEqual(expect.objectContaining({ kind: 'equip', itemId: blade }));
    expect(choices.filter((a) => a.kind === 'sell')).toEqual([]);
    for (const action of choices) expect(applyGuildAction(world, action, deps), action.kind).toMatchObject({ ok: true });
  });

  test('sells its surplus and still makes its one purchase the same afternoon', () => {
    const deps = testDeps({}, withDispositions({ buildThreshold: 3, recruitThreshold: 1, gearThreshold: 1_000_000, transferAppetite: 0 }));
    const { world, rival } = scene('surplus-and-purchase', deps);
    rival.wealth = 3 * 200 + 1;
    const whetstones = addStack(world, 'whetstone', 2, vaultOf(rival));

    const choices = rivalChoices(world, rival, deps).filter((action) => action.kind !== 'dispatch');
    expect(choices).toEqual([
      { kind: 'sell', guildId: rival.id, stackId: whetstones, quantity: 2 },
      { kind: 'build', guildId: rival.id, facility: 'infirmary' },
    ]);
  });
});
