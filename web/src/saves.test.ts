// @vitest-environment node
import type { WorldDocument } from '@heroesim/engine';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test, vi } from 'vitest';
import {
  browserSaves,
  createSaves,
  savesDatabase,
  savesFailureSentence,
  type BrowserScope,
  type SavesFailure,
} from './saves';
import { memoryStore } from './saves.test-support';
import { saveText } from './state/game-file';
import { played, started } from './state/game.test-support';
import { initialGameState } from './state/reducer';

// Saves kept in the browser (DL-67): the game's save text, the CLI's canonical JSON,
// compressed with gzip into a Blob in IndexedDB, and read back, exported and imported as that text.
// Node has no IndexedDB, so the saves are tested here over a store that stands in for it, their
// IndexedDB adapter over a stand-in for the browser's factory whose transactions commit when the test
// says (DL-74), and IndexedDB itself in Playwright; the ways IndexedDB is unavailable are tested here
// with the browser's own failures stood in for.

const savedAt = '2026-09-27T10:00:00.000Z';
const now = (): Date => new Date(savedAt);

function documentOf(state: { document: WorldDocument | null }): WorldDocument {
  if (state.document === null) throw new Error('no game in hand');
  return state.document;
}

/** A game some Turns in, its names beyond ASCII, so its UTF-8 bytes are not its characters. */
function aGame(): WorldDocument {
  const state = played(initialGameState, {
    kind: 'newGame',
    seed: 'saves-test',
    guildName: 'Ælfwine’s Lantern ☾',
    guildmasterName: 'Zoë Ó Briain',
    createdAt: '2026-09-27T09:00:00.000Z',
  });
  return documentOf(played(state, { kind: 'advance', turns: 12 }));
}

function kept() {
  const store = memoryStore();
  return { store, saves: createSaves(async () => store, { now }) };
}

