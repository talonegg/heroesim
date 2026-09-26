// The play sweep across seeds (M2-S12): play each seed under the automatic policy, keep only its
// record (counters and measures, never the document), and replay one seed to check that the same
// seed under the same policy serialises byte for byte alike. `sweepPlay` plays in this
// process; `sweepPlayInParallel` shares the seeds among child processes (`shard.ts`), since a
// 20-year game takes most of a minute. `playReport` writes the result as Markdown. DL-34 records
// the method and the numbers.

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareByCodeUnit,
  encounterKinds,
  facilityKeys,
  regardBandNames,
  serialise,
  type EngineDeps,
  type FacilityKey,
  type QuestBand,
  type RegardBand,
} from '@heroesim/engine';
import {
  consumableEffects,
  controllerKinds,
  countedYear,
  difficultyBandWidth,
  encounterOutcomes,
  endingReasons,
  gearReturnCauses,
  noBands,
  noConsumables,
  noDifficulty,
  noGear,
  noWealth,
  saleCauses,
  type ByController,
  type ByYear,
  type ConsumableTally,
  type ControllerKind,
  type DifficultyTally,
  type EncounterCounts,
  type FameGate,
  type GearTally,
  type GradeCounts,
  type GrowthAgainstDecline,
  type LootTally,
  type RegardSnapshot,
  type RosterCensus,
  type SynergyTally,
  type WealthFlows,
} from './counters.js';
import { harnessSetup } from './creation.js';
import { defaultPolicyConfig, type PolicyConfig } from './policy.js';
import { defaultYears, playGame, type GameRecord, type PlayOptions } from './play.js';
import { fixed, localTimestamp, markdownTable, whole, type Machine } from './report.js';
import { playSeeds, type PlayedSeeds, type ShardJob, type ShardResult } from './shard.js';
import { summarise, type Summary } from './stats.js';

export interface PlaySweep {
  seeds: readonly string[];
  years: number;
  validated: boolean;
  policy: Readonly<PolicyConfig>;
  /** Processes the games were shared among: 1 when played in this one. */
  workers: number;
  games: GameRecord[];
  /** Milliseconds per `advance`, every Turn of every game. */
  advance: Summary;
  /** Milliseconds per validation after an `advance`, when validating. */
  validation: Summary;
  /**
   * One seed played twice more in this process, after the sweep: the first to have run its full
   * length, or the first seed when none did. Whether the two last documents serialise alike, and
   * the first replay's `advance` per Turn, taken with nothing else of the sweep running.
   */
  replay: { seed: string; identical: boolean; length: number; advance: Summary } | null;
  /** Milliseconds for the whole sweep, the replay included. */
  totalMs: number;
  /**
   * Wall-clock milliseconds for playing and recording the seeds, without the replay: the policy,
   * `advance`, validation when asked for, counting, and saving and loading each last document.
   */
  gamesMs: number;
}

export interface SweepOptions extends PlayOptions {
  /** A millisecond clock for the sweep's own wall-clock timings. */
  now?: () => number;
}

/** Plays `seed` twice in this process and compares the two last documents, timing the first. */
function replay(seed: string | undefined, deps: EngineDeps, options: PlayOptions): PlaySweep['replay'] {
  if (seed === undefined) return null;
  const once = playGame(seed, deps, { ...options, validate: false });
  const a = serialise(once.document);
  const b = serialise(playGame(seed, deps, { ...options, validate: false }).document);
  return { seed, identical: a === b, length: a.length, advance: summarise(once.advanceMs) };
}

function sweepOf(
  seeds: readonly string[],
  played: PlayedSeeds,
  deps: EngineDeps,
  options: SweepOptions,
  timing: { workers: number; started: number; gamesMs: number; now: () => number },
): PlaySweep {
  // The longest game makes the most of the comparison, and its timing the fairest of one game.
  const replayed = replay(played.games.find((game) => game.ranFullLength)?.seed ?? seeds[0], deps, options);
  return {
    seeds,
    years: options.years ?? defaultYears,
    validated: options.validate ?? false,
    policy: options.policy ?? defaultPolicyConfig,
    workers: timing.workers,
    games: played.games,
    advance: summarise(played.advanceMs),
    validation: summarise(played.validateMs),
    replay: replayed,
    totalMs: timing.now() - timing.started,
    gamesMs: timing.gamesMs,
  };
}

/**
 * Plays every seed in `seeds` in this process under `deps` and the options, then plays one of them
 * twice more (`PlaySweep.replay`) and compares the two last documents' serialisations. Never
 * throws on what it finds.
 */
export function sweepPlay(seeds: readonly string[], deps: EngineDeps, options: SweepOptions = {}): PlaySweep {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const played = playSeeds(seeds, deps, options);
  return sweepOf(seeds, played, deps, options, { workers: 1, started, gamesMs: now() - started, now });
}

/** Processes a parallel sweep uses by default: half the logical processors, one a core with SMT. */
export function defaultWorkers(): number {
  return Math.max(1, Math.floor(availableParallelism() / 2));
}

const shardModule = fileURLToPath(new URL('./shard.ts', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Runs one shard in a child process under tsx; resolves when it has written its result. */
function runChild(jobPath: string, resultPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', shardModule, jobPath, resultPath], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`A play shard exited with ${signal ?? `code ${code}`}: ${jobPath}`));
    });
  });
}

/**
 * `sweepPlay`, with the seeds dealt in turn among `workers` child processes (`shard.ts`), each
 * loading the core content and playing under `deps.config`; the records come back in seed order
 * and the replay is played in this process once they are done. The children load the core content
 * themselves, so `deps.content` must be it: a child that loads another refuses the sweep.
 *
 * @throws Error when a child fails or played with other content: a broken run, not a finding
 */
