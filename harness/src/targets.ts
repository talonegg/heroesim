// The report's Targets (DL-259): the owner's target bands for the automatic policy's games (DL-83,
// the player's Deaths by DL-256 item 10 in place of DL-83 item 6, DL-257 item 7) and DL-69 item 4's
// lines for the Rivals, each declared once here with the entry that set it. Each is a ratio of two
// sums the sweep's totals hold: measured on the run, with its standard error over its games, beside
// a baseline run's value read from its JSON report, and marked inside or outside its band. Reported,
// not tuned or gated (DL-257 item 7, Q6 and Q11): nothing here fails a run. Beside them, the Quest
// weight: Quests a Guild-year, the mean Party and the mean Days away, the player's and each
// Disposition's.
//
// The core-only run carries the targets until a module is on by default (DL-82 item 18).

import { compareByCodeUnit } from '@heroesim/engine';
import { sweepTotals } from './counter.js';
import { countedYear, playerSide } from './counters.js';
import type { SweepTotals } from './game-counters.js';
import { defaultYears } from './play.js';
import { fixed, markdownTable, whole } from './report.js';
import type { RunReport } from './run-report.js';
import type { PlaySweep } from './sweep.js';

/** A measure's two sums: its value is `n / of`. */
export interface Ratio {
  n: number;
  of: number;
}

/** A band's ends: at least, at most, or under. */
export interface Band {
  atLeast?: number;
  atMost?: number;
  under?: number;
}

/** What a sweep's totals are read for: a ratio of two of their sums, `null` when they hold no counter it reads. */
export interface Measure {
  key: string;
  what: string;
  /** A share prints as a percentage, a number to two places. */
  unit: 'share' | 'number';
  ratio(totals: SweepTotals): Ratio | null;
}

/** A measure with its band and the entry that set it. */
export interface Target extends Measure {
  source: string;
  band: Band;
}

/** One target as a run measured it: `null` where the run or the baseline has nothing to read. */
export interface TargetRow {
  key: string;
  what: string;
  source: string;
  band: string;
  unit: Measure['unit'];
  measured: number | null;
  standardError: number | null;
  baseline: number | null;
  inside: boolean | null;
}

/** A measure without a band, as a run measured it. */
export interface Cell {
  measured: number | null;
  standardError: number | null;
  baseline: number | null;
}

/** One side's Quest weight. */
export interface WeightRow {
  side: string;
  perGuildYear: Cell;
  party: Cell;
  days: Cell;
}

/** The report's Targets, the Markdown's section and the JSON's `targets`. */
export interface TargetsReport {
  /** The run whose values stand beside the measured: its JSON report, name, shape and fingerprint. */
  baseline: { report: string; milestone: string; games: number; years: number; fingerprint: string } | null;
  rows: TargetRow[];
  questWeight: WeightRow[];
}

/** A run's JSON report read as the baseline, and the path it was read from. */
export interface Baseline {
  path: string;
  run: RunReport;
}

/** The years the bands are set on: the measured game is a twenty-year slice (DL-83 item 18). */
const sliceYears = defaultYears;

/** DL-83 item 7's band starts after year 2. */
const wealthFromYear = 2;

const sum = (values: readonly number[]): number => values.reduce((total, n) => total + n, 0);

/** The totals' counter of `key`, or `undefined` in a report written before it was counted. */
const counter = <K extends keyof SweepTotals>(totals: SweepTotals, key: K): SweepTotals[K] | undefined => (totals as Partial<SweepTotals>)[key];

/** A ratio of a count to the sweep's games. */
const aGame = (totals: SweepTotals, n: number | undefined): Ratio | null => (n === undefined ? null : { n, of: totals.games });

/** The share of year-starts after 1 year or more the player stood first by `by`: the new world's tie at the founding Fame left out (DL-86 item 12). */
const firstBy = (by: 'fame' | 'wealth') => (totals: SweepTotals): Ratio | null => {
  const years = counter(totals, 'rankings')?.slice(1) ?? [];
  return { n: sum(years.map((tally) => tally[by][0] ?? 0)), of: sum(years.map((tally) => tally.games)) };
};

/** The player's Quests resolved in `band`, a share of every one resolved. */
const resolvedShare = (band: 'fail' | 'strong') => (totals: SweepTotals): Ratio | null => {
  const bands = counter(totals, 'questsResolved')?.player;
  return bands === undefined ? null : { n: bands[band], of: bands.fail + bands.success + bands.strong };
};

/**
 * The targets, each declared once with its source, the DL-69 line of a Disposition's Rivals once for
 * each of `dispositions`, in the report's order.
 */
