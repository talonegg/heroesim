// `npm run harness`: the harness's command line (v1.1.6-S2, DL-186 item 13), run under tsx. Its words
// are read by `commandLine` (`settings.ts`): `gate <milestone>` and `neutral <milestone>`, with
// `--expect <fingerprint>` if wanted, play a profile's sweep; `succession`, `estimate` and `calibrate`
// run a probe; `compare <a> <b>` prints what moved between two runs' JSON reports; any other words
// pass through to Vitest, as `npm run harness -- play.harness` does.
//
// A run is the harness-run and engine-run Vitest projects (the engine's twenty-year boxes, DL-230),
// with HEROESIM_HARNESS=1 set and the variables the words name; a variable set in the shell still overrides a profile's value, but not a word's.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareRuns, readRunReport, reportAt } from './run-report.js';
import { commandLine } from './settings.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');

const command = commandLine(process.argv.slice(2));
if (command.kind === 'compare') {
  console.log(compareRuns(readRunReport(reportAt(command.a)), readRunReport(reportAt(command.b))).join('\n'));
} else {
  const env = { ...process.env, HEROESIM_HARNESS: '1', ...command.env };
  const run = spawnSync(process.execPath, [vitest, 'run', '--project', 'harness-run', '--project', 'engine-run', ...command.args], { cwd: root, stdio: 'inherit', env });
  if (run.error) throw run.error;
  process.exitCode = run.status ?? 1;
}