export async function sweepPlayInParallel(
  seeds: readonly string[],
  deps: EngineDeps,
  options: SweepOptions & { workers?: number } = {},
): Promise<PlaySweep> {
  const now = options.now ?? (() => performance.now());
  const workers = Math.max(1, Math.min(options.workers ?? defaultWorkers(), seeds.length));
  const started = now();
  const dir = mkdtempSync(join(tmpdir(), 'heroesim-play-'));
  try {
    const shards = Array.from({ length: workers }, (_, shard) => seeds.filter((_, index) => index % workers === shard));
    const paths = shards.map((shardSeeds, shard) => {
      const job: ShardJob = {
        seeds: shardSeeds,
        config: deps.config,
        years: options.years ?? defaultYears,
        validate: options.validate ?? false,
        policy: options.policy ?? defaultPolicyConfig,
      };
      const jobPath = join(dir, `job-${shard}.json`);
      writeFileSync(jobPath, JSON.stringify(job), 'utf8');
      return { jobPath, resultPath: join(dir, `result-${shard}.json`) };
    });
    await Promise.all(paths.map(({ jobPath, resultPath }) => runChild(jobPath, resultPath)));
    const results = paths.map(({ resultPath }) => JSON.parse(readFileSync(resultPath, 'utf8')) as ShardResult);
    const gamesMs = now() - started;

    const played: PlayedSeeds = { games: [], advanceMs: [], validateMs: [] };
    for (const result of results) {
      if (result.content.id !== deps.content.id || result.content.version !== deps.content.version) {
        throw new Error(`A play shard loaded content ${result.content.id} ${result.content.version}, not the sweep's`);
      }
      for (const ms of result.advanceMs) played.advanceMs.push(ms);
      for (const ms of result.validateMs) played.validateMs.push(ms);
    }
    // Seed i went to shard i mod workers, as its (i div workers)th game.
    played.games = seeds.map((seed, index) => {
      const game = results[index % workers]?.games[Math.floor(index / workers)];
      if (game?.seed !== seed) throw new Error(`A play shard returned no record for ${seed}`);
      return game;
    });
    return sweepOf(seeds, played, deps, options, { workers, started, gamesMs, now });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Totals ───────────────────────────────────────────────────────────────────────────────────

/** Sums of each counter across the sweep's games. */
export interface SweepTotals {
  games: number;
  questsTaken: ByController;
  questsResolved: Record<ControllerKind, Record<QuestBand, number>>;
  heroesInjured: ByController;
  heroesDied: ByController;
  heroesRecruited: ByController;
  heroesRetired: ByController;
  rivalFolds: Record<string, number>;
  /** Games by how they ended; `survived` for a game that ran its full length. */
  endings: Record<string, number>;
  /** Years each game lasted: to its ending, or its full length. */
  yearsSurvived: Summary;
  /** Games whose ending fell in each year, 0 first, up to the sweep's length. */
  endedInYear: number[];
  refusals: number;
  invalidGames: number;
  // M3's counters (DL-40).
  /** Guild-years in play, Levels gained and declines, by controller and year, summed over the games. */
  guildYears: ByYear;
  levelsGained: ByYear;
  declines: ByYear;
  /** `hero.retired` by controller and age. */
  retirementAges: Record<ControllerKind, Record<string, number>>;
  growthAgainstDecline: Record<ControllerKind, GrowthAgainstDecline>;
  /** The games that reached year `countedYear`, and their Improvement grades summed. */
  gamesAtCountedYear: number;
  improvementGrades: Record<ControllerKind, GradeCounts>;
  fameGate: Record<ControllerKind, FameGate>;
  /** `signing-refused` among the policy's refused actions: it asks only Heroes who would sign. */
  signingRefused: number;
  /** The Rosters as each year begins, summed over the games in play then, and how many were. */
  rosters: ({ games: number } & Record<ControllerKind, RosterCensus>)[];
  // M4's counters (DL-55).
  encounters: Record<ControllerKind, EncounterCounts>;
  synergies: Record<ControllerKind, SynergyTally>;
  injuriesByType: Record<ControllerKind, Record<string, number>>;
  /** Patron-years in each year played in full, and the silent ones, summed over the games that played it. */
  patronYears: number[];
  silentPatronYears: number[];
  /** The player's Guild's Regard after `countedYear` years, summed over the games in play then, and how many were. */
  regardAtCountedYear: { games: number } & RegardSnapshot;
  // M5's counters (DL-62).
  wealth: Record<ControllerKind, WealthFlows>;
  loot: Record<ControllerKind, Record<string, LootTally>>;
  consumables: Record<ControllerKind, ConsumableTally>;
  gear: Record<ControllerKind, GearTally>;
  /** The player's Quests by difficulty band and by year, summed over the games that recorded them. */
  playerQuestsByDifficulty: DifficultyTally[];
  playerQuestsByYear: DifficultyTally[];
}

const zero = (): ByController => ({ player: 0, rival: 0 });

/** Adds each of `from` to the same index of `into`, lengthening `into` with zeros to reach it. */
function addSeries(into: number[], from: readonly number[]): void {
  from.forEach((n, index) => {
    while (into.length <= index) into.push(0);
    into[index] = (into[index] ?? 0) + n;
  });
}

/** Adds each numeric field of `from` to `into`'s. */
function addFields<T extends object>(into: T, from: T): void {
  const target = into as Record<string, number>;
  for (const [key, n] of Object.entries(from as Record<string, number>)) target[key] = (target[key] ?? 0) + n;
}

const noGrowth = (): GrowthAgainstDecline => ({
  guilds: 0,
  guildYearsBefore: 0,
  levelsBefore: 0,
  guildYearsAfter: 0,
  levelsAfter: 0,
  pointsGrownAfter: 0,
  pointsDeclinedAfter: 0,
});
const noGrades = (): GradeCounts => Object.fromEntries(facilityKeys.map((facility) => [facility, []])) as unknown as GradeCounts;
const noCensus = (): RosterCensus => ({ guilds: 0, wealth: 0, heroes: 0, levels: 0, atPotential: 0 });
const noEncounters = (): EncounterCounts =>
  Object.fromEntries(encounterKinds.map((kind) => [kind, { success: 0, failure: 0, injured: 0, died: 0 }])) as EncounterCounts;
const noSynergies = (): SynergyTally => ({ quests: 0, withAny: 0, applied: 0, byKey: {} });

/** Adds one game's Wealth flows to the sweep's. */
function addWealth(into: WealthFlows, from: WealthFlows): void {
  const { sales, itemsSold, ...flat } = from;
  addFields(into, flat as WealthFlows);
  addFields(into.sales, sales);
  addFields(into.itemsSold, itemsSold);
}

/** Adds one game's consumables to the sweep's. */
function addConsumables(into: ConsumableTally, from: ConsumableTally): void {
  const { byEffect, byDefinition, ...flat } = from;
  addFields(into, flat as ConsumableTally);
  addFields(into.byEffect, byEffect);
  addFields(into.byDefinition, byDefinition);
}

/** Adds each tally of `from` to the same index of `into`, lengthening `into` to reach it. */
function addTallies(into: DifficultyTally[], from: readonly DifficultyTally[] | null): void {
  (from ?? []).forEach((tally, index) => {
    while (into.length <= index) into.push(noDifficulty());
    addFields(into[index] as DifficultyTally, tally);
  });
}

export function sweepTotals(sweep: PlaySweep, turnsPerYear: number): SweepTotals {
  const totals: SweepTotals = {
    games: sweep.games.length,
    questsTaken: zero(),
    questsResolved: { player: { fail: 0, success: 0, strong: 0 }, rival: { fail: 0, success: 0, strong: 0 } },
    heroesInjured: zero(),
    heroesDied: zero(),
    heroesRecruited: zero(),
    heroesRetired: zero(),
    rivalFolds: Object.fromEntries(endingReasons.map((reason) => [reason, 0])),
    endings: { ...Object.fromEntries(endingReasons.map((reason) => [reason, 0])), survived: 0 },
    yearsSurvived: summarise(sweep.games.map((game) => game.counters.lastTurn / turnsPerYear)),
    endedInYear: Array.from({ length: Math.max(1, Math.ceil(sweep.years)) }, () => 0),
    refusals: 0,
    invalidGames: 0,
    guildYears: { player: [], rival: [] },
    levelsGained: { player: [], rival: [] },
    declines: { player: [], rival: [] },
    retirementAges: { player: {}, rival: {} },
    growthAgainstDecline: { player: noGrowth(), rival: noGrowth() },
    gamesAtCountedYear: 0,
    improvementGrades: { player: noGrades(), rival: noGrades() },
    fameGate: { player: { heroDays: 0, guildDays: 0, guildDaysWithAny: 0 }, rival: { heroDays: 0, guildDays: 0, guildDaysWithAny: 0 } },
    signingRefused: 0,
    rosters: [],
    encounters: { player: noEncounters(), rival: noEncounters() },
    synergies: { player: noSynergies(), rival: noSynergies() },
    injuriesByType: { player: {}, rival: {} },
    patronYears: [],
    silentPatronYears: [],
    regardAtCountedYear: { games: 0, relationships: noBands(), guildmasterForPatrons: noBands(), guildmasterForHeroes: noBands() },
    wealth: { player: noWealth(), rival: noWealth() },
    loot: { player: {}, rival: {} },
    consumables: { player: noConsumables(), rival: noConsumables() },
    gear: { player: noGear(), rival: noGear() },
    playerQuestsByDifficulty: [],
    playerQuestsByYear: [],
  };
  for (const { counters, observations, refusals, invalid } of sweep.games) {
    addTallies(totals.playerQuestsByDifficulty, counters.playerQuestsByDifficulty);
    addTallies(totals.playerQuestsByYear, counters.playerQuestsByYear);
    for (const kind of controllerKinds) {
      addWealth(totals.wealth[kind], counters.wealth[kind]);
      for (const [table, tally] of Object.entries(counters.loot[kind])) {
        addFields((totals.loot[kind][table] ??= { awards: 0, items: 0, unique: 0 }), tally);
      }
      addConsumables(totals.consumables[kind], counters.consumables[kind]);
      const { returned, ...moves } = counters.gear[kind];
      addFields(totals.gear[kind], moves as GearTally);
      addFields(totals.gear[kind].returned, returned);
      totals.questsTaken[kind] += counters.questsTaken[kind];
      totals.heroesInjured[kind] += counters.heroesInjured[kind];
      totals.heroesDied[kind] += counters.heroesDied[kind];
      totals.heroesRecruited[kind] += counters.heroesRecruited[kind];
      totals.heroesRetired[kind] += counters.heroesRetired[kind];
      for (const [band, n] of Object.entries(counters.questsResolved[kind])) {
        totals.questsResolved[kind][band as QuestBand] += n;
      }
      addSeries(totals.guildYears[kind], counters.guildYears[kind]);
      addSeries(totals.levelsGained[kind], counters.levelsGained[kind]);
      addSeries(totals.declines[kind], counters.declines[kind]);
      addFields(totals.retirementAges[kind], counters.retirementAges[kind]);
      addFields(totals.growthAgainstDecline[kind], counters.growthAgainstDecline[kind]);
      addFields(totals.fameGate[kind], observations.fameGate[kind]);
      for (const facility of facilityKeys) {
        const grades = counters.improvementGrades?.[kind][facility];
        if (grades !== undefined) addSeries(totals.improvementGrades[kind][facility], grades);
      }
      for (const encounterKind of encounterKinds) addFields(totals.encounters[kind][encounterKind], counters.encounters[kind][encounterKind]);
      const synergies = totals.synergies[kind];
      synergies.quests += counters.synergies[kind].quests;
      synergies.withAny += counters.synergies[kind].withAny;
      synergies.applied += counters.synergies[kind].applied;
      addFields(synergies.byKey, counters.synergies[kind].byKey);
      addFields(totals.injuriesByType[kind], counters.injuriesByType[kind]);
    }
    addSeries(totals.patronYears, counters.patronYears);
    addSeries(totals.silentPatronYears, counters.silentPatronYears);
    const regard = observations.regardAtCountedYear;
    if (regard !== null) {
      totals.regardAtCountedYear.games += 1;
      addFields(totals.regardAtCountedYear.relationships, regard.relationships);
      addFields(totals.regardAtCountedYear.guildmasterForPatrons, regard.guildmasterForPatrons);
      addFields(totals.regardAtCountedYear.guildmasterForHeroes, regard.guildmasterForHeroes);
    }
    if (counters.improvementGrades !== null) totals.gamesAtCountedYear += 1;
    observations.rosters.forEach((census, year) => {
      totals.rosters[year] ??= { games: 0, player: noCensus(), rival: noCensus() };
      const sum = totals.rosters[year];
      sum.games += 1;
      for (const kind of controllerKinds) addFields(sum[kind], census[kind]);
    });
    totals.signingRefused += refusals.filter(({ rejection }) => rejection.reason === 'signing-refused').length;
    for (const [reason, n] of Object.entries(counters.rivalFolds)) totals.rivalFolds[reason] = (totals.rivalFolds[reason] ?? 0) + n;
    const ending = counters.ending ?? 'survived';
    totals.endings[ending] = (totals.endings[ending] ?? 0) + 1;
    if (counters.ending !== null) {
      const year = Math.min(Math.floor(counters.lastTurn / turnsPerYear), totals.endedInYear.length - 1);
      totals.endedInYear[year] = (totals.endedInYear[year] ?? 0) + 1;
    }
    totals.refusals += refusals.length;
    if (invalid !== null) totals.invalidGames += 1;
  }
  return totals;
}

// ── The report ───────────────────────────────────────────────────────────────────────────────

export interface PlayReportContext {
  deps: EngineDeps;
  machine: Machine;
  startedAt: Date;
  /** The milestone whose run this is, as its report is named: `m3`. */
  milestone: string;
}

/** data-model §7's targets, provisional, to set the measures against (DL-08). */
const targets = {
  advanceMs: 5,
  yearMs: 1000,
  saveBytes: 20 * 1024 * 1024,
  loadMs: 1000,
  harnessMinutesPerThousand: 10,
};

const listed = 20;

const kindLabel = (kind: ControllerKind): string => (kind === 'player' ? "The player's Guild" : 'The Rivals');

const rosterOf = (kind: ControllerKind): string => (kind === 'player' ? "the player's Guild" : 'the Rivals');

/** `n / of` to `digits` places, a dash when `of` is 0. */
const ratio = (n: number, of: number, digits = 2): string => (of === 0 ? '—' : fixed(n / of, digits));

/** `n` as a share of `of`, a dash when `of` is 0. */
const percent = (n: number, of: number): string => (of === 0 ? '—' : `${fixed((100 * n) / of, 1)}%`);

const sum = (values: readonly number[]): number => values.reduce((total, n) => total + n, 0);

/** The top grade content gives any facility: the report's grade columns run from 0 to it. */
function topGrade(deps: EngineDeps): number {
  return Object.values(deps.content.improvements).reduce((top, row) => Math.max(top, row.grade), 0);
}

/**
 * M3's counters (the epic's §2, DL-40): Levels and declines per Guild-year, the Rosters as each year
 * begins, growth against decline, Retirements by age, signings refused by Fame, and the
 * Improvement grades reached by year 10.
 */
function progressionSection(totals: SweepTotals, deps: EngineDeps): string[] {
  const perGuildYear = (kind: ControllerKind, series: ByYear): string =>
    `${whole(sum(series[kind]))} (${ratio(sum(series[kind]), sum(totals.guildYears[kind]))})`;
  const years = Math.max(0, ...controllerKinds.map((kind) => totals.guildYears[kind].length));
  const byYearRows = Array.from({ length: years }, (_, year) => [
    whole(year),
    ...controllerKinds.flatMap((kind) => {
      const guildYears = totals.guildYears[kind][year] ?? 0;
      return [
        fixed(guildYears, 1),
        ratio(totals.levelsGained[kind][year] ?? 0, guildYears),
        ratio(totals.declines[kind][year] ?? 0, guildYears),
      ];
    }),
  ]);

  const censusCells = (census: RosterCensus): string[] => [
    ratio(census.wealth, census.guilds, 0),
    ratio(census.heroes, census.guilds, 1),
    ratio(census.levels, census.heroes),
    `${whole(census.atPotential)} (${percent(census.atPotential, census.heroes)})`,
  ];
  const rosterRows = totals.rosters.map((census, year) => [
    whole(year),
    whole(census.games),
    ...controllerKinds.flatMap((kind) => censusCells(census[kind])),
  ]);
  const atCounted = totals.rosters[countedYear];
  const rosterName = (kind: ControllerKind): string => (kind === 'player' ? "the player's Roster" : "the Rivals' Rosters");
  const potentialLine =
    atCounted === undefined
      ? `No game was in play after ${countedYear} years.`
      : `Heroes with a Stat at Potential after ${countedYear} years, over the ${whole(atCounted.games)} games in play then: ` +
        controllerKinds
          .map((kind) => {
            const census = atCounted[kind];
            return `${rosterName(kind)} ${whole(census.atPotential)} of ${whole(census.heroes)} (${percent(census.atPotential, census.heroes)})`;
          })
          .join('; ') +
        '.';

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

  const grades = Array.from({ length: topGrade(deps) + 1 }, (_, grade) => grade);
  const gradeRows = controllerKinds.flatMap((kind) =>
    facilityKeys.map((facility: FacilityKey) => {
      const counts = totals.improvementGrades[kind][facility];
      const guilds = sum(counts);
      const graded = counts.reduce((total, n, grade) => total + n * grade, 0);
      return [
        `${kindLabel(kind)}: ${facility}`,
        whole(guilds),
        ratio(graded, guilds),
        ...grades.map((grade) => whole(counts[grade] ?? 0)),
      ];
    }),
  );

  return [
    '## Progression, Fame and the Hall (M3)',
    '',
    'A Guild is in play from the Turn it was founded until it folds or the game stops; a Guild-year is a ' +
      'year of one Guild in play. Entries count for the Guild they name.',
    '',
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
    'In each year (year 0 is the first):',
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
    'The Guilds in play and their Rosters as each year begins, before the policy acts (0 is the new world), over ' +
      'the games in play then; a Hero is at Potential when any Stat has reached its Potential, where growth stops:',
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
    ...(ageRows.length === 0
      ? ['Retirements by age: no Hero retired.']
      : ['Retirements by age (`hero.retired`):', '', markdownTable(['Age', "Player's", "Rivals'"], ageRows, ['left', 'right', 'right'])]),
    '',
    'Signings refused by Fame (M3-S5, DL-38 item 9): each morning before the policy acts, the pool Heroes who would ' +
      'refuse each Guild in play (`unsignableHeroes`), whether or not the Guild asks:',
    '',
    markdownTable(
      ['Signings refused by Fame', 'Hero-Days refused', 'Guild-Days', 'Refused a Guild-Day', 'Guild-Days with one or more'],
      fameRows,
      ['left', 'right', 'right', 'right', 'right'],
    ),
    '',
    `\`signing-refused\` rejections returned to the automatic policy: ${whole(totals.signingRefused)}. A Rival's refused ` +
      "choice is dropped inside the afternoon's phase (DL-30), out of the harness's sight; `steady` asks only Heroes " +
      'who would sign (DL-38 item 5).',
    '',
    `Improvement grades reached by year ${countedYear} (M3-S6, DL-38 item 15), over the ${whole(totals.gamesAtCountedYear)} ` +
      'games that reached it: the Guilds founded before it, replacement Rivals included, by the highest grade each ' +
      'facility reached before it:',
    '',
    markdownTable(
      ['Controller: facility', 'Guilds', 'Mean grade', ...grades.map((grade) => `Grade ${grade}`)],
      gradeRows,
      ['left', 'right', 'right', ...grades.map(() => 'right' as const)],
    ),
    '',
  ];
}

/** Keys a table lists: content's, in key order, then any other a count names. */
function keysOf(known: readonly string[], ...counts: readonly Record<string, unknown>[]): string[] {
  const extra = counts.flatMap((count) => Object.keys(count)).filter((key) => !known.includes(key));
  return [...new Set([...[...known].sort(compareByCodeUnit), ...extra.sort(compareByCodeUnit)])];
}

type EncounterTally = EncounterCounts[keyof EncounterCounts];

/**
 * M4's counters (the epic's §2, DL-55): the Encounters' outcomes by kind, the Synergies applied a
 * Quest, Injuries by type, the Patrons silent in a year, and the player's Guild's Regard by band
 * after 10 years.
 */
function questEngineSection(totals: SweepTotals, deps: EngineDeps): string[] {
  const kindTotal = (kind: ControllerKind): EncounterTally => {
    const all: EncounterTally = { success: 0, failure: 0, injured: 0, died: 0 };
    for (const encounterKind of encounterKinds) addFields(all, totals.encounters[kind][encounterKind]);
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

  const patronYears = sum(totals.patronYears);
  const silent = sum(totals.silentPatronYears);
  const silentRows = totals.patronYears.map((n, year) => [
    whole(year),
    whole(n),
    `${whole(totals.silentPatronYears[year] ?? 0)} (${percent(totals.silentPatronYears[year] ?? 0, n)})`,
  ]);

  const regard = totals.regardAtCountedYear;
  const bandCells = (counts: Record<RegardBand, number>): string[] => {
    const all = sum(Object.values(counts));
    return [whole(all), ...regardBandNames.map((band) => `${whole(counts[band])} (${percent(counts[band], all)})`)];
  };
  const regardLines =
    regard.games === 0
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
        ];

  return [
    '## The Quest Engine (M4)',
    '',
    'Encounter outcomes by kind (`quest.encounter`), by the Guild that sent the Party, with the Heroes its ' +
      'consequences injured and killed a Check:',
    '',
    markdownTable(
      ['Controller: kind', 'Checks', 'Succeeded', 'Failed', 'Injured a Check', 'Killed a Check'],
      encounterRows,
      ['left', 'right', 'right', 'right', 'right', 'right'],
    ),
    '',
    "Synergies applied per Quest (`quest.resolved`'s `synergyKeys`; a Quest names each Synergy once):",
    '',
    markdownTable(['Synergies', 'Quests resolved', 'With one or more', 'Synergies a Quest'], synergyRows, ['left', 'right', 'right', 'right']),
    '',
    markdownTable(['Quests applying it', "Player's", "Rivals'"], byKeyRows, ['left', 'right', 'right']),
    '',
    'Injuries by type (`hero.injured`), by the Guild the Hero was on:',
    '',
    markdownTable(['Injury type', "Player's", "Rivals'"], injuryRows, ['left', 'right', 'right']),
    '',
    'Patrons silent: in each year played in full, the Patrons in the world as it began that offered no Quest in it ' +
      `(no \`quest.offered\` naming them): ${whole(silent)} of ${whole(patronYears)} Patron-years (${percent(silent, patronYears)}).`,
    '',
    ...(silentRows.length === 0
      ? ['No year was played in full.']
      : [markdownTable(['Year', 'Patron-years', 'Silent'], silentRows, ['right', 'right', 'right'])]),
    '',
    ...regardLines,
    '',
  ];
}

/**
 * M5's counters (the epic's §2, DL-62): Wealth spent by category and taken from Quests and the
 * Market, Loot by table beside the player's Quest difficulty, consumables carried and expended a
 * Quest, and gear moved.
 */
function itemsSection(totals: SweepTotals, deps: EngineDeps): string[] {
  const guildYears = (kind: ControllerKind): number => sum(totals.guildYears[kind]);
  const perYear = (kind: ControllerKind, n: number): string[] => [whole(n), ratio(n, guildYears(kind), 1)];
  const flowRow = (label: string, read: (flows: WealthFlows) => number): string[] => [
    label,
    ...controllerKinds.flatMap((kind) => perYear(kind, read(totals.wealth[kind]))),
  ];
  const spent = (flows: WealthFlows): number => flows.signing + flows.items + flows.improvements + flows.upkeep;
  const taken = (flows: WealthFlows): number => flows.questRewards + sum(saleCauses.map((cause) => flows.sales[cause]));
  const shareRow = controllerKinds.flatMap((kind) => {
    const flows = totals.wealth[kind];
    const all = spent(flows);
    return [
      `${kindLabel(kind)}: signing ${percent(flows.signing, all)}, Items ${percent(flows.items, all)}, ` +
        `Improvements ${percent(flows.improvements, all)}, Upkeep ${percent(flows.upkeep, all)}`,
    ];
  });

  const tables = keysOf(Object.keys(deps.content.lootTables), totals.loot.player, totals.loot.rival);
  const lootAll = (kind: ControllerKind): LootTally => {
    const all: LootTally = { awards: 0, items: 0, unique: 0 };
    for (const tally of Object.values(totals.loot[kind])) addFields(all, tally);
    return all;
  };
  const lootCells = (kind: ControllerKind, tally: LootTally | undefined): string[] => {
    const { awards, items, unique } = tally ?? { awards: 0, items: 0, unique: 0 };
    return [whole(awards), ratio(awards, guildYears(kind), 1), whole(items), whole(unique)];
  };
  const lootRows = [
    ...tables.map((table) => [`\`${table}\``, ...controllerKinds.flatMap((kind) => lootCells(kind, totals.loot[kind][table]))]),
    ['Every table', ...controllerKinds.flatMap((kind) => lootCells(kind, lootAll(kind)))],
  ];
  const resolvedBy = (kind: ControllerKind): number => totals.consumables[kind].quests;
  const lootPerQuest = controllerKinds
    .map((kind) => `${rosterOf(kind)} ${ratio(lootAll(kind).awards, resolvedBy(kind), 3)} an award a Quest resolved`)
    .join('; ');

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
  const yearRows = totals.playerQuestsByYear.map((tally, year) => [whole(year), ...difficultyCells(tally)]);
  const allDifficulty = noDifficulty();
  for (const tally of totals.playerQuestsByDifficulty) addFields(allDifficulty, tally);
  const difficultyHeader = ['Quests resolved', 'Mean difficulty', 'Strong', 'Loot awards', 'Loot a Quest', 'Unique'];
  const difficultyLines =
    allDifficulty.quests === 0
      ? ["No player's Quest with a recorded difficulty was resolved."]
      : [
          `The player's Quests by the difficulty the policy saw as it dispatched (no entry records it), ` +
            `${whole(allDifficulty.quests)} resolved, mean difficulty ${ratio(allDifficulty.difficulty, allDifficulty.quests, 1)}, ` +
            `${whole(allDifficulty.loot)} Loot awards (${ratio(allDifficulty.loot, allDifficulty.quests, 3)} a Quest). ` +
            `By the Quest's difficulty (M5-S5's third box):`,
          '',
          markdownTable(['Difficulty', ...difficultyHeader], bandRows, ['left', ...difficultyHeader.map(() => 'right' as const)]),
          '',
          'By the year resolved in (year 0 is the first):',
          '',
          markdownTable(['Year', ...difficultyHeader], yearRows, ['right', ...difficultyHeader.map(() => 'right' as const)]),
        ];

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
  const definitionRows = definitions.map((key) => [
    `\`${key}\``,
    ...controllerKinds.map((kind) => whole(totals.consumables[kind].byDefinition[key] ?? 0)),
  ]);

  const gearRows = controllerKinds.map((kind) => {
    const tally = totals.gear[kind];
    return [
      kindLabel(kind),
      ...perYear(kind, tally.equipped),
      whole(tally.unequipped),
      ...gearReturnCauses.map((cause) => whole(tally.returned[cause])),
    ];
  });

  const kindHeaders = controllerKinds.flatMap((kind) => [kind === 'player' ? "Player's" : "Rivals'", 'a Guild-year']);
  return [
    '## Items (M5)',
    '',
    'Wealth spent by category and taken, by the Guild each entry names; a Guild-year as in M3\'s table. Transfers ' +
      'have no event until M6, so none is counted.',
    '',
    markdownTable(
      ['Wealth', ...kindHeaders],
      [
        flowRow('Spent: signing fees (`hero.recruited` `fee`)', (flows) => flows.signing),
        ['Spent: Transfers', ...controllerKinds.flatMap(() => ['none until M6', '—'])],
        flowRow('Spent: Items (`item.bought` `cost`)', (flows) => flows.items),
        flowRow('Spent: Improvements (`guild.improved` `cost`)', (flows) => flows.improvements),
        flowRow('Spent: Upkeep (`guild.upkeep-paid` `amount`)', (flows) => flows.upkeep),
        flowRow('Spent in all', spent),
        flowRow('Taken: Quest rewards (`quest.resolved` `wealthDelta`)', (flows) => flows.questRewards),
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
    ...difficultyLines,
    '',
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
    'Gear moved (`item.equipped`, `item.unequipped`, and `item.returned` by its `cause`):',
    '',
    markdownTable(
      ['Gear', 'Equipped', 'a Guild-year', 'Unequipped', ...gearReturnCauses.map((cause) => `Returned: ${cause}`)],
      gearRows,
      ['left', 'right', 'right', 'right', ...gearReturnCauses.map(() => 'right' as const)],
    ),
    '',
  ];
}

/** The sweep as a Markdown report. */
export function playReport(sweep: PlaySweep, { deps, machine, startedAt, milestone }: PlayReportContext): string {
  const { config, content } = deps;
  const totals = sweepTotals(sweep, config.turnsPerYear);
  const count = sweep.seeds.length;
  const range = count === 0 ? 'no seeds' : `\`${sweep.seeds[0]}\` to \`${sweep.seeds[count - 1]}\``;
  const ms = (value: number): string => fixed(value, 3);
  const perGame = (n: number): string => (totals.games === 0 ? '—' : fixed(n / totals.games, 2));
  const share = (n: number, of: number): string => (of === 0 ? '—' : `${fixed((100 * n) / of, 1)}%`);

  const yearsText = Number.isInteger(sweep.years) ? whole(sweep.years) : fixed(sweep.years, 2);
  const full = sweep.games.filter((game) => game.ranFullLength);
  const fullOrAll = full.length > 0 ? full : sweep.games;
  const entries = summarise(fullOrAll.map((game) => game.measures.historyEntries));
  const lengths = summarise(fullOrAll.map((game) => game.measures.serialisedLength));
  const saveMs = summarise(fullOrAll.map((game) => game.measures.serialiseMs));
  const loadMs = summarise(fullOrAll.map((game) => game.measures.deserialiseMs));
  const roundTrips = sweep.games.filter((game) => game.measures.roundTrips).length;
  const sizeBasis =
    full.length > 0
      ? `the ${whole(full.length)} games that ran the full ${yearsText} years`
      : `every game's last document (no game ran the full ${yearsText} years)`;
  // A player's fast forward runs alone, so the replay's own `advance`, where there is one.
  const alone = sweep.replay?.advance ?? sweep.advance;
  const yearMs = alone.mean * config.turnsPerYear;
  const load = sweep.workers === 1 ? '' : ` under ${sweep.workers} processes' load`;
  const aloneText =
    sweep.replay === null || sweep.workers === 1
      ? ''
      : `; mean ${ms(alone.mean)} ms, p99 ${ms(alone.p99)} ms alone (\`${sweep.replay.seed}\` replayed)`;
  const sizeOf = full.length > 0 ? `the ${whole(full.length)} games that ran 20 years` : 'last documents: no game ran 20 years';
  // What 1,000 games of 20 years would take at this run's cost per Turn played, all included.
  const turnsPlayed = sweep.games.reduce((sum, game) => sum + game.turnsPlayed, 0);
  const perThousandMinutes =
    turnsPlayed === 0 ? Number.NaN : ((sweep.gamesMs / turnsPlayed) * 20 * config.turnsPerYear * 1000) / 60_000;

  const resolvedRow = (kind: ControllerKind): string[] => {
    const bands = totals.questsResolved[kind];
    const all = bands.fail + bands.success + bands.strong;
    return [
      kind === 'player' ? "The player's Guild" : 'The Rivals',
      whole(totals.questsTaken[kind]),
      whole(all),
      `${whole(bands.fail)} (${share(bands.fail, all)})`,
      `${whole(bands.success)} (${share(bands.success, all)})`,
      `${whole(bands.strong)} (${share(bands.strong, all)})`,
    ];
  };
  const heroRow = (label: string, counts: ByController): string[] => [
    label,
    whole(counts.player),
    perGame(counts.player),
    whole(counts.rival),
    perGame(counts.rival),
  ];
  const summaryRow = (label: string, summary: Summary, digits = 2): string[] => [
    label,
    fixed(summary.mean, digits),
    fixed(summary.p50, digits),
    fixed(summary.p99, digits),
    fixed(summary.min, digits),
    fixed(summary.max, digits),
  ];
  const totalFolds = Object.values(totals.rivalFolds).reduce((sum, n) => sum + n, 0);

  const lines = [
    `# ${milestone.toUpperCase()} harness report: play`,
    '',
    `Run begun ${localTimestamp(startedAt)} · ${whole(count)} seeds, ${range} · up to ${yearsText} years ` +
      `(${whole(sweep.years * config.turnsPerYear)} Turns) each · content \`${content.id}\` version ${content.version} · ` +
      `config version ${config.configVersion}, schema version ${config.schemaVersion} · ` +
      `\`createdAt: "${harnessSetup.createdAt}"\` · validated after every advance: ${sweep.validated ? 'yes' : 'no'}`,
    '',
    `Policy (INPUTS 4.14): first the gear it holds onto Heroes with the slot empty (M5-S2); the highest-reward ` +
      `Quest it can staff, the strongest Party of the size it requires, carrying one of each consumable held that ` +
      `serves the Quest (DL-62); one purchase a Turn: the infirmary's next grade while Wealth exceeds ` +
      `${sweep.policy.buildWealthMultiple} times its cost (M3-S6), else one armour while a Hero has none and Wealth ` +
      `exceeds ${sweep.policy.buyWealthMultiple} times its price (M5-S4), else the cheapest Hero who would sign while ` +
      `Wealth exceeds ${sweep.policy.recruitWealthMultiple} Upkeeps and the Roster is below ${sweep.policy.rosterLimit}, ` +
      `else consumables toward ${sweep.policy.consumableStock} of each while Wealth exceeds ` +
      `${sweep.policy.buyWealthMultiple} times their cost and, once paid, ${sweep.policy.consumableReserveUpkeeps} ` +
      `Upkeeps (DL-62); never sell; never transfer.`,
    '',
    `Machine: Node ${machine.node} · ${machine.os} ${machine.arch} · ${machine.cpu} (${machine.cores} logical cores) · ` +
      `games shared among ${sweep.workers} ${sweep.workers === 1 ? 'process' : 'processes'}`,
    '',
    '## Summary',
    '',
    markdownTable(
      ['Measure', 'Result'],
      [
        ['Games played', whole(count)],
        [
          'Games ended',
          endingReasons.map((reason) => `${reason} ${whole(totals.endings[reason] ?? 0)}`).join(', ') +
            `; ran the full ${yearsText} years ${whole(totals.endings.survived ?? 0)}`,
        ],
        [
          'Years survived',
          `mean ${fixed(totals.yearsSurvived.mean)}, min ${fixed(totals.yearsSurvived.min)}, ` +
            `max ${fixed(totals.yearsSurvived.max)} (a game that ran its full length counts its length)`,
        ],
        ['Rival folds', `${whole(totalFolds)}, ${perGame(totalFolds)} a game`],
        ['Policy actions the rules refused', whole(totals.refusals)],
        ['Games the validator refused', sweep.validated ? whole(totals.invalidGames) : 'not validated'],
        [
          'Byte equality, one seed played twice',
          sweep.replay === null
            ? '—'
            : `\`${sweep.replay.seed}\`: ${sweep.replay.identical ? 'identical' : 'DIFFERENT'} (${whole(sweep.replay.length)} characters)`,
        ],
        ['Saves that load and serialise back identically', `${whole(roundTrips)} of ${whole(count)}`],
        ['`advance` per Turn', `mean ${ms(sweep.advance.mean)} ms, p99 ${ms(sweep.advance.p99)} ms`],
        ['Total run time', `${fixed(sweep.totalMs / 1000, 1)} s, the games ${fixed(sweep.gamesMs / 1000, 1)} s of it`],
      ],
    ),
    '',
    '## Counters',
    '',
    'Read from each game\'s History through `history.byType`; an entry counts for the Guild it names.',
    '',
    markdownTable(
      ['Quests', 'Taken', 'Resolved', 'Failed', 'Succeeded', 'Strong success'],
      [resolvedRow('player'), resolvedRow('rival')],
      ['left', 'right', 'right', 'right', 'right', 'right'],
    ),
    '',
    markdownTable(
      ['Heroes', "Player's", 'a game', "Rivals'", 'a game'],
      [
        heroRow('`hero.injured`', totals.heroesInjured),
        heroRow('`hero.died`', totals.heroesDied),
        heroRow('`hero.recruited`', totals.heroesRecruited),
        heroRow('`hero.retired`', totals.heroesRetired),
      ],
      ['left', 'right', 'right', 'right', 'right'],
    ),
    '',
    markdownTable(
      ['Ending', '`game.ended` (the player)', '`guild.folded` (Rivals)'],
      endingReasons.map((reason) => [reason, whole(totals.endings[reason] ?? 0), whole(totals.rivalFolds[reason] ?? 0)]),
      ['left', 'right', 'right'],
    ),
    '',
    `Games ending in each year (year 0 is the first): ${totals.endedInYear.map((n, year) => `${year}: ${n}`).join(', ')}.`,
    '',
    ...progressionSection(totals, deps),
    ...questEngineSection(totals, deps),
    ...itemsSection(totals, deps),
    '## Measures',
    '',
    markdownTable(
      ['Per Turn, ms', 'Mean', 'p50', 'p99', 'Min', 'Max'],
      [
        summaryRow('`advance`', sweep.advance, 3),
        ...(sweep.replay === null ? [] : [summaryRow(`\`advance\`, \`${sweep.replay.seed}\` replayed alone`, sweep.replay.advance, 3)]),
        ...(sweep.validated ? [summaryRow('`validate` after it', sweep.validation, 3)] : []),
      ],
      ['left', 'right', 'right', 'right', 'right', 'right'],
    ),
    '',
    `The last document, over ${sizeBasis}:`,
    '',
    markdownTable(
      ['Per game', 'Mean', 'p50', 'p99', 'Min', 'Max'],
      [
        summaryRow('`history.entries.length`', entries, 0),
        summaryRow('`serialise(document).length`', lengths, 0),
        summaryRow('`serialise`, ms', saveMs, 1),
        summaryRow('`deserialise` (parse, migrate, validate), ms', loadMs, 1),
      ],
      ['left', 'right', 'right', 'right', 'right', 'right'],
    ),
    '',
    "Against data-model §7's provisional targets (recorded, not chased: DL-08):",
    '',
    markdownTable(
      ['Measure', 'Target', 'Measured'],
      [
        [
          'Advance one Turn',
          `under ${targets.advanceMs} ms`,
          `mean ${ms(sweep.advance.mean)} ms, p99 ${ms(sweep.advance.p99)} ms${load}${aloneText}`,
        ],
        [
          'Fast forward a year',
          `under ${targets.yearMs / 1000} s`,
          `${fixed(yearMs, 0)} ms (mean \`advance\`${sweep.replay === null ? '' : ' alone'} × ${whole(config.turnsPerYear)} Turns)`,
        ],
        [
          'Harness: 1,000 games of 20 years',
          `under ${targets.harnessMinutesPerThousand} min`,
          `${fixed(perThousandMinutes, 0)} min (this run's wall-clock time per Turn played in ${sweep.workers} ` +
            `${sweep.workers === 1 ? 'process' : 'processes'}, ${sweep.validated ? 'validation' : 'no validation'} ` +
            `included, × ${whole(20 * config.turnsPerYear)} Turns × 1,000 games)`,
        ],
        [
          'Save after 20 years',
          'under 20 MiB',
          `mean ${fixed(lengths.mean / 1024 / 1024, 2)} MiB, max ${fixed(lengths.max / 1024 / 1024, 2)} MiB (${sizeOf})`,
        ],
        ['Load a save', `under ${targets.loadMs / 1000} s`, `mean ${fixed(loadMs.mean, 0)} ms, max ${fixed(loadMs.max, 0)} ms${load} (${sizeOf})`],
      ],
    ),
    '',
  ];

  const refused = sweep.games.flatMap((game) => game.refusals.map((refusal) => ({ seed: game.seed, ...refusal })));
  if (refused.length > 0) {
    lines.push(
      '## Refused policy actions',
      '',
      markdownTable(
        ['Seed', 'Turn', 'Action', 'Rejection'],
        refused
          .slice(0, listed)
          .map(({ seed, turn, action, rejection }) => [`\`${seed}\``, whole(turn), action.kind, rejection.reason]),
      ),
      '',
    );
  }
  const invalid = sweep.games.filter((game) => game.invalid !== null);
  if (invalid.length > 0) {
    lines.push(
      '## Validator refusals',
      '',
      markdownTable(
        ['Seed', 'Turn', 'Check', 'Id'],
        invalid
          .flatMap(({ seed, invalid: found }) => {
            if (found === null) return [];
            const { turn, result } = found;
            const named = result.ok ? result.warnings : result.failures;
            return named.map(({ check, id }) => [`\`${seed}\``, whole(turn), check, `\`${id}\``]);
          })
          .slice(0, listed),
      ),
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}
