// The play sweep across seeds (M2-S12): play each seed under the automatic policy, keep only its
// record (counters and measures, never the document), and replay one seed to check that the same
// seed under the same policy serialises byte for byte alike (`compareReplay`). `sweepPlay` plays in this
// process; `sweepPlayInParallel` shares the seeds among child processes (`shard.ts`), since a
// 20-year game takes most of a minute. Its totals are `sweepTotals`' (`counter.ts`), and its report
// `playReport`'s (`play-report.ts`). DL-34 records the method and the numbers.

import { createHash } from 'node:crypto';
import { compareByCodeUnit, serialise, type EngineDeps } from '@heroesim/engine';
import type { Counter } from './counter.js';
import { gameCounters } from './game-counters.js';
import { idsOf } from './modules.js';
import { defaultPolicyConfig, type PolicyConfig } from './policy.js';
import { defaultYears, fingerprintOf, playGame, type GameRecord, type RecordOptions } from './play.js';
import { runShardJobs } from './children.js';
import { halfTheProcessors } from './settings.js';
import { playSeeds, type PlayedSeeds, type ShardJob } from './shard.js';
import { summarise, type Summary } from './stats.js';

export interface PlaySweep {
  seeds: readonly string[];
  years: number;
  validated: boolean;
  policy: Readonly<PolicyConfig>;
  /** Processes the games were shared among: 1 when played in this one. */
  workers: number;
  /** The counters each game gathered, which its totals and report read (DL-239). */
  counters: readonly Counter[];
  games: GameRecord[];
  /** Milliseconds per `advance`, every Turn of every game. */
  advance: Summary;
  /** Milliseconds per validation after an `advance`, when validating. */
  validation: Summary;
  /**
   * One seed played once more, alone, after the sweep: the first to have run its full length, or the
   * first seed when none did. Whether its last document serialises as the sweep's record of the same
   * seed did, by length and SHA-256 (`compareReplay`; two processes when the sweep ran in parallel,
   * DL-189), and its `advance` per Turn, taken with nothing else of the sweep running and no observer.
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

export interface SweepOptions extends RecordOptions {
  /** A millisecond clock for the sweep's own wall-clock timings. */
  now?: () => number;
  /** Replay one seed after the sweep (`PlaySweep.replay`); true unless false (`HEROESIM_REPLAY`). */
  replay?: boolean;
}

/** One play of a seed for the replay, reduced to what it compares: its last document's serialised length and fingerprint. */
export interface ReplayPlay {
  length: number;
  fingerprint: string;
}

/**
 * The game the replay is compared with: `wanted`'s record, or, when `wanted` is not among the sweep's
 * seeds, the first seed played (DL-189).
 */
export function replayedGame(games: readonly GameRecord[], wanted: string | undefined): GameRecord | undefined {
  return games.find((game) => game.seed === wanted) ?? games[0];
}

/**
 * The replay's play set against the record the sweep's shard made of the same seed: identical when its
 * last document's serialised length and fingerprint (`DocumentMeasures`) are both the shard's (DL-189).
 * The two plays were made in two processes when the sweep ran in parallel.
 */
export function compareReplay(recorded: GameRecord, replayed: ReplayPlay, advanceMs: readonly number[]): NonNullable<PlaySweep['replay']> {
  const { serialisedLength, fingerprint } = recorded.measures;
  return {
    seed: recorded.seed,
    identical: replayed.length === serialisedLength && replayed.fingerprint === fingerprint,
    length: serialisedLength,
    advance: summarise(advanceMs),
  };
}

/**
 * Plays `recorded`'s seed once more, alone and bare: no observer, so no counter gathered and no yearly
 * measurement walk, and no validation (DL-189, DL-239). Compares its last document's length and
 * fingerprint with the recorded game's (`compareReplay`). The document and its text are out of reach
 * once the play returns (DL-177, DL-181).
 */
function replay(recorded: GameRecord | undefined, deps: EngineDeps, options: SweepOptions): PlaySweep['replay'] {
  if (recorded === undefined) return null;
  const game = playGame(recorded.seed, deps, { ...options, validate: false });
  const text = serialise(game.document);
  return compareReplay(recorded, { length: text.length, fingerprint: fingerprintOf(text) }, game.advanceMs);
}

