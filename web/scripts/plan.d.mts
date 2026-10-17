// The exports of plan.mjs, for web's strict typecheck: src/plan.test.ts imports it (DL-327).

import type { CheckRun, TestedMainOptions } from './tested.mjs';

export interface DuplicateDecision {
  /** Whether check.yml's `check` and `e2e` are skipped: a release branch's push of a commit check passed on. */
  readonly duplicate: boolean;
  readonly reason: string;
}

export interface DuplicateOptions {
  readonly event: string;
  /** The branch pushed to, `$GITHUB_REF_NAME`. */
  readonly branch: string | undefined;
  readonly sha: string | undefined;
  /** This run, which cannot stand for itself. */
  readonly runId: string | undefined;
  /** The runs of check.yml GitHub lists for a commit, or `null` when it could not be asked. */
  readonly checkRuns: (sha: string) => readonly CheckRun[] | null;
}

/** Whether a push of the commit repeats a `check` that passed, and why. */
export declare function decideDuplicate(options: DuplicateOptions): DuplicateDecision;

/** Whether a changed path is one the built page or its browser specs read. */
export declare function browserNeeded(file: string): boolean;

export interface BrowserDecision {
  /** Whether the browser specs run. */
  readonly browser: boolean;
  readonly reason: string;
}

export interface BrowserOptions {
  readonly event: string;
  readonly sha: string | undefined;
  /** A push's `before` or a pull request's base; empty or all zeros when there is none. */
  readonly base: string | undefined;
  /** git's trimmed output, or `null` when git fails. */
  readonly git: (args: readonly string[]) => string | null;
}

/** Whether the browser specs run for the commit, and why. */
export declare function decideBrowser(options: BrowserOptions): BrowserDecision;

/** The command line, `<event> <base>`; returns the exit status. */
export declare function main(options?: TestedMainOptions): number;
