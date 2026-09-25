import { describe, expect, expectTypeOf, test } from 'vitest';
import { createWorld } from './create.js';
import { makeId, type Guild, type Hero } from './document.js';
import { testDeps } from './world.test-support.js';
import {
  baseStat,
  cheapestUnattached,
  effectiveStats,
  offeredQuests,
  playerGuild,
  rankings,
  signingFee,
  signingRefusal,
  unattachedHeroes,
  unsignableHeroes,
  upkeep,
} from './selectors.js';

const setup = { guildmasterName: 'Aldith Barrowby', guildName: 'The Salt Road Guild', createdAt: 'test' };

describe('playerGuild', () => {
  test("is the one Guild the player controls, whatever the Guilds' order", () => {
    const { document } = createWorld('selectors', setup, testDeps());
    const { world } = document;

    expect(playerGuild(world)?.name).toBe('The Salt Road Guild');

    const reordered = Object.fromEntries(Object.entries(world.guilds).reverse());
    expect(playerGuild({ guilds: reordered })?.id).toBe(makeId('guilds', 1));
  });

  test('is undefined in a world without one', () => {
    expect(playerGuild({ guilds: {} })).toBeUndefined();
  });
});

describe('unattachedHeroes', () => {
  test('lists the Heroes on no Roster, in id order', () => {
    const deps = testDeps({ unattachedPoolSize: 5 });
    const { document } = createWorld('selectors', setup, deps);
    const { world } = document;

    const pool = unattachedHeroes(world);
    const onRosters = new Set(Object.values(world.guilds).flatMap((guild) => guild.rosterIds));

    expect(pool).toHaveLength(5);
    expect(pool.every((hero) => hero.guildId === null && !onRosters.has(hero.id))).toBe(true);
    expect(pool.map((hero) => hero.id)).toEqual(pool.map((hero) => hero.id).sort());

    const reversed = Object.fromEntries(Object.entries(world.heroes).reverse()) as Record<string, Hero>;
    expect(unattachedHeroes({ heroes: reversed })).toEqual(pool);
  });

  test('leaves out a Hero on no Roster who has left the pool and whose row stayed (DL-27)', () => {
    const { document } = createWorld('selectors', setup, testDeps({ unattachedPoolSize: 3 }));
    const [first, ...rest] = unattachedHeroes(document.world);
    if (first === undefined) throw new Error('The pool is empty');

    Object.assign(first, { unattachedSince: null, leftPoolOnTurn: 32 });

    expect(unattachedHeroes(document.world)).toEqual(rest);
  });
});

describe('signingFee', () => {
  const deps = testDeps();
  const heroStats = Object.values(deps.content.stats).filter((stat) => stat.owner === 'hero');

  /** A Hero of `level` with every Hero Stat at `value`, and `extra` on top. */
  function hero(level: number, value: number, extra: Record<string, number> = {}): Pick<Hero, 'level' | 'stats'> {
    return { level, stats: { ...Object.fromEntries(heroStats.map((stat) => [stat.key, value])), ...extra } };
  }

  test('is 50 + 25 × Level + the sum of the Stats ÷ 4 with the defaults (INPUTS 4.7)', () => {
    expect(heroStats).toHaveLength(20);
    // Twenty Stats at 8 sum to 160: 50 + 25 + 40.
    expect(signingFee(hero(1, 8), deps)).toBe(115);
    // At Level 3: 50 + 75 + 40.
    expect(signingFee(hero(3, 8), deps)).toBe(165);
  });

  test('rounds down to a whole number, once, at the end', () => {
    const fees = [0, 1, 2, 3, 4].map((more) => signingFee(hero(1, 8, { strength: 8 + more }), deps));
    // The sum is 160 to 164: a quarter of it is 40, 40.25, 40.5, 40.75, 41.
    expect(fees).toEqual([115, 115, 115, 115, 116]);
    expect(fees.every(Number.isInteger)).toBe(true);
  });

  test('reads every number from config', () => {
    const tuned = testDeps({ signingFeeBase: 10, signingFeePerLevel: 7, signingFeeStatDivisor: 3 });
    // 10 + 2 × 7 + floor(20 × 5 / 3) = 10 + 14 + 33.
    expect(signingFee(hero(2, 5), tuned)).toBe(57);
  });

  test("ignores a Stat content lacks, and reads one the Hero lacks as content's default (rule 5)", () => {
    const withUnknown = hero(1, 8, { luck: 100 });
    expect(signingFee(withUnknown, deps)).toBe(115);

    const lacking = hero(1, 8);
    Reflect.deleteProperty(lacking.stats, 'strength');
    // Strength reads as its default, 10: the sum is 162, a quarter 40.5.
    expect(signingFee(lacking, deps)).toBe(115);
    Reflect.deleteProperty(lacking.stats, 'dexterity');
    expect(signingFee(lacking, deps)).toBe(116);
  });
});

