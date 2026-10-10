import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// The browser specs, at a phone's, a tablet's and a desktop's width (DL-103). CI runs them too, in
// check.yml's `e2e` job and before every deploy (DL-124, superseding INPUTS 7.10's "local only").
// `npm run e2e -w web` builds first, then runs these specs against the built bundle, never the dev
// server.
//
// Every test opens its own page and game and shares no state, so the tests of a file run in
// parallel as well as the files, and CI's runner, which Playwright's default gives one worker,
// runs two (DL-249, DL-231 Q29). A test whose logic Vitest holds, kept for what only a browser
// shows at one width, is tagged `@one-width` and runs at the desktop's only.

const webDir = path.dirname(fileURLToPath(import.meta.url));
// npm's `-w` resolves only from the workspace root, so the preview server starts there.
const repoRoot = path.resolve(webDir, '..');

const builtPage = path.join(webDir, 'dist', 'index.html');
if (!existsSync(builtPage)) {
  throw new Error(
    `The browser specs need a built bundle, and ${builtPage} is missing.\n` +
      'Run "npm run e2e -w web", which builds first.',
  );
}

/** The spec that opens the built page from the filesystem and sees its pictures load. */
const fileSpec = /file\.spec\.ts$/;
/** The tests run at the desktop's width alone. */
const oneWidth = /@one-width/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  ...(process.env['CI'] ? { workers: 2 } : {}),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'npm run preview -w web -- --port 4173 --strictPort',
    cwd: repoRoot,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
  // Chromium at a phone's width, a tablet's and a desktop's (DL-103): the bottom bar under 600px,
  // the side rail from 600px, and the History rail beside the view from 1100px. The page opened from
  // the filesystem, seeing its pictures load, is a project of its own, once (DL-129):
  // e2e/file.spec.ts opens the built page over file:// and sees the owner's pictures and the
  // Silhouettes load (DL-131).
  projects: [
    {
      name: 'phone',
      testIgnore: fileSpec,
      grepInvert: oneWidth,
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } },
    },
    {
      name: 'tablet',
      testIgnore: fileSpec,
      grepInvert: oneWidth,
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } },
    },
    {
      name: 'desktop',
      testIgnore: fileSpec,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'file',
      testMatch: fileSpec,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
