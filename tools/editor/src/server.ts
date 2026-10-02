// The editor's page (v1.1.4-S12, DL-150 item 7): `npm run edit` serves `tools/editor/page/` from the
// repository on this machine only (127.0.0.1), and the page works through a small JSON API over the
// same core the commands use. Nothing of it is built into the game or deployed.
//
//   GET    /api/traits               the forms, every row with its uses, the pending edits
//   GET    /api/traits/<key>         one row (show)
//   GET    /api/find?text=<text>     the rows that hold the text
//   POST   /api/traits               add: { list, key, ...fields }
//   PUT    /api/traits/<key>         change: { ...fields }
//   DELETE /api/traits/<key>         remove; refused (409) while used, naming every use
//   POST   /api/discard              { key? }: drop the pending edits, or one row's
//   GET    /api/doctor               the doctor's report
//   POST   /api/finish               start "Finish"; 409 while one runs
//   GET    /api/finish               its state, its lines so far and its result
//
// A refusal is `{ ok: false, kind, problems, uses? }`, with 422, or 409 for a removal refused by its
// uses and for any call while "Finish" runs (`busy`).
//
// Only this page may call it (the verification of v1.1.4-S12): a request is refused (403) unless its
// Host is 127.0.0.1:<port> or localhost:<port>, so a name rebound to this machine reaches nothing, and
// unless its Origin, where it has one, is this page's; and a request that changes anything must be
// JSON (415), which no other site's form can send without asking first.

import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NotUndone, Undone } from '@heroesim/portraits';
import { doctor } from './doctor.js';
import { Editor, Refused, type Finished } from './editor.js';
import { Busy } from './finish-journal.js';
import { npmTest, type TestRunner } from './tests-run.js';
import { readContentFiles } from './content-files.js';

/** The page's files, beside this package's source. */
export const pageDir = fileURLToPath(new URL('../page/', import.meta.url));

const pageFiles: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/page.js': { file: 'page.js', type: 'text/javascript; charset=utf-8' },
  '/page.css': { file: 'page.css', type: 'text/css; charset=utf-8' },
};

/** "Finish" as the page follows it. */
interface FinishState {
  state: 'idle' | 'running' | 'passed' | 'failed';
  lines: string[];
  result: Finished | null;
  problems: string[];
}

export interface Served {
  url: string;
  close(): Promise<void>;
  /** The run "Finish" started, if any, for a test to wait on. */
  finishing(): Promise<void>;
}

class BadRequest extends Error {}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BadRequest('the body is not JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new BadRequest('the body is a JSON object');
  return value as Record<string, unknown>;
}

