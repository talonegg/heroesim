// The exports of cloudflare.mjs, for web's strict typecheck: src/cloudflare.test.ts imports it (DL-124).

/** The part of `fetch` the checks use. */
export type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface CloudflareOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetch?: Fetch;
  readonly now?: () => Date;
}

/** Days before its expiry from which the token is reported. */
export declare const tokenWarningDays: number;
/** Why a deploy would make a preview, or `null` when Pages's production branch is `productionBranch`. */
export declare function pagesRefusal(options?: CloudflareOptions): Promise<string | null>;
/** Why the token needs attention, or `null`. */
export declare function tokenRefusal(options?: CloudflareOptions): Promise<string | null>;
/** The command line; resolves to the exit status. */
export declare function main(
  options?: CloudflareOptions & { argv?: readonly string[]; log?: (line: string) => void; warn?: (line: string) => void },
): Promise<number>;
