import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent } from '@heroesim/content/node';
import { defaultConfig, deserialise, type EngineDeps } from '@heroesim/engine';
import { afterEach, expect, test } from 'vitest';
import { playGame } from './play.js';
import { samplePath, sampleSeeds, writeSample } from './sample.js';

// `npm run harness:sample` (pre-M0 review E8, DL-34), on short games written to a temporary
// directory.

const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };
/** Every game ends within its first Days: below the floor from the start, with a Day's grace. */
const doomed: EngineDeps = { ...deps, config: { ...deps.config, startingWealth: -1000, bankruptcyGraceDays: 1 } };
const years = 30 / deps.config.turnsPerYear;
let dir: string | null = null;

afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function tempPath(): string {
  dir = mkdtempSync(join(tmpdir(), 'heroesim-sample-'));
  return join(dir, 'nested', 'sample.json');
}

test('writes to harness/samples/twenty-years.json, which Git ignores, trying seeds from seed-0001', () => {
  expect(samplePath.replaceAll('\\', '/')).toMatch(/\/harness\/samples\/twenty-years\.json$/);
  expect(sampleSeeds[0]).toBe('seed-0001');
});

test('writes the first game that runs its full length, as a save that loads back', () => {
  const path = tempPath();

  const sample = writeSample(deps, { path, years });

  expect(sample).toMatchObject({ path, seed: 'seed-0001', tried: 1, turn: 30, ending: null });
  const loaded = deserialise(readFileSync(path, 'utf8'), deps);
  expect(loaded.ok).toBe(true);
  if (loaded.ok) {
    expect(loaded.document.world.turn).toBe(30);
    expect(loaded.document.history.entries).toHaveLength(sample.historyEntries);
  }
});

test('writes the longest game when every seed tried ends early', () => {
  const seeds = ['sample-a', 'sample-b', 'sample-c'];
  const turns = seeds.map((seed) => playGame(seed, doomed, { years }).document.world.turn);
  const longest = seeds[turns.indexOf(Math.max(...turns))];

  const sample = writeSample(doomed, { path: tempPath(), seeds, years });

  expect(sample).toMatchObject({ seed: longest, tried: 3, turn: Math.max(...turns), ending: 'bankruptcy' });
});
