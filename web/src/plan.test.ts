// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import { checkWorkflow, type CheckRun } from '../scripts/tested.mjs';
import { browserNeeded, decideBrowser, decideDuplicate, main } from '../scripts/plan.mjs';

// What check.yml runs for a push or a pull request (DL-327): not again, on a release branch, for a
// commit a `check` already passed on; and the browser specs only when something the page or its
// specs read changed. Anything uncertain runs everything. The paths are git's, in repositories made
// here; GitHub's record is a stand-in.

const place = mkdtempSync(path.join(tmpdir(), 'heroesim-plan-test-'));
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

/** A commit of `files` (path to text) on the branch checked out. */
function commit(dir: string, files: Record<string, string>): string {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
    git(dir, 'add', file);
  }
  git(dir, 'commit', '--quiet', '-m', Object.keys(files).join(' '));
  return git(dir, 'rev-parse', 'HEAD');
}

let count = 0;
/** A repository holding one commit of `first`, then one of `change`: its two shas. */
function repository(first: Record<string, string>, change: Record<string, string>): { dir: string; before: string; after: string } {
  const dir = path.join(place, `repo-${(count += 1)}`);
  spawnSync('git', ['init', '--quiet', '--template=', '--initial-branch=main', dir]);
  const before = commit(dir, first);
  return { dir, before, after: commit(dir, change) };
}

const passedOn = (sha: string, overrides: Partial<CheckRun> = {}): CheckRun[] => [
  { id: 7, path: `.github/workflows/${checkWorkflow}`, head_sha: sha, event: 'push', status: 'completed', conclusion: 'success', ...overrides },
];

const sha = 'a'.repeat(40);

describe('a duplicate check: a release branch push of a commit that check passed on already', () => {
  const decided = (runs: readonly CheckRun[] | null, over: { event?: string; branch?: string; runId?: string } = {}) =>
    decideDuplicate({ event: 'push', branch: 'v1.2-release', sha, runId: '9', checkRuns: () => runs, ...over });

  test('is one when a push run of check completed with success on the same commit', () => {
    const result = decided(passedOn(sha));

    expect(result.duplicate).toBe(true);
    expect(result.reason).toContain('run 7');
  });

  test('is not one when the run failed, is still going, was a pull request, another commit, or another workflow', () => {
    for (const runs of [
      passedOn(sha, { conclusion: 'failure' }),
      passedOn(sha, { status: 'in_progress', conclusion: null }),
      passedOn(sha, { status: 'queued' }),
      passedOn(sha, { event: 'pull_request' }),
      passedOn('b'.repeat(40)),
      passedOn(sha, { path: '.github/workflows/deploy.yml' }),
      [],
    ]) {
      expect(decided(runs).duplicate, JSON.stringify(runs)).toBe(false);
    }
  });

  test("is not one when GitHub's record could not be read, or the run is this one", () => {
    expect(decided(null).duplicate).toBe(false);
    expect(decided(null).reason).toContain('could not be read');
    expect(decided(passedOn(sha), { runId: '7' }).duplicate).toBe(false);
  });

  test('asks only for a push to a release branch: a dev branch, a pull request or another ref runs the check and asks nothing', () => {
    for (const over of [{ branch: 'v1.2-dev' }, { branch: 'v1.2.4-dev' }, { event: 'pull_request' }, { branch: 'main' }, { branch: 'v1.2-release/x' }, { branch: 'xv1.2-release' }]) {
      const asked: string[] = [];
      const result = decideDuplicate({ event: 'push', branch: 'v1.2-release', sha, runId: '9', checkRuns: () => (asked.push('gh'), passedOn(sha)), ...over });

      expect(result.duplicate, JSON.stringify(over)).toBe(false);
      expect(asked, JSON.stringify(over)).toEqual([]);
    }
  });
});

