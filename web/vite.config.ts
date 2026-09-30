import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, normalizePath, type Plugin } from 'vite';

// Harvested from v1 (feature/poc, E8-S1) and adapted (M7-S1, DL-64): the build is one classic
// script so that it opens from the filesystem. v2's content is JSON, bundled as text. Its pictures
// are `media/`'s (v1.1.2-S2, DL-125 item 1): the Silhouettes inlined into the script, and every
// picture a hashed file beside it in `dist/assets/`, loaded by a relative `<img>`.

const webDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webDir, '..');

/**
 * The size under which a Silhouette is inlined into the script, as a `data:` URL. It is set, so
 * that a large SVG cannot slip into the script unnoticed (DL-125 item 1): each is a few hundred
 * bytes, and `src/media.test.ts` holds it to this. Nothing else is inlined, however small, so a
 * picture is always a file of its own.
 */
const silhouetteInlineLimit = 1024;

/**
 * The `file://` spec's build only, `vite build --mode file-spec` (e2e/file.spec.ts, v1.1.2-S2): the
 * page's catalogue of `media/` (`src/media.ts`) is read with a test picture added
 * (`e2e/fixtures/media.ts`), so the spec sees a hashed picture load before the owner's pictures come
 * (v1.1.2-S4). No other build has it, so the picture never ships.
 */
function mediaFixtures(): Plugin {
  const catalogue = normalizePath(path.join(webDir, 'src', 'media.ts'));
  const withFixtures = normalizePath(path.join(webDir, 'e2e', 'fixtures', 'media.ts'));
  return {
    name: 'heroesim:media-fixtures',
    apply: 'build',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (importer === undefined || normalizePath(importer) === withFixtures) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved !== null && normalizePath(resolved.id) === catalogue ? withFixtures : null;
    },
  };
}

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

const nodeBuiltins = new Set(builtinModules);

/**
 * A Node built-in the page imports is replaced by Vite with an empty stub in a browser build, with
 * only a warning, so its specifier never reaches the bundle and scripts/check-bundle.mjs cannot see
 * it; the stub throws when called. ESLint refuses the import in web/src; this refuses the build
 * should one slip through, from the page or a dependency (principle 12, M7 verification, DL-74).
 */
const noNodeBuiltins: Plugin = {
  name: 'heroesim:no-node-builtins',
  apply: 'build',
  enforce: 'pre',
  resolveId(source, importer) {
    if (source.startsWith('node:') || nodeBuiltins.has(source.split('/')[0] ?? '')) {
      this.error(`${importer ?? 'The page'} imports the Node built-in "${source}", which a browser does not have (principle 12).`);
    }
    return null;
  },
};

export default defineConfig(({ mode }) => ({
  // Relative asset URLs, so the built folder works from any path, Cloudflare Pages's root and
  // the filesystem included (M7-S1).
  base: './',
  plugins: [noNodeBuiltins, react(), classicScript, ...(mode === 'file-spec' ? [mediaFixtures()] : [])],
  build: {
    // Each Silhouette inlined into the one script, and nothing else: a picture is a hashed file in
    // dist/assets/ (DL-125 item 1).
    assetsInlineLimit: (file: string, content: Buffer) => path.basename(file) === 'silhouette.svg' && content.length <= silhouetteInlineLimit,
    // One chunk, as an IIFE, for the classic script above. There is no dynamic import to split.
    rolldownOptions: { output: { format: 'iife' } },
    // Vite's modulepreload polyfill injects a `fetch()` of every preloaded chunk, which
    // scripts/check-bundle.mjs refuses (principle 12). Off, so it cannot return with a change of
    // format.
    modulePreload: { polyfill: false },
    // The page is one script by design (R38, DL-88 item 5), so Vite's advice to split a chunk over
    // 500 kB cannot be taken; the warning is raised to a size the page has not reached (M9-S3,
    // DL-103: 544 kB with the shell's stylesheet and icons, 157 kB gzipped).
    chunkSizeWarningLimit: 800,
  },
  server: {
    fs: {
      // The content files and the pictures sit beside web/: ../content/*.json (src/content.ts) and
      // ../media/ (src/media.ts).
      allow: [repoRoot],
    },
  },
  preview: {
    // Bind the IPv4 loopback explicitly: where "localhost" resolves to the IPv6 loopback only,
    // Playwright's http://127.0.0.1 health check (playwright.config.ts) cannot reach it.
    host: '127.0.0.1',
  },
}));
