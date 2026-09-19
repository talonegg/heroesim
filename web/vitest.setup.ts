import '@testing-library/jest-dom/vitest';

/**
 * jsdom in this environment exposes a `localStorage` that is an empty object rather than
 * a Storage, so a test could neither set up a slot nor prove the browser path. Put a
 * real in-memory Storage in its place when that happens — the private-browsing path,
 * where `localStorage` genuinely throws, is covered explicitly in `tests/storage.test.ts`
 * by passing `null` to `createCareerStorage`.
 */
function usable(candidate: unknown): boolean {
  try {
    const store = candidate as Storage | undefined;
    if (!store || typeof store.setItem !== 'function' || typeof store.clear !== 'function') {
      return false;
    }
    store.setItem('heroesim.setup.probe', '1');
    store.removeItem('heroesim.setup.probe');
    return true;
  } catch {
    return false;
  }
}

if (!usable(globalThis.localStorage)) {
  const held = new Map<string, string>();
  const shim = {
    get length(): number {
      return held.size;
    },
    clear(): void {
      held.clear();
    },
    getItem(key: string): string | null {
      return held.get(key) ?? null;
    },
    key(index: number): string | null {
      return [...held.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      held.delete(key);
    },
    setItem(key: string, value: string): void {
      held.set(key, String(value));
    },
  } as unknown as Storage;

  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    configurable: true,
    writable: true,
  });
}
