// The exports of release.mjs, for web's strict typecheck: src/release.test.ts imports it (DL-124).

import type { SpawnResult } from './deploy.mjs';

export interface ReleaseVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/** `v1.1.0` as numbers; `null` for any tag that is not a release's. */
export declare function parseTag(tag: string): ReleaseVersion | null;
/** `v1.1-release` as its line's numbers; `null` for any other branch. */
export declare function parseReleaseBranch(branch: string): { major: number; minor: number } | null;
/** Negative, zero or positive as `a` is older than, the same as or newer than `b`. */
export declare function compareTags(a: string, b: string): number;
/** The newest release tag, or `null`. */
export declare function newestTag(tags: readonly string[]): string | null;
/** The tag merging `branch` into `main` releases, or why it releases none. */
export declare function nextRelease(branch: string, tags: readonly string[]): { tag: string; refusal?: undefined } | { refusal: string; tag?: undefined };
/** Why `tag` may not deploy, or `null` when it is the newest release tag. */
export declare function deployRefusal(tag: string, tags: readonly string[]): string | null;
/** Whether a merge changing `paths` is a record only, and so releases nothing (DL-255). */
export declare function isRecordOnly(paths: readonly string[]): boolean;

export interface ReleaseMainOptions {
  readonly argv?: readonly string[];
  readonly spawn?: (command: string, args: readonly string[], options: { encoding: 'utf8' }) => SpawnResult & { stdout: string };
  readonly log?: (line: string) => void;
  readonly warn?: (line: string) => void;
}

/** The command line; returns the exit status. */
export declare function main(options?: ReleaseMainOptions): number;
