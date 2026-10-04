// A set of file changes made as one (DL-135 item 11): the portrait tool's `write-rows` and `apply`
// change the pictures, the register, the content and its version together, and the content editor's
// "Finish" the content and its version, and on any failure every file is put back as it was, and
// every file and folder they made is removed.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NotUndone } from './errors.js';

export class Transaction {
  /** Each touched file's bytes before the first change, or `null` where it did not exist. */
  readonly #before = new Map<string, Buffer | null>();
  /** Folders made, deepest last. */
  readonly #folders: string[] = [];

  #remember(file: string): void {
    const full = path.resolve(file);
    if (!this.#before.has(full)) this.#before.set(full, existsSync(full) ? readFileSync(full) : null);
  }

  #makeFolder(folder: string): void {
    const missing: string[] = [];
    for (let each = path.resolve(folder); !existsSync(each); each = path.dirname(each)) missing.unshift(each);
    for (const each of missing) {
      mkdirSync(each);
      this.#folders.push(each);
    }
  }

  /** Writes a file, remembering what it held. */
  write(file: string, data: string | Buffer): void {
    this.#remember(file);
    this.#makeFolder(path.dirname(file));
    writeFileSync(file, data);
  }

  /** Removes a file, remembering what it held. */
  remove(file: string): void {
    this.#remember(file);
    rmSync(file, { force: true });
  }

  /** The files changed so far, as paths. */
  get touched(): string[] {
    return [...this.#before.keys()];
  }

  /**
   * Puts every file back as it was, and removes every folder made that is empty again. A file that
   * cannot be put back does not stop the others (v1.1.3-S8): each is named, with its error, in what
   * this returns.
   */
  rollback(): string[] {
    const left: string[] = [];
    for (const [file, bytes] of this.#before) {
      try {
        if (bytes === null) rmSync(file, { force: true });
        else {
          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(file, bytes);
        }
      } catch (error) {
        left.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    for (const folder of [...this.#folders].reverse()) {
      try {
        if (existsSync(folder) && readdirSync(folder).length === 0) rmdirSync(folder);
      } catch (error) {
        left.push(`${folder}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.#before.clear();
    this.#folders.length = 0;
    return left;
  }
}

/** An error's problems: those it names, as `Undone` and a tool's refusals do, or its message. */
function problemsOf(error: unknown): string[] {
  const named = error instanceof Error ? (error as Error & { problems?: unknown }).problems : undefined;
  if (Array.isArray(named) && named.every((each) => typeof each === 'string')) return [...named];
  return [error instanceof Error ? error.message : String(error)];
}

/**
 * Runs `work` as one transaction: what it changes stays if it returns, and is put back if it
 * throws, the error then thrown on. Where some file cannot be put back, `NotUndone` is thrown
 * instead, with the error's problems and each file left (v1.1.3-S8).
 */
export async function transaction<T>(work: (files: Transaction) => Promise<T>): Promise<T> {
  const files = new Transaction();
  try {
    return await work(files);
  } catch (error) {
    const left = files.rollback();
    if (left.length > 0) {
      const problems = problemsOf(error);
      throw new NotUndone(problems, left);
    }
    throw error;
  }
}
