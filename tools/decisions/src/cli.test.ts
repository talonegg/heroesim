import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { run } from './cli.js';
import { indexPath } from './log.js';
import { baselinePath } from './stories.js';
import { entry, scratchRepository, smallLog } from './test-support.js';

// A story's id, built so that this file cites none.
const story = `v1.1.4-${'S'}2`;

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

  test('`check` passes at the baseline, and fails when fewer lines cite a story, asking it lowered: a ratchet', () => {
    const { dir, remove } = scratchRepository({
      ...smallLog,
      // The index's header cites the entry that made it.
      'docs/decisions/archive/DL-215-215-tool.md': entry('DL-215', 'The index'),
      [baselinePath]: '{ "lines": 1, "why": "a test" }',
      'engine/src/x.ts': `// The rule (${story}, DL-01).\n`,
    });
    scratches.push(remove);
    execFileSync('git', ['init', '-q'], { cwd: dir });
    expect(run(['index'], io().io, dir)).toBe(0);
    const level = io();
    expect(run(['check'], level.io, dir)).toBe(0);
    expect(level.err).toEqual([]);
    writeFileSync(path.join(dir, baselinePath), '{ "lines": 3, "why": "a test" }');
    const under = io();
    expect(run(['check'], under.io, dir)).toBe(1);
    expect(under.err).toEqual([`1 source lines cite a story, under the baseline of 3 (${baselinePath}): lower it to 1`]);
  });
});
