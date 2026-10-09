import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { repositoryRoot } from './cli.js';

// The archives are read by path, through their indexes, and left out of a search by default
// (DL-221, DL-222): `docs/.rgignore` names each, and each is where it names.
describe('the archives out of a search', () => {
  test('docs/.rgignore names the three archives, and each exists', () => {
    const ignored = readFileSync(path.join(repositoryRoot, 'docs/.rgignore'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
    expect(ignored).toEqual(['adr/archive/', 'decisions/archive/', 'planning/archive/']);
    for (const folder of ignored) expect(existsSync(path.join(repositoryRoot, 'docs', folder))).toBe(true);
  });
});
