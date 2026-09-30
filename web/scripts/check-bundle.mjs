/**
 * Refuse a bundle that could reach the network or the filesystem (M7-S1). Run straight after
 * `vite build`, so `npm run build -w web` fails rather than shipping a page that quietly asks
 * for something: no server and no network call, ever (principle 12, N2).
 *
 * Harvested from v1 (feature/poc, E8-S1). It checks `web/dist`, or the directory given as its
 * one argument (src/bundle.test.ts builds into a temporary directory and checks that).
 *
 * What is looked for, in every built .js, .mjs, .css and .html file:
 *
 *   fetch(            a request
 *   XMLHttpRequest    an older request
 *   "node:…"          a Node built-in specifier, which cannot exist in a browser
 *   process.env       a build that leaked its environment
 *   scheme://…        a URL literal of any scheme, http(s), ws(s) and the rest, unless it is on
 *                     the allow-list below
 *   //host…           a protocol-relative URL, which a page served over https:// resolves to
 *                     https://host (a CSS url(), an img or script src)
 *
 * The allow-list holds URLs that are identifiers rather than addresses — nothing in the page
 * ever resolves one. Each is justified where it is written.
 *
 * The page's pictures are its own files (v1.1.2-S2, DL-125 item 1): a Silhouette is inlined into
 * the script as a `data:` URL, whose SVG names only its namespace, and a picture is a hashed file
 * beside the script in `assets/`, loaded by a relative path, from the page's own origin or its own
 * folder. Neither is a URL literal, so this gate is unchanged by them. A picture's bytes are not
 * text, and are not read.
 *
 * The text is read as built, comments and all (M7 verification, DL-74). v1's gate stripped comments
 * first with a pattern that also matched inside strings, so whatever lay between a string holding
 * "/*" and a later one holding "*" and "/" (an accept of 'image/*', then '*' + '/*') went unchecked.
 * A minified bundle keeps almost no comments; one that names an address fails the gate, and a false
 * alarm is put right by hand, where a hidden call would not be seen at all.
 *
 * A Node built-in the page imports never reaches the bundle: Vite replaces it with an empty stub in
 * a browser build, so the "node:" pattern here cannot see it. vite.config.ts refuses that build
 * instead (DL-74).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(process.argv[2] ?? path.join(here, '..', 'dist'));

/**
 * URLs allowed to survive minification. These are strings React carries, not addresses the page
 * fetches:
 *
 * - the four W3C namespace URIs are XML namespace *identifiers*, passed to `createElementNS` for
 *   SVG and MathML. Nothing is requested from w3.org.
 * - the React error-decoder address appears only inside a thrown error's message, so a minified
 *   production error can be looked up by hand. It is never navigated to.
 */
const ALLOWED_URLS = [
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/XML/1998/namespace',
  'https://react.dev/errors/',
];

/** Patterns that are never acceptable, whatever they are near. */
const FORBIDDEN = [
  { name: 'fetch(', pattern: /fetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /XMLHttpRequest/ },
  // Quoted, so that an object key such as `{node:n}` in minified React is not a hit.
  { name: 'a node: specifier', pattern: /['"`]node:/ },
  { name: 'process.env', pattern: /process\s*\.\s*env/ },
];

const CHECKED_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html']);

function filesUnder(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...filesUnder(full));
    else if (CHECKED_EXTENSIONS.has(path.extname(entry))) found.push(full);
  }
  return found;
}

/**
 * A URL literal: any scheme followed by `//`, or `//` alone, protocol-relative, up to a quote, a
 * space, a closing bracket or a backslash. Every `//` in a minified bundle is one of these, so a
 * hit that is no address is a false alarm to allow-list, never a call let through.
 */
const URL_LITERAL = /(?:[A-Za-z][A-Za-z0-9+.-]*:)?\/\/[^\s"'`)\\]*/g;

function contextAround(text, index) {
  return text.slice(Math.max(0, index - 60), index + 60).replace(/\s+/g, ' ');
}

let files;
try {
  files = filesUnder(distDir);
} catch {
  console.error(`check-bundle: no build at ${distDir}. Run "vite build" first.`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`check-bundle: ${distDir} holds no .js, .mjs, .css or .html file.`);
  process.exit(1);
}

const complaints = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const shown = path.relative(distDir, file);

  for (const { name, pattern } of FORBIDDEN) {
    const hit = pattern.exec(source);
    if (hit !== null) {
      complaints.push(`${shown}: contains ${name} — …${contextAround(source, hit.index)}…`);
    }
  }

  for (const hit of source.matchAll(URL_LITERAL)) {
    const url = hit[0];
    if (ALLOWED_URLS.some((allowed) => url.startsWith(allowed))) continue;
    complaints.push(`${shown}: contains the URL ${url} — …${contextAround(source, hit.index)}…`);
  }
}

if (complaints.length > 0) {
  console.error('check-bundle: the built page could reach outside itself.\n');
  for (const complaint of complaints) console.error(`  ${complaint}`);
  console.error(
    '\nThe browser never calls anything (principle 12). Remove it, or, if it is an ' +
      'identifier rather than an address, justify it in ALLOWED_URLS.',
  );
  process.exit(1);
}

console.log(`check-bundle: ${files.length} built files, no network or filesystem reference.`);
