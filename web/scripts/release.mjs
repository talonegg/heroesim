/**
 * The release's version rules (DL-124): which tag merging a release branch into `main` releases,
 * and whether a tag may deploy. `.github/workflows/release.yml` and `deploy.yml` run it; its
 * tests are src/release.test.ts.
 *
 *   node web/scripts/release.mjs next <branch>   prints the tag merging <branch> releases
 *   node web/scripts/release.mjs newest <tag>    fails unless <tag> is the newest release tag
 *
 * Both read the tags from git (`git tag --list v*`) in the directory they run in. A release tag is
 * `vMAJOR.MINOR.PATCH`; any other `v*` tag is not a release and is ignored. A release branch is
 * `vMAJOR.MINOR-release`, and each merge of it into `main` releases the line's next patch: its
 * first merge `vMAJOR.MINOR.0`. A tag older than the newest release never deploys, so a merge of
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

/** The release tags git knows, in the directory it runs in. */
function gitTags(spawn) {
  const child = spawn('git', ['tag', '--list', 'v*'], { encoding: 'utf8' });
  if (child.error || child.status !== 0) throw new Error('git could not list the tags.');
  return child.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
}

/** The command line: `next <branch>` or `newest <tag>`. Returns the exit status. */
export function main({ argv = process.argv.slice(2), spawn = spawnSync, log = console.log, warn = console.error } = {}) {
  const [command, name, ...rest] = argv;
  if (!['next', 'newest'].includes(command) || !name || rest.length > 0) {
    warn('release: usage: release.mjs next <branch> | release.mjs newest <tag>');
    return 2;
  }
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
