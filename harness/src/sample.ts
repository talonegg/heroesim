// `npm run harness:sample` (pre-M0 review E8): plays one seed under the automatic policy for 20
// years, or to its ending, and writes the save to harness/samples/twenty-years.json, gitignored,
// for M7-S4 to load and for reading by hand (`npm run play -- load harness/samples/twenty-years.json`
// makes it the CLI's game). The save is `serialise`'s canonical text, so a front end loads it with
// `deserialise` like any other.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '@heroesim/content/node';
import { defaultConfig, serialise, type EngineDeps } from '@heroesim/engine';
import { countGame } from './counters.js';
import { defaultYears, playGame } from './play.js';

/** Where the sample save is written. */
export const samplePath = fileURLToPath(new URL('../samples/twenty-years.json', import.meta.url));

/** The seed the sample plays: the first of every sweep. */
export const sampleSeed = 'seed-0001';

export interface Sample {
  path: string;
  seed: string;
  /** The Turn the game stopped at, and why. */
  turn: number;
  ending: string | null;
  historyEntries: number;
  bytes: number;
}

/** Plays `seed` for `years` under `deps` and writes the save to `path`, making its directory. */
export function writeSample(
  deps: EngineDeps,
  { path = samplePath, seed = sampleSeed, years = defaultYears }: { path?: string; seed?: string; years?: number } = {},
): Sample {
  const { document } = playGame(seed, deps, { years });
  const text = serialise(document);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
  return {
    path,
    seed,
    turn: document.world.turn,
    ending: countGame(document).ending,
    historyEntries: document.history.entries.length,
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}

if (import.meta.main) {
  const sample = writeSample({ config: { ...defaultConfig }, content: loadContent() });
  console.log(
    `${sample.seed}: stopped at Turn ${sample.turn} (${sample.ending ?? `${defaultYears} years played`}); ` +
      `${sample.historyEntries} History entries, ${(sample.bytes / 1024 / 1024).toFixed(2)} MB\nWrote ${sample.path}`,
  );
}
