import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, '..');

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.toml'],
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
