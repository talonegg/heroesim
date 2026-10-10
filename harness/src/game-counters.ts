// The core's counters, each declared once (DL-239): how a game gives it, where its total starts, how
// it folds and what kind it is (`counter.ts`), and its lines in the play report, in the report's order.
// The list's order is the totals' order, and so the order the module report lists the counters in.
// The counters' readings are `counters.ts`'s; the report's frame, its Summary's sweep lines and its
// Measures, is `play-report.ts`'s.

import {
  compareByCodeUnit,
  descriptiveAttributeMaxLength,
  encounterKinds,
  facilityKeys,
  regardBandNames,
  type EngineDeps,
  type FacilityKey,
  type RegardBand,
  type WorldDocument,
} from '@heroesim/engine';
import { capitalised } from '@heroesim/words';
import { addInto, type Counter, type Gatherer, type ReportContext } from './counter.js';
import {
  consumableCounters,
  consumableEffects,
  controllerKinds,
  carryHighestLevels,
  copiesTimed,
  countByController,
  countedYear,
  difficultyBandWidth,
  dispositionCounters,
  encounterCounters,
  encounterOutcomes,
  endingOf,
  endingReasons,
  gearCounters,
  gearReturnCauses,
  guildYearCounters,
  historyLengthCounter,
  improvementGrades,
  injuryCounters,
  isYearStart,
  lastTurnOf,
  levelsAndDeclines,
  lootCounters,
  marketPurchaseCounters,
  moduleCounters,
  noBands,
  noConsumables,
  noDifficulty,
  noDisposition,
  noEncounters,
  noFameGate,
  noGear,
  noGrades,
  noGrowth,
  noHeroes,
  noPartySize,
  noPortraits,
  noPurchases,
  noSynergies,
  noTransfers,
  noWealth,
  observeFameGate,
  observeHighestLevels,
  observeHeroes,
  observeSave,
  observeWorld,
  offerCounters,
  offerEndCauses,
  partySizeCounters,
  pingPongDays,
  patronSilence,
  playerDifficulty,
  playerWealthMonths,
  playerRanking,
  playerSide,
  portraitCounters,
  progressionCounters,
  questWeightCounters,
  questingHeroes,
  questsResolvedByController,
  questsTakenByController,
  regardSnapshot,
  retirementAgeCounters,
  rivalFoldCounters,
  rivalsInPlay,
  rivalTransferWays,
  rivalsAtFloor,
  rosterCensus,
  saleCauses,
  savedDocumentLength,
  successionCount,
  synergyCounters,
  transferCounters,
  transferDirections,
  transfersShort,
  traitsGainedByKey,
  wealthCounters,
  type ByController,
  type ControllerKind,
  type DifficultyTally,
  type EncounterCounts,
  type FameGate,
  type FloorTally,
  type GameCounters,
  type GameObservations,
  type HeroesSeen,
  type HeroTally,
  type HighestLevels,
  type LootTally,
  type MarketTally,
  type PartySizeTally,
  type PortraitTally,
  type RegardSnapshot,
  type RivalAfternoons,
  type RivalAtYearStart,
  type RivalTransferWay,
  type RosterCensus,
  type SaveSize,
  type TransferDirection,
  type TransferTally,
  type WealthFlows,
  type WorldSize,
} from './counters.js';
import type { Moment } from './play.js';
import { fixed, markdownTable, percent, whole } from './report.js';
import { summarise, type Summary } from './stats.js';

// ── The totals' shapes ───────────────────────────────────────────────────────────────────────

/**
 * A game's counters as the sweep totals them: every one of `GameCounters` but the game's ending and
 * last Turn, which other counters read (`endings`, `endedInYear`, `yearsSurvived`), and none `null`:
 * a counter a game leaves `null` is totalled over the games that gave it.
 */
type Totalled<T> = { [K in keyof T]: Exclude<T[K], null> };

/** The core's totals over a sweep (`sweepTotals`, DL-187, DL-239): each counter's total by its key. */
export type SweepTotals = Totalled<Omit<GameCounters, 'ending' | 'lastTurn'>> & GameTotals;

/** The totals no field of `GameCounters` gives: from each game's observations and record. */
export interface GameTotals {
  games: number;
  /** Games by how they ended; `survived` for a game that ran its full length. */
  endings: Record<string, number>;
  /** Years each game lasted: to its ending, or its full length. */
  yearsSurvived: Summary;
  /** Games whose ending fell in each year, the first at index 0, up to the sweep's length. */
  endedInYear: number[];
  refusals: number;
  invalidGames: number;
  /** The games that played `countedYear` years: those that gave `improvementGrades`. */
  gamesAtCountedYear: number;
  fameGate: Record<ControllerKind, FameGate>;
  /** `signing-refused` among the policy's refused actions: it asks only Heroes who would sign. */
  signingRefused: number;
  /** The Rosters as each year begins, summed over the games in play then, and how many were. */
  rosters: ({ games: number } & Record<ControllerKind, RosterCensus>)[];
  /** The player's Guild's Regard after `countedYear` years, summed over the games in play then, and how many were. */
  regardAtCountedYear: { games: number } & RegardSnapshot;
  /** For each year-start, index k after k years, 0 the new world, each Disposition's Rivals in play then, over the games in play then. */
  rivalYearStarts: Record<string, RivalYearStarts>[];
  /** For each year, the player's Guild's places in the Rankings as it began, over the games in play then. */
  rankings: RankingTally[];
  /** Games a harness assertion stopped (DL-69). */
  assertionGames: number;
  /** Every Hero generated and their Portraits and texts, summed over the games; the longest the longest of any game. */
  heroes: HeroTally;
  /** The saves as each year ended, over the games: index k is after k + 1 years. */
  saves: SaveYear[];
  /**
   * The World State as each year ended, over the games: index k is after k + 1 years (DL-203). A
   * timing, not a play counter: the copy's time differs between two runs of one game.
   */
  worlds: WorldYear[];
  /** The highest Level each side has reached by each year, over the games in which it had a Hero by then (DL-259). */
  highestLevels: Record<string, LevelYears>;
  /** Each Disposition's Rivals at the Roster floor, over every year-start (DL-259). */
  rivalsAtFloor: Record<string, FloorTally>;
  /** The player's Wealth in months of its Upkeep as each year begins, summed over the games in play then, and how many were (DL-259). */
  playerWealthMonths: { games: number; months: number }[];
  /** The Transfers that left a Rival seller below `rivalRosterMin` (DL-259). */
  transfersShort: number;
}

/** A side's highest Levels by year, over the games: index k by the end of year k + 1. */
export interface LevelYears {
  /** The games in which the side had had a Hero by then. */
  games: number[];
  /** Their highest Levels, summed, and the greatest of them. */
  levels: number[];
  highest: number[];
}

/** Rows of a table as a year ended, over the games: each game's live and written once. */
export interface RowsYear {
  live: number[];
  writeOnce: number[];
}

/** The World State of the games that reached a year's end (`observeWorld`): each game's numbers. */
export interface WorldYear {
  characters: number[];
  heroes: RowsYear;
  guildmasters: RowsYear;
  guilds: RowsYear;
  otherRows: number[];
  copyMs: number[];
}

/** The saves of the games that reached a year's end. */
export interface SaveYear {
  lengths: number[];
  heroFields: number[];
  /** Gzipped lengths, measured at the last year only. */
  gzipped: number[];
}

/** Rivals as a year began: each one's Roster size and Wealth. */
export interface RivalYearStarts {
  heroes: number[];
  wealth: number[];
}

/** The player's Guild's places as a year began, over `games`: index k counts the games where it stood k + 1st. */
export interface RankingTally {
  games: number;
  fame: number[];
  wealth: number[];
}

/** A core counter: its game's value of `GameCounters` or `GameObservations`, its total of `SweepTotals`. */
type Declared<Game, Total> = Counter<Game, Total>;

// ── The report's helpers ─────────────────────────────────────────────────────────────────────

const zero = (): ByController => ({ player: 0, rival: 0 });

const kindLabel = (kind: ControllerKind): string => (kind === 'player' ? "The player's Guild" : 'The Rivals');

const rosterOf = (kind: ControllerKind): string => (kind === 'player' ? "the player's Guild" : 'the Rivals');

/** `n / of` to `digits` places, a dash when `of` is 0. */
const ratio = (n: number, of: number, digits = 2): string => (of === 0 ? '—' : fixed(n / of, digits));

const sum = (values: readonly number[]): number => values.reduce((total, n) => total + n, 0);

/** `n` a game of the sweep, to two places; a dash for a sweep of no games. */
const perGameOf = (totals: SweepTotals) => (n: number): string => (totals.games === 0 ? '—' : fixed(n / totals.games, 2));

/** A row of a per-controller table: the count and a game, the player's then the Rivals'. */
const heroRow = (totals: SweepTotals, label: string, counts: ByController): string[] => {
  const perGame = perGameOf(totals);
  return [label, whole(counts.player), perGame(counts.player), whole(counts.rival), perGame(counts.rival)];
};

/** The sweep's years as the report writes them: whole, or to two places. */
const yearsTextOf = ({ sweep }: ReportContext): string => (Number.isInteger(sweep.years) ? whole(sweep.years) : fixed(sweep.years, 2));

/** The top grade content gives any facility: the report's grade columns run from 0 to it. */
function topGrade(deps: EngineDeps): number {
  return Object.values(deps.content.improvements).reduce((top, row) => Math.max(top, row.grade), 0);
}

/** Keys a table lists: content's, in key order, then any other a count names. */
function keysOf(known: readonly string[], ...counts: readonly Record<string, unknown>[]): string[] {
  const extra = counts.flatMap((count) => Object.keys(count)).filter((key) => !known.includes(key));
  return [...new Set([...[...known].sort(compareByCodeUnit), ...extra.sort(compareByCodeUnit)])];
}

/** The Dispositions a table lists: content's, in key order, then any other a Rival of the sweep had. */
function dispositionKeys(totals: SweepTotals, deps: EngineDeps): string[] {
  return keysOf(Object.keys(deps.content.dispositions), totals.dispositions, totals.improvementGradesByDisposition, ...totals.rivalYearStarts);
}

/** The sides the Rivals' tables list: the player's Guild, then each Disposition and any other side a count names. */
function sidesOf(totals: SweepTotals, deps: EngineDeps): string[] {
  return [
    playerSide,
    ...keysOf(
      dispositionKeys(totals, deps),
      totals.transfersBySide,
      ...Object.values(totals.transfersBySide),
      totals.offers,
      ...Object.values(totals.offers),
      totals.marketPurchases,
    ).filter((side) => side !== playerSide),
  ];
}

const sideLabel = (side: string): string => (side === playerSide ? "the player's Guild" : `\`${side}\``);

/** `place` one-hot: a list as long as it, 1 at its last index and 0 before. */
const oneHot = (place: number): number[] => Array.from({ length: place }, (_, index) => (index === place - 1 ? 1 : 0));

/** A length in characters as MiB, two places. */
const mebibytes = (length: number): string => fixed(length / 1024 / 1024, 2);

/** Every Rival year-start of `parts`, one list of Rosters and one of Wealth. */
const merged = (parts: readonly RivalYearStarts[]): RivalYearStarts => ({
  heroes: parts.flatMap((part) => part.heroes),
  wealth: parts.flatMap((part) => part.wealth),
});

