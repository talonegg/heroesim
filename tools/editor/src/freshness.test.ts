import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { freshness, traitsDocPath, writeTraitsDoc } from './traits-doc.js';
import { root, scratch, status } from './test-support.js';

// The freshness test (DL-150 item 14): docs/agents/traits-register.md's register part is what the
// register makes now. It runs on this repository in CI; a stale doc in a scratch copy proves it fails,
// and `traits doc` mends it, leaving the hand-written guardrails as they were.

describe('the freshness test', () => {
  test("finds docs/agents/traits-register.md's register part as the register makes it", () => {
    expect(freshness(root)).toEqual({ ok: true, problems: [] });
  });

  test('fails on a stale part, and `traits doc` writes it fresh, the guardrails untouched', () => {
    const dir = scratch();
    const file = traitsDocPath(dir);
    const shipped = readFileSync(file, 'utf8');
    writeFileSync(file, shipped.replace('### `injury-leaves-trait`', '### `injury-leaves`').replace('# Traits: the register', '# Traits: the register, by hand'));

    expect(freshness(dir).ok).toBe(false);
    expect(writeTraitsDoc(dir).changed).toBe(true);
    expect(freshness(dir).ok).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(shipped.replace('# Traits: the register', '# Traits: the register, by hand'));
  });

  test('fails where the markers are gone, and the doc is not there', () => {
    const dir = scratch();
    const file = traitsDocPath(dir);
    writeFileSync(file, '# Traits\n\nThe guardrails only.\n');
    expect(freshness(dir).problems).toEqual(["docs/agents/traits-register.md has no register's part between its two markers"]);
    writeTraitsDoc(dir);
    expect(freshness(dir).ok).toBe(true);

    const clean = scratch();
    expect(status(clean)).toBe('');
    expect(writeTraitsDoc(clean).changed).toBe(false);
    expect(status(clean)).toBe('');
  });
});
