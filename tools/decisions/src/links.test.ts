import { execFileSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { repositoryRoot } from './cli.js';
import { brokenLinksIn, brokenLinksInRepository } from './links.js';
import { repositoryTextsOnce, scratchRepository } from './test-support.js';

describe('links', () => {
  const present = new Set(['docs/plan.md', 'docs/adr', 'README.md']);
  const exists = (target: string): boolean => present.has(target);

  test('follows a relative link from its file, with or without an anchor, and finds a missing one', () => {
    const text = 'See [the plan](./plan.md#2-milestones), [ADRs](adr) and [up](../README.md).\n[gone](./gone.md)';
    expect(brokenLinksIn(text, 'docs/x.md', exists)).toEqual([{ file: 'docs/x.md', line: 2, target: './gone.md' }]);
  });

  test('follows no web address, mail address or link within the page', () => {
    const text = '[a](https://example.com/x.md) [b](mailto:a@b.c) [c](#section)';
    expect(brokenLinksIn(text, 'docs/x.md', exists)).toEqual([]);
  });

  test('reads a space written %20 as a space', () => {
    expect(brokenLinksIn('[p](./my%20plan.md)', 'docs/x.md', (target) => target === 'docs/my plan.md')).toEqual([]);
  });

  test('reads a title, angle brackets and a reference-style link, and skips code spans and fences', () => {
    const text = [
      '[a](./gone-a.md "A title") [b](<./gone b.md>)',
      '[c]: ./gone-c.md',
      'See `[d](./gone-d.md)` and ``[e](./gone-e.md)``.',
      '```',
      '[f](./gone-f.md)',
      '```',
    ].join('\n');
    expect(brokenLinksIn(text, 'docs/x.md', exists).map(({ line, target }) => `${line} ${target}`)).toEqual([
      '1 ./gone-a.md',
      '1 ./gone b.md',
      '2 ./gone-c.md',
    ]);
  });

  test('reads a link from / at the repository root', () => {
    expect(brokenLinksIn('[r](/README.md) [g](/gone.md)', 'docs/x.md', exists).map(({ target }) => target)).toEqual(['/gone.md']);
  });

  test('finds a malformed escape broken, rather than stopping', () => {
    expect(brokenLinksIn('[p](./100%.md)', 'docs/x.md', exists).map(({ target }) => target)).toEqual(['./100%.md']);
  });

  test('takes a file only as git lists it: one on disk but ignored, or in another case, leads nowhere', () => {
    const { dir, remove } = scratchRepository({
      '.gitignore': 'ignored.md\n',
      'ignored.md': 'x',
      'Plan.md': 'x',
      'sub/a.md': 'x',
      'doc.md': '[i](ignored.md) [p](plan.md) [s](sub) [ok](Plan.md)\n',
    });
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      expect(brokenLinksInRepository(dir).map(({ target }) => target)).toEqual(['ignored.md', 'plan.md']);
    } finally {
      remove();
    }
  });

  test("this repository's Markdown has no broken relative link", () => {
    expect(brokenLinksInRepository(repositoryRoot, repositoryTextsOnce())).toEqual([]);
  });
});
