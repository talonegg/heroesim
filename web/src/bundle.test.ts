// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
const contentDir = path.join(webDir, '..', 'content');

/** The bytes a built script may hold (scripts/check-bundle.mjs; DL-134 item 9, raised by DL-166): 850 kB. */
const scriptLimit = 850_000;

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

  // The build is the hook's, whose time the describe's timeout does not set: 10 s by default, which a
  // build under the whole suite's load passed (DL-205).
  beforeAll(() => {
    outDir = temporaryDir();
    built = run([vite, 'build', '--configLoader', 'runner', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], buildEnvironment());
  }, 120_000);

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
    // Each Silhouette, and the neutral one `media.ts` draws for a sex no folder knows (v1.1.2-S6).
    expect(text.match(/data:image\/svg\+xml,/g)).toHaveLength(silhouettes.length + 1);
    expect(assets.filter((file) => file !== script).filter((file) => !/-[\w-]{8}\.webp$/.test(file))).toEqual([]);
  });

  test('passes the bundle gate', () => {
    const gated = run([gate, outDir]);

    expect(gated.output).toContain('no network or filesystem reference');
    expect(gated.status).toBe(0);
  });

  // v1.1.3-S7 (DL-134 item 9, DL-143): the content's JSON is bundled as data, not as it is written,
  // so its indentation and line breaks do not count against the script's 850 kB.
  test("bundles each content file's JSON without its whitespace", () => {
    const [script = ''] = readdirSync(path.join(outDir, 'assets')).filter((file) => /^index-[\w-]+\.js$/.test(file));
    const text = readFileSync(path.join(outDir, 'assets', script), 'utf8');
    const bundled = (json: string): boolean => text.includes(json) || text.includes(JSON.stringify(json).slice(1, -1));
    for (const file of ['spheres.json', 'skills.json', 'dispositions.json']) {
      const written = readFileSync(path.join(contentDir, file), 'utf8');
      const compact = JSON.stringify(JSON.parse(written));
      expect(written, file).not.toBe(compact);
      expect(bundled(compact), `${file} compact`).toBe(true);
      expect(bundled(written), `${file} as written`).toBe(false);
    }
  });

  // v1.1.4-S6's verification (DL-157): the content package's manifests are no content, and each
  // picture's URL resolves against the script's address, worked out once.
  test("bundles neither of the content package's manifests", () => {
    const [script = ''] = readdirSync(path.join(outDir, 'assets')).filter((file) => /^index-[\w-]+\.js$/.test(file));
    const text = readFileSync(path.join(outDir, 'assets', script), 'utf8');
    expect(text).not.toContain('@heroesim/content');
    expect(text).not.toContain('compilerOptions');
  });

  test("works out the script's address once, and resolves every picture's URL against it", () => {
    const [script = ''] = readdirSync(path.join(outDir, 'assets')).filter((file) => /^index-[\w-]+\.js$/.test(file));
    const text = readFileSync(path.join(outDir, 'assets', script), 'utf8');
    const pictures = readdirSync(path.join(outDir, 'assets')).filter((file) => file.endsWith('.webp'));
    expect(text.match(/document\.baseURI/g)).toHaveLength(1);
    expect(pictures.length).toBeGreaterThanOrEqual(80);
    // The one name, minified, as each picture's base: `new URL(\`gm-female-01-<hash>.webp\`,t)`.
    const [, base] = /new URL\(`[\w.-]+\.webp`,(\w+)\)/.exec(text) ?? [];
    expect(base).toBeDefined();
    for (const picture of pictures) expect(text.includes(`new URL(\`${picture}\`,${base})`), picture).toBe(true);
  });

  // v1.1.6-S4 (DL-186 item 14): the content version is data, `content/version.json`, which the page
  // bundles with the content, but its changelog is for the people who read the file, and is bundled
  // empty; and the tools' write module, `@heroesim/content/write`, is in no built file.
  test("bundles the content version without its changelog, and none of content's write module", () => {
    const [script = ''] = readdirSync(path.join(outDir, 'assets')).filter((file) => /^index-[\w-]+\.js$/.test(file));
    const text = readFileSync(path.join(outDir, 'assets', script), 'utf8');
    const written = JSON.parse(readFileSync(path.join(contentDir, 'version.json'), 'utf8')) as { version: number; changelog: string[] };
    const bundled = JSON.stringify({ version: written.version, changelog: [] });
    expect(text.includes(bundled) || text.includes(JSON.stringify(bundled).slice(1, -1))).toBe(true);
    expect(written.changelog.length).toBeGreaterThan(10);
    for (const entry of written.changelog) expect(text.includes(entry.slice(0, 40)), entry).toBe(false);
    const write = readFileSync(path.join(contentDir, 'src', 'write', 'errors.ts'), 'utf8');
    const mark = 'could not be put back';
    expect(write).toContain(mark);
    expect(text).not.toContain(mark);
  });

  // v1.1.6-S18 (DL-186 item 15, DL-204): the defaults' values are data, `engine/src/config.json`,
  // which the engine imports; its changelog is for the people who read the file, and is bundled empty.
  test("bundles the defaults' values without their changelog", () => {
    const [script = ''] = readdirSync(path.join(outDir, 'assets')).filter((file) => /^index-[\w-]+\.js$/.test(file));
    const text = readFileSync(path.join(outDir, 'assets', script), 'utf8');
    const written = JSON.parse(readFileSync(path.join(webDir, '..', 'engine', 'src', 'config.json'), 'utf8')) as { changelog: string[] };
    expect(written.changelog.length).toBeGreaterThan(10);
    for (const entry of written.changelog) expect(text.includes(entry.slice(0, 40)), entry).toBe(false);
    expect(text).toContain('guildmasterRegardOnPatronSuccess');
  });

  // v1.1.6-S6 (DL-192): the old form of an Encounter and a Synergy is no longer read, so the words
  // its refusals were written in, which v1.1.5's parser and register held, are in no built file.
  test("holds none of the words the old content form's refusals were written in", () => {
    const [script = ''] = readdirSync(path.join(outDir, 'assets')).filter((file) => /^index-[\w-]+\.js$/.test(file));
    const text = readFileSync(path.join(outDir, 'assets', script), 'utf8');
    const marks = ['names no Class and no Skill', 'a count is a whole number from 1', 'what a Synergy requires', 'with no Query to filter', 'in the old form'];
    expect(marks.filter((mark) => text.includes(mark))).toEqual([]);
  });

  test('builds a script under the 850 kB the gate allows', () => {
    const [script = ''] = readdirSync(path.join(outDir, 'assets')).filter((file) => /^index-[\w-]+\.js$/.test(file));
    expect(statSync(path.join(outDir, 'assets', script)).size).toBeLessThan(scriptLimit);
  });

  // v1.1.4-S14 (DL-150 item 7, the epic's Gate: "The editor is in no file of the built game"), checked
  // by hand at S12 (DL-161) and held here: words only the content editor's page and commands, or the
  // register of a Trait's uses, hold are in no built file. Each is first found in its own source, so
  // a word the editor stops using cannot leave the check empty.
  test("holds no file of the content editor or the register of a Trait's uses", () => {
    const repo = path.join(webDir, '..');
    const register = readFileSync(path.join(repo, 'content', 'src', 'uses', 'register.ts'), 'utf8');
    const page = readFileSync(path.join(repo, 'tools', 'editor', 'page', 'page.js'), 'utf8');
    const html = readFileSync(path.join(repo, 'tools', 'editor', 'page', 'index.html'), 'utf8');
    const doctor = readFileSync(path.join(repo, 'tools', 'editor', 'src', 'doctor.ts'), 'utf8');
    const entries = [...register.matchAll(/^ {2}id: '([\w-]+)',$/gm)].map((hit) => hit[1] ?? '');
    const marks = [...entries.filter((id) => id.includes('-')), '/api/traits', 'Save as pending', 'reads of a Trait'];
    expect(entries.length).toBeGreaterThanOrEqual(8);
    for (const mark of marks.slice(-3)) expect([page, html, doctor].some((text) => text.includes(mark)), mark).toBe(true);
    const files = readdirSync(outDir, { recursive: true, encoding: 'utf8' }).filter((file) => /\.(js|html|css)$/.test(file));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) {
      const text = readFileSync(path.join(outDir, file), 'utf8');
      expect(marks.filter((mark) => text.includes(mark)), file).toEqual([]);
    }
  });
});

