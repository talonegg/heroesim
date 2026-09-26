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
  type RegardBand,
  type RegardMap,
  type WorldDocument,
} from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { harnessSetup } from './creation.js';
import { countGame, emptyObservations, observe, questsTakenByController, regardSnapshot, takeCensus } from './counters.js';

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

// M4's counters (DL-55), on the same kind of fixture: the entries each counter reads, given by hand
// in the engine's shapes, and a World State set by hand for what is read from it.

/** Every Regard band at 0 but those given. */
const bands = (counts: Partial<Record<RegardBand, number>>): Record<RegardBand, number> => ({
  hostile: 0,
  cool: 0,
  neutral: 0,
  warm: 0,
  close: 0,
  ...counts,
});

describe("M4's counters, from the History", () => {
  const questId = makeId('quests', 900);
  const partyId = makeId('parties', 900);

  test('Encounter outcomes by controller, kind and outcome, with the Heroes their consequences harmed', () => {
    const { document, player, rivals } = fixture('counters-encounters');
    const [h1, h2] = player.rosterIds;
    if (h1 === undefined || h2 === undefined) throw new Error('A Roster of fewer than two');
    const encounter = (turn: number, guild: Guild, kind: string, outcome: string, injured: HeroId[] = [], died: HeroId[] = []): void => {
      add(document, turn, 'quest.encounter', [questId, partyId, guild.id], {
        index: 0,
        encounterKey: `${kind}-one`,
        kind,
        roll: 10,
        target: 12,
        margin: -2,
        outcome,
        injured,
        died,
        questId,
        partyId,
        guildId: guild.id,
      });
    };
    encounter(5, player, 'combat', 'success', [h1]);
    encounter(5, player, 'combat', 'failure', [h1, h2], [h2]);
    encounter(8, player, 'social', 'success');
    encounter(11, rivals[0], 'combat', 'failure');
    encounter(14, rivals[1], 'stealth', 'success');
    document.world.turn = 20;

    const { encounters } = countGame(document, shortYears);

    const none = { success: 0, failure: 0, injured: 0, died: 0 };
    expect(encounters).toEqual({
      player: { combat: { success: 1, failure: 1, injured: 3, died: 1 }, travel: none, social: { ...none, success: 1 }, arcane: none, stealth: none },
      rival: { combat: { ...none, failure: 1 }, travel: none, social: none, arcane: none, stealth: { ...none, success: 1 } },
    });
  });

  test("Synergies applied per Quest by controller: the Quests resolved, those with any, the sum, and each key's Quests", () => {
    const { document, player, rivals } = fixture('counters-synergies');
    const resolved = (turn: number, guild: Guild, synergyKeys?: string[]): void => {
      add(document, turn, 'quest.resolved', [questId, partyId, guild.id], {
        band: 'success',
        ...(synergyKeys === undefined ? {} : { synergyKeys }),
        questId,
        partyId,
        guildId: guild.id,
        heroIds: [],
        templateKey: 'escort-the-tithe',
      });
    };
    resolved(5, player, ['shadow-and-spell', 'sword-and-salve']);
    resolved(8, player, []);
    // An entry written before M4-S3 has no synergyKeys: it applied none.
    resolved(9, rivals[0]);
    resolved(12, rivals[1], ['sword-and-salve']);
    document.world.turn = 20;

    const { synergies, questsResolved } = countGame(document, shortYears);

    expect(synergies).toEqual({
      player: { quests: 2, withAny: 1, applied: 2, byKey: { 'shadow-and-spell': 1, 'sword-and-salve': 1 } },
      rival: { quests: 2, withAny: 1, applied: 1, byKey: { 'sword-and-salve': 1 } },
    });
    expect(questsResolved.player.success).toBe(2);
  });

  test('Injuries by controller and type, each for the Guild the Hero was on when injured', () => {
    const { document, player, rivals } = fixture('counters-injuries');
    const injured = (turn: number, guild: Guild, typeKey: string): void => {
      const heroId = firstHero(guild);
      add(document, turn, 'hero.injured', [heroId, questId, guild.id], { heroId, questId, typeKey, healsOnTurn: turn + 9 });
    };
    injured(5, player, 'deep-cut');
    injured(6, player, 'deep-cut');
    injured(7, player, 'broken-arm');
    injured(9, rivals[1], 'deep-cut');
    document.world.turn = 20;

    const { injuriesByType, heroesInjured } = countGame(document, shortYears);

    expect(injuriesByType).toEqual({ player: { 'deep-cut': 2, 'broken-arm': 1 }, rival: { 'deep-cut': 1 } });
    expect(heroesInjured).toEqual({ player: 3, rival: 1 });
  });

  test('Patrons silent: in each year played in full, the Patrons there as it began whom no quest.offered named', () => {
    const { document } = fixture('counters-silent');
    const patronIds = Object.keys(document.world.patrons).sort(compareByCodeUnit);
    expect(patronIds).toHaveLength(12);
    const offer = (turn: number, patronId: string): void => {
      add(document, turn, 'quest.offered', [questId, patronId as EntityId], { questId, patronId, templateKey: 'escort-the-tithe' });
    };
    // The new world's Board already names some Patrons in year 0.
    const offeredAtCreation = new Set(
      (document.history.byType['quest.offered'] ?? []).map(
        (position) => (document.history.entries[position]?.payload as { patronId: string }).patronId,
      ),
    );
    const quiet = patronIds.find((id) => !offeredAtCreation.has(id));
    const [a, b] = patronIds;
    if (quiet === undefined || a === undefined || b === undefined) throw new Error('Every Patron offered at creation');
    offer(29, quiet);
    offer(30, a);
    // A Patron generated during year 1 is counted from year 2, the first year it was there as it began.
    const late = makeId('patrons', 99);
    add(document, 40, 'patron.generated', [late], { patronId: late, sphereKey: 'merchants' });
    offer(59, b);
    offer(59, a);
    // Year 3 is not played in full, so its offers and silences count nowhere.
    offer(90, late);
    document.world.turn = 95;

    const { patronYears, silentPatronYears } = countGame(document, shortYears);

    expect(patronYears).toEqual([12, 12, 13]);
    expect(silentPatronYears).toEqual([12 - offeredAtCreation.size - 1, 10, 13]);

    // A game that ended counts only the years played in full before its ending.
    document.world.ended = { turn: 59, reason: 'bankruptcy' };
    expect(countGame(document, shortYears).patronYears).toEqual([12]);
  });

  test('refuses a quest.encounter without an outcome, and a hero.injured without a type', () => {
    const { document, player } = fixture('counters-malformed');
    add(document, 5, 'quest.encounter', [player.id], { guildId: player.id, kind: 'combat', injured: [], died: [] });
    expect(() => countGame(document, shortYears)).toThrow(/quest.encounter entry 0/);

    const other = fixture('counters-malformed-2');
    const heroId = firstHero(other.player);
    add(other.document, 5, 'hero.injured', [heroId, other.player.id], { heroId });
    expect(() => countGame(other.document, shortYears)).toThrow(/hero.injured entry 0 has no typeKey/);
  });
});

