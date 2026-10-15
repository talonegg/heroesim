import { timeOfDay } from '@heroesim/engine';
import { describe, expect, test } from 'vitest';
import { kindOf, sections, sweepTotals, type Counter } from './counter.js';
import { noWealth } from './counters.js';
import { gameCounters, type SweepTotals } from './game-counters.js';
import { content, coreDeps, twentyDays } from './harness.test-support.js';
import { coreCounters } from './module-report.js';
import { playReport } from './play-report.js';
import { machine, whole } from './report.js';
import { compareRuns, runReport } from './run-report.js';
import { seedNames } from './seeds.js';
import { sweepPlay, sweepPlayInParallel } from './sweep.js';

// The harness's counters, each declared once (DL-239): a counter is gathered, totalled, compared and
// reported from its declaration, and nothing else is written for it.

const deps = coreDeps;
const years = twentyDays;
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

// DL-265: Death by Tier, a column of the Quests by Tier.
describe('the Quests by Tier', () => {
  test("give each controller's Deaths at each Tier, and a Quest's", () => {
    const counter = gameCounters.find((it) => it.key === 'questTiers');
    if (counter?.lines === undefined) throw new Error('No questTiers counter');
    // Two of each side's Quests still away, so a Quest's Deaths are over those resolved, not those taken.
    const side = (resolved: number, deaths: number) => ({
      taken: resolved + 2, heroes: 2 * resolved, days: 10 * resolved, resolved, resolvedDays: 10 * resolved, fail: 0, success: resolved, strong: 0, wealth: 0, xp: 0, loot: 0, deaths,
    });
    const totals = { questTiers: { '3': { offered: 40, byController: { player: side(20, 0) } }, '4': { offered: 10, byController: { player: side(8, 2), rival: side(4, 1) } } } };

    const lines = counter.lines(totals as unknown as SweepTotals, {} as never).flatMap((text) => text.split('\n'));
    const cells = (label: string): string[] | undefined => lines.find((line) => line.startsWith(`| ${label} `))?.split('|').map((cell) => cell.trim()).slice(1, -1);

    const head = cells('Controller: Tier');
    expect(head?.slice(-2)).toEqual(['Deaths', 'Deaths a Quest']);
    expect(cells("The player's Guild: Tier 3")?.slice(-2)).toEqual(['0', '0.000']);
    expect(cells("The player's Guild: Tier 4")?.slice(-2)).toEqual(['2', '0.250']);
    expect(cells('The Rivals: Tier 4')?.slice(-2)).toEqual(['1', '0.250']);
    expect(cells("The player's Guild: every Tier")?.slice(-2)).toEqual(['2', '0.071']);
  });
});

// DL-302: the Wealth by line, and each side's shares of what it spent and took.
describe('the Wealth spent and taken', () => {
  test("give each line, the Hall's charge as its two parts, and the shares of spending across the seven expense lines and of taking across the three income lines", () => {
    const counter = gameCounters.find((it) => it.key === 'wealth');
    if (counter?.lines === undefined) throw new Error('No wealth counter');
    const player = {
      ...noWealth(),
      wages: 600,
      hallUpkeep: 100,
      improvementUpkeep: 50,
      items: 100,
      improvements: 100,
      signing: 25,
      transferFeesPaid: 25,
      questRewards: 700,
      transferFeesTaken: 100,
      sales: { sale: 100, fold: 100 },
    };
    const totals = { wealth: { player, rival: noWealth() }, guildYears: { player: [1], rival: [2] } };

    const lines = counter.lines(totals as unknown as SweepTotals, {} as never).flatMap((text) => text.split('\n'));
    const cells = (label: string): string[] | undefined => lines.find((line) => line.startsWith(`| ${label} `))?.split('|').map((cell) => cell.trim()).slice(1, -1);

    expect(cells("Spent: Upkeep, the Hall's (`guild.hall-upkeep-paid` `amount`, less the Improvements')")?.slice(1, 3)).toEqual(['100', '100.0']);
    expect(cells("Spent: Upkeep, the Improvements' (`guild.hall-upkeep-paid` `facilities` × `traitFactor`, rounded)")?.slice(1, 3)).toEqual(['50', '50.0']);
    expect(cells('Spent: Upkeep in all')?.slice(1, 3)).toEqual(['750', '750.0']);
    expect(cells('Spent in all')?.slice(1, 3)).toEqual(['1,000', '1,000.0']);
    expect(cells('Taken in all')?.slice(1, 3)).toEqual(['1,000', '1,000.0']);
    expect(lines).toContain(
      "Shares of the Wealth spent: The player's Guild: wages 60.0%, Hall upkeep 10.0%, Improvements’ upkeep 5.0%, Items 10.0%, " +
        'Improvements 10.0%, signing 2.5%, Transfers 2.5%; The Rivals: wages —, Hall upkeep —, Improvements’ upkeep —, Items —, ' +
        'Improvements —, signing —, Transfers —.',
    );
    expect(lines).toContain(
      "Shares of the Wealth taken: The player's Guild: Quest rewards 70.0%, Item sales 20.0%, Transfers 10.0%; The Rivals: Quest rewards —, Item sales —, Transfers —.",
    );
  });
});

