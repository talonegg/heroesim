import { describe, expect, test, vi } from 'vitest';
import { applyAction, applyGuildAction } from './actions/action.js';
import { bestParties } from './best-party.js';
import type { EngineDeps, GameConfig } from './config.js';
import { availableHeroes } from './controllers/rival.js';
import { createWorld } from './create.js';
import { compareByCodeUnit, type Guild, type Hero, type Quest, type World, type WorldDocument } from './document.js';
import { streamOf } from './generators/draw.js';
import { estimateQuest } from './quest-engine/estimate.js';
import { next } from './rng.js';
import { dispositionOf, playerGuild } from './selectors.js';
import { turnsPerDay } from './time.js';
import { testDeps, withDispositions } from './world.test-support.js';

// The Best Party module (DL-237): opened over one world and a Guild, it names the Best Party for a
// Quest from given Heroes and gives a Party's chance, keeping each Hero as they will come home and
// every Party it has weighed. `counted` counts the estimates it asks of the chance estimate and the
// nights it runs on a Hero bringing them home, so that a test sees what it kept.
const counted = vi.hoisted(() => ({ estimates: 0, nights: 0 }));
vi.mock('./quest-engine/estimate.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./quest-engine/estimate.js')>();
  return {
    ...real,
    partyEstimator: (...args: Parameters<typeof real.partyEstimator>): ReturnType<typeof real.partyEstimator> => {
      const estimate = real.partyEstimator(...args);
      return (...asked) => {
        counted.estimates += 1;
        return estimate(...asked);
      };
    },
  };
});
const read = vi.hoisted(() => ({ formulas: 0 }));
vi.mock('./quest-engine/degree.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./quest-engine/degree.js')>();
  return {
    ...real,
    passDegree: (...args: Parameters<typeof real.passDegree>): ReturnType<typeof real.passDegree> => {
      read.formulas += 1;
      return real.passDegree(...args);
    },
  };
});
vi.mock('./phases/hero-state.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./phases/hero-state.js')>();
  return {
    ...real,
    heroNight: (...args: Parameters<typeof real.heroNight>): ReturnType<typeof real.heroNight> => {
      counted.nights += 1;
      return real.heroNight(...args);
    },
  };
});

const setup = { guildmasterName: 'Ada', guildName: 'The Test', createdAt: 'test' };

interface Scene {
  document: WorldDocument;
  world: World;
  rival: Guild;
  quests: Quest[];
  deps: EngineDeps;
}

/** A new world and its first Rival, by Guild id, every Quest on the Board open to a Party of one or more at the difficulties given. */
function scene(seed: string, difficulties: readonly number[] = [40, 60, 80, 90, 95, 99], partyMargin = 0.02, overrides: Partial<GameConfig> = {}): Scene {
  const deps = testDeps({ rivalRosterMin: 6, rivalRosterMax: 8, ...overrides }, withDispositions({ partyMargin }));
  const { document } = createWorld(seed, setup, deps);
  const { world } = document;
  const [rival] = Object.values(world.guilds)
    .filter((guild) => dispositionOf(guild) !== null)
    .sort((a, b) => compareByCodeUnit(a.id, b.id));
  if (rival === undefined) throw new Error('No Rival');
  const quests = world.board.map((questId, index) => {
    const quest = world.quests[questId] as Quest;
    quest.difficulty = difficulties[index] ?? 100;
    quest.requirements = { partySizeMin: 1 };
    return quest;
  });
  return { document, world, rival, quests, deps };
}

/** `heroes` without those named in `heroIds`. */
const without = (heroes: readonly Hero[], heroIds: readonly string[]): Hero[] => heroes.filter((hero) => !heroIds.includes(hero.id));

