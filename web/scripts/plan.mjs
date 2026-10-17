/**
 * What `.github/workflows/check.yml` runs for a push or a pull request (DL-327); its tests are
 * src/plan.test.ts.
 *
 *   node web/scripts/plan.mjs <event> <base>
 *
 * Two answers, written to `$GITHUB_OUTPUT` with the reasons, to the log and to `$GITHUB_STEP_SUMMARY`:
 *
 * - `duplicate`: `true` only for a push to a release branch (`v*-release`) of a commit that GitHub
 *   records a completed, successful push run of check.yml on already, as a dev branch's push of the
 *   same commit left. Then `check` and `e2e` are skipped, and the run still reports success. The record
 *   is read as tested.mjs reads it for the deploy (DL-235). A pull request's run is never skipped.
 * - `browser`: `false` only when every path that differs between `<base>` (a push's `before`, a pull
 *   request's base) and the commit lies outside what the built page and its specs read (`browserNeeded`),
 *   and a push run of check.yml passed on `<base>`. A run whose `e2e` was skipped is green, and the
 *   deploy's tested.mjs takes a green run for the specs passed; so each green run stands on one before
 *   it with the same page, back to one that ran them, and a red, cancelled or unfinished base runs them.
 *
 * Anything uncertain runs: no record, a base whose run did not pass, a base that is no commit (a new
 * branch) or that git cannot fetch (a force push), a diff git cannot make. `<base>` may be empty.
 */

import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkRunsWith, checkWorkflow, gitWith } from './tested.mjs';

/** A release branch, as check.yml's `v*-release` names it: `*` matches no `/`. */
const releaseBranch = /^v[^/]*-release$/;

/**
 * Whether a push of `sha` to `branch` repeats a `check` that passed. `checkRuns(sha)` gives the runs
 * of check.yml GitHub lists for `sha`, or `null` when it could not be asked; it is asked only for a
 * push to a release branch.
 */
export function decideDuplicate({ event, branch, sha, runId, checkRuns }) {
  if (event !== 'push' || !releaseBranch.test(branch ?? '')) {
    return { duplicate: false, reason: `${event} on ${branch ?? 'no branch'}: not a push to a release branch, so check runs.` };
  }
  if (!sha) return { duplicate: false, reason: 'No commit named: check runs.' };
  const runs = checkRuns(sha);
  if (runs === null) return { duplicate: false, reason: `GitHub's record of check on ${sha} could not be read: check runs.` };
  const passed = passedRun(runs, sha, runId);
  if (passed === undefined) return { duplicate: false, reason: `check has not passed on ${sha} before: check runs.` };
  return { duplicate: true, reason: `check passed on ${sha} already (run ${passed.id}): this run's check and browser specs are skipped.` };
}

/** A completed, successful push run of check.yml on `sha` among `runs`, other than run `runId`; as tested.mjs reads it (DL-235). */
const passedRun = (runs, sha, runId) =>
  runs.find(
    (run) =>
      run.path === `.github/workflows/${checkWorkflow}` &&
      run.head_sha === sha &&
      run.event === 'push' &&
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      String(run.id) !== String(runId),
  );

/**
 * The folders whose files the build or the browser specs read: the page, the engine, the content, the
 * words, the pictures, and the CLI, which e2e/journey.spec.ts loads the exported game with.
 */
const browserFolders = ['web/', 'engine/', 'content/', 'words/', 'media/', 'cli/'];
/** The root files the install, the build or the typecheck of the page reads, and check.yml itself. */
const browserFiles = new Set(['package.json', 'package-lock.json', '.npmrc', '.node-version', '.github/workflows/check.yml']);
/** The root tsconfig files, which the page's own extends. */
const browserTsconfig = /^tsconfig[^/]*\.json$/;

/** Whether a changed path (git's, relative to the root) is one the built page or its browser specs read. */
export function browserNeeded(file) {
  return browserFolders.some((folder) => file.startsWith(folder)) || browserFiles.has(file) || browserTsconfig.test(file);
}

/** Up to five paths, then how many more. */
const listed = (files) => `${files.slice(0, 5).join(', ')}${files.length > 5 ? ` and ${files.length - 5} more` : ''}`;

/**
 * Whether the browser specs run for `sha`, whose change since `base` they read. `git(args)` gives
 * git's trimmed output or `null` when git fails; `checkRuns` is as for `decideDuplicate`, asked of
 * `base` only when no path the page reads changed.
 */
export function decideBrowser({ event, sha, base, git, checkRuns }) {
  const runs = (why) => ({ browser: true, reason: `${why}: the browser specs run.` });
  if (event !== 'push' && event !== 'pull_request') return runs(`${event} is neither a push nor a pull request`);
  if (!sha) return runs('No commit named');
  if (!base || /^0+$/.test(base)) return runs('No base to compare with (a new branch)');
  // The checkout is shallow: fetch the base's commit alone, whose tree is all a diff reads.
  if (git(['cat-file', '-e', `${base}^{commit}`]) === null && git(['fetch', '--no-tags', '--depth=1', 'origin', base]) === null) {
    return runs(`${base} could not be fetched (a force push)`);
  }
  // `--no-renames`, so that a file moved out of web/ counts both its paths (as release.mjs does).
  const diff = git(['diff', '--name-only', '--no-renames', '-z', base, sha]);
  if (diff === null) return runs(`git could not compare ${base} with ${sha}`);
  const changed = diff.split('\0').filter((file) => file !== '');
  const needed = changed.find(browserNeeded);
  if (needed !== undefined) return runs(`${needed} changed since ${base}, which the page or its specs read`);
  const baseRuns = checkRuns(base);
  if (baseRuns === null) return runs(`GitHub's record of check on ${base} could not be read`);
  const passed = passedRun(baseRuns, base);
  if (passed === undefined) return runs(`check has not passed on ${base}, the base`);
  return {
    browser: false,
    reason: `${changed.length} path(s) changed since ${base}${changed.length > 0 ? ` (${listed(changed)})` : ''}, none read by the page or its specs, and check passed on ${base} (run ${passed.id}): the browser specs are not run.`,
  };
}

/** The command line: `<event> <base>`. Returns the exit status. */
export function main({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  spawn = spawnSync,
  log = console.log,
  warn = console.error,
} = {}) {
  const [event, base, ...rest] = argv;
  if (!event || base === undefined || rest.length > 0) {
    warn('plan: usage: plan.mjs <event> <base>');
    return 2;
  }
  const git = gitWith(spawn, cwd);
  const checkRuns = checkRunsWith(spawn, cwd, env.GITHUB_REPOSITORY);
  const sha = env.GITHUB_SHA;
  const { duplicate, reason: duplicateReason } = decideDuplicate({
    event,
    branch: env.GITHUB_REF_NAME,
    sha,
    runId: env.GITHUB_RUN_ID,
    checkRuns,
  });
  // A duplicate runs no job, so what the browser specs would do is not worked out.
  const { browser, reason: browserReason } = duplicate
    ? { browser: false, reason: 'Skipped with the check.' }
    : decideBrowser({ event, sha, base, git, checkRuns });
  const reasons = `${duplicateReason}\n${browserReason}`;
  log(reasons);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `duplicate=${duplicate}\nbrowser=${browser}\n`);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${reasons}\n`);
  return 0;
}

const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url);
if (isMain) process.exitCode = main();
