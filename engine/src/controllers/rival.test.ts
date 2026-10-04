import { describe, expect, test, vi } from 'vitest';
import { dispatchRefusal, unmetRequirements, type DispatchAction } from '../actions/dispatch.js';
import { advance } from '../advance.js';
import type { EngineDeps } from '../config.js';
import type { ContentSet, Disposition, DispositionKey } from '../content-types.js';
import { createWorld } from '../create.js';
import { compareByCodeUnit, facilityKeys, type Guild, type Hero, type HeroId, type Quest, type QuestId, type World, type WorldDocument } from '../document.js';
import { addStack, holdings } from '../items.js';
import { marketHolder } from '../market.js';
import { createStreams, next } from '../rng.js';
import { dispositionOf, playerGuild, signingFee, transferFee, unattachedHeroes, upkeep } from '../selectors.js';
import { guildmasterOf } from '../guildmaster.js';
import { applyTransferOut } from '../actions/transfer.js';
import { deepFreeze, harmlessContent, testContent, testDeps, withDispositions, withValid } from '../world.test-support.js';
import { applyGuildAction, type GuildAction } from '../actions/action.js';
import { availableHeroes, bestParty, partyFor, rivalChoices, staffableQuests } from './rival.js';
import { estimateQuest } from '../quest-engine/estimate.js';

// v1.1.5-S6 (DL-175): a test may name the chance of success by the size of the Party, in place of
// the estimate, to set a gain exactly; none set, `questEstimator` is the real one.
const chances = vi.hoisted(() => ({ bySize: null as ((size: number) => number) | null }));
vi.mock('../quest-engine/estimate.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../quest-engine/estimate.js')>();
  return {
    ...real,
    questEstimator: (...args: Parameters<typeof real.questEstimator>) => {
      const estimate = real.questEstimator(...args);
      return (heroes: Parameters<typeof estimate>[0], carried?: Parameters<typeof estimate>[1]) => {
        if (chances.bySize === null) return estimate(heroes, carried);
        const success = chances.bySize(heroes.length);
        return { success, bands: { strong: success } } as unknown as ReturnType<typeof estimate>;
      };
    },
  };
});

// M2-S9: the Rivals' choices (INPUTS 4.12, DL-30), read off a world, which they change only by the
// draws they take from `rivals`; from M6-S1 one rule reading each Disposition's weights (INPUTS 7.5,
// DL-56). `steady` keeps DL-30's choices, so its tests stand as they were. The phase that applies
// them is phases/rival-controllers.test.ts.

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

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

/** The difficulty of the Quest `guild` dispatches to, or `undefined` when it sends no one. */
function takenDifficulty(world: World, guild: Guild, deps: EngineDeps): number | undefined {
  const questId = dispatchOf(world, guild, deps)?.questId;
  return questId === undefined ? undefined : world.quests[questId]?.difficulty;
}

/** Empties the Market of every stack and Item and stocks it with `stacks` alone (M6-S4's tests). */
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
 * estimate for every Party weighed (v1.1.4-S6): the Heroes the requirements take, each the one who
 * most raises the chance of success; then the one who most raises it up to `partySizeMin`; then the
 * one who most raises it while it raises it by more than `margin`, up to `partySizeMax`. Ties go to
 * the better chance of a strong success, then the lower Hero id.
 */