export function targets(dispositions: readonly string[]): Target[] {
  return [
    {
      key: 'bankruptOrWiped',
      what: "The player's Bankruptcy or wiped Roster, a share of games",
      source: 'DL-83 item 2',
      unit: 'share',
      band: { atLeast: 0.05, atMost: 0.15 },
      ratio: (totals) => {
        const endings = counter(totals, 'endings');
        return endings === undefined ? null : { n: (endings['bankruptcy'] ?? 0) + (endings['roster-wiped'] ?? 0), of: totals.games };
      },
    },
    {
      key: 'firstByFame',
      what: "The player first in the Rankings by Fame, a share of year-starts after 1 year or more (the new world's tie left out)",
      source: 'DL-83 item 3, DL-91 item 2',
      unit: 'share',
      band: { atLeast: 0.4, atMost: 0.6 },
      ratio: firstBy('fame'),
    },
    {
      key: 'firstByWealth',
      what: 'The player first in the Rankings by Wealth, a share of year-starts after 1 year or more',
      source: 'DL-83 item 3, DL-91 item 2',
      unit: 'share',
      band: { atLeast: 0.4, atMost: 0.6 },
      ratio: firstBy('wealth'),
    },
    {
      key: 'failed',
      what: "The player's Quests failed, a share of those resolved",
      source: 'DL-83 item 4',
      unit: 'share',
      band: { atLeast: 0.2, atMost: 0.3 },
      ratio: resolvedShare('fail'),
    },
    {
      key: 'strong',
      what: "The player's Quests a strong success, a share of those resolved",
      source: 'DL-83 item 4',
      unit: 'share',
      band: { atMost: 0.5 },
      ratio: resolvedShare('strong'),
    },
    {
      key: 'rivalFolds',
      what: 'Rival folds, a game',
      source: 'DL-83 item 5',
      unit: 'number',
      band: { atLeast: 1.5, atMost: 3.5 },
      ratio: (totals) => {
        const folds = counter(totals, 'rivalFolds');
        return aGame(totals, folds === undefined ? undefined : sum(Object.values(folds)));
      },
    },
    {
      key: 'deaths',
      what: "The player's Hero Deaths, a game",
      source: 'DL-256 item 10, DL-257 item 7',
      unit: 'number',
      band: { atLeast: 3, atMost: 8 },
      ratio: (totals) => aGame(totals, counter(totals, 'heroesDied')?.player),
    },
    {
      key: 'wealthMonths',
      what: `The player's Wealth in months of its Upkeep, the mean of its year-starts after ${wealthFromYear} years or more`,
      source: 'DL-83 item 7',
      unit: 'number',
      band: { atLeast: 6, atMost: 12 },
      ratio: (totals) => {
        const years = counter(totals, 'playerWealthMonths')?.slice(wealthFromYear);
        return years === undefined ? null : { n: sum(years.map((taken) => taken?.months ?? 0)), of: sum(years.map((taken) => taken?.games ?? 0)) };
      },
    },
    {
      key: 'meanLevel',
      what: `The mean Level of the player's Heroes after ${countedYear} years`,
      source: 'DL-83 item 21',
      unit: 'number',
      band: { atLeast: 8, atMost: 10 },
      ratio: (totals) => {
        const rosters = counter(totals, 'rosters');
        if (rosters === undefined) return null;
        const taken = rosters[countedYear]?.player;
        return { n: taken?.levels ?? 0, of: taken?.heroes ?? 0 };
      },
    },
    {
      key: 'highestLevel',
      what: `The highest Level a Hero of the player's has reached by year ${sliceYears}, the mean over the games still in play at year ${sliceYears}`,
      source: 'DL-83 item 22',
      unit: 'number',
      band: { atLeast: 14, atMost: 17 },
      ratio: (totals) => {
        const levels = counter(totals, 'highestLevels');
        if (levels === undefined) return null;
        const player = levels[playerSide];
        return { n: player?.levels[sliceYears - 1] ?? 0, of: player?.games[sliceYears - 1] ?? 0 };
      },
    },
    ...dispositions.map(
      (disposition): Target => ({
        key: `hoarding:${disposition}`,
        what: `\`${disposition}\` Rivals at the Roster floor (\`rivalRosterMin\` Heroes or fewer) with more than 20 Upkeeps in hand, a share of its year-starts`,
        source: 'DL-69 item 4',
        unit: 'share',
        band: { under: 0.5 },
        ratio: (totals) => {
          const atFloor = counter(totals, 'rivalsAtFloor');
          if (atFloor === undefined) return null;
          return { n: atFloor[disposition]?.hoarding ?? 0, of: atFloor[disposition]?.starts ?? 0 };
        },
      }),
    ),
    {
      key: 'transfersBack',
      what: 'Transfers between Rivals back to one that had sold the Hero, a share of those between Rivals',
      source: 'DL-69 item 4',
      unit: 'share',
      band: { under: 0.15 },
      ratio: (totals) => {
        const back = counter(totals, 'transfersBack');
        const transfers = counter(totals, 'transfers');
        return back === undefined || transfers === undefined ? null : { n: back, of: transfers['rival-to-rival'].transfers };
      },
    },
    {
      key: 'transfersBackSoon',
      what: 'Transfers between Rivals back to one that had sold the Hero fewer than 90 Days before, a game',
      source: 'DL-69 item 4',
      unit: 'number',
      band: { atMost: 0 },
      ratio: (totals) => aGame(totals, counter(totals, 'transfersBackSoon')),
    },
    {
      key: 'transfersShort',
      what: 'Transfers that left their seller below `rivalRosterMin`, a game',
      source: 'DL-69 item 4',
      unit: 'number',
      band: { atMost: 0 },
      ratio: (totals) => aGame(totals, counter(totals, 'transfersShort')),
    },
  ];
}

