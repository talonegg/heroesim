import { loadContent } from '@heroesim/content/node';
import { defaultConfig, timeOfDay, type EngineDeps } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { kindOf, sections, sweepTotals, type Counter } from './counter.js';
import { gameCounters, type SweepTotals } from './game-counters.js';
import { coreCounters } from './module-report.js';
import { playReport } from './play-report.js';
import { machine, whole } from './report.js';
import { compareRuns, runReport } from './run-report.js';
import { seedNames } from './seeds.js';
import { sweepPlay, sweepPlayInParallel } from './sweep.js';

// The harness's counters, each declared once (DL-239): a counter is gathered, totalled, compared and
// reported from its declaration, and nothing else is written for it.

const content = loadContent();
const deps: EngineDeps = { config: { ...defaultConfig }, content };
/** Twenty Days: long enough for Parties to leave and come home, and short for `npm test`. */
const years = 60 / deps.config.turnsPerYear;
const seeds = seedNames(2);

/** A total of `totals`, by a key no core counter has. */
const totalOf = (totals: unknown, key: string): number => (totals as Record<string, number>)[key] ?? Number.NaN;

/** A counter read from the History once a game stops: every Quest the History saw resolved. */
const questsEnded: Counter<number, number> = {
  key: 'questsEnded',
  kind: 'play',
  read: (document) => document.history.byType['quest.resolved']?.length ?? 0,
  zero: () => 0,
  section: 'counters',
  lines: (totals) => [`Quests ended, counted by a test's counter: ${whole(totalOf(totals, 'questsEnded'))}.`, ''],
};

/** A counter gathered by its own observer as a game is played: the afternoons it played, the most of any game. */
const afternoonsPlayed: Counter<number, number> = {
  key: 'afternoonsPlayed',
  kind: 'measure',
  observe() {
    let afternoons = 0;
    return {
      advanced: ({ after }) => {
        if (timeOfDay(after.world.turn) === 'afternoon') afternoons += 1;
      },
      value: () => afternoons,
    };
  },
  zero: () => 0,
  fold: 'greatest',
  summary: (totals) => [["Afternoons played, a test's counter: the most of any game", whole(totalOf(totals, 'afternoonsPlayed'))]],
};

const counters = [...gameCounters, questsEnded, afternoonsPlayed];
const sweep = await sweepPlay(seeds, deps, { years, counters });
const context = { milestone: 'v1.1.9-counter-test', startedAt: new Date(2026, 9, 10, 12), machine: machine(), config: deps.config, content };

describe('a counter added in a test', () => {
  test('needs one declaration and nothing else: each game gathers it, the sweep totals it by its fold, and its JSON holds it', () => {
    for (const game of sweep.games) {
      expect((game.counters as unknown as Record<string, unknown>)['questsEnded']).toBeGreaterThan(0);
      // Twenty Days, each with one afternoon.
      expect((game.observations as unknown as Record<string, unknown>)['afternoonsPlayed']).toBe(20);
    }
    const resolved = sweep.games.reduce((sum, game) => sum + game.counters.questsResolved.player.fail + game.counters.questsResolved.player.success + game.counters.questsResolved.player.strong, 0);
    const rivals = sweep.games.reduce((sum, game) => sum + game.counters.questsResolved.rival.fail + game.counters.questsResolved.rival.success + game.counters.questsResolved.rival.strong, 0);
    const totals = sweepTotals(sweep, deps.config.turnsPerYear);
    expect(totalOf(totals, 'questsEnded')).toBe(resolved + rivals);
    expect(totalOf(totals, 'afternoonsPlayed')).toBe(20);
    const json = runReport(sweep, context);
    expect(totalOf(json.totals, 'questsEnded')).toBe(resolved + rivals);
    expect(Object.keys(json.totals).slice(-2)).toEqual(['questsEnded', 'afternoonsPlayed']);
  });

  test('stands in the report: its rows in the Summary, its lines in its section', () => {
    const report = playReport(sweep, { deps, machine: machine(), startedAt: context.startedAt, milestone: context.milestone });
    const line = `Quests ended, counted by a test's counter: ${whole(totalOf(sweepTotals(sweep, deps.config.turnsPerYear), 'questsEnded'))}.`;
    expect(report).toContain(line);
    expect(report.indexOf(line)).toBeGreaterThan(report.indexOf('## Counters'));
    expect(report.indexOf(line)).toBeLessThan(report.indexOf('## Progression'));
    expect(report).toContain("| Afternoons played, a test's counter: the most of any game | 20 |");
    expect(report.indexOf("| Afternoons played, a test's counter")).toBeLessThan(report.indexOf('| Byte equality'));
  });

  test('is compared by its kind: a play counter among the counters, a measure apart', () => {
    const a = runReport(sweep, context);
    const b = structuredClone(a);
    (b.totals as unknown as Record<string, number>)['questsEnded'] = totalOf(a.totals, 'questsEnded') + 3;
    (b.totals as unknown as Record<string, number>)['afternoonsPlayed'] = 21;
    const lines = compareRuns(a, b, counters);
    const ended = totalOf(a.totals, 'questsEnded');
    expect(lines.find((line) => line.startsWith('Counters:'))).toMatch(/^Counters: 1 moved, /);
    expect(lines).toContain(`  questsEnded: ${whole(ended)} → ${whole(ended + 3)} (+3)`);
    const measures = lines.findIndex((line) => line.startsWith('Measures moved'));
    expect(lines[measures]).toMatch(/not play: 1\.$/);
    expect(lines.slice(measures + 1)).toEqual(['  afternoonsPlayed: 20 → 21 (+1)']);
    expect([...coreCounters(a.totals, counters).keys()]).toEqual(expect.arrayContaining(['questsEnded', 'afternoonsPlayed']));
  });

  test("is refused by a sweep shared among child processes, which gather the harness's own", async () => {
    await expect(sweepPlayInParallel(seeds, deps, { years, counters })).rejects.toThrow(RangeError);
  });
});