function greedyParty(world: World, quest: Quest, available: readonly Hero[], deps: EngineDeps, margin: number): HeroId[] | null {
  const { partySizeMin, partySizeMax, classKey, skillKey } = quest.requirements;
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
  if (size > partySizeMax || size > available.length) return null;
  if (places === 1) party.push(pick(available.filter((hero) => ofClass(hero) && withSkill(hero))).hero);
  if (places === 2) {
    const first = pick(available.filter((hero) => ofClass(hero) || withSkill(hero))).hero;
    party.push(first, pick(available.filter(ofClass(first) ? withSkill : ofClass)).hero);
  }
  while (party.length < partySizeMin) party.push(pick(rest()).hero);
  let chance = chanceOf(world, quest, party, deps)[0];
  while (party.length < partySizeMax && rest().length > 0) {
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

  // M6-S1 (DL-56): a tie the weights leave is broken by a draw from `rivals`, where DL-30 took the
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

// v1.1.4-S6 (DL-148 item 17): a Rival chooses its Party by the chance estimate, the greedy rule
// `partyFor` states, where M2-S9 sent the fewest the Quest allowed, strongest for its demands first.
describe('which Heroes: the greedy rule by the chance estimate (v1.1.4-S6)', () => {
  const margins = [0, 0.02, 0.05, 0.1, 0.3, 1];

  test('each Disposition, at each margin set in its row, sends the Party the greedy rule names', () => {
    const sizes = new Map<number, number[]>();
    for (const disposition of ['ambitious', 'miserly', 'reckless', 'steady']) {
      for (const partyMargin of margins) {
        const { world, rival, deps } = scene(`greedy-${disposition}`, testDeps({}, withDispositions({ partyMargin })), disposition);
        openBoard(world, [70, 75, 80, 85, 90, 95], [1, 4]);
        expect(rowOf(rival, deps).partyMargin).toBe(partyMargin);

        const action = dispatchOf(world, rival, deps);
        const quest = world.quests[action?.questId as QuestId] as Quest;

        const expected = greedyParty(world, quest, availableHeroes(world, rival), deps, partyMargin);
        expect(action?.heroIds, `${disposition} at ${partyMargin}`).toEqual(expected);
        sizes.set(partyMargin, [...(sizes.get(partyMargin) ?? []), expected?.length ?? 0]);
      }
    }
    // The margin decides how many go: at 0 each Hero who raises the chance at all, at 1 the fewest.
    expect(sizes.get(1)).toEqual([1, 1, 1, 1]);
    // (v1.1.5-S6: a Party already sure of the Quest gains nothing from a Hero, so it is not always more than one.)
    expect(sizes.get(0)?.some((size) => size > 1)).toBe(true);
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
      const [quest] = openBoard(world, [80], [1, 4]) as [Quest];
      const available = availableHeroes(world, guild);

      expect(partyFor(world, guild, quest, available, deps), String(playerPartyMargin)).toEqual(
        greedyParty(world, quest, available, deps, playerPartyMargin),
      );
    }
  });

  // v1.1.5-S6 (DL-175, R1): past the minimum size a Hero joins only for more than the margin.
  describe('a Hero joins only for more than the margin (v1.1.5-S6)', () => {
    /** How many go on a Quest of one to four places, the chance of success a function of the Party's size. */
    function sent(playerPartyMargin: number, bySize: (size: number) => number): number {
      const deps = testDeps({ playerPartyMargin });
      const { world } = createWorld('gain-strict', setup, deps).document;
      const guild = playerGuild(world) as Guild;
      const [quest] = openBoard(world, [80], [1, 4]) as [Quest];
      chances.bySize = bySize;
      try {
        return (partyFor(world, guild, quest, availableHeroes(world, guild), deps) as HeroId[]).length;
      } finally {
        chances.bySize = null;
      }
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
      // Each further Hero is judged by its own gain: 0.05 after the one who went by more than it.
      expect(sent(0.05, (size) => [0, 0, 0.0625, 0.0625 + 0.05, 0.0625 + 0.05][size] as number)).toBe(2);
    });

    test('at a margin of 1 no Hero joins past the minimum, even for the whole of the chance', () => {
      expect(sent(1, (size) => (size === 1 ? 0 : 1))).toBe(1);
    });
  });

  test('adds first the Hero who most raises the chance, however the Roster is ordered', () => {
    const { world, rival, deps } = scene('greedy-first', testDeps({}, withDispositions({ partyMargin: 1 })));
    const [quest] = openBoard(world, [60, 90, 90, 90, 90, 90], [1, 4]) as [Quest];
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
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], [2, 3]) as [Quest];
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
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], [1, 3]) as [Quest];
    const heroes = byId(availableHeroes(world, rival));
    for (const hero of heroes) {
      hero.classKey = 'warrior';
      hero.skills = {};
    }
    const second = heroes[1] as Hero;
    second.classKey = 'rogue';
    second.skills = { lockpicking: 1 };
    quest.requirements = { partySizeMin: 1, partySizeMax: 3, classKey: 'warrior', skillKey: 'lockpicking' };

    const heroIds = dispatchOf(world, rival, deps)?.heroIds ?? [];
    expect(heroIds).toHaveLength(2);
    expect(heroIds).toContain(second.id);
    expect(heroOf(world, heroIds.find((id) => id !== second.id) as HeroId).classKey).toBe('warrior');
    expect(heroIds).toEqual(greedyParty(world, quest, heroes, deps, 1));

    // A Party of one cannot meet both; a Hero who meets both goes alone.
    quest.requirements.partySizeMax = 1;
    expect(dispatchOf(world, rival, deps)?.questId).not.toBe(quest.id);
    second.classKey = 'warrior';
    expect(dispatchOf(world, rival, deps)).toMatchObject({ questId: quest.id, heroIds: [second.id] });
  });

  test('a Quest whose Encounters are drawn on the way has no estimate: the fewest it allows, by Hero id', () => {
    const { world, rival, deps } = scene('greedy-unknown', testDeps({}, withDispositions({ partyMargin: 0.05 })));
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], [2, 4]) as [Quest];
    quest.encounterKeys = [];

    expect(dispatchOf(world, rival, deps)?.heroIds).toEqual(byId(availableHeroes(world, rival)).slice(0, 2).map((hero) => hero.id));
  });

  test('never sends an unavailable Hero: injured, in a Party, dead or retired', () => {
    const { world, rival, deps } = scene('unavailable', testDeps({ rivalRosterMin: 6 }, withDispositions({ partyMargin: 0 })));
    const [quest] = openBoard(world, [10, 90, 90, 90, 90, 90], [2, 4]) as [Quest];
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

  // v1.1.4-S6's verification: the Board shows the best Party's chance without estimating it again.
  test("bestParty gives partyFor's Party and the estimate it was chosen by, which is estimateQuest's for it", () => {
    for (const partyMargin of [0, 0.05, 1]) {
      const { world, rival, deps } = scene('greedy-best', testDeps({}, withDispositions({ partyMargin })));
      const quests = openBoard(world, [40, 60, 80, 90, 95, 99], [1, 4]);
      quests[1]!.requirements = { partySizeMin: 9, partySizeMax: 9 };
      const available = availableHeroes(world, rival);
      for (const quest of quests) {
        const best = bestParty(world, rival, quest, available, deps);
        expect(best?.heroIds ?? null, quest.id).toEqual(partyFor(world, rival, quest, available, deps));
        if (best === null) continue;
        expect(best.estimate).toEqual(estimateQuest(world, quest, best.heroIds.map((id) => heroOf(world, id)), deps));
      }
    }
  });

  test('draws nothing and changes nothing: the world after partyFor is the world before', () => {
    const { world, rival, deps } = scene('greedy-pure', testDeps({}, withDispositions({ partyMargin: 0 })));
    const [quest] = openBoard(world, [80, 90, 90, 90, 90, 90], [1, 4]) as [Quest];
    const before = structuredClone(world);

    partyFor(world, rival, quest, availableHeroes(world, rival), deps);

    expect(world).toEqual(before);
  });
});

