import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { run } from './cli.js';
import { indexPath } from './log.js';
import { scratchRepository, smallLog } from './test-support.js';

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (text: string) => out.push(text), err: (text: string) => err.push(text) } };
}

describe('npm run decisions', () => {
  test('prints its usage on help and nothing; refuses an unknown command with 2', () => {
    const help = io();
    expect(run([], help.io)).toBe(0);
    expect(help.out.join('\n')).toContain('Usage: npm run decisions -- <command>');
    const wrong = io();
    expect(run(['indx'], wrong.io)).toBe(2);
    expect(wrong.err.join('\n')).toContain('Usage');
  });

  test('`index` writes the index, then finds it current', () => {
    const { dir, remove } = scratchRepository(smallLog);
    scratches.push(remove);
    const first = io();
    expect(run(['index'], first.io, dir)).toBe(0);
    expect(first.out).toEqual([`Wrote ${indexPath}.`]);
    expect(existsSync(path.join(dir, indexPath))).toBe(true);
    const again = io();
    expect(run(['index'], again.io, dir)).toBe(0);
    expect(again.out).toEqual([`${indexPath} is current.`]);
  });
});
