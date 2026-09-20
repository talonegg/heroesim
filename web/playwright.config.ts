import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// npm's `-w` workspace resolution only works from at or above the workspaces
// root — running it from inside web/ itself (this config's default cwd)
// fails with "No workspaces found". Point the webServer command at the repo
// root instead so `npm run preview -w web` resolves as intended.
const webDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webDir, '..');

// The suite runs against the BUILT bundle, never the dev server: the production
// build is what E8-S5 has to prove. Fail loudly here rather than letting
// `vite preview` start and serve nothing (E8-S5: "fails, not skips").
const builtPage = path.join(webDir, 'dist', 'index.html');
if (!existsSync(builtPage)) {
  throw new Error(
    `Heroesim browser tests need a built bundle, and ${builtPage} is missing.\n` +
      'Run "npm run build" from the repository root first, then "npm run e2e".',
  );
}

export default defineConfig({
  testDir: './e2e',
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
  // All three projects run on Chromium: the owner's requirement is Chrome-engine
  // testing, so the tablet is an iPad-class viewport on Chromium rather than
  // WebKit (DL-10, superseding DL-04's "iPad Mini").
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
