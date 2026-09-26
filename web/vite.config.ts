import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Harvested from v1 (feature/poc, E8-S1) and adapted (M7-S1, DL-64): v2's content is JSON, so
// no asset type is added, and the build is one classic script so that it opens from the
// filesystem.

const webDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webDir, '..');

/**
 * Chromium refuses a module script from a `file://` page ("blocked by CORS policy"; v1 measured
 * it, DL-64 measured it again), so a built page whose script is `type="module"` renders nothing
 * when opened from the filesystem. The bundle is one IIFE (below), which needs no module loading,
 * and this turns Vite's `<script type="module" crossorigin>` into a classic `defer` script, which
 * runs after the document is parsed exactly as a module script would.
 */
const classicScript: Plugin = {
  name: 'heroesim:classic-script',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) =>
      html.replace(/<script type="module" crossorigin src=/g, '<script defer src='),
  },
};

export default defineConfig({
  // Relative asset URLs, so the built folder works from any path, Cloudflare Pages's root and
  // the filesystem included (M7-S1).
  base: './',
  plugins: [react(), classicScript],
  build: {
    // One chunk, as an IIFE, for the classic script above. There is no dynamic import to split.
    rolldownOptions: { output: { format: 'iife' } },
    // Vite's modulepreload polyfill injects a `fetch()` of every preloaded chunk, which
    // scripts/check-bundle.mjs refuses (principle 12). Off, so it cannot return with a change of
    // format.
    modulePreload: { polyfill: false },
  },
  server: {
    fs: {
      // The content files sit in a sibling workspace, ../content/*.json (src/content.ts).
      allow: [repoRoot],
    },
  },
  preview: {
    // Bind the IPv4 loopback explicitly: where "localhost" resolves to the IPv6 loopback only,
    // Playwright's http://127.0.0.1 health check (playwright.config.ts) cannot reach it.
    host: '127.0.0.1',
  },
});
