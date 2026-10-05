// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import { builtinModules } from 'node:module';
import tseslint from 'typescript-eslint';

// Harvested from v1 (feature/poc) and trimmed to v2's five packages (approach §5, M0-S2), and the
// words the front ends share, a sixth (v1.1.6-S11, DL-186 item 1).
// engine/src/boundary.test.ts proves each rule below fires; change the two together.

const packages = ['engine', 'content', 'words', 'harness', 'cli', 'web'];

/**
 * A relative import that climbs out of `self` into another package's directory. `climbs` is the
 * fewest `../` that can leave the package from the files the rule is for: one from a package's
 * root, two from `web/src/`, whose own `content.ts` is `../content` from `web/src/state/` (DL-65).
 */
function relativeInto(self, message, climbs = 1) {
  const others = packages.filter((name) => name !== self).join('|');
  return { regex: `^(\\.\\./){${climbs},}(${others})(/|$)`, message };
}

const byNameOnly =
  'Import another package by its name, never by a relative path into its source (approach §5).';

// Every package exports only its entry, so no subpath exists to import, with one exception:
// content's Node entry, `@heroesim/content/node` (M1-S4, DL-14 item 7), which reads the content
// files with node:fs. The harness and the CLI run on Node and may import it; the web runs in a
// browser and may not, except in its tests, which run on Node (M7-S1, DL-64). Two more, content's
// register of a Trait's uses, `@heroesim/content/uses` (v1.1.4-S12), and its write module,
// `@heroesim/content/write` (v1.1.6-S4), are the tools' alone (the tools' block below).
// content/src/imports.test.ts proves each. The engine's test entry, `@heroesim/engine/testing`, has
// its own rule, `engineTesting`, so that a production import of it reads that rule's words.
function noSubpath({ node }) {
  return {
    regex: node ? '^@heroesim/(?!content/node$|engine/testing$)[^/]+/' : '^@heroesim/(?!engine/testing$)[^/]+/',
    message:
      'Import a package by its name only; its entry is all it exports, and ' +
      '`@heroesim/content/node` is for the CLI and the harness, never the browser (approach §5).',
  };
}

/**
 * The engine's test entry, `@heroesim/engine/testing` (v1.1.6-S8, DL-186 item 9): rows, ids and
 * History built by hand and the probe's factory, for tests alone. Production code, every file but a
 * test, its support files and the page's Playwright specs, may not import it; engine/src/testing.test.ts
 * holds the packages' sources to it as well.
 */
const engineTesting = {
  regex: '^@heroesim/engine/testing$',
  message:
    "`@heroesim/engine/testing` is the engine's entry for tests: production code imports the engine " +
    'by its name only (DL-186 item 9).',
};

/** The files of a package that are tests: test files, their support files, the page's Playwright specs. */
const testFiles = (pkg) => [`${pkg}/**/*.test.{ts,tsx}`, `${pkg}/**/*test-support.{ts,tsx}`, `${pkg}/**/test-setup.ts`];

const nodeBuiltins = `^(node:.*|(${builtinModules.join('|')})(/.*)?)$`;

const nodeBuiltin = {
  regex: nodeBuiltins,
  message:
    "Node built-ins belong only in content's Node entry, src/node.ts, and its write module for the " +
    'tools, src/write/; the rest of content must run in a browser (approach §5).',
};

