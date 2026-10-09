import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NotUndone, readContentVersion, Undone } from '@heroesim/content/write';
import { describe, expect, test } from 'vitest';
import { configFile, configPath, type ConfigEdit } from './config-kind.js';
import { contentFiles, type Edit } from './content-files.js';
import { Busy, journalPath, journalState, onSignals, writeAtomically } from './finish-journal.js';
import { EditSession, type SessionAdapter } from './session.js';
import { scratch, status } from './test-support.js';
import { traitsKind } from './traits-kind.js';
import type { TestResult, TestRunner } from './tests-run.js';

// The edit session (DL-244): its "Finish", its undoing and the resuming of one cut off, tested once
// here, at its interface, for each of its two adapters, the content files and the config file.

/** A process number no process holds. */
const gonePid = 2 ** 22 + 7;

const passed: TestResult = { ok: true, exitCode: 0, failures: [], tail: [] };
const failed: TestResult = { ok: false, exitCode: 1, failures: ['× planted'], tail: [] };
const passing: TestRunner = () => Promise.resolve(passed);
const failing: TestRunner = () => Promise.resolve(failed);

/** A path under a scratch copy, as `git status` names it. */
const relative = (dir: string, file: string): string => path.relative(dir, file).replace(/\\/g, '/');

/** Each adapter, with one edit of it, the files its "Finish" writes, and its version as the files hold it. */
interface Trial {
  name: string;
  open(dir: string): EditSession<unknown, unknown>;
  edit: unknown;
  reason: string;
  /** The files "Finish" writes, as `git status` names them. */
  written: string[];
  /** What the result's `changed` names. */
  changed: string[];
  /** The run's first line, before the version's change. */
  wrote: string;
  versionName: string;
  version(dir: string): number;
  /** The changelog's last line. */
  logged(dir: string): string | undefined;
  /** The value the edit sets, as the files hold it. */
  value(dir: string): unknown;
}

