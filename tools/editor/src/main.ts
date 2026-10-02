// `npm run edit`: the content editor's entry (v1.1.4-S12). With no command it serves the page; with
// one it runs it. See cli.ts, server.ts and the README.

import { parse, run, UsageError } from './cli.js';
import { serve } from './server.js';

const argv = process.argv.slice(2);
let page: { root: string; port: number } | null = null;
try {
  const options = parse(argv);
  if (options.kind === '' && !argv.includes('--help')) page = { root: options.root, port: options.port };
} catch (error) {
  // `run` says what is wrong with the line.
  if (!(error instanceof UsageError)) throw error;
}

if (page === null) {
  process.exitCode = await run(argv, {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
  });
} else {
  const served = await serve(page);
  process.stdout.write(`The content editor is at ${served.url}, on this machine only. Ctrl+C stops it.\n`);
  process.stdout.write(`It edits ${page.root}. Nothing is written to the content before "Finish", and nothing is committed.\n`);
}
