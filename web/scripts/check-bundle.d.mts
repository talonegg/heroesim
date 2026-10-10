// The exports of check-bundle.mjs, for web's strict typecheck: src/bundle.test.ts imports it (DL-247).

/** What the gate finds under a build's folder. */
export type BundleScan =
  | { readonly kind: 'missing' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'scanned'; readonly files: number; readonly complaints: readonly string[]; readonly tooLarge: readonly string[] };

/** What the gate finds under `distDir`. */
export declare function scanBundle(distDir: string): BundleScan;

/** The gate on `distDir`, as its command line runs it: what it says, through `log` and `warn`, and its exit code. */
export declare function checkBundle(distDir: string, io?: { log?: (line: string) => void; warn?: (line: string) => void }): number;
