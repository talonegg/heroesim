// The play sweep across seeds (M2-S12): play each seed under the automatic policy, keep only its
// record (counters and measures, never the document), and replay one seed to check that the same
// seed under the same policy serialises byte for byte alike. `sweepPlay` plays in this
// process; `sweepPlayInParallel` shares the seeds among child processes (`shard.ts`), since a
// 20-year game takes most of a minute. `playReport` writes the result as Markdown. DL-34 records
// the method and the numbers.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  noDisposition,
  noGear,
  noOffers,
  noPurchases,
  noTransfers,
  noWealth,
  offerEndCauses,
  playerSide,
  rivalTransferWays,
  saleCauses,
  transferDirections,
  type ByController,
  type ByYear,
  type ConsumableTally,
  type ControllerKind,
  type DifficultyTally,
  type DispositionTally,
  type EncounterCounts,
  type FameGate,
  type GearTally,
  type GradeCounts,
  type GrowthAgainstDecline,
  type LootTally,
  type MarketTally,
  type OfferTally,
  type RegardSnapshot,
  type RivalTransferWay,
  type RosterCensus,
  type SynergyTally,
  type TransferDirection,
  type TransferTally,
  type WealthFlows,
} from './counters.js';
import { harnessSetup } from './creation.js';
import { idsOf } from './modules.js';
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

/**
 * The sweep's fingerprint (M8-S1, DL-76): SHA-256, in hex, over one line per game, in seed order,
 * of its seed, a tab and its last save's fingerprint (`DocumentMeasures.fingerprint`). Two runs of
 * the same seeds give the same one only when every game's save is byte for byte equal, so it shows in
 * one line of a report whether a change moved any game at all.
 */