// DL-271: the Board's top Tier and each side's best four, as each year begins.
describe("the Tiers unlocked", () => {
  test("total each year's top Tier a game at its Tier, and give each side's mean best four and unlocked Tier over the games", () => {
    const counter = gameCounters.find((it) => it.key === 'tierUnlocks');
    if (counter?.lines === undefined) throw new Error('No tierUnlocks counter');
    const tiers = (counts: Record<number, number>): number[] => [1, 2, 3, 4, 5].map((tier) => counts[tier] ?? 0);
    const game = (seed: string, tierUnlocks: unknown) => ({ seed, counters: {}, observations: { tierUnlocks } });
    const games = [
      game('a', [
        { top: 1, sides: { player: { guilds: 1, levels: 1, unlocked: tiers({ 1: 1 }) } } },
        { top: 3, sides: { player: { guilds: 1, levels: 6.5, unlocked: tiers({ 3: 1 }) }, ambitious: { guilds: 2, levels: 7, unlocked: tiers({ 2: 2 }) } } },
      ]),
      game('b', [{ top: 1, sides: { player: { guilds: 1, levels: 2, unlocked: tiers({ 1: 1 }) } } }]),
    ];
    const totals = sweepTotals({ counters: [counter], games, years: 2 } as never, 10) as unknown as SweepTotals;

    expect(totals.tierUnlocks).toEqual([
      { games: 2, top: [2], sides: { player: { guilds: 2, levels: 3, unlocked: tiers({ 1: 2 }) } } },
      { games: 1, top: [0, 0, 1], sides: { player: { guilds: 1, levels: 6.5, unlocked: tiers({ 3: 1 }) }, ambitious: { guilds: 2, levels: 7, unlocked: tiers({ 2: 2 }) } } },
    ]);
    const lines = counter.lines(totals, {} as never).flatMap((text) => text.split('\n'));
    const rows = (start: string): string[][] => lines.filter((line) => line.startsWith(`| ${start} `)).map((line) => line.split('|').map((cell) => cell.trim()).slice(1, -1));
    // The top Tier: the games, the mean top Tier, and the games at each Tier.
    expect(rows('0')[0]).toEqual(['0', '2', '1.00', '2 (100.0%)', '0 (0.0%)', '0 (0.0%)', '0 (0.0%)', '0 (0.0%)']);
    expect(rows('1')[0]).toEqual(['1', '1', '3.00', '0 (0.0%)', '0 (0.0%)', '1 (100.0%)', '0 (0.0%)', '0 (0.0%)']);
    // Each side: its Guilds, the mean best four, the mean unlocked Tier, and the Guilds at each.
    expect(rows('1').slice(1).map((row) => row.slice(1, 6))).toEqual([
      ["The player's Guild", '1', '6.50', '3.00', '0 (0.0%)'],
      ['`ambitious`', '2', '3.50', '2.00', '0 (0.0%)'],
    ]);
  });
});
