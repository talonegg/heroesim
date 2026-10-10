// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import { compareTags, deployRefusal, isRecordOnly, main, newestTag, nextRelease, parseReleaseBranch, parseTag } from '../scripts/release.mjs';

// The release's version rules (DL-124): merging a release branch `v#.#-release` into `main`
// releases its line's next patch, and only the newest release tag deploys, so that production
// never goes back but by the manual redeploy. `.github/workflows/release.yml` and `deploy.yml`
// run these rules through release.mjs's command line.

const released = ['v1.0.0', 'v1.0.1', 'v1.1.0', 'm8-modules', 'm9-redesign'];

describe('a release tag', () => {
  test('is vMAJOR.MINOR.PATCH, and nothing else is', () => {
    expect(parseTag('v1.1.0')).toEqual({ major: 1, minor: 1, patch: 0 });
    expect(parseTag('v10.2.33')).toEqual({ major: 10, minor: 2, patch: 33 });
    for (const tag of ['m9-redesign', 'v1.1', 'v1.1.0-rc1', 'v01.1.0', '1.1.0', 'v1.1.0 ']) expect(parseTag(tag), tag).toBeNull();
  });

  test('orders by number, never as text: v1.10.0 is newer than v1.9.3', () => {
    expect(compareTags('v1.10.0', 'v1.9.3')).toBeGreaterThan(0);
    expect(compareTags('v1.1.0', 'v1.1.0')).toBe(0);
    expect(compareTags('v1.0.9', 'v1.1.0')).toBeLessThan(0);
    expect(newestTag([...released, 'v1.10.0', 'v1.9.3'])).toBe('v1.10.0');
    expect(newestTag(['m8-modules'])).toBeNull();
  });
});

describe('merging a release branch into main', () => {
  test("releases its line's next patch", () => {
    expect(nextRelease('v1.1-release', released)).toEqual({ tag: 'v1.1.1' });
    expect(nextRelease('v1.1-release', [...released, 'v1.1.1', 'v1.1.2'])).toEqual({ tag: 'v1.1.3' });
  });

  test("releases a new line's .0 first", () => {
    expect(nextRelease('v1.2-release', released)).toEqual({ tag: 'v1.2.0' });
    expect(nextRelease('v2.0-release', released)).toEqual({ tag: 'v2.0.0' });
  });

  test('refuses an older line, which would put production back', () => {
    expect(nextRelease('v1.0-release', released).refusal).toContain('v1.0.2 would be older than v1.1.0');
    expect(nextRelease('v1.1-release', [...released, 'v1.2.0']).refusal).toContain('older than v1.2.0');
  });

  test('refuses any branch but a release branch', () => {
    for (const branch of ['v1.1-dev', 'main', 'v1.1-release-fix', 'release', 'v1-release']) {
      expect(parseReleaseBranch(branch), branch).toBeNull();
      expect(nextRelease(branch, released).refusal, branch).toContain('not a release branch');
    }
  });
});

describe('a tag deploys', () => {
  test('when it is the newest release tag', () => {
    expect(deployRefusal('v1.1.0', released)).toBeNull();
    // A tag only just made, not yet among those listed, is the newest when it is newer.
    expect(deployRefusal('v1.1.1', released)).toBeNull();
  });

  test('never when an older one, nor when it is no release tag', () => {
    expect(deployRefusal('v1.0.1', released)).toContain('v1.0.1 is older than v1.1.0');
    expect(deployRefusal('m9-redesign', released)).toContain('not a release tag');
  });
});

// DL-255: a merge whose changes since the newest release tag are records alone releases nothing.
describe('a merge that is a record only', () => {
  test('changes nothing but docs/, Markdown, harness/reports/, .github/ and release.mjs with its test and types', () => {
    for (const path of [
      'docs/plan.md',
      'docs/decisions/index.md',
      'docs/img/flow.svg',
      'README.md',
      'harness/README.md',
      'web/src/notes.md',
      'harness/reports/v1.1.9-s1-baseline-2026-10-09.json',
      '.github/workflows/release.yml',
      '.github/dependabot.yml',
      'web/scripts/release.mjs',
      'web/scripts/release.d.mts',
      'web/src/release.test.ts',
    ]) {
      expect(isRecordOnly([path]), path).toBe(true);
    }
    expect(isRecordOnly(['docs/plan.md', 'harness/reports/x.json', '.github/workflows/check.yml', 'CONTEXT.md'])).toBe(true);
  });

  test('is not one when any path releases', () => {
    for (const path of [
      'web/src/x.ts',
      'engine/src/config.json',
      'content/src/validate.ts',
      'package-lock.json',
      'cli/src/main.ts',
      'tools/measure/run.ts',
      'harness/src/sweep.ts',
      'web/scripts/deploy.mjs',
      'web/src/tested.test.ts',
    ]) {
      expect(isRecordOnly([path]), path).toBe(false);
      expect(isRecordOnly(['docs/plan.md', 'README.md', path]), path).toBe(false);
    }
  });

  test('is one when nothing changed: the tree is the release already', () => {
    expect(isRecordOnly([])).toBe(true);
  });

  test('is not one for paths that only look alike', () => {
    for (const path of [
      'docs-old/x',
      'docs',
      'web/docs/x.ts',
      'web/scripts/release.mjs.bak',
      'web/scripts/release.mjs/x',
      'web/scripts/release.test.ts',
      'src/web/scripts/release.mjs',
      'harness/reports-x/a.json',
      'harness/reportsx.json',
      'web/harness/reports/a.json',
      '.github-old/x.yml',
      '.githubx',
      'web/src/x.md.ts',
      'web/src/x.mdx',
      'web/src/md',
    ]) {
      expect(isRecordOnly([path]), path).toBe(false);
    }
  });
});

