import { defineConfig, devices } from '@playwright/test';
import { addresses } from './scripts/deploy.mjs';

// The deployed page (DL-75; both addresses, DL-94):
// `npm run e2e:live -w web`, after `npm run deploy`. Kept out of `npm run e2e`, which never needs
// the network: this reads the production addresses (INPUTS 7.8), never a local server, each at a
// phone's width and a desktop's, four projects in all. The addresses are the deploy's own
// constant (scripts/deploy.mjs), so the check reads where the deploy uploads.
//
// HEROESIM_LIVE_URL, when set, replaces both with the one address it names, two projects: for a
// Worker that wrangler reports at another workers.dev address than the constant's, checked there
// and then on pages.dev before the constant is corrected (the v1.0.1 epic, S7 step 3).

const override = process.env.HEROESIM_LIVE_URL?.trim();

const sites = override
  ? [{ name: 'override', baseURL: override }]
  : [
      { name: 'worker', baseURL: addresses.worker },
      { name: 'pages', baseURL: addresses.pages },
    ];

const widths = [
  { name: 'phone', viewport: { width: 360, height: 800 } },
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
];

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.live.ts',
  reporter: [['list']],
  projects: sites.flatMap((site) =>
    widths.map((width) => ({
      name: `${site.name}-${width.name}`,
      use: { ...devices['Desktop Chrome'], baseURL: site.baseURL, viewport: width.viewport },
    })),
  ),
});
