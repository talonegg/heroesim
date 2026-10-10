// For the tool's tests: a scratch copy of the parts of this repository the tool reads and writes,
// made a git repository of its own, so a test can change it and read `git status` after.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { formatJson } from '@heroesim/content/write';
import { afterEach, inject } from 'vitest';
import { repositoryRoot, run } from './cli.js';
import { git } from './template.test-support.js';

export { git };

/** The repository the tests read: this one. */
export const root = repositoryRoot;

/** `git status --porcelain` of a scratch repository, untracked files named one by one. */
export function status(dir: string): string {
  return git(dir, 'status', '--porcelain', '--untracked-files=all');
}

/**
 * A scratch copy of this repository's `content/` (its JSON, the content version's `version.json`
 * among it), `media/` and the inbox, committed: a copy of the run's template, `.git` and all
 * (`template.test-support.ts`); removed by the function it returns with.
 */
export function scratchRepository(): { dir: string; remove: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-portraits-'));
  cpSync(inject('portraitTemplate'), dir, { recursive: true, preserveTimestamps: true });
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});

/** Runs `remove` after the test. */
export function removeAfterTest(remove: () => void): void {
  scratches.push(remove);
}

/** A scratch copy, removed after the test. */
export function scratch(): string {
  const { dir, remove } = scratchRepository();
  removeAfterTest(remove);
  return dir;
}

/** A command line's exit code and its JSON. */
export async function cli<T = Record<string, unknown>>(...argv: string[]): Promise<{ code: number; json: T }> {
  let out = '';
  const code = await run([...argv, '--json'], { out: (text) => (out += text), err: () => undefined });
  return { code, json: JSON.parse(out) as T };
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

/** A PNG of random colour, which no quality of WebP can make small: CRC and deflate from Node. */
export function noisePng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  let seed = 1;
  for (let index = 0; index < rows.length; index += 1) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    rows[index] = index % (width * 3 + 1) === 0 ? 0 : seed >>> 24;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
