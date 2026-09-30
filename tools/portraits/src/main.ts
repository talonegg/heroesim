// `npm run portraits -- <command>`: the portrait tool's entry (v1.1.3-S2). See cli.ts and the README.

import { run } from './cli.js';

process.exitCode = await run(process.argv.slice(2), {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
});
