import path from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

// One project per workspace package; tests sit beside the code as src/**/*.test.ts.
//
// A harness run (src/**/*.harness.test.ts) plays thousands of games, so it is a project of its
// own that exists only when HEROESIM_HARNESS is set: the harness's, and the engine's twenty-year
// boxes (DL-230). `npm run harness` sets it; `npm test` never sees them and stays fast.
//
// A test of a time limit (src/**/*.speed.test.ts) measures the machine as well as the code, and
// fails under the full suite's load, so it runs apart too, in the same projects: `npm run harness --
// speed`, alone, at a release's close (DL-233, DL-231 Q22).
//
// The browser front end's tests render React into jsdom, so its project has the React plugin and
// a DOM, and takes .tsx as well (M7-S1). Its Playwright specs, web/e2e/*.spec.ts, are not
// Vitest's: `npm run e2e` runs them, here and in CI (DL-124). A test file with no DOM to render
// says `// @vitest-environment node` on its first line and runs on Node, as the page's state does
// (DL-234).
//
// The portrait tool, tools/portraits, is a workspace package outside the five (v1.1.3-S2), and so
// is the content editor, tools/editor (v1.1.4-S12).
//
// The words the CLI and the page share, words/ (v1.1.6-S11, DL-186 item 1), run in a browser; their
// tests word content's rows read from disk, so they run on Node with the other packages.
//
// Two groups run one after the other (DL-234). First the tests that start no browser and few
// processes, on every worker. Then the tests that start a browser, a build or many processes: the
// editor's, the portrait tool's and the page's production build, on a few workers, so that no
// process they start waits on a machine every worker already holds, and none of them slows the
// rest. Each project keeps the transforms it made in node_modules/.vitest-cache for the next run.
const nodePackages = ['engine', 'content', 'words', 'harness', 'cli'];
const harnessRuns = '**/*.harness.test.ts';
const speedRuns = '**/*.speed.test.ts';
/** The page's production build and the bundle gate, which start `vite build` and Node. */
const pageBuild = 'src/bundle.test.ts';

/** What every project shares: the transforms kept between runs. */
const shared = { fsModuleCache: true };
/** The group of the tests that start browsers and processes: after the rest, on a few workers. */
const processes = { ...shared, sequence: { groupOrder: 1 }, maxWorkers: 8 };
/** What a project whose files share no state takes: one evaluation of their modules a worker. */
const unshared = { ...shared, isolate: false };

/**
 * Within each group, the files that took longest in the last run start first, whatever their project,
 * and a file never run before first of all; Vitest's own order takes the projects one by one, by
 * name, so the page's slow files started after every other project's had (DL-234).
 */
class LongestFirst extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { cache, config } = this.ctx;
    const took = (file: TestSpecification): number =>
      cache.getFileTestResults(`${file.project.name}:${path.relative(config.root, file.moduleId).replace(/\\/g, '/')}`)?.duration ?? Number.MAX_SAFE_INTEGER;
    return [...files].sort((a, b) => a.project.config.sequence.groupOrder - b.project.config.sequence.groupOrder || took(b) - took(a));
  }
}

export default defineConfig({
  test: {
    sequence: { sequencer: LongestFirst },
    // `npm run coverage` (DL-233): every package's source, the tests and their support
    // left out, read by V8. It reports even when a test fails, and enforces nothing (DL-231 Q5):
    // `npm run measure -- coverage` gives it per package.
    coverage: {
      provider: 'v8',
      include: ['{engine,content,words,harness,cli,web}/src/**/*.{ts,tsx}', 'tools/*/src/**/*.ts'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.test-support.{ts,tsx}', '**/test-setup.ts'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
    },
    projects: [
      ...nodePackages.map((name) => ({
        test: {
          // Content's and the words' tests read files and change no module's state (DL-234).
          ...(name === 'content' || name === 'words' ? unshared : shared),
          name,
          root: `./${name}`,
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, harnessRuns, speedRuns],
          // The harness's tests play short games under the automatic policy, which estimates every
          // Quest it can staff at each choice (DL-176); under the whole suite's load some passed
          // 5 s, so its project gives each 30 s, as `play.test.ts` gave its slowest.
          ...(name === 'harness' ? { testTimeout: 30_000 } : {}),
          // A test game's History, checked Turn by Turn from where the last check left it, is read
          // whole at each test's end (engine/src/test-setup.ts, DL-234).
          ...(name === 'engine' ? { setupFiles: ['./src/test-setup.ts'] } : {}),
        },
      })),
      // The portrait tool (v1.1.3-S2) runs on Node and drives Chromium, through the Playwright the
      // page's specs install, to draw its pictures; its tests launch it, so each is given long.
      {
        test: {
          ...processes,
          name: 'portraits',
          root: './tools/portraits',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
      // The content editor (v1.1.4-S12, DL-161), a Node package outside the game: its commands, its
      // page's server, the register's drift and freshness checks. Its page tests drive Chromium.
      {
        test: {
          ...processes,
          name: 'editor',
          root: './tools/editor',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      // The measures of the suite, coverage, CI and a game's profile (DL-233).
      {
        test: {
          ...unshared,
          name: 'measure',
          root: './tools/measure',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      // The decision log's tool (DL-215): the index's freshness, the citations and the documents' links (DL-218).
      {
        test: {
          ...unshared,
          name: 'decisions',
          root: './tools/decisions',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          ...shared,
          name: 'web',
          root: './web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, pageBuild],
          // The open view the page remembers in localStorage is forgotten after each test (M9-S3).
          setupFiles: ['./src/test-setup.ts'],
        },
      },
      // The page's production build, with the group of the processes.
      {
        test: {
          ...processes,
          name: 'web-build',
          root: './web',
          environment: 'node',
          include: [pageBuild],
        },
      },
      ...(process.env.HEROESIM_HARNESS
        ? [
            {
              test: {
                name: 'harness-run',
                root: './harness',
                environment: 'node',
                include: [`src/${harnessRuns}`, `src/${speedRuns}`],
              },
            },
            {
              test: {
                name: 'engine-run',
                root: './engine',
                environment: 'node',
                include: [`src/${harnessRuns}`, `src/${speedRuns}`],
              },
            },
          ]
        : []),
    ],
  },
});