describe('the command line', () => {
  const run = (argv: string[], tags = released) => {
    const output: string[] = [];
    const status = main({
      argv,
      spawn: () => ({ status: 0, stdout: `${tags.filter((tag) => tag.startsWith('v')).join('\n')}\n` }),
      log: (line) => output.push(line),
      warn: (line) => output.push(line),
    });
    return { status, output: output.join('\n') };
  };

  test('prints the next tag alone, for the workflow to read', () => {
    expect(run(['next', 'v1.1-release'])).toEqual({ status: 0, output: 'v1.1.1' });
  });

  test('fails with the reason when it refuses', () => {
    expect(run(['next', 'v1.0-release']).status).toBe(1);
    expect(run(['newest', 'v1.0.1'])).toEqual({ status: 1, output: expect.stringContaining('older than v1.1.0') });
    expect(run(['newest', 'v1.1.0']).status).toBe(0);
  });

  test('takes exactly one command and one name, and record a base besides', () => {
    for (const argv of [[], ['next'], ['newest', 'v1.1.0', 'v1.0.1'], ['tag', 'v1.1.0'], ['record'], ['record', 'HEAD', 'v1.1.0', 'v1.0.1']]) {
      expect(run(argv).status, argv.join(' ')).toBe(2);
    }
  });

  // git's answers by command: the tags, and the paths `git diff` names between two commits.
  const record = (argv: string[], changed: string[], tags = released) => {
    const calls: string[][] = [];
    const output: string[] = [];
    const status = main({
      argv,
      spawn: (command, args) => {
        calls.push([command, ...args]);
        if (args[0] === 'tag') return { status: 0, stdout: `${tags.join('\n')}\n` };
        return { status: 0, stdout: changed.map((path) => `${path}\0`).join('') };
      },
      log: (line) => output.push(line),
      warn: () => {},
    });
    return { status, output: output.join('\n'), diff: calls.find((call) => call[1] === 'diff') };
  };

  test('record prints record or release, judged since the newest release tag', () => {
    expect(record(['record', 'HEAD'], ['docs/plan.md', 'web/scripts/release.mjs'])).toMatchObject({ status: 0, output: 'record' });
    expect(record(['record', 'HEAD'], ['docs/plan.md', 'web/src/x.ts'])).toMatchObject({ status: 0, output: 'release' });
    // Every path of a rename both ways, so that moving code into docs/ still releases.
    expect(record(['record', 'HEAD'], []).diff).toEqual(['git', 'diff', '--name-only', '--no-renames', '-z', 'v1.1.0', 'HEAD']);
  });

  test('record takes a base in place of the newest release tag', () => {
    expect(record(['record', 'abc123', 'v1.0.1'], ['README.md'])).toMatchObject({ status: 0, output: 'record' });
    expect(record(['record', 'abc123', 'v1.0.1'], []).diff).toEqual(['git', 'diff', '--name-only', '--no-renames', '-z', 'v1.0.1', 'abc123']);
  });

  test('record says release when there is no release tag to compare with', () => {
    expect(record(['record', 'HEAD'], ['docs/plan.md'], ['m9-redesign'])).toMatchObject({ status: 0, output: 'release', diff: undefined });
  });

  test('record fails when git cannot name the changes', () => {
    const spawn = (_command: string, args: readonly string[]) =>
      args[0] === 'tag' ? { status: 0, stdout: 'v1.1.0\n' } : { status: 128, stdout: '' };
    expect(() => main({ argv: ['record', 'HEAD'], spawn, log: () => {}, warn: () => {} })).toThrow('git could not name the changes');
  });

  test('fails when git cannot list the tags', () => {
    expect(() => main({ argv: ['next', 'v1.1-release'], spawn: () => ({ status: 128, stdout: '' }), log: () => {}, warn: () => {} })).toThrow(
      'git could not list the tags',
    );
  });
});

