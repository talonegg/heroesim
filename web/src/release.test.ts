// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { compareTags, deployRefusal, main, newestTag, nextRelease, parseReleaseBranch, parseTag } from '../scripts/release.mjs';

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

  test('takes exactly one command and one name', () => {
    for (const argv of [[], ['next'], ['newest', 'v1.1.0', 'v1.0.1'], ['tag', 'v1.1.0']]) expect(run(argv).status, argv.join(' ')).toBe(2);
  });

  test('fails when git cannot list the tags', () => {
    expect(() => main({ argv: ['next', 'v1.1-release'], spawn: () => ({ status: 128, stdout: '' }), log: () => {}, warn: () => {} })).toThrow(
      'git could not list the tags',
    );
  });
});
