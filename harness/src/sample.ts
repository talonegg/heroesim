// `npm run harness:sample` (pre-M0 review E8): plays a game under the automatic policy for 20
// years and writes the save to harness/samples/twenty-years.json, gitignored, for M7-S4 to load
// and for reading by hand (`npm run play -- load harness/samples/twenty-years.json` makes it the
// CLI's game). The save is `serialise`'s canonical text, so a front end loads it with
// `deserialise` like any other.
//
// The sample is a 20-year save: the seeds are tried from `seed-0001` on and the first whose game
// runs its full 20 years is written, or the longest game when none of the first twenty does, which
// then stops at its ending (DL-34). Under the same config it is always the same game.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '@heroesim/content/node';
import { defaultConfig, serialise, type EngineDeps, type WorldDocument } from '@heroesim/engine';
import { countGame } from './counters.js';
import { defaultYears, playGame } from './play.js';
import { seedNames } from './seeds.js';

/** Where the sample save is written. */
export const samplePath = fileURLToPath(new URL('../samples/twenty-years.json', import.meta.url));

/** Seeds tried, from `seed-0001` on, for a game that runs its full length. */
export const sampleSeeds: readonly string[] = seedNames(20);

export interface Sample {
  path: string;
  seed: string;
  /** Seeds played to find it. */
  tried: number;
  /** The Turn the game stopped at, and its ending, if it ended. */
  turn: number;
  ending: string | null;
  historyEntries: number;
  bytes: number;
}

/**
 * Plays `seeds` in turn under `deps` until a game runs its `years`, and writes the first that does,
 * or the longest when none does, to `path`, making its directory.
 */
export function writeSample(
  deps: EngineDeps,
  {
    path = samplePath,
    seeds = sampleSeeds,
    years = defaultYears,
  }: { path?: string; seeds?: readonly string[]; years?: number } = {},
): Sample {
  let chosen: { seed: string; document: WorldDocument } | null = null;
  let tried = 0;
  for (const seed of seeds) {
    const { document } = playGame(seed, deps, { years });
    tried += 1;
    if (chosen === null || document.world.turn > chosen.document.world.turn) chosen = { seed, document };
    if (document.world.ended === null) break;
  }
  if (chosen === null) throw new Error('No seed to play for the sample');

  const text = serialise(chosen.document);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
  return {
    path,
    seed: chosen.seed,
    tried,
    turn: chosen.document.world.turn,
    ending: countGame(chosen.document).ending,
    historyEntries: chosen.document.history.entries.length,
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}

if (import.meta.main) {
  const sample = writeSample({ config: { ...defaultConfig }, content: loadContent() });
  console.log(
    `${sample.seed} (${sample.tried} ${sample.tried === 1 ? 'seed' : 'seeds'} played): stopped at Turn ${sample.turn} ` +
      `(${sample.ending ?? `${defaultYears} years played`}); ${sample.historyEntries} History entries, ` +
      `${(sample.bytes / 1024 / 1024).toFixed(2)} MB\nWrote ${sample.path}`,
  );
}
