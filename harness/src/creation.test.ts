import { loadContent } from '@heroesim/content/node';
import { createWorld, defaultConfig, validate, type EngineDeps, type WorldSetup } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { creationReport, harnessSetup, sweepCreation, type CreationSweep } from './creation.js';
import { machine } from './report.js';
import { seedNames } from './seeds.js';

// Ordinary tests, run by `npm test`: the engine against the real content, and the creation sweep
// on a handful of seeds. The full sweep is create.harness.test.ts, behind HEROESIM_HARNESS.

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };

/** A clock that advances one millisecond a read, so timings are known. */
function tickingClock(): () => number {
  let t = 0;
  return () => (t += 1);
}

describe('createWorld with the core content', () => {
  // M1-S6's first acceptance box: the engine's own test (create.test.ts) uses its fixture
  // content; this one uses the content the game ships.
  test.each(seedNames(5))('returns a document the validator accepts, with no warning (%s)', (seed) => {
    const { document } = createWorld(seed, harnessSetup, deps);
    expect(validate(document, content)).toEqual({ ok: true, warnings: [] });
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
