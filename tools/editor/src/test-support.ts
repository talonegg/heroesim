// For the editor's tests: a scratch copy of the parts of this repository the editor reads and writes,
// made a git repository of its own, so a test can change it and read `git status` after. Its `npm
// test` is a planted script, passing or failing as the test says, so that "Finish" runs a real
// command line without running this suite inside itself; most tests read the same script in this
// process, `plantedTests`, and a few run it through npm (DL-234).

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ContentFileName } from '@heroesim/content';
import { formatJson } from '@heroesim/content/write';
import { afterEach, inject } from 'vitest';
import { run, type Deps } from './cli.js';
import { repositoryRoot } from './content-files.js';
import { isBoundaryProbe } from './reads.js';
import { git } from './template.test-support.js';
import { failuresIn, type TestRunner } from './tests-run.js';

export { git };

export const root = repositoryRoot;

/** `git status --porcelain` of a scratch repository, untracked files named one by one. */
export function status(dir: string): string {
  return git(dir, 'status', '--porcelain', '--untracked-files=all');
}

/**
 * A scratch copy of this repository's content (its JSON, `version.json` among it, and the source of
 * its checks, which the drift check reads) and `docs/agents/traits-register.md`, committed, with a
 * planted `npm test` that passes: a copy of the run's template, `.git` and all
 * (`template.test-support.ts`); removed by the function it returns with. Its `engine/src/config.json`
 * is committed, which the config kind writes (DL-204). With `engine`, the rest of `engine/src/` too, which only the
 * drift check reads (the doctor's, `drift.ts`): copied beside the commit and ignored by git, since
 * the editor never writes it, as copying and committing its files for every test took most of the
 * editor's tests' time (DL-164).
 */
export function scratchRepository(options: { engine?: boolean } = {}): { dir: string; remove: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-editor-'));
  cpSync(inject('editorTemplate'), dir, { recursive: true, preserveTimestamps: true });
  if (options.engine === true) {
    // engine/src/boundary.test.ts writes and deletes probe files in engine/src/ while other tests run.
    cpSync(path.join(root, 'engine', 'src'), path.join(dir, 'engine', 'src'), {
      recursive: true,
      filter: (source) => !isBoundaryProbe(path.relative(root, source).replace(/\\/g, '/')),
    });
  }
  // Windows may hold a file of it a moment after a child process or the server lets it go.
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});

/** A scratch copy, removed after the test; with `engine`, its engine/src/ too, for a test that runs the doctor. */
export function scratch(options: { engine?: boolean } = {}): string {
  const { dir, remove } = scratchRepository(options);
  scratches.push(remove);
  return dir;
}

/** A Trait as the commands give it in JSON. */
export type Row = { key: string; list: string; row: Record<string, unknown>; uses: { at: string; blocksRemoval: boolean }[]; rules: { id: string }[]; pending: string | null };
/** A command's refusal in JSON. */
export type Failure = { ok: false; kind: string; problems: string[]; uses?: { at: string; entry: string }[] };

/** Sets whether the scratch copy's planted `npm test` passes, committed so `git status` stays clean. */
export function plantOutcome(dir: string, outcome: 'pass' | 'fail' | 'hang'): void {
  writeFileSync(path.join(dir, 'test-outcome.txt'), `${outcome}\n`);
  git(dir, 'commit', '--quiet', '--allow-empty', '-am', `the planted tests ${outcome}`);
}

/** Reads a content file of a scratch repository as JSON. */
export function readContentJson<T = Record<string, unknown>>(dir: string, file: ContentFileName): T {
  return JSON.parse(readFileSync(path.join(dir, 'content', file), 'utf8')) as T;
}

/** Writes a content file of a scratch repository, as the portrait tool lays out a new one. */
export function writeContentJson(dir: string, file: ContentFileName, value: unknown): void {
  writeFileSync(path.join(dir, 'content', file), formatJson(value));
}

/**
 * The planted `npm test` read in this process: the lines it prints, and how it ends, as
 * `test-outcome.txt` says, read through the runner's own `failuresIn`. "Finish"'s tests run it in
 * place of the process, but for the two of `cli.test.ts` that run the planted script through `npm`
 * end to end, and the cut-off "Finish" of `recovery.test.ts` (DL-234).
 */
export const plantedTests: TestRunner = async (dir, onLine) => {
  const outcome = readFileSync(path.join(dir, 'test-outcome.txt'), 'utf8').trim();
  const lines = [' RUN  the planted tests'];
  const said = (line: string): void => {
    lines.push(line);
    onLine(line);
  };
  onLine(lines[0] ?? '');
  if (outcome === 'fail') {
    said(' FAIL  |content| src/planted.test.ts > a planted test fails');
    said('   × a planted test fails');
    return { ok: false, exitCode: 1, failures: failuresIn(lines), tail: lines.slice(-30) };
  }
  if (outcome !== 'pass') throw new Error(`the planted tests ${outcome} only through npm`);
  said(' ✓ src/planted.test.ts (1 test)');
  return { ok: true, exitCode: 0, failures: [], tail: lines.slice(-30) };
};

/** One command line's run: its exit code, and what it wrote, each stream joined. "Finish" runs the planted tests in this process unless `deps` says otherwise. */
export async function command(argv: readonly string[], deps: Deps = { runTests: plantedTests }): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (text) => out.push(text), err: (text) => err.push(text) }, deps);
  return { code, out: out.join('\n'), err: err.join('\n') };
}

/** One command line's run with `--json` on the scratch copy `dir`, its output read. */
export async function json<T = Record<string, unknown>>(dir: string, ...argv: string[]): Promise<{ code: number; json: T }> {
  const result = await command([...argv, '--root', dir, '--json']);
  return { code: result.code, json: JSON.parse(result.out) as T };
}

/**
 * Puts an Encounter and a Synergy of the scratch copy in the new form, whose Queries a `has-trait` may
 * filter (DL-151, DL-152): `ambush-on-the-road` one Check scored by the strongest Warrior, and
 * `shield-wall` requiring three Warriors; committed.
 */
export function plantQueries(dir: string): void {
  const encounters = readContentJson<Record<string, Record<string, unknown>>>(dir, 'encounters.json');
  const ambush = encounters['ambush-on-the-road'] ?? {};
  encounters['ambush-on-the-road'] = {
    name: ambush.name,
    kind: ambush.kind,
    checks: [{ key: 'front', name: 'The front', score: ['max', ['where', 'party', ['class', 'warrior']], ['stat', 'strength']], skills: [], difficultyFactor: 0.2 }],
    consequences: ambush.consequences,
  };
  writeContentJson(dir, 'encounters.json', encounters);
  const synergies = readContentJson<Record<string, Record<string, unknown>>>(dir, 'synergies.json');
  (synergies['shield-wall'] ?? {}).requires = [['>=', ['count', ['where', 'party', ['class', 'warrior']]], 3]];
  writeContentJson(dir, 'synergies.json', synergies);
  git(dir, 'commit', '--quiet', '-am', 'queries');
}
