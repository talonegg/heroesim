// `npm run measure -- <command>`: v1.1.9's measures (DL-233). See cli.ts.

import { ghRun, run } from './cli.js';

process.exitCode = run(process.argv.slice(2), {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  ciRun: ghRun,
});
