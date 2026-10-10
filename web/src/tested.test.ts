// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { checkWorkflow, decide, main, type CheckRun } from '../scripts/tested.mjs';

// Whether the deploy runs `npm test` and the browser specs again (DL-235, DL-231 Q19): not when the
// release tag's commit is a merge whose tree is its second parent's, the release branch's tip, and
// GitHub records a push run of check.yml that passed on that tip; again whenever anything is
// uncertain. The trees are compared by git in repositories made here; GitHub's record is a stand-in.

const place = mkdtempSync(path.join(tmpdir(), 'heroesim-tested-test-'));
afterAll(() => {
  rmSync(place, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** git in `dir`, as nobody's configuration but this; its trimmed output. */
function git(dir: string, ...args: string[]): string {
  const child = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (child.status !== 0) throw new Error(`git ${args.join(' ')}: ${child.stderr}`);
  return child.stdout.trim();
}

/** A commit of `file` with `text` on the branch checked out. */
function commit(dir: string, file: string, text: string): string {
  writeFileSync(path.join(dir, file), text);
  git(dir, 'add', file);
  git(dir, 'commit', '--quiet', '-m', `${file}: ${text}`);
  return git(dir, 'rev-parse', 'HEAD');
}

/**
 * A repository as a release leaves it: `main`, a release branch from it, and the release branch
 * merged into `main` by a merge commit. With `mainMoved`, `main` takes a commit of its own before
 * the merge, so the merge's tree is not the release branch's.
 */
function released(name: string, mainMoved: boolean): { dir: string; merge: string; tip: string } {
  const dir = path.join(place, name);
  spawnSync('git', ['init', '--quiet', '--template=', '--initial-branch=main', dir]);
  commit(dir, 'a.txt', 'first');
  git(dir, 'checkout', '--quiet', '-b', 'v1.1-release');
  const tip = commit(dir, 'b.txt', 'the release');
  git(dir, 'checkout', '--quiet', 'main');
  if (mainMoved) commit(dir, 'c.txt', 'not on the release branch');
  git(dir, 'merge', '--quiet', '--no-ff', '-m', 'Merge the release', 'v1.1-release');
  return { dir, merge: git(dir, 'rev-parse', 'HEAD'), tip };
}

const passedOn = (sha: string): CheckRun[] => [
  { id: 7, path: `.github/workflows/${checkWorkflow}`, head_sha: sha, event: 'push', status: 'completed', conclusion: 'success' },
];

let same: { dir: string; merge: string; tip: string };
let differs: { dir: string; merge: string; tip: string };
beforeAll(() => {
  same = released('same', false);
  differs = released('differs', true);
});

/** git as a merge whose tree is its second parent's would answer, for whatever commit is named. */
const merged = (args: readonly string[]): string | null =>
  (/^rev-parse --verify --quiet \S+\^\{commit\}$/.test(args.join(' '))
    ? 'm'
    : { 'rev-parse --verify --quiet m^2': 'p', 'rev-parse m^{tree}': 't', 'rev-parse p^{tree}': 't' }[args.join(' ')]) ?? null;

/** `spawn` for `main` whose git answers as `merged` does, in no repository at all; `other` answers every other command. */
const fakeGit =
  (other: (command: string, args: readonly string[]) => { status: number; stdout: string }) =>
  (command: string, args: readonly string[]): { status: number; stdout: string } => {
    if (command !== 'git') return other(command, args);
    const answer = merged(args);
    return answer === null ? { status: 1, stdout: '' } : { status: 0, stdout: answer };
  };

/**
 * The command line in `dir`, git real (or, with `fake`, answering as `merged` does: the tests of GitHub's record
 * need no trees) and GitHub's record `runs` (or the API failing, with `null`).
 */
function run(dir: string, argv: string[], runs: (sha: string) => CheckRun[] | null, fake = false) {
  const output = path.join(dir, '.git', 'github-output');
  const summary = path.join(dir, '.git', 'github-summary');
  writeFileSync(output, '');
  writeFileSync(summary, '');
  const asked: string[][] = [];
  const lines: string[] = [];
  const status = main({
    argv,
    env: { GITHUB_REPOSITORY: 'owner/heroesim', GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    cwd: dir,
    spawn: (command, args, options) => {
      if (command === 'git') return fake ? fakeGit(() => ({ status: 1, stdout: '' }))(command, args) : spawnSync(command, [...args], { ...options, cwd: dir });
      asked.push([command, ...args]);
      const sha = /head_sha=([0-9a-f]+)/.exec(args.join(' '))?.[1] ?? '';
      const answer = runs(sha);
      return answer === null ? { status: 1, stdout: '' } : { status: 0, stdout: JSON.stringify({ total_count: answer.length, workflow_runs: answer }) };
    },
    log: (line) => lines.push(line),
    warn: (line) => lines.push(line),
  });
  return { status, output: readFileSync(output, 'utf8'), summary: readFileSync(summary, 'utf8'), said: lines.join('\n'), asked };
}

describe('the tree compared, by git', () => {
  test('a merge whose tree is the release branch tip on which check passed: the tests are not run again', () => {
    const result = run(same.dir, ['push', same.merge], passedOn);

    expect(result.status).toBe(0);
    expect(result.output).toBe('run=false\n');
    expect(result.said).toContain(`its tree is ${same.tip}'s, on which check passed (run 7)`);
    expect(result.summary).toContain(result.said);
    expect(result.asked).toEqual([
      ['gh', 'api', `repos/owner/heroesim/actions/workflows/${checkWorkflow}/runs?head_sha=${same.tip}&event=push&status=success`],
    ]);
  });

  test('a merge whose tree is not the tested tip: the tests run, whatever check said of the tip', () => {
    const result = run(differs.dir, ['push', differs.merge], passedOn);

    expect(result.output).toBe('run=true\n');
    expect(result.said).toContain(`its tree is not ${differs.tip}'s`);
    expect(result.asked).toEqual([]);
  });

  test('a commit with no second parent: the tests run', () => {
    const result = run(same.dir, ['push', same.tip], passedOn);

    expect(result.output).toBe('run=true\n');
    expect(result.said).toContain('no second parent');
  });

  test('HEAD when no commit is named, as the deploy runs it on its checkout of the tag', () => {
    expect(run(same.dir, ['push'], passedOn).output).toBe('run=false\n');
  });

  test('a commit git does not know: the tests run', () => {
    expect(run(same.dir, ['push', 'f'.repeat(40)], passedOn).output).toBe('run=true\n');
  });

  test("GitHub's record unread, or saying nothing passed: the tests run", () => {
    expect(run(same.dir, ['push', same.merge], () => null, true).output).toBe('run=true\n');
    expect(run(same.dir, ['push', same.merge], () => [], true).output).toBe('run=true\n');
  });
});

describe("GitHub's record of check", () => {
  const decided = (runs: CheckRun[] | null, event = 'push') => decide({ event, commit: 'HEAD', git: merged, checkRuns: () => runs });

  test('passed means a push run of the tip, completed with success', () => {
    expect(decided(passedOn('p')).run).toBe(false);
    for (const runs of [
      [{ ...passedOn('p')[0]!, conclusion: 'failure' }],
      [{ ...passedOn('p')[0]!, status: 'in_progress', conclusion: null }],
      // Not completed, whatever its conclusion says.
      [{ ...passedOn('p')[0]!, status: 'queued' }],
      // A pull request's run tests the pull request merged into its base, not the tip's own tree.
      [{ ...passedOn('p')[0]!, event: 'pull_request' }],
      [{ ...passedOn('q')[0]! }],
      // Another workflow's run proves nothing of the suite or the specs.
      [{ ...passedOn('p')[0]!, path: '.github/workflows/deploy.yml' }],
    ]) {
      expect(decided(runs).run, JSON.stringify(runs)).toBe(true);
    }
    expect(decided(null).reason).toContain("GitHub's record of check could not be read");
  });

  test('trees git cannot read: the tests run, and GitHub is not asked', () => {
    const asked: string[] = [];
    const result = decide({
      event: 'push',
      commit: 'HEAD',
      git: (args) => (args.includes('m^{tree}') || args.includes('p^{tree}') ? null : merged(args)),
      checkRuns: () => (asked.push('gh'), passedOn('p')),
    });

    expect(result.run).toBe(true);
    expect(asked).toEqual([]);
  });

  test('a deploy run by hand, a redeploy or a rollback, runs the tests and asks nothing', () => {
    const asked: string[] = [];
    const result = decide({
      event: 'workflow_dispatch',
      commit: 'HEAD',
      git: (args) => (asked.push(args.join(' ')), merged(args)),
      checkRuns: () => (asked.push('gh'), passedOn('p')),
    });

    expect(result.run).toBe(true);
    expect(result.reason).toContain('run by hand');
    expect(asked).toEqual([]);
  });

  test('no repository named: the tests run, and GitHub is not asked', () => {
    const output = path.join(same.dir, '.git', 'no-repository');
    writeFileSync(output, '');
    const asked: string[] = [];
    main({
      argv: ['push', same.merge],
      env: { GITHUB_OUTPUT: output },
      cwd: same.dir,
      spawn: fakeGit((command) => {
        asked.push(command);
        return { status: 0, stdout: JSON.stringify({ workflow_runs: passedOn(same.tip) }) };
      }),
      log: () => {},
      warn: () => {},
    });
    expect(readFileSync(output, 'utf8')).toBe('run=true\n');
    expect(asked).toEqual([]);
  });

  test('an answer that is not JSON, is empty, or lists no runs: the tests run', () => {
    for (const answer of ['Not Found', '', '{}', '{"workflow_runs":{}}']) {
      const output = path.join(same.dir, '.git', 'odd-answer');
      writeFileSync(output, '');
      main({
        argv: ['push', same.merge],
        env: { GITHUB_REPOSITORY: 'owner/heroesim', GITHUB_OUTPUT: output },
        cwd: same.dir,
        spawn: fakeGit(() => ({ status: 0, stdout: answer })),
        log: () => {},
        warn: () => {},
      });
      expect(readFileSync(output, 'utf8'), JSON.stringify(answer)).toBe('run=true\n');
    }
  });
});

describe('the command line', () => {
  test('takes the event and at most one commit', () => {
    for (const argv of [[], ['push', 'HEAD', 'HEAD']]) {
      expect(main({ argv, env: {}, cwd: same.dir, log: () => {}, warn: () => {} }), argv.join(' ')).toBe(2);
    }
  });
});
