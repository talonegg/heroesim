import { createWorld, defaultConfig, playerGuild, type Guild, type WorldSetup } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { creationReport, harnessSetup, sweepCreation, type CreationSweep } from './creation.js';
import { expectChosenAsNone, picturesAside } from './guildmaster-chosen.test-support.js';
import { content, coreDeps as deps, tickingClock } from './harness.test-support.js';
import { playGame } from './play.js';
import { machine } from './report.js';
import { seedNames } from './seeds.js';

// Ordinary tests, run by `npm test`: the engine against the real content, and the creation sweep
// on a handful of seeds. The full sweep is create.harness.test.ts, behind HEROESIM_HARNESS.

// DL-113 item 6: the sweep's player's Guildmaster is 30, so that every sweep game can run
// its twenty years; any age up to 41 plays the same, since age decides nothing but Retirement.
describe("the harness's player's Guildmaster, 30", () => {
  test('harnessSetup gives the age 30, and every game played starts with the Guildmaster at 30', () => {
    expect(harnessSetup.guildmasterAge).toBe(30);
    for (const seed of seedNames(3)) {
      // One Turn: the game's world is created with harnessSetup before its first.
      const { world } = playGame(seed, deps, { years: 1 / deps.config.turnsPerYear }).document;
      const player = playerGuild(world) as Guild;
      expect(world.guildmasters[player.guildmasterId]?.ageAtEntry, seed).toBe(30);
    }
  });

  test("moves no draw: each world is the one drawn with the age left to the seed, but for the Guildmaster's age and the words it chooses", () => {
    const drawnAge: WorldSetup = { ...harnessSetup };
    delete drawnAge.guildmasterAge;
    for (const seed of seedNames(5)) {
      const aged = createWorld(seed, harnessSetup, deps).document;
      const drawn = createWorld(seed, drawnAge, deps).document;
      const player = playerGuild(drawn.world) as Guild;
      const guildmaster = drawn.world.guildmasters[player.guildmasterId];
      if (guildmaster !== undefined) guildmaster.ageAtEntry = 30;
      // The age's band chooses the Appearance's and the Biography's words, by the same draws,
      // and the Portrait, one draw a Guildmaster, among pictures no living Guildmaster has, so the
      // player's may change the Rivals': every Guildmaster's three are set aside.
      expect(picturesAside(aged), seed).toEqual(picturesAside(drawn));
    }
  });
});

// DL-149: "Choose myself" sets every attribute of the player's Guildmaster, and what is
// chosen replaces what is drawn after the draw, so the world a seed makes is otherwise the one "Choose
// for me" makes: the creation hashes, but for the player's Guildmaster, are equal. Over 60 seeds: every
// age, both sexes and both choices of Traits, the thirty settings the seeds go round, each twice; the
// 1,000 of S11 are create.harness.test.ts's (DL-164). Half a second alone, several under the suite's load.
describe('every Guildmaster attribute chosen, against none', () => {
  test('makes the same Rivals, Heroes, Patrons, Board and Market, and every stream where it was, over 60 seeds', { timeout: 30_000 }, () => {
    const { rivalPictureMoved } = expectChosenAsNone(seedNames(60), deps);
    // A Rival's picture fits them among those not in use, so the player's may move one.
    expect(rivalPictureMoved).toBeGreaterThan(0);
  });
});

// DL-52, DL-262: content names a template's Loot table and the config's ladder says at which Tiers a
// Quest carries it. Their agreement is held here, where both are loaded: the core names a table only
// for a template that offers a Tier awarding Loot, so no table it names goes unawarded.
describe("the core content and the default ladder's Loot", () => {
  test('agree: a template names a Loot table only when it offers a Tier whose loot is true', () => {
    const templates = Object.values(content.questTemplates);
    const named = templates.filter((it) => it.lootTableKey !== null);
    const awarding = (it: (typeof templates)[number]): boolean =>
      defaultConfig.tiers.some((tier, index) => tier.loot && index + 1 >= it.tierMin && index + 1 <= it.tierMax);

    expect(named.filter((it) => !awarding(it)).map((it) => it.key)).toEqual([]);
    expect(named.length).toBeGreaterThanOrEqual(2);
    expect(named.length).toBeLessThan(templates.length);
  });
});