/** Every Rival year-start of the sweep, of `disposition` or of every Disposition. */
const everyStart = (totals: SweepTotals, disposition?: string): RivalYearStarts =>
  merged(
    totals.rivalYearStarts.flatMap((byDisposition) =>
      disposition === undefined ? Object.values(byDisposition) : [byDisposition[disposition] ?? { heroes: [], wealth: [] }],
    ),
  );

// ── The gatherers ─────────────────────────────────────────────────────────────────────────────

/** A census as each year begins: `read` of the World State on the new world and each year's first Turn after, while the game has not ended. */
function census<T>(read: (moment: Moment) => T): Gatherer<T[]> {
  const taken: T[] = [];
  const take = (moment: Moment): void => {
    const { world } = moment.document;
    if (world.ended === null && isYearStart(world, taken.length, moment.deps)) taken.push(read(moment));
  };
  return { created: take, yearEnded: take, value: () => taken };
}

// ── The counters ──────────────────────────────────────────────────────────────────────────────

const games: Declared<never, number> = {
  key: 'games',
  kind: 'play',
  zero: () => 0,
  total: () => 1,
  summary: (_totals, { sweep }) => [['Games played', whole(sweep.seeds.length)]],
};

const questsTaken: Declared<ByController, ByController> = {
  key: 'questsTaken',
  kind: 'play',
  read: (document) => questsTakenByController(document),
  zero,
};

const questsResolved: Declared<GameCounters['questsResolved'], SweepTotals['questsResolved']> = {
  key: 'questsResolved',
  kind: 'play',
  read: (document) => questsResolvedByController(document),
  zero: () => ({ player: { fail: 0, success: 0, strong: 0 }, rival: { fail: 0, success: 0, strong: 0 } }),
  section: 'counters',
  lines(totals: SweepTotals) {
    const resolvedRow = (kind: ControllerKind): string[] => {
      const bands = totals.questsResolved[kind];
      const all = bands.fail + bands.success + bands.strong;
      return [
        kind === 'player' ? "The player's Guild" : 'The Rivals',
        whole(totals.questsTaken[kind]),
        whole(all),
        `${whole(bands.fail)} (${percent(bands.fail, all)})`,
        `${whole(bands.success)} (${percent(bands.success, all)})`,
        `${whole(bands.strong)} (${percent(bands.strong, all)})`,
      ];
    };
    return [
      markdownTable(
        ['Quests', 'Taken', 'Resolved', 'Failed', 'Succeeded', 'Strong success'],
        [resolvedRow('player'), resolvedRow('rival')],
        ['left', 'right', 'right', 'right', 'right', 'right'],
      ),
      '',
    ];
  },
};

/** A count of `type`'s entries by controller, shown in the Heroes table (`heroesInjured`'s). */
const byController = (key: keyof GameCounters, type: Parameters<typeof countByController>[1]): Declared<ByController, ByController> => ({
  key,
  kind: 'play',
  read: (document) => countByController(document, type),
  zero,
});

const heroesInjured: Declared<ByController, ByController> = {
  ...byController('heroesInjured', 'hero.injured'),
  section: 'counters',
  lines(totals: SweepTotals) {
    return [
      markdownTable(
        ['Heroes', "Player's", 'a game', "Rivals'", 'a game'],
        [
          heroRow(totals, '`hero.injured`', totals.heroesInjured),
          heroRow(totals, '`hero.died`', totals.heroesDied),
          heroRow(totals, '`hero.recruited`', totals.heroesRecruited),
          heroRow(totals, '`hero.retired`', totals.heroesRetired),
          heroRow(totals, '`hero.trait-gained`', totals.traitsGained),
          heroRow(totals, '`hero.trait-lost`', totals.traitsLost),
          heroRow(totals, 'Heroes sent on a Quest', totals.questingHeroes),
        ],
        ['left', 'right', 'right', 'right', 'right'],
      ),
      '',
    ];
  },
};

const questing: Declared<ByController, ByController> = {
  key: 'questingHeroes',
  kind: 'play',
  read: (document) => questingHeroes(document),
  zero,
  section: 'counters',
  // The Traits earned per Hero career, which the "Rare Traits" gate reads (DL-148 item 25).
  lines: (totals: SweepTotals) => [
    `Traits earned per Hero career (a Hero sent on a Quest at least once): the player's ` +
      `${ratio(totals.traitsGained.player, totals.questingHeroes.player, 3)}, the Rivals' ` +
      `${ratio(totals.traitsGained.rival, totals.questingHeroes.rival, 3)}.`,
    '',
  ],
};

const ending: Declared<GameCounters['ending'], never> = { key: 'ending', kind: 'play', read: (document) => endingOf(document) };

const lastTurn: Declared<number, never> = { key: 'lastTurn', kind: 'play', read: (document) => lastTurnOf(document) };

const endings: Declared<never, Record<string, number>> = {
  key: 'endings',
  kind: 'play',
  zero: () => ({ ...Object.fromEntries(endingReasons.map((reason) => [reason, 0])), survived: 0 }),
  total: (game) => ({ [game.counters.ending ?? 'survived']: 1 }),
  summary: (totals: SweepTotals, report) => [
    [
      'Games ended',
      endingReasons.map((reason) => `${reason} ${whole(totals.endings[reason] ?? 0)}`).join(', ') +
        `; ran the full ${yearsTextOf(report)} years ${whole(totals.endings.survived ?? 0)}`,
    ],
  ],
};

const yearsSurvived: Declared<never, Summary> = {
  key: 'yearsSurvived',
  kind: 'play',
  of: (played, { turnsPerYear }) => summarise(played.map((game) => game.counters.lastTurn / turnsPerYear)),
  summary: (totals: SweepTotals) => [
    [
      'Years survived',
      `mean ${fixed(totals.yearsSurvived.mean)}, min ${fixed(totals.yearsSurvived.min)}, ` +
        `max ${fixed(totals.yearsSurvived.max)} (a game that ran its full length counts its length)`,
    ],
  ],
};

const rivalFolds: Declared<GameCounters['rivalFolds'], SweepTotals['rivalFolds']> = {
  key: 'rivalFolds',
  kind: 'play',
  read: (document) => rivalFoldCounters(document),
  zero: () => Object.fromEntries(endingReasons.map((reason) => [reason, 0])) as SweepTotals['rivalFolds'],
  summary(totals: SweepTotals) {
    const folds = Object.values(totals.rivalFolds).reduce((all, n) => all + n, 0);
    return [['Rival folds', `${whole(folds)}, ${perGameOf(totals)(folds)} a game`]];
  },
  section: 'counters',
  lines: (totals: SweepTotals) => [
    markdownTable(
      ['Ending', '`game.ended` (the player)', '`guild.folded` (Rivals)'],
      endingReasons.map((reason) => [reason, whole(totals.endings[reason] ?? 0), whole(totals.rivalFolds[reason] ?? 0)]),
      ['left', 'right', 'right'],
    ),
    '',
  ],
};

const rivalSuccessions: Declared<number, number> = {
  key: 'rivalSuccessions',
  kind: 'play',
  read: (document) => successionCount(document),
  zero: () => 0,
  summary: (totals: SweepTotals) => [['Rival Guildmasters succeeded', `${whole(totals.rivalSuccessions)}, ${perGameOf(totals)(totals.rivalSuccessions)} a game`]],
  section: 'counters',
  lines: (totals: SweepTotals) => [
    `A Rival Guildmaster's Retirement is met by Succession (\`guildmaster.succeeded\`, M9-S2), not a fold: ` +
      `${whole(totals.rivalSuccessions)} in all.`,
    '',
  ],
};

const refusals: Declared<never, number> = {
  key: 'refusals',
  kind: 'play',
  zero: () => 0,
  total: (game) => game.refusals.length,
  summary: (totals: SweepTotals) => [['Policy actions the rules refused', whole(totals.refusals)]],
};

const invalidGames: Declared<never, number> = {
  key: 'invalidGames',
  kind: 'play',
  zero: () => 0,
  total: (game) => (game.invalid === null ? 0 : 1),
  summary: (totals: SweepTotals, { sweep }) => [['Games the validator refused', sweep.validated ? whole(totals.invalidGames) : 'not validated']],
};

const assertionGames: Declared<never, number> = {
  key: 'assertionGames',
  kind: 'play',
  zero: () => 0,
  total: (game) => (game.assertion === null ? 0 : 1),
  summary: (totals: SweepTotals) => [['Games a harness assertion stopped', whole(totals.assertionGames)]],
};

const belowFloor: Declared<ByController, ByController> = {
  ...byController('belowFloor', 'guild.below-floor'),
  section: 'counters',
  // The nights the Guild State Engine found a Guild's Wealth crossing the floor (DL-101).
  lines: (totals: SweepTotals) => [
    markdownTable(
      ['Bankruptcy floor', "Player's", 'a game', "Rivals'", 'a game'],
      [
        heroRow(totals, 'Fell below it (`guild.below-floor`)', totals.belowFloor),
        heroRow(totals, 'Back to it or more (`guild.floor-recovered`)', totals.floorRecovered),
      ],
      ['left', 'right', 'right', 'right', 'right'],
    ),
    '',
  ],
};

const endedInYear: Declared<never, number[]> = {
  key: 'endedInYear',
  kind: 'play',
  zero: ({ years }) => Array.from({ length: Math.max(1, Math.ceil(years)) }, () => 0),
  total: ({ counters }, { years, turnsPerYear }) =>
    counters.ending === null ? [] : oneHot(Math.min(Math.floor(counters.lastTurn / turnsPerYear), Math.max(1, Math.ceil(years)) - 1) + 1),
  section: 'counters',
  lines: (totals: SweepTotals) => [`Games ending in each year (year 1 is the first): ${totals.endedInYear.map((n, year) => `${year + 1}: ${n}`).join(', ')}.`, ''],
};

// Progression, Fame and the Hall (DL-40).

const guildYears: Declared<GameCounters['guildYears'], SweepTotals['guildYears']> = {
  key: 'guildYears',
  kind: 'play',
  read: (document, deps) => guildYearCounters(document, deps.config.turnsPerYear),
  zero: () => ({ player: [], rival: [] }),
  section: 'progression',
  lines(totals: SweepTotals) {
    const perGuildYear = (kind: ControllerKind, series: SweepTotals['levelsGained']): string =>
      `${whole(sum(series[kind]))} (${ratio(sum(series[kind]), sum(totals.guildYears[kind]))})`;
    const years = Math.max(0, ...controllerKinds.map((kind) => totals.guildYears[kind].length));
    const byYearRows = Array.from({ length: years }, (_, year) => [
      whole(year + 1),
      ...controllerKinds.flatMap((kind) => {
        const inPlay = totals.guildYears[kind][year] ?? 0;
        return [fixed(inPlay, 1), ratio(totals.levelsGained[kind][year] ?? 0, inPlay), ratio(totals.declines[kind][year] ?? 0, inPlay)];
      }),
    ]);
    return [
      markdownTable(
        ['Per Guild-year', "The player's Guild", 'The Rivals'],
        [
          ['Guild-years in play', ...controllerKinds.map((kind) => fixed(sum(totals.guildYears[kind]), 1))],
          ['Levels gained, `hero.levelled` (a Guild-year)', ...controllerKinds.map((kind) => perGuildYear(kind, totals.levelsGained))],
          ['Declines, `hero.declined` (a Guild-year)', ...controllerKinds.map((kind) => perGuildYear(kind, totals.declines))],
        ],
        ['left', 'right', 'right'],
      ),
      '',
      'In each year (year 1 is the first):',
      '',
      markdownTable(
        [
          'Year',
          "Player's Guild-years",
          'Levels a Guild-year',
          'Declines a Guild-year',
          "Rivals' Guild-years",
          'Levels a Guild-year',
          'Declines a Guild-year',
        ],
        byYearRows,
        ['right', 'right', 'right', 'right', 'right', 'right', 'right'],
      ),
      '',
    ];
  },
};

