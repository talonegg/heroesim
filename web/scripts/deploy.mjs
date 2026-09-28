/**
 * The deploy (v1.0.1-S3, DL-94; DL-88 items 6 to 9, DL-92 items 4 and 5; INPUTS 7.8 and 7.9):
 * `npm run deploy`, from the repository's root or from web/, runs this.
 *
 * One build of the page goes to both of its addresses: first the Worker `heroesim`, Cloudflare
 * Workers static assets configured by web/wrangler.jsonc, then the Pages project `heroesims`'s
 * production branch. A Worker has no branches, so every upload to it goes live; the deploy
 * therefore refuses, before it builds anything, unless
 *
 *   - `git status --porcelain` prints nothing, so what is built is what the commit holds;
 *   - `git tag --points-at HEAD` lists exactly one release tag, `v*`;
 *   - no other wrangler configuration sits in web/ or any directory above it. Wrangler walks up
 *     from web/ for `wrangler.json`, then `wrangler.jsonc`, then `wrangler.toml`, so a stray
 *     `wrangler.json` anywhere above would win over web/wrangler.jsonc for `pages deploy`, which
 *     takes no --config; and `pages deploy` follows a redirect, `.wrangler/deploy/config.json`,
 *     found the same way;
 *   - no `.env` or `.env.local` sits in web/: wrangler loads them into its environment on every
 *     run, where an account, a token or a Worker's name would send the uploads elsewhere, and the
 *     clean check does not see `.env`, which .gitignore ignores, nor a `.env.local` that a global
 *     ignore file hides (v1.0.1-S6, DL-97).
 *
 * Then it builds once (`npm run build`: Vite, then the bundle gate) and runs
 *
 *   npx -y wrangler@4 deploy --config wrangler.jsonc --tag <tag> --message "<tag> at commit <sha>"
 *   npx -y wrangler@4 pages deploy dist --project-name heroesims --branch <releaseBranch>
 *
 * from web/, stopping at the first failure. The Worker goes first, so that its failure leaves
 * pages.dev, where the players' saves are, as it was. A Worker version records a commit only in
 * its message or tag; `pages deploy` reads the commit from git itself.
 *
 * `--dry-run` runs the checks and the build and prints both wrangler commands, running neither.
 * So does `npm run deploy --dry-run`: npm keeps that flag for itself and hands this script only
 * `npm_config_dry_run=true`, which is read here as `--dry-run`. Any other argument is refused,
 * so that a mistyped `--dry-run` never deploys; so is a flag npm kept whose name holds "dry" or
 * "run", which reaches this script only as another `npm_config_*` name: `--dryrun` becomes
 * `npm_config_dryrun`. From the repository's root, whose `deploy` is `npm run deploy -w web`,
 * even `npm run deploy -- --dryrun` arrives so, since the flag then comes before the inner npm's
 * own `--`. A flag npm keeps under a name holding neither never reaches this script, so it is
 * not refused: on a clean checkout of a release tag the deploy goes ahead (v1.0.1-S6, DL-97).
 *
 * No shell. npm runs scripts under cmd.exe on Windows, which expands no `$(…)`, and Node spawns
 * neither `npx` nor `npx.cmd` there without a shell, which would split an argument at its spaces.
 * So npm and npx run as `process.execPath` with npm's own `npm-cli.js` and `npx-cli.js`: the one
 * `npm_execpath` names and the one beside it, or, when `node` runs this alone and sets no
 * `npm_execpath`, the two in `node_modules/npm/bin/` beside `process.execPath`.
 *
 * Wrangler's stdio is inherited, so its prompts reach whoever runs it (a login that sees several
 * accounts asks which; piped, it would fail). What the deploy's record needs is read instead from
 * the file wrangler appends to when WRANGLER_OUTPUT_FILE_PATH names one, a file in os.tmpdir()
 * for each run: its wrangler version, the Worker's version id and addresses, and the Pages
 * deployment's URL, environment and commit. They are printed with the tag, the commit and the UTC
 * time, for the release's decision-log entry, with a loud warning when the Worker's addresses do
 * not hold `addresses.worker`, the address the live check reads (playwright.live.config.ts). When
 * Pages fails after the Worker took the build, the Worker's part is printed, for the entry that
 * records the attempt.
 *
 * `deploy()` takes its process, its directories and its spawn as options, so that its tests
 * (src/deploy.test.ts) run every path with a fake spawn and never run git's writes, npm or
 * wrangler.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The branch Pages publishes as production, named on every Pages deploy: an upload for any other
 * branch is a preview that never reaches https://heroesims.pages.dev. The only place it is
 * written; it becomes `v1.1-release` at that branch's first release (DL-86, #37).
 */