function sweepOf(
  seeds: readonly string[],
  played: PlayedSeeds,
  deps: EngineDeps,
  options: SweepOptions,
  timing: { workers: number; started: number; gamesMs: number; now: () => number },
): PlaySweep {
  // The longest game makes the most of the comparison, and its timing the fairest of one game.
  const wanted = played.games.find((game) => game.ranFullLength)?.seed ?? seeds[0];
  const replayed = options.replay === false ? null : replay(replayedGame(played.games, wanted), deps, options);
  return {
    seeds,
    years: options.years ?? defaultYears,
    validated: options.validate ?? false,
    policy: options.policy ?? defaultPolicyConfig,
    workers: timing.workers,
    counters: options.counters ?? gameCounters,
    games: played.games,
    advance: summarise(played.advanceMs),
    validation: summarise(played.validateMs),
    replay: replayed,
    totalMs: timing.now() - timing.started,
    gamesMs: timing.gamesMs,
  };
}

/**
 * Plays every seed in `seeds` in this process under `deps` and the options, gathering `counters`
 * (`gameCounters` unless given), then plays one of them once more (`PlaySweep.replay`) and compares
 * its last document's serialisation with the sweep's. Never throws on what it finds.
 */
export async function sweepPlay(seeds: readonly string[], deps: EngineDeps, options: SweepOptions = {}): Promise<PlaySweep> {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const played = await playSeeds(seeds, deps, options);
  return sweepOf(seeds, played, deps, options, { workers: 1, started, gamesMs: now() - started, now });
}

/**
 * The sweep's fingerprint (DL-76): SHA-256, in hex, over one line per game, in seed order, of its seed,
 * a tab and its last save's fingerprint (`DocumentMeasures.fingerprint`). Two runs of the same seeds
 * give the same one only when every game's save is byte for byte equal, so it shows in one line of a
 * report whether a change moved any game at all.
 */
export function sweepFingerprint(games: readonly GameRecord[]): string {
  const lines = [...games]
    .sort((a, b) => compareByCodeUnit(a.seed, b.seed))
    .map((game) => `${game.seed}\t${game.measures.fingerprint}\n`);
  return createHash('sha256').update(lines.join('')).digest('hex');
}

/**
 * `sweepPlay`, with each seed played in a child process of its own (`shard.ts`), `workers` at once
 * (half the logical processors unless given) and the next starting as one finishes, so that a lane of
 * early endings does not sit idle to the slowest lane's end; each child loads the core content and
 * plays under `deps.config` with `deps.modules`, installed by id (DL-78), gathering the core's counters
 * (`gameCounters`); the records come back in seed order and the replay, unless `replay` is false, is
 * played in this process, once, when they are done, and compared with the child's record. The children
 * load the core content themselves, so `deps.content` must be it: a child that loads another refuses
 * the sweep; and each module must be the harness's own of its id (`idsOf`), which is checked before
 * any child starts.
 *
 * @throws Error when a child fails or played with other content, or a module is not the harness's:
 * a broken run, not a finding; RangeError when given counters of its own, which no child can gather
 */
export async function sweepPlayInParallel(
  seeds: readonly string[],
  deps: EngineDeps,
  options: SweepOptions & { workers?: number; drafts?: string } = {},
): Promise<PlaySweep> {
  if (options.counters !== undefined) throw new RangeError("A sweep shared among child processes gathers the harness's own counters: a counter is code, which no job carries");
  const now = options.now ?? (() => performance.now());
  const workers = Math.max(1, Math.min(options.workers ?? halfTheProcessors(), seeds.length));
  const modules = idsOf(deps.modules);
  const started = now();
  const jobs = seeds.map(
    (seed): ShardJob => ({
      seeds: [seed],
      config: deps.config,
      years: options.years ?? defaultYears,
      validate: options.validate ?? false,
      policy: options.policy ?? defaultPolicyConfig,
      ...(modules.length === 0 ? {} : { modules }),
      ...(options.drafts === undefined ? {} : { drafts: options.drafts }),
    }),
  );
  const results = await runShardJobs(jobs, workers);
  const gamesMs = now() - started;

  const played: PlayedSeeds = { games: [], advanceMs: [], validateMs: [] };
  for (const result of results) {
    if (result.content.id !== deps.content.id || result.content.version !== deps.content.version) {
      throw new Error(`A play shard loaded content ${result.content.id} ${result.content.version}, not the sweep's`);
    }
    for (const ms of result.advanceMs) played.advanceMs.push(ms);
    for (const ms of result.validateMs) played.validateMs.push(ms);
  }
  // Seed i was job i's one game.
  played.games = seeds.map((seed, index) => {
    const game = results[index]?.games[0];
    if (game?.seed !== seed) throw new Error(`A play shard returned no record for ${seed}`);
    return game;
  });
  return sweepOf(seeds, played, deps, options, { workers, started, gamesMs, now });
}
