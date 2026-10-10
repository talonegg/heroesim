// `npm run measure -- <command>` (DL-233): v1.1.9's measures, read from the files the runs write,
// so that each story's before and after are the same tables (DL-231 Q6, Q17).
// - `suite <report.json>...`: a Vitest JSON report's time per project, file and test;
// - `coverage [<coverage-summary.json>]`: `npm run coverage`'s summary per package;
// - `ci <run-id>...`: a workflow run's jobs and minutes, read through `gh`;
// - `profile <file.cpuprofile>...`: where a profiled game's time goes.
// Exit codes: 0 done, 2 a usage error.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ciTables, type CiRun } from './ci.js';
import { coverageTables, type CoverageSummary } from './coverage.js';
import { profileTables, type CpuProfile } from './profile.js';
import { suiteTables, type VitestReport } from './suite.js';

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  /** A run's JSON from GitHub, by its id. */
  ciRun: (id: string) => CiRun;
}

export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

export const ghRun = (id: string): CiRun => JSON.parse(execFileSync('gh', ['run', 'view', id, '--json', 'jobs,displayTitle,headSha'], { encoding: 'utf8' })) as CiRun;

const usage = [
  'Usage: npm run measure -- <command>',
  '',
  '  suite <report.json>...          time per project, file and test, from Vitest\'s JSON reporter',
  '  coverage [<summary.json>]       coverage per package (default coverage/coverage-summary.json)',
  '  ci <run-id>...                  a workflow run\'s jobs and billed minutes, through gh',
  '  profile <file.cpuprofile>...    where a profiled game\'s time goes',
].join('\n');

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

export function run(argv: readonly string[], io: Io, root: string = repositoryRoot): number {
  const [command, ...rest] = argv;
  const each = (render: (arg: string) => string[]): number => {
    rest.forEach((arg, at) => io.out([...(at > 0 ? [''] : []), `## ${arg}`, '', ...render(arg)].join('\n')));
    return 0;
  };
  if (command === 'suite' && rest.length > 0) return each((path) => suiteTables(readJson<VitestReport>(path)));
  if (command === 'profile' && rest.length > 0) return each((path) => profileTables(readJson<CpuProfile>(path)));
  if (command === 'ci' && rest.length > 0) return each((id) => ciTables(id, io.ciRun(id)));
  if (command === 'coverage' && rest.length <= 1) {
    io.out(coverageTables(readJson<CoverageSummary>(rest[0] ?? join(root, 'coverage', 'coverage-summary.json'))).join('\n'));
    return 0;
  }
  if (command === undefined || command === 'help' || command === '--help') {
    io.out(usage);
    return 0;
  }
  io.err(usage);
  return 2;
}
