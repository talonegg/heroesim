// `npm run decisions -- <command>`: the decision log's tool (DL-215). See cli.ts.

import { run } from './cli.js';

process.exitCode = run(process.argv.slice(2), {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
});