describe('sweepCreation', () => {
  const seeds = seedNames(3);
  const sweep = sweepCreation(seeds, deps, { now: tickingClock() });

  test('creates, validates and re-creates every world, finding each byte-identical', () => {
    expect(sweep.refused).toEqual([]);
    expect(sweep.warnings).toEqual({});
    expect(sweep.mismatches).toEqual([]);
    expect(sweep.identical).toBe(3);
    expect(sweep.outOfRange).toEqual([]);
    expect(sweep.firstCreation).toMatchObject({ count: 3, mean: 1 });
    expect(sweep.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(sweepCreation(seeds, deps).fingerprint).toBe(sweep.fingerprint);
    expect(sweepCreation(seedNames(2), deps).fingerprint).not.toBe(sweep.fingerprint);
  });

  test('counts every Guild, Hero and Patron the config asks for', () => {
    const { config } = deps;
    expect(sweep.playerRoster).toMatchObject({ min: config.startingRosterSize, max: config.startingRosterSize });
    expect(sweep.rivals).toMatchObject({ min: config.rivalCount, max: config.rivalCount });
    expect(sweep.rivalRoster.min).toBeGreaterThanOrEqual(config.rivalRosterMin);
    expect(sweep.rivalRoster.max).toBeLessThanOrEqual(config.rivalRosterMax);
    expect(sweep.pool).toMatchObject({ min: config.unattachedPoolSize, max: config.unattachedPoolSize });
    expect(sweep.patrons).toMatchObject({ min: config.patronCount, max: config.patronCount });
    const heroes = Object.values(sweep.heroesByClass).reduce((sum, n) => sum + n, 0);
    expect(heroes).toBe(sweep.heroes.mean * seeds.length);
  });

  test('summarises every Hero Stat for every Class', () => {
    const heroStats = Object.values(content.stats).filter((stat) => stat.owner === 'hero');
    expect(sweep.heroStats.map((stat) => stat.key)).toEqual(heroStats.map((stat) => stat.key));
    for (const stat of sweep.heroStats) {
      expect(Object.keys(stat.byClass)).toEqual(Object.keys(content.classes));
      for (const summary of Object.values(stat.byClass)) expect(summary.count).toBeGreaterThan(0);
    }
  });

  test('finds a world that differs when created again, and where', () => {
    let creations = 0;
    // `createdAt` is read once a creation; a different one each time breaks byte equality.
    const drifting: WorldSetup = {
      ...harnessSetup,
      get createdAt() {
        creations += 1;
        return `run-${creations}`;
      },
    };
    const found = sweepCreation(seedNames(2), deps, { setup: drifting });
    expect(found.identical).toBe(0);
    expect(found.mismatches.map(({ seed }) => seed)).toEqual(['seed-0001', 'seed-0002']);
    for (const { offset } of found.mismatches) expect(offset).toBeGreaterThan(0);
  });

  describe('its report', () => {
    const context = { deps, machine: machine(), startedAt: new Date(2026, 8, 26, 12) };
    const report = creationReport(sweep, context);

    test("lists every Hero Stat's mean per Class, and says no Stat left its range", () => {
      const header = report.split('\n').find((line) => line.startsWith('| Stat |'));
      expect(header).toBe(`| Stat | Area | Range | ${Object.values(content.classes).map((c) => c.name).join(' | ')} |`);
      for (const stat of sweep.heroStats) {
        const row = report.split('\n').find((line) => line.startsWith(`| ${stat.name} |`));
        const cells = row?.split(' | ').slice(3) ?? [];
        expect(cells, stat.key).toHaveLength(Object.keys(content.classes).length);
        for (const cell of cells) expect(cell).toMatch(/^(\*\*)?\d+\.\d\d(\*\*)? ± \d+\.\d\d \(\d+–\d+\)( \|)?$/);
      }
      expect(report).toContain('No Class has a Stat outside its range.');
    });

    test('states the seeds, the byte equality, the fingerprint and the timings', () => {
      expect(report).toContain('3 seeds, `seed-0001` to `seed-0003`');
      expect(report).toContain('| Worlds byte-identical when created again | 3 of 3 |');
      expect(report).toContain(sweep.fingerprint);
      expect(report).toContain('mean 1.000 ms, p99 1.000 ms');
      expect(report).toContain(`Node ${process.version}`);
    });

    test('lists refusals and mismatches when there are any', () => {
      const failing: CreationSweep = {
        ...sweep,
        refused: [{ seed: 'seed-0002', failures: [{ check: 'counter-range', id: '$.world.counters.heroes', detail: 'd' }] }],
        mismatches: [{ seed: 'seed-0003', offset: 120 }],
        identical: 2,
        outOfRange: [{ classKey: 'mage', statKey: 'strength', min: 0, max: 21 }],
      };
      const text = creationReport(failing, context);
      expect(text).toContain('| `seed-0002` | counter-range | `$.world.counters.heroes` | d |');
      expect(text).toContain('| `seed-0003` | 120 |');
      expect(text).toContain('| Mage | strength | 0 | 21 |');
    });
  });
});