describe('baseStat', () => {
  const strength = { key: 'strength', default: 10 };

  test("reads a Hero's stored value", () => {
    expect(baseStat({ strength: 14 }, strength)).toBe(14);
  });

  test("reads a Stat the Hero lacks as the content's default (data-model rule 5)", () => {
    expect(baseStat({ dexterity: 6 }, strength)).toBe(10);
  });

  test("never reads a key of Object.prototype as a Stat's value", () => {
    expect(baseStat({}, { key: 'constructor', default: 7 })).toBe(7);
  });
});

describe('effectiveStats (M4-S2, M4-S5, DL-44)', () => {
  test("is every Hero Stat content defines at its base until something modifies it, a Stat the Hero lacks reading the default, and no Guildmaster Stat", () => {
    const deps = testDeps();
    const { world } = createWorld('effective', setup, deps).document;
    const guild = playerGuild(world) as Guild;
    // No Guildmaster Trait, whose Class Stat bonus would modify it (guildmaster.test.ts tests those).
    for (const guildmaster of Object.values(world.guildmasters)) guildmaster.traits = [];
    const hero = world.heroes[guild.rosterIds[0] as Hero['id']] as Hero;
    Reflect.deleteProperty(hero.stats, 'wits');
    hero.stats['luck'] = 20;

    const stats = effectiveStats(hero, world, deps.content);

    const heroStats = Object.values(deps.content.stats).filter((stat) => stat.owner === 'hero');
    expect(Object.keys(stats).sort()).toEqual(heroStats.map((stat) => stat.key).sort());
    for (const stat of heroStats) expect(stats[stat.key], stat.key).toBe(baseStat(hero.stats, stat));
    expect(stats['wits']).toBe(deps.content.stats['wits']?.default);
  });
});

describe('upkeep', () => {
  test('sums wagePerLevel × Level over the Roster, plus hallMaintenancePerGrade × the summed Hall grades', () => {
    const deps = testDeps({ wagePerLevel: 5, hallMaintenancePerGrade: 10 });
    const { document } = createWorld('upkeep-wages', setup, deps);
    const { world } = document;
    const guild = playerGuild(world) as Guild;
    const [first, second] = guild.rosterIds;
    if (first === undefined || second === undefined) throw new Error('need two Heroes on the Roster');
    (world.heroes[first] as Hero).level = 3;
    (world.heroes[second] as Hero).level = 2;
    guild.hall = { infirmary: 1, trainingYard: 2, quarters: 0 };

    const wages = guild.rosterIds.reduce((total, id) => total + 5 * (world.heroes[id] as Hero).level, 0);

    expect(upkeep(guild, world, deps.config)).toBe(wages + 10 * (1 + 2 + 0));
  });

  test('a fresh Guild has no Hall grade, so Upkeep is wages alone: every Hero starts at Level 1', () => {
    const deps = testDeps({ wagePerLevel: 5, hallMaintenancePerGrade: 10 });
    const { document } = createWorld('upkeep-fresh', setup, deps);
    const { world } = document;
    const guild = playerGuild(world) as Guild;

    expect(upkeep(guild, world, deps.config)).toBe(5 * guild.rosterIds.length);
  });

  test('counts a Hero away on a Quest the same as any other on the Roster: leaving is what removes one', () => {
    const deps = testDeps({ wagePerLevel: 5, hallMaintenancePerGrade: 10 });
    const { document } = createWorld('upkeep-away', setup, deps);
    const { world } = document;
    const guild = playerGuild(world) as Guild;
    const [awayId] = guild.rosterIds;
    if (awayId === undefined) throw new Error('no Hero on the Roster');
    const home = upkeep(guild, world, deps.config);
    (world.heroes[awayId] as Hero).partyId = makeId('parties', 1);

    expect(upkeep(guild, world, deps.config)).toBe(home);
  });

  test('excludes a dead or retired Hero even if their id is still on the Roster', () => {
    const deps = testDeps({ wagePerLevel: 5, hallMaintenancePerGrade: 0 });
    const { document } = createWorld('upkeep-dead', setup, deps);
    const { world } = document;
    const guild = playerGuild(world) as Guild;
    const [deadId, retiredId] = guild.rosterIds;
    if (deadId === undefined || retiredId === undefined) throw new Error('need two Heroes on the Roster');
    (world.heroes[deadId] as Hero).diedOnTurn = 5;
    (world.heroes[retiredId] as Hero).retiredOnTurn = 5;

    const living = guild.rosterIds.filter((id) => id !== deadId && id !== retiredId);
    const expected = living.reduce((total, id) => total + 5 * (world.heroes[id] as Hero).level, 0);
    expect(upkeep(guild, world, deps.config)).toBe(expected);
  });

  test('is a selector: no `upkeep` field on the Guild row, at the type level or in a created world', () => {
    expectTypeOf<Guild>().not.toHaveProperty('upkeep');

    const { document } = createWorld('upkeep-no-field', setup, testDeps());
    for (const guild of Object.values(document.world.guilds)) {
      expect(Object.hasOwn(guild, 'upkeep')).toBe(false);
    }
  });
});