describe('the kinds', () => {
  test('a timing and a module\'s own are no core counter, and compare leaves them out; a key no counter declares is play', () => {
    const timing: Counter = { key: 'copyTime', kind: 'timing', zero: () => 0 };
    const own: Counter = { key: 'fired', kind: 'module', zero: () => 0 };
    const declared = [...gameCounters, timing, own];
    const totals = { games: 2, copyTime: 3, fired: 4, unknown: 5 } as unknown as SweepTotals;
    expect([...coreCounters(totals, declared).keys()]).toEqual(['games', 'unknown']);
    expect(kindOf(declared, 'unknown')).toBe('play');
    const a = runReport(sweep, context);
    const b = structuredClone(a);
    Object.assign(b.totals, { copyTime: 9, fired: 9 });
    expect(compareRuns(a, b, declared).find((line) => line.startsWith('Counters:'))).toMatch(/^Counters: 0 moved, /);
    expect(compareRuns(a, b, declared).filter((line) => line.startsWith('Measures'))).toEqual([]);
  });
});

describe("the core's counters", () => {
  test('each declared once, gathered one way, and its lines in a section of the report', () => {
    const keys = gameCounters.map((counter) => counter.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const counter of gameCounters) {
      expect(counter.read === undefined || counter.observe === undefined, counter.key).toBe(true);
      // Neither read nor observed, a counter is read from the game's record by its total, or the games' by its `of`.
      if (counter.read === undefined && counter.observe === undefined) expect(counter.total !== undefined || counter.of !== undefined, counter.key).toBe(true);
      if (counter.lines !== undefined) expect(sections, counter.key).toContain(counter.section);
    }
    // The game's ending and last Turn are a game's alone, which other counters total.
    expect(gameCounters.filter((counter) => counter.zero === undefined && counter.of === undefined).map((counter) => counter.key)).toEqual(['ending', 'lastTurn']);
    expect(Object.keys(sweepTotals(sweep, deps.config.turnsPerYear))).toEqual(keys.filter((key) => key !== 'ending' && key !== 'lastTurn').concat('questsEnded', 'afternoonsPlayed'));
  });

  test('of every kind: play, the save\'s size a measure, the World State\'s copy a timing, and the modules\' own', () => {
    const ofKind = (kind: string): string[] => gameCounters.filter((counter) => counter.kind === kind).map((counter) => counter.key);
    expect(ofKind('measure')).toEqual(['saves']);
    expect(ofKind('timing')).toEqual(['worlds']);
    expect(ofKind('module')).toEqual(['moduleEvents', 'moduleEffects']);
  });
});
