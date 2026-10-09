// @vitest-environment node
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { contentFiles, readContent } from '@heroesim/content';
import { loadContent } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { contentGate, validateContentDir } from '../content-gate';
import { bundledFiles, content, fileNameOf } from './content';

// The browser takes its content from the bundler, the CLI and the harness from disk. They must be
// the same content set, or the front ends are not playing the same game. The test runs in
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

// DL-152: the script reads the content with its shapes checked, and the
// build validates the same files, failing on a rule across rows that the reader does not check.
describe('the content gate', () => {
  const contentDir = path.join(import.meta.dirname, '..', '..', 'content');

  test('passes the content the page bundles', async () => {
    await expect(validateContentDir(contentDir)).resolves.toBeUndefined();
  });

  test("fails the build on content the checks refuse, which the page's reader alone would take", async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), 'heroesim-gate-'));
    try {
      for (const name of contentFiles) await copyFile(path.join(contentDir, name), path.join(scratch, name));
      const stats = JSON.parse(await readFile(path.join(scratch, 'stats.json'), 'utf8')) as Record<string, { default: number; max: number }>;
      const [first] = Object.values(stats);
      if (first === undefined) throw new Error('no Stat');
      first.default = first.max + 1;
      await writeFile(path.join(scratch, 'stats.json'), JSON.stringify(stats));
      const files = Object.fromEntries(await Promise.all(contentFiles.map(async (name) => [name, await readFile(path.join(scratch, name), 'utf8')] as const)));

      expect(() => readContent(files)).not.toThrow();
      await expect(validateContentDir(scratch)).rejects.toThrow(/default \d+ is outside/);
      const gate = contentGate(scratch);
      const start = gate.buildStart as unknown as () => Promise<void>;
      await expect(start.call({})).rejects.toThrow(/default \d+ is outside/);
      expect(gate.apply).toBe('build');
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