describe('saves kept in the browser', () => {
  test("save compresses the game's save text with gzip into a Blob, under its name, with when it was saved", async () => {
    const { store, saves } = kept();
    const document = aGame();

    const result = await saves.save('  first game ', document);

    const record = store.records.get('first game');
    if (record === undefined) throw new Error('nothing stored');
    expect(record.name).toBe('first game');
    expect(record.savedAt).toBe(savedAt);
    expect(record.data).toBeInstanceOf(Blob);
    const stored = Buffer.from(await record.data.arrayBuffer());
    expect([...stored.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    expect(gunzipSync(stored).toString('utf8')).toBe(saveText(document));
    expect(result).toEqual({ ok: true, value: { name: 'first game', savedAt, bytes: record.data.size } });
    expect(record.data.size).toBeLessThan(Buffer.byteLength(saveText(document)) / 4);
  });

  test("load gives back the save's text, which the reducer's load play reads as the same game", async () => {
    const { saves } = kept();
    const document = aGame();
    await saves.save('first game', document);

    const loaded = await saves.load('first game');

    expect(loaded).toEqual({ ok: true, value: saveText(document) });
    const state = played(initialGameState, { kind: 'load', text: loaded.ok ? loaded.value : '' });
    expect(state.rejection).toBeNull();
    expect(saveText(documentOf(state))).toBe(saveText(document));
  });

  test('export is the file the CLI reads: the uncompressed save, byte-identical to serialise(document)', async () => {
    const { saves } = kept();
    const document = aGame();
    await saves.save('first game', document);

    const exported = await saves.export('first game');

    if (!exported.ok) throw new Error(savesFailureSentence(exported.failure));
    const file = exported.value;
    expect(file.name).toBe('first game.json');
    expect(file.type).toBe('application/json');
    // saveText is serialise, byte for byte (state/game-file.test.ts).
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new TextEncoder().encode(saveText(document)));
  });

  test("export names the file after the save, in characters any file system takes, and never '.json.json'", async () => {
    const { saves } = kept();
    const document = aGame();
    await saves.save('a/b: "c"?', document);
    await saves.save('ready.json', document);

    const odd = await saves.export('a/b: "c"?');
    const suffixed = await saves.export('ready.json');

    expect(odd.ok && odd.value.name).toBe('a-b- -c-.json');
    expect(suffixed.ok && suffixed.value.name).toBe('ready.json');
  });

  test('list names every save, newest first, with its compressed size; saving under a name kept replaces it', async () => {
    const store = memoryStore();
    let clock = Date.parse(savedAt);
    const saves = createSaves(async () => store, { now: () => new Date((clock += 60_000)) });
    const early = documentOf(started('early'));
    const later = aGame();

    await saves.save('one', early);
    await saves.save('two', early);
    await saves.save('one', later);
    const listed = await saves.list();

    if (!listed.ok) throw new Error(savesFailureSentence(listed.failure));
    expect(listed.value.map(({ name, savedAt: at }) => [name, at])).toEqual([
      ['one', new Date(Date.parse(savedAt) + 180_000).toISOString()],
      ['two', new Date(Date.parse(savedAt) + 120_000).toISOString()],
    ]);
    expect(listed.value[0]?.bytes).toBe(store.records.get('one')?.data.size);
    const one = await saves.load('one');
    expect(one.ok && one.value).toBe(saveText(later));
  });

  test('remove deletes a save', async () => {
    const { store, saves } = kept();
    await saves.save('first game', aGame());

    expect(await saves.remove('first game')).toEqual({ ok: true, value: undefined });

    expect(store.records.size).toBe(0);
    expect(await saves.list()).toEqual({ ok: true, value: [] });
  });

  test('a name with no save is missing, for load, export and remove', async () => {
    const { saves } = kept();
    const missing: SavesFailure = { kind: 'missing', name: 'nothing here' };

    expect(await saves.load('nothing here')).toEqual({ ok: false, failure: missing });
    expect(await saves.export('nothing here')).toEqual({ ok: false, failure: missing });
    expect(await saves.remove('nothing here')).toEqual({ ok: false, failure: missing });
  });

  test('a blank name is refused, and nothing is stored', async () => {
    const { store, saves } = kept();

    expect(await saves.save('   ', aGame())).toEqual({ ok: false, failure: { kind: 'name-blank' } });
    expect(store.records.size).toBe(0);
  });

  test('a write the browser refuses, as a full disk is, is a failure with its words, never a throw', async () => {
    const full = new Error('The quota has been exceeded.');
    full.name = 'QuotaExceededError';
    const saves = createSaves(async () => memoryStore({ refuse: full }), { now });

    expect(await saves.save('first game', aGame())).toEqual({
      ok: false,
      failure: { kind: 'failed', message: 'QuotaExceededError: The quota has been exceeded.' },
    });
  });

  test('a stored save that is not gzip fails to load or export, never throws', async () => {
    const { store, saves } = kept();
    store.records.set('broken', { name: 'broken', savedAt, data: new Blob(['{"not":"gzip"}']) });

    const loaded = await saves.load('broken');
    const exported = await saves.export('broken');

    expect(loaded.ok).toBe(false);
    expect(!loaded.ok && loaded.failure.kind).toBe('failed');
    expect(!exported.ok && exported.failure.kind).toBe('failed');
  });

  test("import reads a save file's text for the reducer's load play, whether saves can be kept or not", async () => {
    const text = saveText(aGame());
    const file = new File([text], 'from-the-cli.json', { type: 'application/json' });

    expect(await kept().saves.import(file)).toEqual({ ok: true, value: text });
    expect(await browserSaves({}).import(file)).toEqual({ ok: true, value: text });
  });
});

describe('when IndexedDB is unavailable, the page runs without saving', () => {
  const streams = { CompressionStream, DecompressionStream };

  async function everyCallRefused(saves: ReturnType<typeof browserSaves>): Promise<SavesFailure[]> {
    const outcomes = [
      await saves.list(),
      await saves.save('first game', aGame()),
      await saves.load('first game'),
      await saves.export('first game'),
      await saves.remove('first game'),
    ];
    return outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome.failure]));
  }

  test('with no IndexedDB at all it is known at once, and every call is refused as unavailable', async () => {
    const saves = browserSaves({ ...streams });

    expect(saves.unavailable).toEqual({ kind: 'unavailable', message: 'this browser has no IndexedDB' });
    const failures = await everyCallRefused(saves);
    expect(failures).toHaveLength(5);
    for (const failure of failures) expect(failure).toEqual(saves.unavailable);
  });

  test('where reading indexedDB throws, as a browser denying storage does, it is known at once', async () => {
    const scope: BrowserScope = {
      ...streams,
      get indexedDB(): IDBFactory {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    };
    const saves = browserSaves(scope);

    expect(saves.unavailable).toEqual({ kind: 'unavailable', message: 'SecurityError: The operation is insecure.' });
    expect(await everyCallRefused(saves)).toHaveLength(5);
  });

  test('with no CompressionStream it is known at once', () => {
    const saves = browserSaves({ indexedDB: {} as IDBFactory, DecompressionStream });

    expect(saves.unavailable).toEqual({ kind: 'unavailable', message: 'this browser cannot compress a save (no CompressionStream)' });
  });

  test(`where opening ${savesDatabase} throws, as it does in a sandboxed page, every call is refused as unavailable`, async () => {
    let opened = 0;
    const indexedDB = {
      open: () => {
        opened += 1;
        throw new DOMException('access to the Indexed Database API is denied in this context.', 'SecurityError');
      },
    } as unknown as IDBFactory;
    const saves = browserSaves({ ...streams, indexedDB });

    expect(saves.unavailable).toBeNull();
    const failures = await everyCallRefused(saves);
    expect(failures).toHaveLength(5);
    for (const failure of failures) {
      expect(failure).toEqual({ kind: 'unavailable', message: 'SecurityError: access to the Indexed Database API is denied in this context.' });
    }
    expect(opened).toBe(1);
  });

  test('where the open request fails, as in a private window, every call is refused as unavailable', async () => {
    const indexedDB = {
      open: (name: string) => {
        expect(name).toBe(savesDatabase);
        const request: { error: DOMException | null; onerror: ((event: Event) => void) | null } = { error: null, onerror: null };
        queueMicrotask(() => {
          request.error = new DOMException('A mutation operation was attempted on a database that did not allow mutations.', 'InvalidStateError');
          request.onerror?.(new Event('error'));
        });
        return request;
      },
    } as unknown as IDBFactory;
    const saves = browserSaves({ ...streams, indexedDB });

    const failures = await everyCallRefused(saves);

    expect(failures).toHaveLength(5);
    expect(failures[0]).toEqual({
      kind: 'unavailable',
      message: 'InvalidStateError: A mutation operation was attempted on a database that did not allow mutations.',
    });
  });
});

