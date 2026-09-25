// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import { builtinModules } from 'node:module';
import tseslint from 'typescript-eslint';

// Harvested from v1 (feature/poc) and trimmed to v2's five packages (approach §5, M0-S2).
// engine/src/boundary.test.ts proves each rule below fires; change the two together.

const packages = ['engine', 'content', 'harness', 'cli', 'web'];

/** A relative import that climbs out of `self` into another package's directory. */
function relativeInto(self, message) {
  const others = packages.filter((name) => name !== self).join('|');
  return { regex: `^(\\.\\./)+(${others})(/|$)`, message };
}

const byNameOnly =
  'Import another package by its name, never by a relative path into its source (approach §5).';

// Every package exports only its entry, so no subpath exists to import, with one exception:
// content's Node entry, `@heroesim/content/node` (M1-S4, DL-14 item 7), which reads the content
// files with node:fs. The harness and the CLI run on Node and may import it; the web runs in a
// browser and may not. content/src/imports.test.ts proves both.
function noSubpath({ node }) {
  return {
    regex: node ? '^@heroesim/(?!content/node$)[^/]+/' : '^@heroesim/[^/]+/',
    message:
      'Import a package by its name only; its entry is all it exports, and ' +
      '`@heroesim/content/node` is for the CLI and the harness, never the browser (approach §5).',
  };
}

const nodeBuiltin = {
  regex: `^(node:.*|(${builtinModules.join('|')})(/.*)?)$`,
  message:
    "Node built-ins belong only in content's Node entry, src/node.ts; the rest of content " +
    'must run in a browser (approach §5).',
};

// Rule options, one per package. A later block replaces an earlier block's options for the same
// rule, so each block states its package's whole list.
const engineSource = {
  patterns: [
    {
      // Any bare specifier: another package, a Node built-in, an npm package.
      regex: '^[^./]',
      message:
        'The engine imports nothing outside itself: no other package, not even a type; ' +
        'no Node built-in; no npm package (ADR-0007).',
    },
    relativeInto('engine', 'The engine imports nothing outside itself (ADR-0007).'),
  ],
};

const engineTests = {
  patterns: [
    {
      regex: '^@heroesim/',
      message: "The engine's tests import nothing from another package either (ADR-0007).",
    },
    relativeInto('engine', 'The engine imports nothing outside itself (ADR-0007).'),
  ],
};

/** content: the engine's types only, and Node built-ins only in its Node entry. */
function contentImports({ node }) {
  return {
    paths: [
      {
        name: '@heroesim/engine',
        allowTypeImports: true,
        message:
          "Content takes only the engine's types (`import type`); its job is parsing text " +
          'into them (pre-M0 review A3).',
      },
    ],
    patterns: [
      {
        regex: '^@heroesim/(?!engine$)',
        message: 'Content imports no package but the engine, and that by name (approach §5).',
      },
      relativeInto('content', byNameOnly),
      ...(node ? [] : [nodeBuiltin]),
    ],
  };
}

/** harness, cli and web: engine and content by name; neither front end imports the other. */
function consumerImports(self, forbidden) {
  return {
    patterns: [
      noSubpath({ node: self !== 'web' }),
      {
        group: forbidden.map((name) => `@heroesim/${name}`),
        message:
          'Neither front end imports the other, and the harness imports neither; what two of ' +
          'them need belongs in the engine or content.',
      },
      relativeInto(self, byNameOnly),
    ],
  };
}

const restrictImports = (options) => ({
  'no-restricted-imports': 'off',
  '@typescript-eslint/no-restricted-imports': ['error', options],
});

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
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

  // The engine: no clock, no global random source (ADR-0001), no output (ADR-0003), nothing
  // imported from outside itself (ADR-0007). Tests included, except that they may use Node and
  // their tools to inspect the repository.
  {
    files: ['engine/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Randomness is injected: draw from a seeded stream, never Math.random() (ADR-0001).',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Time is injected: the engine never reads the clock with Date.now() (ADR-0001).',
        },
      ],
      // Forbidding the `Date` global outright would also forbid `: Date` in a type and
      // `instanceof Date`. Forbid the ways of reading the clock instead. Date.now is left to
      // no-restricted-properties so that it is reported once.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Time is injected: the engine never constructs `new Date()` (ADR-0001).',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: 'Time is injected: the engine never calls `Date()` (ADR-0001).',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name!='now']",
          message: 'Time is injected: the engine never calls a static `Date.*` method (ADR-0001).',
        },
      ],
      // Not `no-console`: it cannot carry a message, and the message is what names the ADR.
      'no-restricted-globals': [
        'error',
        {
          name: 'console',
          message: 'The engine returns typed events, never output: no console (ADR-0003).',
        },
      ],
      ...restrictImports(engineSource),
    },
  },
  {
    files: ['engine/**/*.test.ts'],
    rules: restrictImports(engineTests),
  },

  {
    files: ['content/**/*.ts'],
    rules: restrictImports(contentImports({ node: false })),
  },
  {
    files: ['content/src/node.ts', 'content/**/*.test.ts'],
    rules: restrictImports(contentImports({ node: true })),
  },

  {
    files: ['harness/**/*.ts'],
    rules: restrictImports(consumerImports('harness', ['cli', 'web'])),
  },
  {
    files: ['cli/**/*.ts'],
    rules: restrictImports(consumerImports('cli', ['web'])),
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    rules: restrictImports(consumerImports('web', ['cli'])),
  },
);
