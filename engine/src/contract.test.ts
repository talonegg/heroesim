import { describe, expect, test } from 'vitest';
import type { GameConfig } from './config.js';
import { contractWage, foundingContract, signContract } from './contract.js';
import { createWorld } from './create.js';
import type { Guild, Guildmaster, Hero, World } from './document.js';
import { feeFactor, guildmasterOf } from './guildmaster.js';
import { playerGuild, wages } from './selectors.js';
import { dayOf, daysPerYear } from './time.js';
import { testDeps } from './world.test-support.js';

// DL-294 item 6, DL-311 item 2, DL-315: a Contract's wage set at signing by one rule, its length chosen,
// and the founding Contracts drawn on their own stream.

const setup = { guildmasterName: 'Aldith Barrowby', guildName: 'The Salt Road Guild', createdAt: 'test' };

/** A world with the player's Guild, its Guildmaster's Negotiation at `negotiation`, its Fame `fame`. */
function signing(overrides: Partial<GameConfig> = {}, { negotiation = 10, fame = 0 } = {}) {
  const deps = testDeps({ negotiationRange: 0, ...overrides });
  const { world } = createWorld('contract-wage', setup, deps).document;
  const guild = playerGuild(world) as Guild;
  guild.fame = fame;
  (world.guildmasters[guild.guildmasterId] as Guildmaster).stats.negotiation = negotiation;
  return { deps, world, guild };
}

/** A Hero of `level` with every Hero Stat at `value`, and `extra` on top: 20 Hero Stats in the test content. */
function heroOf(world: World, level: number, value: number, extra: Record<string, number> = {}): Hero {
  const hero = structuredClone(Object.values(world.heroes)[0] as Hero);
  hero.level = level;
  hero.stats = Object.fromEntries(Object.keys(hero.stats).map((key) => [key, value]));
  Object.assign(hero.stats, extra);
  return hero;
}

describe('contractWage, the wage rule (DL-294 item 6)', () => {
  test('the content has 20 Hero Stats, every sum below read from them', () => {
    const { world } = signing();
    expect(Object.keys(heroOf(world, 1, 8).stats)).toHaveLength(20);
  });

  test('each term: wageBase + wagePerLevel × Level + Stat sum ÷ wageStatDivisor + wageFameFactor × the Guild\'s Fame', () => {
    const { deps, world, guild } = signing({ wageBase: 7, wagePerLevel: 20, wageStatDivisor: 40, wageFameFactor: 0.5 }, { fame: 10 });
    // 7 + 20 × 3 + 160 ÷ 40 + 0.5 × 10 = 7 + 60 + 4 + 5.
    expect(contractWage(world, heroOf(world, 3, 8), guild, 1, deps)).toBe(76);
    expect(contractWage(world, heroOf(world, 3, 8), guild, 1, { ...deps, config: { ...deps.config, wageBase: 0 } })).toBe(69);
    expect(contractWage(world, heroOf(world, 4, 8), guild, 1, deps)).toBe(96);
    expect(contractWage(world, heroOf(world, 3, 10), guild, 1, deps)).toBe(77);
    guild.fame = 30;
    expect(contractWage(world, heroOf(world, 3, 8), guild, 1, deps)).toBe(86);
  });

  test("the length's factor, each length's in contractLengthsYears' order", () => {
    const { deps, world, guild } = signing({ wageBase: 7, wagePerLevel: 20, wageStatDivisor: 40, wageFameFactor: 0.5 }, { fame: 10 });
    const hero = heroOf(world, 3, 8);
    // 76 × 1, × 0.95 = 72.2 and × 0.9 = 68.4.
    expect([1, 2, 3].map((years) => contractWage(world, hero, guild, years, deps))).toEqual([76, 72, 68]);
    const reordered = { ...deps, config: { ...deps.config, contractLengthsYears: [3, 1, 2], contractWageFactors: [0.5, 1, 0.75] } };
    expect([1, 2, 3].map((years) => contractWage(world, hero, guild, years, reordered))).toEqual([76, 57, 38]);
  });

  test('a length not offered is a programming error: the actions refuse it first', () => {
    const { deps, world, guild } = signing();
    expect(() => contractWage(world, heroOf(world, 1, 8), guild, 4, deps)).toThrow(RangeError);
  });

  test("the buyer's Negotiation, as the signing fee reads it: 1 − negotiation", () => {
    const tough = signing({ negotiationRange: 0.1 }, { negotiation: 20 });
    const soft = signing({ negotiationRange: 0.1 }, { negotiation: 1 });
    const hero = heroOf(tough.world, 5, 8);
    // 20 × 5 + 4 = 104: × 0.9 at the top of Negotiation's range, × 1.1 at its bottom.
    expect(feeFactor(guildmasterOf(tough.guild, tough.world), tough.deps.content, tough.deps.config)).toBeCloseTo(0.9);
    expect(contractWage(tough.world, hero, tough.guild, 1, tough.deps)).toBe(93);
    expect(contractWage(soft.world, hero, soft.guild, 1, soft.deps)).toBe(114);
  });

  test('rounded down once, at the end, to whole Silver', () => {
    const { deps, world, guild } = signing();
    // A Stat sum of 130: 20 + 3.25 = 23.25, × 0.95 = 22.09, so 22; a Stat part rounded first would give 21.
    const hero = heroOf(world, 1, 6, { strength: 16 });
    expect(contractWage(world, hero, guild, 2, deps)).toBe(22);
    expect(contractWage(world, hero, guild, 1, deps)).toBe(23);
    // §2's Level 8 Hero, a Stat sum of 200: 165 × 0.95 = 156.75, so 156.
    expect(contractWage(world, heroOf(world, 8, 10), guild, 2, deps)).toBe(156);
    for (const years of [1, 2, 3]) expect(Number.isSafeInteger(contractWage(world, heroOf(world, 2, 7, { wits: 9 }), guild, years, deps))).toBe(true);
  });
});

