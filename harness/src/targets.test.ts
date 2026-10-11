import { describe, expect, test } from 'vitest';
import { sweepTotals } from './counter.js';
import type { SweepTotals } from './game-counters.js';
import { coreDeps as deps, content, twentyDays as years } from './harness.test-support.js';
import type { GameRecord } from './play.js';
import { machine } from './report.js';
import { runReport, type RunReport } from './run-report.js';
import { seedNames } from './seeds.js';
import { sweepPlay } from './sweep.js';
import { bandText, inside, ratioError, targets, targetsOf, targetsSection, type Target } from './targets.js';

// The report's Targets (DL-259): DL-83's bands, the player's Deaths by DL-256 item 10 (DL-257 item 7),
// and DL-69 item 4's lines, each declared once, measured with its standard error, beside a baseline
// run's value, inside or outside; and the Quest weight beside them.

const sweep = await sweepPlay(seedNames(2), deps, { years });
const turnsPerYear = deps.config.turnsPerYear;

describe('the bands', () => {
  test("every DL-83 band, the player's Deaths by DL-256 item 10, and DL-69 item 4's lines, each once with its source", () => {
    const listed = targets(['ambitious', 'steady']).map((target) => [target.key, target.source, bandText(target)]);
    expect(listed).toEqual([
      ['bankruptOrWiped', 'DL-83 item 2', '5.0% to 15.0%'],
      ['firstByFame', 'DL-83 item 3, DL-91 item 2', '40.0% to 60.0%'],
      ['firstByWealth', 'DL-83 item 3, DL-91 item 2', '40.0% to 60.0%'],
      ['failed', 'DL-83 item 4', '20.0% to 30.0%'],
      ['strong', 'DL-83 item 4', 'at most 50.0%'],
      ['rivalFolds', 'DL-83 item 5', '1.50 to 3.50'],
      ['deaths', 'DL-256 item 10, DL-257 item 7', '3.00 to 8.00'],
      ['wealthMonths', 'DL-83 item 7', '6.00 to 12.00'],
      ['meanLevel', 'DL-83 item 21', '8.00 to 10.00'],
      ['highestLevel', 'DL-83 item 22', '14.00 to 17.00'],
      ['hoarding:ambitious', 'DL-69 item 4', 'under 50.0%'],
      ['hoarding:steady', 'DL-69 item 4', 'under 50.0%'],
      ['transfersBack', 'DL-69 item 4', 'under 15.0%'],
      ['transfersBackSoon', 'DL-69 item 4', 'none'],
      ['transfersShort', 'DL-69 item 4', 'none'],
    ]);
  });

  test("a band's ends are inside it, but an `under`'s", () => {
    const band = (shape: Target['band']): Target => ({ ...(targets([])[0] as Target), band: shape });
    expect(inside(band({ atLeast: 3, atMost: 8 }), 3)).toBe(true);
    expect(inside(band({ atLeast: 3, atMost: 8 }), 8)).toBe(true);
    expect(inside(band({ atLeast: 3, atMost: 8 }), 2.99)).toBe(false);
    expect(inside(band({ atLeast: 3, atMost: 8 }), 8.01)).toBe(false);
    expect(inside(band({ under: 0.5 }), 0.5)).toBe(false);
    expect(inside(band({ under: 0.5 }), 0.49)).toBe(true);
    expect(inside(band({ atMost: 0 }), 0)).toBe(true);
  });
});

