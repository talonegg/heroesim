// The test run "Finish" waits on (DL-150 item 11): `npm test` in the repository, its lines passed on as
// they come, so the page can show the run's progress, and its failures read from Vitest's lines.
// The editor takes the runner as a dependency, so that its own tests plant a run that fails or passes
// in a scratch copy, rather than run the whole suite inside the suite.

import { spawn } from 'node:child_process';

/** How a test run ended: whether it passed, its exit code, each failure Vitest named, and its last lines. */
export interface TestResult {
  ok: boolean;
  exitCode: number;
  failures: string[];
  tail: string[];
}

/** Runs the tests of the repository at `root`, passing on each line of their output. */
export type TestRunner = (root: string, onLine: (line: string) => void) => Promise<TestResult>;

/** Colour and cursor codes, which Vitest writes to a terminal. */
const escapes = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');

/** The lines that name a failure: Vitest's `FAIL` and `×` lines. */
export function failuresIn(lines: readonly string[]): string[] {
  const failures = lines.map((line) => line.trim()).filter((line) => /^(FAIL\b|×|✗)/.test(line));
  return [...new Set(failures)];
}

/** A runner of a command line in the root: `npm test` by default. */
export function commandRunner(command = 'npm', args: readonly string[] = ['test']): TestRunner {
  return (root, onLine) =>
    new Promise((resolve, reject) => {
      const options = { cwd: root, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: process.env.CI ?? '1' } };
      // npm is npm.cmd on Windows, which only a shell runs: the line is given it whole, its words plain.
      const child = process.platform === 'win32' ? spawn([command, ...args].join(' '), { ...options, shell: true }) : spawn(command, [...args], options);
      const lines: string[] = [];
      let partial = { out: '', err: '' };
      const take = (stream: 'out' | 'err', chunk: Buffer): void => {
        const text = partial[stream] + chunk.toString('utf8').replace(escapes, '');
        const parts = text.split(/\r?\n/);
        partial = { ...partial, [stream]: parts.pop() ?? '' };
        for (const line of parts) {
          lines.push(line);
          onLine(line);
        }
      };
      child.stdout.on('data', (chunk: Buffer) => take('out', chunk));
      child.stderr.on('data', (chunk: Buffer) => take('err', chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        for (const rest of [partial.out, partial.err]) {
          if (rest === '') continue;
          lines.push(rest);
          onLine(rest);
        }
        const exitCode = code ?? 1;
        resolve({ ok: exitCode === 0, exitCode, failures: failuresIn(lines), tail: lines.slice(-30) });
      });
    });
}

/** `npm test` in the root. */
export const npmTest: TestRunner = commandRunner();
