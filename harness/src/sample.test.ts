import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent } from '@heroesim/content/node';
import { defaultConfig, deserialise, type EngineDeps } from '@heroesim/engine';
import { afterEach, expect, test } from 'vitest';
import { samplePath, writeSample } from './sample.js';

// `npm run harness:sample` (pre-M0 review E8), on a short game written to a temporary directory.

const deps: EngineDeps = { config: { ...defaultConfig }, content: loadContent() };
let dir: string | null = null;

afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

test('writes to harness/samples/twenty-years.json, which Git ignores', () => {
  expect(samplePath.replaceAll('\\', '/')).toMatch(/\/harness\/samples\/twenty-years\.json$/);
});

test('writes a save of the played game that loads back', () => {
  dir = mkdtempSync(join(tmpdir(), 'heroesim-sample-'));
  const path = join(dir, 'nested', 'sample.json');

  const sample = writeSample(deps, { path, years: 30 / deps.config.turnsPerYear });

  expect(sample).toMatchObject({ path, seed: 'seed-0001', turn: 30, ending: null });
  const loaded = deserialise(readFileSync(path, 'utf8'), deps);
  expect(loaded.ok).toBe(true);
  if (loaded.ok) {
    expect(loaded.document.world.turn).toBe(30);
    expect(loaded.document.history.entries).toHaveLength(sample.historyEntries);
  }
});
