import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

// One project per workspace package; tests sit beside the code as src/**/*.test.ts.
//
// A harness run (src/**/*.harness.test.ts) plays thousands of games, so it is a project of its
// own that exists only when HEROESIM_HARNESS is set: the harness's, and the engine's twenty-year
// boxes (DL-230). `npm run harness` sets it; `npm test` never sees them and stays fast.
//
// The browser front end's tests render React into jsdom, so its project has the React plugin and
// a DOM, and takes .tsx as well (M7-S1). Its Playwright specs, web/e2e/*.spec.ts, are not
// Vitest's: `npm run e2e` runs them, here and in CI (DL-124).
//
// The portrait tool, tools/portraits, is a workspace package outside the five (v1.1.3-S2), and so
// is the content editor, tools/editor (v1.1.4-S12).
//
// The words the CLI and the page share, words/ (v1.1.6-S11, DL-186 item 1), run in a browser; their
// tests word content's rows read from disk, so they run on Node with the other packages.
const nodePackages = ['engine', 'content', 'words', 'harness', 'cli'];
const harnessRuns = '**/*.harness.test.ts';

export default defineConfig({
  test: {
    projects: [
      ...nodePackages.map((name) => ({
        test: {
          name,
          root: `./${name}`,
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, harnessRuns],
          // The harness's tests play short games under the automatic policy, which estimates every
          // Quest it can staff at each choice (DL-176); under the whole suite's load some passed
          // 5 s, so its project gives each 30 s, as `play.test.ts` gave its slowest.
          ...(name === 'harness' ? { testTimeout: 30_000 } : {}),
        },
      })),
      // The portrait tool (v1.1.3-S2) runs on Node and drives Chromium, through the Playwright the
      // page's specs install, to draw its pictures; its tests launch it, so each is given long.
      {
        test: {
          name: 'portraits',
          root: './tools/portraits',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
      // The content editor (v1.1.4-S12, DL-161), a Node package outside the game: its commands, its
      // page's server, the register's drift and freshness checks. Its one page test drives Chromium.
      {
        test: {
          name: 'editor',
          root: './tools/editor',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      // The decision log's tool (DL-215): the index's freshness, the citations and the documents' links (DL-218).
      {
        test: {
          name: 'decisions',
          root: './tools/decisions',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          root: './web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          // The open view the page remembers in localStorage is forgotten after each test (M9-S3).
          setupFiles: ['./src/test-setup.ts'],
        },
      },
      ...(process.env.HEROESIM_HARNESS
        ? [
            {
              test: {
                name: 'harness-run',
                root: './harness',
                environment: 'node',
                include: [`src/${harnessRuns}`],
              },
            },
            {
              test: {
                name: 'engine-run',
                root: './engine',
                environment: 'node',
                include: [`src/${harnessRuns}`],
              },
            },
          ]
        : []),
    ],
  },
});
