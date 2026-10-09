/**
 * Whether the deploy runs `npm test` and the browser specs again (DL-235, DL-231 Q19).
 * `.github/workflows/deploy.yml` runs it on its checkout of the release tag; its tests are
 * src/tested.test.ts.
 *
 *   node web/scripts/tested.mjs <event> [commit]
 *
 * A release tag marks the merge of a release branch's pull request into `main`, and the merge's
 * second parent is the release branch's tip, on whose push check.yml ran the suite and the browser
 * specs. When the commit's tree is that tip's tree (`git rev-parse <a>^{tree}`) and GitHub records
 * a push run of check.yml that passed on the tip, the tree has passed them already, and they are
 * not run again. Anything uncertain runs them: an event other than a push (a deploy run by hand),
 * no second parent, another tree, GitHub's record unread, or no run of check that passed.
 *
 * It writes `run=true` or `run=false` to `$GITHUB_OUTPUT`, and the reason to the log and to
 * `$GITHUB_STEP_SUMMARY`, when each is set. The commit is `HEAD` when none is named.
 */

import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The workflow whose passing run on the tested tip stands for the tests (check and e2e). */
export const checkWorkflow = 'check.yml';

/** The full sha of `revision` that git names, or `null` when git fails. */
const resolve = (git, revision) => git(['rev-parse', '--verify', '--quiet', revision]);

/**
 * Whether the tests run again for `commit`, and why. `git(args)` gives git's trimmed output or
 * `null` when git fails; `checkRuns(sha)` gives the runs of check.yml GitHub lists for `sha`, or
 * `null` when it could not be asked.
 */
export function decide({ event, commit, git, checkRuns }) {
  if (event !== 'push') return { run: true, reason: `The deploy ran on ${event}, not a push: run by hand, a redeploy or a rollback, it runs the tests.` };
  const head = resolve(git, `${commit}^{commit}`);
  if (head === null) return { run: true, reason: `git does not know ${commit}: the tests run.` };
  const tip = resolve(git, `${head}^2`);
  if (tip === null) return { run: true, reason: `${head} has no second parent, so no tested tip to compare: the tests run.` };
  const [tree, tested] = [git(['rev-parse', `${head}^{tree}`]), git(['rev-parse', `${tip}^{tree}`])];
  if (tree === null || tree !== tested) return { run: true, reason: `${head}: its tree is not ${tip}'s, its second parent: the tests run.` };
  const runs = checkRuns(tip);
  if (runs === null) return { run: true, reason: `${head}: GitHub's record of check could not be read: the tests run.` };
  const passed = runs.find((run) => run.head_sha === tip && run.event === 'push' && run.status === 'completed' && run.conclusion === 'success');
  if (passed === undefined) return { run: true, reason: `${head}: check has not passed on ${tip}, its second parent: the tests run.` };
  return {
    run: false,
    reason: `${head}: its tree is ${tip}'s, on which check passed (run ${passed.id}): npm test and the browser specs are not run again.`,
  };
}

/** git in `cwd` through `spawn`: its trimmed output, or `null` when it fails. */
function gitWith(spawn, cwd) {
  return (args) => {
    const child = spawn('git', args, { cwd, encoding: 'utf8' });
    return child.error || child.status !== 0 ? null : String(child.stdout ?? '').trim();
  };
}

/** The runs of check.yml on a push of `sha` that GitHub lists as passed, read by `gh api`; `null` when unread. */
function checkRunsWith(spawn, cwd, repository) {
  return (sha) => {
    if (!repository) return null;
    const url = `repos/${repository}/actions/workflows/${checkWorkflow}/runs?head_sha=${sha}&event=push&status=success`;
    const child = spawn('gh', ['api', url], { cwd, encoding: 'utf8' });
    if (child.error || child.status !== 0) return null;
    try {
      const runs = JSON.parse(String(child.stdout ?? '')).workflow_runs;
      return Array.isArray(runs) ? runs : null;
    } catch {
      return null;
    }
  };
}

/** The command line: `<event> [commit]`. Returns the exit status. */
export function main({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  spawn = spawnSync,
  log = console.log,
  warn = console.error,
} = {}) {
  const [event, commit = 'HEAD', ...rest] = argv;
  if (!event || rest.length > 0) {
    warn('tested: usage: tested.mjs <event> [commit]');
    return 2;
  }
  const { run, reason } = decide({ event, commit, git: gitWith(spawn, cwd), checkRuns: checkRunsWith(spawn, cwd, env.GITHUB_REPOSITORY) });
  log(reason);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `run=${run}\n`);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${reason}\n`);
  return 0;
}

const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url);
if (isMain) process.exitCode = main();
