import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// tsc -b compiles each package's src/tests into <package>/dist, and that dist
// is gitignored but still present on disk locally. Vitest's own default
// exclude list is only node_modules and .git, so every project below must
// exclude dist explicitly or it will double-run the compiled .js copies of
// the same tests.
const excludeCompiledOutput = ['**/dist/**', '**/node_modules/**'];

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
    },
    // cli and web have no unit tests yet (cli is a placeholder entry point;
    // web's shell is covered by the Playwright smoke spec) — passWithNoTests
    // is run-level only in Vitest's project config, so it is set here rather
    // than per project.
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'engine',
          root: './engine',
          environment: 'node',
          exclude: excludeCompiledOutput,
        },
      },
      {
        test: {
          name: 'content',
          root: './content',
          environment: 'node',
          exclude: excludeCompiledOutput,
        },
      },
      {
        test: {
          name: 'narrate',
          root: './narrate',
          environment: 'node',
          exclude: excludeCompiledOutput,
        },
      },
      {
        test: {
          name: 'cli',
          root: './cli',
          environment: 'node',
          exclude: excludeCompiledOutput,
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          root: './web',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          exclude: [...excludeCompiledOutput, 'e2e/**'],
        },
      },
    ],
  },
});
