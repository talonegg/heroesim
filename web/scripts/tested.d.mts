// The exports of tested.mjs, for web's strict typecheck: src/tested.test.ts imports it (DL-235).

import type { SpawnResult } from './deploy.mjs';

/** The workflow whose passing run on the tested tip stands for the tests. */
export declare const checkWorkflow: string;

/** What the decision reads of a run GitHub lists for check.yml. */
export interface CheckRun {
  readonly id: number;
  /** The workflow's file, `.github/workflows/check.yml`. */
  readonly path: string;
  readonly head_sha: string;
  readonly event: string;
  readonly status: string;
  readonly conclusion: string | null;
}

export interface Decision {
  /** Whether `npm test` and the browser specs run again. */
  readonly run: boolean;
  readonly reason: string;
}

export interface DecideOptions {
  /** The workflow's event: only a push may skip the tests. */
  readonly event: string;
  readonly commit: string;
  /** git's trimmed output, or `null` when git fails. */
  readonly git: (args: readonly string[]) => string | null;
  /** The runs of check.yml GitHub lists for a commit, or `null` when it could not be asked. */
  readonly checkRuns: (sha: string) => readonly CheckRun[] | null;
}

/** Whether the tests run again for the commit, and why. */
export declare function decide(options: DecideOptions): Decision;

export interface TestedMainOptions {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly spawn?: (command: string, args: readonly string[], options: { cwd: string; encoding: 'utf8' }) => SpawnResult;
  readonly log?: (line: string) => void;
  readonly warn?: (line: string) => void;
}

/** The command line, `<event> [commit]`; returns the exit status. */
export declare function main(options?: TestedMainOptions): number;
