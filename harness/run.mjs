// `npm run harness`: runs the harness-run Vitest project with HEROESIM_HARNESS=1 set.
//
// A script rather than `HEROESIM_HARNESS=1 vitest run` in package.json because that syntax
// fails in Windows shells, and a script needs no dependency such as cross-env. Extra arguments
// pass through to Vitest: `npm run harness -- --reporter=verbose`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const run = spawnSync(
  process.execPath,
  [vitest, 'run', '--project', 'harness-run', ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit', env: { ...process.env, HEROESIM_HARNESS: '1' } },
);

if (run.error) throw run.error;
process.exit(run.status ?? 1);
