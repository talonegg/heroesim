// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';

// The deploy runs when Node runs web/scripts/deploy.mjs, and never when a module imports it
// (DL-94 item 2): src/deploy.test.ts imports it, and so does playwright.live.config.ts,
// for the addresses. Under `npm test` an import sees no arguments and npm's own environment, so
// on a clean checkout of a release tag a deploy run by an import would pass the guard, build and
// upload to both hosts (DL-97). Here `spawnSync`, the script's one way to git, npm and
// wrangler, throws if called at all.

afterEach(() => {
  vi.doUnmock('node:child_process');
  vi.resetModules();
});

test('importing the deploy script, or the live configuration that reads its addresses, runs nothing', async () => {
  vi.resetModules();
  const spawnSync = vi.fn(() => {
    throw new Error('the deploy ran on import');
  });
  vi.doMock('node:child_process', () => ({ spawnSync }));

  await import('../scripts/deploy.mjs');
  await import('../playwright.live.config');

  expect(spawnSync).not.toHaveBeenCalled();
});