export const releaseBranch = 'v1.0-release';

/**
 * The page's two addresses (INPUTS 7.8): the Worker's, `heroesim` on the account's workers.dev
 * subdomain `magical-potato` (DL-94), and the Pages project's. The live check reads both
 * (playwright.live.config.ts), and the deploy warns when the Worker's is not where it landed.
 */
export const addresses = Object.freeze({
  worker: 'https://heroesim.magical-potato.workers.dev',
  pages: 'https://heroesims.pages.dev',
});

export const pagesProject = 'heroesims';
export const workerConfig = 'wrangler.jsonc';

const wrangler = 'wrangler@4';
/**
 * What wrangler finds by walking up from web/: its three configuration names, and the redirect
 * `pages deploy` follows (`.wrangler/deploy/config.json`, wrangler 4.142.0's
 * `findRedirectedWranglerConfig`), which `.gitignore`'s `.wrangler/` hides from the clean check.
 */
const configNames = ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml', path.join('.wrangler', 'deploy', 'config.json')];
/** The files in web/ that wrangler loads into its environment on every run (`getDefaultEnvFiles`). */
const envFiles = ['.env', '.env.local'];
const defaultWebDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The two wrangler runs as npx's arguments: the Worker's first, then Pages'. */
export function wranglerCommands(tag, commit) {
  const message = `${tag} at commit ${commit}`;
  return {
    worker: ['-y', wrangler, 'deploy', '--config', workerConfig, '--tag', tag, '--message', message],
    pages: ['-y', wrangler, 'pages', 'deploy', 'dist', '--project-name', pagesProject, '--branch', releaseBranch],
  };
}

