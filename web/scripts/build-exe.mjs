/**
 * Build the launcher executable (E8-S7, DL-29): `release/heroesim.exe` on Windows,
 * `release/heroesim` elsewhere.
 *
 * Run after `vite build` — `npm run build:exe` does both. It writes a single-executable
 * configuration naming `launcher/serve.mjs` as the program and every file under `dist` as
 * an asset, and hands it to `node --build-sea`, which copies the `node` binary that is
 * running this script and injects both. Nothing is installed and nothing is downloaded.
 *
 * The executable is therefore for the platform and architecture it was built on, and is
 * about the size of `node` itself.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '..');
const distDir = path.join(webDir, 'dist');
const releaseDir = path.join(webDir, 'release');
const configPath = path.join(releaseDir, 'sea-config.json');
const outputPath = path.join(
  releaseDir,
  process.platform === 'win32' ? 'heroesim.exe' : 'heroesim',
);

function fail(message) {
  console.error(`build-exe: ${message}`);
  process.exit(1);
}

// `node --build-sea` arrived in 25.5. The rest of the repository runs on 22 (DL-29 §1).
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 25 || (major === 25 && minor < 5)) {
  fail(
    `building the executable needs Node 25.5 or later, and this is ${process.versions.node}. ` +
      'Everything else in the repository still runs on Node 22.',
  );
}

/** Asset key → absolute path, the key being what the launcher looks a request up by. */
function assetsUnder(directory, prefix = '') {
  const assets = {};
  for (const entry of readdirSync(directory).sort()) {
    const full = path.join(directory, entry);
    const key = prefix === '' ? entry : `${prefix}/${entry}`;
    if (statSync(full).isDirectory()) Object.assign(assets, assetsUnder(full, key));
    else assets[key] = full;
  }
  return assets;
}

let assets;
try {
  assets = assetsUnder(distDir);
} catch {
  fail(`no build at ${distDir}. Run "npm run build" first, or use "npm run build:exe".`);
}
if (!('index.html' in assets)) fail(`${distDir} holds no index.html.`);

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });
writeFileSync(
  configPath,
  JSON.stringify(
    {
      main: path.join(webDir, 'launcher', 'serve.mjs'),
      mainFormat: 'module',
      output: outputPath,
      disableExperimentalSEAWarning: true,
      // Both off: either would tie the executable more tightly to this exact machine,
      // and a launcher that starts once per sitting has no start-up time worth buying.
      useSnapshot: false,
      useCodeCache: false,
      assets,
    },
    null,
    2,
  ),
);

const built = spawnSync(process.execPath, ['--build-sea', configPath], { stdio: 'inherit' });
if (built.status !== 0) fail('node --build-sea did not finish. What it said is above.');

// Prove the thing starts and is the launcher, rather than trusting an exit code.
const probe = spawnSync(outputPath, ['--help'], { encoding: 'utf8' });
if (probe.status !== 0 || !probe.stdout.includes('Heroesim')) {
  fail(`${outputPath} was written but does not answer --help.\n${probe.stderr ?? ''}`);
}

const megabytes = (statSync(outputPath).size / (1024 * 1024)).toFixed(0);
console.log(
  `build-exe: ${path.relative(process.cwd(), outputPath)} — ${megabytes} MB, ` +
    `${Object.keys(assets).length} files of the built page inside it.`,
);