describe('record, on a repository made here', () => {
  const place = mkdtempSync(path.join(tmpdir(), 'heroesim-release-test-'));
  afterAll(() => {
    rmSync(place, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  const git = (dir: string, ...args: string[]): string => {
    const child = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {
      cwd: dir,
      encoding: 'utf8',
    });
    if (child.status !== 0) throw new Error(`git ${args.join(' ')}: ${child.stderr}`);
    return child.stdout.trim();
  };

  /** A repository whose release v1.1.0 holds web/src/x.ts, then a commit of `change` on it. */
  const judged = (name: string, change: (dir: string) => void): string => {
    const dir = path.join(place, name);
    spawnSync('git', ['init', '--quiet', '--template=', '--initial-branch=main', dir]);
    mkdirSync(path.join(dir, 'web/src'), { recursive: true });
    mkdirSync(path.join(dir, 'docs'));
    writeFileSync(path.join(dir, 'web/src/x.ts'), 'export const x = 1;\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '--quiet', '-m', 'the release');
    git(dir, 'tag', 'v1.1.0');
    change(dir);
    git(dir, 'add', '-A');
    git(dir, 'commit', '--quiet', '--allow-empty', '-m', 'the change');
    const output: string[] = [];
    main({
      argv: ['record', 'HEAD'],
      spawn: (command, args, options) => spawnSync(command, args, { ...options, cwd: dir }),
      log: (line) => output.push(line),
      warn: () => {},
    });
    return output.join('\n');
  };

  test('a change to docs alone is a record, and one to the code releases', () => {
    expect(judged('docs', (dir) => writeFileSync(path.join(dir, 'docs/plan.md'), 'planned\n'))).toBe('record');
    expect(judged('code', (dir) => writeFileSync(path.join(dir, 'web/src/x.ts'), 'export const x = 2;\n'))).toBe('release');
    expect(judged('nothing', () => {})).toBe('record');
  });

  test('moving code into docs/ releases: the path it leaves counts', () => {
    expect(judged('moved', (dir) => git(dir, 'mv', 'web/src/x.ts', 'docs/x.ts'))).toBe('release');
  });
});

// The workflows that read `record` (DL-255): a pull request that is a record says so, and its merge,
// once release.yml's refusals pass, makes no tag and calls no deploy.
describe('the workflows, for a record', () => {
  const repoDir = fileURLToPath(new URL('../..', import.meta.url));
  const workflowText = (name: string): string => readFileSync(path.join(repoDir, '.github/workflows', name), 'utf8').replace(/\r\n/g, '\n');

  test('release-pr.yml titles a record "Record from <branch> (no release)", and anything else a release', () => {
    const workflow = workflowText('release-pr.yml');
    const judged = workflow.indexOf('if [ "$(node web/scripts/release.mjs record HEAD)" = record ]; then');
    const recordTitle = workflow.indexOf('title="Record from $BRANCH (no release)"');
    const releaseTitle = workflow.indexOf('title="Release $tag from $BRANCH"');

    expect(judged).toBeGreaterThan(workflow.indexOf('node web/scripts/release.mjs next "$BRANCH"'));
    expect(recordTitle).toBeGreaterThan(judged);
    expect(workflow).toContain('Merging this releases nothing');
    expect(releaseTitle).toBeGreaterThan(recordTitle);
    // Both titles go through the one edit or create that follows.
    expect(workflow.indexOf('gh pr edit "$number" --repo "$GITHUB_REPOSITORY" --title "$title" --body "$body"')).toBeGreaterThan(releaseTitle);
  });

  test('release.yml judges a record after its refusals, then makes no tag and calls no deploy', () => {
    const workflow = workflowText('release.yml');
    const judged = workflow.indexOf('if [ "$(node web/scripts/release.mjs record HEAD)" = record ]; then');
    const record = workflow.slice(judged, workflow.indexOf('\n          fi\n', judged));

    expect(judged).toBeGreaterThan(workflow.indexOf('git diff --quiet "$head" HEAD'));
    expect(judged).toBeGreaterThan(workflow.indexOf('existing="$(git tag --points-at HEAD'));
    expect(judged).toBeGreaterThan(workflow.indexOf('tag="$(node web/scripts/release.mjs next "$BRANCH")"'));
    expect(judged).toBeLessThan(workflow.indexOf('git tag -a "$tag"'));
    expect(record).toContain('"$GITHUB_STEP_SUMMARY"');
    expect(record).toContain('echo "tag=" >> "$GITHUB_OUTPUT"');
    expect(record).toContain('exit 0');
    expect(workflow).toMatch(/\n {2}deploy:\n {4}needs: tag\n {4}if: needs\.tag\.outputs\.tag != ''\n/);
  });
});
