/**
 * The launcher: serves the built page on the loopback address and opens a browser at it
 * (E8-S7, DL-29).
 *
 * This one file is the whole program inside `heroesim.exe` — `scripts/build-exe.mjs` hands
 * it to `node --build-sea` with every file under `dist` as an asset. It is also runnable as
 * it stands, `node web/launcher/serve.mjs`, in which case it reads `dist` from disk. Both
 * ways load every file into a map once, and a request is answered by looking its path up
 * in that map: no path is ever built from a request, so there is nothing to traverse.
 *
 * Built-ins only, because a single-executable script cannot import anything else. It binds
 * 127.0.0.1 and nothing wider, and it makes no outbound request (CLAUDE.md invariant 9).
 */

import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import sea from 'node:sea';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HOST = '127.0.0.1';

/**
 * Fixed, because `localStorage` belongs to an origin and the port is part of the origin:
 * a launcher that took any free port would show an empty slot picker on every start.
 */
export const DEFAULT_PORT = 4790;

/** Where a second copy asks the first who it is. Never a file the build could produce. */
export const IDENTITY_PATH = '/__heroesim';
export const IDENTITY_BODY = 'heroesim-launcher';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function contentTypeFor(key) {
  return CONTENT_TYPES[path.posix.extname(key).toLowerCase()] ?? 'application/octet-stream';
}

/** Every file under `directory`, keyed by its forward-slashed path relative to it. */
export function filesFromDisk(directory) {
  const files = new Map();
  const walk = (current, prefix) => {
    for (const entry of readdirSync(current).sort()) {
      const full = path.join(current, entry);
      const key = prefix === '' ? entry : `${prefix}/${entry}`;
      if (statSync(full).isDirectory()) walk(full, key);
      else files.set(key, readFileSync(full));
    }
  };
  walk(directory, '');
  return files;
}

/** The same map, read out of the executable this script is running inside. */
function filesFromExecutable() {
  const files = new Map();
  for (const key of sea.getAssetKeys()) files.set(key, Buffer.from(sea.getAsset(key)));
  return files;
}

/**
 * The server, given the files. It listens nowhere until the caller says so, which is what
 * lets the tests drive it on a port of their own.
 */
export function createLauncherServer(files) {
  return http.createServer((request, response) => {
    const send = (status, type, body) => {
      response.writeHead(status, {
        'Content-Type': type,
        'Content-Length': body.length,
        // The file names carry a content hash, but index.html does not, and a player who
        // swaps one executable for a newer one on the same port must not be shown the old page.
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    const sendText = (status, text) => send(status, 'text/plain; charset=utf-8', Buffer.from(text));

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendText(405, 'Only GET and HEAD are answered here.');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${HOST}`).pathname);
    } catch {
      sendText(400, 'That address could not be read.');
      return;
    }

    if (pathname === IDENTITY_PATH) {
      sendText(200, IDENTITY_BODY);
      return;
    }

    const key = pathname === '/' ? 'index.html' : pathname.slice(1);
    const body = files.get(key);
    if (body === undefined) {
      sendText(404, 'Nothing is served at that address.');
      return;
    }
    send(200, contentTypeFor(key), body);
  });
}

/** Resolves true if whatever holds `port` answers as another copy of this launcher. */
export function isLauncherAt(port) {
  return new Promise((resolve) => {
    const request = http.get(
      { host: HOST, port, path: IDENTITY_PATH, timeout: 2000 },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => resolve(response.statusCode === 200 && text === IDENTITY_BODY));
      },
    );
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

/** `{ port, open }`, or `{ help: true }`, or `{ error }` as a sentence. */
export function parseArguments(argv) {
  const options = { port: DEFAULT_PORT, open: true };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--no-open') {
      options.open = false;
    } else if (argument === '--port' || argument.startsWith('--port=')) {
      const given = argument === '--port' ? argv[(index += 1)] : argument.slice('--port='.length);
      const port = Number(given);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { error: `--port takes a whole number from 1 to 65535, not "${given ?? ''}".` };
      }
      options.port = port;
    } else {
      return { error: `"${argument}" is not an option this understands. Try --help.` };
    }
  }
  return options;
}

const USAGE = `Heroesim — serves the game to a browser on this machine only.

  --port <n>   listen on another port (default ${DEFAULT_PORT}). Saves live in the browser and
               belong to the port: a Career saved on one port is not there on another.
  --no-open    do not open a browser; print the address and wait.
  --help       this.`;

function openBrowser(url) {
  const [command, args, options] =
    process.platform === 'win32'
      ? // `start` is a cmd built-in; the empty pair of quotes is the window title it expects.
        ['cmd', ['/c', 'start', '""', url], { windowsVerbatimArguments: true }]
      : process.platform === 'darwin'
        ? ['open', [url], {}]
        : ['xdg-open', [url], {}];
  try {
    const child = spawn(command, args, { ...options, stdio: 'ignore', detached: true });
    // The address is already printed, so a machine with no opener loses nothing.
    child.on('error', () => {});
    child.unref();
  } catch {
    // As above.
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (options.error) {
    console.error(options.error);
    process.exitCode = 1;
    return;
  }

  let files;
  if (sea.isSea()) {
    files = filesFromExecutable();
  } else {
    const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
    try {
      files = filesFromDisk(dist);
    } catch {
      files = new Map();
    }
    if (!files.has('index.html')) {
      console.error(`No built page at ${dist}. Run "npm run build" first.`);
      process.exitCode = 1;
      return;
    }
  }

  const url = `http://${HOST}:${options.port}/`;
  const server = createLauncherServer(files);

  server.on('error', async (error) => {
    if (error.code !== 'EADDRINUSE') {
      console.error(`Could not listen on ${url} — ${error.message}`);
    } else if (await isLauncherAt(options.port)) {
      console.log(`Heroesim is already running at ${url}`);
      if (options.open) openBrowser(url);
      return;
    } else {
      console.error(
        `Port ${options.port} is held by another program. Close it, or pass --port <n> — ` +
          'but saves live in the browser and belong to the port, so Careers saved on ' +
          `port ${options.port} will not be listed on another.`,
      );
    }
    process.exitCode = 1;
  });

  server.listen(options.port, HOST, () => {
    console.log(`Heroesim is being served at ${url}`);
    if (options.port !== DEFAULT_PORT) {
      console.log(
        `Saves belong to the port: Careers saved on port ${DEFAULT_PORT} are not listed here.`,
      );
    }
    console.log('Only this machine can reach it. Close this window, or press Ctrl+C, to stop.');
    if (options.open) openBrowser(url);
  });
}

// Inside the executable this file is always the program. Outside it, it is the program
// only when it was the file `node` was given — a test that imports it starts nothing.
const startedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (sea.isSea() || startedDirectly) main();
