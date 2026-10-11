// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readContent } from '@heroesim/content';
import { loadContent, readContentDir } from '@heroesim/content/node';
import { describe, expect, test } from 'vitest';
import { compactContent } from '../compact-content';
import { contentGate, validateContentDir } from '../content-gate';
import { bundledFiles, content, fileNameOf } from './content';

// The browser takes its content from the bundler, the CLI and the harness from disk. They must be
// the same content set, or the front ends are not playing the same game. The test runs in
// Node's environment rather than jsdom's: the Node entry finds its directory with node:url's
// `fileURLToPath`, which refuses jsdom's `URL`.
describe('the bundled content set', () => {
  test("deep-equals the Node entry's, read from the same files, its rows in the same order", () => {
    expect(content).toEqual(loadContent());
    expect(JSON.stringify(content)).toBe(JSON.stringify(loadContent()));
  });

  // DL-260: a folder's rows found by the bundler's pattern, as the Node entry reads its folder.
  test('bundles every content file and nothing else from the directory, each row of a folder among them', () => {
    expect(Object.keys(bundledFiles).sort()).toEqual(Object.keys(readContentDir()).sort());
    expect(Object.keys(bundledFiles)).toContain('items/short-sword.json');
  });

  test.each([
    ['../../content/stats.json', 'stats.json'],
    ['../../content/items/short-sword.json', 'items/short-sword.json'],
    ['C:\\JHH\\source\\heroesim\\content\\encounters\\the-long-march.json', 'encounters/the-long-march.json'],
    ['/content/loot-tables/the-hoard.json', 'loot-tables/the-hoard.json'],
    ['C:\\JHH\\source\\heroesim\\content\\names.json', 'names.json'],
  ])('takes the file name from the bundler key %s', (key, name) => {
    expect(fileNameOf(key)).toBe(name);
  });
});

// DL-152: the script reads the content with its shapes checked, and the
// build validates the same files, failing on a rule across rows that the reader does not check.
// A test here makes a copy of the content and runs the checks over it, 214 ms alone but past Vitest's 5 s
// default in a full `npm test` (5,017 and 5,037 ms, DL-274). The timeout bounds a hang, not the speed.
describe('the content gate', { timeout: 30_000 }, () => {
  const contentDir = path.join(import.meta.dirname, '..', '..', 'content');

  test("fails the build on content the checks refuse, which the page's reader alone would take", async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), 'heroesim-gate-'));
    try {
      for (const [name, text] of Object.entries(readContentDir(contentDir))) {
        await mkdir(path.dirname(path.join(scratch, name)), { recursive: true });
        await writeFile(path.join(scratch, name), text);
      }
      const stats = JSON.parse(await readFile(path.join(scratch, 'stats.json'), 'utf8')) as Record<string, { default: number; max: number }>;
      const [first] = Object.values(stats);
      if (first === undefined) throw new Error('no Stat');
      first.default = first.max + 1;
      await writeFile(path.join(scratch, 'stats.json'), JSON.stringify(stats));
      const files = readContentDir(scratch);

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

  // DL-260's verification: the gate reads a folder's rows as the Node entry does, so it passes the
  // content as it is and refuses a row the checks refuse, naming the row's file.
  test("passes the content, and refuses a folder's row the checks refuse, naming its file", async () => {
    await expect(validateContentDir(contentDir)).resolves.toBeUndefined();
    const scratch = await mkdtemp(path.join(tmpdir(), 'heroesim-gate-'));
    try {
      for (const [name, text] of Object.entries(readContentDir(contentDir))) {
        await mkdir(path.dirname(path.join(scratch, name)), { recursive: true });
        await writeFile(path.join(scratch, name), text);
      }
      const row = JSON.parse(await readFile(path.join(scratch, 'items', 'short-sword.json'), 'utf8')) as Record<string, unknown>;
      delete row['slot'];
      await writeFile(path.join(scratch, 'items', 'short-sword.json'), JSON.stringify(row));

      await expect(validateContentDir(scratch)).rejects.toThrow(/items\/short-sword\.json: slot is missing/);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});

// DL-186 item 14: the content version's file is bundled with its changelog empty; a folder's row
// keyed `version` is a row like any other, bundled as written (DL-260).
describe('the compacted content', () => {
  test("empties the content version's changelog, and bundles a folder's row named version.json as written", async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), 'heroesim-compact-'));
    try {
      const version = { contentVersion: 3, changelog: ['3: a line'] };
      const row = { key: 'version', name: 'A row keyed version' };
      await mkdir(path.join(scratch, 'encounters'), { recursive: true });
      await writeFile(path.join(scratch, 'version.json'), JSON.stringify(version, null, 2));
      await writeFile(path.join(scratch, 'encounters', 'version.json'), JSON.stringify(row, null, 2));
      const load = compactContent(scratch).load as unknown as (id: string) => Promise<string | null>;
      const bundled = async (id: string): Promise<unknown> => {
        const code = await load.call({}, id);
        if (code === null) throw new Error(`${id} was not compacted`);
        return JSON.parse(JSON.parse(code.replace(/^export default /, '').replace(/;$/, '')) as string);
      };

      expect(await bundled(`${path.join(scratch, 'version.json')}?raw`)).toEqual({ ...version, changelog: [] });
      expect(await bundled(`${path.join(scratch, 'encounters', 'version.json')}?raw`)).toEqual(row);
      expect(await load.call({}, path.join(scratch, 'version.json'))).toBeNull();
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
