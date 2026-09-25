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

async function lintProbe(pkg: string, code: string): Promise<Linter.LintMessage[]> {
  const file = `${root}${pkg}/src/boundary-probe-${randomUUID()}.ts`;
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

describe('the other packages reach each other by name only', { timeout: 30_000 }, () => {
  test.each([
    ['content', "import type { World } from '@heroesim/engine';\nexport type { World };"],
    ['cli', "import { x } from '@heroesim/engine';\nimport { y } from '@heroesim/content';\nexport { x, y };"],
    ['web', "import { x } from '@heroesim/engine';\nimport { y } from '@heroesim/content';\nexport { x, y };"],
    ['harness', "import { x } from '@heroesim/engine';\nexport { x };"],
  ])('%s may import what it is allowed', async (pkg, code) => {
    expect(await lintProbe(pkg, code)).toEqual([]);
  });

  test.each([
    ['content', 'a value from the engine', "import { x } from '@heroesim/engine';\nexport { x };"],
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
