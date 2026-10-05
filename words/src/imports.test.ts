import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, test } from 'vitest';

// v1.1.6-S11 (DL-186 item 1): the words run in a browser, for the CLI, the page and the tools. ESLint
// holds the line (eslint.config.js, `wordsImports`); these tests prove its rules fire, as
// engine/src/boundary.test.ts does for the other packages: each lints a probe as text under a path in
// a package, through the repository's own configuration, so no probe file is ever written.

const root = fileURLToPath(new URL('../../', import.meta.url));
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: root });
});

async function lint(directory: string, code: string, extension = 'ts'): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(code, { filePath: `${root}${directory}/boundary-probe-${randomUUID()}.${extension}` });
  if (!result) throw new Error('ESLint returned no result for the probe');
  return result.messages.filter((message) => message.severity === 2);
}

const restrictedImports = '@typescript-eslint/no-restricted-imports';
const importing = (specifier: string): string => `import * as x from '${specifier}';\nexport { x };`;

describe("the words' source", { timeout: 30_000 }, () => {
  test.each(['ts', 'tsx'])('a .%s file may import the engine, its types and values, by name', async (extension) => {
    const code = "import { describeQuery, type ContentSet } from '@heroesim/engine';\nexport const words = (set: ContentSet) => [describeQuery, set];";

    expect(await lint('words/src', code, extension)).toEqual([]);
  });

  test.each([
    ['node:fs', 'Node built-in'],
    ['fs', 'Node built-in'],
    ['path', 'Node built-in'],
    ['node:fs/promises', 'Node built-in'],
    ['react', 'React'],
    ['react-dom', 'React'],
    ['react/jsx-runtime', 'React'],
    ['react-dom/client', 'React'],
    ['@heroesim/content', 'no package but the engine'],
    ['@heroesim/content/node', 'no package but the engine'],
    ['@heroesim/engine/testing', "the engine's test entry"],
    ['@heroesim/engine/src/index.ts', 'no package but the engine'],
    ['@heroesim/cli', 'no package but the engine'],
    ['@heroesim/web', 'no package but the engine'],
    ['@heroesim/harness', 'no package but the engine'],
    ['../../engine/src/index.js', 'by its name'],
    ['../../web/src/state/names', 'by its name'],
  ])('may not import %s', async (specifier, words) => {
    for (const extension of ['ts', 'tsx']) {
      const errors = await lint('words/src', importing(specifier), extension);

      expect(errors, extension).toHaveLength(1);
      expect(errors[0]?.ruleId).toBe(restrictedImports);
      expect(errors[0]?.message).toContain(words);
    }
  });
});

describe("the words' tests", { timeout: 30_000 }, () => {
  test('run on Node and may word content read from disk', async () => {
    const code = [
      "import { readFileSync } from 'node:fs';",
      "import { loadContent } from '@heroesim/content/node';",
      "import { describeQuery } from '@heroesim/engine';",
      "import { chanceBand } from '@heroesim/engine/testing';",
      'export { chanceBand, describeQuery, loadContent, readFileSync };',
    ].join('\n');

    expect(await lint('words/src', code, 'test.ts')).toEqual([]);
  });

  test.each(['@heroesim/cli', '@heroesim/web', '@heroesim/harness'])('may not import %s', async (specifier) => {
    const errors = await lint('words/src', importing(specifier), 'test.ts');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe(restrictedImports);
  });
});

describe('the packages that read the words', { timeout: 30_000 }, () => {
  test.each([
    ['cli/src', 'ts'],
    ['web/src/state', 'ts'],
    ['web/src/views', 'tsx'],
    ['harness/src', 'ts'],
    ['tools/editor/src', 'ts'],
    ['tools/portraits/src', 'ts'],
  ])('%s (.%s) may import them by name', async (directory, extension) => {
    expect(await lint(directory, "import { nameIn } from '@heroesim/words';\nexport { nameIn };", extension)).toEqual([]);
  });

  test.each([
    ['cli/src', '@heroesim/words/src/index.ts'],
    ['web/src/state', '@heroesim/words/src/names.ts'],
    ['cli/src', '../../words/src/index.js'],
    ['web/src/state', '../../../words/src/names.js'],
    ['harness/src', '../../words/src/index.js'],
  ])('%s may not import %s', async (directory, specifier) => {
    const errors = await lint(directory, importing(specifier));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe(restrictedImports);
  });

  test.each(['engine/src', 'content/src'])('%s may not import them: the engine imports nothing, and content only the engine', async (directory) => {
    const errors = await lint(directory, importing('@heroesim/words'));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.ruleId).toBe(restrictedImports);
  });
});

describe('words/package.json', () => {
  test('exports its entry alone and declares no dependency: React, Node and the rest are not its', () => {
    const manifest = JSON.parse(readFileSync(`${root}words/package.json`, 'utf8')) as Record<string, unknown>;

    expect(manifest['exports']).toBe('./src/index.ts');
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      expect(manifest).not.toHaveProperty(key);
    }
  });
});
