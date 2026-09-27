// A store that stands in for IndexedDB in the page's tests (M7-S4, DL-67): Node and jsdom have no
// IndexedDB, and the page takes no dependency to fake one, so `saves.ts` is tested over this map
// and over IndexedDB itself in Playwright (`e2e/journey.spec.ts`). Never imported by the page, so
// never bundled.

import type { SaveRecord, SaveStore } from './saves';

export interface MemoryStore extends SaveStore {
  /** What the store holds, by name, as IndexedDB would hold it. */
  readonly records: Map<string, SaveRecord>;
}

/** An empty store, or one whose writes are refused with `refuse` as a full disk's are. */
export function memoryStore({ refuse }: { refuse?: Error } = {}): MemoryStore {
  const records = new Map<string, SaveRecord>();
  return {
    records,
    put: async (record) => {
      if (refuse !== undefined) throw refuse;
      records.set(record.name, record);
    },
    get: async (name) => records.get(name),
    all: async () => [...records.values()],
    delete: async (name) => {
      records.delete(name);
    },
  };
}
