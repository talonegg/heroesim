/**
 * The release's version rules (DL-124): which tag merging a release branch into `main` releases,
 * whether a tag may deploy, and whether a merge is a record only that releases nothing (DL-255).
 * `.github/workflows/release-pr.yml`, `release.yml` and `deploy.yml` run it; its tests are
 * src/release.test.ts.
 *
 *   node web/scripts/release.mjs next <branch>   prints the tag merging <branch> releases
 *   node web/scripts/release.mjs newest <tag>    fails unless <tag> is the newest release tag
 *   node web/scripts/release.mjs record <commit> [base]
 *                                                prints `record` when <commit> changes nothing since
 *                                                [base], by default the newest release tag, but
 *                                                records (DL-255), and `release` otherwise
 *
 * They read the tags from git (`git tag --list v*`) in the directory they run in. A release tag is
 * `vMAJOR.MINOR.PATCH`; any other `v*` tag is not a release and is ignored. A release branch is
 * `vMAJOR.MINOR-release`, and each merge of it into `main` but a record's releases the line's next
 * patch: its first merge `vMAJOR.MINOR.0`. A tag older than the newest release never deploys, so a merge of
 * an older line, or a pushed tag on one, cannot put production back (DL-110), except by the
 * manual redeploy that says so (DL-124 item 9).
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** `v1.1.0` as numbers; `null` for any tag that is not a release's. */
export function parseTag(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}

/** `v1.1-release` as its line's numbers; `null` for any branch that is not a release branch. */
export function parseReleaseBranch(branch) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)-release$/.exec(branch);
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
}

/** Negative, zero or positive as release tag `a` is older than, the same as or newer than `b`. */
export function compareTags(a, b) {
  const [x, y] = [parseTag(a), parseTag(b)];
  if (x === null || y === null) throw new Error(`not a release tag: ${x === null ? a : b}`);
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}

/** The newest release tag of `tags`; `null` when none is a release's. */
export function newestTag(tags) {
  const releases = tags.filter((tag) => parseTag(tag) !== null);
  return releases.length === 0 ? null : releases.reduce((a, b) => (compareTags(a, b) >= 0 ? a : b));
}

/**
 * The tag merging `branch` into `main` releases, given the tags already made: the line's next
 * patch, or its `.0`. `{ refusal }` when `branch` is no release branch, or the tag would be older
 * than the newest release, as a merge of an older line's branch would be.
 */
export function nextRelease(branch, tags) {
  const line = parseReleaseBranch(branch);
  if (line === null) return { refusal: `${branch} is not a release branch (v#.#-release): only a release branch releases.` };
  const prefix = `v${line.major}.${line.minor}.`;
  const lineNewest = newestTag(tags.filter((tag) => tag.startsWith(prefix)));
  const tag = `${prefix}${lineNewest === null ? 0 : parseTag(lineNewest).patch + 1}`;
  const newest = newestTag(tags);
  if (newest !== null && compareTags(tag, newest) <= 0) {
    return { refusal: `${tag} would be older than ${newest}, the newest release: ${branch} is not the latest line.` };
  }
  return { tag };
}

/** Why `tag` may not deploy, or `null` when it may: it must be the newest release tag of `tags`. */
export function deployRefusal(tag, tags) {
  if (parseTag(tag) === null) return `${tag} is not a release tag (vMAJOR.MINOR.PATCH).`;
  const newest = newestTag([...tags, tag]);
  return newest === tag ? null : `${tag} is older than ${newest}, the newest release: production never goes back but by hand.`;
}

/**
 * Whether a merge changing `paths` is a record only, and so releases nothing: no tag, no deploy
 * (DL-255, the owner's rule). Every path must lie in `docs/`, `harness/reports/` or `.github/`, be
 * a Markdown file (`*.md`), or be this script, its types or its test. No change at all is one too:
 * the tree is a release already. Paths are git's, relative to the repository's root.
 */
export function isRecordOnly(paths) {
  const scripts = ['web/scripts/release.mjs', 'web/scripts/release.d.mts', 'web/src/release.test.ts'];
  return paths.every(
    (file) => ['docs/', 'harness/reports/', '.github/'].some((area) => file.startsWith(area)) || file.endsWith('.md') || scripts.includes(file),
  );
}

/** The release tags git knows, in the directory it runs in. */
function gitTags(spawn) {
  const child = spawn('git', ['tag', '--list', 'v*'], { encoding: 'utf8' });
  if (child.error || child.status !== 0) throw new Error('git could not list the tags.');
  return child.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
}

/**
 * The paths that differ between the trees of `base` and `commit`. A rename is named both ways
 * (`--no-renames`), so that moving a file into `docs/` still releases; `-z` keeps each path as it is.
 */
function gitChanged(spawn, base, commit) {
  const child = spawn('git', ['diff', '--name-only', '--no-renames', '-z', base, commit], { encoding: 'utf8' });
  if (child.error || child.status !== 0) throw new Error(`git could not name the changes from ${base} to ${commit}.`);
  return child.stdout.split('\0').filter((file) => file !== '');
}

/** `record <commit> [base]`: prints `record` or `release`, and why to `warn`. */
function judgeRecord(spawn, log, warn, commit, given) {
  const base = given ?? newestTag(gitTags(spawn));
  if (base === null) {
    warn('release: no release tag yet, so nothing to compare with: it releases.');
    log('release');
    return 0;
  }
  const changed = gitChanged(spawn, base, commit);
  const releasing = changed.filter((file) => !isRecordOnly([file]));
  if (releasing.length === 0) {
    warn(`release: ${commit} changes ${changed.length} path(s) since ${base}, records alone: it releases nothing (DL-255).`);
    log('record');
  } else {
    warn(`release: ${commit} changes ${releasing.length} path(s) since ${base} that release, ${releasing[0]} first.`);
    log('release');
  }
  return 0;
}

/** The command line: `next <branch>`, `newest <tag>` or `record <commit> [base]`. Returns the exit status. */
export function main({ argv = process.argv.slice(2), spawn = spawnSync, log = console.log, warn = console.error } = {}) {
  const [command, name, ...rest] = argv;
  if (!['next', 'newest', 'record'].includes(command) || !name || rest.length > (command === 'record' ? 1 : 0)) {
    warn('release: usage: release.mjs next <branch> | release.mjs newest <tag> | release.mjs record <commit> [base]');
    return 2;
  }
  if (command === 'record') return judgeRecord(spawn, log, warn, name, rest[0]);
  const tags = gitTags(spawn);
  if (command === 'next') {
    const next = nextRelease(name, tags);
    if (next.refusal) {
      warn(`release: refused: ${next.refusal}`);
      return 1;
    }
    log(next.tag);
    return 0;
  }
  const refusal = deployRefusal(name, tags);
  if (refusal !== null) {
    warn(`release: refused: ${refusal}`);
    return 1;
  }
  log(`release: ${name} is the newest release tag.`);
  return 0;
}

const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url);
if (isMain) process.exitCode = main();
