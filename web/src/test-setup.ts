// The page's tests share one browser storage per file (jsdom's): the open view the page remembers
// there (DL-103) is forgotten after each test, so each opens as a fresh browser would. A file
// that runs in Node has no page and no storage of its own: Node's own `localStorage`, read, only warns
// that it has no file.

import { afterEach } from 'vitest';

afterEach(() => {
  if (typeof window === 'undefined') return;
  try {
    globalThis.localStorage?.clear();
  } catch {
    // No storage to clear.
  }
});