describe('a Node built-in the page imports', { timeout: 120_000 }, () => {
  /** Builds a page of one script, `probe.ts`, with the page's own Vite configuration. */
  function buildProbe(script: string): { status: number | null; output: string } {
    const root = temporaryDir();
    writeFileSync(path.join(root, 'index.html'), '<!doctype html><div id="root"></div><script type="module" src="./probe.ts"></script>');
    writeFileSync(path.join(root, 'probe.ts'), script);
    const config = path.join(webDir, 'vite.config.ts');
    return run([vite, 'build', root, '--configLoader', 'runner', '--config', config, '--outDir', temporaryDir(), '--emptyOutDir', '--logLevel', 'error'], buildEnvironment());
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

  // v1.1.3-S7 (DL-134 item 9; 850 kB since DL-166): the one script is held under 850 kB, so the page stays as quick to open
  // as it is. A stylesheet or the page itself is not a script, and is not held to it.
  test('fails a script over 850 kB, naming its size, and passes one of 850 kB', () => {
    // `const pad = '` and `';` are 15 characters. Padded with digits: a long run of letters would
    // keep the gate's search for a URL's scheme at every letter of it.
    const over = run([gate, bundleOf(`const pad = '${'0'.repeat(scriptLimit - 14)}';`)]);
    const at = run([gate, bundleOf(`const pad = '${'0'.repeat(scriptLimit - 15)}';`)]);

    expect(over.output).toContain(`${path.join('assets', 'index.js')}: a script of 850.00 kB (850,001 bytes), over the 850 kB a script may be`);
    expect(over.status).toBe(1);
    expect(at.output).toContain('no network or filesystem reference');
    expect(at.status).toBe(0);
  });

  test("holds no stylesheet to the script's limit", () => {
    expect(run([gate, bundleOf('const quiet = 1;', { css: `.a{content:'${'0'.repeat(scriptLimit)}'}` })]).status).toBe(0);
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