describe('the Best Party module (DL-237)', () => {
  test('names, asked many questions, the Party a module opened for each names, with estimateQuest’s estimate for it', () => {
    for (const margin of [0, 0.05, 1]) {
      const { world, rival, quests, deps } = scene('best-many', undefined, margin);
      quests[1]!.requirements = { partySizeMin: 9 };
      quests[2]!.requirements = { partySizeMin: 1, classKey: 'healer' };
      const available = availableHeroes(world, rival);
      const module = bestParties(world, rival, deps);
      for (const heroes of [available, available.slice(1), available.slice(0, 2), []]) {
        for (const quest of quests) {
          const best = module.party(quest, heroes);
          expect(best, `${margin} ${quest.id} of ${heroes.length}`).toEqual(bestParties(world, rival, deps).party(quest, heroes));
          if (best === null) continue;
          expect(best.estimate).toEqual(estimateQuest(world, quest, best.heroIds.map((id) => world.heroes[id] as Hero), deps));
        }
      }
      expect(module.party(quests[1]!, available)).toBeNull();
    }
  });

  test('asked again from the Heroes a dispatch left, names what a new module names, and weighs no Party it has weighed', () => {
    // A margin of 1, so that each Party is its two fewest, some sharing no Hero: no Quest has a most (DL-266).
    const { world, rival, quests, deps } = scene('best-again', [60, 60, 70, 80, 90, 95], 1);
    const available = availableHeroes(world, rival);
    // Each Quest asks for a Class of the Roster's in turn, so that some Parties share no Hero.
    const classes = [...new Set(available.map((hero) => hero.classKey))];
    expect(classes.length).toBeGreaterThan(1);
    quests.forEach((quest, index) => {
      quest.requirements = { partySizeMin: 2, classKey: classes[index % classes.length] as string };
    });
    const module = bestParties(world, rival, deps);
    const first = quests.map((quest) => module.party(quest, available));

    // The same question again is answered from what it weighed.
    counted.estimates = 0;
    quests.forEach((quest, index) => expect(module.party(quest, available)).toEqual(first[index]));
    expect(counted.estimates).toBe(0);

    // A dispatch sends the first Quest's Party; each other Quest is asked again from the Heroes left.
    const sent = first[0]?.heroIds ?? [];
    expect(sent.length).toBeGreaterThan(0);
    const left = without(available, sent);
    let kept = 0;
    for (const [index, quest] of quests.entries()) {
      if (index === 0) continue;
      const before = first[index] ?? null;
      counted.estimates = 0;
      const again = module.party(quest, left);
      const estimates = counted.estimates;
      expect(again, quest.id).toEqual(bestParties(world, rival, deps).party(quest, left));
      // A Quest whose Party lost no Hero keeps it, and weighs nothing to keep it.
      if (before !== null && before.heroIds.every((id) => !sent.includes(id))) {
        kept += 1;
        expect(again).toEqual(before);
        expect(estimates, quest.id).toBe(0);
      }
    }
    expect(kept).toBeGreaterThan(0);
  });

  test('gives a Party’s chance as estimateQuest does, on Quests of any length and in any order, each Hero brought home once a return night', () => {
    const { world, rival, quests, deps } = scene('best-chance');
    const [a, b, c, d] = availableHeroes(world, rival) as [Hero, Hero, Hero, Hero];
    const [short, long] = quests as [Quest, Quest];
    short.durationTurns = 2 * turnsPerDay;
    long.durationTurns = 6 * turnsPerDay;
    const module = bestParties(world, rival, deps);
    for (const quest of [long, short, ...quests.slice(2)]) {
      for (const party of [[], [a], [d, b], [b, d], [a, b, c, d], [c, a, d]]) {
        expect(module.chance(quest, party), `${quest.id} ${party.map((hero) => hero.id).join()}`).toEqual(estimateQuest(world, quest, party, deps));
      }
    }
    // A Quest of another difficulty but the same length reads the Heroes the first brought home.
    const harder = { ...long, difficulty: long.difficulty + 5 };
    const expected = estimateQuest(world, harder, [a, b, c, d], deps);
    counted.nights = 0;
    expect(module.chance(harder, [a, b, c, d])).toEqual(expected);
    expect(counted.nights).toBe(0);
    expect(module.chance({ ...long, encounterKeys: ['no-such-encounter'] }, [a])).toBeNull();
    expect(() => module.chance(long, [a, a])).toThrow(`A Party names ${a.id} twice`);
    expect(() => module.chance({ ...long, difficulty: 0 }, [a])).toThrow(RangeError);
  });

  test('reads each Encounter’s pass formula once for each combination of its Checks’ Degrees, however many Parties it weighs', () => {
    const { world, rival, quests, deps } = scene('best-formulas', undefined, 0);
    const available = availableHeroes(world, rival);
    const [quest] = quests as [Quest];
    const combinations = quest.encounterKeys.reduce((total, key) => total + 4 ** (deps.content.encounters[key]?.checks.length ?? 0), 0);
    const module = bestParties(world, rival, deps);
    read.formulas = 0;
    let parties = 0;
    for (const hero of available) {
      for (const other of available) {
        const party = hero === other ? [hero] : [hero, other];
        expect(module.chance(quest, party)).toEqual(bestParties(world, rival, deps).chance(quest, party));
        parties += 1;
      }
    }
    expect(parties).toBeGreaterThan(10);
    // Each fresh module above reads the formulas again; this one read each combination once at most.
    read.formulas = 0;
    for (const hero of available) module.chance(quest, [hero]);
    expect(read.formulas).toBe(0);
    const fresh = bestParties(world, rival, deps);
    for (const hero of available) fresh.chance(quest, [hero]);
    expect(read.formulas).toBeGreaterThan(0);
    expect(read.formulas).toBeLessThanOrEqual(combinations);
  });

  // DL-257 item 6: no Quest has a greatest Party; the margin and the Heroes free bound it.
  test('adds each Hero past partySizeMin while they raise the chance by more than the margin, and stops at the margin, bounded by the Heroes free alone', () => {
    let largest = 0;
    for (const margin of [0, 0.02, 0.05, 0.1]) {
      // No Fatigue on form, so that a Quest this hard calls for more than five of the Rival's Heroes (DL-284).
      const { world, rival, quests, deps } = scene(`best-margin-${margin}`, [70, 80, 90, 95, 99, 100], margin, { fatigueScaling: 0 });
      const available = availableHeroes(world, rival);
      const module = bestParties(world, rival, deps);
      for (const quest of quests) {
        const chanceOf = (party: readonly Hero[]): number => Math.min(1, estimateQuest(world, quest, party, deps)?.success ?? 0);
        const best = module.party(quest, available);
        if (best === null) throw new Error(`No Best Party for ${quest.id}`);
        const party = best.heroIds.map((id) => world.heroes[id] as Hero);
        largest = Math.max(largest, party.length);
        // Each Hero past the first raised the chance by more than the margin.
        for (let size = 2; size <= party.length; size += 1) {
          expect(chanceOf(party.slice(0, size)) - chanceOf(party.slice(0, size - 1)), `${margin} ${quest.id} the ${size}th`).toBeGreaterThan(margin);
        }
        // And none of those left would.
        const chance = chanceOf(party);
        for (const hero of available.filter((it) => !best.heroIds.includes(it.id))) {
          expect(chanceOf([...party, hero]) - chance, `${margin} ${quest.id} with ${hero.id}`).toBeLessThanOrEqual(margin);
        }
      }
    }
    // Past the four and the five the templates once allowed.
    expect(largest).toBeGreaterThan(5);
  });

  // DL-257 item 6, DL-266: the floor holds whatever the margin, and the search stays greedy with no most.
  test('names no Party below partySizeMin, and none when too few Heroes are free, whatever the margin', () => {
    for (const margin of [0, 1]) {
      const { world, rival, quests, deps } = scene(`best-floor-${margin}`, [40, 60, 80, 90, 95, 99], margin);
      const available = availableHeroes(world, rival);
      const module = bestParties(world, rival, deps);
      for (const quest of quests) {
        quest.requirements = { partySizeMin: 2 };
        const best = module.party(quest, available);
        expect(best?.heroIds.length, `${margin} ${quest.id}`).toBeGreaterThanOrEqual(2);
        // At a margin of 1 no Hero is added past the least.
        if (margin === 1) expect(best?.heroIds, `${quest.id}`).toHaveLength(2);
        expect(module.party(quest, available.slice(0, 1)), `${margin} ${quest.id} one Hero free`).toBeNull();
      }
    }
  });

  test('weighs at most n(n + 1)/2 + 1 Parties of n free Heroes, never every Party of them: a Roster of 20 at a margin of 0', () => {
    const deps = testDeps({ rivalRosterMin: 20, rivalRosterMax: 20 }, withDispositions({ partyMargin: 0 }));
    const { world } = createWorld('best-twenty', setup, deps).document;
    const rival = Object.values(world.guilds).find((guild) => dispositionOf(guild) !== null) as Guild;
    const available = availableHeroes(world, rival);
    expect(available).toHaveLength(20);
    const bound = (20 * 21) / 2 + 1;
    for (const [index, questId] of world.board.entries()) {
      const quest = world.quests[questId] as Quest;
      quest.difficulty = [60, 80, 95, 100][index % 4] as number;
      quest.requirements = { partySizeMin: 2 };
      counted.estimates = 0;
      const best = bestParties(world, rival, deps).party(quest, available);
      expect(best?.heroIds.length, quest.id).toBeGreaterThanOrEqual(2);
      expect(counted.estimates, quest.id).toBeGreaterThan(20);
      expect(counted.estimates, quest.id).toBeLessThanOrEqual(bound);
    }
  });

  test('draws nothing and changes nothing: the world after its questions is the world before', () => {
    const { world, rival, quests, deps } = scene('best-pure', undefined, 0);
    const before = structuredClone(world);
    const module = bestParties(world, rival, deps);
    for (const quest of quests) module.party(quest, availableHeroes(world, rival));
    module.chance(quests[0]!, availableHeroes(world, rival));

    expect(world).toEqual(before);
  });

  describe('fails once its world has changed, rather than answer for the world it was opened over', () => {
    const changed = 'The Best Party module was opened over another world';

    test('asked of the Heroes of the document an action made', () => {
      const { document, world, quests, deps } = scene('best-changed-copy');
      const guild = playerGuild(world) as Guild;
      const module = bestParties(world, guild, deps);
      const [quest] = quests as [Quest];
      const heroIds = module.party(quest, availableHeroes(world, guild))?.heroIds ?? [];
      const sent = applyAction(document, { kind: 'dispatch', guildId: guild.id, questId: quest.id, heroIds }, deps);
      if (!sent.ok) throw new Error(sent.rejection.reason);
      const after = sent.document.world;
      const heroes = availableHeroes(after, playerGuild(after) as Guild);
      expect(heroes.length).toBeGreaterThan(0);

      expect(() => module.party(after.quests[quests[1]!.id] as Quest, heroes)).toThrow(changed);
      expect(() => module.chance(quests[1]!, heroes)).toThrow(changed);
      // A module opened over the new world answers.
      expect(() => bestParties(after, playerGuild(after) as Guild, deps).party(after.quests[quests[1]!.id] as Quest, heroes)).not.toThrow();
    });

    test('asked after an action changed its world in place, as the Rivals’ phase applies them', () => {
      const { world, rival, quests, deps } = scene('best-changed-place');
      const module = bestParties(world, rival, deps);
      const [quest] = quests as [Quest];
      const heroIds = module.party(quest, availableHeroes(world, rival))?.heroIds ?? [];
      const result = applyGuildAction(world, { kind: 'dispatch', guildId: rival.id, questId: quest.id, heroIds }, deps);
      expect(result.ok).toBe(true);

      expect(() => module.party(quests[1]!, availableHeroes(world, rival))).toThrow(changed);
    });

    test('asked after a draw from its world’s streams, or with its Turn moved on', () => {
      const drawn = scene('best-changed-draw');
      const module = bestParties(drawn.world, drawn.rival, drawn.deps);
      const heroes = availableHeroes(drawn.world, drawn.rival);
      expect(module.party(drawn.quests[0]!, heroes)).not.toBeNull();
      next(streamOf(drawn.world, 'rivals'));
      expect(() => module.party(drawn.quests[0]!, heroes)).toThrow(changed);

      const turned = scene('best-changed-turn');
      const later = bestParties(turned.world, turned.rival, turned.deps);
      turned.world.turn += 1;
      expect(() => later.chance(turned.quests[0]!, availableHeroes(turned.world, turned.rival))).toThrow(changed);
    });
  });
});
