// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// The production build and the bundle gate (M7-S1, DL-64). `npm run build -w web` is `vite build`
// then scripts/check-bundle.mjs; these tests run the same two into a temporary directory, so the
// gate is proved on every `npm test`, in CI included, and web/dist is never touched.

const webDir = fileURLToPath(new URL('..', import.meta.url));
const vite = path.join(webDir, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const gate = path.join(webDir, 'scripts', 'check-bundle.mjs');

const temporaries: string[] = [];
function temporaryDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-web-'));
  temporaries.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

function run(args: string[], env: NodeJS.ProcessEnv = process.env): { status: number | null; output: string } {
  const child = spawnSync(process.execPath, args, { cwd: webDir, encoding: 'utf8', env });
  return { status: child.status, output: `${child.stdout}${child.stderr}` };
}

/** The environment `npm run build` sees: Vitest's own NODE_ENV=test would build React for development. */
function buildEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name === 'NODE_ENV' || name.startsWith('VITEST')) delete env[name];
  }
  return env;
}

describe('the production build', { timeout: 120_000 }, () => {
  let outDir: string;
  let built: { status: number | null; output: string };

  beforeAll(() => {
    outDir = temporaryDir();
    built = run([vite, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], buildEnvironment());
  });

  test('builds', () => {
    expect(built.status, built.output).toBe(0);
  });

  test('references its assets relatively, as one classic script, so the folder opens from the filesystem', () => {
    const html = readFileSync(path.join(outDir, 'index.html'), 'utf8');
    const references = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((hit) => hit[1]);

    expect(references).toHaveLength(1);
    expect(references[0]).toMatch(/^\.\/assets\/index-[\w-]+\.js$/);
    // Chromium refuses a module script from a file:// page; a classic deferred one runs.
    expect(html).toContain(`<script defer src="${references[0]}"></script>`);
    expect(html).not.toMatch(/type="module"|crossorigin/);
  });

  test('passes the bundle gate', () => {
    const gated = run([gate, outDir]);

    expect(gated.output).toContain('no network or filesystem reference');
    expect(gated.status).toBe(0);
  });
});

describe('the bundle gate', () => {
  function bundleOf(script: string): string {
    const dir = temporaryDir();
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'index.html'), '<script defer src="./assets/index.js"></script>');
    writeFileSync(path.join(dir, 'assets', 'index.js'), script);
    return dir;
  }

  test("passes React's namespace identifiers, its error decoder and a URL in a comment", () => {
    const dir = bundleOf(
      [
        '/*! licence: https://example.com/licence */',
        'const svg = `http://www.w3.org/2000/svg`;',
        'const help = `https://react.dev/errors/` + 418;',
      ].join('\n'),
    );

    expect(run([gate, dir]).status).toBe(0);
  });

  test.each([
    ['fetch(', 'fetch(`/api/save`)', 'contains fetch('],
    ['fetch with a space', 'window.fetch (url)', 'contains fetch('],
    ['XMLHttpRequest', 'new XMLHttpRequest()', 'contains XMLHttpRequest'],
    ['a node: specifier', 'import(`node:fs`)', 'contains a node: specifier'],
    ['process.env', 'const home = process.env.HOME;', 'contains process.env'],
    ['a URL literal', 'const api = "https://example.com/saves";', 'contains the URL https://example.com/saves'],
  ])('fails a bundle containing %s', (_name, script, complaint) => {
    const gated = run([gate, bundleOf(script)]);

    expect(gated.output).toContain(complaint);
    expect(gated.status).toBe(1);
  });

  test("passes minified React's `{node:n}` object key, which is not a specifier", () => {
    expect(run([gate, bundleOf('const x = {node:n};')]).status).toBe(0);
  });

  test('fails when there is no build to check', () => {
    const missing = run([gate, path.join(temporaryDir(), 'dist')]);
    const empty = run([gate, temporaryDir()]);

    expect(missing.output).toContain('no build at');
    expect(missing.status).toBe(1);
    expect(empty.output).toContain('holds no .js');
    expect(empty.status).toBe(1);
  });
});