/** The Quest weight's three measures of `side`, the player's Guild or a Disposition. */
function weightMeasures(side: string): [perGuildYear: Measure, party: Measure, days: Measure] {
  const weighed = (totals: SweepTotals, read: (weight: { quests: number; heroes: number; days: number }) => number): Ratio | null => {
    const weights = counter(totals, 'questWeight');
    if (weights === undefined) return null;
    const weight = weights[side];
    return { n: weight === undefined ? 0 : read(weight), of: weight?.quests ?? 0 };
  };
  return [
    {
      key: `questsPerGuildYear:${side}`,
      what: 'Quests taken a Guild-year',
      unit: 'number',
      ratio: (totals) => {
        if (side === playerSide) return { n: totals.questsTaken.player, of: sum(totals.guildYears.player) };
        const tally = totals.dispositions[side];
        return { n: tally?.questsTaken ?? 0, of: tally?.guildYears ?? 0 };
      },
    },
    { key: `meanParty:${side}`, what: 'The mean Party sent', unit: 'number', ratio: (totals) => weighed(totals, (weight) => weight.heroes) },
    { key: `meanDays:${side}`, what: 'The mean Days away', unit: 'number', ratio: (totals) => weighed(totals, (weight) => weight.days) },
  ];
}

/**
 * The standard error of a ratio of sums over games, each game a cluster (`pairs`, a game's `n` and
 * `of`): the spread of each game's `n` about the ratio times its `of`, over the sum of `of`, with the
 * games' correction n / (n − 1). Over games of `of` 1 it is the standard error of their mean. `null`
 * with fewer than two games or nothing to divide by.
 */
export function ratioError(pairs: readonly Ratio[]): number | null {
  const of = sum(pairs.map((pair) => pair.of));
  if (pairs.length < 2 || of === 0) return null;
  const ratio = sum(pairs.map((pair) => pair.n)) / of;
  const spread = sum(pairs.map((pair) => (pair.n - ratio * pair.of) ** 2));
  return Math.sqrt((pairs.length / (pairs.length - 1)) * spread) / of;
}

/** Whether `value` is inside `target`'s band: its ends in it, an `under` not. */
export function inside(target: Pick<Target, 'band'>, value: number): boolean {
  const { atLeast, atMost, under } = target.band;
  return (atLeast === undefined || value >= atLeast) && (atMost === undefined || value <= atMost) && (under === undefined || value < under);
}

/** A value of `unit` as the report prints it: a share to one place of a percentage, a number to two places. */
const shown = (unit: Measure['unit'], value: number | null): string => (value === null ? '—' : unit === 'share' ? `${fixed(value * 100, 1)}%` : fixed(value, 2));

/** `target`'s band as the report prints it. */
export function bandText(target: Pick<Target, 'band' | 'unit'>): string {
  const { atLeast, atMost, under } = target.band;
  if (atMost === 0 && atLeast === undefined) return 'none';
  if (under !== undefined) return `under ${shown(target.unit, under)}`;
  if (atLeast !== undefined && atMost !== undefined) return `${shown(target.unit, atLeast)} to ${shown(target.unit, atMost)}`;
  if (atMost !== undefined) return `at most ${shown(target.unit, atMost)}`;
  return `at least ${shown(target.unit, atLeast ?? 0)}`;
}

/** The value a ratio gives: `null` for none, or nothing to divide by. */
const valueOf = (ratio: Ratio | null): number | null => (ratio === null || ratio.of === 0 ? null : ratio.n / ratio.of);

