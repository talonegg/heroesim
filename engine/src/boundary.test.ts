import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, test } from 'vitest';

// The engine's boundary is enforced by ESLint (ADR-0001, ADR-0003, ADR-0007). These tests prove
// the rules fire: each writes a probe file into a package's src/, lints it with the repository's
// own eslint.config.js through ESLint's Node API, and deletes it whatever happens.

const root = fileURLToPath(new URL('../../', import.meta.url));
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: root });
});

async function lintProbe(pkg: string, code: string, extension = 'ts'): Promise<Linter.LintMessage[]> {
  const file = `${root}${pkg}/src/boundary-probe-${randomUUID()}.${extension}`;
  writeFileSync(file, code);
  try {
    const [result] = await eslint.lintFiles([file]);
    return errorsIn(result);
  } finally {
    rmSync(file, { force: true });
  }
}

function errorsIn(result: ESLint.LintResult | undefined): Linter.LintMessage[] {
  if (!result) throw new Error('ESLint returned no result for the probe');
  return result.messages.filter((message) => message.severity === 2);
}

const restrictedImports = '@typescript-eslint/no-restricted-imports';

describe('engine/ source', { timeout: 30_000 }, () => {
  test.each([
    ['Math.random()', 'export const roll = Math.random();', 'no-restricted-properties', 'ADR-0001'],
    ['Date.now()', 'export const now = Date.now();', 'no-restricted-properties', 'ADR-0001'],
    ['new Date()', 'export const today = new Date();', 'no-restricted-syntax', 'ADR-0001'],
    ['Date()', 'export const today = Date();', 'no-restricted-syntax', 'ADR-0001'],
    ['Date.parse()', "export const then = Date.parse('2026-09-25');", 'no-restricted-syntax', 'ADR-0001'],
    ['console.log', "console.log('a Quest resolved');", 'no-restricted-globals', 'ADR-0003'],
    // DL-16: the clock, random sources and the environment by other names.
    ['performance.now()', 'export const now = performance.now();', 'no-restricted-globals', 'ADR-0001'],
    ['crypto.randomUUID()', 'export const id = crypto.randomUUID();', 'no-restricted-globals', 'ADR-0001'],
    [
      'crypto.getRandomValues()',
      'export const words = crypto.getRandomValues(new Uint32Array(4));',
      'no-restricted-globals',
      'ADR-0001',
    ],
    ['process.env', "export const home = process.env['HOME'];", 'no-restricted-globals', 'ADR-0007'],
    ['process.hrtime', 'export const now = process.hrtime.bigint();', 'no-restricted-globals', 'ADR-0001'],
    ['setTimeout', 'setTimeout(() => undefined, 0);', 'no-restricted-globals', 'ADR-0001'],
    ['setInterval', 'export const tick = setInterval(() => undefined, 1000);', 'no-restricted-globals', 'ADR-0001'],
    ['setImmediate', 'setImmediate(() => undefined);', 'no-restricted-globals', 'ADR-0001'],
    ['globalThis.Math.random()', 'export const roll = globalThis.Math.random();', 'no-restricted-globals', 'ADR-0001'],
    ['global.process', 'export const env = global.process.env;', 'no-restricted-globals', 'ADR-0007'],
    ['window.performance', 'export const now = window.performance.now();', 'no-restricted-globals', 'ADR-0001'],
    ['self.crypto', 'export const id = self.crypto.randomUUID();', 'no-restricted-globals', 'ADR-0001'],
    [
      'a dynamic import()',
      "export const load = () => import('./sibling.js');",
      'no-restricted-syntax',
      'ADR-0007',
    ],
    ['import from "node:fs"', "import fs from 'node:fs';\nexport { fs };", restrictedImports, 'ADR-0007'],
    ['import from "fs"', "import fs from 'fs';\nexport { fs };", restrictedImports, 'ADR-0007'],
    ['import from "path"', "import path from 'path';\nexport { path };", restrictedImports, 'ADR-0007'],
    [
      'import from "@heroesim/content"',
      "import x from '@heroesim/content';\nexport { x };",
      restrictedImports,
      'ADR-0007',
    ],
    [
      'a type import from "@heroesim/content"',
      "import type { ContentSet } from '@heroesim/content';\nexport type { ContentSet };",
      restrictedImports,
      'ADR-0007',
    ],
    [
      'a relative path into content/',
      "import x from '../../content/src/index.js';\nexport { x };",
      restrictedImports,
      'ADR-0007',
    ],
  ])('%s fails lint with one error naming the ADR', async (_name, code, ruleId, adr) => {
    const errors = await lintProbe('engine', code);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe(ruleId);
    expect(errors[0]?.message).toContain(adr);
  });

  test("a file within the rules passes, `Date` as a type included", async () => {
    const errors = await lintProbe(
      'engine',
      [
        "import { x } from './sibling.js';",
        'export const y = x;',
        'export const isDate = (value: unknown): value is Date => value instanceof Date;',
      ].join('\n'),
    );

    expect(errors).toEqual([]);
  });
});