describe('the browser specs: only when something the page or its specs read changed', () => {
  test.each([
    'web/src/app.tsx',
    'web/e2e/journey.spec.ts',
    'web/playwright.config.ts',
    'web/vite.config.ts',
    'web/scripts/plan.mjs',
    'engine/src/config.json',
    'content/items/short-sword.json',
    'words/src/index.ts',
    'media/items/silhouette.svg',
    'package.json',
    'package-lock.json',
    '.npmrc',
    '.node-version',
    'tsconfig.json',
    'tsconfig.base.json',
    '.github/workflows/check.yml',
  ])('%s needs them', (file) => {
    expect(browserNeeded(file)).toBe(true);
  });

  test.each([
    'docs/plan.md',
    'docs/decisions/archive/DL-311-326-v1.2.3.md',
    'README.md',
    'AGENTS.md',
    'CONTEXT.md',
    'harness/reports/x.json',
    'harness/src/main.ts',
    'cli/src/main.ts',
    'tools/editor/src/main.ts',
    '.github/workflows/deploy.yml',
    '.github/dependabot.yml',
    '.claude/settings.json',
    'eslint.config.js',
    'vitest.config.ts',
  ])('%s does not', (file) => {
    expect(browserNeeded(file)).toBe(false);
  });

  test('a path only looks like a folder it is not in', () => {
    for (const file of ['website/x.ts', 'enginex/a.ts', 'docs/web/a.md', 'docs/engine/a.md']) expect(browserNeeded(file), file).toBe(false);
  });

  test('is run by a change in docs/ and web/ together, and not by docs/ alone', () => {
    const { dir, before, after } = repository({ 'docs/a.md': 'a', 'web/src/a.ts': 'a' }, { 'docs/a.md': 'b', 'web/src/a.ts': 'b' });
    const docs = repository({ 'docs/a.md': 'a', 'web/src/a.ts': 'a' }, { 'docs/a.md': 'b', 'docs/b.md': 'b' });

    expect(decideBrowser({ event: 'push', sha: after, base: before, git: gitIn(dir) }).browser).toBe(true);
    const skipped = decideBrowser({ event: 'push', sha: docs.after, base: docs.before, git: gitIn(docs.dir) });
    expect(skipped.browser).toBe(false);
    expect(skipped.reason).toContain('docs/a.md');
  });

  test('counts a rename out of web/ as a change of web/', () => {
    const dir = path.join(place, 'renamed');
    spawnSync('git', ['init', '--quiet', '--template=', '--initial-branch=main', dir]);
    const before = commit(dir, { 'web/src/a.ts': 'export const a = 1;\n'.repeat(20) });
    mkdirSync(path.join(dir, 'docs'));
    renameSync(path.join(dir, 'web/src/a.ts'), path.join(dir, 'docs/a.ts'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '--quiet', '-m', 'moved');
    const after = git(dir, 'rev-parse', 'HEAD');

    const result = decideBrowser({ event: 'push', sha: after, base: before, git: gitIn(dir) });

    expect(result.browser).toBe(true);
    expect(result.reason).toContain('web/src/a.ts');
  });

  test('a push of several commits is judged over all of them', () => {
    const { dir, before } = repository({ 'docs/a.md': 'a' }, { 'web/src/a.ts': 'x' });
    const after = commit(dir, { 'docs/a.md': 'c' });

    expect(decideBrowser({ event: 'push', sha: after, base: before, git: gitIn(dir) }).browser).toBe(true);
  });

  test('a change of nothing runs nothing', () => {
    const { dir, after } = repository({ 'docs/a.md': 'a' }, { 'docs/b.md': 'b' });

    expect(decideBrowser({ event: 'push', sha: after, base: after, git: gitIn(dir) }).browser).toBe(false);
  });
});

/** git in `dir` the way the script's own would answer: trimmed output, or `null` when it fails. */
function gitIn(dir: string): (args: readonly string[]) => string | null {
  return (args) => {
    const child = spawnSync('git', [...args], { cwd: dir, encoding: 'utf8' });
    return child.error || child.status !== 0 ? null : String(child.stdout ?? '').trim();
  };
}

describe('anything uncertain runs the browser specs', () => {
  test('a push to a new branch, a base git does not know, a diff git cannot make, an event that is neither push nor pull request', () => {
    const { dir, after } = repository({ 'docs/a.md': 'a' }, { 'docs/b.md': 'b' });
    const git = gitIn(dir);
    const unknown = 'f'.repeat(40);

    for (const [name, options] of Object.entries({
      'a new branch': { base: '0'.repeat(40) },
      'no base': { base: '' },
      'a base git does not know and cannot fetch': { base: unknown },
      'an event that is neither': { event: 'schedule', base: after },
      'a diff git cannot make': { base: after, git: (args: readonly string[]) => (args[0] === 'diff' ? null : git(args)) },
    })) {
      const result = decideBrowser({ event: 'push', sha: after, git, ...options });

      expect(result.browser, name).toBe(true);
      expect(result.reason, name).toMatch(/specs run/);
    }
  });

  test("a base only the remote has is fetched, a shallow clone as CI's checkout is, and judged by its tree", () => {
    const { dir: origin, before, after } = repository({ 'docs/a.md': 'a' }, { 'docs/b.md': 'b' });
    git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
    const clone = path.join(place, 'clone');
    const cloned = spawnSync('git', ['clone', '--quiet', '--depth=1', pathToFileURL(origin).href, clone], { encoding: 'utf8' });
    expect(cloned.status, cloned.stderr).toBe(0);
    expect(spawnSync('git', ['cat-file', '-e', `${before}^{commit}`], { cwd: clone }).status).not.toBe(0);

    const result = decideBrowser({ event: 'push', sha: after, base: before, git: gitIn(clone) });

    expect(result.browser).toBe(false);
    expect(result.reason).toContain('docs/b.md');
  });
});

describe('the command line', () => {
  /** The command line in a repository whose push is `before` to `after`, GitHub's record `runs`. */
  function run(
    argv: string[],
    env: Record<string, string>,
    runs: CheckRun[] | null,
    dir: string,
  ): { status: number; output: string; summary: string; said: string; asked: string[][] } {
    const output = path.join(dir, '.git', 'github-output');
    const summary = path.join(dir, '.git', 'github-summary');
    writeFileSync(output, '');
    writeFileSync(summary, '');
    const asked: string[][] = [];
    const lines: string[] = [];
    const status = main({
      argv,
      env: { GITHUB_REPOSITORY: 'owner/heroesim', GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, GITHUB_RUN_ID: '9', ...env },
      cwd: dir,
      spawn: (command, args, options) => {
        if (command === 'git') return spawnSync(command, [...args], { ...options, cwd: dir });
        asked.push([command, ...args]);
        return runs === null ? { status: 1, stdout: '' } : { status: 0, stdout: JSON.stringify({ workflow_runs: runs }) };
      },
      log: (line) => lines.push(line),
      warn: (line) => lines.push(line),
    });
    return { status, output: readFileSync(output, 'utf8'), summary: readFileSync(summary, 'utf8'), said: lines.join('\n'), asked };
  }

  const docsOnly = repository({ 'docs/a.md': 'a' }, { 'docs/b.md': 'b' });

  test('a release branch push already passed: duplicate, asked as deploy asks, and no diff is made', () => {
    const result = run(['push', docsOnly.before], { GITHUB_SHA: docsOnly.after, GITHUB_REF_NAME: 'v1.2-release' }, passedOn(docsOnly.after), docsOnly.dir);

    expect(result.status).toBe(0);
    expect(result.output).toBe('duplicate=true\nbrowser=false\n');
    expect(result.summary).toContain(result.said);
    expect(result.asked).toEqual([
      ['gh', 'api', `repos/owner/heroesim/actions/workflows/${checkWorkflow}/runs?head_sha=${docsOnly.after}&event=push&status=success`],
    ]);
  });

  test('a dev branch push of docs: not a duplicate, no browser specs, and GitHub is not asked', () => {
    const result = run(['push', docsOnly.before], { GITHUB_SHA: docsOnly.after, GITHUB_REF_NAME: 'v1.2-dev' }, passedOn(docsOnly.after), docsOnly.dir);

    expect(result.output).toBe('duplicate=false\nbrowser=false\n');
    expect(result.asked).toEqual([]);
  });

  test('a release branch push not passed before: the check runs, and the browser specs by what changed', () => {
    const web = repository({ 'docs/a.md': 'a' }, { 'web/src/a.ts': 'b' });
    const result = run(['push', web.before], { GITHUB_SHA: web.after, GITHUB_REF_NAME: 'v1.2-release' }, [], web.dir);

    expect(result.output).toBe('duplicate=false\nbrowser=true\n');
  });

  test("GitHub's record unread: the check runs", () => {
    const result = run(['push', docsOnly.before], { GITHUB_SHA: docsOnly.after, GITHUB_REF_NAME: 'v1.2-release' }, null, docsOnly.dir);

    expect(result.output).toBe('duplicate=false\nbrowser=false\n');
  });

  test('a pull request: never a duplicate, the browser specs by its base', () => {
    const result = run(['pull_request', docsOnly.before], { GITHUB_SHA: docsOnly.after, GITHUB_REF_NAME: '12/merge' }, passedOn(docsOnly.after), docsOnly.dir);

    expect(result.output).toBe('duplicate=false\nbrowser=false\n');
    expect(result.asked).toEqual([]);
  });

  test('no sha named: both run', () => {
    const result = run(['push', docsOnly.before], { GITHUB_REF_NAME: 'v1.2-dev' }, [], docsOnly.dir);

    expect(result.output).toBe('duplicate=false\nbrowser=true\n');
  });

  test('takes the event and the base', () => {
    for (const argv of [[], ['push'], ['push', 'a', 'b']]) {
      expect(main({ argv, env: {}, cwd: docsOnly.dir, log: () => {}, warn: () => {} }), argv.join(' ')).toBe(2);
    }
  });
});
