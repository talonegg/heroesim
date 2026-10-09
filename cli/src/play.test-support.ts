// For the CLI's tests (DL-234): command lines run in this process, as `main` runs them, against a
// scratch directory made for each test and removed after it, and the save they leave read back. The
// tests of the commands take `main` from here, so that only this file and main.test.ts import it.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deserialise, serialise, type ContentSet, type WorldDocument } from '@heroesim/engine';
import { afterEach, beforeEach } from 'vitest';
import type { CliIo } from './context.js';
import { main } from './main.js';

export { exitCodes } from './context.js';

/** One command line's exit code and what it wrote to each stream. */
export interface Run {
  code: number;
  out: string;
  err: string;
}

/** The clock the CLI's tests give `new`, unless one says otherwise. */
export const testClock = new Date('2026-09-26T09:30:00.000Z');

/** Runs `argv` in `dir`, with no environment, the test clock and draws of 0, unless `io` says otherwise. */
export function playIn(dir: string, argv: readonly string[], io: Partial<Pick<CliIo, 'env' | 'now' | 'random'>> = {}): Run {
  let out = '';
  let err = '';
  const code = main(argv, {
    stdout: (text) => (out += text),
    stderr: (text) => (err += text),
    cwd: dir,
    env: io.env ?? {},
    now: io.now ?? (() => testClock),
    random: io.random ?? (() => 0),
  });
  return { code, out, err };
}

/** A test file's scratch directory, made before each test and removed after it, and its save. */
export interface Playground {
  /** The running test's directory. */
  dir(): string;
  /** Runs a command line in it. */
  play(argv: readonly string[], io?: Partial<Pick<CliIo, 'env' | 'now' | 'random'>>): Run;
  /** The save `current`'s path in it. */
  current(): string;
  /** The text of the save at `path`, `current` unless given. */
  saved(path?: string): string;
  /** The save at `path`, loaded and validated as the CLI loads it. */
  document(path?: string): WorldDocument;
  /** Rewrites the save at `path` after `change`, bypassing the CLI, as a hand edit would. */
  edit(change: (document: WorldDocument) => void, path?: string): void;
}

/** A scratch directory named from `prefix` for each test of the file that calls this, its saves read with `content`. */
export function playground(prefix: string, content: ContentSet): Playground {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), prefix));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const current = (): string => join(dir, '.saves', 'current.json');
  const saved = (path = current()): string => readFileSync(path, 'utf8');
  const document = (path = current()): WorldDocument => {
    const loaded = deserialise(saved(path), { content });
    if (!loaded.ok) throw new Error(loaded.reason.message);
    return loaded.document;
  };
  return {
    dir: () => dir,
    play: (argv, io) => playIn(dir, argv, io),
    current,
    saved,
    document,
    edit: (change, path = current()) => {
      const edited = document(path);
      change(edited);
      writeFileSync(path, serialise(edited));
    },
  };
}
