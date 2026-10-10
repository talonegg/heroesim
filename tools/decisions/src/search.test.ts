import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { repositoryRoot } from './cli.js';

// The archives are read by path, through their indexes, and left out of a search by default
// (DL-221, DL-222): `docs/.rgignore` names each archive the repository holds, and each name is a
// folder that exists.
describe('the archives out of a search', () => {
  test('docs/.rgignore names every archive folder under docs/, and each name is a folder that exists', () => {
    const ignored = readFileSync(path.join(repositoryRoot, 'docs/.rgignore'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
    const held = new Set<string>();
    for (const file of execFileSync('git', ['ls-files', 'docs'], { cwd: repositoryRoot, encoding: 'utf8' }).split(/\r?\n/)) {
      const segments = path.posix.relative('docs', file).split('/');
      const at = segments.indexOf('archive');
      if (at >= 0 && at < segments.length - 1) held.add(`${segments.slice(0, at + 1).join('/')}/`);
    }
    expect(held.size).toBeGreaterThan(0);
    expect([...held].sort()).toEqual([...ignored].sort());
    for (const folder of ignored) expect(existsSync(path.join(repositoryRoot, 'docs', folder))).toBe(true);
  });
});