const browserBuiltin = {
  regex: nodeBuiltins,
  message:
    'The page runs in a browser: web/src imports no Node built-in outside its tests. Vite would ' +
    'put an empty stub in its place, which the bundle gate cannot see, so the build refuses one ' +
    'that slips through (web/vite.config.ts; principle 12, M7-S1, DL-74).',
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

/**
 * content: the engine's types and values, by name, and Node built-ins only in its Node entry. The
 * engine imports nothing back, so the graph stays acyclic (pre-M0 review A3 as refined by DL-186
 * item 6; ADR-0007).
 */
function contentImports({ node }) {
  return {
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

/**
 * words, `@heroesim/words` (v1.1.6-S11, DL-186 item 1): the words the CLI, the page and the tools
 * share, which run in a browser. Its source takes the engine's types and values by name and nothing
 * else of ours, never content, a front end or the harness; no Node built-in; no React, which is the
 * page's alone. Its tests run on Node and word content's own rows: they may take content, its Node
 * entry and the engine's test entry, and Node built-ins.
 */
function wordsImports({ tests = false } = {}) {
  return {
    patterns: [
      tests
        ? {
            regex: '^@heroesim/(?!(engine|engine/testing|content|content/node)$)',
            message: "The words' tests import the engine and content by name, never a front end or the harness (DL-186 item 1).",
          }
        : {
            regex: '^@heroesim/(?!engine$)',
            message:
              'The words import no package but the engine, and that by name: never content, a front end, ' +
              "the harness or the engine's test entry (DL-186 item 1).",
          },
      relativeInto('words', byNameOnly),
      ...(tests
        ? []
        : [
            {
              regex: nodeBuiltins,
              message:
                'The words run in a browser as well as on Node: they import no Node built-in (DL-186 item 1, ' +
                'principle 12).',
            },
            {
              regex: '^react(-dom)?(/|$)',
              message: "The words are text, which the CLI and the tools read too: they import no React, the page's alone (DL-186 item 1).",
            },
          ]),
    ],
  };
}

/** A refusal in the words' source: what it may not use, and why. */
function wordsInABrowser(what) {
  return `The words run in a browser as well as on Node: ${what} (DL-186 item 1, principle 12).`;
}

/**
 * harness, cli and web: engine, content and words by name; neither front end imports the other. The web
 * page's source, which runs in a browser, imports no Node built-in (`browser`); its tests, which
 * run on Node, may take content's Node entry to compare the bundled content with it (`node`;
 * M7-S1, DL-64). Under `web/src/` a relative path leaves the package only after two climbs
 * (`climbs`; DL-65).
 */
function consumerImports(self, forbidden, { node = self !== 'web', browser = false, climbs = 1, tests = false } = {}) {
  return {
    patterns: [
      noSubpath({ node }),
      ...(tests ? [] : [engineTesting]),
      {
        group: forbidden.map((name) => `@heroesim/${name}`),
        message:
          'Neither front end imports the other, and the harness imports neither; what two of ' +
          'them need belongs in the engine or content.',
      },
      relativeInto(self, byNameOnly, climbs),
      ...(browser ? [browserBuiltin] : []),
    ],
  };
}

// The engine's own globals and syntax. A later block replaces an earlier block's options for the
// same rule, so the engine's tests (the second engine block) restate what they keep.

// Forbidding the `Date` global outright would also forbid `: Date` in a type and
// `instanceof Date`. Forbid the ways of reading the clock instead. Date.now is left to
// no-restricted-properties so that it is reported once.
const readsOfTheClock = [
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
];

const dynamicImport = {
  selector: 'ImportExpression',
  message: "The engine's imports are static and inside itself: no dynamic `import()` (ADR-0007).",
};

// Not `no-console`: it cannot carry a message, and the message is what names the ADR.
const noOutput = {
  name: 'console',
  message: 'The engine returns typed events, never output: no console (ADR-0003).',
};

/** The global object's names: through any of them, every global forbidden here is reachable. */
const globalObjects = ['globalThis', 'global', 'window', 'self'];

/** Globals that read a clock, a random source or the environment, and the global object (DL-16). */
const readsOfTheOutsideWorld = [
  {
    name: 'performance',
    message: 'Time is injected: the engine never reads a clock, performance.now() included (ADR-0001).',
  },
  {
    name: 'crypto',
    message:
      'Randomness is injected: draw from a seeded stream, never crypto.randomUUID() or ' +
      'crypto.getRandomValues() (ADR-0001).',
  },
  {
    name: 'process',
    message:
      'The engine runs unchanged in Node and the browser and reads no environment or clock: ' +
      'no process.env, process.hrtime or any other process.* (ADR-0001, ADR-0007).',
  },
  ...['setTimeout', 'setInterval', 'setImmediate'].map((name) => ({
    name,
    message: `Time advances only when \`advance\` is called; nothing waits on the clock: no ${name} (ADR-0001).`,
  })),
  ...globalObjects.map((name) => ({
    name,
    message:
      `The engine reaches no global through \`${name}\`, which would bypass the rules on the ` +
      'clock, randomness and the environment (ADR-0001, ADR-0007).',
  })),
];

const restrictImports = (options) => ({
  'no-restricted-imports': 'off',
  '@typescript-eslint/no-restricted-imports': ['error', options],
});

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      'coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
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
  // The content editor's page (v1.1.4-S12), plain JavaScript served to a browser from the repository.
  {
    files: ['tools/editor/page/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // The engine: no clock, no global random source and no environment (ADR-0001, DL-16), no output
  // (ADR-0003), nothing imported from outside itself (ADR-0007). Tests included, except that
  // they may use Node and its tools to inspect the repository, time what they measure and spawn
  // processes: the second block gives them back what the first forbids for those reasons.
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
      'no-restricted-syntax': ['error', ...readsOfTheClock, dynamicImport],
      'no-restricted-globals': ['error', noOutput, ...readsOfTheOutsideWorld],
      ...restrictImports(engineSource),
    },
  },
  {
    files: ['engine/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...readsOfTheClock],
      'no-restricted-globals': ['error', noOutput],
      ...restrictImports(engineTests),
    },
  },

  {
    files: ['content/**/*.ts'],
    rules: restrictImports(contentImports({ node: false })),
  },
  {
    files: ['content/src/node.ts', 'content/src/write/**/*.ts', 'content/**/*.test.ts'],
    rules: restrictImports(contentImports({ node: true })),
  },

  // The words' source reaches Node by no other road either: no dynamic `import()`, which the import
  // rules cannot see, and no global only Node defines (v1.1.6-S11's verification, DL-197). Its tests
  // run on Node and may.
  {
    files: ['words/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', { selector: 'ImportExpression', message: wordsInABrowser('no dynamic `import()`') }],
      'no-restricted-globals': [
        'error',
        ...['process', 'Buffer', '__dirname', '__filename', 'global', 'require', 'module', 'exports'].map((name) => ({
          name,
          message: wordsInABrowser(`no \`${name}\`, which only Node defines`),
        })),
      ],
      ...restrictImports(wordsImports()),
    },
  },
  {
    files: testFiles('words'),
    rules: {
      'no-restricted-syntax': 'off',
      'no-restricted-globals': 'off',
      ...restrictImports(wordsImports({ tests: true })),
    },
  },

  {
    files: ['harness/**/*.ts'],
    rules: restrictImports(consumerImports('harness', ['cli', 'web'])),
  },
  {
    files: testFiles('harness'),
    rules: restrictImports(consumerImports('harness', ['cli', 'web'], { tests: true })),
  },
  {
    files: ['cli/**/*.ts'],
    rules: restrictImports(consumerImports('cli', ['web'])),
  },
  {
    files: testFiles('cli'),
    rules: restrictImports(consumerImports('cli', ['web'], { tests: true })),
  },
  // web: its configuration files and Playwright specs run on Node, the page's source in a browser,
  // and its tests on Node again. A later block replaces an earlier block's options.
  {
    files: ['web/**/*.{ts,tsx}'],
    rules: restrictImports(consumerImports('web', ['cli'])),
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    rules: restrictImports(consumerImports('web', ['cli'], { browser: true, climbs: 2 })),
  },
  {
    files: ['web/e2e/**/*.ts'],
    rules: restrictImports(consumerImports('web', ['cli'], { tests: true })),
  },
  {
    files: testFiles('web/src'),
    rules: restrictImports(consumerImports('web', ['cli'], { node: true, climbs: 2, tests: true })),
  },

  // The portrait tool (v1.1.3-S2) and the content editor (v1.1.4-S12): Node packages outside the game,
  // which take content's checks by name, content's Node entry among them, and import neither front end
  // nor the harness. Only a tool takes the register of a Trait's uses, `@heroesim/content/uses`, and
  // content's write module, `@heroesim/content/write` (v1.1.6-S4), which the game never imports.
  {
    files: ['tools/**/*.ts'],
    rules: restrictImports({
      patterns: [
        {
          regex: '^@heroesim/(?!content/(node|uses|write)$)[^/]+/',
          message:
            "Import a package by its name only; its entry is all it exports, but for content's Node entry, " +
            'its register of uses and its write module, `@heroesim/content/node`, `@heroesim/content/uses` ' +
            'and `@heroesim/content/write` (approach §5).',
        },
        {
          group: ['@heroesim/cli', '@heroesim/web', '@heroesim/harness'],
          message: 'The portrait tool takes the engine and content only; the front ends and the harness are not its.',
        },
        { regex: `^(\\.\\./){3,}(${packages.join('|')})(/|$)`, message: byNameOnly },
      ],
    }),
  },
);
