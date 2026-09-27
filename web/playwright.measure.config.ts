import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The measure of a twenty-year save through IndexedDB (M7-S4's first box, DL-67): `npm run measure
// -w web`, after `npm run harness:sample`. Kept out of `npm run e2e`, which needs no sample and stays
// quick. It measures and reports; it fails only when the round trip changes the game, never on a time
// (data-model §7: targets are recorded, not chased, DL-08). Desktop Chromium only: the viewport has no
// bearing on storage.

export default defineConfig({
  ...base,
  testMatch: '**/*.measure.ts',
  reporter: [['list']],
  projects: (base.projects ?? []).filter((project) => project.name === 'desktop'),
});
