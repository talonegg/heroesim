// @vitest-environment node
import { contentFiles } from '@heroesim/content';
import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { bundledFiles, content, fileNameOf } from './content';

// The browser takes its content from the bundler, the CLI and the harness from disk. They must be
// the same content set, or the front ends are not playing the same game (M7-S1). The test runs in
// Node's environment rather than jsdom's: the Node entry finds its directory with node:url's
// `fileURLToPath`, which refuses jsdom's `URL`.
describe('the bundled content set', () => {
  test("deep-equals the Node entry's, read from the same files", () => {
    expect(content).toEqual(loadContent());
  });

  test('bundles every content file and nothing else from the directory', () => {
    expect(Object.keys(bundledFiles).sort()).toEqual([...contentFiles].sort());
  });

  test.each([
    ['../../content/stats.json', 'stats.json'],
    ['/content/loot-tables.json', 'loot-tables.json'],
    ['C:\\JHH\\source\\heroesim\\content\\names.json', 'names.json'],
  ])('takes the file name from the bundler key %s', (key, name) => {
    expect(fileNameOf(key)).toBe(name);
  });
});
