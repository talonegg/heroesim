// `npm run harness`: runs the harness-run Vitest project with HEROESIM_HARNESS=1 set.
//
// A script rather than `HEROESIM_HARNESS=1 vitest run` in package.json because that syntax
// fails in Windows shells, and a script needs no dependency such as cross-env. Extra arguments
// pass through to Vitest: `npm run harness -- --reporter=verbose`.
//
// A first argument that names a probe sets HEROESIM_PROBE to it and runs only its file, as the
// variable does in a POSIX shell: `npm run harness -- calibrate` is
// `HEROESIM_PROBE=calibrate npm run harness` (v1.1.4-S9, DL-162). The probes are
// harness/src/succession.ts's `probeNames`; a test there holds this list equal to it.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const probes = ['succession', 'estimate', 'calibrate'];

const root = fileURLToPath(new URL('..', import.meta.url));
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const [first, ...rest] = process.argv.slice(2);
const probe = probes.includes(first) ? first : undefined;
const args = probe === undefined ? process.argv.slice(2) : [`${probe}.harness`, ...rest];
const env = { ...process.env, HEROESIM_HARNESS: '1', ...(probe === undefined ? {} : { HEROESIM_PROBE: probe }) };

const run = spawnSync(process.execPath, [vitest, 'run', '--project', 'harness-run', ...args], { cwd: root, stdio: 'inherit', env });

if (run.error) throw run.error;
process.exit(run.status ?? 1);