// M4-S5 folded M2-S4's `party-size` rejection into `requirement-unmet` (DL-43 item 1): the staffing
// rule the Rivals and the harness's policy share is held to the one test `dispatch` applies (DL-44).
describe('staffing agrees with dispatch', () => {
  test('every Party partyFor names meets unmetRequirements, size, Class and Skill alike', () => {
    let named = 0;
    for (const seed of ['agree-a', 'agree-b', 'agree-c']) {
      const { world, rival, deps } = scene(seed, testDeps({ rivalRosterMin: 6, rivalRosterMax: 8 }));
      const available = availableHeroes(world, rival);
      const shapes = [
        {},
        { classKey: 'healer' },
        { skillKey: 'lockpicking' },
        { classKey: 'warrior', skillKey: 'tactics' },
      ];
      for (const quest of boardQuests(world)) {
        for (const [min, max] of [[1, 1], [1, 3], [2, 4], [3, 5]] as const) {
          for (const shape of shapes) {
            const asked = { ...quest, requirements: { partySizeMin: min, partySizeMax: max, ...shape } };
            const heroIds = partyFor(world, rival, asked, available, deps);
            expect(heroIds, `${seed} ${quest.id} ${min}-${max}`).toEqual(greedyParty(world, asked, available, deps, rowOf(rival, deps).partyMargin));
            if (heroIds === null) continue;
            named += 1;
            expect(unmetRequirements(asked, heroIds.map((id) => heroOf(world, id))), `${seed} ${quest.id} ${min}-${max}`).toEqual([]);
          }
        }
      }
    }
    expect(named).toBeGreaterThan(20);
  });

  // v1.1.4-S6 (DL-157): the stops search the Board with partyFor's first step, which asks no estimate.
  test('staffableQuests names exactly the Quests for which partyFor names a Party that dispatch would send', () => {
    for (const seed of ['agree-a', 'agree-b', 'agree-c']) {
      const { world, rival, deps } = scene(seed, testDeps({ rivalRosterMin: 6, rivalRosterMax: 8 }));
      const quests = boardQuests(world);
      quests.forEach((quest, index) => {
        quest.requirements = [{ partySizeMin: 1, partySizeMax: 3 }, { partySizeMin: 9, partySizeMax: 9 }, { partySizeMin: 1, partySizeMax: 2, classKey: 'healer' }][index % 3] as Quest['requirements'];
      });
      const available = availableHeroes(world, rival);
      const byPartyFor = quests.filter((quest) => {
        const heroIds = partyFor(world, rival, quest, available, deps);
        return heroIds !== null && dispatchRefusal(world, { guildId: rival.id, questId: quest.id, heroIds }, deps) === null;
      });

      expect(staffableQuests(world, rival, deps).map((quest) => quest.id), seed).toEqual(byPartyFor.map((quest) => quest.id));
    }
  });
});