describe('what each target reads', () => {
  /** Totals holding only what the targets read, as a report's JSON would. */
  const totals = {
    games: 10,
    endings: { bankruptcy: 1, 'roster-wiped': 2, survived: 7 },
    rankings: [
      { games: 10, fame: [10], wealth: [10] },
      { games: 10, fame: [4, 6], wealth: [7, 3] },
      { games: 8, fame: [2, 6], wealth: [1, 7] },
    ],
    questsResolved: { player: { fail: 2, success: 3, strong: 5 } },
    rivalFolds: { steady: 20, miserly: 5 },
    heroesDied: { player: 45, rival: 300 },
    playerWealthMonths: [{ games: 10, months: 1000 }, { games: 10, months: 1000 }, { games: 10, months: 60 }, { games: 8, months: 120 }],
    rosters: Array.from({ length: 12 }, (_, year) => ({ games: 10, player: { levels: year === 10 ? 90 : 1, heroes: 10 } })),
    highestLevels: { player: { games: Array.from({ length: 20 }, (_, year) => (year === 19 ? 8 : 10)), levels: Array.from({ length: 20 }, (_, year) => (year === 19 ? 120 : 1)), highest: [] } },
    rivalsAtFloor: { steady: { starts: 40, hoarding: 10 } },
    transfersBack: 3,
    transfers: { in: { transfers: 0, fees: 0 }, out: { transfers: 0, fees: 0 }, 'rival-to-rival': { transfers: 30, fees: 0 } },
    transfersBackSoon: 2,
    transfersShort: 5,
  } as unknown as SweepTotals;
  const read = (key: string): number | null => {
    const ratio = targets(['steady']).find((target) => target.key === key)?.ratio(totals);
    return ratio === null || ratio === undefined ? null : ratio.n / ratio.of;
  };

  test('each its own sums, as its label says', () => {
    expect(read('bankruptOrWiped')).toBe(0.3);
    // The year-starts after 1 year or more: (4 + 2) / 18 by Fame, (7 + 1) / 18 by Wealth.
    expect(read('firstByFame')).toBe(6 / 18);
    expect(read('firstByWealth')).toBe(8 / 18);
    expect(read('failed')).toBe(0.2);
    expect(read('strong')).toBe(0.5);
    expect(read('rivalFolds')).toBe(2.5);
    expect(read('deaths')).toBe(4.5);
    // After 2 years or more: (60 + 120) / 18.
    expect(read('wealthMonths')).toBe(10);
    expect(read('meanLevel')).toBe(9);
    expect(read('highestLevel')).toBe(15);
    expect(read('hoarding:steady')).toBe(0.25);
    expect(read('transfersBack')).toBe(0.1);
    expect(read('transfersBackSoon')).toBe(0.2);
    expect(read('transfersShort')).toBe(0.5);
  });
});

describe('the standard error', () => {
  test("of a mean over games: the games' standard deviation over the root of their count", () => {
    // 1 and 3: a mean of 2, a standard deviation of √2, over √2 games.
    expect(ratioError([{ n: 1, of: 1 }, { n: 3, of: 1 }])).toBeCloseTo(1, 12);
  });

  test("of a ratio over games, each game a cluster: the spread of each game's part about the ratio", () => {
    const pairs = [
      { n: 2, of: 4 },
      { n: 3, of: 4 },
      { n: 1, of: 2 },
    ];
    // r = 6 / 10; the residuals 2 - 2.4, 3 - 2.4 and 1 - 1.2.
    const r = 0.6;
    const spread = (3 / 2) * ((2 - 4 * r) ** 2 + (3 - 4 * r) ** 2 + (1 - 2 * r) ** 2);
    expect(ratioError(pairs)).toBeCloseTo(Math.sqrt(spread) / 10, 12);
  });

  test('none with fewer than two games, or nothing to divide by', () => {
    expect(ratioError([{ n: 1, of: 1 }])).toBeNull();
    expect(ratioError([{ n: 0, of: 0 }, { n: 0, of: 0 }])).toBeNull();
  });
});

