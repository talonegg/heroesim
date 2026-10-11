// The exports of deploy.mjs, for web's strict typecheck: src/deploy.test.ts and
// playwright.live.config.ts import it (v1.0.1-S3, DL-94). The script itself is plain Node,
// run by `npm run deploy` with no build step.

import type { SpawnSyncOptions } from 'node:child_process';

/** The branch Pages publishes as production: `main` (DL-124). */
export declare const productionBranch: string;

/** The page's two addresses: the Worker's and the Pages project's. */
export declare const addresses: { readonly worker: string; readonly pages: string };

/** Whether a request the page at `baseURL` made leaves it; Pages may ask Cloudflare's beacon (DL-279). */
export declare function leavesThePage(baseURL: string, url: string): boolean;

export declare const pagesProject: string;
export declare const workerConfig: string;

/** What the deploy reads of a finished child process: `spawnSync`'s result, or a test's. */
export interface SpawnResult {
  readonly status: number | null;
  readonly stdout?: string | Buffer | null;
  readonly error?: Error;
}

/** `spawnSync`'s shape, so a test can stand in for git, npm and wrangler. */
export type Spawn = (command: string, args: readonly string[], options: SpawnSyncOptions) => SpawnResult;

export interface DeployOptions {
  /** The arguments after the script: only `--dry-run` is accepted. */
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  /** web/: where wrangler.jsonc is, and where npm, npx and git run. */
  readonly webDir?: string;
  /** Node itself, which runs npm and npx. */
  readonly execPath?: string;
  /** Where wrangler's record files are made. */
  readonly tmpdir?: string;
  readonly spawn?: Spawn;
  readonly log?: (line: string) => void;
  readonly warn?: (line: string) => void;
  readonly now?: () => Date;
}

/** The two wrangler runs as npx's arguments: the Worker's first, then Pages'. */
export declare function wranglerCommands(tag: string, commit: string): { worker: string[]; pages: string[] };

/** Deploy, or refuse; returns the exit status. */
export declare function deploy(options?: DeployOptions): number;