describe('steady: recruiting', () => {
  // Ten Upkeeps, so that Wealth just above the threshold covers any signing fee; and no building,
  // which `steady` chooses first once its Wealth is three times the infirmary's cost (M3-S6). Both
  // on the row (DL-56). Negotiation still too (M4-S5): the fees are compared at the list price.
  // Transfers stilled too (M6-S2, DL-57): a Rival that would hire weighs a Transfer before a recruit;
  // and gear, which it buys before it hires (M6-S4, DL-58).
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
    expect(rowOf(rival, deps).recruitThreshold).toBe(10);
    expect(threshold).toBeGreaterThan(0);

    rival.wealth = threshold;
    expect(recruits(world, rival)).toEqual([]);

    rival.wealth = threshold + 1;
    expect(recruits(world, rival)).toEqual([{ kind: 'recruit', guildId: rival.id, heroId: cheapest(world).id }]);
  });

  test("reads the threshold from steady's row: sixty Upkeeps, M3's balance pass's value (DL-41, DL-56)", () => {
    // INPUTS 4.12 says three; DL-35 raised the config's default to ten and DL-41 to sixty, which
    // the row carries now that the config field is gone.
    expect(testContent.dispositions['steady']?.recruitThreshold).toBe(60);
    const { world, rival } = scene('multiple', deps);
    const wealth = 5 * upkeep(rival, world, deps.config, deps.content);
    rival.wealth = wealth;

    expect(recruits(world, rival)).toEqual([]);
    const lower = testDeps(still, withDispositions({ recruitThreshold: 4, ...noBuilding }));
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
    expect(hires()).toEqual([{ kind: 'recruit', guildId: rival.id, heroId: first.id }]);

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
    for (const heroId of rival.rosterIds.splice(size)) heroOf(world, heroId).diedOnTurn = world.turn;
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
    expect(rivalChoices(world, rival, deps)).toEqual([{ kind: 'recruit', guildId: rival.id, heroId }]);
  });

  test('in play, a Rival of every Disposition cut to two Heroes recruits back to rivalRosterMin within ten Days, under its own row', () => {
    // The rows as content has them (the test content's are the core's, DL-56), with a Wealth under every
    // one's threshold: only the need hires. Every Hall built to its top, so that none spends the Wealth
    // on a build first (DL-58's order); harmless Encounters, so that no Hero is lost meanwhile.
    const rows = testDeps({ negotiationRange: 0, marketSize: 0, rivalRosterMin: 4, rivalHireReserveUpkeeps: 3 }, harmlessContent);
    const top = Object.fromEntries(facilityKeys.map((key) => [key, Math.max(...Object.values(rows.content.improvements).filter((row) => row.facility === key).map((row) => row.grade))]));
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

      expect(rivalChoices(world, rival, deps), disposition).toEqual([{ kind: 'recruit', guildId: rival.id, heroId }]);
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
    for (const key of Object.keys(heroOf(world, dearest).stats)) heroOf(world, dearest).stats[key] = 20;
    const fee = transferFee(heroOf(world, dearest), guildmasterOf(rival, world), dealing);
    // Enough for the dearest Hero's fee, but not with the reserve kept.
    rival.wealth = fee + reserve - 1;

    const [choice] = rivalChoices(world, rival, dealing) as [Extract<GuildAction, { heroId: HeroId }>];

    expect(choice.heroId).not.toBe(dearest);
    expect(applyGuildAction(world, choice, dealing)).toMatchObject({ ok: true });
    expect(rival.wealth).toBeGreaterThanOrEqual(reserve);
  });
});

