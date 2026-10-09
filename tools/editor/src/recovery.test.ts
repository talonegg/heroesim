import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readContentVersion } from '@heroesim/content/write';
import { afterEach, describe, expect, test } from 'vitest';
import { journalPath, journalState, writeAtomically } from './finish-journal.js';
import { json, plantOutcome, root, scratchRepository, status } from './test-support.js';

// A "Finish" cut off, through the commands (DL-161): killed between writing the content and its
// tests' end, it leaves its journal, and the next command puts every file back from it. The edit
// session's own tests (`session.test.ts`, DL-244) hold the rest for both its adapters: a file not put
// back, and Ctrl+C or SIGTERM.

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});
function scratch(): string {
  const { dir, remove } = scratchRepository();
  scratches.push(remove);
  return dir;
}

/** A process number no process holds. */
const gonePid = 2 ** 22 + 7;

/** A journal left by the process `pid`, holding `file`'s bytes now; the file then written over. */
function plantJournal(dir: string, pid: number, file: string): void {
  writeAtomically(journalPath(dir), JSON.stringify({ pid, startedAt: '2026-10-03T00:00:00Z', contentVersion: 24, edits: 1, files: { [file]: readFileSync(file).toString('base64') } }));
  writeFileSync(file, '{}\n');
}

async function until(test: () => boolean, what: string, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error(`waited ${ms} ms for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('a "Finish" cut off', () => {
  // A process of its own, which compiles the editor as it starts: under the whole suite's load that
  // took most of the project's 60 s, so the test is given 180 s and its wait 120 s (DL-205).
  test('killed while its tests run, its files are put back by the next command, the edits still pending', { timeout: 180_000 }, async () => {
    const dir = scratch();
    await json(dir, 'traits', 'change', 'thrifty', '--cost', '3');
    plantOutcome(dir, 'hang');
    const version = readContentVersion(dir);

    // `npm run edit -- traits finish` in a process of its own, killed with every process under it.
    const child = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'tools', 'editor', 'src', 'main.ts'), 'traits', 'finish', '--root', dir, '--json'], {
      cwd: root,
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    });
    const exited = new Promise((resolve) => child.on('exit', resolve));
    await until(() => existsSync(path.join(dir, 'tests-started.txt')), 'the planted tests to start', 120_000);
    expect(status(dir).split('\n').filter((line) => line !== '').sort()).toEqual([
      ' M content/guildmaster-traits.json',
      ' M content/version.json',
    ]);
    expect(readContentVersion(dir)).toBe(version + 1);
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // taskkill fails when a process of the tree ends while it kills the rest, as one may under
        // the whole suite's load (DL-164): the "Finish" killed is what counts, and the journal says so.
      }
    } else process.kill(-(child.pid ?? 0), 'SIGKILL');
    // The "Finish" itself, should the tree's kill have missed it, so that its exit, which the test
    // waits for, comes (DL-205).
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    expect(existsSync(journalPath(dir))).toBe(true);
    expect(journalState(dir)).toBe('cut-off');

    const listed = await json<{ recovered: string[]; pending: number }>(dir, 'traits', 'list');
    expect(listed.code).toBe(0);
    expect(listed.json.recovered.map((file) => path.relative(dir, file).replace(/\\/g, '/')).sort()).toEqual([
      'content/guildmaster-traits.json',
      'content/version.json',
    ]);
    expect(listed.json.pending).toBe(1);
    expect(status(dir)).toBe('');
    expect(readContentVersion(dir)).toBe(version);
    expect(existsSync(journalPath(dir))).toBe(false);
    expect((await json(dir, 'traits', 'recover')).json).toEqual({ ok: true, recovered: [] });
  });

  test('the doctor and recover put the files back too, and say so', async () => {
    const dir = scratch();
    const file = path.join(dir, 'content', 'hero-traits.json');
    const before = readFileSync(file);
    // A journal a process long gone left, its file since written over.
    plantJournal(dir, gonePid, file);
    const report = await json<{ finish: { recovered: string[] }; recovered: string[] }>(dir, 'traits', 'doctor');
    expect(report.json.finish.recovered).toEqual([file]);
    expect(readFileSync(file)).toEqual(before);
    expect(status(dir)).toBe('');

    // And `recover` alone (v1.1.4-S14: it ran only on a clean state before).
    plantJournal(dir, gonePid, file);
    const recovered = await json(dir, 'traits', 'recover');
    expect(recovered).toEqual({ code: 0, json: { ok: true, recovered: [file] } });
    expect(readFileSync(file)).toEqual(before);
    expect(status(dir)).toBe('');
  });

  test('pending and doc put back a "Finish" cut off first, and say so (v1.1.4-S14)', async () => {
    const dir = scratch();
    const file = path.join(dir, 'content', 'hero-traits.json');
    const before = readFileSync(file);
    plantJournal(dir, gonePid, file);
    expect(await json(dir, 'traits', 'pending')).toEqual({ code: 0, json: { edits: [], recovered: [file] } });
    expect(readFileSync(file)).toEqual(before);
    plantJournal(dir, gonePid, file);
    expect((await json<{ recovered: string[] }>(dir, 'traits', 'doc')).json.recovered).toEqual([file]);
    expect(readFileSync(file)).toEqual(before);
    expect(status(dir)).toBe('');
  });

  test('a journal whose process number another process now holds reads as running: recover refuses, and recover --force puts the files back (v1.1.4-S14)', async () => {
    const dir = scratch();
    const file = path.join(dir, 'content', 'hero-traits.json');
    const before = readFileSync(file);
    // Windows gives a number again: the journal's is now this test's parent's, which runs.
    plantJournal(dir, process.ppid, file);
    expect(journalState(dir)).toBe('live');

    const refused = await json<{ kind: string; problems: string[] }>(dir, 'traits', 'recover');
    expect(refused.code).toBe(1);
    expect(refused.json.kind).toBe('busy');
    expect(refused.json.problems.join('\n')).toContain('traits recover --force');
    expect(readFileSync(file, 'utf8')).toBe('{}\n');

    // --force is recover's alone.
    expect((await json(dir, 'traits', 'pending', '--force')).json).toMatchObject({ ok: false, kind: 'usage' });

    const forced = await json(dir, 'traits', 'recover', '--force');
    expect(forced).toEqual({ code: 0, json: { ok: true, recovered: [file] } });
    expect(readFileSync(file)).toEqual(before);
    expect(journalState(dir)).toBe('none');
    expect(status(dir)).toBe('');
    // With no journal, --force puts back nothing.
    expect((await json(dir, 'traits', 'recover', '--force')).json).toEqual({ ok: true, recovered: [] });
  });
});
