// @vitest-environment node
/**
 * The launcher that goes inside `heroesim.exe` (E8-S7, DL-29).
 *
 * What is driven here is the real server on a real loopback socket, given a map of files —
 * which is exactly what it is given inside the executable, where the map comes from the
 * embedded assets instead of a directory. The executable itself is not built here: that
 * takes a copy of `node` and several seconds, and `scripts/build-exe.mjs` proves its own
 * output starts before it reports success.
 *
 * The launcher is a plain `.mjs` outside `src`, so it is loaded by file URL at run time,
 * as `save-interop.test.ts` loads the terminal's slot module.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface LauncherModule {
  HOST: string;
  DEFAULT_PORT: number;
  IDENTITY_PATH: string;
  IDENTITY_BODY: string;
  contentTypeFor: (key: string) => string;
  filesFromDisk: (directory: string) => Map<string, Buffer>;
  createLauncherServer: (files: Map<string, Buffer>) => Server;
  isLauncherAt: (port: number) => Promise<boolean>;
  parseArguments: (
    argv: string[],
  ) => { port: number; open: boolean } | { help: true } | { error: string };
}

const launcher = (await import(
  /* @vite-ignore */ new URL('../launcher/serve.mjs', import.meta.url).href
)) as LauncherModule;

const PAGE = '<!doctype html><title>Heroesim</title>';
const SCRIPT = 'console.log("a Commission")';

const scratch = mkdtempSync(join(tmpdir(), 'heroesim-launcher-'));
mkdirSync(join(scratch, 'assets'));
writeFileSync(join(scratch, 'index.html'), PAGE);
writeFileSync(join(scratch, 'assets', 'index-abc123.js'), SCRIPT);

let server: Server;
let origin: string;
let port: number;

function listen(target: Server): Promise<number> {
  return new Promise((resolve) => {
    target.listen(0, launcher.HOST, () => resolve((target.address() as AddressInfo).port));
  });
}

beforeAll(async () => {
  server = launcher.createLauncherServer(launcher.filesFromDisk(scratch));
  port = await listen(server);
  origin = `http://${launcher.HOST}:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(scratch, { recursive: true, force: true });
});

describe('the files it is given', () => {
  it('are keyed by forward-slashed path, whatever the platform joins with', () => {
    expect([...launcher.filesFromDisk(scratch).keys()].sort()).toEqual([
      'assets/index-abc123.js',
      'index.html',
    ]);
  });
});

describe('what it serves', () => {
  it('serves the page at the root, as HTML', async () => {
    const response = await fetch(`${origin}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toBe(PAGE);
  });

  it('serves a built script as JavaScript — a module script is refused under any other type', async () => {
    const response = await fetch(`${origin}/assets/index-abc123.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(await response.text()).toBe(SCRIPT);
  });

  it('ignores a query string', async () => {
    const response = await fetch(`${origin}/index.html?seed=7`);
    expect(await response.text()).toBe(PAGE);
  });

  it('tells the browser to ask again, so a newer executable is never hidden by an old page', async () => {
    const response = await fetch(`${origin}/`);
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('answers HEAD with the length and no body', async () => {
    const response = await fetch(`${origin}/`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe(String(PAGE.length));
    expect(await response.text()).toBe('');
  });

  it('knows a type for everything a Vite build writes', () => {
    expect(launcher.contentTypeFor('assets/index-abc.css')).toBe('text/css; charset=utf-8');
    expect(launcher.contentTypeFor('assets/INDEX.JS')).toBe('text/javascript; charset=utf-8');
    expect(launcher.contentTypeFor('favicon.svg')).toBe('image/svg+xml');
    expect(launcher.contentTypeFor('something.else')).toBe('application/octet-stream');
  });
});

describe('what it refuses', () => {
  it('gives 404 for a file it was not given', async () => {
    expect((await fetch(`${origin}/assets/nothing.js`)).status).toBe(404);
  });

  it('cannot be walked out of: a path is looked up, never resolved', async () => {
    // fetch() would tidy `..` away before sending, so the encoded forms are what reach it.
    for (const attempt of ['/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/package.json', '/assets/..%5c..%5cpackage.json']) {
      expect((await fetch(`${origin}${attempt}`)).status, attempt).toBe(404);
    }
  });

  it('gives 400, not a crash, for an address that cannot be decoded', async () => {
    expect((await fetch(`${origin}/%E0%A4%A`)).status).toBe(400);
    expect((await fetch(`${origin}/`)).status).toBe(200);
  });

  it('answers nothing but GET and HEAD', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await fetch(`${origin}/`, { method });
      expect(response.status, method).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
    }
  });
});

describe('a second copy on the same port', () => {
  it('recognises the first as itself', async () => {
    const response = await fetch(`${origin}${launcher.IDENTITY_PATH}`);
    expect(await response.text()).toBe(launcher.IDENTITY_BODY);
    expect(await launcher.isLauncherAt(port)).toBe(true);
  });

  it('does not mistake another program for itself', async () => {
    const { createServer } = await import('node:http');
    const stranger = createServer((_request, response) => response.end('somebody else'));
    const strangerPort = await listen(stranger);
    try {
      expect(await launcher.isLauncherAt(strangerPort)).toBe(false);
    } finally {
      await new Promise((resolve) => stranger.close(resolve));
    }
  });

  it('does not mistake a closed port for itself', async () => {
    const { createServer } = await import('node:http');
    const gone = createServer();
    const gonePort = await listen(gone);
    await new Promise((resolve) => gone.close(resolve));
    expect(await launcher.isLauncherAt(gonePort)).toBe(false);
  });
});

describe('its options', () => {
  it('defaults to the fixed port, because saves belong to the origin, and opens a browser', () => {
    expect(launcher.DEFAULT_PORT).toBe(4790);
    expect(launcher.parseArguments([])).toEqual({ port: 4790, open: true });
  });

  it('binds the loopback address and nothing wider', () => {
    expect(launcher.HOST).toBe('127.0.0.1');
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });

  it('takes --port either way, and --no-open', () => {
    expect(launcher.parseArguments(['--port', '5000'])).toEqual({ port: 5000, open: true });
    expect(launcher.parseArguments(['--port=5000', '--no-open'])).toEqual({
      port: 5000,
      open: false,
    });
  });

  it('refuses a port that is not one, in a sentence', () => {
    for (const bad of [['--port', 'abc'], ['--port', '0'], ['--port', '70000'], ['--port=1.5'], ['--port']]) {
      expect(launcher.parseArguments(bad), bad.join(' ')).toEqual({
        error: expect.stringContaining('--port takes a whole number'),
      });
    }
  });

  it('refuses an option it does not know rather than ignoring it', () => {
    expect(launcher.parseArguments(['--prot', '5000'])).toEqual({
      error: expect.stringContaining('"--prot"'),
    });
  });

  it('offers help', () => {
    expect(launcher.parseArguments(['--help'])).toEqual({ help: true });
    expect(launcher.parseArguments(['-h'])).toEqual({ help: true });
  });
});