describe('steady: building (M3-S6, M6-S4)', () => {
  // Pinned: three times the cost, and a recruit threshold low enough that recruiting is on offer;
  // Transfers stilled, which a Rival that would hire weighs before a recruit (M6-S2, DL-57); and gear,
  // which it buys after it builds and before it hires (M6-S4, DL-58).
  const deps = testDeps({}, withDispositions({ buildThreshold: 3, recruitThreshold: 1, gearThreshold: 1_000_000, transferAppetite: 0 }));
  const purchases = (world: World, guild: Guild) => rivalChoices(world, guild, deps).filter((action) => action.kind !== 'dispatch');

  test("builds the infirmary's next grade, in place of a recruit, only while Wealth exceeds three times its cost", () => {
    const { world, rival } = scene('build-threshold', deps);
    expect(testContent.dispositions['steady']?.buildThreshold).toBe(3);

    rival.wealth = 3 * 200;
    expect(purchases(world, rival)).toEqual([expect.objectContaining({ kind: 'recruit' })]);
    rival.wealth = 3 * 200 + 1;
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'infirmary' }]);

    // The next grade costs 500; the other facilities built to their top, so that the infirmary is the
    // only one with a grade to build (M6-S4 builds every facility, the next test).
    rival.hall = { infirmary: 1, trainingYard: 3, quarters: 3 };
    rival.wealth = 3 * 500;
    expect(purchases(world, rival)).toEqual([expect.objectContaining({ kind: 'recruit' })]);
    rival.wealth = 3 * 500 + 1;
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'infirmary' }]);
  });

  // M6-S4 (DL-58): M3-S6's Rival built the infirmary alone; it now builds every facility of its Hall.
  test('builds the next facility in the Hall’s order once the infirmary is at its top grade, and nothing once all are', () => {
    const { world, rival } = scene('build-top', deps);
    rival.wealth = 1_000_000;

    rival.hall = { infirmary: 3, trainingYard: 0, quarters: 0 };
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'trainingYard' }]);
    rival.hall = { infirmary: 3, trainingYard: 3, quarters: 1 };
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'quarters' }]);
    rival.hall = { infirmary: 3, trainingYard: 3, quarters: 3 };
    expect(purchases(world, rival).map((action) => action.kind)).toEqual(['recruit']);
  });

  test("a dearer grade out of its reach gives way to a cheaper grade of the next facility, each at its own threshold", () => {
    const { world, rival } = scene('build-next', deps);
    rival.hall = { infirmary: 1, trainingYard: 0, quarters: 0 }; // the infirmary's next grade costs 500

    rival.wealth = 3 * 200;
    expect(purchases(world, rival)).toEqual([expect.objectContaining({ kind: 'recruit' })]);
    rival.wealth = 3 * 200 + 1; // below 3 × 500, above 3 × 200: the practice yard, not the infirmary ward
    expect(purchases(world, rival)).toEqual([{ kind: 'build', guildId: rival.id, facility: 'trainingYard' }]);
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
      'trainingYard 1', 'trainingYard 2', 'trainingYard 3',
      'quarters 1', 'quarters 2', 'quarters 3',
    ]);
    expect(rival.wealth).toBe(100_000 - 3 * 1700);
    expect(purchases(world, rival).map((action) => action.kind)).toEqual(['recruit']);
  });
});

describe('rivalChoices', () => {
  test('dispatches, then recruits, as Action values a front end would produce', () => {
    // Transfers stilled: a Rival that would hire weighs a Transfer before a recruit (M6-S2, DL-57);
    // and gear, which it buys before it hires (M6-S4, DL-58).
    const { world, rival, deps } = scene('both', testDeps({}, withDispositions({ transferAppetite: 0, gearThreshold: 1_000_000 })));
    rival.wealth = 100_000;
    rival.hall = { infirmary: 3, trainingYard: 3, quarters: 3 }; // built to the top (M6-S4), so that its purchase is a recruit

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
    const before = structuredClone(world);
    // Everything frozen but the one stream a Rival may draw from.
    for (const [key, value] of Object.entries(world)) if (key !== 'rng') deepFreeze(value);
    for (const [name, state] of Object.entries(world.rng)) if (name !== 'rivals') deepFreeze(state);
    Object.freeze(world.rng);
    Object.freeze(world);

    expect(rivalChoices(world, rival, deps).map((action) => action.kind)).toEqual(['dispatch', 'build']);
    const drawn = structuredClone(before.rng.rivals);
    next(drawn);
    expect(world).toEqual({ ...before, rng: { ...before.rng, rivals: drawn } });
  });
});

