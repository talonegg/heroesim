import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { contentGate } from './content-gate';

// Harvested from v1 (feature/poc, E8-S1) and adapted (M7-S1, DL-64): the build is one classic
// script so that it opens from the filesystem. v2's content is JSON, bundled as text. Its pictures
// are `media/`'s (v1.1.2-S2, DL-125 item 1): the Silhouettes inlined into the script, and every
// picture a hashed file beside it in `dist/assets/`, loaded by a relative `<img>`.
//
// The one script finds its pictures from its own address: the IIFE resolves each against
// `document.currentScript.src` as it first runs, so `./assets/gm-female-01-<hash>.webp` is beside the
// script over `file://` and on the page's own origin alike. That holds only while the script stays a
// classic, non-async `<script>` (`classicScript`, below): a module script has no `currentScript`, and
// the IIFE's fallback, `document.baseURI`, is the page's own folder, where no picture is
// (v1.1.2-S2's verification, DL-131).

const webDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * The script's own address, worked out once as the IIFE first runs, and every picture's URL resolved
 * against it (`renderBuiltUrl`, below). Vite writes the same `document.currentScript…` expression into
 * each picture's URL, some 130 bytes each, 10 kB for the Guildmasters' 80 files alone; one name for
 * it, set in the IIFE's intro, keeps the one rule and those bytes (v1.1.4-S6's verification, DL-157).
 */
const scriptBase = '__heroesimScript';
const scriptBaseIntro =
  `var ${scriptBase}=document.currentScript&&document.currentScript.tagName.toUpperCase()==="SCRIPT"&&document.currentScript.src||document.baseURI;`;
const repoRoot = path.resolve(webDir, '..');

/**
 * The size under which a Silhouette is inlined into the script, as a `data:` URL. It is set, so
 * that a large SVG cannot slip into the script unnoticed (DL-125 item 1): each is a few hundred
 * bytes, and `src/media.test.ts` holds it to this. Nothing else is inlined, however small, so a
 * picture is always a file of its own.
 */
const silhouetteInlineLimit = 1024;

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

const contentDir = path.join(repoRoot, 'content');

/**
 * The content's JSON bundled as data, without the indentation and line breaks it is written with
 * (v1.1.3-S7, DL-134 item 9, DL-143): `src/content.ts` takes each file as text, which Vite would
 * bundle as written, about 24 kB of whitespace in an 800 kB script. Only the files of `content/`
 * taken `?raw` are read here, and each is parsed, so a file that is not JSON fails the build. What
 * `parseContent` makes of the text is the same either way (`src/content.test.ts`). The content
 * version's file is bundled with its changelog empty (v1.1.6-S4, DL-186 item 14): the changelog is for
 * the people who read the file, some 5 kB the page never shows.
 */
const compactContent: Plugin = {
  name: 'heroesim:compact-content',
  enforce: 'pre',
  async load(id) {
    const [file = '', query] = id.split('?');
    if (query !== 'raw' || path.extname(file) !== '.json' || path.dirname(path.resolve(file)) !== contentDir) return null;
    const written = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    const bundled = path.basename(file) === 'version.json' ? { ...written, changelog: [] } : written;
    return `export default ${JSON.stringify(JSON.stringify(bundled))};`;
  },
};

const configFile = path.join(repoRoot, 'engine', 'src', 'config.json');

/**
 * The defaults' values, `engine/src/config.json`, which the engine imports as JSON, bundled with
 * their changelog empty (v1.1.6-S18, DL-186 item 15, DL-204), as the content version's is: the
 * changelog is for the people who read the file, some 2.5 kB the page never shows.
 */
const compactConfig: Plugin = {
  name: 'heroesim:compact-config',
  enforce: 'pre',
  async load(id) {
    if (path.resolve(id.split('?')[0] ?? '') !== configFile) return null;
    const written = JSON.parse(await readFile(configFile, 'utf8')) as Record<string, unknown>;
    return JSON.stringify({ ...written, changelog: [] });
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

export default defineConfig({
  // Relative asset URLs, so the built folder works from any path, Cloudflare Pages's root and
  // the filesystem included (M7-S1).
  base: './',
  // The content gate validates the content the script carries, which reads it unchecked (DL-152).
  plugins: [noNodeBuiltins, contentGate(contentDir), compactContent, compactConfig, react(), classicScript],
  experimental: {
    // A picture's URL in the script is resolved against the script's address, named once (above),
    // relative to the script, as Vite's own expression resolves it; in the stylesheet and the page,
    // Vite's relative URL as before.
    renderBuiltUrl(filename, { hostType, hostId }) {
      if (hostType !== 'js') return { relative: true };
      const relative = path.posix.relative(path.posix.dirname(hostId), filename);
      return { runtime: `new URL(${JSON.stringify(relative)},${scriptBase}).href` };
    },
  },
  build: {
    // Each Silhouette inlined into the one script, and nothing else: a picture is a hashed file in
    // dist/assets/ (DL-125 item 1).
    assetsInlineLimit: (file: string, content: Buffer) => path.basename(file) === 'silhouette.svg' && content.length <= silhouetteInlineLimit,
    // One chunk, as an IIFE, for the classic script above. There is no dynamic import to split.
    rolldownOptions: { output: { format: 'iife', intro: scriptBaseIntro } },
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
});
