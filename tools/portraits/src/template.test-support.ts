// The portrait tool's tests' scratch template, made once a run in the project's global setup (DL-249):
// a copy of this repository's `content/` JSON, `media/` and an empty inbox, committed, which every
// scratch copy copies, `.git` and all, so that no test spawns git to make one (DL-164, DL-234).
// Removed when the run ends.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { contentSources, isFolder } from '@heroesim/content';
import type { TestProject } from 'vitest/node';
import { repositoryRoot } from './cli.js';

declare module 'vitest' {
  export interface ProvidedContext {
    /** The scratch copies' first state, made once a run. */
    portraitTemplate: string;
  }
}

/**
 * Runs git in a scratch repository, and gives its output. Never its automatic maintenance, which on
 * Linux outlives the commit, detached, and writes in `.git/objects` while the test goes on (DL-167).
 */
export function git(dir: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'maintenance.auto=false', '-c', 'core.autocrlf=false', '-c', 'user.name=portrait tool test', '-c', 'user.email=test@example.invalid', ...args],
    { cwd: dir, encoding: 'utf8' },
  );
}

/** The template: the repository's content JSON, its pictures and an empty inbox, committed. */
function templateRepository(): string {
  const root = repositoryRoot;
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-portraits-template-'));
  const copy = (relative: string): void => cpSync(path.join(root, relative), path.join(dir, relative), { recursive: true });
  cpSync(path.join(root, 'content'), path.join(dir, 'content'), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(path.join(root, 'content'), source).replace(/\\/g, '/');
      // A folder of one file a row (DL-260).
      const folder = contentSources.some((each) => isFolder(each) && `${relative}/` === each);
      return relative === '' || relative.endsWith('.json') || folder;
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
  // No template of git's own: its sample hooks are files each copy would copy for nothing.
  git(dir, 'init', '--quiet', '--template=');
  git(dir, 'add', '--all');
  git(dir, 'commit', '--quiet', '-m', 'scratch');
  return dir;
}

/** The project's global setup: the template made and given to the tests, and removed after them. */
export default function setup(project: TestProject): () => void {
  const template = templateRepository();
  project.provide('portraitTemplate', template);
  return () => rmSync(template, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
