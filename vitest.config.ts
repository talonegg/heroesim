import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

// One project per workspace package; tests sit beside the code as src/**/*.test.ts.
//
// A harness run (src/**/*.harness.test.ts) plays thousands of games, so it is a project of its
// own that exists only when HEROESIM_HARNESS is set. `npm run harness` sets it; `npm test`
// never sees it and stays fast.
//
// The browser front end's tests render React into jsdom, so its project has the React plugin and
// a DOM, and takes .tsx as well (M7-S1). Its Playwright specs, web/e2e/*.spec.ts, are not
// Vitest's: `npm run e2e` runs them, locally only (INPUTS 7.10).
const nodePackages = ['engine', 'content', 'harness', 'cli'];
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
        },
      })),
      {
        plugins: [react()],
        test: {
          name: 'web',
          root: './web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
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
          ]
        : []),
    ],
  },
});
