import { loadContent } from '@heroesim/content/node';
import {
  advance,
  append,
  compareByCodeUnit,
  createWorld,
  defaultConfig,
  dispatch,
  makeId,
  milestoneTypes,
  playerGuild,
  unattachedHeroes,
  type EngineDeps,
  type EngineEventType,
  type EntityId,
  type FacilityKey,
  type Guild,
  type Hero,
  type HeroId,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { harnessSetup } from './creation.js';
import { countGame, emptyObservations, observe, questsTakenByController, takeCensus } from './counters.js';

// M2-S9's counter, against the core content: the player's Quests and the Rivals' counted apart.

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };

/** The player's first Party, smallest first, that `dispatch` accepts for a Quest on the Board. */
function playerDispatches(document: WorldDocument): WorldDocument {
  const guild = playerGuild(document.world) as Guild;
  const roster = guild.rosterIds;
  const parties: HeroId[][] = [];
  for (let mask = 1; mask < 1 << roster.length; mask += 1) {
    parties.push(roster.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  parties.sort((a, b) => a.length - b.length);
  for (const questId of document.world.board) {
    for (const heroIds of parties) {
      const result = dispatch(document, { guildId: guild.id, questId, heroIds }, deps);
      if (result.ok) return result.document;
    }
  }
  throw new Error('The player can staff nothing on the Board');
}

describe('questsTakenByController', () => {
  test('counts nothing in a new world', () => {
    const { document } = createWorld('counters-new', harnessSetup, deps);

    expect(questsTakenByController(document)).toEqual({ player: 0, rival: 0 });
  });

  test("counts the player's morning dispatch apart from what the Rivals take in the afternoon", () => {
    const { document: start } = createWorld('counters', harnessSetup, deps);
    const morning = playerDispatches(start);
    expect(questsTakenByController(morning)).toEqual({ player: 1, rival: 0 });

    const { document, events } = advance(morning, deps);

    const taken = events.filter((event) => event.type === 'quest.taken');
    expect(taken.length).toBeGreaterThan(0);
    expect(questsTakenByController(document)).toEqual({ player: 1, rival: taken.length });
  });
});

// M3's counters (DL-40), each on a small fixture game: a world created under a year of 30 Turns,
// its History given by hand the entries a counter reads, at Turns chosen so each year and each
// Guild's share is known. The entries are the engine's shapes, the Guild among the participants as
// `emit` puts it; nothing is advanced, so no Rival acts.

const shortYears: EngineDeps = { config: { ...defaultConfig, turnsPerYear: 30, rivalCount: 2, fameRequiredPerLevel: 10 }, content };

interface Fixture {
  document: WorldDocument;
  player: Guild;
  /** The two Rivals, in id order. */
  rivals: [Guild, Guild];
}

function fixture(seed: string, deps: EngineDeps = shortYears): Fixture {
  const { document } = createWorld(seed, harnessSetup, deps);
  const guilds = Object.values(document.world.guilds).sort((a, b) => compareByCodeUnit(a.id, b.id));
  const player = guilds.find((guild) => guild.controller.kind === 'player');
  const [a, b] = guilds.filter((guild) => guild.controller.kind === 'rival');
  if (player === undefined || a === undefined || b === undefined) throw new Error('Not a player and two Rivals');
  return { document, player, rivals: [a, b] };
}

/** Appends an entry of `type` at `turn`, naming `participants`. */
function add(document: WorldDocument, turn: number, type: EngineEventType, participants: EntityId[], payload: object): void {
  append(document.history, { turn, type, participants, labels: {}, milestone: milestoneTypes[type], payload });
}

const firstHero = (guild: Guild): HeroId => {
  const [heroId] = guild.rosterIds;
  if (heroId === undefined) throw new Error(`${guild.id} has an empty Roster`);
  return heroId;
};

function levelled(document: WorldDocument, turn: number, guild: Guild, statDeltas: Record<string, number> = { strength: 3 }): void {
  const heroId = firstHero(guild);
  add(document, turn, 'hero.levelled', [heroId, guild.id], { heroId, guildId: guild.id, level: 2, statDeltas, pointsLost: 0 });
}

function declined(document: WorldDocument, turn: number, guild: Guild): void {
  const heroId = firstHero(guild);
  add(document, turn, 'hero.declined', [heroId, guild.id], { heroId, statKey: 'strength', delta: -1, age: 40 });
}

function improved(document: WorldDocument, turn: number, guild: Guild, facility: FacilityKey, grade: number): void {
  add(document, turn, 'guild.improved', [guild.id], { guildId: guild.id, facility, grade, improvementKey: `${facility}-${grade}`, cost: 200 });
}

describe("M3's counters, from the History", () => {
  test('Levels gained, declines and Guild-years in play, by controller and year', () => {
    const { document, player, rivals } = fixture('counters-levels');
    const [a, b] = rivals;
    b.foldedOnTurn = 45;
    levelled(document, 5, player);
    levelled(document, 20, b);
    levelled(document, 31, a);
    levelled(document, 40, player);
    declined(document, 50, a);
    levelled(document, 55, a, { strength: 1, constitution: 2 });
    // The night of the player's first decline: `levelUps` runs before `ageing`, so this Level is before it.
    levelled(document, 59, player);
    declined(document, 59, player);
    declined(document, 65, a);
    levelled(document, 71, player, { dexterity: 2 });
    document.world.turn = 75;

    const counters = countGame(document, shortYears);

    // Two and a half years: the player's Guild and Rival A all of them, Rival B until Turn 45.
    expect(counters.guildYears).toEqual({ player: [1, 1, 0.5], rival: [2, 1.5, 0.5] });
    expect(counters.levelsGained).toEqual({ player: [1, 2, 1], rival: [1, 2, 0] });
    expect(counters.declines).toEqual({ player: [0, 1, 0], rival: [0, 1, 1] });
    expect(counters.growthAgainstDecline).toEqual({
      player: {
        guilds: 1,
        guildYearsBefore: 59 / 30,
        levelsBefore: 3,
        guildYearsAfter: 16 / 30,
        levelsAfter: 1,
        pointsGrownAfter: 2,
        pointsDeclinedAfter: 1,
      },
      // Rival B declined nowhere, so its Level counts in neither.
      rival: {
        guilds: 1,
        guildYearsBefore: 50 / 30,
        levelsBefore: 1,
        guildYearsAfter: 25 / 30,
        levelsAfter: 1,
        pointsGrownAfter: 3,
        pointsDeclinedAfter: 2,
      },
    });
  });

  test('a game with no Level and no decline counts zeros for each year it lasted, and no Guild with a decline', () => {
    const { document } = fixture('counters-quiet');
    document.world.turn = 61;

    const counters = countGame(document, shortYears);

    expect(counters.levelsGained).toEqual({ player: [0, 0, 0], rival: [0, 0, 0] });
    expect(counters.declines).toEqual({ player: [0, 0, 0], rival: [0, 0, 0] });
    expect(counters.guildYears.player).toEqual([1, 1, 1 / 30]);
    expect(counters.growthAgainstDecline.player.guilds).toBe(0);
  });

  test('a game that ended stops its Guilds at the ending, not at the Turn the world stands on', () => {
    const { document } = fixture('counters-ended');
    document.world.turn = 50;
    document.world.ended = { turn: 44, reason: 'bankruptcy' };

    expect(countGame(document, shortYears).guildYears).toEqual({ player: [1, 14 / 30], rival: [2, 28 / 30] });
  });

  test('Retirements by controller and the age retired at', () => {
    const { document, player, rivals } = fixture('counters-retired');
    const retire = (turn: number, guild: Guild, age: number): void => {
      const heroId = firstHero(guild);
      add(document, turn, 'hero.retired', [heroId, guild.id], { heroId, guildId: guild.id, age });
    };
    retire(10, player, 47);
    retire(20, rivals[0], 52);
    retire(30, rivals[1], 52);
    document.world.turn = 40;

    const counters = countGame(document, shortYears);

    expect(counters.retirementAges).toEqual({ player: { 47: 1 }, rival: { 52: 2 } });
    expect(counters.heroesRetired).toEqual({ player: 1, rival: 2 });
  });

  test('Improvement grades by year 10: the highest each Guild founded before it reached before it, by controller', () => {
    const { document, player, rivals } = fixture('counters-improved');
    const [a, b] = rivals;
    /** A replacement Rival founded on `turn`, a copy of Rival B's row under a new id. */
    const found = (n: number, turn: number): Guild => {
      const guild: Guild = { ...structuredClone(b), id: makeId('guilds', n), foundedTurn: turn };
      document.world.guilds[guild.id] = guild;
      add(document, turn, 'guild.founded', [guild.id, guild.guildmasterId], { guildId: guild.id, guildmasterId: guild.guildmasterId });
      return guild;
    };
    improved(document, 10, player, 'infirmary', 1);
    improved(document, 20, player, 'infirmary', 2);
    improved(document, 100, a, 'infirmary', 1);
    const c = found(90, 200);
    improved(document, 250, c, 'quarters', 1);
    improved(document, 299, player, 'trainingYard', 1);
    // Year 10 begins on Turn 300: what is built on it, and a Rival founded after it, are not counted.
    improved(document, 300, player, 'quarters', 1);
    const d = found(91, 310);
    improved(document, 320, d, 'infirmary', 1);
    document.world.turn = 330;

    const { improvementGrades } = countGame(document, shortYears);

    expect(improvementGrades).toEqual({
      player: { infirmary: [0, 0, 1, 0], trainingYard: [0, 1, 0, 0], quarters: [1, 0, 0, 0] },
      // Rivals A, B and the replacement C.
      rival: { infirmary: [2, 1, 0, 0], trainingYard: [3, 0, 0, 0], quarters: [2, 1, 0, 0] },
    });
  });

  test('no Improvement grades for a game that stopped before year 10', () => {
    const { document } = fixture('counters-short');
    document.world.turn = 299;
    expect(countGame(document, shortYears).improvementGrades).toBeNull();

    document.world.turn = 400;
    document.world.ended = { turn: 250, reason: 'bankruptcy' };
    expect(countGame(document, shortYears).improvementGrades).toBeNull();
  });
});

describe("M3's counters, from the World State while a game is played", () => {
  test('the Fame gate: each morning, the pool Heroes who would refuse each Guild in play, by controller', () => {
    const { document, player, rivals } = fixture('counters-fame');
    const { world } = document;
    const [a, b] = rivals;
    player.fame = 0;
    a.fame = 100;
    b.foldedOnTurn = 0;
    const [first, second] = unattachedHeroes(world);
    if (first === undefined || second === undefined) throw new Error('A pool of fewer than two');
    for (const hero of unattachedHeroes(world)) hero.level = 1;
    first.level = 5; // asks Fame 40: refuses the player, signs for Rival A
    second.level = 2; // asks Fame 10: likewise

    const observations = emptyObservations();
    observe(observations, world, shortYears);
    expect(observations.fameGate).toEqual({
      player: { heroDays: 2, guildDays: 1, guildDaysWithAny: 1 },
      rival: { heroDays: 0, guildDays: 1, guildDaysWithAny: 0 },
    });

    // Not on an afternoon or a night; again on the next morning, where Fame 10 now signs the second.
    world.turn = 1;
    observe(observations, world, shortYears);
    world.turn = 2;
    observe(observations, world, shortYears);
    world.turn = 3;
    player.fame = 10;
    observe(observations, world, shortYears);
    expect(observations.fameGate).toEqual({
      player: { heroDays: 3, guildDays: 2, guildDaysWithAny: 2 },
      rival: { heroDays: 0, guildDays: 2, guildDaysWithAny: 0 },
    });
  });

  test("the Rosters' census as each year begins: Heroes, Levels, and Heroes with a Stat at Potential or content's maximum", () => {
    const { document, player, rivals } = fixture('counters-census');
    const { world } = document;
    const [a, b] = rivals;
    b.foldedOnTurn = 0;
    const heroStats = Object.values(content.stats).filter((stat) => stat.owner === 'hero');
    for (const guild of [player, a]) {
      for (const heroId of guild.rosterIds) {
        const hero = world.heroes[heroId] as Hero;
        for (const stat of heroStats) {
          hero.stats[stat.key] = 5;
          hero.potential[stat.key] = 10;
        }
      }
    }
    const [p1, p2] = player.rosterIds.map((id) => world.heroes[id] as Hero);
    if (p1 === undefined || p2 === undefined) throw new Error('A Roster of fewer than two');
    p1.level = 3;
    p2.stats.strength = 10; // at its Potential
    const a1 = world.heroes[firstHero(a)] as Hero;
    a1.stats.strength = 20;
    a1.potential.strength = 25; // past content's maximum, 20, where growth stops too

    const observations = emptyObservations();
    takeCensus(observations, world, shortYears);
    const rivalHeroes = a.rosterIds.length;
    const newWorld = {
      player: { guilds: 1, wealth: player.wealth, heroes: player.rosterIds.length, levels: player.rosterIds.length + 2, atPotential: 1 },
      // Rival B has folded: only A is in play.
      rival: { guilds: 1, wealth: a.wealth, heroes: rivalHeroes, levels: rivalHeroes, atPotential: 1 },
    };
    expect(observations.rosters).toEqual([newWorld]);

    // Only on the first Turn of a year not yet counted.
    world.turn = 15;
    takeCensus(observations, world, shortYears);
    world.turn = 30;
    p1.level = 4;
    takeCensus(observations, world, shortYears);
    takeCensus(observations, world, shortYears);
    world.turn = 90;
    takeCensus(observations, world, shortYears);
    expect(observations.rosters).toEqual([newWorld, { ...newWorld, player: { ...newWorld.player, levels: newWorld.player.levels + 1 } }]);
  });
});
