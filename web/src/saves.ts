// Saves kept in the browser (M7-S4, DL-67). A save is the game's save text, the canonical JSON the
// CLI writes (`saveText`, the engine's `serialise`), compressed with `CompressionStream("gzip")` into
// a Blob and kept in IndexedDB, in the database `heroesim.saves`, under a name the player gives.
// `load` gives the text back, which the reducer's `load` play reads with `deserialise` under the
// engine's own config, exactly as it reads a file (DL-20, DL-65). `export` gives the uncompressed
// text as the file the CLI reads, byte for byte; `import` reads such a file for that same play.
//
// A browser may keep nothing for the page: a private window, site data blocked, a sandboxed frame.
// Every call then answers with the typed failure `unavailable`, never a throw, and the page plays on
// without saving (the epic's §3 risk). Where that is plain at once, `unavailable` says so before any
// call; where it shows only when the database is opened, the first call finds it.

import type { WorldDocument } from '@heroesim/engine';
import { saveText } from './state/game-file';

/** The IndexedDB database the saves are kept in. */
export const savesDatabase = 'heroesim.saves';

/** Its one object store, keyed by the save's name. */
const storeName = 'saves';

/** A save as IndexedDB keeps it. */
export interface SaveRecord {
  name: string;
  /** When it was saved, by the browser's clock, as an ISO string; never read by a rule. */
  savedAt: string;
  /** The save's text, compressed with gzip. */
  data: Blob;
}

/** A save as the page lists it. */
export interface SaveSummary {
  name: string;
  savedAt: string;
  /** Its compressed size in bytes: what it takes of the browser's storage. */
  bytes: number;
}

/** Why a call on the saves did not do what it was asked. */
export type SavesFailure =
  /** The browser keeps nothing for this page; `message` is its reason, in its words. */
  | { kind: 'unavailable'; message: string }
  | { kind: 'name-blank' }
  | { kind: 'missing'; name: string }
  /** The browser refused a read or a write that should have worked: storage full, a save damaged. */
  | { kind: 'failed'; message: string };

export type SavesOutcome<T> = { ok: true; value: T } | { ok: false; failure: SavesFailure };

/** Where saves are kept: IndexedDB in the page, a map in a test (`saves.test-support.ts`). */
export interface SaveStore {
  put(record: SaveRecord): Promise<void>;
  get(name: string): Promise<SaveRecord | undefined>;
  all(): Promise<SaveRecord[]>;
  delete(name: string): Promise<void>;
}

export interface Saves {
  /** Known before any call: the browser keeps nothing for this page. `null` when it may. */
  readonly unavailable: SavesFailure | null;
  /** Every save kept, newest first. */
  list(): Promise<SavesOutcome<SaveSummary[]>>;
  /** Keeps `document` under `name`, trimmed, in place of any save of that name. */
  save(name: string, document: WorldDocument): Promise<SavesOutcome<SaveSummary>>;
  /** The save's text, uncompressed, for the reducer's `load` play. */
  load(name: string): Promise<SavesOutcome<string>>;
  /** The save as the file the CLI reads: its text, uncompressed, named after it. */
  export(name: string): Promise<SavesOutcome<File>>;
  /** A save file's text, the CLI's or one exported here, for the reducer's `load` play. */
  import(file: Blob): Promise<SavesOutcome<string>>;
  remove(name: string): Promise<SavesOutcome<void>>;
}

// ── Compression ──────────────────────────────────────────────────────────────────────────────

/** `text` as UTF-8, compressed with gzip, as a Blob. */
async function compressed(text: string): Promise<Blob> {
  const stream = new Response(text).body;
  if (stream === null) throw new Error('the save text gave no stream');
  return new Response(stream.pipeThrough(new CompressionStream('gzip'))).blob();
}

