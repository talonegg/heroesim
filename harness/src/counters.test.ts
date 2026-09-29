import { loadContent } from '@heroesim/content/node';
import {
  advance,
  append,
  compareByCodeUnit,
  createWorld,
  defaultConfig,
  dispatch,
  dispositionOf,
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
import {
  countGame,
  emptyObservations,
  noConsumables,
  noDisposition,
  noGear,
  noOffers,
  noTransfers,
  noWealth,
  observe,
  playerRanking,
  questsTakenByController,
  regardSnapshot,
  takeCensus,
} from './counters.js';

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

    const { improvementGrades, improvementGradesByDisposition } = countGame(document, shortYears);

    expect(improvementGrades).toEqual({
      player: { infirmary: [0, 0, 1, 0], trainingYard: [0, 1, 0, 0], quarters: [1, 0, 0, 0] },
      // Rivals A, B and the replacement C.
      rival: { infirmary: [2, 1, 0, 0], trainingYard: [3, 0, 0, 0], quarters: [2, 1, 0, 0] },
    });
    // The Rivals again by Disposition (M6, DL-69): A is `ambitious`, B `miserly`, and C inherits B's.
    expect([a, b, c].map((guild) => dispositionOf(guild))).toEqual(['ambitious', 'miserly', 'miserly']);
    const none = { infirmary: [0, 0, 0, 0], trainingYard: [0, 0, 0, 0], quarters: [0, 0, 0, 0] };
    expect(improvementGradesByDisposition).toEqual({
      ambitious: { infirmary: [0, 1, 0, 0], trainingYard: [1, 0, 0, 0], quarters: [1, 0, 0, 0] },
      miserly: { infirmary: [2, 0, 0, 0], trainingYard: [2, 0, 0, 0], quarters: [1, 1, 0, 0] },
      reckless: none,
      steady: none,
    });
  });

  test('no Improvement grades for a game that stopped before year 10', () => {
    const { document } = fixture('counters-short');
    document.world.turn = 299;
    expect(countGame(document, shortYears).improvementGrades).toBeNull();
    expect(countGame(document, shortYears).improvementGradesByDisposition).toBeNull();

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
        wealthDelta: 0,
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

// M5's counters (DL-62), on the same fixture games: the History given by hand the entries each
// counter reads, in the engine's shapes, each naming its Guild in its payload as `emit` does.

describe("M5's counters, from the History", () => {
  const questId = makeId('quests', 900);
  const partyId = makeId('parties', 900);

  test('a new world has spent and taken nothing, awarded no Loot and moved no Item', () => {
    const { document } = fixture('counters-m5-new');
    const counted = countGame(document, shortYears);

    expect(counted.wealth).toEqual({ player: noWealth(), rival: noWealth() });
    expect(counted.loot).toEqual({ player: {}, rival: {} });
    expect(counted.consumables).toEqual({ player: noConsumables(), rival: noConsumables() });
    expect(counted.gear).toEqual({ player: noGear(), rival: noGear() });
    expect(counted.playerQuestsByDifficulty).toBeNull();
    expect(counted.playerQuestsByYear).toBeNull();
  });

  test('Wealth spent by category and taken from Quests and the Market, by controller', () => {
    const { document, player, rivals } = fixture('counters-wealth');
    const heroId = firstHero(player);
    add(document, 3, 'hero.recruited', [heroId, player.id], { heroId, guildId: player.id, fee: 120 });
    add(document, 4, 'hero.recruited', [heroId, rivals[0].id], { heroId, guildId: rivals[0].id, fee: 80 });
    const bought = (turn: number, guild: Guild, quantity: number, unitPrice: number): void => {
      add(document, turn, 'item.bought', [guild.id], {
        guildId: guild.id,
        definitionKey: 'padded-jack',
        quantity,
        unitPrice,
        cost: quantity * unitPrice,
        itemIds: [],
      });
    };
    bought(5, player, 2, 40);
    bought(6, player, 1, 120);
    improved(document, 7, player, 'infirmary', 1);
    improved(document, 8, rivals[1], 'quarters', 1);
    const upkeep = (turn: number, guild: Guild, amount: number): void => {
      add(document, turn, 'guild.upkeep-paid', [guild.id], { guildId: guild.id, amount, wealthAfter: 1000 });
    };
    upkeep(9, player, 70);
    upkeep(9, rivals[0], 90);
    upkeep(9, rivals[1], 60);
    const resolved = (turn: number, guild: Guild, wealthDelta: number): void => {
      add(document, turn, 'quest.resolved', [questId, partyId, guild.id], {
        band: wealthDelta > 0 ? 'success' : 'fail',
        wealthDelta,
        questId,
        partyId,
        guildId: guild.id,
        heroIds: [],
        templateKey: 'escort-the-tithe',
      });
    };
    resolved(10, player, 150);
    resolved(11, player, 0);
    resolved(12, rivals[0], 90);
    const sold = (turn: number, guild: Guild, cause: 'sale' | 'fold', quantity: number, unitPrice: number): void => {
      add(document, turn, 'item.sold', [guild.id], {
        guildId: guild.id,
        definitionKey: 'mail-shirt',
        quantity,
        unitPrice,
        proceeds: quantity * unitPrice,
        itemIds: [],
        cause,
      });
    };
    sold(13, player, 'sale', 2, 60);
    sold(14, rivals[1], 'fold', 1, 300);
    document.world.turn = 20;

    const { wealth } = countGame(document, shortYears);

    expect(wealth).toEqual({
      player: {
        signing: 120,
        transferFeesPaid: 0,
        items: 200,
        itemsBought: 3,
        improvements: 200,
        upkeep: 70,
        questRewards: 150,
        transferFeesTaken: 0,
        sales: { sale: 120, fold: 0 },
        itemsSold: { sale: 2, fold: 0 },
      },
      rival: {
        signing: 80,
        transferFeesPaid: 0,
        items: 0,
        itemsBought: 0,
        improvements: 200,
        upkeep: 150,
        questRewards: 90,
        transferFeesTaken: 0,
        sales: { sale: 0, fold: 300 },
        itemsSold: { sale: 0, fold: 1 },
      },
    });
  });

  test('Loot awarded by controller and table: awards, the Items they gave, and the unique counted apart', () => {
    const { document, player, rivals } = fixture('counters-loot');
    const loot = (turn: number, guild: Guild, lootTableKey: string, quantity: number, unique = false): void => {
      const itemId = unique ? makeId('items', turn) : null;
      add(document, turn, 'quest.loot', [questId, partyId, guild.id, ...(itemId === null ? [] : [itemId])], {
        questId,
        partyId,
        guildId: guild.id,
        lootTableKey,
        definitionKey: unique ? 'barrow-kings-blade' : 'whetstone',
        quantity,
        itemId,
        stackId: unique ? null : makeId('stacks', turn),
      });
    };
    loot(5, player, 'lesser-loot', 3);
    loot(6, player, 'lesser-loot', 1, true);
    loot(7, player, 'greater-loot', 2);
    loot(8, rivals[0], 'greater-loot', 1, true);
    loot(9, rivals[1], 'greater-loot', 4);
    document.world.turn = 20;

    expect(countGame(document, shortYears).loot).toEqual({
      player: { 'lesser-loot': { awards: 2, items: 4, unique: 1 }, 'greater-loot': { awards: 1, items: 2, unique: 0 } },
      rival: { 'greater-loot': { awards: 2, items: 5, unique: 1 } },
    });
  });

  test('consumables carried and expended against the Quests resolved, by controller, effect and definition', () => {
    const { document, player, rivals } = fixture('counters-consumables');
    const heroId = firstHero(player);
    const other = makeId('quests', 901);
    const taken = (turn: number, guild: Guild, id: EntityId, consumables?: { definitionKey: string; quantity: number }[]): void => {
      add(document, turn, 'quest.taken', [id, partyId, guild.id], {
        questId: id,
        partyId,
        guildId: guild.id,
        heroIds: [heroId],
        returnsOnTurn: turn + 5,
        reward: 100,
        ...(consumables === undefined ? {} : { consumables }),
      });
    };
    taken(3, player, questId, [
      { definitionKey: 'whetstone', quantity: 2 },
      { definitionKey: 'healing-draught', quantity: 1 },
    ]);
    taken(4, player, other, []);
    // An entry written before M5-S3 carries nothing.
    taken(5, rivals[0], makeId('quests', 902));
    const expended = (turn: number, id: EntityId, use: object): void => {
      add(document, turn, 'item.expended', [id, partyId, player.id], {
        questId: id,
        partyId,
        guildId: player.id,
        stackId: makeId('stacks', 1),
        ...use,
      });
    };
    expended(8, questId, { definitionKey: 'whetstone', effect: 'bonus', encounterIndex: 0, flat: 3 });
    expended(8, questId, { definitionKey: 'whetstone', effect: 'bonus', encounterIndex: 2, flat: 3 });
    expended(8, questId, { definitionKey: 'healing-draught', effect: 'heal', heroId, days: 5 });
    expended(9, other, { definitionKey: 'grappling-line', effect: 'reroll', encounterIndex: 1, firstRoll: 4 });
    const resolvers: [number, Guild][] = [
      [10, player],
      [11, player],
      [12, player],
      [13, rivals[1]],
    ];
    for (const [turn, guild] of resolvers) {
      add(document, turn, 'quest.resolved', [questId, partyId, guild.id], {
        band: 'success',
        wealthDelta: 0,
        questId,
        partyId,
        guildId: guild.id,
        heroIds: [],
        templateKey: 'escort-the-tithe',
      });
    }
    document.world.turn = 20;

    expect(countGame(document, shortYears).consumables).toEqual({
      player: {
        quests: 3,
        carried: 3,
        expended: 4,
        questsWithAny: 2,
        byEffect: { bonus: 2, reroll: 1, heal: 1 },
        byDefinition: { whetstone: 2, 'healing-draught': 1, 'grappling-line': 1 },
      },
      rival: { ...noConsumables(), quests: 1 },
    });
  });

  test('gear equipped, unequipped and returned by cause, by controller', () => {
    const { document, player, rivals } = fixture('counters-gear');
    const move = (turn: number, type: EngineEventType, guild: Guild, cause?: string): void => {
      const heroId = firstHero(guild);
      const stackId = makeId('stacks', turn);
      add(document, turn, type, [heroId, guild.id, stackId], {
        heroId,
        guildId: guild.id,
        slot: 'armour',
        definitionKey: 'padded-jack',
        itemId: null,
        stackId,
        ...(cause === undefined ? {} : { cause }),
      });
    };
    move(3, 'item.equipped', player);
    move(4, 'item.equipped', player);
    move(5, 'item.unequipped', player);
    move(6, 'item.returned', player, 'died');
    move(7, 'item.equipped', rivals[0]);
    move(8, 'item.returned', rivals[0], 'retired');
    move(9, 'item.returned', rivals[1], 'guild-folded');
    move(10, 'item.returned', rivals[1], 'guild-folded');
    // A Hero's gear goes back to the selling Guild with them transferred (M6-S2, DL-57; the merge, DL-63).
    move(11, 'item.returned', rivals[0], 'transferred');
    document.world.turn = 20;

    expect(countGame(document, shortYears).gear).toEqual({
      player: { equipped: 2, unequipped: 1, returned: { died: 1, retired: 0, 'guild-folded': 0, transferred: 0 } },
      rival: { equipped: 1, unequipped: 0, returned: { died: 0, retired: 1, 'guild-folded': 2, transferred: 1 } },
    });
  });

  test("the player's Quests by the difficulty recorded at dispatch and by year, with the Loot each won; a Rival's and an unrecorded Quest count in neither", () => {
    const { document, player, rivals } = fixture('counters-difficulty');
    const quest = (n: number): EntityId => makeId('quests', n);
    const resolved = (turn: number, guild: Guild, id: EntityId, band: 'fail' | 'success' | 'strong'): void => {
      add(document, turn, 'quest.resolved', [id, partyId, guild.id], {
        band,
        wealthDelta: 0,
        questId: id,
        partyId,
        guildId: guild.id,
        heroIds: [],
        templateKey: 'escort-the-tithe',
      });
    };
    const loot = (turn: number, guild: Guild, id: EntityId, unique: boolean): void => {
      add(document, turn, 'quest.loot', [id, partyId, guild.id], {
        questId: id,
        partyId,
        guildId: guild.id,
        lootTableKey: 'lesser-loot',
        definitionKey: 'whetstone',
        quantity: 1,
        itemId: unique ? makeId('items', turn) : null,
        stackId: unique ? null : makeId('stacks', turn),
      });
    };
    // Year 0 (a year of 30 Turns): an easy Quest, and a hard one that won Loot.
    resolved(5, player, quest(1), 'success');
    resolved(8, player, quest(2), 'strong');
    loot(8, player, quest(2), false);
    // Year 1: a hard Quest winning a unique Item, a harder one failed, and a Quest the loop did not record.
    resolved(35, player, quest(3), 'strong');
    loot(35, player, quest(3), true);
    resolved(38, player, quest(4), 'fail');
    resolved(40, player, quest(5), 'strong');
    loot(40, player, quest(5), false);
    // A Rival's Quest, though the map holds its id, counts nowhere here.
    resolved(41, rivals[0], quest(1), 'strong');
    loot(41, rivals[0], quest(1), false);
    document.world.turn = 60;
    const difficulties = new Map<string, number>([
      [quest(1), 14],
      [quest(2), 55],
      [quest(3), 58],
      [quest(4), 61],
    ]);

    const counted = countGame(document, shortYears, difficulties);

    const tally = (quests: number, difficulty: number, strong: number, loot: number, unique: number) => ({ quests, difficulty, strong, loot, unique });
    const none = tally(0, 0, 0, 0, 0);
    expect(counted.playerQuestsByDifficulty).toEqual([none, tally(1, 14, 0, 0, 0), none, none, none, tally(2, 113, 2, 2, 1), tally(1, 61, 0, 0, 0)]);
    expect(counted.playerQuestsByYear).toEqual([tally(2, 69, 1, 1, 0), tally(2, 119, 1, 1, 1)]);
    // The table counts every award, recorded or not.
    expect(counted.loot.player['lesser-loot']).toEqual({ awards: 3, items: 3, unique: 1 });
  });

  test('refuses an item.sold without a cause, a quest.loot without a table, and an item.expended without an effect', () => {
    const cases: [EngineEventType, object, RegExp][] = [
      ['item.sold', { definitionKey: 'mail-shirt', quantity: 1, unitPrice: 60, proceeds: 60, itemIds: [] }, /item.sold entry 0 has no cause/],
      ['quest.loot', { questId, partyId, definitionKey: 'whetstone', quantity: 1, itemId: null, stackId: null }, /quest.loot entry 0 has no lootTableKey/],
      ['item.expended', { questId, partyId, stackId: makeId('stacks', 1), definitionKey: 'whetstone' }, /item.expended entry 0 has no effect/],
    ];
    for (const [type, payload, message] of cases) {
      const { document, player } = fixture(`counters-malformed-${type}`);
      add(document, 5, type, [player.id], { guildId: player.id, ...payload });
      expect(() => countGame(document, shortYears), type).toThrow(message);
    }
  });
});

// M6's counters (DL-69), on the same fixture games: the fixture's two Rivals are dealt `ambitious`
// and `miserly` (DL-56 item 6), and the entries each counter reads are given by hand in the engine's
// shapes, a Transfer naming its two Guilds in its payload as `makeTransfer` does.

describe("M6's counters, from the History", () => {
  /** Appends a `hero.transferred` and returns its position in the History. */
  function transferred(document: WorldDocument, turn: number, heroId: HeroId, from: Guild, to: Guild, fee: number, offerId: EntityId | null = null): number {
    const position = document.history.entries.length;
    add(document, turn, 'hero.transferred', [heroId, from.id, to.id], { heroId, fromGuildId: from.id, toGuildId: to.id, fee, offerId });
    return position;
  }

  test('a new world has made no Transfer and no offer; every Disposition content holds is listed, with the Rivals dealt it', () => {
    const { document, rivals } = fixture('counters-m6-new');
    expect(rivals.map((guild) => dispositionOf(guild))).toEqual(['ambitious', 'miserly']);
    document.world.turn = 30;

    const counted = countGame(document, shortYears);

    expect(counted.transfers).toEqual({ in: noTransfers(), out: noTransfers(), 'rival-to-rival': noTransfers() });
    expect(Object.values(counted.rivalTransfers)).toEqual([noTransfers(), noTransfers(), noTransfers(), noTransfers()]);
    expect(counted.transfersBySide).toEqual({});
    expect(counted.transfersBack).toBe(0);
    expect(counted.offers).toEqual({});
    expect(counted.marketPurchases).toEqual({});
    expect(counted.dispositions).toEqual({
      ambitious: { ...noDisposition(), guilds: 1, guildYears: 1 },
      miserly: { ...noDisposition(), guilds: 1, guildYears: 1 },
      reckless: noDisposition(),
      steady: noDisposition(),
    });
  });

  test('Transfers by direction, by how those between Rivals happened, by side, back to a seller, and their fees among the Wealth flows', () => {
    const { document, player, rivals } = fixture('counters-transfers');
    const [a, b] = rivals;
    const [h1, h2, h3] = a.rosterIds;
    const [p1] = player.rosterIds;
    if (h1 === undefined || h2 === undefined || h3 === undefined || p1 === undefined) throw new Error('Rosters too small');
    // Turn 3k + 1 is an afternoon, 3k + 2 a night.
    transferred(document, 4, h1, a, b, 100);
    const inDebt = transferred(document, 7, h1, b, a, 120); // h1 back to A, which sold them; B in debt that afternoon
    transferred(document, 8, h2, a, b, 90); // a night: the Generator
    transferred(document, 10, p1, player, a, 200, makeId('offers', 1)); // out of the player's Guild, an offer accepted
    transferred(document, 13, h3, a, player, 150); // into it
    transferred(document, 16, h2, b, a, 50, makeId('offers', 2)); // an offer between Rivals; h2 back to A
    document.world.turn = 20;

    const counted = countGame(document, shortYears, undefined, { questDifficulty: new Map(), sellerInDebt: new Set([inDebt]) });

    expect(counted.transfers).toEqual({
      in: { transfers: 1, fees: 150 },
      out: { transfers: 1, fees: 200 },
      'rival-to-rival': { transfers: 4, fees: 360 },
    });
    expect(counted.rivalTransfers).toEqual({
      afternoon: { transfers: 1, fees: 100 },
      'afternoon-seller-in-debt': { transfers: 1, fees: 120 },
      generator: { transfers: 1, fees: 90 },
      'accepted-offer': { transfers: 1, fees: 50 },
    });
    expect(counted.transfersBySide).toEqual({
      ambitious: { miserly: { transfers: 2, fees: 190 }, player: { transfers: 1, fees: 150 } },
      miserly: { ambitious: { transfers: 2, fees: 170 } },
      player: { ambitious: { transfers: 1, fees: 200 } },
    });
    expect(counted.transfersBack).toBe(2);
    expect(counted.wealth.player).toMatchObject({ transferFeesPaid: 150, transferFeesTaken: 200 });
    expect(counted.wealth.rival).toMatchObject({ transferFeesPaid: 560, transferFeesTaken: 510 });
    // An accepted offer counts among the offers too, for the Guild that made it.
    expect(counted.offers).toEqual({
      ambitious: { player: { ...noOffers(), accepted: 1 }, miserly: { ...noOffers(), accepted: 1 } },
    });

    // Without the play loop's record, every afternoon's Transfer between Rivals counts as the buyer's choice.
    expect(countGame(document, shortYears).rivalTransfers).toMatchObject({
      afternoon: { transfers: 2, fees: 220 },
      'afternoon-seller-in-debt': { transfers: 0, fees: 0 },
    });
  });

  test('Transfer Offers by the Guild that made them and the Guild asked: made, accepted, declined, ended by cause, and standing', () => {
    const { document, player, rivals } = fixture('counters-offers');
    const [a, b] = rivals;
    const [p1, p2, p3, p4] = player.rosterIds;
    if (p1 === undefined || p2 === undefined || p3 === undefined || p4 === undefined) throw new Error('Not a Roster of four');
    const terms = (n: number, maker: Guild, heroId: HeroId, fee: number) => ({
      offerId: makeId('offers', n),
      fromGuildId: player.id,
      toGuildId: maker.id,
      heroId,
      fee,
    });
    const offered = (turn: number, n: number, maker: Guild, heroId: HeroId, fee: number): void => {
      add(document, turn, 'guild.transfer-offered', [makeId('offers', n), heroId, player.id, maker.id], {
        ...terms(n, maker, heroId, fee),
        expiresOnTurn: turn + 8,
      });
    };
    const ended = (turn: number, n: number, maker: Guild, heroId: HeroId, fee: number, cause?: string): void => {
      const type = cause === undefined ? 'guild.transfer-offer-declined' : 'guild.transfer-offer-expired';
      add(document, turn, type, [makeId('offers', n), heroId, player.id, maker.id], {
        ...terms(n, maker, heroId, fee),
        ...(cause === undefined ? {} : { cause }),
      });
    };
    offered(1, 1, a, p1, 200);
    offered(1, 2, a, p2, 180);
    ended(3, 2, a, p2, 180);
    transferred(document, 3, p1, player, a, 200, makeId('offers', 1));
    offered(4, 3, b, p3, 100);
    offered(4, 4, a, p4, 220);
    offered(7, 5, b, p1, 90);
    ended(11, 3, b, p3, 100, 'expired');
    ended(11, 4, a, p4, 220, 'hero-left');
    ended(11, 5, b, p1, 90, 'guild-folded');
    offered(13, 6, a, p2, 150); // still standing when the game stops
    document.world.turn = 15;

    const { offers } = countGame(document, shortYears);

    expect(offers).toEqual({
      ambitious: { player: { made: 4, fees: 750, accepted: 1, declined: 1, ended: { expired: 0, 'hero-left': 1, 'guild-folded': 0 } } },
      miserly: { player: { made: 2, fees: 190, accepted: 0, declined: 0, ended: { expired: 1, 'hero-left': 0, 'guild-folded': 1 } } },
    });
  });

  test("each Disposition's Quests taken with the difficulty the play loop read, resolved, Deaths, recruits, folds and years in play", () => {
    const { document, player, rivals } = fixture('counters-dispositions');
    const [a, b] = rivals;
    const partyId = makeId('parties', 900);
    const quest = (n: number): EntityId => makeId('quests', n);
    const taken = (turn: number, guild: Guild, id: EntityId): void => {
      add(document, turn, 'quest.taken', [id, partyId, guild.id], { questId: id, partyId, guildId: guild.id, heroIds: [], returnsOnTurn: turn + 5 });
    };
    const resolved = (turn: number, guild: Guild, id: EntityId, band: string): void => {
      add(document, turn, 'quest.resolved', [id, partyId, guild.id], {
        band,
        wealthDelta: 0,
        questId: id,
        partyId,
        guildId: guild.id,
        heroIds: [],
        templateKey: 'escort-the-tithe',
      });
    };
    taken(1, a, quest(1));
    taken(1, a, quest(2));
    taken(3, player, quest(4)); // the player's: in no Disposition
    taken(4, b, quest(3));
    resolved(8, a, quest(1), 'strong');
    resolved(9, a, quest(2), 'fail');
    add(document, 9, 'hero.died', [firstHero(a), a.id], { heroId: firstHero(a), questId: quest(2) });
    add(document, 9, 'hero.died', [firstHero(player), player.id], { heroId: firstHero(player), questId: quest(4) });
    resolved(11, b, quest(3), 'success');
    resolved(11, player, quest(4), 'success');
    add(document, 12, 'hero.recruited', [firstHero(b), b.id], { heroId: firstHero(b), guildId: b.id, fee: 80 });
    b.foldedOnTurn = 45;
    add(document, 45, 'guild.folded', [b.id], { guildId: b.id, reason: 'bankruptcy' });
    // Its replacement inherits its Disposition (DL-56 item 7).
    const c: Guild = { ...structuredClone(b), id: makeId('guilds', 90), foundedTurn: 50, foldedOnTurn: null };
    document.world.guilds[c.id] = c;
    document.world.turn = 60;
    const questDifficulty = new Map<string, number>([
      [quest(1), 40],
      [quest(3), 20],
      [quest(4), 99],
    ]);

    const { dispositions } = countGame(document, shortYears, undefined, { questDifficulty, sellerInDebt: new Set() });

    expect(dispositions.ambitious).toEqual({
      ...noDisposition(),
      guilds: 1,
      guildYears: 2,
      questsTaken: 2,
      questsWithDifficulty: 1,
      difficulty: 40,
      questsResolved: { fail: 1, success: 0, strong: 1 },
      deaths: 1,
    });
    expect(dispositions.miserly).toEqual({
      ...noDisposition(),
      guilds: 2,
      guildYears: 1.5 + 10 / 30,
      questsTaken: 1,
      questsWithDifficulty: 1,
      difficulty: 20,
      questsResolved: { fail: 0, success: 1, strong: 0 },
      recruits: 1,
      folds: { retirement: 0, bankruptcy: 1, 'roster-wiped': 0 },
    });
    expect(dispositions.reckless).toEqual(noDisposition());
  });

  test("Market purchases by the buying Guild's side: purchases, Items and cost", () => {
    const { document, player, rivals } = fixture('counters-purchases');
    const bought = (turn: number, guild: Guild, quantity: number, unitPrice: number): void => {
      add(document, turn, 'item.bought', [guild.id], {
        guildId: guild.id,
        definitionKey: 'padded-jack',
        quantity,
        unitPrice,
        cost: quantity * unitPrice,
        itemIds: [],
      });
    };
    bought(1, player, 2, 40);
    bought(4, rivals[0], 1, 120);
    bought(7, rivals[0], 3, 10);
    bought(7, rivals[1], 1, 300);
    document.world.turn = 10;

    expect(countGame(document, shortYears).marketPurchases).toEqual({
      player: { purchases: 1, items: 2, cost: 80 },
      ambitious: { purchases: 2, items: 4, cost: 150 },
      miserly: { purchases: 1, items: 1, cost: 300 },
    });
  });

  test('refuses a hero.transferred naming no Guild, and an offer ended without a cause', () => {
    const { document, player } = fixture('counters-malformed-transfer');
    const heroId = firstHero(player);
    add(document, 5, 'hero.transferred', [heroId, player.id], { heroId, fromGuildId: player.id, toGuildId: makeId('guilds', 99), fee: 10, offerId: null });
    expect(() => countGame(document, shortYears)).toThrow(/hero.transferred entry 0 has no toGuildId naming a Guild/);

    const other = fixture('counters-malformed-offer');
    const [rival] = other.rivals;
    const offerId = makeId('offers', 1);
    const otherHero = firstHero(other.player);
    add(other.document, 5, 'guild.transfer-offer-expired', [offerId, otherHero, other.player.id, rival.id], {
      offerId,
      fromGuildId: other.player.id,
      toGuildId: rival.id,
      heroId: otherHero,
      fee: 10,
    });
    expect(() => countGame(other.document, shortYears)).toThrow(/guild.transfer-offer-expired entry 0 has no cause/);
  });
});

describe("M6's counters, from the World State as each year begins", () => {
  test("playerRanking: the player's Guild's place by Fame and by Wealth among the Guilds in play, by the engine's rankings", () => {
    const { document, player, rivals } = fixture('counters-rankings');
    const { world } = document;
    const [a, b] = rivals;
    player.fame = 10;
    a.fame = 50;
    b.fame = 5;
    player.wealth = 1_000;
    a.wealth = 100;
    b.wealth = 5_000;
    expect(playerRanking(world)).toEqual({ fame: 2, wealth: 2, guilds: 3 });

    // A folded Guild is not ranked (pre-M0 review D6).
    a.foldedOnTurn = 0;
    expect(playerRanking(world)).toEqual({ fame: 1, wealth: 2, guilds: 2 });
  });

  test('the census takes each Rival in play, its Disposition, Roster size and Wealth, and the Rankings, with the Rosters', () => {
    const { document, player, rivals } = fixture('counters-rival-census');
    const { world } = document;
    const [a, b] = rivals;
    a.wealth = 2_000;
    a.rosterIds = a.rosterIds.slice(0, 3);
    player.fame = 1;
    a.fame = 5;
    b.fame = 3;
    expect(b.wealth).toBeLessThan(player.wealth);
    const observations = emptyObservations();
    takeCensus(observations, world, shortYears);
    const miserly = { disposition: 'miserly', heroes: b.rosterIds.length, wealth: b.wealth };
    world.turn = 30;
    b.foldedOnTurn = 20;
    player.wealth = 5_000;
    takeCensus(observations, world, shortYears);
    world.turn = 45;
    takeCensus(observations, world, shortYears);

    expect(observations.rivals).toEqual([[{ disposition: 'ambitious', heroes: 3, wealth: 2_000 }, miserly], [{ disposition: 'ambitious', heroes: 3, wealth: 2_000 }]]);
    expect(observations.rankings).toEqual([
      { fame: 3, wealth: 2, guilds: 3 },
      { fame: 2, wealth: 1, guilds: 2 },
    ]);
    expect(observations.rosters).toHaveLength(2);
  });
});

describe("M9-S1's counters, from the History (DL-101)", () => {
  test('a new world has fallen below the Bankruptcy floor, and recovered, never', () => {
    const { document } = fixture('counters-floor-new');
    const counted = countGame(document, shortYears);

    expect(counted.belowFloor).toEqual({ player: 0, rival: 0 });
    expect(counted.floorRecovered).toEqual({ player: 0, rival: 0 });
  });

  test('guild.below-floor and guild.floor-recovered, by the controller of the Guild each names', () => {
    const { document, player, rivals } = fixture('counters-floor');
    const below = (turn: number, guild: Guild): void =>
      add(document, turn, 'guild.below-floor', [guild.id], { guildId: guild.id, wealth: -5, floor: 0, dueDay: 40 });
    const recovered = (turn: number, guild: Guild): void =>
      add(document, turn, 'guild.floor-recovered', [guild.id], { guildId: guild.id, wealth: 5, floor: 0, belowFloorSince: 2 });
    below(2, player);
    below(2, rivals[0]);
    recovered(5, player);
    below(5, rivals[1]);
    below(8, player);
    recovered(8, rivals[1]);

    const counted = countGame(document, shortYears);

    expect(counted.belowFloor).toEqual({ player: 2, rival: 2 });
    expect(counted.floorRecovered).toEqual({ player: 1, rival: 1 });
  });
});