describe('signContract', () => {
  test("sets the wage by the rule, the Turn signed, the length, and the end Day the term's years of Days on", () => {
    const { deps, world, guild } = signing();
    world.turn = 100;
    const hero = world.heroes[guild.rosterIds[0] as Hero['id']] as Hero;
    const contract = signContract(world, hero, guild, 2, deps);
    expect(contract).toEqual({ wage: contractWage(world, hero, guild, 2, deps), signedOnTurn: 100, years: 2, endDay: dayOf(100) + 2 * 360 });
    expect(hero.contract).toBe(contract);
  });

  test("reads a year's Days from turnsPerYear, never a constant", () => {
    const { deps, world, guild } = signing({ turnsPerYear: 30 });
    const hero = world.heroes[guild.rosterIds[0] as Hero['id']] as Hero;
    expect(daysPerYear(deps.config)).toBe(10);
    expect(signContract(world, hero, guild, 3, deps).endDay).toBe(dayOf(world.turn) + 30);
  });

  test('a Level gained leaves the wage as signed', () => {
    const { deps, world, guild } = signing();
    const before = wages(guild, world);
    for (const heroId of guild.rosterIds) (world.heroes[heroId] as Hero).level += 3;
    expect(wages(guild, world)).toBe(before);
    const hero = world.heroes[guild.rosterIds[0] as Hero['id']] as Hero;
    expect(signContract(world, hero, guild, 1, deps).wage).toBeGreaterThan(0);
    expect(wages(guild, world)).toBeGreaterThan(before);
  });
});

describe('the founding Contracts (Q-E, DL-311 item 2)', () => {
  const deps = testDeps();

  test('every founding Roster Hero holds one; its length drawn from the list, its end Day over its term; no pool Hero holds one', () => {
    const { world } = createWorld('contracts-pin', setup, deps).document;
    const perYear = daysPerYear(deps.config);
    const onRosters = Object.values(world.guilds).flatMap((guild) => guild.rosterIds);
    for (const hero of Object.values(world.heroes)) {
      if (!onRosters.includes(hero.id)) {
        expect(hero.contract, hero.id).toBeNull();
        continue;
      }
      const { contract } = hero;
      expect(contract?.signedOnTurn).toBe(0);
      expect(deps.config.contractLengthsYears).toContain(contract?.years);
      expect(contract?.endDay).toBeGreaterThan(0);
      expect(contract?.endDay).toBeLessThanOrEqual((contract?.years ?? 0) * perYear);
    }
  });

  test('pinned on a seed: the lengths and end Days spread over their terms, and the generation stream unmoved', () => {
    const { world } = createWorld('contracts-pin', setup, deps).document;
    const contracts = Object.values(world.heroes).flatMap((hero) => (hero.contract === null ? [] : [hero.contract]));
    expect(contracts).toHaveLength(28);
    const lengths = contracts.map((contract) => contract.years);
    for (const years of [1, 2, 3]) expect(lengths.filter((length) => length === years).length, `${years} years`).toBeGreaterThanOrEqual(5);
    // Spread over the term: some in its first half, some in its second, and no two Rosters' alike.
    const shares = contracts.map((contract) => contract.endDay / (contract.years * 360));
    expect(shares.filter((share) => share <= 0.5).length).toBeGreaterThanOrEqual(7);
    expect(shares.filter((share) => share > 0.5).length).toBeGreaterThanOrEqual(7);
    expect(new Set(contracts.map((contract) => contract.endDay)).size).toBeGreaterThanOrEqual(25);
    // The generation stream as it stood before the founding Contracts were drawn (config 34, schema 13).
    expect(world.rng.generation).toEqual([2131008517, 3361240470, 3580357594, 284793059]);
    expect(Object.values(world.heroes).map((hero) => hero.name).slice(0, 4)).toEqual(['Brynja Garside', 'Gyda Hallam', 'Hakon Carrick', 'Hakon Fenwick']);
  });

  test('two draws from contracts a Hero, whatever is drawn', () => {
    const { world } = createWorld('contracts-pin', setup, deps).document;
    const guild = playerGuild(world) as Guild;
    const hero = world.heroes[guild.rosterIds[0] as Hero['id']] as Hero;
    const before = structuredClone(world.rng.contracts);
    const again = structuredClone(world);
    foundingContract(world, hero, guild, deps);
    const fewer = { ...deps, config: { ...deps.config, contractLengthsYears: [1], contractWageFactors: [1] } };
    foundingContract(again, again.heroes[hero.id] as Hero, again.guilds[guild.id] as Guild, fewer);
    expect(world.rng.contracts).not.toEqual(before);
    expect(again.rng.contracts).toEqual(world.rng.contracts);
  });
});