describe('engine/ tests', { timeout: 30_000 }, () => {
  // Linted as text under a test file's path, so no probe test file is ever written where Vitest
  // could collect it.
  async function lintTestProbe(code: string): Promise<Linter.LintMessage[]> {
    const [result] = await eslint.lintText(code, {
      filePath: `${root}engine/src/boundary-probe-${randomUUID()}.test.ts`,
    });
    return errorsIn(result);
  }

  test('may time what they measure, spawn processes and reach Node through the global object', async () => {
    const errors = await lintTestProbe(
      [
        'export const started = performance.now();',
        'export const node = process.execPath;',
        'export const id = crypto.randomUUID();',
        'export const later = setTimeout(() => undefined, 0);',
        "export const load = () => import('./sibling.js');",
        'export const root = globalThis;',
      ].join('\n'),
    );

    expect(errors).toEqual([]);
  });

  test.each([
    ['Math.random()', 'export const roll = Math.random();', 'no-restricted-properties', 'ADR-0001'],
    ['new Date()', 'export const today = new Date();', 'no-restricted-syntax', 'ADR-0001'],
    ['console.log', "console.log('a Quest resolved');", 'no-restricted-globals', 'ADR-0003'],
  ])('still may not use %s', async (_name, code, ruleId, adr) => {
    const errors = await lintTestProbe(code);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe(ruleId);
    expect(errors[0]?.message).toContain(adr);
  });
});

describe('engine/package.json', () => {
  test('declares no dependency of any kind', () => {
    const manifest: unknown = JSON.parse(readFileSync(`${root}engine/package.json`, 'utf8'));

    for (const key of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
      'bundleDependencies',
      'bundledDependencies',
    ]) {
      expect(manifest).not.toHaveProperty(key);
    }
  });
});

// v1.1.6-S8 (DL-186 item 9): the engine's test entry, for tests alone.
describe("the engine's test entry, @heroesim/engine/testing", { timeout: 30_000 }, () => {
  const code = "import { makeId } from '@heroesim/engine/testing';\nexport { makeId };";

  test('is declared beside the entry in engine/package.json', () => {
    const manifest = JSON.parse(readFileSync(`${root}engine/package.json`, 'utf8')) as { exports: Record<string, string> };

    expect(manifest.exports).toEqual({ '.': './src/index.ts', './content': './src/content.ts', './testing': './src/testing.ts' });
  });

  test.each([
    ['cli', 'ts'],
    ['harness', 'ts'],
    ['web', 'ts'],
    ['web', 'tsx'],
  ])('%s production code (.%s) may not import it', async (pkg, extension) => {
    const errors = await lintProbe(pkg, code, extension);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe(restrictedImports);
    expect(errors[0]?.message).toContain('DL-186 item 9');
  });

  test.each([
    ['cli', 'test.ts'],
    ['harness', 'test.ts'],
    ['harness', 'test-support.ts'],
    ['web', 'test.ts'],
    ['web', 'test.tsx'],
    ['web', 'test-support.ts'],
  ])('%s tests (.%s) may import it', async (pkg, extension) => {
    expect(await lintProbe(pkg, code, extension)).toEqual([]);
  });
});

// DL-243: content's own entry, its types, lists and `queryProblems`, for content, the words and the
// tools; a front end and the harness take the engine by its main entry.
describe("the engine's content entry, @heroesim/engine/content", { timeout: 30_000 }, () => {
  const code = "import { encounterKinds, type ContentSet } from '@heroesim/engine/content';\nexport const x = (set: ContentSet) => [set, encounterKinds];";

  test.each(['content', 'words', 'tools/editor', 'tools/portraits'])('%s may import it', async (pkg) => {
    expect(await lintProbe(pkg, code)).toEqual([]);
  });

  test.each([
    ['cli', 'ts'],
    ['harness', 'ts'],
    ['web', 'ts'],
    ['web', 'tsx'],
    ['cli', 'test.ts'],
  ])('%s (.%s) may not import it', async (pkg, extension) => {
    const errors = await lintProbe(pkg, code, extension);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe(restrictedImports);
  });
});

