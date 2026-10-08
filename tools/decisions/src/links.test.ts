import { describe, expect, test } from 'vitest';
import { repositoryRoot } from './cli.js';
import { brokenLinksIn, brokenLinksInRepository } from './links.js';

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

  test("this repository's Markdown has no broken relative link", () => {
    expect(brokenLinksInRepository(repositoryRoot)).toEqual([]);
  });
});