// ── IndexedDB's own adapter, over a stand-in for the browser's ────────────────────────────────

/**
 * A stand-in for the browser's IndexedDB, as far as `saves.ts` uses it: `open` with an upgrade the
 * first time, one object store, requests that succeed on the next microtask, and read-write
 * transactions that commit, or abort, only when the test says. A write is staged in its
 * transaction and reaches the store only on commit, as IndexedDB's does.
 */
function standInIndexedDb() {
  const records = new Map<string, unknown>();
  const stores: { name: string; keyPath: unknown }[] = [];
  const writes: { commit: () => void; abort: (error: DOMException) => void }[] = [];

  function request<T>(result: () => T): IDBRequest<T> {
    const pending = { result: undefined as T | undefined, error: null, onsuccess: null as ((event: Event) => void) | null, onerror: null };
    queueMicrotask(() => {
      pending.result = result();
      pending.onsuccess?.(new Event('success'));
    });
    return pending as unknown as IDBRequest<T>;
  }

  const database = {
    objectStoreNames: { contains: (name: string) => stores.some((store) => store.name === name) },
    createObjectStore: (name: string, options: { keyPath: unknown }) => {
      stores.push({ name, keyPath: options.keyPath });
    },
    transaction: (_name: string, mode: IDBTransactionMode) => {
      const staged: (() => void)[] = [];
      const transaction = {
        error: null as DOMException | null,
        oncomplete: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: () => ({
          put: (record: { name: string }) => {
            staged.push(() => records.set(record.name, record));
            return request(() => record.name);
          },
          delete: (name: string) => {
            staged.push(() => records.delete(name));
            return request(() => undefined);
          },
          get: (name: string) => request(() => records.get(name)),
          getAll: () => request(() => [...records.values()]),
        }),
      };
      if (mode === 'readwrite') {
        writes.push({
          commit: () => {
            for (const write of staged) write();
            transaction.oncomplete?.(new Event('complete'));
          },
          abort: (error) => {
            transaction.error = error;
            transaction.onabort?.(new Event('abort'));
          },
        });
      }
      return transaction;
    },
  };

  const indexedDB = {
    open: (name: string, version: number) => {
      const opening = {
        result: database,
        error: null,
        onupgradeneeded: null as ((event: Event) => void) | null,
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null,
      };
      queueMicrotask(() => {
        expect({ name, version }).toEqual({ name: savesDatabase, version: 1 });
        if (stores.length === 0) opening.onupgradeneeded?.(new Event('upgradeneeded'));
        opening.onsuccess?.(new Event('success'));
      });
      return opening;
    },
  } as unknown as IDBFactory;

  return { indexedDB, records, stores, writes };
}