describe('rankings (pulled forward from M3-S5, DL-28)', () => {
  /** Five Guilds whose Fame and Wealth order them differently, with a tie in each. */
  function ranked() {
    const { document } = createWorld('rankings', setup, testDeps());
    const guilds = Object.values(document.world.guilds);
    const measures: [fame: number, wealth: number][] = [
      [3, 100],
      [7, 900],
      [7, 400],
      [1, 900],
      [5, 50],
    ];
    guilds.forEach((guild, index) => {
      const [fame, wealth] = measures[index] ?? [0, 0];
      Object.assign(guild, { fame, wealth });
    });
    return { world: document.world, ids: guilds.map((guild) => guild.id) };
  }

  test('orders every Guild in play by Fame or by Wealth, highest first, ties by Guild id, ranked from 1', () => {
    const { world, ids } = ranked();
    const [g1, g2, g3, g4, g5] = ids;

    expect(rankings(world, 'fame')).toEqual([
      { guildId: g2, value: 7, rank: 1 },
      { guildId: g3, value: 7, rank: 2 },
      { guildId: g5, value: 5, rank: 3 },
      { guildId: g1, value: 3, rank: 4 },
      { guildId: g4, value: 1, rank: 5 },
    ]);
    expect(rankings(world, 'wealth').map((ranking) => ranking.guildId)).toEqual([g2, g4, g3, g1, g5]);
    // The player's Guild, guild-000001, is ranked like any other.
    expect(g1).toBe(makeId('guilds', 1));
  });

  test("leaves out a folded Guild, and does not depend on the Guilds' order in the table", () => {
    const { world, ids } = ranked();
    const [, g2, g3] = ids;
    const folded = world.guilds[g2 ?? makeId('guilds', 0)] as Guild;
    folded.foldedOnTurn = 8;

    const byFame = rankings(world, 'fame');
    expect(byFame.map((ranking) => ranking.guildId)).not.toContain(g2);
    expect(byFame).toHaveLength(ids.length - 1);
    expect(byFame[0]).toEqual({ guildId: g3, value: 7, rank: 1 });

    const reversed = Object.fromEntries(Object.entries(world.guilds).reverse()) as typeof world.guilds;
    expect(rankings({ guilds: reversed }, 'fame')).toEqual(byFame);
  });
});

