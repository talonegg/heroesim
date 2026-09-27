import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Harvested from v1 (feature/poc, E8-S5) and trimmed to v2's two widths (M7-S1; the journeys are
// M7-S4's). Local only: CI runs no browser (INPUTS 7.10). `npm run e2e -w web` builds first, then
// runs these specs against the built bundle, never the dev server.

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
  // Chromium at a phone's width and a desktop's (M7-S3, M7-S4).
  projects: [
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