/**
 * The sweep's Targets: each target measured on the sweep's totals, its standard error over its games
 * (`ratioError`, each game totalled alone), and `baseline`'s value where its report holds what the
 * target reads; and the Quest weight of the player's Guild and each Disposition.
 */
export function targetsOf(sweep: Pick<PlaySweep, 'counters' | 'games' | 'years'>, turnsPerYear: number, baseline: Baseline | null): TargetsReport {
  const totals = sweepTotals(sweep, turnsPerYear);
  const perGame = sweep.games.map((game) => sweepTotals({ counters: sweep.counters, games: [game], years: sweep.years }, turnsPerYear));
  const before = baseline?.run.totals ?? null;
  const cell = (measure: Measure): Cell => {
    const pairs = perGame.map((game) => measure.ratio(game)).filter((pair): pair is Ratio => pair !== null);
    const measured = valueOf(measure.ratio(totals));
    return { measured, standardError: measured === null ? null : ratioError(pairs), baseline: before === null ? null : valueOf(measure.ratio(before)) };
  };
  const dispositions = Object.keys(totals.dispositions).sort(compareByCodeUnit);
  return {
    baseline:
      baseline === null
        ? null
        : { report: baseline.path, milestone: baseline.run.milestone, games: baseline.run.games.length, years: baseline.run.years, fingerprint: baseline.run.fingerprint },
    rows: targets(dispositions).map((target) => {
      const measured = cell(target);
      return {
        key: target.key,
        what: target.what,
        source: target.source,
        band: bandText(target),
        unit: target.unit,
        ...measured,
        inside: measured.measured === null ? null : inside(target, measured.measured),
      };
    }),
    questWeight: [playerSide, ...dispositions].map((side) => {
      const [perGuildYear, party, days] = weightMeasures(side);
      return { side, perGuildYear: cell(perGuildYear), party: cell(party), days: cell(days) };
    }),
  };
}

/** The Targets as the Markdown report's section. */
export function targetsSection(report: TargetsReport): string[] {
  const { baseline } = report;
  const against =
    baseline === null
      ? 'No baseline run was read.'
      : `The baseline is \`${baseline.milestone}\`, ${whole(baseline.games)} games of ${whole(baseline.years)} years, read from \`${baseline.report}\` ` +
        `(fingerprint \`${baseline.fingerprint}\`); a dash where its report holds no counter the target reads.`;
  const weightCell = (unit: Measure['unit'], it: Cell): string[] => [
    it.measured === null ? '—' : `${shown(unit, it.measured)}${it.standardError === null ? '' : ` ± ${shown(unit, it.standardError)}`}`,
    shown(unit, it.baseline),
  ];
  return [
    '## Targets',
    '',
    "The owner's target bands for the automatic policy's games (DL-83; the player's Deaths by DL-256 item 10, DL-257 item 7) and " +
      "DL-69 item 4's lines for the Rivals, each measured on this run with its standard error over the run's games (each game a " +
      "cluster; a share's in percentage points), beside the baseline's value, and marked inside or outside its band. Reported, not tuned " +
      'or gated (DL-257 item 7): nothing here fails a run. The core-only run carries them, since no module is on by default (DL-82 ' +
      "item 18); `neutral --expect` and `compare` guard its identity against the previous release's. A band is set on the " +
      `${whole(sliceYears)}-year slice; a measure a shorter run has not reached reads a dash. ${against}`,
    '',
    markdownTable(
      ['Target', 'Source', 'Band', 'Measured', 'Standard error', 'Baseline', 'Inside'],
      report.rows.map((row) => [
        row.what,
        row.source,
        row.band,
        shown(row.unit, row.measured),
        shown(row.unit, row.standardError),
        shown(row.unit, row.baseline),
        row.inside === null ? '—' : row.inside ? 'inside' : 'outside',
      ]),
      ['left', 'left', 'right', 'right', 'right', 'right', 'left'],
    ),
    '',
    "The Quest weight, the player's and each Disposition's, from `quest.taken`: Quests taken a Guild-year, the mean Party sent and " +
      "the mean Days away, from the Day a Quest is taken to the Day its Party comes home; each measured with its standard error, then the baseline's:",
    '',
    markdownTable(
      ['Quest weight', 'Quests a Guild-year', 'Baseline', 'Mean Party', 'Baseline', 'Mean Days away', 'Baseline'],
      report.questWeight.map((row) => [
        row.side === playerSide ? "The player's Guild" : `\`${row.side}\``,
        ...weightCell('number', row.perGuildYear),
        ...weightCell('number', row.party),
        ...weightCell('number', row.days),
      ]),
      ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
    ),
    '',
  ];
}
