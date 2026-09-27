// One process's share of a parallel play sweep (M2-S12, DL-34). `sweepPlayInParallel` writes a
// job file and runs this module in a child process with tsx (`node --import tsx shard.ts <job>
// <result>`); it plays its seeds with the core content and the job's config and writes their
// records and timings, as JSON, to the result file. Games are independent and each is seeded, so
// where a game is played does not change it: the parallel sweep's records equal the serial one's.
// A job names the modules to install by id (M8-S3, DL-78), since a module is code and cannot travel
// in JSON; the child installs the harness's own of each id (`modulesFor`).

import { readFileSync, writeFileSync } from 'node:fs';
import { loadContent } from '@heroesim/content/node';
import type { EngineDeps, GameConfig } from '@heroesim/engine';
import { modulesFor } from './modules.js';
import { recordGame, type GameRecord, type PlayOptions } from './play.js';
import type { PolicyConfig } from './policy.js';

/** Some seeds played: each game's record, and every Turn's timings in seed order. */
export interface PlayedSeeds {
  games: GameRecord[];
  advanceMs: number[];
  validateMs: number[];
}

/** Plays `seeds` in this process, in order, and keeps each game's record, never its document. */
export function playSeeds(seeds: readonly string[], deps: EngineDeps, options: PlayOptions = {}): PlayedSeeds {
  const played: PlayedSeeds = { games: [], advanceMs: [], validateMs: [] };
  for (const seed of seeds) {
    const { record, advanceMs, validateMs } = recordGame(seed, deps, options);
    played.games.push(record);
    for (const ms of advanceMs) played.advanceMs.push(ms);
    for (const ms of validateMs) played.validateMs.push(ms);
  }
  return played;
}

/** What a child process is asked to play. Plain JSON. */
export interface ShardJob {
  seeds: string[];
  config: GameConfig;
  years: number;
  validate: boolean;
  policy: PolicyConfig;
  /** The ids of the modules to install, in the order their hooks run (`harnessModules`); none when absent. */
  modules?: string[];
}

/** What it plays, and the content it played with, which the parent checks is its own. */
export interface ShardResult extends PlayedSeeds {
  content: { id: string; version: number };
}

/** Plays a job with the core content and the job's modules, as the child process does. */
export function runShard(job: ShardJob): ShardResult {
  const content = loadContent();
  const { seeds, config, years, validate, policy, modules = [] } = job;
  const deps: EngineDeps = modules.length === 0 ? { config, content } : { config, content, modules: modulesFor(modules) };
  const played = playSeeds(seeds, deps, { years, validate, policy });
  return { ...played, content: { id: content.id, version: content.version } };
}

if (import.meta.main) {
  const [jobPath, resultPath] = process.argv.slice(2);
  if (jobPath === undefined || resultPath === undefined) throw new Error('Usage: shard.ts <job.json> <result.json>');
  const job = JSON.parse(readFileSync(jobPath, 'utf8')) as ShardJob;
  writeFileSync(resultPath, JSON.stringify(runShard(job)), 'utf8');
}