const levelsGained: Declared<GameCounters['levelsGained'], SweepTotals['levelsGained']> = {
  key: 'levelsGained',
  kind: 'play',
  read: (document, deps) => levelsAndDeclines(document, deps.config.turnsPerYear).levelsGained,
  zero: () => ({ player: [], rival: [] }),
};

const declines: Declared<GameCounters['declines'], SweepTotals['declines']> = {
  key: 'declines',
  kind: 'play',
  read: (document, deps) => levelsAndDeclines(document, deps.config.turnsPerYear).declines,
  zero: () => ({ player: [], rival: [] }),
};

const rosters: Declared<GameObservations['rosters'], SweepTotals['rosters']> = {
  key: 'rosters',
  kind: 'play',
  observe: () => census(({ document, deps }) => rosterCensus(document.world, deps)),
  zero: () => [],
  total: ({ observations }) => observations.rosters.map((taken) => ({ games: 1, ...taken })),
  section: 'progression',
  lines(totals: SweepTotals) {
    const censusCells = (taken: RosterCensus): string[] => [
      ratio(taken.wealth, taken.guilds, 0),
      ratio(taken.heroes, taken.guilds, 1),
      ratio(taken.levels, taken.heroes),
      `${whole(taken.atPotential)} (${percent(taken.atPotential, taken.heroes)})`,
    ];
    const rosterRows = totals.rosters.map((taken, year) => [whole(year), whole(taken.games), ...controllerKinds.flatMap((kind) => censusCells(taken[kind]))]);
    const atCounted = totals.rosters[countedYear];
    const rosterName = (kind: ControllerKind): string => (kind === 'player' ? "the player's Roster" : "the Rivals' Rosters");
    const potentialLine =
      atCounted === undefined
        ? `No game was in play after ${countedYear} years.`
        : `Heroes with a Stat at Potential after ${countedYear} years, over the ${whole(atCounted.games)} games in play then: ` +
          controllerKinds
            .map((kind) => {
              const taken = atCounted[kind];
              return `${rosterName(kind)} ${whole(taken.atPotential)} of ${whole(taken.heroes)} (${percent(taken.atPotential, taken.heroes)})`;
            })
            .join('; ') +
          '.';
    return [
      'The Guilds in play and their Rosters as each year begins, before the policy acts, by the years played before it ' +
        '(0 is the new world, as year 1 begins), over the games in play then; a Hero is at Potential when any Stat has reached its Potential, where growth stops:',
      '',
      markdownTable(
        [
          'After years',
          'Games',
          "Player's Wealth",
          'Heroes',
          'Mean Level',
          'At Potential',
          "Rivals' Wealth a Guild",
          'Heroes a Guild',
          'Mean Level',
          'At Potential',
        ],
        rosterRows,
        ['right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
      ),
      '',
      potentialLine,
      '',
    ];
  },
};

const highestLevels: Declared<HighestLevels, SweepTotals['highestLevels']> = {
  key: 'highestLevels',
  kind: 'play',
  observe() {
    const highest: HighestLevels = {};
    return {
      created: ({ document, deps, events }) => observeHighestLevels(highest, document.world, events, deps.config.turnsPerYear),
      advanced: ({ after, deps, events }) => observeHighestLevels(highest, after.world, events, deps.config.turnsPerYear),
      ended: ({ document, deps }) => carryHighestLevels(highest, lastTurnOf(document), deps.config.turnsPerYear),
      value: () => highest,
    };
  },
  zero: () => ({}),
  fold: { highest: 'greatest' },
  total: ({ observations }) =>
    Object.fromEntries(
      Object.entries(observations.highestLevels).map(([side, series]) => [side, { games: series.map((level) => (level === null ? null : 1)), levels: series, highest: series }]),
    ),
  section: 'progression',
  // The highest Level reached, which DL-83 item 22's band reads by year 20 (DL-83 item 20).
  lines(totals: SweepTotals, { deps }) {
    const sides = [playerSide, ...keysOf(dispositionKeys(totals, deps), totals.highestLevels).filter((side) => side !== playerSide)];
    const years = Math.max(0, ...sides.map((side) => totals.highestLevels[side]?.games.length ?? 0));
    const cell = (side: string, year: number): string => {
      const tally = totals.highestLevels[side];
      const games = tally?.games[year] ?? 0;
      return games === 0 ? '—' : `${ratio(tally?.levels[year] ?? 0, games)} (${whole(tally?.highest[year] ?? 0)})`;
    };
    return [
      'The highest Level a Hero of each side has reached by the end of each year (year 1 is the first), on a Roster or levelling on one: ' +
        'the mean over the games in which the side had a Hero by then, the greatest of any game in brackets:',
      '',
      markdownTable(
        ['Year', ...sides.map((side) => capitalised(sideLabel(side)))],
        Array.from({ length: years }, (_, year) => [whole(year + 1), ...sides.map((side) => cell(side, year))]),
        ['right', ...sides.map(() => 'right' as const)],
      ),
      '',
    ];
  },
};

const wealthMonths: Declared<GameObservations['playerWealthMonths'], SweepTotals['playerWealthMonths']> = {
  key: 'playerWealthMonths',
  kind: 'play',
  observe: () => census(({ document, deps }) => playerWealthMonths(document.world, deps)),
  zero: () => [],
  total: ({ observations }) => observations.playerWealthMonths.map((months) => (months === null ? null : { games: 1, months })),
  section: 'progression',
  // What DL-83 item 7's band reads after year 2: a month a twelfth of a year's Upkeeps (DL-259).
  lines: (totals: SweepTotals) => [
    "The player's Wealth in months of its Upkeep as each year began, a month a twelfth of a year's Upkeeps, by the years played before it " +
      `(0 is the new world), the mean over the games in play then: ${Array.from(totals.playerWealthMonths, (taken, year) => `${year}: ${ratio(taken?.months ?? 0, taken?.games ?? 0, 1)}`).join(', ')}.`,
    '',
  ],
};

const growthAgainstDecline: Declared<GameCounters['growthAgainstDecline'], SweepTotals['growthAgainstDecline']> = {
  key: 'growthAgainstDecline',
  kind: 'play',
  read: (document, deps) => progressionCounters(document, deps.config.turnsPerYear, lastTurnOf(document)).growthAgainstDecline,
  zero: () => ({ player: noGrowth(), rival: noGrowth() }),
  section: 'progression',
  lines(totals: SweepTotals) {
    const growthRows = controllerKinds.map((kind) => {
      const growth = totals.growthAgainstDecline[kind];
      return [
        kindLabel(kind),
        whole(growth.guilds),
        ratio(growth.levelsBefore, growth.guildYearsBefore),
        ratio(growth.levelsAfter, growth.guildYearsAfter),
        ratio(growth.pointsGrownAfter, growth.guildYearsAfter),
        ratio(growth.pointsDeclinedAfter, growth.guildYearsAfter),
      ];
    });
    return [
      'Growth against decline (M3-S4): over the Guilds on whose Roster a Hero declined, the Levels gained before ' +
        'the first decline and from it on, and the Stat points Levels added and declines took from it on:',
      '',
      markdownTable(
        [
          'Rosters with a decline',
          'Guilds',
          'Levels a Guild-year before',
          'Levels a Guild-year after',
          'Points grown a Guild-year after',
          'Points declined a Guild-year after',
        ],
        growthRows,
        ['left', 'right', 'right', 'right', 'right', 'right'],
      ),
      '',
    ];
  },
};

const retirementAges: Declared<GameCounters['retirementAges'], SweepTotals['retirementAges']> = {
  key: 'retirementAges',
  kind: 'play',
  read: (document) => retirementAgeCounters(document),
  zero: () => ({ player: {}, rival: {} }),
  section: 'progression',
  lines(totals: SweepTotals) {
    const bandWidth = 5;
    const ages = controllerKinds.flatMap((kind) => Object.keys(totals.retirementAges[kind]).map(Number));
    const bandOf = (age: number): number => Math.floor(age / bandWidth) * bandWidth;
    const inBand = (kind: ControllerKind, from: number): number =>
      Object.entries(totals.retirementAges[kind]).reduce((total, [age, n]) => (bandOf(Number(age)) === from ? total + n : total), 0);
    const ageRows: string[][] = [];
    if (ages.length > 0) {
      for (let from = bandOf(Math.min(...ages)); from <= Math.max(...ages); from += bandWidth) {
        ageRows.push([`${from} to ${from + bandWidth - 1}`, ...controllerKinds.map((kind) => whole(inBand(kind, from)))]);
      }
    }
    return [
      ...(ageRows.length === 0
        ? ['Retirements by age: no Hero retired.']
        : ['Retirements by age (`hero.retired`):', '', markdownTable(['Age', "Player's", "Rivals'"], ageRows, ['left', 'right', 'right'])]),
      '',
    ];
  },
};

const fameGate: Declared<GameObservations['fameGate'], SweepTotals['fameGate']> = {
  key: 'fameGate',
  kind: 'play',
  observe() {
    const gate = { player: noFameGate(), rival: noFameGate() };
    return { beforeChoices: ({ document, deps }) => observeFameGate(gate, document.world, deps), value: () => gate };
  },
  zero: () => ({ player: noFameGate(), rival: noFameGate() }),
  section: 'progression',
  lines(totals: SweepTotals) {
    const fameRows = controllerKinds.map((kind) => {
      const gate = totals.fameGate[kind];
      return [
        kindLabel(kind),
        whole(gate.heroDays),
        whole(gate.guildDays),
        ratio(gate.heroDays, gate.guildDays, 3),
        `${whole(gate.guildDaysWithAny)} (${percent(gate.guildDaysWithAny, gate.guildDays)})`,
      ];
    });
    return [
      'Signings refused by Fame (M3-S5, DL-38 item 9): each morning before the policy acts, the pool Heroes who would ' +
        'refuse each Guild in play (`unsignableHeroes`), whether or not the Guild asks:',
      '',
      markdownTable(
        ['Signings refused by Fame', 'Hero-Days refused', 'Guild-Days', 'Refused a Guild-Day', 'Guild-Days with one or more'],
        fameRows,
        ['left', 'right', 'right', 'right', 'right'],
      ),
      '',
    ];
  },
};

const signingRefused: Declared<never, number> = {
  key: 'signingRefused',
  kind: 'play',
  zero: () => 0,
  total: (game) => game.refusals.filter(({ rejection }) => rejection.reason === 'signing-refused').length,
  section: 'progression',
  lines: (totals: SweepTotals) => [
    `\`signing-refused\` rejections returned to the automatic policy: ${whole(totals.signingRefused)}. A Rival's refused ` +
      "choice is dropped inside the afternoon's phase (DL-30), out of the harness's sight; `steady` asks only Heroes " +
      'who would sign (DL-38 item 5).',
    '',
  ],
};

const gamesAtCountedYear: Declared<never, number> = {
  key: 'gamesAtCountedYear',
  kind: 'play',
  zero: () => 0,
  total: (game) => (game.counters.improvementGrades === null ? 0 : 1),
};

const grades: Declared<GameCounters['improvementGrades'], SweepTotals['improvementGrades']> = {
  key: 'improvementGrades',
  kind: 'play',
  read: (document, deps) => improvementGrades(document, deps, lastTurnOf(document))?.byController ?? null,
  zero: () => ({ player: noGrades(), rival: noGrades() }),
  section: 'progression',
  lines(totals: SweepTotals, { deps }) {
    const numbered = Array.from({ length: topGrade(deps) + 1 }, (_, grade) => grade);
    const gradeRow = (label: string, counts: readonly number[]): string[] => {
      const guilds = sum(counts);
      const graded = counts.reduce((total, n, grade) => total + n * grade, 0);
      return [label, whole(guilds), ratio(graded, guilds), ...numbered.map((grade) => whole(counts[grade] ?? 0))];
    };
    const gradeRows = [
      ...controllerKinds.flatMap((kind) =>
        facilityKeys.map((facility: FacilityKey) => gradeRow(`${kindLabel(kind)}: ${facility}`, totals.improvementGrades[kind][facility])),
      ),
      // The Rivals' rows again, by Disposition (DL-69).
      ...dispositionKeys(totals, deps).flatMap((disposition) =>
        facilityKeys.map((facility: FacilityKey) =>
          gradeRow(`The Rivals, \`${disposition}\`: ${facility}`, totals.improvementGradesByDisposition[disposition]?.[facility] ?? []),
        ),
      ),
    ];
    return [
      `Improvement grades reached in the first ${countedYear} years (M3-S6, DL-38 item 15), over the ${whole(totals.gamesAtCountedYear)} ` +
        'games that played them: the Guilds founded in them, replacement Rivals included, by the highest grade each ' +
        "facility reached in them; the Rivals' rows again by Disposition (M6, DL-69):",
      '',
      markdownTable(
        ['Controller: facility', 'Guilds', 'Mean grade', ...numbered.map((grade) => `Grade ${grade}`)],
        gradeRows,
        ['left', 'right', 'right', ...numbered.map(() => 'right' as const)],
      ),
      '',
    ];
  },
};

const gradesByDisposition: Declared<GameCounters['improvementGradesByDisposition'], SweepTotals['improvementGradesByDisposition']> = {
  key: 'improvementGradesByDisposition',
  kind: 'play',
  read: (document, deps) => improvementGrades(document, deps, lastTurnOf(document))?.byDisposition ?? null,
  zero: () => ({}),
};

// The Quest Engine (DL-55).

type EncounterTally = EncounterCounts[keyof EncounterCounts];

const encounters: Declared<GameCounters['encounters'], SweepTotals['encounters']> = {
  key: 'encounters',
  kind: 'play',
  read: (document) => encounterCounters(document),
  zero: () => ({ player: noEncounters(), rival: noEncounters() }),
  section: 'quest-engine',
  lines(totals: SweepTotals) {
    const kindTotal = (kind: ControllerKind): EncounterTally => {
      const all: EncounterTally = { success: 0, failure: 0, injured: 0, died: 0 };
      for (const encounterKind of encounterKinds) addInto(all, totals.encounters[kind][encounterKind]);
      return all;
    };
    const encounterCells = (tally: EncounterTally): string[] => {
      const checks = sum(encounterOutcomes.map((outcome) => tally[outcome]));
      return [
        whole(checks),
        `${whole(tally.success)} (${percent(tally.success, checks)})`,
        `${whole(tally.failure)} (${percent(tally.failure, checks)})`,
        ratio(tally.injured, checks, 3),
        ratio(tally.died, checks, 3),
      ];
    };
    const encounterRows = controllerKinds.flatMap((kind) => [
      ...encounterKinds.map((encounterKind) => [`${kindLabel(kind)}: ${encounterKind}`, ...encounterCells(totals.encounters[kind][encounterKind])]),
      [`${kindLabel(kind)}: every kind`, ...encounterCells(kindTotal(kind))],
    ]);
    return [
      'Encounter outcomes by kind (`quest.encounter`), by the Guild that sent the Party, with the Heroes its ' +
        'consequences injured and killed a Check:',
      '',
      markdownTable(
        ['Controller: kind', 'Checks', 'Succeeded', 'Failed', 'Injured a Check', 'Killed a Check'],
        encounterRows,
        ['left', 'right', 'right', 'right', 'right', 'right'],
      ),
      '',
    ];
  },
};

const synergies: Declared<GameCounters['synergies'], SweepTotals['synergies']> = {
  key: 'synergies',
  kind: 'play',
  read: (document) => synergyCounters(document),
  zero: () => ({ player: noSynergies(), rival: noSynergies() }),
  section: 'quest-engine',
  lines(totals: SweepTotals, { deps }) {
    const synergyRows = controllerKinds.map((kind) => {
      const tally = totals.synergies[kind];
      return [kindLabel(kind), whole(tally.quests), `${whole(tally.withAny)} (${percent(tally.withAny, tally.quests)})`, ratio(tally.applied, tally.quests, 3)];
    });
    const synergyKeys = keysOf(Object.keys(deps.content.synergies), totals.synergies.player.byKey, totals.synergies.rival.byKey);
    const byKeyRows = synergyKeys.map((key) => [
      `\`${key}\``,
      ...controllerKinds.map((kind) => {
        const n = totals.synergies[kind].byKey[key] ?? 0;
        return `${whole(n)} (${percent(n, totals.synergies[kind].quests)})`;
      }),
    ]);
    return [
      "Synergies applied per Quest (`quest.resolved`'s `synergyKeys`; a Quest names each Synergy once):",
      '',
      markdownTable(['Synergies', 'Quests resolved', 'With one or more', 'Synergies a Quest'], synergyRows, ['left', 'right', 'right', 'right']),
      '',
      markdownTable(['Quests applying it', "Player's", "Rivals'"], byKeyRows, ['left', 'right', 'right']),
      '',
    ];
  },
};

const partySizes: Declared<GameCounters['partySizes'], SweepTotals['partySizes']> = {
  key: 'partySizes',
  kind: 'play',
  read: (document) => partySizeCounters(document),
  zero: () => ({ player: {}, rival: {} }),
  section: 'quest-engine',
  // The Quests resolved by the size of the Party sent and the XP each Hero took, for the owner's
  // decision on splitting XP (DL-148 item 19), split by DL-182.
  lines(totals: SweepTotals) {
    const sizeRows = controllerKinds.flatMap((kind) => {
      const bySize = totals.partySizes[kind];
      const all = noPartySize();
      for (const tally of Object.values(bySize)) addInto(all, tally);
      const cells = (tally: PartySizeTally): string[] => [
        `${whole(tally.quests)} (${percent(tally.quests, all.quests)})`,
        percent(tally.fail, tally.quests),
        percent(tally.strong, tally.quests),
        ratio(tally.xpPerHero, tally.quests, 1),
        ratio(tally.xpTaken, tally.quests, 1),
      ];
      const sizes = Object.keys(bySize).sort((a, b) => Number(a) - Number(b));
      return [
        ...sizes.map((size) => [`${kindLabel(kind)}: ${size}`, ...cells(bySize[size] as PartySizeTally)]),
        [`${kindLabel(kind)}: every size (mean ${ratio(sum(sizes.map((size) => Number(size) * (bySize[size] as PartySizeTally).quests)), all.quests)})`, ...cells(all)],
      ];
    });
    return [
      'Quests resolved by the size of the Party sent (`quest.resolved`\'s `heroIds`), with the XP each Hero who came home took ' +
        "(`xpPerHero`: the Quest's XP split across the Party sent, its Dead counted, rounded down, v1.1.5-S13, DL-182) and the XP the Party took in all, a Quest:",
      '',
      markdownTable(
        ['Controller: Party size', 'Quests resolved', 'Failed', 'Strong', 'XP a Hero', 'XP the Party took'],
        sizeRows,
        ['left', 'right', 'right', 'right', 'right', 'right'],
      ),
      '',
    ];
  },
};

const traitsByKey: Declared<GameCounters['traitsGainedByKey'], SweepTotals['traitsGainedByKey']> = {
  key: 'traitsGainedByKey',
  kind: 'play',
  read: (document) => traitsGainedByKey(document),
  zero: () => ({ player: {}, rival: {} }),
  section: 'quest-engine',
  lines(totals: SweepTotals, { deps }) {
    const traitKeys = keysOf(Object.keys(deps.content.heroTraits), totals.traitsGainedByKey.player, totals.traitsGainedByKey.rival);
    const traitRows = traitKeys.map((key) => [`\`${key}\``, ...controllerKinds.map((kind) => whole(totals.traitsGainedByKey[kind][key] ?? 0))]);
    return [
      'Traits earned by key (`hero.trait-gained`), by the Guild the Hero was on:',
      '',
      markdownTable(['Trait', "Player's", "Rivals'"], traitRows, ['left', 'right', 'right']),
      '',
    ];
  },
};

const injuriesByType: Declared<GameCounters['injuriesByType'], SweepTotals['injuriesByType']> = {
  key: 'injuriesByType',
  kind: 'play',
  read: (document) => injuryCounters(document),
  zero: () => ({ player: {}, rival: {} }),
  section: 'quest-engine',
  lines(totals: SweepTotals, { deps }) {
    const injuryKeys = keysOf(Object.keys(deps.content.injuries), totals.injuriesByType.player, totals.injuriesByType.rival);
    const injuryTotal = (kind: ControllerKind): number => sum(Object.values(totals.injuriesByType[kind]));
    const injuryRows = [
      ...injuryKeys.map((key) => [
        `\`${key}\``,
        ...controllerKinds.map((kind) => {
          const n = totals.injuriesByType[kind][key] ?? 0;
          return `${whole(n)} (${percent(n, injuryTotal(kind))})`;
        }),
      ]),
      ['Every type', ...controllerKinds.map((kind) => whole(injuryTotal(kind)))],
    ];
    return [
      'Injuries by type (`hero.injured`), by the Guild the Hero was on:',
      '',
      markdownTable(['Injury type', "Player's", "Rivals'"], injuryRows, ['left', 'right', 'right']),
      '',
    ];
  },
};

const patronYears: Declared<number[], number[]> = {
  key: 'patronYears',
  kind: 'play',
  read: (document, deps) => patronSilence(document, deps.config.turnsPerYear, lastTurnOf(document)).patronYears,
  zero: () => [],
  section: 'quest-engine',
  lines(totals: SweepTotals) {
    const all = sum(totals.patronYears);
    const silent = sum(totals.silentPatronYears);
    const silentRows = totals.patronYears.map((n, year) => [
      whole(year + 1),
      whole(n),
      `${whole(totals.silentPatronYears[year] ?? 0)} (${percent(totals.silentPatronYears[year] ?? 0, n)})`,
    ]);
    return [
      'Patrons silent: in each year played in full, the Patrons in the world as it began that offered no Quest in it ' +
        `(no \`quest.offered\` naming them): ${whole(silent)} of ${whole(all)} Patron-years (${percent(silent, all)}).`,
      '',
      ...(silentRows.length === 0 ? ['No year was played in full.'] : [markdownTable(['Year', 'Patron-years', 'Silent'], silentRows, ['right', 'right', 'right'])]),
      '',
    ];
  },
};

const silentPatronYears: Declared<number[], number[]> = {
  key: 'silentPatronYears',
  kind: 'play',
  read: (document, deps) => patronSilence(document, deps.config.turnsPerYear, lastTurnOf(document)).silentPatronYears,
  zero: () => [],
};

const regardAtCountedYear: Declared<GameObservations['regardAtCountedYear'], SweepTotals['regardAtCountedYear']> = {
  key: 'regardAtCountedYear',
  kind: 'play',
  // Taken with the census as `countedYear` years have passed (DL-55).
  observe() {
    let snapshot: RegardSnapshot | null = null;
    const starts = census(({ document, deps }) => {
      if (starts.value().length === countedYear) snapshot = regardSnapshot(document.world, deps.config);
      return null;
    });
    return { ...starts, value: () => snapshot };
  },
  zero: () => ({ games: 0, relationships: noBands(), guildmasterForPatrons: noBands(), guildmasterForHeroes: noBands() }),
  total: ({ observations }) => (observations.regardAtCountedYear === null ? null : { games: 1, ...observations.regardAtCountedYear }),
  section: 'quest-engine',
  lines(totals: SweepTotals) {
    const regard = totals.regardAtCountedYear;
    const bandCells = (counts: Record<RegardBand, number>): string[] => {
      const all = sum(Object.values(counts));
      return [whole(all), ...regardBandNames.map((band) => `${whole(counts[band])} (${percent(counts[band], all)})`)];
    };
    return [
      ...(regard.games === 0
        ? [`No player's game was in play after ${countedYear} years: no Regard to count.`]
        : [
            `The player's Guild's Regard after ${countedYear} years, over the ${whole(regard.games)} games in play then, by band ` +
              "(a Relationship is the mean of two Heroes' Regard for each other, each unordered pair of the Roster once; the " +
              "Guildmaster's Regard is each entry of its map, which nothing reads in the first build):",
            '',
            markdownTable(
              ['Regard', 'Counted', ...regardBandNames],
              [
                ["Relationships within the player's Roster", ...bandCells(regard.relationships)],
                ["The player's Guildmaster for Patrons", ...bandCells(regard.guildmasterForPatrons)],
                ["The player's Guildmaster for Heroes", ...bandCells(regard.guildmasterForHeroes)],
              ],
              ['left', 'right', ...regardBandNames.map(() => 'right' as const)],
            ),
          ]),
      '',
    ];
  },
};

// Items (DL-62).

/** A kind of Guild's Guild-years in play. */
const guildYearsOf = (totals: SweepTotals, kind: ControllerKind): number => sum(totals.guildYears[kind]);

const wealth: Declared<GameCounters['wealth'], SweepTotals['wealth']> = {
  key: 'wealth',
  kind: 'play',
  read: (document) => wealthCounters(document),
  zero: () => ({ player: noWealth(), rival: noWealth() }),
  section: 'items',
  lines(totals: SweepTotals) {
    const perYear = (kind: ControllerKind, n: number): string[] => [whole(n), ratio(n, guildYearsOf(totals, kind), 1)];
    const flowRow = (label: string, read: (flows: WealthFlows) => number): string[] => [
      label,
      ...controllerKinds.flatMap((kind) => perYear(kind, read(totals.wealth[kind]))),
    ];
    const spent = (flows: WealthFlows): number => flows.signing + flows.transferFeesPaid + flows.items + flows.improvements + flows.upkeep;
    const taken = (flows: WealthFlows): number => flows.questRewards + flows.transferFeesTaken + sum(saleCauses.map((cause) => flows.sales[cause]));
    const shareRow = controllerKinds.flatMap((kind) => {
      const flows = totals.wealth[kind];
      const all = spent(flows);
      return [
        `${kindLabel(kind)}: signing ${percent(flows.signing, all)}, Transfers ${percent(flows.transferFeesPaid, all)}, ` +
          `Items ${percent(flows.items, all)}, Improvements ${percent(flows.improvements, all)}, Upkeep ${percent(flows.upkeep, all)}`,
      ];
    });
    const kindHeaders = controllerKinds.flatMap((kind) => [kind === 'player' ? "Player's" : "Rivals'", 'a Guild-year']);
    return [
      'Wealth spent by category and taken, by the Guild each entry names; a Guild-year as in M3\'s table. A ' +
        "Transfer's fee (M6) is spent by the Guild the Hero joins and taken by the Guild they leave.",
      '',
      markdownTable(
        ['Wealth', ...kindHeaders],
        [
          flowRow('Spent: signing fees (`hero.recruited` `fee`)', (flows) => flows.signing),
          flowRow('Spent: Transfers (`hero.transferred` `fee`, the buying Guild)', (flows) => flows.transferFeesPaid),
          flowRow('Spent: Items (`item.bought` `cost`)', (flows) => flows.items),
          flowRow('Spent: Improvements (`guild.improved` `cost`)', (flows) => flows.improvements),
          flowRow('Spent: Upkeep (`guild.upkeep-paid` `amount`)', (flows) => flows.upkeep),
          flowRow('Spent in all', spent),
          flowRow('Taken: Quest rewards (`quest.resolved` `wealthDelta`)', (flows) => flows.questRewards),
          flowRow('Taken: Transfers (`hero.transferred` `fee`, the selling Guild)', (flows) => flows.transferFeesTaken),
          ...saleCauses.map((cause) => flowRow(`Taken: the Market, \`item.sold\` \`${cause}\` (\`proceeds\`)`, (flows) => flows.sales[cause])),
          flowRow('Taken in all', taken),
          flowRow('Items bought (`item.bought` `quantity`)', (flows) => flows.itemsBought),
          ...saleCauses.map((cause) => flowRow(`Items sold, \`${cause}\``, (flows) => flows.itemsSold[cause])),
        ],
        ['left', 'right', 'right', 'right', 'right'],
      ),
      '',
      `Shares of the Wealth spent: ${shareRow.join('; ')}.`,
      '',
    ];
  },
};

const loot: Declared<GameCounters['loot'], SweepTotals['loot']> = {
  key: 'loot',
  kind: 'play',
  read: (document) => lootCounters(document),
  zero: () => ({ player: {}, rival: {} }),
  section: 'items',
  lines(totals: SweepTotals, { deps }) {
    const tables = keysOf(Object.keys(deps.content.lootTables), totals.loot.player, totals.loot.rival);
    const lootAll = (kind: ControllerKind): LootTally => {
      const all: LootTally = { awards: 0, items: 0, unique: 0 };
      for (const tally of Object.values(totals.loot[kind])) addInto(all, tally);
      return all;
    };
    const lootCells = (kind: ControllerKind, tally: LootTally | undefined): string[] => {
      const { awards, items, unique } = tally ?? { awards: 0, items: 0, unique: 0 };
      return [whole(awards), ratio(awards, guildYearsOf(totals, kind), 1), whole(items), whole(unique)];
    };
    const lootRows = [
      ...tables.map((table) => [`\`${table}\``, ...controllerKinds.flatMap((kind) => lootCells(kind, totals.loot[kind][table]))]),
      ['Every table', ...controllerKinds.flatMap((kind) => lootCells(kind, lootAll(kind)))],
    ];
    const lootPerQuest = controllerKinds
      .map((kind) => `${rosterOf(kind)} ${ratio(lootAll(kind).awards, totals.consumables[kind].quests, 3)} an award a Quest resolved`)
      .join('; ');
    return [
      'Loot awarded by table (`quest.loot` by `lootTableKey`): awards, the Items they gave, and the awards of a unique Item:',
      '',
      markdownTable(
        ['Loot table', "Player's awards", 'a Guild-year', 'Items', 'Unique', "Rivals' awards", 'a Guild-year', 'Items', 'Unique'],
        lootRows,
        ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
      ),
      '',
      `Loot a Quest resolved: ${lootPerQuest}.`,
      '',
    ];
  },
};

const questsByDifficulty: Declared<GameCounters['playerQuestsByDifficulty'], SweepTotals['playerQuestsByDifficulty']> = {
  key: 'playerQuestsByDifficulty',
  kind: 'play',
  read: (document, deps, seen) =>
    seen.playerQuestDifficulty === undefined ? null : playerDifficulty(document, deps.config.turnsPerYear, seen.playerQuestDifficulty).byBand,
  zero: () => [],
  section: 'items',
  lines(totals: SweepTotals) {
    const difficultyCells = (tally: DifficultyTally): string[] => [
      whole(tally.quests),
      ratio(tally.difficulty, tally.quests, 1),
      `${whole(tally.strong)} (${percent(tally.strong, tally.quests)})`,
      whole(tally.loot),
      ratio(tally.loot, tally.quests, 3),
      whole(tally.unique),
    ];
    const bandRows = totals.playerQuestsByDifficulty.flatMap((tally, band) =>
      tally.quests === 0 ? [] : [[`${band * difficultyBandWidth} to ${band * difficultyBandWidth + difficultyBandWidth - 1}`, ...difficultyCells(tally)]],
    );
    const yearRows = totals.playerQuestsByYear.map((tally, year) => [whole(year + 1), ...difficultyCells(tally)]);
    const allDifficulty = noDifficulty();
    for (const tally of totals.playerQuestsByDifficulty) addInto(allDifficulty, tally);
    const difficultyHeader = ['Quests resolved', 'Mean difficulty', 'Strong', 'Loot awards', 'Loot a Quest', 'Unique'];
    return [
      ...(allDifficulty.quests === 0
        ? ["No player's Quest with a recorded difficulty was resolved."]
        : [
            `The player's Quests by the difficulty the policy saw as it dispatched (no entry records it), ` +
              `${whole(allDifficulty.quests)} resolved, mean difficulty ${ratio(allDifficulty.difficulty, allDifficulty.quests, 1)}, ` +
              `${whole(allDifficulty.loot)} Loot awards (${ratio(allDifficulty.loot, allDifficulty.quests, 3)} a Quest). ` +
              `By the Quest's difficulty (M5-S5's third box):`,
            '',
            markdownTable(['Difficulty', ...difficultyHeader], bandRows, ['left', ...difficultyHeader.map(() => 'right' as const)]),
            '',
            'By the year resolved in (year 1 is the first):',
            '',
            markdownTable(['Year', ...difficultyHeader], yearRows, ['right', ...difficultyHeader.map(() => 'right' as const)]),
          ]),
      '',
    ];
  },
};

const questWeight: Declared<GameCounters['questWeight'], SweepTotals['questWeight']> = {
  key: 'questWeight',
  kind: 'play',
  read: (document) => questWeightCounters(document),
  zero: () => ({}),
};

const questsByYear: Declared<GameCounters['playerQuestsByYear'], SweepTotals['playerQuestsByYear']> = {
  key: 'playerQuestsByYear',
  kind: 'play',
  read: (document, deps, seen) =>
    seen.playerQuestDifficulty === undefined ? null : playerDifficulty(document, deps.config.turnsPerYear, seen.playerQuestDifficulty).byYear,
  zero: () => [],
};

const consumables: Declared<GameCounters['consumables'], SweepTotals['consumables']> = {
  key: 'consumables',
  kind: 'play',
  read: (document) => consumableCounters(document),
  zero: () => ({ player: noConsumables(), rival: noConsumables() }),
  section: 'items',
  lines(totals: SweepTotals, { deps }) {
    const consumableRows = controllerKinds.map((kind) => {
      const tally = totals.consumables[kind];
      return [
        kindLabel(kind),
        whole(tally.quests),
        whole(tally.carried),
        ratio(tally.carried, tally.quests, 3),
        whole(tally.expended),
        ratio(tally.expended, tally.quests, 3),
        `${whole(tally.questsWithAny)} (${percent(tally.questsWithAny, tally.quests)})`,
        ...consumableEffects.map((effect) => whole(tally.byEffect[effect])),
      ];
    });
    const definitions = keysOf(
      Object.values(deps.content.items)
        .filter((definition) => definition.kind === 'consumable')
        .map((definition) => definition.key),
      totals.consumables.player.byDefinition,
      totals.consumables.rival.byDefinition,
    );
    const definitionRows = definitions.map((key) => [`\`${key}\``, ...controllerKinds.map((kind) => whole(totals.consumables[kind].byDefinition[key] ?? 0))]);
    return [
      "Consumables carried (`quest.taken`'s `consumables`) and expended (`item.expended`) against the Quests resolved:",
      '',
      markdownTable(
        ['Consumables', 'Quests resolved', 'Carried', 'a Quest', 'Expended', 'a Quest', 'Quests with one or more', ...consumableEffects],
        consumableRows,
        ['left', 'right', 'right', 'right', 'right', 'right', 'right', ...consumableEffects.map(() => 'right' as const)],
      ),
      '',
      markdownTable(['Expended, by definition', "Player's", "Rivals'"], definitionRows, ['left', 'right', 'right']),
      '',
    ];
  },
};

const gear: Declared<GameCounters['gear'], SweepTotals['gear']> = {
  key: 'gear',
  kind: 'play',
  read: (document) => gearCounters(document),
  zero: () => ({ player: noGear(), rival: noGear() }),
  section: 'items',
  lines(totals: SweepTotals) {
    const gearRows = controllerKinds.map((kind) => {
      const tally = totals.gear[kind];
      return [
        kindLabel(kind),
        whole(tally.equipped),
        ratio(tally.equipped, guildYearsOf(totals, kind), 1),
        whole(tally.unequipped),
        ...gearReturnCauses.map((cause) => whole(tally.returned[cause])),
      ];
    });
    return [
      'Gear moved (`item.equipped`, `item.unequipped`, and `item.returned` by its `cause`):',
      '',
      markdownTable(
        ['Gear', 'Equipped', 'a Guild-year', 'Unequipped', ...gearReturnCauses.map((cause) => `Returned: ${cause}`)],
        gearRows,
        ['left', 'right', 'right', 'right', ...gearReturnCauses.map(() => 'right' as const)],
      ),
      '',
    ];
  },
};

// Rivals (DL-69).

/** Transfers by direction, by way, by side and back to a seller, from the History and the afternoons the loop saw. */
const transfersOf = (document: WorldDocument, afternoons: RivalAfternoons | undefined) => transferCounters(document, afternoons);

/** A Transfer tally's cells: the count, a game, the fees and the mean fee. */
const transferCells = (totals: SweepTotals, tally: TransferTally): string[] => [
  whole(tally.transfers),
  perGameOf(totals)(tally.transfers),
  whole(tally.fees),
  ratio(tally.fees, tally.transfers, 0),
];

const transfers: Declared<GameCounters['transfers'], SweepTotals['transfers']> = {
  key: 'transfers',
  kind: 'play',
  read: (document, _deps, seen) => transfersOf(document, seen.afternoons).transfers,
  zero: () => Object.fromEntries(transferDirections.map((direction) => [direction, noTransfers()])) as Record<TransferDirection, TransferTally>,
  section: 'rivals',
  lines(totals: SweepTotals) {
    const everyTransfer = noTransfers();
    for (const direction of transferDirections) addInto(everyTransfer, totals.transfers[direction]);
    const directionLabels: Record<TransferDirection, string> = {
      in: "Into the player's Guild",
      out: "Out of the player's Guild",
      'rival-to-rival': 'Rival to Rival',
    };
    const directionRows = [
      ...transferDirections.map((direction) => [directionLabels[direction], ...transferCells(totals, totals.transfers[direction])]),
      ['Every Transfer', ...transferCells(totals, everyTransfer)],
    ];
    const playerTransfers = totals.transfers.in.transfers + totals.transfers.out.transfers;
    return [
      `The M6-S3 harness assertion: \`hero.transferred\` entries naming the player's Guild, ${whole(playerTransfers)}; ` +
        `games it stopped, ${whole(totals.assertionGames)}. The automatic policy declines every Transfer Offer and never ` +
        'transfers, and the Transfer Generator never takes from the player, so any such entry is a harness failure: it ' +
        'stops its game and is listed under "Harness assertions broken", as a validator refusal is under its own heading.',
      '',
      'Transfers by direction:',
      '',
      markdownTable(['Transfers', 'Count', 'a game', 'Fees', 'Mean fee'], directionRows, ['left', 'right', 'right', 'right', 'right']),
      '',
    ];
  },
};

const rivalTransfers: Declared<GameCounters['rivalTransfers'], SweepTotals['rivalTransfers']> = {
  key: 'rivalTransfers',
  kind: 'play',
  read: (document, _deps, seen) => transfersOf(document, seen.afternoons).rivalTransfers,
  zero: () => Object.fromEntries(rivalTransferWays.map((way) => [way, noTransfers()])) as Record<RivalTransferWay, TransferTally>,
  section: 'rivals',
  lines(totals: SweepTotals) {
    const wayLabels: Record<RivalTransferWay, string> = {
      afternoon: "An afternoon, the seller out of debt: the buyer's choice (`transferChoice`)",
      'afternoon-seller-in-debt': "An afternoon, the seller in debt: the buyer's choice or the seller's debt sale (`debtTransfer`)",
      generator: 'A night: the Transfer Generator',
      'accepted-offer': 'An accepted Transfer Offer (`offerId` set)',
    };
    const wayRows = rivalTransferWays.map((way) => [wayLabels[way], ...transferCells(totals, totals.rivalTransfers[way])]);
    return [
      'Rival to Rival, by how each happened. No entry says which action made a Transfer: an accepted offer names it, a ' +
        "night's is the Generator's (Rivals choose in the afternoon), and an afternoon's is the buyer's choice unless the " +
        'seller was in debt as the afternoon began, when it may be the seller\'s debt sale instead; the entries cannot tell ' +
        'those two apart.',
      '',
      markdownTable(['Rival to Rival', 'Count', 'a game', 'Fees', 'Mean fee'], wayRows, ['left', 'right', 'right', 'right', 'right']),
      '',
    ];
  },
};

const transfersBack: Declared<number, number> = {
  key: 'transfersBack',
  kind: 'play',
  read: (document, _deps, seen) => transfersOf(document, seen.afternoons).transfersBack,
  zero: () => 0,
  section: 'rivals',
  lines: (totals: SweepTotals) => [`Transfers that took a Hero to a Guild that had sold them before (DL-60's lock): ${whole(totals.transfersBack)}.`, ''],
};

const transfersBackSoon: Declared<number, number> = {
  key: 'transfersBackSoon',
  kind: 'play',
  read: (document, _deps, seen) => transfersOf(document, seen.afternoons).transfersBackSoon,
  zero: () => 0,
  section: 'rivals',
  lines: (totals: SweepTotals) => [
    `Of those, fewer than ${whole(pingPongDays)} Days after that Guild's last sale of the Hero (DL-69 item 4's ping-pong): ${whole(totals.transfersBackSoon)}.`,
    '',
  ],
};

const short: Declared<number, number> = {
  key: 'transfersShort',
  kind: 'play',
  observe() {
    let count = 0;
    return { advanced: ({ before, events, deps }) => (count += transfersShort(before.world, events, deps.config)), value: () => count };
  },
  zero: () => 0,
  section: 'rivals',
  lines: (totals: SweepTotals, { deps }) => [
    `Transfers that left their seller below \`rivalRosterMin\` (${whole(deps.config.rivalRosterMin)}), its Roster followed through the Turn from the world ` +
      `the Turn began with (DL-69 item 4): ${whole(totals.transfersShort)}.`,
    '',
  ],
};

const transfersBySide: Declared<GameCounters['transfersBySide'], SweepTotals['transfersBySide']> = {
  key: 'transfersBySide',
  kind: 'play',
  read: (document, _deps, seen) => transfersOf(document, seen.afternoons).transfersBySide,
  zero: () => ({}),
  section: 'rivals',
  lines(totals: SweepTotals, { deps }) {
    const sides = sidesOf(totals, deps);
    const pair = (seller: string, buyer: string): TransferTally => totals.transfersBySide[seller]?.[buyer] ?? noTransfers();
    const sideRows = sides.map((side) => {
      const bought = noTransfers();
      const sold = noTransfers();
      for (const other of sides) {
        addInto(bought, pair(other, side));
        addInto(sold, pair(side, other));
      }
      return [capitalised(sideLabel(side)), whole(bought.transfers), whole(bought.fees), whole(sold.transfers), whole(sold.fees), whole(bought.transfers - sold.transfers)];
    });
    const matrixRows = sides.map((seller) => [capitalised(sideLabel(seller)), ...sides.map((buyer) => whole(pair(seller, buyer).transfers))]);
    return [
      'By side, bought and sold:',
      '',
      markdownTable(['Side', 'Bought', 'Fees paid', 'Sold', 'Fees taken', 'Net Heroes'], sideRows, ['left', 'right', 'right', 'right', 'right', 'right']),
      '',
      markdownTable(['Sold by, bought by', ...sides.map((side) => capitalised(sideLabel(side)))], matrixRows, ['left', ...sides.map(() => 'right' as const)]),
      '',
    ];
  },
};

const offers: Declared<GameCounters['offers'], SweepTotals['offers']> = {
  key: 'offers',
  kind: 'play',
  read: (document) => offerCounters(document),
  zero: () => ({}),
  section: 'rivals',
  lines(totals: SweepTotals, { deps }) {
    const sides = sidesOf(totals, deps);
    const offerRows = sides.flatMap((maker) =>
      sides.flatMap((asked) => {
        const tally = totals.offers[maker]?.[asked];
        if (tally === undefined) return [];
        const ended = sum(offerEndCauses.map((cause) => tally.ended[cause]));
        return [
          [
            `${capitalised(sideLabel(maker))} to ${sideLabel(asked)}`,
            whole(tally.made),
            ratio(tally.fees, tally.made, 0),
            whole(tally.accepted),
            whole(tally.declined),
            ...offerEndCauses.map((cause) => whole(tally.ended[cause])),
            whole(tally.made - tally.accepted - tally.declined - ended),
          ],
        ];
      }),
    );
    return [
      ...(offerRows.length === 0
        ? ['No Transfer Offer was made.']
        : [
            'Transfer Offers, by the Guild that made them and the Guild asked: made (`guild.transfer-offered`), accepted ' +
              '(a `hero.transferred` naming the offer), declined (`guild.transfer-offer-declined`), ended unanswered ' +
              '(`guild.transfer-offer-expired` by its `cause`), and standing when the game stopped:',
            '',
            markdownTable(
              ['Offers', 'Made', 'Mean fee', 'Accepted', 'Declined', ...offerEndCauses.map((cause) => `Ended: ${cause}`), 'Standing'],
              offerRows,
              ['left', 'right', 'right', 'right', 'right', ...offerEndCauses.map(() => 'right' as const), 'right'],
            ),
          ]),
      '',
    ];
  },
};

const rivalYearStarts: Declared<GameObservations['rivalYearStarts'], SweepTotals['rivalYearStarts']> = {
  key: 'rivalYearStarts',
  kind: 'play',
  observe: () => census(({ document }) => rivalsInPlay(document.world)),
  zero: () => [],
  fold: 'joined',
  total: ({ observations }) =>
    observations.rivalYearStarts.map((rivals: readonly RivalAtYearStart[]) => {
      const starts: Record<string, RivalYearStarts> = {};
      for (const { disposition, heroes, wealth: held } of rivals) {
        const start = (starts[disposition] ??= { heroes: [], wealth: [] });
        start.heroes.push(heroes);
        start.wealth.push(held);
      }
      return starts;
    }),
  section: 'rivals',
  lines(totals: SweepTotals, { deps }) {
    const { config } = deps;
    const dispositions = dispositionKeys(totals, deps);
    const rangeCells = (starts: RivalYearStarts): string[] => {
      const count = (values: readonly number[], test: (n: number) => boolean): number => values.filter(test).length;
      const rostered = summarise(starts.heroes);
      const wealths = summarise(starts.wealth);
      return [
        whole(starts.heroes.length),
        fixed(rostered.mean),
        whole(rostered.p50),
        percent(count(starts.heroes, (n) => n < config.rivalRosterMin), starts.heroes.length),
        percent(count(starts.heroes, (n) => n > config.rivalRosterMax), starts.heroes.length),
        whole(wealths.mean),
        whole(wealths.p50),
        percent(count(starts.wealth, (n) => n < config.rivalStartingWealthMin), starts.wealth.length),
        percent(count(starts.wealth, (n) => n > config.rivalStartingWealthMax), starts.wealth.length),
      ];
    };
    const rangeHeader = [
      'Rival year-starts',
      'Roster, mean',
      'median',
      `below ${whole(config.rivalRosterMin)}`,
      `above ${whole(config.rivalRosterMax)}`,
      'Wealth, mean',
      'median',
      `below ${whole(config.rivalStartingWealthMin)}`,
      `above ${whole(config.rivalStartingWealthMax)}`,
    ];
    const rangeAlign = rangeHeader.map(() => 'right' as const);
    const allYearRows = totals.rivalYearStarts.map((byDisposition, year) => [whole(year), ...rangeCells(merged(Object.values(byDisposition)))]);
    const dispositionYearRows = dispositions.flatMap((disposition) =>
      totals.rivalYearStarts.flatMap((byDisposition, year) => {
        const starts = byDisposition[disposition];
        return starts === undefined ? [] : [[`\`${disposition}\``, whole(year), ...rangeCells(starts)]];
      }),
    );
    const overallRows = [
      ...dispositions.map((disposition) => [`\`${disposition}\``, ...rangeCells(everyStart(totals, disposition))]),
      ['Every Rival', ...rangeCells(everyStart(totals))],
    ];
    return [
      'The Rivals in play as each year began, before the policy acts, by the years played before it (0 is the new world, as year 1 begins): ' +
        `each Roster's size against ` +
        `the range a Rival is generated with (\`rivalRosterMin\` ${whole(config.rivalRosterMin)} to \`rivalRosterMax\` ` +
        `${whole(config.rivalRosterMax)}), and its Wealth against its starting range (\`rivalStartingWealthMin\` ` +
        `${whole(config.rivalStartingWealthMin)} to \`rivalStartingWealthMax\` ${whole(config.rivalStartingWealthMax)}); ` +
        'a median is the middle year-start, the lower of two:',
      '',
      markdownTable(['After years', ...rangeHeader], allYearRows, ['right', ...rangeAlign]),
      '',
      'By Disposition, over every year-start, then year by year:',
      '',
      markdownTable(['Disposition', ...rangeHeader], overallRows, ['left', ...rangeAlign]),
      '',
      markdownTable(['Disposition', 'After years', ...rangeHeader], dispositionYearRows, ['left', 'right', ...rangeAlign]),
      '',
    ];
  },
};

const atFloor: Declared<GameObservations['rivalsAtFloor'], SweepTotals['rivalsAtFloor']> = {
  key: 'rivalsAtFloor',
  kind: 'play',
  observe: () => census(({ document, deps }) => rivalsAtFloor(document.world, deps)),
  zero: () => ({}),
  // Every year-start of the game at once: DL-69 item 4's line reads each Disposition's over all of them.
  total: ({ observations }) => {
    const all: Record<string, FloorTally> = {};
    for (const year of observations.rivalsAtFloor) for (const [disposition, tally] of Object.entries(year)) addInto((all[disposition] ??= { starts: 0, hoarding: 0 }), tally);
    return all;
  },
};

const rankings: Declared<GameObservations['rankings'], SweepTotals['rankings']> = {
  key: 'rankings',
  kind: 'play',
  observe: () => census(({ document }) => playerRanking(document.world)),
  zero: () => [],
  total: ({ observations }) =>
    observations.rankings.map((ranking) => (ranking === null ? null : { games: 1, fame: oneHot(ranking.fame), wealth: oneHot(ranking.wealth) })),
  section: 'rivals',
  lines(totals: SweepTotals) {
    const places = Math.max(0, ...totals.rankings.flatMap((tally) => [tally.fame.length, tally.wealth.length]));
    const placeNumbers = Array.from({ length: places }, (_, index) => index + 1);
    const meanPlace = (counts: readonly number[]): number => counts.reduce((total, n, index) => total + n * (index + 1), 0);
    const rankingRows = (by: 'fame' | 'wealth'): string[][] => {
      const all = { games: 0, counts: [] as number[] };
      const rows = totals.rankings.map((tally, year) => {
        all.games += tally.games;
        addInto(all.counts, tally[by]);
        return [
          whole(year),
          whole(tally.games),
          ratio(meanPlace(tally[by]), tally.games),
          ...placeNumbers.map((place) => `${whole(tally[by][place - 1] ?? 0)} (${percent(tally[by][place - 1] ?? 0, tally.games)})`),
        ];
      });
      const everyRow = (label: string, tally: { games: number; counts: number[] }): string[] => [
        label,
        whole(tally.games),
        ratio(meanPlace(tally.counts), tally.games),
        ...placeNumbers.map((place) => `${whole(tally.counts[place - 1] ?? 0)} (${percent(tally.counts[place - 1] ?? 0, tally.games)})`),
      ];
      const later = { games: 0, counts: [] as number[] };
      for (const tally of totals.rankings.slice(1)) {
        later.games += tally.games;
        addInto(later.counts, tally[by]);
      }
      return [...rows, everyRow('Every year', all), everyRow('After 1 year or more', later)];
    };
    const rankingHeader = ['After years', 'Games', 'Mean place', ...placeNumbers.map((place) => `Place ${place}`)];
    const rankingAlign = rankingHeader.map(() => 'right' as const);
    return [
      "The player's Guild's place in the Rankings (the engine's `rankings`, every Guild in play) as each year began, by the years " +
        "played before it (0 is the new world), by Fame. In the new world every Guild stands at the founding Fame (`foundingFame`), a tie the player's Guild wins " +
        "by its id; the row 'After 1 year or more' leaves the new world out, as the Targets do (DL-86 item 12):",
      '',
      markdownTable(rankingHeader, rankingRows('fame'), rankingAlign),
      '',
      'By Wealth:',
      '',
      markdownTable(rankingHeader, rankingRows('wealth'), rankingAlign),
      '',
    ];
  },
};

const marketPurchases: Declared<GameCounters['marketPurchases'], SweepTotals['marketPurchases']> = {
  key: 'marketPurchases',
  kind: 'play',
  read: (document) => marketPurchaseCounters(document),
  zero: () => ({}),
  section: 'rivals',
  lines(totals: SweepTotals, { deps }) {
    const sides = sidesOf(totals, deps);
    const dispositions = dispositionKeys(totals, deps);
    const purchasesOf = (keys: readonly string[]): MarketTally => {
      const all = noPurchases();
      for (const key of keys) addInto(all, totals.marketPurchases[key] ?? noPurchases());
      return all;
    };
    const purchaseCells = (tally: MarketTally, inPlay: number): string[] => [
      whole(tally.purchases),
      ratio(tally.purchases, inPlay),
      whole(tally.items),
      whole(tally.cost),
      ratio(tally.cost, tally.purchases, 0),
    ];
    const rivalSides = sides.filter((side) => side !== playerSide);
    const purchaseRows = [
      ["The player's Guild", ...purchaseCells(purchasesOf([playerSide]), sum(totals.guildYears.player))],
      ['The Rivals', ...purchaseCells(purchasesOf(rivalSides), sum(totals.guildYears.rival))],
      ...dispositions.map((disposition) => [
        `The Rivals, \`${disposition}\``,
        ...purchaseCells(purchasesOf([disposition]), totals.dispositions[disposition]?.guildYears ?? 0),
      ]),
    ];
    return [
      'Market purchases (`item.bought`), by the buying Guild:',
      '',
      markdownTable(['Market purchases', 'Purchases', 'a Guild-year', 'Items', 'Cost', 'Mean cost'], purchaseRows, [
        'left',
        'right',
        'right',
        'right',
        'right',
        'right',
      ]),
      '',
    ];
  },
};

const dispositions: Declared<GameCounters['dispositions'], SweepTotals['dispositions']> = {
  key: 'dispositions',
  kind: 'play',
  read: (document, deps, seen) => dispositionCounters(document, deps, lastTurnOf(document), seen.afternoons),
  zero: () => ({}),
  section: 'rivals',
  lines(totals: SweepTotals, { deps }) {
    const keys = dispositionKeys(totals, deps);
    const characterRows = keys.map((disposition) => {
      const tally = totals.dispositions[disposition] ?? noDisposition();
      const resolved = sum(Object.values(tally.questsResolved));
      const folds = sum(Object.values(tally.folds));
      const starts = everyStart(totals, disposition);
      return [
        `\`${disposition}\``,
        whole(tally.guilds),
        fixed(tally.guildYears, 1),
        ratio(tally.questsTaken, tally.guildYears, 1),
        ratio(tally.difficulty, tally.questsWithDifficulty, 1),
        percent(tally.questsResolved.fail, resolved),
        ratio(tally.deaths, tally.guildYears),
        ratio(tally.recruits, tally.guildYears),
        `${whole(folds)} (${endingReasons.map((reason) => whole(tally.folds[reason])).join(' / ')})`,
        ratio(folds, tally.guildYears, 3),
        ratio(sum(starts.heroes), starts.heroes.length, 1),
        ratio(sum(starts.wealth), starts.wealth.length, 0),
      ];
    });
    const withDifficulty = sum(keys.map((disposition) => totals.dispositions[disposition]?.questsWithDifficulty ?? 0));
    const taken = sum(keys.map((disposition) => totals.dispositions[disposition]?.questsTaken ?? 0));
    return [
      `Each Disposition's character: its Rivals (replacements included) and their years in play; the Quests they took ` +
        `(\`quest.taken\`) and the mean difficulty of the ${whole(withDifficulty)} of ${whole(taken)} whose difficulty the ` +
        'play loop read; the share failed of those resolved; Deaths (`hero.died`) and recruits (`hero.recruited`) a ' +
        `Guild-year; folds (\`guild.folded\`, ${endingReasons.join(' / ')}); and the Roster and Wealth at a year-start:`,
      '',
      markdownTable(
        [
          'Disposition',
          'Rivals',
          'Guild-years',
          'Quests a Guild-year',
          'Mean difficulty',
          'Failed',
          'Deaths a Guild-year',
          'Recruits a Guild-year',
          'Folds',
          'Folds a Guild-year',
          'Roster',
          'Wealth',
        ],
        characterRows,
        ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
      ),
      '',
    ];
  },
};

// The modules' own (DL-78): each module event type, and the core's events a module's effects made.

const moduleEvents: Declared<GameCounters['moduleEvents'], SweepTotals['moduleEvents']> = {
  key: 'moduleEvents',
  kind: 'module',
  read: (document) => moduleCounters(document).moduleEvents,
  zero: () => ({}),
};

const moduleEffects: Declared<GameCounters['moduleEffects'], SweepTotals['moduleEffects']> = {
  key: 'moduleEffects',
  kind: 'module',
  read: (document) => moduleCounters(document).moduleEffects,
  zero: () => ({}),
};

// The Portraits, the Heroes described and the World State: no rule reads a Portrait or a text, and
// the World State's copy is timed (DL-134 item 9, DL-135 item 6, DL-203).

const portraits: Declared<GameCounters['portraits'], SweepTotals['portraits']> = {
  key: 'portraits',
  kind: 'play',
  read: (document, deps) => portraitCounters(document, deps),
  zero: () => ({ player: noPortraits(), rival: noPortraits() }),
  section: 'portraits',
  lines(totals: SweepTotals) {
    const { player, rival } = totals.portraits;
    const all: PortraitTally = { ...noPortraits() };
    for (const tally of [player, rival]) addInto(all, tally);
    const row = (label: string, pick: (tally: PortraitTally) => number, of: (tally: PortraitTally) => number): string[] => [
      label,
      ...[player, rival, all].map((tally) => `${whole(pick(tally))} (${percent(pick(tally), of(tally))})`),
    ];
    return [
      "Every Guildmaster who entered play, the player's and every Rival's, founding, replacing or succeeding, by their Guild's " +
        'controller. A Portrait is chosen to fit a Guildmaster already drawn (DL-134 item 5), so none of these moves a play counter.',
      '',
      markdownTable(
        ['Guildmasters', "Player's", "Rivals'", 'All'],
        [
          ['Entered play', ...[player, rival, all].map((tally) => whole(tally.guildmasters))],
          row('With a picture', (tally) => tally.pictured, (tally) => tally.guildmasters),
          row('With the Silhouette', (tally) => tally.silhouettes, (tally) => tally.guildmasters),
          row("Their picture's `apparentAge` holds their age", (tally) => tally.ageHeld, (tally) => tally.pictured),
          row("Their picture's Calling clashes with a Trait", (tally) => tally.callingClashes, (tally) => tally.pictured),
        ],
        ['left', 'right', 'right', 'right'],
      ),
      '',
      'The last two are shares of those with a picture.',
      '',
    ];
  },
};

const heroes: Declared<HeroTally, HeroTally> = {
  key: 'heroes',
  kind: 'play',
  observe() {
    const seen: HeroesSeen = { tally: noHeroes(), turnsRead: null };
    return {
      created: ({ document, events }) => observeHeroes(seen, document.world, events),
      advanced: ({ after, events }) => observeHeroes(seen, after.world, events),
      value: () => seen.tally,
    };
  },
  zero: () => noHeroes(),
  fold: { longestAppearance: 'greatest', longestBiography: 'greatest' },
  section: 'heroes',
  lines(totals: SweepTotals) {
    const tally = totals.heroes;
    const share = (n: number, of: number): string => `${whole(n)} (${percent(n, of)})`;
    return [
      'Every Hero generated, at creation, in the pool and on a new Rival\'s Roster. A Portrait is chosen to fit a Hero already ' +
        'drawn and their texts follow it (DL-135 items 3 and 6), each on a stream of its own, so none of these moves a play counter.',
      '',
      markdownTable(
        ['Heroes', 'Count'],
        [
          ['Generated', whole(tally.generated)],
          ['With a picture', share(tally.pictured, tally.generated)],
          ['With the Silhouette', share(tally.silhouettes, tally.generated)],
          ['Given a picture another Hero on a Roster or in the pool held (a repeat)', share(tally.repeats, tally.pictured)],
          ['With an empty Appearance or Biography', whole(tally.blank)],
          [`The longest Appearance written, in characters (at most ${whole(descriptiveAttributeMaxLength.appearance)})`, whole(tally.longestAppearance)],
          [`The longest Biography written, in characters (at most ${whole(descriptiveAttributeMaxLength.biography)})`, whole(tally.longestBiography)],
        ],
        ['left', 'right'],
      ),
      '',
    ];
  },
};

const saves: Declared<SaveSize[], SaveYear[]> = {
  key: 'saves',
  kind: 'measure',
  // The save's length as each year ends, counted without writing it (DL-174): the World State walked
  // once a year, and the History, append-only (ADR-0008), counted as it grows (DL-238). The last
  // year's gzipped from the save the record writes once the game stops.
  observe() {
    const taken: SaveSize[] = [];
    let historyLength: ReturnType<typeof historyLengthCounter> | null = historyLengthCounter();
    return {
      yearEnded({ document, worldLength }) {
        if (historyLength !== null) observeSave(taken, document.world, savedDocumentLength(document, historyLength, worldLength()));
      },
      ended() {
        // The count holds the History it follows: dropped with the game (DL-239).
        historyLength = null;
      },
      measured({ gzipped }) {
        const last = taken.at(-1);
        if (gzipped !== null && last !== undefined) last.gzipped = gzipped;
      },
      value: () => taken,
    };
  },
  zero: () => [],
  fold: 'joined',
  total: ({ observations }) =>
    observations.saves.map((save) => ({ lengths: [save.length], heroFields: [save.heroFields], gzipped: save.gzipped === null ? [] : [save.gzipped] })),
  section: 'heroes',
  lines(totals: SweepTotals) {
    const years = totals.saves;
    const last = years.at(-1);
    const gzipped = last === undefined ? summarise([]) : summarise(last.gzipped);
    const largest = last === undefined ? Number.NaN : Math.max(...last.lengths);
    return [
      "The save as each year ended: `serialise(document).length` in characters, its bytes while it is ASCII, over the games " +
        "that reached it, and the part the Heroes' `portraitKey`, `appearance` and `biography` take:",
      '',
      markdownTable(
        ['Year', 'Games', 'Mean MiB', 'Max MiB', "Heroes' fields, mean MiB", "Heroes' fields, max MiB", 'Share of the mean'],
        years.map((year, index) => {
          const lengths = summarise(year.lengths);
          const fields = summarise(year.heroFields);
          return [
            String(index + 1),
            whole(year.lengths.length),
            mebibytes(lengths.mean),
            mebibytes(lengths.max),
            mebibytes(fields.mean),
            mebibytes(fields.max),
            percent(fields.mean, lengths.mean),
          ];
        }),
        ['right', 'right', 'right', 'right', 'right', 'right', 'right'],
      ),
      '',
      years.length === 0
        ? 'No year ended in any game: no save to measure.'
        : `The largest save as year ${years.length} ended: ${Number.isNaN(largest) ? 'none' : `${whole(largest)} characters, ${mebibytes(largest)} MiB`}; ` +
          `gzipped, as the page keeps it in IndexedDB (DL-67): mean ${mebibytes(gzipped.mean)} MiB, max ${mebibytes(gzipped.max)} MiB.`,
      '',
    ];
  },
};

const worlds: Declared<WorldSize[], WorldYear[]> = {
  key: 'worlds',
  kind: 'timing',
  observe() {
    const taken: WorldSize[] = [];
    return { yearEnded: ({ document, now, worldLength }) => observeWorld(taken, document.world, now, worldLength()), value: () => taken };
  },
  zero: () => [],
  fold: 'joined',
  total: ({ observations }) =>
    observations.worlds.map((world) => ({
      characters: [world.characters],
      heroes: { live: [world.heroes.live], writeOnce: [world.heroes.writeOnce] },
      guildmasters: { live: [world.guildmasters.live], writeOnce: [world.guildmasters.writeOnce] },
      guilds: { live: [world.guilds.live], writeOnce: [world.guilds.writeOnce] },
      otherRows: [world.otherRows],
      copyMs: [world.copyMs],
    })),
  section: 'worlds',
  lines(totals: SweepTotals) {
    const mean = (values: readonly number[]): string => fixed(summarise(values).mean, 1);
    return [
      "The World State as each year ended, over the games that reached it: `world`'s length in the save, in characters; " +
        "its rows in play and written once, which no rule writes again (the engine's `writeOnce`); and the per-Turn copy " +
        `that \`advance\` and each action make, \`copyWorld(world)\`, timed there, the mean of ${whole(copiesTimed)} copies. ` +
        'Measures, not play counters: `compare` leaves them out.',
      '',
      markdownTable(
        ['Year', 'Games', 'Mean MiB', 'Heroes in play', 'Heroes written once', 'Guildmasters in office', 'Retired', 'Guilds in play', 'Folded', 'Other rows', 'Copy, mean ms', 'Copy, max ms'],
        totals.worlds.map((year, index) => [
          String(index + 1),
          whole(year.characters.length),
          mebibytes(summarise(year.characters).mean),
          mean(year.heroes.live),
          mean(year.heroes.writeOnce),
          mean(year.guildmasters.live),
          mean(year.guildmasters.writeOnce),
          mean(year.guilds.live),
          mean(year.guilds.writeOnce),
          mean(year.otherRows),
          fixed(summarise(year.copyMs).mean, 3),
          fixed(summarise(year.copyMs).max, 3),
        ]),
        ['right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
      ),
      '',
    ];
  },
};

/**
 * The core's counters (DL-239), in the play report's order, which is the totals' order: each section's
 * lines in it, and the Summary's rows. A counter shown in another's table (the Heroes table's, the
 * by-year table's) gives no lines of its own.
 */
export const gameCounters: readonly Counter[] = [
  games,
  questsTaken,
  questsResolved,
  heroesInjured,
  byController('heroesDied', 'hero.died'),
  byController('heroesRecruited', 'hero.recruited'),
  byController('heroesRetired', 'hero.retired'),
  byController('traitsGained', 'hero.trait-gained'),
  byController('traitsLost', 'hero.trait-lost'),
  questing,
  ending,
  lastTurn,
  endings,
  yearsSurvived,
  rivalFolds,
  rivalSuccessions,
  refusals,
  invalidGames,
  assertionGames,
  belowFloor,
  byController('floorRecovered', 'guild.floor-recovered'),
  endedInYear,
  guildYears,
  levelsGained,
  declines,
  rosters,
  highestLevels,
  wealthMonths,
  growthAgainstDecline,
  retirementAges,
  fameGate,
  signingRefused,
  gamesAtCountedYear,
  grades,
  gradesByDisposition,
  encounters,
  synergies,
  partySizes,
  traitsByKey,
  injuriesByType,
  patronYears,
  silentPatronYears,
  regardAtCountedYear,
  wealth,
  loot,
  questsByDifficulty,
  questsByYear,
  questWeight,
  consumables,
  gear,
  transfers,
  rivalTransfers,
  transfersBack,
  transfersBackSoon,
  short,
  transfersBySide,
  offers,
  rivalYearStarts,
  atFloor,
  rankings,
  marketPurchases,
  dispositions,
  moduleEvents,
  moduleEffects,
  portraits,
  heroes,
  saves,
  worlds,
];