// ── M6-S1: one rule, reading each Disposition's row (INPUTS 7.5, DL-56) ─────────────────────────

describe('one rule for every Disposition, reading its row (M6-S1)', () => {
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
    for (const quest of quests.filter((it) => it.difficulty >= 60)) quest.requirements = { partySizeMin: size, partySizeMax: size };

    expect(takenDifficulty(world, rival, deps)).toBe(55);
  });

  test("each Disposition recruits above its row's recruitThreshold of Upkeeps and builds above its buildThreshold times the cost", () => {
    // Transfers stilled: a Rival that would hire weighs a Transfer before a recruit (M6-S2, DL-57);
    // gear too, which it buys before it hires (M6-S4: its gearThreshold's own test is below).
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

      // Recruiting, with the Hall built to its top (M6-S4 builds every facility).
      rival.hall = { infirmary: 3, trainingYard: 3, quarters: 3 };
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

  // M6-S1's second box: a fifth Disposition is a row, and plays with no code change.
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

      // Transfers stilled for the purchase: a Rival that would hire weighs one first (M6-S2, DL-57);
      // gear too, which it buys before it hires (M6-S4, DL-58), until its own threshold is tried below.
      const still = testDeps(
        { rivalCount: 5, negotiationRange: 0 },
        withDispositions({ transferAppetite: 0, gearThreshold: 1_000_000 }, withFifth()),
      );
      const purchase = () => rivalChoices(world, rival, still).find((action) => action.kind === 'build' || action.kind === 'recruit');
      rival.wealth = 2.5 * 200;
      expect(purchase()?.kind).not.toBe('build');
      rival.wealth = 2.5 * 200 + 1;
      expect(purchase()).toEqual({ kind: 'build', guildId: rival.id, facility: 'infirmary' });
      rival.hall = { infirmary: 3, trainingYard: 3, quarters: 3 };
      const threshold = 7 * upkeep(rival, world, deps.config, deps.content);
      rival.wealth = threshold;
      expect(purchase()).toBeUndefined();
      rival.wealth = threshold + 1;
      expect(purchase()).toMatchObject({ kind: 'recruit', guildId: rival.id });

      // Its gearThreshold, 4, read as every row's is (M6-S4): armour at four times its price, and no
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

// ── M6-S4: buying gear at the Market, armour first, by the row's gearThreshold (DL-58) ──────────

describe('buying gear at the Market (M6-S4)', () => {
  /** Nothing else on offer: no hiring and no Transfer (M6-S2), Negotiation still (M4-S5). */
  const buying = (gearThreshold: number, config: Partial<EngineDeps['config']> = {}): EngineDeps =>
    testDeps(
      { negotiationRange: 0, ...config },
      withDispositions({ gearThreshold, recruitThreshold: 1_000_000, transferAppetite: 0 }),
    );
  const fullHall = { infirmary: 3, trainingYard: 3, quarters: 3 } as const;

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

  test('buys nothing for a slot the config does not list, and nothing that is not gear', () => {
    const noArmour = buying(3, { gearSlots: ['weapon', 'trinket'] });
    const { world, rival } = outfitting('no-armour-slot', noArmour, [['plate-harness', 5], ['short-sword', 5]]);

    expect(buysOf(world, rival, noArmour).map((buy) => buy.definitionKey)).toEqual(['short-sword']);
    stockMarket(world, [['plate-harness', 5], ['whetstone', 5]]); // a consumable is not gear
    expect(buysOf(world, rival, noArmour)).toEqual([]);
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
    const before = structuredClone(world);
    for (const [key, value] of Object.entries(world)) if (key !== 'rng') deepFreeze(value);
    for (const [name, state] of Object.entries(world.rng)) if (name !== 'rivals') deepFreeze(state);
    Object.freeze(world.rng);
    Object.freeze(world);

    expect(rivalChoices(world, rival, deps).map((action) => action.kind)).toEqual(['dispatch', 'buy']);
    const drawn = structuredClone(before.rng.rivals);
    next(drawn);
    expect(world).toEqual({ ...before, rng: { ...before.rng, rivals: drawn } });
  });
});
