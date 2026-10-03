// For the editor's tests: a scratch copy of the parts of this repository the editor reads and writes,
// made a git repository of its own, so a test can change it and read `git status` after. Its `npm
// test` is a planted script, passing or failing as the test says, so that "Finish" runs a real
// command line without running this suite inside itself.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ContentFileName } from '@heroesim/content';
import { formatJson } from '@heroesim/portraits';
import { afterAll } from 'vitest';
import { run, type Deps } from './cli.js';
import { repositoryRoot } from './content-files.js';
import { isBoundaryProbe } from './reads.js';

export const root = repositoryRoot;

/**
 * Runs git in a scratch repository, and gives its output. Never its automatic maintenance: on Linux a
 * commit leaves `git maintenance run --auto --detach` behind it, holding `.git/objects/maintenance.lock`
 * a moment after the commit ends, and a copy of the template taken in that moment fails with ENOENT
 * on the lock it saw go (DL-167). Git for Windows runs it before the commit ends.
 */
export function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'maintenance.auto=false', '-c', 'core.autocrlf=false', '-c', 'user.name=editor test', '-c', 'user.email=test@example.invalid', ...args], { cwd: dir, encoding: 'utf8' });
}

/** `git status --porcelain` of a scratch repository, untracked files named one by one. */
export function status(dir: string): string {
  return git(dir, 'status', '--porcelain', '--untracked-files=all');
}

/**
 * The planted `npm test`: it prints a Vitest-like line and passes, or fails, as `test-outcome.txt`
 * says; or, for "hang", writes `tests-started.txt` and fails only 20 s later, so that a test may kill
 * the "Finish" waiting on it.
 */
const plantedTest = `import { readFileSync, writeFileSync } from 'node:fs';
const outcome = readFileSync('test-outcome.txt', 'utf8').trim();
console.log(' RUN  the planted tests');
if (outcome === 'hang') {
  writeFileSync('tests-started.txt', String(process.pid));
  await new Promise((resolve) => setTimeout(resolve, 20000));
  process.exit(1);
}
if (outcome === 'fail') {
  console.log(' FAIL  |content| src/planted.test.ts > a planted test fails');
  console.log('   × a planted test fails');
  process.exit(1);
}
console.log(' ✓ src/planted.test.ts (1 test)');
`;

/**
 * The scratch copies' first state, made once for each test file that asks for one: its content, its
 * doc and its planted `npm test`, committed. Each copy is a copy of its folder, `.git` and all, so that
 * a test spawns no git to make one: three git commands for each test took most of the editor's tests'
 * time, and more under the whole suite's load (DL-164). Removed after the file's tests.
 */
let template: string | undefined;
afterAll(() => {
  if (template !== undefined) rmSync(template, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  template = undefined;
});

function templateRepository(): string {
  if (template !== undefined) return template;
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-editor-template-'));
  cpSync(path.join(root, 'content'), path.join(dir, 'content'), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(path.join(root, 'content'), source).replace(/\\/g, '/');
      return relative === '' || relative.endsWith('.json') || ['src', 'src/parse.ts', 'src/content.test.ts', 'src/validate.ts'].includes(relative);
    },
  });
  cpSync(path.join(root, 'docs', 'agents', 'traits.md'), path.join(dir, 'docs', 'agents', 'traits.md'));
  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'scratch', private: true, scripts: { test: 'node planted-test.mjs' } }, null, 2)}\n`);
  writeFileSync(path.join(dir, 'planted-test.mjs'), plantedTest);
  writeFileSync(path.join(dir, 'test-outcome.txt'), 'pass\n');
  writeFileSync(path.join(dir, '.gitignore'), '.editor/\ntests-started.txt\nengine/\n');
  // No template: git's sample hooks are files each copy would copy for nothing.
  git(dir, 'init', '--quiet', '--template=');
  git(dir, 'add', '--all');
  git(dir, 'commit', '--quiet', '-m', 'scratch');
  template = dir;
  return dir;
}

/**
 * A scratch copy of this repository's content (its JSON, and the source that holds the content
 * version and its checks) and `docs/agents/traits.md`, committed, with a planted `npm test` that
 * passes; removed by the function it returns with. With `engine`, `engine/src/` too, which only the
 * drift check reads (the doctor's, `drift.ts`): copied beside the commit and ignored by git, since
 * the editor never writes it, as copying and committing its files for every test took most of the
 * editor's tests' time (DL-164).
 */
export function scratchRepository(options: { engine?: boolean } = {}): { dir: string; remove: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-editor-'));
  cpSync(templateRepository(), dir, { recursive: true, preserveTimestamps: true });
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

/** One command line's run: its exit code, and what it wrote, each stream joined. */
export async function command(argv: readonly string[], deps?: Deps): Promise<{ code: number; out: string; err: string }> {
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
 * filter (v1.1.4-S1, S2): `ambush-on-the-road` one Check scored by the strongest Warrior, and
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