describe("M4's counters, from the World State as year 10 begins", () => {
  // The Regard scale and bands pinned: DL-43's, which a balance pass may move.
  const regardDeps: EngineDeps = {
    ...shortYears,
    config: {
      ...shortYears.config,
      regardMin: -20,
      regardMax: 20,
      regardBands: { hostile: -20, cool: -12, neutral: -4, warm: 4, close: 12 },
    },
  };

  /** A fixture whose player's Roster and Guildmaster hold chosen Regard. */
  function regardFixture(seed: string): Fixture & { heroes: Hero[] } {
    const fixed = fixture(seed, regardDeps);
    const { world } = fixed.document;
    const heroes = fixed.player.rosterIds.map((id) => world.heroes[id] as Hero);
    const [h1, h2, h3] = heroes;
    if (h1 === undefined || h2 === undefined || h3 === undefined || heroes.length !== 4) throw new Error('Not a Roster of four');
    const hold = (holder: { regard: RegardMap }, id: EntityId, value: number): void => {
      holder.regard[id] = { value, since: 0, reason: 'quest.resolved' };
    };
    hold(h1, h2.id, 15);
    hold(h2, h1.id, 15); // close
    hold(h1, h3.id, 10); // with none back, a mean of 5: warm
    hold(h2, h3.id, -20);
    hold(h3, h2.id, -20); // hostile
    const guildmaster = world.guildmasters[fixed.player.guildmasterId];
    const [p1, p2] = Object.keys(world.patrons).sort(compareByCodeUnit) as EntityId[];
    if (guildmaster === undefined || p1 === undefined || p2 === undefined) throw new Error('No Guildmaster or Patrons');
    hold(guildmaster, p1, 5); // warm
    hold(guildmaster, p2, -13); // hostile
    hold(guildmaster, h1.id, 12); // close
    hold(guildmaster, h2.id, 0); // neutral
    hold(guildmaster, makeId('guildmasters', 2), 20); // neither a Patron nor a Hero: counted in neither
    return { ...fixed, heroes };
  }

  test("regardSnapshot: the Relationships within the player's Roster, pair by pair, and its Guildmaster's Regard for Patrons and Heroes", () => {
    const { document } = regardFixture('counters-regard');

    expect(regardSnapshot(document.world, regardDeps.config)).toEqual({
      // Four Heroes, six pairs: three set, and three between Heroes holding nothing for each other.
      relationships: bands({ close: 1, warm: 1, hostile: 1, neutral: 3 }),
      guildmasterForPatrons: bands({ warm: 1, hostile: 1 }),
      guildmasterForHeroes: bands({ close: 1, neutral: 1 }),
    });
  });

  test("the census takes it as year 10 begins, and at no other year's start", () => {
    const { document, heroes } = regardFixture('counters-regard-census');
    const { world } = document;
    const observations = emptyObservations();
    for (let year = 0; year < 10; year += 1) {
      world.turn = year * 30;
      takeCensus(observations, world, regardDeps);
      expect(observations.regardAtCountedYear).toBeNull();
    }
    world.turn = 300;
    takeCensus(observations, world, regardDeps);

    expect(observations.rosters).toHaveLength(11);
    expect(observations.regardAtCountedYear).toEqual(regardSnapshot(world, regardDeps.config));
    expect(observations.regardAtCountedYear?.relationships.close).toBe(1);

    // Year 11's census leaves it as year 10 found it.
    for (const hero of heroes) hero.regard = {};
    world.turn = 330;
    takeCensus(observations, world, regardDeps);
    expect(observations.rosters).toHaveLength(12);
    expect(observations.regardAtCountedYear?.relationships.close).toBe(1);
  });
});
