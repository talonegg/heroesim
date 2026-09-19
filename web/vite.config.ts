import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, '..');

export default defineConfig({
  // Relative asset URLs, so the built folder opens from the filesystem with no
  // server at all (E8 §0: "npm run build produces a folder you can open").
  base: './',
  plugins: [react()],
  assetsInclude: ['**/*.toml'],
  build: {
    // Vite's modulepreload polyfill injects a `fetch()` of every preloaded
    // chunk. There is exactly one chunk and no dynamic import here, so the
    // polyfill buys nothing and costs the only `fetch(` in the bundle — which
    // scripts/check-bundle.mjs refuses (E8-S1, invariant 9: no network).
    modulePreload: { polyfill: false },
  },
  server: {
    fs: {
      // Allow serving files from sibling workspaces (e.g. ../content/vignettes/*.toml).
      allow: [repoRoot],
    },
  },
  preview: {
    // Bind IPv4 loopback explicitly: on this host "localhost" resolves to the
    // IPv6 loopback only, which Playwright's http://127.0.0.1 healthcheck
    // (playwright.config.ts) cannot reach.
    host: '127.0.0.1',
  },
});