/** The text `data` holds, gzip-compressed UTF-8. Read as bytes first: a Blob's own `stream()` is not everywhere. */
async function decompressed(data: Blob): Promise<string> {
  const stream = new Response(await data.arrayBuffer()).body;
  if (stream === null) throw new Error('the save gave no stream');
  return new Response(stream.pipeThrough(new DecompressionStream('gzip'))).text();
}

// ── The saves over a store ───────────────────────────────────────────────────────────────────

/** An error's words, with its name when it has one: `QuotaExceededError: The quota has been exceeded.` */
function wordsOf(error: unknown): string {
  if (error instanceof Error || error instanceof DOMException) {
    return error.name === '' || error.name === 'Error' ? error.message : `${error.name}: ${error.message}`;
  }
  return String(error);
}

/** The file name an export of `name` is given: characters any file system takes, ending `.json` once. */
function exportFileName(name: string): string {
  const base = name.replace(/\.json$/i, '').replace(/[\\/:*?"<>|]+/g, '-');
  // Control characters too, which no file system takes in a name.
  return `${[...base].map((character) => (character.charCodeAt(0) < 0x20 ? '-' : character)).join('')}.json`;
}

function summaryOf({ name, savedAt, data }: SaveRecord): SaveSummary {
  return { name, savedAt, bytes: data.size };
}

const unavailableOutcome = (failure: SavesFailure): { ok: false; failure: SavesFailure } => ({ ok: false, failure });

/**
 * The saves kept in the store `open` opens, once, on the first call that needs it. A store that
 * cannot be opened makes every call `unavailable`; a store that refuses a read or a write makes
 * that call `failed`. Nothing throws.
 */
export function createSaves(
  open: () => Promise<SaveStore>,
  { now = () => new Date(), unavailable = null }: { now?: () => Date; unavailable?: SavesFailure | null } = {},
): Saves {
  let opening: Promise<SavesOutcome<SaveStore>> | null = null;
  function store(): Promise<SavesOutcome<SaveStore>> {
    if (unavailable !== null) return Promise.resolve(unavailableOutcome(unavailable));
    opening ??= open().then(
      (value): SavesOutcome<SaveStore> => ({ ok: true, value }),
      (error: unknown) => unavailableOutcome({ kind: 'unavailable', message: wordsOf(error) }),
    );
    return opening;
  }

  /** Runs `task` on the store, its failures typed: `unavailable` if it will not open, `failed` if it refuses. */
  async function withStore<T>(task: (opened: SaveStore) => Promise<SavesOutcome<T>>): Promise<SavesOutcome<T>> {
    const opened = await store();
    if (!opened.ok) return opened;
    try {
      return await task(opened.value);
    } catch (error) {
      return { ok: false, failure: { kind: 'failed', message: wordsOf(error) } };
    }
  }

  /** The save named `name`, uncompressed. */
  function textOf(name: string): Promise<SavesOutcome<string>> {
    return withStore(async (opened) => {
      const record = await opened.get(name);
      if (record === undefined) return { ok: false, failure: { kind: 'missing', name } };
      return { ok: true, value: await decompressed(record.data) };
    });
  }

  return {
    unavailable,
    list: () =>
      withStore(async (opened) => {
        const summaries = (await opened.all()).map(summaryOf);
        summaries.sort((a, b) => (a.savedAt === b.savedAt ? (a.name < b.name ? -1 : 1) : a.savedAt < b.savedAt ? 1 : -1));
        return { ok: true, value: summaries };
      }),
    save: (name, document) =>
      withStore(async (opened) => {
        const trimmed = name.trim();
        if (trimmed === '') return { ok: false, failure: { kind: 'name-blank' } };
        const record: SaveRecord = { name: trimmed, savedAt: now().toISOString(), data: await compressed(saveText(document)) };
        await opened.put(record);
        return { ok: true, value: summaryOf(record) };
      }),
    load: textOf,
    export: async (name) => {
      const text = await textOf(name);
      if (!text.ok) return text;
      return { ok: true, value: new File([text.value], exportFileName(name), { type: 'application/json' }) };
    },
    import: async (file) => {
      try {
        return { ok: true, value: await file.text() };
      } catch (error) {
        return { ok: false, failure: { kind: 'failed', message: wordsOf(error) } };
      }
    },
    remove: (name) =>
      withStore(async (opened) => {
        if ((await opened.get(name)) === undefined) return { ok: false, failure: { kind: 'missing', name } };
        await opened.delete(name);
        return { ok: true, value: undefined };
      }),
  };
}

// ── IndexedDB ────────────────────────────────────────────────────────────────────────────────

/** A request's result, or its error. */
function requested<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB refused the request'));
  });
}

