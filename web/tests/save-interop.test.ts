/**
 * Saves cross between the two front ends, in **both** directions (DL-02, E8-S4).
 *
 * DL-02 says there is one serialiser and the storage adapters differ per front end, and
 * `storage.ts`' own header says "a document written here loads in the CLI and a
 * `.career/*.json` file pasted in loads here". Until now that was a sentence in a comment
 * and half a test: nothing put a file the CLI actually wrote through the browser's
 * adapter, or a string the browser actually wrote through the CLI's. This does both, with
 * the real modules on each side, which is the E8-S4 acceptance box that has been open
 * since E8 was written.
 *
 * It lives here rather than in `cli/tests` because the browser adapter is bundled by Vite
 * and only this project's Vitest configuration can load it.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { advance, newCareer, serialiseCareer, type Career } from '@heroesim/engine';
import { content } from '../src/content';
import {
  careerKey,
  createCareerStorage,
  memoryStore,
  type KeyValueStore,
} from '../src/state/storage';

/**
 * The terminal's own slot module, loaded at run time rather than imported.
 *
 * `web/tsconfig.json` sets a `rootDir` of `web`, and a static import of a file outside it
 * is a compile error — which is the boundary the project wants, since neither front end
 * may reach into the other's source. The boundary is real and stays; this test is the one
 * place that has to hold both ends of DL-02's contract at once, so it reaches the module
 * through its file URL, exactly as a person pasting a `.career/*.json` about reaches the
 * file rather than the code.
 */
interface SlotModule {
  headerFor: (career: Career) => unknown;
  loadSlot: (dir: string, name: string, content?: unknown) => { career: Career; history: string[] };
  saveSlot: (
    dir: string,
    name: string,
    career: Career,
    history: readonly string[],
    savedOn: string,
  ) => string;
  slotPath: (dir: string, name: string) => string;
}

/** `cli/src/slots.ts`, wherever this project's working directory happens to sit. */
function slotsModulePath(): string {
  const here = process.cwd();
  for (const from of [here, join(here, '..')]) {
    const candidate = join(from, 'cli', 'src', 'slots.ts');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`cannot find cli/src/slots.ts from ${here}`);
}

const { headerFor, loadSlot, saveSlot, slotPath } = (await import(
  pathToFileURL(slotsModulePath()).href
)) as SlotModule;


const workspace = mkdtempSync(join(tmpdir(), 'heroesim-interop-'));

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

/** A Career with some play behind it, so the document is not a fresh-world special case. */
function played(seed: string): Career {
  const opened = newCareer(seed, content, { startingCoin: 2500 });
  return advance(opened.career, 140, content).career;
}

describe('a slot file the CLI wrote, opened in the browser', () => {
  const career = played('interop-cli-to-web');
  const history = ['Year 1, Day 3 · Something happened worth remembering.'];
  const dir = join(workspace, 'from-cli');
  const path = saveSlot(dir, 'one', career, history, '2026-09-20T09:00:00.000Z');
  const file = JSON.parse(readFileSync(path, 'utf8')) as {
    career: string;
    history: string[];
    header: unknown;
  };

  it('carries the Career as the exact string the engine serialised, and nothing else', () => {
    expect(file.career).toBe(serialiseCareer(career));
    expect(file.header).toEqual(headerFor(career));
    expect(file.history).toEqual(history);
  });

  it('loads unchanged through the browser adapter when its inner Career is pasted in', () => {
    const store: KeyValueStore = memoryStore();
    // What a player pasting a `.career/one.json` into the browser hands it: the inner
    // `career` string, which is the whole of the document DL-02 shares.
    store.setItem(careerKey('1'), file.career);
    const storage = createCareerStorage(store);

    const loaded = storage.load('1');
    expect(loaded.ok, loaded.ok ? '' : loaded.message).toBe(true);
    if (!loaded.ok) return;
    expect(serialiseCareer(loaded.career)).toBe(file.career);
    expect(loaded.career.guild.name).toBe(career.guild.name);
    expect(loaded.career.day).toBe(career.day);
    // The Rivals come back with their people, because the browser passes the content
    // exactly as the CLI does (DL-21 §13, DL-22 §7).
    expect(loaded.career.rivals.length).toBeGreaterThan(0);
    for (const rival of loaded.career.rivals) {
      expect(rival.roster.length, `${rival.name} came back with nobody`).toBeGreaterThan(0);
    }
  });

  it('goes on playing identically on either side', () => {
    const store: KeyValueStore = memoryStore();
    store.setItem(careerKey('1'), file.career);
    const storage = createCareerStorage(store);
    const loaded = storage.load('1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const inTheBrowser = advance(loaded.career, 40, content);
    const inTheTerminal = advance(loadSlot(dir, 'one', content).career, 40, content);
    expect(serialiseCareer(inTheBrowser.career)).toBe(serialiseCareer(inTheTerminal.career));
    expect(inTheBrowser.events).toEqual(inTheTerminal.events);
  });
});

describe('a Career the browser wrote, opened in the CLI', () => {
  const career = played('interop-web-to-cli');
  const store: KeyValueStore = memoryStore();
  const storage = createCareerStorage(store);
  const written = storage.save('2', career, '2026-09-20T09:00:00.000Z');
  const document = store.getItem(careerKey('2')) ?? '';

  it('is written under heroesim.career.<slot>, as the exact serialised string', () => {
    expect(written.ok, written.message).toBe(true);
    expect(document).toBe(serialiseCareer(career));
  });

  it('loads in the CLI as a bare pre-E7 save, with an empty history', () => {
    const dir = join(workspace, 'from-web');
    mkdirSync(dir, { recursive: true });
    const path = slotPath(dir, 'one');
    // What a player dropping the browser's string into `.career/one.json` hands the CLI.
    writeFileSync(path, document, 'utf8');

    const loaded = loadSlot(dir, 'one', content);
    expect(serialiseCareer(loaded.career)).toBe(document);
    expect(loaded.history).toEqual([]);
    // And reading it changes nothing on disk (DL-25 §10): there is no migration.
    expect(readFileSync(path, 'utf8')).toBe(document);
  });

  it('is then saved back in the CLI own shape without re-encoding the Career', () => {
    const dir = join(workspace, 'round-trip');
    const path = saveSlot(dir, 'one', career, [], '2026-09-20T09:00:00.000Z');
    const file = JSON.parse(readFileSync(path, 'utf8')) as { career: string };
    expect(file.career).toBe(document);
  });
});