describe("a sweep's Targets", () => {
  /** The sweep's two games, the first bankrupt with 4 of the player's Deaths, the second 2. */
  const games = sweep.games.map((game, index): GameRecord => ({
    ...game,
    counters: { ...game.counters, ending: index === 0 ? 'bankruptcy' : null, heroesDied: { player: index === 0 ? 4 : 2, rival: 0 } },
  }));
  const played = { ...sweep, games };
  const totals = sweepTotals(played, turnsPerYear);
  const context = { milestone: 'v1.2.0-s2-test', startedAt: new Date(2026, 9, 10), machine: machine(), config: deps.config, content };
  const baseline: RunReport = runReport(sweep, context);
  // A baseline written before the Targets' counters (DL-259) holds none of them.
  delete (baseline.totals as Partial<SweepTotals>).highestLevels;
  const report = targetsOf(played, turnsPerYear, { path: 'harness/reports/v1.1.9-gate-2026-10-10.json', run: baseline });
  const row = (key: string) => report.rows.find((it) => it.key === key);

  test("reads each target from the sweep's totals and its standard error from its games", () => {
    expect(row('bankruptOrWiped')).toMatchObject({ measured: 0.5, inside: false, band: '5.0% to 15.0%', source: 'DL-83 item 2' });
    expect(row('bankruptOrWiped')?.standardError).toBeCloseTo(0.5, 12);
    expect(row('deaths')).toMatchObject({ measured: 3, inside: true });
    expect(row('deaths')?.standardError).toBeCloseTo(1, 12);
    const bands = totals.questsResolved.player;
    expect(row('failed')?.measured).toBe(bands.fail / (bands.fail + bands.success + bands.strong));
  });

  test("totals the highest Levels over the games in which the side had a Hero by then: summed, and the greatest", () => {
    const series: (number | null)[][] = [
      [null, 5, 7],
      [3, 4, 9],
    ];
    const levelled = sweep.games.map((game, index): GameRecord => ({ ...game, observations: { ...game.observations, highestLevels: { player: series[index] ?? [] } } }));
    expect(sweepTotals({ ...sweep, games: levelled }, turnsPerYear).highestLevels['player']).toEqual({ games: [1, 2, 2], levels: [3, 9, 16], highest: [3, 5, 9] });
  });

  // A game's series is carried to its last year alone (`carryHighestLevels`), so a game that ended
  // early, a Bankruptcy or a wiped Roster, is not in year 20's mean, and the row says so (DL-270).
  test("measures year 20's highest Level over the games in play then, and says so", () => {
    const series: (number | null)[][] = [[3, 6, 8], [4]];
    const levelled = sweep.games.map((game, index): GameRecord => ({ ...game, observations: { ...game.observations, highestLevels: { player: series[index] ?? [] } } }));
    expect(sweepTotals({ ...sweep, games: levelled }, turnsPerYear).highestLevels['player']).toEqual({ games: [2, 1, 1], levels: [7, 6, 8], highest: [4, 6, 8] });
    expect(row('highestLevel')?.what).toBe("The highest Level a Hero of the player's has reached by year 20, the mean over the games still in play at year 20");
  });

  test("leaves out a measure the run has not reached: year 10's mean Level, year 20's highest", () => {
    expect(row('meanLevel')).toMatchObject({ measured: null, standardError: null, inside: null });
    expect(row('highestLevel')).toMatchObject({ measured: null, inside: null });
  });

  test("reads the Rankings' shares without year 0's tie", () => {
    // Twenty Days: the new world's places alone, which the share leaves out.
    expect(totals.rankings).toHaveLength(1);
    expect(row('firstByFame')?.measured).toBeNull();
  });

  test("sets the baseline's value beside each, none for a counter its report does not hold", () => {
    expect(report.baseline).toEqual({ report: 'harness/reports/v1.1.9-gate-2026-10-10.json', milestone: 'v1.2.0-s2-test', games: 2, years, fingerprint: baseline.fingerprint });
    expect(row('bankruptOrWiped')?.baseline).toBe(0);
    expect(row('deaths')?.baseline).toBe(sweepTotals(sweep, turnsPerYear).heroesDied.player / 2);
    expect(row('highestLevel')?.baseline).toBeNull();
    expect(targetsOf(played, turnsPerYear, null).baseline).toBeNull();
  });

  test("weighs the Quests, the player's and each Disposition's: a Guild-year, the mean Party and the mean Days away", () => {
    const player = report.questWeight.find((it) => it.side === 'player');
    const weight = totals.questWeight['player'];
    if (weight === undefined || player === undefined) throw new Error('The player took no Quest');
    expect(player.perGuildYear.measured).toBeCloseTo(totals.questsTaken.player / totals.guildYears.player.reduce((sum, n) => sum + n, 0), 12);
    expect(player.party.measured).toBe(weight.heroes / weight.quests);
    expect(player.days.measured).toBe(weight.days / weight.quests);
    expect(report.questWeight.map((it) => it.side)).toEqual(['player', ...Object.keys(totals.dispositions).sort()]);
  });

  test('renders a table of the bands and one of the Quest weight, naming the baseline and the run that carries them', () => {
    const lines = targetsSection(report).join('\n');
    expect(lines).toContain('## Targets');
    expect(lines).toContain('`harness/reports/v1.1.9-gate-2026-10-10.json`');
    expect(lines).toContain('no module is on by default (DL-82 item 18)');
    expect(lines).toContain("| The player's Bankruptcy or wiped Roster, a share of games | DL-83 item 2 | 5.0% to 15.0% | 50.0% | 50.0% | 0.0% | outside |");
    expect(lines).toContain('| Quest weight |');
  });
});