/** Settles when `transaction` has committed, so a write is kept before it is reported kept. */
function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB refused the write'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB abandoned the write'));
  });
}

/** Opens `heroesim.saves`, making its store the first time. Throws, or rejects, where the browser will not. */
function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(savesDatabase, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: 'name' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB would not open ${savesDatabase}`));
  });
}

/** The saves' object store in an open database. */
function indexedDbStore(database: IDBDatabase): SaveStore {
  const reading = () => database.transaction(storeName, 'readonly').objectStore(storeName);
  async function write(change: (store: IDBObjectStore) => void): Promise<void> {
    const transaction = database.transaction(storeName, 'readwrite');
    const done = committed(transaction);
    change(transaction.objectStore(storeName));
    await done;
  }
  return {
    put: (record) => write((store) => store.put(record)),
    get: async (name) => (await requested(reading().get(name))) as SaveRecord | undefined,
    all: async () => (await requested(reading().getAll())) as SaveRecord[],
    delete: (name) => write((store) => store.delete(name)),
  };
}

/** What the saves need of the browser: `globalThis` in the page, a stand-in in a test. */
export interface BrowserScope {
  indexedDB?: IDBFactory;
  CompressionStream?: unknown;
  DecompressionStream?: unknown;
}

/** Why saves cannot be kept, if that is plain before opening anything; otherwise the database factory. */
function factoryIn(scope: BrowserScope): { factory: IDBFactory } | { unavailable: SavesFailure } {
  let factory: IDBFactory | undefined;
  try {
    // Reading it can throw where the browser denies the page storage.
    factory = scope.indexedDB;
  } catch (error) {
    return { unavailable: { kind: 'unavailable', message: wordsOf(error) } };
  }
  if (factory === undefined || factory === null) return { unavailable: { kind: 'unavailable', message: 'this browser has no IndexedDB' } };
  if (typeof scope.CompressionStream !== 'function' || typeof scope.DecompressionStream !== 'function') {
    return { unavailable: { kind: 'unavailable', message: 'this browser cannot compress a save (no CompressionStream)' } };
  }
  return { factory };
}

/** The saves this browser keeps for the page, in IndexedDB; `unavailable` where it keeps none. */
export function browserSaves(scope: BrowserScope = globalThis): Saves {
  const found = factoryIn(scope);
  if ('unavailable' in found) return createSaves(() => Promise.reject(new Error(savesFailureSentence(found.unavailable))), found);
  const { factory } = found;
  return createSaves(async () => indexedDbStore(await openDatabase(factory)));
}

// ── Words ────────────────────────────────────────────────────────────────────────────────────

/** A failure as the page says it. */
export function savesFailureSentence(failure: SavesFailure): string {
  switch (failure.kind) {
    case 'unavailable':
      return (
        'This browser will not keep saves for this page, as in a private window or with site data blocked ' +
        `(${failure.message.replace(/\.$/, '')}). The game plays on; export it to keep it.`
      );
    case 'name-blank':
      return 'A save needs a name.';
    case 'missing':
      return `There is no save named “${failure.name}” in this browser.`;
    case 'failed':
      return `The browser could not do it: ${failure.message}${/[.!?]$/.test(failure.message) ? '' : '.'}`;
  }
}
