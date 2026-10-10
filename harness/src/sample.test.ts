import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { deserialise, type EngineDeps } from '@heroesim/engine';
import { afterEach, expect, test } from 'vitest';
import { coreDeps } from './harness.test-support.js';
import { playGame } from './play.js';
import { samplePath, writeSample } from './sample.js';

// `npm run harness:sample` (pre-M0 review E8, DL-34), on short games written to a temporary
// directory.

const deps = coreDeps;
/**
 * Every game ends within its first Days: below the floor from the start, with a Day's grace. The floor
 * stands above the starting Wealth, which is no debt (DL-210), as far as a start at -1,000 stood below 0.
 */
const doomed: EngineDeps = { ...deps, config: { ...deps.config, bankruptcyFloor: deps.config.startingWealth + 1000, bankruptcyGraceDays: 1 } };
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

test('Git ignores the sample file it writes', () => {
  const repositoryRoot = resolve(dirname(samplePath), '..', '..');
  const checked = spawnSync('git', ['check-ignore', '-q', samplePath], { cwd: repositoryRoot });
  expect(checked.status).toBe(0);
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
