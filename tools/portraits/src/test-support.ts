// For the tool's tests: a scratch copy of the parts of this repository the tool reads and writes,
// made a git repository of its own, so a test can change it and read `git status` after.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { repositoryRoot } from './cli.js';
import { formatJson } from './json-format.js';

/** The repository the tests read: this one. */
export const root = repositoryRoot;

/** Runs git in a scratch repository, and gives its output. */
export function git(dir: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'core.autocrlf=false', '-c', 'user.name=portrait tool test', '-c', 'user.email=test@example.invalid', ...args],
    { cwd: dir, encoding: 'utf8' },
  );
}

/** `git status --porcelain` of a scratch repository, untracked files named one by one. */
export function status(dir: string): string {
  return git(dir, 'status', '--porcelain', '--untracked-files=all');
}

/**
 * A scratch copy of this repository's `content/` (its JSON, and the source that holds the content
 * version), `media/` and the inbox, committed; removed by the function it returns with.
 */
export function scratchRepository(): { dir: string; remove: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-portraits-'));
  const copy = (relative: string): void => cpSync(path.join(root, relative), path.join(dir, relative), { recursive: true });
  cpSync(path.join(root, 'content'), path.join(dir, 'content'), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(path.join(root, 'content'), source).replace(/\\/g, '/');
      return relative === '' || relative.endsWith('.json') || relative === 'src' || relative === 'src/parse.ts' || relative === 'src/content.test.ts';
    },
  });
  copy('media/portraits');
  copy('media/banners');
  copy('media/items');
  for (const role of ['guildmaster', 'hero']) {
    mkdirSync(path.join(dir, 'media', 'inbox', role), { recursive: true });
    writeFileSync(path.join(dir, 'media', 'inbox', role, '.gitkeep'), '');
  }
  writeFileSync(path.join(dir, '.gitignore'), 'media/inbox/**\n!media/inbox/*/\n!media/inbox/*/.gitkeep\n');
  git(dir, 'init', '--quiet');
  git(dir, 'add', '--all');
  git(dir, 'commit', '--quiet', '-m', 'scratch');
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Reads a JSON file of a scratch repository. */
export function readJson<T>(dir: string, relative: string): T {
  return JSON.parse(readFileSync(path.join(dir, relative), 'utf8')) as T;
}

/** Writes a JSON file of a scratch repository, as the tool does. */
export function writeJson(dir: string, relative: string, value: unknown): void {
  writeFileSync(path.join(dir, relative), formatJson(value));
}

/** An upload in a scratch repository's inbox, copied from a file. */
export function upload(dir: string, from: string, to: string): string {
  const target = path.join(dir, to);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(from, target);
  return to;
}
