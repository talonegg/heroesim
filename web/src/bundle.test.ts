// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// The production build and the bundle gate (M7-S1, DL-64). `npm run build -w web` is `vite build`
// then scripts/check-bundle.mjs; these tests run the same two into a temporary directory, so the
// gate is proved on every `npm test`, in CI included, and web/dist is never touched. The build
// itself refuses a Node built-in, which never reaches the bundle for the gate to see (DL-74).

const webDir = fileURLToPath(new URL('..', import.meta.url));
const vite = path.join(webDir, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const gate = path.join(webDir, 'scripts', 'check-bundle.mjs');
const mediaDir = path.join(webDir, '..', 'media');

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

  test("inlines each of media/'s Silhouettes into the one script, and every picture is a hashed file beside it (v1.1.2-S2)", () => {
    const assets = readdirSync(path.join(outDir, 'assets'));
    const [script = ''] = assets.filter((file) => /^index-[\w-]+\.js$/.test(file));
    const silhouettes = readdirSync(mediaDir, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('silhouette.svg'));
    const text = readFileSync(path.join(outDir, 'assets', script), 'utf8');

    expect(silhouettes.length).toBeGreaterThan(0);
    expect(text.match(/data:image\/svg\+xml,/g)).toHaveLength(silhouettes.length);
    expect(assets.filter((file) => file !== script).filter((file) => !/-[\w-]{8}\.webp$/.test(file))).toEqual([]);
  });

  test('passes the bundle gate', () => {
    const gated = run([gate, outDir]);

    expect(gated.output).toContain('no network or filesystem reference');
    expect(gated.status).toBe(0);
  });
});

describe('a Node built-in the page imports', { timeout: 120_000 }, () => {
  /** Builds a page of one script, `probe.ts`, with the page's own Vite configuration. */
  function buildProbe(script: string): { status: number | null; output: string } {
    const root = temporaryDir();
    writeFileSync(path.join(root, 'index.html'), '<!doctype html><div id="root"></div><script type="module" src="./probe.ts"></script>');
    writeFileSync(path.join(root, 'probe.ts'), script);
    const config = path.join(webDir, 'vite.config.ts');
    return run([vite, 'build', root, '--config', config, '--outDir', temporaryDir(), '--emptyOutDir', '--logLevel', 'error'], buildEnvironment());
  }

  // Vite would put an empty stub in its place, with only a warning, and the gate would pass the
  // bundle: its specifier is gone (M7 verification, DL-74). The build refuses it instead.
  test.each([
    ['node:fs', "import { readFileSync } from 'node:fs';"],
    ['fs', "import { readFileSync } from 'fs';"],
    ['fs/promises', "import { readFile as readFileSync } from 'fs/promises';"],
  ])('fails the build: %s', (specifier, line) => {
    const built = buildProbe(`${line}\n(globalThis as Record<string, unknown>).probe = () => readFileSync('x', 'utf8');\n`);

    expect(built.output).toContain(`imports the Node built-in "${specifier}"`);
    expect(built.status).not.toBe(0);
  });

  test('and the same page without it builds', () => {
    expect(buildProbe("(globalThis as Record<string, unknown>).probe = () => 'x';\n").status).toBe(0);
  });
});

describe('the bundle gate', () => {
  const page = '<script defer src="./assets/index.js"></script>';

  /** A built folder: `index.html`, `assets/index.js` and, when given, `assets/index.css`. */
  function bundleOf(script: string, { html = page, css }: { html?: string; css?: string } = {}): string {
    const dir = temporaryDir();
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'index.html'), html);
    writeFileSync(path.join(dir, 'assets', 'index.js'), script);
    if (css !== undefined) writeFileSync(path.join(dir, 'assets', 'index.css'), css);
    return dir;
  }

  test("passes React's namespace identifiers and its error decoder", () => {
    const dir = bundleOf(
      [
        'const svg = `http://www.w3.org/2000/svg`;',
        'const help = `https://react.dev/errors/` + 418;',
        '/*$vite$:1*/',
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
    ['a plain http URL', 'const api = "http://example.com/saves";', 'contains the URL http://example.com/saves'],
    ['a WebSocket URL', 'new WebSocket(`wss://example.com/socket`);', 'contains the URL wss://example.com/socket'],
    ['an unencrypted WebSocket URL', 'new WebSocket("ws://example.com/socket");', 'contains the URL ws://example.com/socket'],
    ['a protocol-relative URL', "new Image().src = '//example.com/pixel.gif';", 'contains the URL //example.com/pixel.gif'],
    ['a URL in a comment', '/*! licence: https://example.com/licence */', 'contains the URL https://example.com/licence'],
    // Between a string holding "/*" and one holding "*/": v1's comment stripper hid all of it (DL-74).
    ['fetch( between two MIME patterns', "const accept = 'text/*'; const go = () => fetch('/api/probe'); const any = '*/*';", 'contains fetch('],
    ['a URL between two MIME patterns', "const a = 'image/*'; const b = 'https://example.com/x'; const c = '*/*';", 'contains the URL https://example.com/x'],
  ])('fails a bundle containing %s', (_name, script, complaint) => {
    const gated = run([gate, bundleOf(script)]);

    expect(gated.output).toContain(complaint);
    expect(gated.status).toBe(1);
  });

  test.each([
    ['a stylesheet', 'a url()', { css: '.a{background:url(https://example.com/track.png)}' }, ['assets', 'index.css'], 'contains the URL https://example.com/track.png'],
    ['a stylesheet', 'a protocol-relative @import', { css: '@import "//example.com/font.css";' }, ['assets', 'index.css'], 'contains the URL //example.com/font.css'],
    ['the page', 'a stylesheet link', { html: `<link rel="stylesheet" href="https://example.com/x.css">${page}` }, ['index.html'], 'contains the URL https://example.com/x.css'],
    ['the page', 'a fetch', { html: `<script>fetch('/api')</script>${page}` }, ['index.html'], 'contains fetch('],
  ])('reads %s too: fails one holding %s', (_where, _what, files, file, complaint) => {
    const gated = run([gate, bundleOf('const quiet = 1;', files)]);

    expect(gated.output).toContain(`${path.join(...file)}: ${complaint}`);
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