/** Serves the page and its API for the repository at `root`, on `port` (0 for any free one). */
export async function serve({ root, port = 4180, runTests = npmTest }: { root: string; port?: number; runTests?: TestRunner }): Promise<Served> {
  const editor = new Editor(root);
  let finish: FinishState = { state: 'idle', lines: [], result: null, problems: [] };
  let running: Promise<void> = Promise.resolve();

  const everything = (): unknown => ({
    kind: editor.kind.name,
    title: editor.kind.title,
    forms: editor.kind.forms(readContentFiles(root).values),
    rows: editor.rows(),
    pending: editor.edits(),
  });

  async function api(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const method = request.method ?? 'GET';
    const parts = url.pathname.split('/').filter((part) => part !== '').slice(1).map(decodeURIComponent);
    const [what, key] = parts;
    if (what === 'traits' && key === undefined && method === 'GET') return send(response, 200, everything());
    if (what === 'traits' && key === undefined && method === 'POST') {
      const { list, key: newKey, ...fields } = await body(request);
      if (typeof list !== 'string' || typeof newKey !== 'string') throw new BadRequest('add wants a list and a key');
      return send(response, 200, { ok: true, row: editor.add(list, newKey, fields), ...(everything() as object) });
    }
    if (what === 'traits' && key !== undefined && method === 'GET') return send(response, 200, editor.show(key));
    if (what === 'traits' && key !== undefined && method === 'PUT') return send(response, 200, { ok: true, row: editor.change(key, await body(request)), ...(everything() as object) });
    if (what === 'traits' && key !== undefined && method === 'DELETE') return send(response, 200, { ok: true, removed: editor.remove(key), ...(everything() as object) });
    if (what === 'find' && method === 'GET') return send(response, 200, { text: url.searchParams.get('text') ?? '', found: editor.find(url.searchParams.get('text') ?? '') });
    if (what === 'discard' && method === 'POST') {
      const { key: one } = await body(request);
      if (one !== undefined && typeof one !== 'string') throw new BadRequest('discard takes a key, or none');
      return send(response, 200, { ok: true, discarded: editor.discard(one), ...(everything() as object) });
    }
    if (what === 'doctor' && method === 'GET') return send(response, 200, doctor(root));
    if (what === 'finish' && method === 'GET') return send(response, 200, finish);
    if (what === 'finish' && method === 'POST') {
      if (finish.state === 'running') return send(response, 409, { ok: false, kind: 'refused', problems: ['"Finish" is running already'] });
      finish = { state: 'running', lines: [], result: null, problems: [] };
      running = editor
        .finish(runTests, (line) => finish.lines.push(line))
        .then((result) => {
          finish = { ...finish, state: 'passed', result };
        })
        .catch((error: unknown) => {
          const problems =
            error instanceof Refused || error instanceof Undone || error instanceof Busy
              ? [...error.problems]
              : error instanceof NotUndone
                ? [...error.problems, ...error.left.map((file) => `not put back: ${file}`)]
                : [error instanceof Error ? error.message : String(error)];
          finish = { ...finish, state: 'failed', problems };
        });
      return send(response, 202, finish);
    }
    return send(response, 404, { ok: false, kind: 'usage', problems: [`${method} ${url.pathname} is not part of the editor's API`] });
  }

  /** Why a request is refused before it is read, or `null`: not to this page, from another page, or a change not in JSON. */
  const refusal = (request: IncomingMessage): { status: number; problem: string } | null => {
    const port = (server.address() as AddressInfo).port;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(request.headers.host ?? '')) return { status: 403, problem: `the Host is ${request.headers.host ?? 'missing'}: the editor answers ${hosts.join(' or ')} alone` };
    const origin = request.headers.origin;
    if (origin !== undefined && !hosts.some((host) => origin === `http://${host}`)) return { status: 403, problem: `a request from ${origin} is not the editor's page` };
    const method = request.method ?? 'GET';
    if (!['GET', 'HEAD'].includes(method) && !/^application\/json(;|\s*$)/i.test(request.headers['content-type'] ?? '')) {
      return { status: 415, problem: `a ${method} is sent as application/json` };
    }
    return null;
  };

  const server = createServer((request, response) => {
    const refused = refusal(request);
    if (refused !== null) return send(response, refused.status, { ok: false, kind: 'refused', problems: [refused.problem] });
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/')) {
      const page = pageFiles[url.pathname];
      if (page === undefined || request.method !== 'GET') return send(response, 404, { ok: false, kind: 'usage', problems: [`${url.pathname} is not a page of the editor`] });
      response.writeHead(200, { 'content-type': page.type, 'cache-control': 'no-store' });
      response.end(readFileSync(path.join(pageDir, page.file)));
      return;
    }
    api(request, response, url).catch((error: unknown) => {
      if (error instanceof Busy) send(response, 409, { ok: false, kind: 'busy', problems: error.problems });
      else if (error instanceof Refused) {
        const status = error.uses.length > 0 ? 409 : 422;
        send(response, status, { ok: false, kind: 'refused', problems: error.problems, ...(error.uses.length > 0 ? { uses: error.uses } : {}) });
      } else if (error instanceof BadRequest) send(response, 400, { ok: false, kind: 'usage', problems: [error.message] });
      else send(response, 500, { ok: false, kind: 'failed', problems: [error instanceof Error ? error.message : String(error)] });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error)))),
    finishing: () => running,
  };
}
