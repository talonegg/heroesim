// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const dateSyntaxRestrictions = [
  {
    selector: "NewExpression[callee.name='Date']",
    message: 'Inject time; do not construct `new Date()` directly (ADR-0001).',
  },
  {
    selector: "CallExpression[callee.object.name='Date']",
    message: 'Inject time; do not call a static `Date.*` method directly (ADR-0001).',
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '**/dist/**',
      'node_modules/**',
      '**/node_modules/**',
      'coverage/**',
      '**/coverage/**',
      'web/dist/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  // Invariant 1 (engine): no files, no output, no clock, no global random. Randomness
  // and time are injected (ADR-0001); narration lives in narrate/, not prose in engine/.
  {
    files: ['engine/**/*.ts', 'narrate/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Inject randomness; do not call Math.random() directly (ADR-0001).',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Inject time; do not call Date.now() directly (ADR-0001).',
        },
      ],
      // Forbidding the bare `Date` global with no-restricted-globals also blocks type
      // positions (`: Date`) and `instanceof Date`, which are legitimate. Restrict to the
      // two ways a caller can read the current time instead.
      'no-restricted-syntax': ['error', ...dateSyntaxRestrictions],
      'no-console': 'error',
    },
  },
  {
    files: ['engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@heroesim/*',
            '../content/*',
            '../narrate/*',
            '../cli/*',
            '../web/*',
            'node:*',
            'fs',
            'path',
          ],
        },
      ],
    },
  },
  {
    files: ['content/**/*.ts', 'narrate/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@heroesim/cli', '@heroesim/web'],
        },
      ],
    },
  },
  // E7 §5's first risk row: a view quietly needs engine data and somebody computes it in
  // the CLI. The terminal front end reaches the engine, content and narrate through their
  // package entry points and through nothing else — never a relative path into another
  // workspace's source, and never a subpath of a package that exports only its entry.
  {
    files: ['cli/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@heroesim/engine/*',
            '@heroesim/narrate/*',
            '@heroesim/web',
            '@heroesim/web/*',
            '../engine/*',
            '../../engine/*',
            '../narrate/*',
            '../../narrate/*',
            '../content/*',
            '../../content/*',
            '../web/*',
            '../../web/*',
          ],
        },
      ],
    },
  },
);
