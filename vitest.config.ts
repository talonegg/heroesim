import { configDefaults, defineConfig } from 'vitest/config';

// One project per workspace package; tests sit beside the code as src/**/*.test.ts.
//
// A harness run (src/**/*.harness.test.ts) plays thousands of games, so it is a project of its
// own that exists only when HEROESIM_HARNESS is set. `npm run harness` sets it; `npm test`
// never sees it and stays fast.
const packages = ['engine', 'content', 'harness', 'cli', 'web'];
const harnessRuns = '**/*.harness.test.ts';

export default defineConfig({
  test: {
    projects: [
      ...packages.map((name) => ({
        test: {
          name,
          root: `./${name}`,
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, harnessRuns],
        },
      })),
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