describe('rankings (M3-S5)', () => {
  /** A created world whose five Guilds are given Fame and Wealth that order them differently. */
  function differing() {
    const deps = testDeps();
    const { document } = createWorld('rankings-s5', setup, deps);
    const { world } = document;
    const player = playerGuild(world) as Guild;
    const rivals = Object.values(world.guilds).filter((guild) => guild.id !== player.id);
    // The player's Guild first by Fame and last by Wealth; the Rivals the other way about.
    Object.assign(player, { fame: 50, wealth: 10 });
    rivals.forEach((guild, index) => Object.assign(guild, { fame: 10 + index, wealth: 1_000 - 100 * index }));
    return { world, player, rivals };
  }

  test("lists every Guild in play once, ordered, the player's Guild ranked by its value like any other", () => {
    const { world, player, rivals } = differing();

    for (const by of ['fame', 'wealth'] as const) {
      const ranked = rankings(world, by);
      const ids = ranked.map((ranking) => ranking.guildId);
      expect(new Set(ids)).toEqual(new Set(Object.keys(world.guilds)));
      expect(ids).toHaveLength(Object.keys(world.guilds).length);
      expect(ranked.map((ranking) => ranking.rank)).toEqual(ranked.map((_, index) => index + 1));
      const values = ranked.map((ranking) => ranking.value);
      expect(values).toEqual([...values].sort((a, b) => b - a));
      for (const ranking of ranked) expect(ranking.value).toBe(world.guilds[ranking.guildId]?.[by]);
    }
    // Top by Fame, bottom by Wealth: where its values put it, not where its controller would.
    expect(rankings(world, 'fame')[0]?.guildId).toBe(player.id);
    expect(rankings(world, 'wealth').at(-1)?.guildId).toBe(player.id);
    expect(rivals).toHaveLength(4);
  });

  test('by: "wealth" and by: "fame" differ on a fixture built to make them differ', () => {
    const { world, player, rivals } = differing();
    const [r1, r2, r3, r4] = rivals.map((guild) => guild.id);

    expect(rankings(world, 'fame').map((ranking) => ranking.guildId)).toEqual([player.id, r4, r3, r2, r1]);
    expect(rankings(world, 'wealth').map((ranking) => ranking.guildId)).toEqual([r1, r2, r3, r4, player.id]);
  });

  test('no rank is stored: the Guild row has no rank, and the Rankings follow Fame as it moves', () => {
    const { world, player } = differing();
    expectTypeOf<Guild>().not.toHaveProperty('rank');
    expect(Object.hasOwn(player, 'rank')).toBe(false);

    player.fame = 0;

    expect(rankings(world, 'fame').at(-1)?.guildId).toBe(player.id);
  });
});

describe('signingRefusal (M3-S5, pre-M0 review B4)', () => {
  // Pinned rather than read from the default, which a balance pass may change.
  const config = { fameRequiredPerLevel: 10 };
  const hero = (level: number) => ({ level });

  test('a Level 1 Hero signs for any Guild, at Fame 0 too', () => {
    expect(signingRefusal({ fame: 0 }, hero(1), config)).toBeNull();
  });

  test('a Level 5 Hero refuses a Guild at Fame 0, naming the Fame asked and the shortfall', () => {
    expect(signingRefusal({ fame: 0 }, hero(5), config)).toEqual({ fameRequired: 40, fame: 0, shortfall: 40 });
  });

  test('raising Fame to fameRequiredPerLevel × (Level − 1) flips the refusal', () => {
    expect(signingRefusal({ fame: 39 }, hero(5), config)).toEqual({ fameRequired: 40, fame: 39, shortfall: 1 });
    expect(signingRefusal({ fame: 40 }, hero(5), config)).toBeNull();
    expect(signingRefusal({ fame: 41 }, hero(5), config)).toBeNull();
  });

  test('reads the multiple from the config: 10 by default (INPUTS 5.6)', () => {
    expect(testDeps().config.fameRequiredPerLevel).toBe(10);
    expect(signingRefusal({ fame: 0 }, hero(3), { fameRequiredPerLevel: 7 })).toMatchObject({ fameRequired: 14 });
    expect(signingRefusal({ fame: 0 }, hero(9), { fameRequiredPerLevel: 0 })).toBeNull();
  });
});