describe('the other packages reach each other by name only', { timeout: 30_000 }, () => {
  test.each([
    ['content', "import type { ContentSet } from '@heroesim/engine/content';\nexport type { ContentSet };"],
    // DL-186 item 6 (v1.1.6-S5): content takes the engine's values as well as its types, by the
    // engine's content entry (DL-243).
    ['content', "import { encounterKinds } from '@heroesim/engine/content';\nexport { encounterKinds };"],
    ['cli', "import { x } from '@heroesim/engine';\nimport { y } from '@heroesim/content';\nexport { x, y };"],
    ['web', "import { x } from '@heroesim/engine';\nimport { y } from '@heroesim/content';\nexport { x, y };"],
    ['harness', "import { x } from '@heroesim/engine';\nexport { x };"],
  ])('%s may import what it is allowed', async (pkg, code) => {
    expect(await lintProbe(pkg, code)).toEqual([]);
  });

  test.each([
    ['content', 'a subpath of the engine', "import { x } from '@heroesim/engine/src/index.ts';\nexport { x };"],
    ['content', "the engine's main entry (DL-243)", "import type { World } from '@heroesim/engine';\nexport type { World };"],
    ['content', 'a Node built-in outside its Node entry', "import fs from 'node:fs';\nexport { fs };"],
    ['content', 'a front end', "import x from '@heroesim/cli';\nexport { x };"],
    ['cli', 'web', "import x from '@heroesim/web';\nexport { x };"],
    ['web', 'cli', "import x from '@heroesim/cli';\nexport { x };"],
    ['harness', 'a front end', "import x from '@heroesim/web';\nexport { x };"],
    ['cli', 'a subpath of the engine', "import x from '@heroesim/engine/src/index.ts';\nexport { x };"],
    ['web', 'a subpath of content', "import x from '@heroesim/content/src/index.ts';\nexport { x };"],
    ['cli', 'a relative path into engine/', "import x from '../../engine/src/index.js';\nexport { x };"],
    ['web', 'a relative path into content/', "import x from '../../content/src/index.js';\nexport { x };"],
    ['harness', 'a relative path into cli/', "import x from '../../cli/src/index.js';\nexport { x };"],
    ['content', 'a relative path into engine/', "import x from '../../engine/src/index.js';\nexport { x };"],
  ])('%s may not import %s', async (pkg, _what, code) => {
    const errors = await lintProbe(pkg, code);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe(restrictedImports);
  });

  test("content's Node entry may import node:fs", async () => {
    // Linted as text under the entry's path rather than written there, so the real
    // content/src/node.ts (M1-S4) can never be overwritten or deleted by this test.
    const [result] = await eslint.lintText("import fs from 'node:fs';\nexport { fs };", {
      filePath: `${root}content/src/node.ts`,
    });

    expect(errorsIn(result)).toEqual([]);
  });
});

// M7-S1: the browser front end's components are .tsx, and its page runs in a browser.
describe("web/'s page, components included", { timeout: 30_000 }, () => {
  test('a component may import the engine and content by name', async () => {
    const code = [
      "import type { ContentSet } from '@heroesim/engine';",
      "import { contentSetId } from '@heroesim/content';",
      'export const Version = (props: { set: ContentSet }) => (',
      '  <p>{contentSetId} {props.set.version}</p>',
      ');',
    ].join('\n');

    expect(await lintProbe('web', code, 'tsx')).toEqual([]);
  });

  test.each([
    ['cli', "import x from '@heroesim/cli';"],
    ["content's Node entry", "import x from '@heroesim/content/node';"],
    ['a subpath of the engine', "import x from '@heroesim/engine/src/index.ts';"],
    ['a relative path into engine/', "import x from '../../engine/src/index.js';"],
    ['node:fs', "import x from 'node:fs';"],
    ['fs', "import x from 'fs';"],
  ])('a component may not import %s', async (_what, statement) => {
    const errors = await lintProbe('web', `${statement}\nexport const A = () => <p>{String(x)}</p>;`, 'tsx');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe(restrictedImports);
  });

  // M7-S2 (DL-65): `web/src/content.ts` shares the content package's name, and a module one
  // directory down reaches it as `../content`, which leaves neither `web/src/` nor `web/`.
  test.each(['ts', 'tsx', 'test.ts'])("a .%s module under web/src/state/ may import the page's own ../content", async (extension) => {
    const [result] = await eslint.lintText("import { content } from '../content';\nexport { content };", {
      filePath: `${root}web/src/state/boundary-probe-${randomUUID()}.${extension}`,
    });

    expect(errorsIn(result)).toEqual([]);
  });

  test.each([
    ['web/src/state/', '../../../content/src/index.js'],
    ['web/src/', '../../content/src/index.js'],
    ['web/e2e/', '../../content/src/index.js'],
    ['web/', '../content/src/index.js'],
  ])('from %s, %s is still a relative path into content/', async (directory, specifier) => {
    const [result] = await eslint.lintText(`import x from '${specifier}';\nexport { x };`, {
      filePath: `${root}${directory}boundary-probe-${randomUUID()}.ts`,
    });
    const errors = errorsIn(result);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe(restrictedImports);
  });

  test('a .ts module of the page may not import a Node built-in either', async () => {
    const errors = await lintProbe('web', "import path from 'node:path';\nexport { path };");

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('principle 12');
  });

  test.each(['ts', 'tsx'])(
    "its .%s tests run on Node: Node built-ins and content's Node entry, never the CLI",
    async (extension) => {
      const lint = async (code: string) => {
        const [result] = await eslint.lintText(code, {
          filePath: `${root}web/src/boundary-probe-${randomUUID()}.test.${extension}`,
        });
        return errorsIn(result);
      };

      expect(
        await lint(
          [
            "import { readFileSync } from 'node:fs';",
            "import { loadContent } from '@heroesim/content/node';",
            'export { loadContent, readFileSync };',
          ].join('\n'),
        ),
      ).toEqual([]);
      expect((await lint("import x from '@heroesim/cli';\nexport { x };"))[0]?.ruleId).toBe(restrictedImports);
    },
  );
});
