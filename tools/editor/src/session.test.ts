import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NotUndone, readContentVersion, Undone } from '@heroesim/content/write';
import { describe, expect, test, vi } from 'vitest';
import { configFile, configPath, type ConfigEdit } from './config-kind.js';
import { contentFiles, type Edit } from './content-files.js';
import { Busy, endJournal, journalPath, journalState, markJournalDone, onSignals, writeAtomically } from './finish-journal.js';
import { EditSession, pendingPath, Refused, type SessionAdapter } from './session.js';
import { scratch, status } from './test-support.js';
import { traitsKind } from './traits-kind.js';
import type { TestResult, TestRunner } from './tests-run.js';

// The edit session (DL-244): its "Finish", its undoing and the resuming of one cut off, tested once
// here, at its interface, for each of its two adapters, the content files and the config file.

// The journal's marking and ending, watched as they are, so that a test can read the disk as a kill
// leaves it between a passed "Finish"'s steps.
vi.mock('./finish-journal.js', async (importOriginal) => {
  const journal = await importOriginal<typeof import('./finish-journal.js')>();
  return { ...journal, markJournalDone: vi.fn(journal.markJournalDone), endJournal: vi.fn(journal.endJournal) };
});

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
  /** An edit that applies but fails the kind's checks. */
  failing: unknown;
  /** Two edits, the second passing the kind's checks only with the first made. */
  pair: [unknown, unknown];
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

