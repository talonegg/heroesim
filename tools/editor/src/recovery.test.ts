import { execFileSync, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readContentVersion } from '@heroesim/portraits';
import { afterEach, describe, expect, test } from 'vitest';
import { Editor } from './editor.js';
import { journalPath, journalState, onSignals } from './finish-journal.js';
import { json, plantOutcome, root, scratchRepository, status } from './test-support.js';
import type { TestRunner } from './tests-run.js';

// A "Finish" cut off (the verification of v1.1.4-S12): killed between writing the content and its
// tests' end, it leaves its journal, and the next command puts every file back from it; Ctrl+C or
// SIGTERM puts them back at once.

const scratches: (() => void)[] = [];
afterEach(() => {
  for (const remove of scratches.splice(0)) remove();
});
function scratch(): string {
  const { dir, remove } = scratchRepository();
  scratches.push(remove);
  return dir;
}

async function until(test: () => boolean, what: string, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error(`waited ${ms} ms for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('a "Finish" cut off', () => {
  test('killed while its tests run, its files are put back by the next command, the edits still pending', async () => {
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
    await until(() => existsSync(path.join(dir, 'tests-started.txt')), 'the planted tests to start');
    expect(status(dir).split('\n').filter((line) => line !== '').sort()).toEqual([
      ' M content/guildmaster-traits.json',
      ' M content/src/content.test.ts',
      ' M content/src/parse.ts',
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
    await exited;
    expect(existsSync(journalPath(dir))).toBe(true);
    expect(journalState(dir)).toBe('cut-off');

    const listed = await json<{ recovered: string[]; pending: number }>(dir, 'traits', 'list');
    expect(listed.code).toBe(0);
    expect(listed.json.recovered.map((file) => path.relative(dir, file).replace(/\\/g, '/')).sort()).toEqual([
      'content/guildmaster-traits.json',
      'content/src/content.test.ts',
      'content/src/parse.ts',
    ]);
    expect(listed.json.pending).toBe(1);
    expect(status(dir)).toBe('');
    expect(readContentVersion(dir)).toBe(version);
    expect(existsSync(journalPath(dir))).toBe(false);
    expect((await json(dir, 'traits', 'recover')).json).toEqual({ ok: true, recovered: [] });
  });

  test('the doctor and recover put the files back too, and say so', async () => {
    const dir = scratch();
    const { writeFileSync } = await import('node:fs');
    const file = path.join(dir, 'content', 'hero-traits.json');
    const { readFileSync } = await import('node:fs');
    const before = readFileSync(file);
    // A journal a process long gone left, its file since written over.
    const { writeAtomically } = await import('./finish-journal.js');
    writeAtomically(journalPath(dir), JSON.stringify({ pid: 2 ** 22 + 7, startedAt: '2026-10-03T00:00:00Z', contentVersion: 24, edits: 1, files: { [file]: before.toString('base64') } }));
    writeFileSync(file, '{}\n');

    const report = await json<{ finish: { recovered: string[] }; recovered: string[] }>(dir, 'traits', 'doctor');
    expect(report.json.finish.recovered).toEqual([file]);
    expect(readFileSync(file)).toEqual(before);
    expect(status(dir)).toBe('');
  });

  test('Ctrl+C or SIGTERM puts back every file of a running "Finish" before the process ends', async () => {
    const dir = scratch();
    await json(dir, 'traits', 'change', 'thrifty', '--cost', '3');
    let release: (ok: boolean) => void = () => {};
    const runner: TestRunner = () => new Promise((resolve) => (release = (ok) => resolve({ ok, exitCode: ok ? 0 : 1, failures: ok ? [] : ['× held'], tail: [] })));
    const finishing = new Editor(dir).finish(runner).catch((error: unknown) => error);
    await until(() => status(dir) !== '', 'the content to be written');
    expect(journalState(dir)).toBe('live');

    const proc = Object.assign(new EventEmitter(), { exitCode: null as number | null, exit(code: number) {
      this.exitCode = code;
    } });
    const said: string[] = [];
    onSignals(proc, (text) => said.push(text));
    proc.emit('SIGINT');

    expect(proc.exitCode).toBe(130);
    expect(said).toEqual(['Stopped: "Finish" was cut off, and 3 files are put back as they were.']);
    expect(status(dir)).toBe('');
    expect(journalState(dir)).toBe('none');
    release(false);
    await finishing;
    expect(status(dir)).toBe('');
  });
});
