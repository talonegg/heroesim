import { readdirSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';

// `npm run coverage` counts each package's source, leaving out the tests and their support files
// (DL-233): a tool's `test-support.ts` as much as a package's `*.test-support.ts` (DL-251).

const root = fileURLToPath(new URL('../../../', import.meta.url));

/** vitest.config.ts's coverage `exclude`. */
async function coverageExcludes(): Promise<string[]> {
  const config = (await import(pathToFileURL(join(root, 'vitest.config.ts')).href)) as { default: { test: { coverage: { exclude: string[] } } } };
  return config.default.test.coverage.exclude;
}

/** Every file under a package's or a tool's source, from the repository's root. */
function sourceFiles(): string[] {
  const tools = readdirSync(join(root, 'tools')).map((name) => `tools/${name}`);
  return ['engine', 'content', 'words', 'harness', 'cli', 'web', ...tools].flatMap((dir) => {
    let names: string[];
    try {
      names = readdirSync(join(root, dir, 'src'), { recursive: true, encoding: 'utf8' });
    } catch {
      return [];
    }
    return names.map((name) => `${dir}/src/${name.replace(/\\/g, '/')}`);
  });
}

describe("coverage's source (DL-233, DL-251)", () => {
  test('leaves out every test support file, by either name', async () => {
    const excludes = await coverageExcludes();
    const support = sourceFiles().filter((path) => /(^|[/.])test-support\.tsx?$/.test(path));
    expect(support).toContain('tools/editor/src/test-support.ts');
    expect(support.filter((path) => !excludes.some((glob) => matchesGlob(path, glob)))).toEqual([]);
  });

  test('counts the source the support files serve', async () => {
    const excludes = await coverageExcludes();
    for (const path of ['tools/editor/src/session.ts', 'tools/portraits/src/registry.ts', 'tools/decisions/src/index-page.ts', 'engine/src/advance.ts']) {
      expect(excludes.some((glob) => matchesGlob(path, glob)), path).toBe(false);
    }
  });
});