/** A command as a person would type it, an argument that holds a space quoted. */
function shown(args) {
  return ['npx', ...args].map((arg) => (/[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg)).join(' ');
}

/**
 * `--dry-run` given, or `npm run deploy --dry-run`'s environment: npm sets `npm_config_dry_run`
 * to "true". Any value but an empty or false one counts, so that a doubt never deploys.
 */
function isDryRun(argv, env) {
  const npmFlag = env.npm_config_dry_run;
  return argv.includes('--dry-run') || (npmFlag !== undefined && npmFlag !== '' && npmFlag !== 'false');
}

/**
 * The flags npm kept for itself that look like a mistyped `--dry-run`: npm hands a script a flag
 * given before its own `--` only as `npm_config_<name>`, `--dryrun` as `npm_config_dryrun`. Of
 * the names npm 11.19.1 sets for a script, none but `npm_config_dry_run` has "dry" or "run" in it.
 */
function npmTypos(env) {
  return Object.keys(env).filter((key) => {
    const name = key.toLowerCase();
    return name.startsWith('npm_config_') && name !== 'npm_config_dry_run' && /dry|run/.test(name.slice('npm_config_'.length));
  });
}

/** npm's `npm-cli.js`, from `npm_execpath` or beside Node itself, and the `npx-cli.js` beside it. */
function npmClis(env, execPath) {
  const npm = env.npm_execpath || path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return { npm, npx: path.join(path.dirname(npm), 'npx-cli.js') };
}

/**
 * Every wrangler configuration wrangler could find from web/ other than web/wrangler.jsonc: in
 * web/ and each directory above it, the filesystem's root among them.
 */
function strayConfigurations(webDir) {
  const found = [];
  for (let dir = webDir; ; dir = path.dirname(dir)) {
    for (const name of configNames) {
      const file = path.join(dir, name);
      if (!(dir === webDir && name === workerConfig) && existsSync(file)) found.push(file);
    }
    if (path.dirname(dir) === dir) return found;
  }
}

/** The entries of a file wrangler wrote, one JSON object a line; none when it wrote nothing. */
function readRecord(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .flatMap((line) => {
      if (line.trim() === '') return [];
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function entryOf(entries, type) {
  return entries.findLast((entry) => entry !== null && typeof entry === 'object' && entry.type === type);
}

/**
 * Deploy, or refuse. Returns the process's exit status: 0 once both uploads succeeded (or the dry
 * run built and printed), otherwise the first failure's.
 */
export function deploy({
  argv = process.argv.slice(2),
  env = process.env,
  webDir = defaultWebDir,
  execPath = process.execPath,
  tmpdir = os.tmpdir(),
  spawn = spawnSync,
  log = (line) => console.log(line),
  warn = (line) => console.error(line),
  now = () => new Date(),
} = {}) {
  const say = (line) => log(`deploy: ${line}`);
  const complain = (line) => warn(`deploy: ${line}`);

  const refusals = [];
  const unknown = argv.filter((arg) => arg !== '--dry-run');
  if (unknown.length > 0) refusals.push(`it takes only --dry-run, and was given ${unknown.join(' ')}.`);
  for (const key of npmTypos(env)) {
    refusals.push(`it takes only --dry-run, and npm handed it ${key}=${env[key]}: a flag npm was given, not --dry-run.`);
  }

  const clis = npmClis(env, execPath);
  for (const cli of [clis.npm, clis.npx]) {
    if (!existsSync(cli)) {
      refusals.push(`npm's ${path.basename(cli)} is not at ${cli}; run it as \`npm run deploy\`.`);
    }
  }

  for (const file of strayConfigurations(webDir)) {
    refusals.push(`a wrangler configuration sits at ${file}, where wrangler would find it; move it away.`);
  }
  for (const file of envFiles.map((name) => path.join(webDir, name)).filter((file) => existsSync(file))) {
    refusals.push(`${file} would be loaded into wrangler's environment, where it could send the uploads elsewhere; move it away.`);
  }

  const git = (args) => {
    const child = spawn('git', args, { cwd: webDir, env, encoding: 'utf8' });
    const stdout = typeof child.stdout === 'string' ? child.stdout : '';
    return child.error || child.status !== 0 ? undefined : stdout;
  };
  const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
  const status = git(['status', '--porcelain']);
  const tags = git(['tag', '--points-at', 'HEAD']);
  const commit = git(['rev-parse', 'HEAD'])?.trim();
  const releases = lines(tags ?? '').filter((name) => name.startsWith('v'));
  if (status === undefined || tags === undefined || !commit) {
    refusals.push('git could not read the checkout: run it from a clone of the repository.');
  } else {
    const changes = lines(status);
    if (changes.length > 0) {
      const shownChanges = changes.slice(0, 3).join('; ');
      refusals.push(`the checkout is not clean: ${changes.length} uncommitted change(s), ${shownChanges}.`);
    }
    if (releases.length === 0) refusals.push('HEAD carries no release tag (v*): deploy only from a checkout of one.');
    if (releases.length > 1) {
      refusals.push(`HEAD carries ${releases.length} release tags, ${releases.join(' and ')}: a release has one.`);
    }
  }

  if (refusals.length > 0) {
    complain('refused; nothing was built or uploaded:');
    for (const refusal of refusals) complain(`  - ${refusal}`);
    return 1;
  }

  const [tag] = releases;
  const dryRun = isDryRun(argv, env);
  const commands = wranglerCommands(tag, commit);
  say(`${tag} at commit ${commit}, from a clean checkout${dryRun ? ' (dry run)' : ''}.`);

  const node = (args, extraEnv = {}) =>
    spawn(execPath, args, { cwd: webDir, env: { ...env, ...extraEnv }, stdio: 'inherit' });
  const failed = (child) => child.error !== undefined || child.status !== 0;
  const statusOf = (child) => (typeof child.status === 'number' && child.status !== 0 ? child.status : 1);

  const build = node([clis.npm, 'run', 'build']);
  if (failed(build)) {
    complain(`the build failed; nothing was uploaded.${build.error ? ` ${build.error.message}` : ''}`);
    return statusOf(build);
  }

  if (dryRun) {
    say('dry run: the checks passed and the page is built. From web/, the deploy would run, and has not:');
    say(`  ${shown(commands.worker)}`);
    say(`  ${shown(commands.pages)}`);
    return 0;
  }

  const recordDir = mkdtempSync(path.join(tmpdir, 'heroesim-deploy-'));
  try {
    const records = { worker: path.join(recordDir, 'worker.ndjson'), pages: path.join(recordDir, 'pages.ndjson') };

    say(`uploading to the Worker: ${shown(commands.worker)}`);
    const worker = node([clis.npx, ...commands.worker], { WRANGLER_OUTPUT_FILE_PATH: records.worker });
    if (failed(worker)) {
      complain(`the Worker's upload failed; Pages was not touched, and ${addresses.pages} serves what it did.`);
      return statusOf(worker);
    }

    say(`uploading to Pages: ${shown(commands.pages)}`);
    const pages = node([clis.npx, ...commands.pages], { WRANGLER_OUTPUT_FILE_PATH: records.pages });
    if (failed(pages)) {
      complain(
        `the Pages upload failed after the Worker took this build: the Worker serves ${tag}, ` +
          `${addresses.pages} what it served before. See the release epic's deploy step for what follows.`,
      );
      // The Worker went live: print its record, for the entry that records this attempt, before
      // its file goes with the directory (v1.0.1-S6, DL-97).
      report({ tag, commit, records, say, complain, now, pagesFailed: true });
      return statusOf(pages);
    }

    return report({ tag, commit, records, say, complain, now, pagesFailed: false });
  } finally {
    rmSync(recordDir, { recursive: true, force: true });
  }
}

const versionOf = (entries) => entryOf(entries, 'wrangler-session')?.wrangler_version ?? 'unknown';
const at = (entry) => (entry?.timestamp ? `; ${entry.timestamp}` : '');

/** The Worker's line of the record, from the file its wrangler run wrote, and what in it to warn of. */
function workerRecord(file) {
  const entries = readRecord(file);
  const deployed = entryOf(entries, 'deploy');
  const targets = Array.isArray(deployed?.targets) ? deployed.targets : [];
  const line =
    `  Worker          wrangler ${versionOf(entries)}; version ${deployed?.version_id ?? 'unknown'}; ` +
    `at ${targets.join(', ') || 'no address'}${at(deployed)}`;
  const problems = [];
  if (deployed === undefined) {
    problems.push(`wrangler wrote no record of the Worker's deploy; read its version and address in its output above.`);
  } else if (!targets.includes(addresses.worker)) {
    problems.push(
      `the Worker is served at ${targets.join(', ') || 'no address'}, not at ${addresses.worker},`,
      'the address the live check reads.',
      "Run the live check on each address alone, with HEROESIM_LIVE_URL set to the Worker's address, then to",
      `${addresses.pages}, and correct \`addresses.worker\` in web/scripts/deploy.mjs, the README and INPUTS 7.8`,
      'in the commit that records this deploy.',
    );
  }
  return { line, problems };
}

/** The Pages deployment's line of the record, from the file its wrangler run wrote, and what in it to warn of. */
function pagesRecord(file, commit) {
  const entries = readRecord(file);
  const deployed = entryOf(entries, 'pages-deploy-detailed');
  const pagesCommit = deployed?.deployment_trigger?.metadata?.commit_hash;
  const line =
    `  Pages           wrangler ${versionOf(entries)}; ${deployed?.url ?? 'no URL'}; ` +
    `environment ${deployed?.environment ?? 'unknown'}; commit ${pagesCommit || 'unknown'}${at(deployed)}`;
  const problems = [];
  if (deployed === undefined) {
    problems.push('wrangler wrote no record of the Pages deploy; read its URL in its output above.');
  } else {
    if (deployed.environment !== 'production') {
      problems.push(`Pages took this deploy as ${deployed.environment ?? 'an unknown environment'}, not production.`);
    }
    // Compared as a prefix, in case Pages keeps an abbreviated hash.
    if (pagesCommit && !commit.startsWith(pagesCommit)) {
      problems.push(`Pages recorded commit ${pagesCommit}, not ${commit}.`);
    }
  }
  return { line, problems };
}

/**
 * Print the deploy's record from the files wrangler wrote, and warn of anything unexpected in it:
 * both uploads', or, when Pages failed after the Worker took the build, the Worker's alone.
 */
function report({ tag, commit, records, say, complain, now, pagesFailed }) {
  const worker = workerRecord(records.worker);
  const pages = pagesFailed ? null : pagesRecord(records.pages, commit);

  say(
    pages === null
      ? "the Worker's record, for the release's decision-log entry, which records this attempt:"
      : "both uploads succeeded. The record, for the release's decision-log entry:",
  );
  say(`  tag             ${tag}`);
  say(`  commit          ${commit}`);
  say(`  finished (UTC)  ${now().toISOString()}`);
  say(worker.line);
  if (pages !== null) {
    say(pages.line);
    say('Next, the live check on both addresses: npm run e2e:live -w web');
  }

  const problems = [...worker.problems, ...(pages?.problems ?? [])];
  if (problems.length > 0) {
    complain('WARNING '.repeat(8).trim());
    for (const problem of problems) complain(`WARNING: ${problem}`);
    complain('WARNING '.repeat(8).trim());
  }
  return 0;
}

// Run when Node runs this file, not when a test imports it.
const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url);
if (isMain) process.exitCode = deploy();
