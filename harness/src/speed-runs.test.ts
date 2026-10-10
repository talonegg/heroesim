import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';

// A test of a time limit is a `*.speed.test.ts` file: `npm test` leaves it out, and the harness's
// projects run it, through `npm run harness -- speed`, alone, at a close (DL-233). vitest.config.ts
// builds the harness's projects only when HEROESIM_HARNESS is set, so both of its readings are read.

const root = fileURLToPath(new URL('../../', import.meta.url));
const speedRuns = 'src/**/*.speed.test.ts';

interface Project {
  test: { root: string; include: string[]; exclude?: string[] };
}

/** vitest.config.ts's projects, read afresh with HEROESIM_HARNESS set or not. */
async function projects(harness: boolean): Promise<Project[]> {
  vi.stubEnv('HEROESIM_HARNESS', harness ? '1' : '');
  const url = `${pathToFileURL(join(root, 'vitest.config.ts')).href}?harness=${String(harness)}`;
  const config = (await import(url)) as { default: { test: { projects: Project[] } } };
  return config.default.test.projects;
}

/** Every `*.speed.test.ts` under a package's or a tool's source, from the repository's root. */
function speedFiles(): string[] {
  const tools = readdirSync(join(root, 'tools')).map((name) => `tools/${name}`);
  return ['engine', 'content', 'words', 'harness', 'cli', 'web', ...tools].flatMap((dir) => {
    let names: string[];
    try {
      names = readdirSync(join(root, dir, 'src'), { recursive: true, encoding: 'utf8' });
    } catch {
      return [];
    }
    return names.map((name) => `${dir}/src/${name.replace(/\\/g, '/')}`).filter((path) => path.endsWith('.speed.test.ts'));
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the tests of a time limit (DL-233)', () => {
  test("sit in the engine's or the harness's source, the packages the harness's projects run", () => {
    const files = speedFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file).toMatch(/^(engine|harness)\/src\//);
  });

  test('are left out of npm test', async () => {
    const own = (await projects(false)).filter((project) => ['./engine', './harness'].includes(project.test.root));
    expect(own).toHaveLength(2);
    for (const project of own) expect(project.test.exclude).toContain('**/*.speed.test.ts');
  });

  test("are held by the harness's projects", async () => {
    const runs = (await projects(true)).filter((project) => project.test.include.includes(speedRuns));
    expect(runs.map((project) => project.test.root).sort()).toEqual(['./engine', './harness']);
  });
});