describe('unsignableHeroes (M3-S5)', () => {
  test("is the pool's Heroes who would refuse the Guild's Fame, in id order, whoever the Guild is", () => {
    const deps = testDeps({ fameRequiredPerLevel: 10, unattachedPoolSize: 4 });
    const { document } = createWorld('unsignable', setup, deps);
    const { world } = document;
    const [first, second, third, fourth] = unattachedHeroes(world);
    if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
      throw new Error('A short pool');
    }
    second.level = 3;
    fourth.level = 6;
    const ids = (fame: number) => unsignableHeroes(world, { fame }, deps.config).map((hero) => hero.id);

    expect(ids(0)).toEqual([second.id, fourth.id]);
    expect(ids(20)).toEqual([fourth.id]);
    expect(ids(50)).toEqual([]);
    for (const guild of Object.values(world.guilds)) {
      guild.fame = 0;
      expect(unsignableHeroes(world, guild, deps.config)).toEqual([second, fourth]);
    }
  });
});

describe('cheapestUnattached (DL-38)', () => {
  // Negotiation still (M4-S5): these tests are about who is cheapest and who would sign.
  const deps = testDeps({ fameRequiredPerLevel: 10, unattachedPoolSize: 4, negotiationRange: 0 });

  function pool() {
    const { document } = createWorld('cheapest', setup, deps);
    const heroes = unattachedHeroes(document.world);
    if (heroes.length !== 4) throw new Error('A short pool');
    // Stats that set the fees: 50 + 25 × Level + the Stats' sum ÷ 4 (INPUTS 4.7).
    const statsAt = (value: number) => Object.fromEntries(Object.keys(heroes[0]?.stats ?? {}).map((key) => [key, value]));
    heroes.forEach((hero, index) => (hero.stats = statsAt([12, 8, 8, 10][index] ?? 10)));
    const guildmasterId = playerGuild(document.world)?.guildmasterId ?? makeId('guildmasters', 0);
    return { world: document.world, heroes: heroes as [Hero, Hero, Hero, Hero], guildmasterId };
  }

  test('is the Hero with the lowest fee, the lowest id among equal fees, with that fee', () => {
    const { world, heroes } = pool();
    const [, second] = heroes;

    expect(cheapestUnattached(world, deps)).toEqual({ hero: second, fee: signingFee(second, deps) });
    expect(signingFee(second, deps)).toBe(signingFee(heroes[2], deps));
  });

  test("given a Guild, passes over a Hero who would refuse its Fame, and is null when none would sign", () => {
    const { world, heroes, guildmasterId } = pool();
    const [first, second, third, fourth] = heroes;
    second.level = 2; // asks Fame 10, and now costs 25 more
    third.level = 2;

    expect(cheapestUnattached(world, deps, { fame: 0, guildmasterId })?.hero).toBe(fourth);
    expect(cheapestUnattached(world, deps, { fame: 10, guildmasterId })?.hero).toBe(fourth);
    expect(cheapestUnattached(world, deps)?.hero).toBe(fourth);
    for (const hero of [first, fourth]) hero.level = 3;
    expect(cheapestUnattached(world, deps, { fame: 0, guildmasterId })).toBeNull();
    expect(cheapestUnattached(world, deps, { fame: 10, guildmasterId })?.hero).toBe(second);
    // Without a Guild, Fame is not asked: the cheapest in the pool, whoever they would sign for.
    expect(cheapestUnattached(world, deps)?.hero).toBe(second);
  });

  test('is null for an empty pool', () => {
    expect(cheapestUnattached({ heroes: {}, guildmasters: {} }, deps)).toBeNull();
    expect(cheapestUnattached({ heroes: {}, guildmasters: {} }, deps, { fame: 100, guildmasterId: makeId('guildmasters', 0) })).toBeNull();
  });
});

describe('offeredQuests (DL-38)', () => {
  test("is the Board's Quests on offer, in the Board's order, and no other", () => {
    const { document } = createWorld('offered', setup, testDeps());
    const { world } = document;
    const [first, second, third, ...rest] = world.board;
    if (first === undefined || second === undefined || third === undefined) throw new Error('A short Board');
    world.board = [third, first, second, makeId('quests', 999), ...rest];
    (world.quests[first] as { status: string }).status = 'taken';

    expect(offeredQuests(world).map((quest) => quest.id)).toEqual([third, second, ...rest]);
    expect(offeredQuests({ board: [], quests: world.quests })).toEqual([]);
  });
});
