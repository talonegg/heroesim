import { defineConfig, devices } from '@playwright/test';

// The deployed page (M7-S5's first box, DL-75): `npm run e2e:live -w web`, after `npm run deploy`.
// Kept out of `npm run e2e`, which never needs the network: this reads the production URL
// (INPUTS 7.8), never a local server, at a phone's width and a desktop's.

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.live.ts',
  reporter: [['list']],
  use: { baseURL: 'https://heroesims.pages.dev' },
  projects: [
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