/** Whether `promise` has settled, without waiting for it. */
function watched<T>(promise: Promise<T>): { settled: () => boolean; promise: Promise<T> } {
  let settled = false;
  void promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  return { settled: () => settled, promise };
}

/** Lets every task queued now run: compression, the stand-in's requests. */
async function tasksRun(): Promise<void> {
  for (let round = 0; round < 5; round += 1) await new Promise((resolve) => setTimeout(resolve, 5));
}

describe("IndexedDB's own adapter (DL-67 item 1)", () => {
  const streams = { CompressionStream, DecompressionStream };

  test('makes one object store keyed by the save’s name, and reads back what it kept', async () => {
    const idb = standInIndexedDb();
    const saves = browserSaves({ ...streams, indexedDB: idb.indexedDB });
    const document = aGame();

    const saving = saves.save('first game', document);
    await vi.waitFor(() => expect(idb.writes).toHaveLength(1));
    idb.writes[0]?.commit();

    expect(await saving).toMatchObject({ ok: true, value: { name: 'first game' } });
    expect(idb.stores).toEqual([{ name: 'saves', keyPath: 'name' }]);
    expect([...idb.records.keys()]).toEqual(['first game']);
    expect(await saves.load('first game')).toEqual({ ok: true, value: saveText(document) });
    expect(await saves.list()).toMatchObject({ ok: true, value: [{ name: 'first game' }] });
  });

  test('reports a save kept only once its transaction has committed', async () => {
    const idb = standInIndexedDb();
    const saves = browserSaves({ ...streams, indexedDB: idb.indexedDB });

    const saving = watched(saves.save('first game', aGame()));
    await vi.waitFor(() => expect(idb.writes).toHaveLength(1));
    await tasksRun();

    expect(saving.settled()).toBe(false);
    expect(idb.records.size).toBe(0);
    idb.writes[0]?.commit();
    expect(await saving.promise).toMatchObject({ ok: true });
    expect(idb.records.size).toBe(1);
  });

  test('a write the browser abandons at commit, as a full disk does, is a failure with its words, and nothing is kept', async () => {
    const idb = standInIndexedDb();
    const saves = browserSaves({ ...streams, indexedDB: idb.indexedDB });

    const saving = saves.save('first game', aGame());
    await vi.waitFor(() => expect(idb.writes).toHaveLength(1));
    idb.writes[0]?.abort(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));

    expect(await saving).toEqual({ ok: false, failure: { kind: 'failed', message: 'QuotaExceededError: The quota has been exceeded.' } });
    expect(await saves.list()).toEqual({ ok: true, value: [] });
  });

  test('deletes a save only once its transaction has committed', async () => {
    const idb = standInIndexedDb();
    const saves = browserSaves({ ...streams, indexedDB: idb.indexedDB });
    const saving = saves.save('first game', aGame());
    await vi.waitFor(() => expect(idb.writes).toHaveLength(1));
    idb.writes[0]?.commit();
    await saving;

    const removing = watched(saves.remove('first game'));
    await vi.waitFor(() => expect(idb.writes).toHaveLength(2));
    await tasksRun();
    expect(removing.settled()).toBe(false);
    idb.writes[1]?.commit();

    expect(await removing.promise).toEqual({ ok: true, value: undefined });
    expect(idb.records.size).toBe(0);
  });
});

describe('the failures in words', () => {
  test('every kind of failure is a sentence', () => {
    const failures: { [Kind in SavesFailure['kind']]: Extract<SavesFailure, { kind: Kind }> } = {
      unavailable: { kind: 'unavailable', message: 'this browser has no IndexedDB' },
      'name-blank': { kind: 'name-blank' },
      missing: { kind: 'missing', name: 'first game' },
      failed: { kind: 'failed', message: 'QuotaExceededError: The quota has been exceeded.' },
    };

    const sentences = Object.values(failures).map(savesFailureSentence);

    for (const sentence of sentences) expect(sentence).toMatch(/^[A-Z].+\.$/);
    expect(sentences).toEqual([
      'This browser will not keep saves for this page, as in a private window or with site data blocked (this browser has no IndexedDB). The game plays on; export it to keep it.',
      'A save needs a name.',
      'There is no save named “first game” in this browser.',
      'The browser could not do it: QuotaExceededError: The quota has been exceeded.',
    ]);
  });
});