export function sweepFingerprint(games: readonly GameRecord[]): string {
  const lines = [...games]
    .sort((a, b) => compareByCodeUnit(a.seed, b.seed))
    .map((game) => `${game.seed}\t${game.measures.fingerprint}\n`);
  return createHash('sha256').update(lines.join('')).digest('hex');
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
 * loading the core content and playing under `deps.config` with `deps.modules`, installed by id
 * (M8-S3, DL-78); the records come back in seed order and the replay is played in this process once
 * they are done. The children load the core content themselves, so `deps.content` must be it: a
 * child that loads another refuses the sweep; and each module must be the harness's own of its id
 * (`idsOf`), which is checked before any child starts.
 *
 * @throws Error when a child fails or played with other content, or a module is not the harness's:
 * a broken run, not a finding
 */
export async function sweepPlayInParallel(
  seeds: readonly string[],
  deps: EngineDeps,
  options: SweepOptions & { workers?: number } = {},
): Promise<PlaySweep> {
  const now = options.now ?? (() => performance.now());
  const workers = Math.max(1, Math.min(options.workers ?? defaultWorkers(), seeds.length));
  const modules = idsOf(deps.modules);
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
        ...(modules.length === 0 ? {} : { modules }),
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
  /** `guildmaster.succeeded` across the games (M9-S2, DL-102). */
  rivalSuccessions: number;
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
  // M6's counters (DL-69).
  transfers: Record<TransferDirection, TransferTally>;
  rivalTransfers: Record<RivalTransferWay, TransferTally>;
  transfersBySide: Record<string, Record<string, TransferTally>>;
  transfersBack: number;
  offers: Record<string, Record<string, OfferTally>>;
  dispositions: Record<string, DispositionTally>;
  marketPurchases: Record<string, MarketTally>;
  /** The Improvement grades by Disposition, summed over the games that reached year `countedYear`. */
  improvementGradesByDisposition: Record<string, GradeCounts>;
  /** For each year, 0 the new world, each Disposition's Rivals in play as it began, over the games in play then. */
  rivalYearStarts: Record<string, RivalYearStarts>[];
  /** For each year, the player's Guild's places in the Rankings as it began, over the games in play then. */
  rankings: RankingTally[];
  /** Games a harness assertion stopped (DL-69). */
  assertionGames: number;
  // M8's counters (DL-78).
  /** Each module event type, by count; empty with no module installed. */
  moduleEvents: Record<string, number>;
  /** The core's events each module's effects made, by module and type; empty with no module installed. */
  moduleEffects: Record<string, Record<string, number>>;
  // M9-S1's counters (DL-101).
  /** `guild.below-floor` and `guild.floor-recovered`, by controller, summed over the games. */
  belowFloor: ByController;
  floorRecovered: ByController;
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

/** Adds one game's counts by side, then side again, to the sweep's, each made by `none` where the sweep has none. */
function addBySides<T extends object>(
  into: Record<string, Record<string, T>>,
  from: Readonly<Record<string, Readonly<Record<string, T>>>>,
  none: () => T,
  add: (into: T, from: T) => void,
): void {
  for (const [first, inner] of Object.entries(from)) {
    for (const [second, tally] of Object.entries(inner)) add(((into[first] ??= {})[second] ??= none()), tally);
  }
}

function addOffers(into: OfferTally, from: OfferTally): void {
  const { ended, ...flat } = from;
  addFields(into, flat as OfferTally);
  addFields(into.ended, ended);
}

function addDisposition(into: DispositionTally, from: DispositionTally): void {
  const { questsResolved, folds, ...flat } = from;
  addFields(into, flat as DispositionTally);
  addFields(into.questsResolved, questsResolved);
  addFields(into.folds, folds);
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
    rivalSuccessions: 0,
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
    transfers: Object.fromEntries(transferDirections.map((direction) => [direction, noTransfers()])) as Record<TransferDirection, TransferTally>,
    rivalTransfers: Object.fromEntries(rivalTransferWays.map((way) => [way, noTransfers()])) as Record<RivalTransferWay, TransferTally>,
    transfersBySide: {},
    transfersBack: 0,
    offers: {},
    dispositions: {},
    marketPurchases: {},
    improvementGradesByDisposition: {},
    rivalYearStarts: [],
    rankings: [],
    assertionGames: 0,
    moduleEvents: {},
    moduleEffects: {},
    belowFloor: zero(),
    floorRecovered: zero(),
  };
  for (const { counters, observations, refusals, invalid, assertion } of sweep.games) {
    addTallies(totals.playerQuestsByDifficulty, counters.playerQuestsByDifficulty);
    addTallies(totals.playerQuestsByYear, counters.playerQuestsByYear);
    for (const direction of transferDirections) addFields(totals.transfers[direction], counters.transfers[direction]);
    for (const way of rivalTransferWays) addFields(totals.rivalTransfers[way], counters.rivalTransfers[way]);
    addBySides(totals.transfersBySide, counters.transfersBySide, noTransfers, addFields);
    totals.transfersBack += counters.transfersBack;
    addBySides(totals.offers, counters.offers, noOffers, addOffers);
    for (const [disposition, tally] of Object.entries(counters.dispositions)) addDisposition((totals.dispositions[disposition] ??= noDisposition()), tally);
    for (const [side, tally] of Object.entries(counters.marketPurchases)) addFields((totals.marketPurchases[side] ??= noPurchases()), tally);
    for (const [disposition, grades] of Object.entries(counters.improvementGradesByDisposition ?? {})) {
      const into = (totals.improvementGradesByDisposition[disposition] ??= noGrades());
      for (const facility of facilityKeys) addSeries(into[facility], grades[facility]);
    }
    observations.rivals.forEach((rivals, year) => {
      const byDisposition = (totals.rivalYearStarts[year] ??= {});
      for (const { disposition, heroes, wealth } of rivals) {
        const starts = (byDisposition[disposition] ??= { heroes: [], wealth: [] });
        starts.heroes.push(heroes);
        starts.wealth.push(wealth);
      }
    });
    observations.rankings.forEach((ranking, year) => {
      if (ranking === null) return;
      const tally = (totals.rankings[year] ??= { games: 0, fame: [], wealth: [] });
      tally.games += 1;
      addSeries(tally.fame, Array.from({ length: ranking.fame }, (_, index) => (index === ranking.fame - 1 ? 1 : 0)));
      addSeries(tally.wealth, Array.from({ length: ranking.wealth }, (_, index) => (index === ranking.wealth - 1 ? 1 : 0)));
    });
    if (assertion !== null) totals.assertionGames += 1;
    addFields(totals.moduleEvents, counters.moduleEvents);
    for (const [moduleId, byType] of Object.entries(counters.moduleEffects)) addFields((totals.moduleEffects[moduleId] ??= {}), byType);
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
      totals.belowFloor[kind] += counters.belowFloor[kind];
      totals.floorRecovered[kind] += counters.floorRecovered[kind];
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
    totals.rivalSuccessions += counters.rivalSuccessions;
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
  const gradeRow = (label: string, counts: readonly number[]): string[] => {
    const guilds = sum(counts);
    const graded = counts.reduce((total, n, grade) => total + n * grade, 0);
    return [label, whole(guilds), ratio(graded, guilds), ...grades.map((grade) => whole(counts[grade] ?? 0))];
  };
  const gradeRows = [
    ...controllerKinds.flatMap((kind) =>
      facilityKeys.map((facility: FacilityKey) => gradeRow(`${kindLabel(kind)}: ${facility}`, totals.improvementGrades[kind][facility])),
    ),
    // M6's Dispositions (DL-69): the Rivals' rows again, by Disposition.
    ...dispositionKeys(totals, deps).flatMap((disposition) =>
      facilityKeys.map((facility: FacilityKey) =>
        gradeRow(`The Rivals, \`${disposition}\`: ${facility}`, totals.improvementGradesByDisposition[disposition]?.[facility] ?? []),
      ),
    ),
  ];

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
      "facility reached before it; the Rivals' rows again by Disposition (M6, DL-69):",
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

/** The Dispositions a table lists: content's, in key order, then any other a Rival of the sweep had. */
function dispositionKeys(totals: SweepTotals, deps: EngineDeps): string[] {
  return keysOf(Object.keys(deps.content.dispositions), totals.dispositions, totals.improvementGradesByDisposition, ...totals.rivalYearStarts);
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
  const spent = (flows: WealthFlows): number => flows.signing + flows.transferFeesPaid + flows.items + flows.improvements + flows.upkeep;
  const taken = (flows: WealthFlows): number =>
    flows.questRewards + flows.transferFeesTaken + sum(saleCauses.map((cause) => flows.sales[cause]));
  const shareRow = controllerKinds.flatMap((kind) => {
    const flows = totals.wealth[kind];
    const all = spent(flows);
    return [
      `${kindLabel(kind)}: signing ${percent(flows.signing, all)}, Transfers ${percent(flows.transferFeesPaid, all)}, ` +
        `Items ${percent(flows.items, all)}, Improvements ${percent(flows.improvements, all)}, Upkeep ${percent(flows.upkeep, all)}`,
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

/**
 * M6's counters (the epic's §2, DL-69): the Transfers by direction, by how those between two Rivals
 * happened and by the selling and the buying Guild; the Transfer Offers; each Rival's Roster and
 * Wealth as each year began against the generation range; the player's Guild's place in the
 * Rankings; the Market purchases by buyer; each Disposition's Quests, Deaths, recruits and folds; and
 * the M6-S3 harness assertion.
 */
function rivalsSection(totals: SweepTotals, deps: EngineDeps): string[] {
  const { config } = deps;
  const dispositions = dispositionKeys(totals, deps);
  const sides = [
    playerSide,
    ...keysOf(dispositions, totals.transfersBySide, ...Object.values(totals.transfersBySide), totals.offers, ...Object.values(totals.offers), totals.marketPurchases).filter(
      (side) => side !== playerSide,
    ),
  ];
  const sideLabel = (side: string): string => (side === playerSide ? "the player's Guild" : `\`${side}\``);
  const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  const perGame = (n: number): string => ratio(n, totals.games);

  // Transfers.
  const transferCells = (tally: TransferTally): string[] => [
    whole(tally.transfers),
    perGame(tally.transfers),
    whole(tally.fees),
    ratio(tally.fees, tally.transfers, 0),
  ];
  const everyTransfer = noTransfers();
  for (const direction of transferDirections) addFields(everyTransfer, totals.transfers[direction]);
  const directionLabels: Record<TransferDirection, string> = {
    in: "Into the player's Guild",
    out: "Out of the player's Guild",
    'rival-to-rival': 'Rival to Rival',
  };
  const directionRows = [
    ...transferDirections.map((direction) => [directionLabels[direction], ...transferCells(totals.transfers[direction])]),
    ['Every Transfer', ...transferCells(everyTransfer)],
  ];
  const wayLabels: Record<RivalTransferWay, string> = {
    afternoon: "An afternoon, the seller out of debt: the buyer's choice (`transferChoice`)",
    'afternoon-seller-in-debt': "An afternoon, the seller in debt: the buyer's choice or the seller's debt sale (`debtTransfer`)",
    generator: 'A night: the Transfer Generator',
    'accepted-offer': 'An accepted Transfer Offer (`offerId` set)',
  };
  const wayRows = rivalTransferWays.map((way) => [wayLabels[way], ...transferCells(totals.rivalTransfers[way])]);
  const pair = (seller: string, buyer: string): TransferTally => totals.transfersBySide[seller]?.[buyer] ?? noTransfers();
  const sideRows = sides.map((side) => {
    const bought = noTransfers();
    const sold = noTransfers();
    for (const other of sides) {
      addFields(bought, pair(other, side));
      addFields(sold, pair(side, other));
    }
    return [
      capital(sideLabel(side)),
      whole(bought.transfers),
      whole(bought.fees),
      whole(sold.transfers),
      whole(sold.fees),
      whole(bought.transfers - sold.transfers),
    ];
  });
  const matrixRows = sides.map((seller) => [capital(sideLabel(seller)), ...sides.map((buyer) => whole(pair(seller, buyer).transfers))]);

  // Offers.
  const offerRows = sides.flatMap((maker) =>
    sides.flatMap((asked) => {
      const tally = totals.offers[maker]?.[asked];
      if (tally === undefined) return [];
      const ended = sum(offerEndCauses.map((cause) => tally.ended[cause]));
      return [
        [
          `${capital(sideLabel(maker))} to ${sideLabel(asked)}`,
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

  // Rival Rosters and Wealth as each year began, against the generation range.
  const rangeCells = (starts: RivalYearStarts): string[] => {
    const { heroes, wealth } = starts;
    const count = (values: readonly number[], test: (n: number) => boolean): number => values.filter(test).length;
    const rosters = summarise(heroes);
    const wealths = summarise(wealth);
    return [
      whole(heroes.length),
      fixed(rosters.mean),
      whole(rosters.p50),
      percent(count(heroes, (n) => n < config.rivalRosterMin), heroes.length),
      percent(count(heroes, (n) => n > config.rivalRosterMax), heroes.length),
      whole(wealths.mean),
      whole(wealths.p50),
      percent(count(wealth, (n) => n < config.rivalStartingWealthMin), wealth.length),
      percent(count(wealth, (n) => n > config.rivalStartingWealthMax), wealth.length),
    ];
  };
  const merged = (parts: readonly RivalYearStarts[]): RivalYearStarts => ({
    heroes: parts.flatMap((part) => part.heroes),
    wealth: parts.flatMap((part) => part.wealth),
  });
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
  const everyStart = (disposition?: string): RivalYearStarts =>
    merged(totals.rivalYearStarts.flatMap((byDisposition) => (disposition === undefined ? Object.values(byDisposition) : [byDisposition[disposition] ?? { heroes: [], wealth: [] }])));
  const overallRows = [
    ...dispositions.map((disposition) => [`\`${disposition}\``, ...rangeCells(everyStart(disposition))]),
    ['Every Rival', ...rangeCells(everyStart())],
  ];

  // The player's Guild's place in the Rankings.
  const places = Math.max(0, ...totals.rankings.flatMap((tally) => [tally.fame.length, tally.wealth.length]));
  const placeNumbers = Array.from({ length: places }, (_, index) => index + 1);
  const meanPlace = (counts: readonly number[]): number => counts.reduce((total, n, index) => total + n * (index + 1), 0);
  const rankingRows = (by: 'fame' | 'wealth'): string[][] => {
    const all = { games: 0, counts: [] as number[] };
    const rows = totals.rankings.map((tally, year) => {
      all.games += tally.games;
      addSeries(all.counts, tally[by]);
      return [
        whole(year),
        whole(tally.games),
        ratio(meanPlace(tally[by]), tally.games),
        ...placeNumbers.map((place) => `${whole(tally[by][place - 1] ?? 0)} (${percent(tally[by][place - 1] ?? 0, tally.games)})`),
      ];
    });
    return [
      ...rows,
      [
        'Every year',
        whole(all.games),
        ratio(meanPlace(all.counts), all.games),
        ...placeNumbers.map((place) => `${whole(all.counts[place - 1] ?? 0)} (${percent(all.counts[place - 1] ?? 0, all.games)})`),
      ],
    ];
  };
  const rankingHeader = ['Year', 'Games', 'Mean place', ...placeNumbers.map((place) => `Place ${place}`)];
  const rankingAlign = rankingHeader.map(() => 'right' as const);

  // Market purchases by buyer.
  const purchasesOf = (keys: readonly string[]): MarketTally => {
    const all = noPurchases();
    for (const key of keys) addFields(all, totals.marketPurchases[key] ?? noPurchases());
    return all;
  };
  const purchaseCells = (tally: MarketTally, guildYears: number): string[] => [
    whole(tally.purchases),
    ratio(tally.purchases, guildYears),
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

  // The four characters.
  const characterRows = dispositions.map((disposition) => {
    const tally = totals.dispositions[disposition] ?? noDisposition();
    const resolved = sum(Object.values(tally.questsResolved));
    const folds = sum(Object.values(tally.folds));
    const starts = everyStart(disposition);
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
  const withDifficulty = sum(dispositions.map((disposition) => totals.dispositions[disposition]?.questsWithDifficulty ?? 0));
  const taken = sum(dispositions.map((disposition) => totals.dispositions[disposition]?.questsTaken ?? 0));
  const playerTransfers = totals.transfers.in.transfers + totals.transfers.out.transfers;

  return [
    '## Rivals (M6)',
    '',
    "Read from each game's History as before, a Transfer counting for both its Guilds (`hero.transferred`'s " +
      '`fromGuildId`, the seller, and `toGuildId`, the buyer); a side is the player\'s Guild or a Rival\'s Disposition. ' +
      'What no entry records the play loop reads from the world each `advance` begins with: the difficulty of each Quest ' +
      "a Rival takes, and whether an afternoon Transfer's seller was in debt.",
    '',
    `The M6-S3 harness assertion: \`hero.transferred\` entries naming the player's Guild, ${whole(playerTransfers)}; ` +
      `games it stopped, ${whole(totals.assertionGames)}. The automatic policy declines every Transfer Offer and never ` +
      'transfers, and the Transfer Generator never takes from the player, so any such entry is a harness failure: it ' +
      'stops its game and is listed under "Harness assertions broken", as a validator refusal is under its own heading.',
    '',
    'Transfers by direction:',
    '',
    markdownTable(['Transfers', 'Count', 'a game', 'Fees', 'Mean fee'], directionRows, ['left', 'right', 'right', 'right', 'right']),
    '',
    'Rival to Rival, by how each happened. No entry says which action made a Transfer: an accepted offer names it, a ' +
      "night's is the Generator's (Rivals choose in the afternoon), and an afternoon's is the buyer's choice unless the " +
      'seller was in debt as the afternoon began, when it may be the seller\'s debt sale instead; the entries cannot tell ' +
      'those two apart.',
    '',
    markdownTable(['Rival to Rival', 'Count', 'a game', 'Fees', 'Mean fee'], wayRows, ['left', 'right', 'right', 'right', 'right']),
    '',
    `Transfers that took a Hero to a Guild that had sold them before (DL-60's lock): ${whole(totals.transfersBack)}.`,
    '',
    'By side, bought and sold:',
    '',
    markdownTable(['Side', 'Bought', 'Fees paid', 'Sold', 'Fees taken', 'Net Heroes'], sideRows, ['left', 'right', 'right', 'right', 'right', 'right']),
    '',
    markdownTable(
      ['Sold by, bought by', ...sides.map((side) => capital(sideLabel(side)))],
      matrixRows,
      ['left', ...sides.map(() => 'right' as const)],
    ),
    '',
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
    `The Rivals in play as each year began, before the policy acts (0 is the new world): each Roster's size against ` +
      `the range a Rival is generated with (\`rivalRosterMin\` ${whole(config.rivalRosterMin)} to \`rivalRosterMax\` ` +
      `${whole(config.rivalRosterMax)}), and its Wealth against its starting range (\`rivalStartingWealthMin\` ` +
      `${whole(config.rivalStartingWealthMin)} to \`rivalStartingWealthMax\` ${whole(config.rivalStartingWealthMax)}); ` +
      'a median is the middle year-start, the lower of two:',
    '',
    markdownTable(['Year', ...rangeHeader], allYearRows, ['right', ...rangeAlign]),
    '',
    'By Disposition, over every year-start, then year by year:',
    '',
    markdownTable(['Disposition', ...rangeHeader], overallRows, ['left', ...rangeAlign]),
    '',
    markdownTable(['Disposition', 'Year', ...rangeHeader], dispositionYearRows, ['left', 'right', ...rangeAlign]),
    '',
    "The player's Guild's place in the Rankings (the engine's `rankings`, every Guild in play) as each year began, by Fame:",
    '',
    markdownTable(rankingHeader, rankingRows('fame'), rankingAlign),
    '',
    'By Wealth:',
    '',
    markdownTable(rankingHeader, rankingRows('wealth'), rankingAlign),
    '',
    'Market purchases (`item.bought`), by the buying Guild:',
    '',
    markdownTable(
      ['Market purchases', 'Purchases', 'a Guild-year', 'Items', 'Cost', 'Mean cost'],
      purchaseRows,
      ['left', 'right', 'right', 'right', 'right', 'right'],
    ),
    '',
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
    `Policy (INPUTS 4.14): first decline every Transfer Offer made for its Heroes (M6-S2); then the gear it holds ` +
      `onto Heroes with the slot empty (M5-S2); the highest-reward ` +
      `Quest it can staff, the strongest Party of the size it requires, carrying one of each consumable held that ` +
      `serves the Quest (DL-62); one purchase a Turn: the infirmary's next grade while Wealth exceeds ` +
      `${sweep.policy.buildWealthMultiple} times its cost (M3-S6), else one armour while a Hero has none and Wealth ` +
      `exceeds ${sweep.policy.buyWealthMultiple} times its price (M5-S4), else the cheapest Hero who would sign while ` +
      `Wealth exceeds ${sweep.policy.recruitWealthMultiple} Upkeeps and the Roster is below ${sweep.policy.rosterLimit}, ` +
      `else consumables toward ${sweep.policy.consumableStock} of each while Wealth exceeds ` +
      `${sweep.policy.buyWealthMultiple} times their cost and, once paid, ${sweep.policy.consumableReserveUpkeeps} ` +
      `Upkeeps (DL-62); never sell; never transfer a Hero in or out.`,
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
        ['Rival Guildmasters succeeded', `${whole(totals.rivalSuccessions)}, ${perGame(totals.rivalSuccessions)} a game`],
        ['Policy actions the rules refused', whole(totals.refusals)],
        ['Games the validator refused', sweep.validated ? whole(totals.invalidGames) : 'not validated'],
        ['Games a harness assertion stopped', whole(totals.assertionGames)],
        [
          'Byte equality, one seed played twice',
          sweep.replay === null
            ? '—'
            : `\`${sweep.replay.seed}\`: ${sweep.replay.identical ? 'identical' : 'DIFFERENT'} (${whole(sweep.replay.length)} characters)`,
        ],
        ['Saves that load and serialise back identically', `${whole(roundTrips)} of ${whole(count)}`],
        ["Fingerprint of every seed's last save", `\`${sweepFingerprint(sweep.games)}\``],
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
    `A Rival Guildmaster's Retirement is met by Succession (\`guildmaster.succeeded\`, M9-S2), not a fold: ` +
      `${whole(totals.rivalSuccessions)} in all.`,
    '',
    // M9-S1 (DL-101): the nights the Guild State Engine found a Guild's Wealth crossing the floor.
    markdownTable(
      ['Bankruptcy floor', "Player's", 'a game', "Rivals'", 'a game'],
      [
        heroRow('Fell below it (`guild.below-floor`)', totals.belowFloor),
        heroRow('Back to it or more (`guild.floor-recovered`)', totals.floorRecovered),
      ],
      ['left', 'right', 'right', 'right', 'right'],
    ),
    '',
    `Games ending in each year (year 0 is the first): ${totals.endedInYear.map((n, year) => `${year}: ${n}`).join(', ')}.`,
    '',
    ...progressionSection(totals, deps),
    ...questEngineSection(totals, deps),
    ...itemsSection(totals, deps),
    ...rivalsSection(totals, deps),
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
  const broken = sweep.games.flatMap(({ seed, assertion }) => (assertion === null ? [] : [{ seed, ...assertion }]));
  if (broken.length > 0) {
    lines.push(
      '## Harness assertions broken',
      '',
      markdownTable(
        ['Seed', 'Turn', 'Check', 'Id'],
        broken.slice(0, listed).map(({ seed, turn, check, id }) => [`\`${seed}\``, whole(turn), check, `\`${id}\``]),
      ),
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}