function trial<E, W>(name: string, adapter: SessionAdapter<E, W>, edits: { edit: E; failing: E; pair: [E, E] }, rest: Omit<Trial, 'name' | 'open' | 'edit' | 'failing' | 'pair'>): Trial {
  return { name, open: (dir) => new EditSession(dir, adapter) as EditSession<unknown, unknown>, ...edits, ...rest };
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
type Versioned = { version: number; changelog: string[] };

const trials: Trial[] = [
  trial<Edit, unknown>(
    'the content files',
    contentFiles(traitsKind, traitsKind),
    {
      edit: { op: 'change', list: 'guildmaster', key: 'thrifty', fields: { cost: 3 } },
      failing: { op: 'add', list: 'guildmaster', key: 'idle', row: { name: 'Idle', cost: 0, excludes: [], effects: [] } },
      pair: [
        { op: 'add', list: 'guildmaster', key: 'genial', row: { name: 'Genial', cost: 1, excludes: [], effects: [{ kind: 'guildMoraleShift', delta: 2 }] } },
        { op: 'change', list: 'guildmaster', key: 'genial', fields: { cost: 2 } },
      ],
    },
    {
      reason: '',
      written: ['content/guildmaster-traits.json', 'content/version.json'],
      changed: ['guildmaster-traits.json'],
      wrote: 'guildmaster-traits.json',
      versionName: 'content version',
      version: (dir) => readContentVersion(dir),
      logged: (dir) => readJson<Versioned>(path.join(dir, 'content', 'version.json')).changelog.at(-1),
      value: (dir) => readJson<Record<string, { cost: number }>>(path.join(dir, 'content', 'guildmaster-traits.json')).thrifty?.cost,
    },
  ),
  trial<ConfigEdit, unknown>(
    'the config file',
    configFile,
    {
      edit: { setting: 'wagePerLevel', value: 25 },
      failing: { setting: 'boardSize', value: -1 },
      pair: [
        { setting: 'rivalRosterMax', value: 12 },
        { setting: 'rivalRosterMin', value: 10 },
      ],
    },
    {
      reason: 'a trial',
      written: ['engine/src/config.json'],
      changed: ['wagePerLevel'],
      wrote: 'engine/src/config.json',
      versionName: 'config version',
      version: (dir) => readJson<Versioned>(configPath(dir)).version,
      logged: (dir) => readJson<Versioned>(configPath(dir)).changelog.at(-1),
      value: (dir) => readJson<{ sections: { guilds: { wagePerLevel: number } } }>(configPath(dir)).sections.guilds.wagePerLevel,
    },
  ),
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

  test('a "Finish" cut off at any step, after its journal or after any of its files is written, is put back by the next call', async () => {
    const dir = scratch();
    const before = bytesOf(dir, each.written);
    hold(each.open(dir), each.edit);
    // The journal and every file as "Finish" writes them, read while its tests run.
    let cut: { journal: { files: Record<string, string | null> }; files: Map<string, Buffer> } | undefined;
    await each
      .open(dir)
      .finish({
        runTests: (root) => {
          const journal = readJson<{ files: Record<string, string | null> }>(journalPath(root));
          cut = { journal, files: new Map(Object.keys(journal.files).map((file) => [file, readFileSync(file)])) };
          return failing(root, () => {});
        },
        reason: each.reason,
      })
      .catch(() => {});
    if (cut === undefined) throw new Error('the tests never ran');
    const order = Object.keys(cut.journal.files);
    expect(order.map((file) => relative(dir, file)).sort()).toEqual(each.written);

    for (let written = 0; written <= order.length; written++) {
      // The disk as a kill leaves it: the journal, whose process is gone, and the first files
      // written, in the order "Finish" writes them, the versioned file's raise last.
      writeAtomically(journalPath(dir), JSON.stringify({ ...cut.journal, pid: gonePid }));
      for (const file of order.slice(0, written)) writeFileSync(file, cut.files.get(file) ?? '');
      expect(journalState(dir)).toBe('cut-off');

      const next = each.open(dir);
      expect(next.edits()).toEqual([each.edit]);
      expect(next.recovered.map((file) => relative(dir, file)).sort()).toEqual(each.written);
      expect(bytesOf(dir, each.written)).toEqual(before);
      expect(status(dir)).toBe('');
      expect(journalState(dir)).toBe('none');
    }
  });

  test('a "Finish" cut off after its tests passed, before or after it cleared the edits it read, is completed by the next call: its files kept, the edits cleared once', async () => {
    for (const point of ['before the clearing', 'after the clearing'] as const) {
      const dir = scratch();
      hold(each.open(dir), each.edit);
      const version = each.version(dir);
      const pending = pendingPath(dir, each.open(dir).adapter.name);
      // The disk as a kill leaves it at that point: the journal, the pending edits and the files written.
      let cut: { journal: string; pending: string | null; files: Buffer[] } | undefined;
      const snapshot = (): void => {
        cut = { journal: readFileSync(journalPath(dir), 'utf8'), pending: existsSync(pending) ? readFileSync(pending, 'utf8') : null, files: bytesOf(dir, each.written) };
      };
      if (point === 'before the clearing') {
        const mark = vi.mocked(markJournalDone).getMockImplementation();
        vi.mocked(markJournalDone).mockImplementationOnce((...args) => {
          mark?.(...args);
          snapshot();
        });
      } else {
        const end = vi.mocked(endJournal).getMockImplementation();
        vi.mocked(endJournal).mockImplementationOnce((root) => {
          snapshot();
          end?.(root);
        });
      }
      expect((await each.open(dir).finish({ runTests: passing, reason: each.reason })).version).toEqual({ from: version, to: version + 1 });
      if (cut === undefined) throw new Error(`"Finish" never came ${point}`);
      writeAtomically(journalPath(dir), JSON.stringify({ ...(JSON.parse(cut.journal) as object), pid: gonePid }));
      if (cut.pending === null) rmSync(pending, { force: true });
      else writeAtomically(pending, cut.pending);
      each.written.forEach((file, index) => writeFileSync(path.join(dir, file), cut?.files[index] ?? ''));
      expect(journalState(dir), point).toBe('cut-off');
      expect(existsSync(pending), point).toBe(point === 'before the clearing');

      const next = each.open(dir);
      expect(next.edits(), point).toEqual([]);
      expect(next.recovered, point).toEqual([]);
      expect(bytesOf(dir, each.written), point).toEqual(cut.files);
      expect(each.version(dir), point).toBe(version + 1);
      expect(journalState(dir), point).toBe('none');
      // Nothing left to finish: the version is raised once.
      const again = await next.finish({ runTests: () => Promise.reject(new Error('no test run with nothing pending')), reason: each.reason });
      expect(again, point).toEqual({ ok: true, edits: 0, changed: [], version: null, tests: null });
      expect(each.version(dir), point).toBe(version + 1);
    }
  });

  test('a "Finish" whose tests passed but whose journal cannot be marked done keeps its journal, and the next call puts its files back, the edits still pending', async () => {
    const dir = scratch();
    const before = bytesOf(dir, each.written);
    hold(each.open(dir), each.edit);
    vi.mocked(markJournalDone).mockImplementationOnce(() => {
      throw new Error('the disk is full');
    });

    const failed = await each.open(dir).finish({ runTests: passing, reason: each.reason }).catch((error: unknown) => error);

    expect(failed).toEqual(new Error('the disk is full'));
    expect(journalState(dir)).toBe('cut-off');
    const next = each.open(dir);
    expect(next.edits()).toEqual([each.edit]);
    expect(next.recovered.map((file) => relative(dir, file)).sort()).toEqual(each.written);
    expect(bytesOf(dir, each.written)).toEqual(before);
    expect(() => markJournalDone(dir, { pending: pendingPath(dir, next.adapter.name), text: null })).toThrow(/is gone: "Finish" cannot mark it done/);
  });

  test('an edit the checks refuse is not held; and "Finish" checks the pending edits again, refusing them before it writes a file or runs the tests', async () => {
    const dir = scratch();
    const session = each.open(dir);
    expect(() => hold(session, each.failing)).toThrow(Refused);
    expect(session.edits()).toEqual([]);
    // Held by another hand, unchecked: an edit that applies and fails the checks.
    writeAtomically(pendingPath(dir, session.adapter.name), JSON.stringify({ kind: session.adapter.name, edits: [each.failing] }));

    const refused = await session.finish({ runTests: () => Promise.reject(new Error('no test run for edits refused')), reason: each.reason }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(Refused);
    expect((refused as Refused).problems).toEqual(session.problems());
    expect(session.problems()).not.toEqual([]);
    expect(status(dir)).toBe('');
    expect(journalState(dir)).toBe('none');
    expect(session.edits()).toEqual([each.failing]);
  });

  test('discard refuses to leave edits that fail the checks, unless told not to check', () => {
    const dir = scratch();
    const session = each.open(dir);
    const [first, second] = each.pair;
    hold(session, first);
    hold(session, second);
    const isFirst = (edit: unknown): boolean => JSON.stringify(edit) === JSON.stringify(first);

    expect(() => session.discard(isFirst)).toThrow(Refused);
    expect(session.edits()).toEqual([first, second]);
    expect(session.discard(isFirst, { check: false })).toEqual({ discarded: 1, left: 1 });
    expect(session.edits()).toEqual([second]);
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

  test('while its "Finish" runs, every call of a session of either adapter is refused as busy, a second "Finish" and recover with force among them', async () => {
    const dir = scratch();
    hold(each.open(dir), each.edit);
    const refused: unknown[] = [];
    await each.open(dir).finish({
      runTests: async (root) => {
        for (const other of trials) {
          const session = other.open(root);
          for (const call of [() => session.edits(), () => session.recover(), () => session.recover({ force: true }), () => session.problems(), () => session.discard()]) {
            try {
              call();
            } catch (error) {
              refused.push(error instanceof Busy);
            }
          }
          refused.push(await session.finish({ runTests: passing, reason: other.reason }).then(() => false, (error: unknown) => error instanceof Busy));
        }
        return passed;
      },
      reason: each.reason,
    });
    expect(refused).toEqual(new Array(12).fill(true));
    expect(status(dir)).not.toBe('');
  });
});