function trial<E, W>(name: string, adapter: SessionAdapter<E, W>, edit: E, rest: Omit<Trial, 'name' | 'open' | 'edit'>): Trial {
  return { name, open: (dir) => new EditSession(dir, adapter) as EditSession<unknown, unknown>, edit, ...rest };
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
type Versioned = { version: number; changelog: string[] };

const trials: Trial[] = [
  trial<Edit, unknown>('the content files', contentFiles(traitsKind, traitsKind), { op: 'change', list: 'guildmaster', key: 'thrifty', fields: { cost: 3 } }, {
    reason: '',
    written: ['content/guildmaster-traits.json', 'content/version.json'],
    changed: ['guildmaster-traits.json'],
    wrote: 'guildmaster-traits.json',
    versionName: 'content version',
    version: (dir) => readContentVersion(dir),
    logged: (dir) => readJson<Versioned>(path.join(dir, 'content', 'version.json')).changelog.at(-1),
    value: (dir) => readJson<Record<string, { cost: number }>>(path.join(dir, 'content', 'guildmaster-traits.json')).thrifty?.cost,
  }),
  trial<ConfigEdit, unknown>('the config file', configFile, { setting: 'wagePerLevel', value: 25 }, {
    reason: 'a trial',
    written: ['engine/src/config.json'],
    changed: ['wagePerLevel'],
    wrote: 'engine/src/config.json',
    versionName: 'config version',
    version: (dir) => readJson<Versioned>(configPath(dir)).version,
    logged: (dir) => readJson<Versioned>(configPath(dir)).changelog.at(-1),
    value: (dir) => readJson<{ sections: { guilds: { wagePerLevel: number } } }>(configPath(dir)).sections.guilds.wagePerLevel,
  }),
];

/** The edit held as pending, through the session. */
function hold(session: EditSession<unknown, unknown>, edit: unknown): void {
  const edits = session.edits();
  session.hold([...edits, edit], edits.length);
}

/** Each written file's bytes. */
function bytesOf(dir: string, files: readonly string[]): Buffer[] {
  return files.map((file) => readFileSync(path.join(dir, file)));
}

async function until(test: () => boolean, what: string, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error(`waited ${ms} ms for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe.each(trials)('the edit session over $name', (each) => {
  test('"Finish" writes the pending edits, raises the version once with a line saying why, runs the tests on them and clears the edits; with none pending it finishes nothing', async () => {
    const dir = scratch();
    const session = each.open(dir);
    const version = each.version(dir);
    hold(session, each.edit);
    expect(status(dir)).toBe('');

    const lines: string[] = [];
    let seen: { version: number; value: unknown; lock: string } | undefined;
    const finished = await session.finish({
      runTests: (root) => {
        seen = { version: each.version(root), value: each.value(root), lock: journalState(root) };
        return passing(root, () => {});
      },
      onLine: (line) => lines.push(line),
      reason: each.reason,
    });

    expect(finished).toEqual({ ok: true, edits: 1, changed: each.changed, version: { from: version, to: version + 1 }, tests: passed });
    expect(seen).toEqual({ version: version + 1, value: each.value(dir), lock: 'live' });
    expect(lines).toEqual([`Wrote ${each.wrote}; ${each.versionName} ${version} → ${version + 1}. Running the tests…`]);
    expect(each.version(dir)).toBe(version + 1);
    expect(each.logged(dir)).toMatch(new RegExp(`^${version + 1} from .+\\.$`));
    expect(status(dir).split('\n').filter((line) => line !== '').sort()).toEqual(each.written.map((file) => ` M ${file}`));
    expect(session.edits()).toEqual([]);
    expect(journalState(dir)).toBe('none');

    const again = await session.finish({ runTests: () => Promise.reject(new Error('no test run with nothing pending')), reason: each.reason });
    expect(again).toEqual({ ok: true, edits: 0, changed: [], version: null, tests: null });
  });

  test('a test that fails undoes "Finish": every file put back byte for byte, the edits still pending, the lock let go', async () => {
    const dir = scratch();
    const session = each.open(dir);
    const before = bytesOf(dir, each.written);
    hold(session, each.edit);

    const undone = await session.finish({ runTests: failing, reason: each.reason }).catch((error: unknown) => error);

    expect(undone).toBeInstanceOf(Undone);
    expect((undone as Undone).problems).toEqual(['× planted']);
    expect(bytesOf(dir, each.written)).toEqual(before);
    expect(status(dir)).toBe('');
    expect(session.edits()).toEqual([each.edit]);
    expect(journalState(dir)).toBe('none');
  });

  test('a "Finish" cut off is put back by the next call, which says so, the edits still pending, and then finishes', async () => {
    const dir = scratch();
    const before = bytesOf(dir, each.written);
    hold(each.open(dir), each.edit);
    // The disk as a "Finish" leaves it when its process is killed while its tests run: the files
    // written, and its journal, whose process is gone.
    let cut: { journal: string; files: Buffer[] } | undefined;
    await each
      .open(dir)
      .finish({
        runTests: (root) => {
          cut = { journal: readFileSync(journalPath(root), 'utf8'), files: bytesOf(root, each.written) };
          return failing(root, () => {});
        },
        reason: each.reason,
      })
      .catch(() => {});
    if (cut === undefined) throw new Error('the tests never ran');
    writeAtomically(journalPath(dir), JSON.stringify({ ...(JSON.parse(cut.journal) as object), pid: gonePid }));
    each.written.forEach((file, index) => writeFileSync(path.join(dir, file), cut?.files[index] ?? ''));
    expect(journalState(dir)).toBe('cut-off');
    expect(status(dir)).not.toBe('');

    const next = each.open(dir);
    expect(next.edits()).toEqual([each.edit]);
    expect(next.recovered.map((file) => relative(dir, file)).sort()).toEqual(each.written);
    expect(bytesOf(dir, each.written)).toEqual(before);
    expect(status(dir)).toBe('');
    expect(journalState(dir)).toBe('none');
    expect(each.open(dir).recover()).toEqual([]);

    const version = each.version(dir);
    expect((await next.finish({ runTests: passing, reason: each.reason })).version).toEqual({ from: version, to: version + 1 });
  });

  test('a journal whose process number another process now holds reads as running: every call is refused as busy, and recover with force puts the files back', () => {
    const dir = scratch();
    const file = path.join(dir, each.written[0] ?? '');
    const before = readFileSync(file);
    // Windows gives a number again: the journal's is now this test's parent's, which runs.
    writeAtomically(journalPath(dir), JSON.stringify({ pid: process.ppid, startedAt: '2026-10-10T00:00:00Z', contentVersion: 37, edits: 1, files: { [file]: before.toString('base64') } }));
    writeFileSync(file, '{}\n');
    const session = each.open(dir);

    expect(() => session.edits()).toThrow(Busy);
    expect(() => session.recover()).toThrow(Busy);
    expect(readFileSync(file, 'utf8')).toBe('{}\n');
    expect(session.recover({ force: true })).toEqual([file]);
    expect(readFileSync(file)).toEqual(before);
    expect(journalState(dir)).toBe('none');
    expect(each.open(dir).recover({ force: true })).toEqual([]);
  });

  test('a "Finish" whose files cannot all be put back keeps its journal, and the next call puts them back', async () => {
    const dir = scratch();
    hold(each.open(dir), each.edit);
    const file = path.join(dir, each.written[0] ?? '');
    // The tests fail, and leave a folder where a file was written: it cannot be put back.
    const runner: TestRunner = () => {
      rmSync(file);
      mkdirSync(file);
      return Promise.resolve(failed);
    };
    const notUndone = await each.open(dir).finish({ runTests: runner, reason: each.reason }).catch((error: unknown) => error);
    expect(notUndone).toBeInstanceOf(NotUndone);
    expect(existsSync(journalPath(dir))).toBe(true);
    // Its process no longer finishes: the next call takes it as cut off.
    expect(journalState(dir)).toBe('cut-off');

    rmSync(file, { recursive: true });
    const next = each.open(dir);
    expect(next.edits()).toHaveLength(1);
    expect(next.recovered.map((each) => relative(dir, each)).sort()).toEqual(each.written);
    expect(status(dir)).toBe('');
    expect(existsSync(journalPath(dir))).toBe(false);
  });

  test('Ctrl+C or SIGTERM puts back every file of a running "Finish" before the process ends', async () => {
    const dir = scratch();
    hold(each.open(dir), each.edit);
    let release: (ok: boolean) => void = () => {};
    const runner: TestRunner = () => new Promise((resolve) => (release = (ok) => resolve(ok ? passed : failed)));
    const finishing = each.open(dir).finish({ runTests: runner, reason: each.reason }).catch((error: unknown) => error);
    await until(() => status(dir) !== '', 'the files to be written');
    expect(journalState(dir)).toBe('live');

    const proc = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      exit(code: number) {
        this.exitCode = code;
      },
    });
    const said: string[] = [];
    onSignals(proc, (text) => said.push(text));
    proc.emit('SIGINT');

    expect(proc.exitCode).toBe(130);
    expect(said).toEqual([`Stopped: "Finish" was cut off, and ${each.written.length} files are put back as they were.`]);
    expect(status(dir)).toBe('');
    expect(journalState(dir)).toBe('none');
    release(false);
    await finishing;
    expect(status(dir)).toBe('');
  });

  test('while its "Finish" runs, every call of a session of either adapter is refused as busy', async () => {
    const dir = scratch();
    hold(each.open(dir), each.edit);
    const refused: unknown[] = [];
    await each.open(dir).finish({
      runTests: (root) => {
        for (const other of trials) {
          const session = other.open(root);
          for (const call of [() => session.edits(), () => session.recover(), () => session.problems(), () => session.discard()]) {
            try {
              call();
            } catch (error) {
              refused.push(error instanceof Busy);
            }
          }
        }
        return passing(root, () => {});
      },
      reason: each.reason,
    });
    expect(refused).toEqual(new Array(8).fill(true));
  });
});
