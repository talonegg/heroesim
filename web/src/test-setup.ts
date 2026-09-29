// The page's tests share one browser storage per file (jsdom's): the open view the page remembers
// there (M9-S3, DL-103) is forgotten after each test, so each opens as a fresh browser would.

import { afterEach } from 'vitest';

afterEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    // No storage to clear.
  }
});
