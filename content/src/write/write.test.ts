import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { NotUndone } from './errors.js';
import { formatJson } from './json-format.js';
import { Transaction, transaction } from './transaction.js';

// The files the tools write (v1.1.3-S2, moved from the portrait tool by v1.1.6-S4): JSON written as the
// content keeps it, and every change of a command undone together.

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function scratch(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-write-'));
  made.push(dir);
  return dir;
}

describe('formatJson()', () => {
  test('writes content/portraits.json as v1.1.2 wrote it by hand, one role to a line', () => {
    const text = [
      '{',
      '  "guildmaster": { "female": ["gm-female-01"], "male": ["gm-male-01"] },',
      '  "hero": { "female": [], "male": [] },',
      '  "patron": { "female": [], "male": [] }',
      '}',
      '',
    ].join('\n');
    expect(formatJson(JSON.parse(text))).toBe(text);
  });

  test('keeps a short value on one line and opens a long one out, two spaces deep', () => {
    expect(formatJson({ a: [1, 2], b: { c: 'd' }, e: [] })).toBe('{ "a": [1, 2], "b": { "c": "d" }, "e": [] }\n');
    const long = { narrative: 'x'.repeat(90), list: ['y'.repeat(60), 'z'.repeat(60)] };
    expect(formatJson(long)).toBe(`{\n  "narrative": "${'x'.repeat(90)}",\n  "list": [\n    "${'y'.repeat(60)}",\n    "${'z'.repeat(60)}"\n  ]\n}\n`);
  });
});

describe('a transaction', () => {
  test('keeps what it changed when it succeeds', async () => {
    const dir = scratch();
    await transaction(async (files) => {
      files.write(path.join(dir, 'new', 'a.txt'), 'a');
    });
    expect(readFileSync(path.join(dir, 'new', 'a.txt'), 'utf8')).toBe('a');
  });

  test('puts back every file it wrote or removed, and removes every file and folder it made, when it fails', async () => {
    const dir = scratch();
    writeFileSync(path.join(dir, 'kept.txt'), 'before');
    writeFileSync(path.join(dir, 'removed.txt'), 'there');
    await expect(
      transaction(async (files) => {
        files.write(path.join(dir, 'kept.txt'), 'after');
        files.write(path.join(dir, 'kept.txt'), 'after again');
        files.remove(path.join(dir, 'removed.txt'));
        files.write(path.join(dir, 'deep', 'er', 'made.txt'), 'new');
        throw new Error('a check failed');
      }),
    ).rejects.toThrow('a check failed');
    expect(readFileSync(path.join(dir, 'kept.txt'), 'utf8')).toBe('before');
    expect(readFileSync(path.join(dir, 'removed.txt'), 'utf8')).toBe('there');
    expect(existsSync(path.join(dir, 'deep'))).toBe(false);
  });

  test('puts back every file it can when one cannot be put back, and names that one with the first failure (v1.1.3-S8)', async () => {
    const dir = scratch();
    const [a, b] = [path.join(dir, 'a.txt'), path.join(dir, 'b.txt')];
    writeFileSync(a, 'A0');
    writeFileSync(b, 'B0');
    const failed = transaction(async (files) => {
      files.write(a, 'A1');
      files.write(b, 'B1');
      // A folder where a.txt was: it cannot be written back.
      rmSync(a);
      mkdirSync(a);
      throw new Error('a check failed');
    });
    await expect(failed).rejects.toBeInstanceOf(NotUndone);
    await expect(failed).rejects.toThrow(/a check failed/);
    await expect(failed).rejects.toThrow(/a\.txt/);
    expect(readFileSync(b, 'utf8')).toBe('B0');
  });

  // v1.1.6-S4: an error that names its problems, a tool's own refusal included, gives them, not its message.
  test("names a failure's problems where it names them, when a file cannot be put back", async () => {
    const dir = scratch();
    const a = path.join(dir, 'a.txt');
    writeFileSync(a, 'A0');
    const refusal = Object.assign(new Error('refused'), { problems: ['the first problem', 'the second'] });
    const failed = transaction(async (files) => {
      files.write(a, 'A1');
      rmSync(a);
      mkdirSync(a);
      throw refusal;
    });
    await expect(failed).rejects.toBeInstanceOf(NotUndone);
    await expect(failed).rejects.toMatchObject({ problems: ['the first problem', 'the second'] });
  });

  test('names the files it touched', () => {
    const dir = scratch();
    const files = new Transaction();
    files.write(path.join(dir, 'a.txt'), 'a');
    expect(files.touched).toEqual([path.resolve(dir, 'a.txt')]);
    files.rollback();
    expect(existsSync(path.join(dir, 'a.txt'))).toBe(false);
  });
});
