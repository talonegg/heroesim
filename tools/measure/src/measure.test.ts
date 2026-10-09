import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { ciTables, secondsBetween, type CiRun } from './ci.js';
import { run } from './cli.js';
import { byPackage, coverageTables, packageOf, type CoverageSummary } from './coverage.js';
import { fileOf, profileTables, type CpuProfile } from './profile.js';
import { projectOf, relative, suiteTables, type VitestReport } from './suite.js';

const report: VitestReport = {
  startTime: 1_000,
  numTotalTests: 4,
  numFailedTests: 1,
  success: false,
  testResults: [
    {
      name: 'C:\\repo\\heroesim\\engine\\src\\rng.test.ts',
      startTime: 1_100,
      endTime: 3_100,
      status: 'passed',
      assertionResults: [
        { fullName: 'rng draws', title: 'draws', duration: 1_500, status: 'passed' },
        { title: 'repeats', duration: 50, status: 'passed' },
      ],
    },
    {
      name: '/home/ci/heroesim/tools/editor/src/cli.test.ts',
      startTime: 1_200,
      endTime: 41_200,
      status: 'failed',
      assertionResults: [
        { fullName: 'finish | puts back', title: 'puts back', duration: 40_000, status: 'failed' },
        { title: 'lists', duration: null, status: 'skipped' },
      ],
    },
  ],
};

describe('suite', () => {
  test('a file belongs to its package, a tool to its folder, however the path is spelled', () => {
    expect(projectOf('C:\\x\\heroesim\\web\\src\\state\\a.test.ts')).toBe('web');
    expect(projectOf('/a/b/tools/portraits/src/c.test.ts')).toBe('portraits');
    expect(relative('/a/b/harness/src/play.test.ts')).toBe('harness/src/play.test.ts');
  });

  test("reads the wall from the run's start to its last file's end, the projects by their tests' time, and the failures", () => {
    const lines = suiteTables(report);
    expect(lines[0]).toBe("4 tests in 2 files, 1 failed; wall 40.2 s from the run's start to its last file's end.");
    expect(lines).toContain('| editor | 1 | 2 | 40.0 |');
    expect(lines).toContain('| engine | 1 | 2 | 1.6 |');
    expect(lines.indexOf('| editor | 1 | 2 | 40.0 |')).toBeLessThan(lines.indexOf('| engine | 1 | 2 | 1.6 |'));
    expect(lines).toContain('| tools/editor/src/cli.test.ts › finish / puts back | 40.00 |');
    expect(lines).toContain('| 0 s to 0.1 s | 2 | 0.1 |');
    expect(lines).toContain('| 1 s to 5 s | 1 | 1.5 |');
    expect(lines).toContain('| 30 s to more | 1 | 40.0 |');
    expect(lines.slice(-2)).toEqual(['Failed:', '- tools/editor/src/cli.test.ts › finish | puts back']);
  });

  test("puts a test of a bucket's bound in the next bucket", () => {
    const tests = [99, 100, 1_000].map((duration) => ({ title: `${duration} ms`, duration, status: 'passed' }));
    const lines = suiteTables({ startTime: 0, numTotalTests: 3, numFailedTests: 0, success: true, testResults: [{ name: '/r/heroesim/words/src/a.test.ts', status: 'passed', assertionResults: tests }] });
    expect(lines).toContain('| 0 s to 0.1 s | 1 | 0.1 |');
    expect(lines).toContain('| 0.1 s to 1 s | 1 | 0.1 |');
    expect(lines).toContain('| 1 s to 5 s | 1 | 1.0 |');
  });
});

const counted = (covered: number, total: number) => ({ covered, total });
const summary: CoverageSummary = {
  total: { lines: counted(15, 20), branches: counted(3, 4), functions: counted(2, 2), statements: counted(15, 20) },
  'C:\\r\\heroesim\\engine\\src\\a.ts': { lines: counted(9, 10), branches: counted(1, 2), functions: counted(1, 1), statements: counted(9, 10) },
  'C:\\r\\heroesim\\engine\\src\\phases\\b.ts': { lines: counted(6, 6), branches: counted(2, 2), functions: counted(1, 1), statements: counted(6, 6) },
  '/r/heroesim/tools/editor/src/main.ts': { lines: counted(0, 4), branches: counted(0, 0), functions: counted(0, 0), statements: counted(0, 4) },
};

describe('coverage', () => {
  test('a source file belongs to its package, a tool to tools/<name>', () => {
    expect(packageOf('C:\\r\\heroesim\\engine\\src\\phases\\b.ts')).toBe('engine');
    expect(packageOf('/r/heroesim/tools/editor/src/main.ts')).toBe('tools/editor');
    expect(packageOf('web/src/app.tsx')).toBe('web');
  });

  test("sums each package's files, and names the files no test reaches", () => {
    expect(byPackage(summary).get('engine')).toEqual({ files: 2, lines: counted(15, 16), branches: counted(3, 4), functions: counted(2, 2), statements: counted(15, 16) });
    const lines = coverageTables(summary);
    expect(lines).toContain('| engine | 2 | 93.8% | 75.0% | 100.0% | 93.8% |');
    expect(lines).toContain('| tools/editor | 1 | 0.0% | — | — | 0.0% |');
    expect(lines).toContain('| All | 3 | 75.0% | 75.0% | 100.0% | 75.0% |');
    expect(lines.slice(-1)).toEqual(['- tools/editor: tools/editor/src/main.ts']);
  });

  test("names a file outside the packages' sources by its first folder, and leaves out the All row and the untouched list when there are none", () => {
    expect(packageOf('scripts/check.ts')).toBe('scripts');
    const lines = coverageTables({ 'C:\\r\\heroesim\\words\\src\\a.ts': { lines: counted(1, 1), branches: counted(0, 0), functions: counted(1, 1), statements: counted(1, 1) } });
    expect(lines).toEqual(['| Package | Files | Lines | Branches | Functions | Statements |', '|---|---:|---:|---:|---:|---:|', '| words | 1 | 100.0% | — | 100.0% | 100.0% |']);
  });
});

const ci: CiRun = {
  headSha: 'abcdef0123',
  displayTitle: 'a push',
  jobs: [
    {
      name: 'check (node-22)',
      conclusion: 'success',
      startedAt: '2026-10-09T10:00:00Z',
      completedAt: '2026-10-09T10:10:30Z',
      steps: [
        { name: 'Run npm test', startedAt: '2026-10-09T10:01:00Z', completedAt: '2026-10-09T10:10:00Z' },
        { name: 'Skipped', startedAt: '0001-01-01T00:00:00Z', completedAt: '0001-01-01T00:00:00Z' },
      ],
    },
    { name: 'e2e', conclusion: 'success', startedAt: '2026-10-09T10:00:00Z', completedAt: '2026-10-09T10:01:00Z' },
  ],
};

describe('ci', () => {
  test("a job's seconds, none for a time GitHub leaves unset", () => {
    expect(secondsBetween('2026-10-09T10:00:00Z', '2026-10-09T10:00:42Z')).toBe(42);
    expect(secondsBetween('0001-01-01T00:00:00Z', '2026-10-09T10:00:42Z')).toBeNull();
  });

  test('bills each job rounded up to a minute, and names its slowest steps', () => {
    const lines = ciTables('42', ci);
    expect(lines[0]).toBe('Run 42 at abcdef0: a push');
    expect(lines).toContain('| check (node-22) | success | 630 | Run npm test 540 |');
    expect(lines.at(-1)).toBe("Jobs' time 690 s (11.5 min); billed 12 min, each job rounded up to a minute.");
  });

  test('names the four slowest steps of a second or more, slowest first, and bills each job of a minute and a second two', () => {
    const at = (second: number): string => new Date(Date.UTC(2026, 9, 9, 10, 0, second)).toISOString();
    const step = (name: string, from: number, to: number) => ({ name, startedAt: at(from), completedAt: at(to) });
    const lines = ciTables('7', {
      jobs: [
        {
          name: 'e2e',
          conclusion: 'failure',
          startedAt: at(0),
          completedAt: at(61),
          steps: [step('a', 0, 2), step('b', 2, 12), step('c', 12, 13), step('d', 13, 18), step('e', 18, 21), step('f', 21, 50)],
        },
        { name: 'lint', conclusion: 'success', startedAt: at(0), completedAt: at(61), steps: [step('quick', 0, 0.5), step('lint', 1, 4)] },
      ],
    });
    expect(lines[0]).toBe('Run 7');
    expect(lines).toContain('| e2e | failure | 61 | f 29; b 10; d 5; e 3 |');
    expect(lines).toContain('| lint | success | 61 | lint 3 |');
    expect(lines.at(-1)).toBe("Jobs' time 122 s (2.0 min); billed 4 min, each job rounded up to a minute.");
  });
});

// A root calling advance, which calls the estimate, and through it passDegree, and copyWorld. A
// sample's time is the delta after it, the last sample taking its own: 1, 2, 1 and 1 ms.
const profile: CpuProfile = {
  nodes: [
    { id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: -1 }, children: [2] },
    { id: 2, callFrame: { functionName: 'advance', url: 'file:///C:/r/heroesim/engine/src/advance.ts', lineNumber: 1 }, children: [3, 4] },
    { id: 3, callFrame: { functionName: 'estimate', url: 'file:///C:/r/heroesim/engine/src/quest-engine/estimate.ts', lineNumber: 9 }, children: [5] },
    { id: 4, callFrame: { functionName: 'copyWorld', url: 'file:///C:/r/heroesim/engine/src/world-copy.ts', lineNumber: 3 } },
    { id: 5, callFrame: { functionName: 'passDegree', url: 'file:///C:/r/heroesim/engine/src/quest-engine/degree.ts', lineNumber: 2 } },
  ],
  samples: [3, 5, 4, 2],
  timeDeltas: [0, 1_000, 2_000, 1_000],
  startTime: 0,
  endTime: 4_000,
};

describe('profile', () => {
  test("a frame's file from the repository's root, V8's own left as they are", () => {
    expect(fileOf('file:///C:/r/heroesim/engine/src/quest-engine/estimate.ts')).toBe('engine/src/quest-engine/estimate.ts');
    expect(fileOf('node:zlib')).toBe('node:zlib');
  });

  test('counts a sample once for each part its stack is in, and the self and inclusive time by function', () => {
    const lines = profileTables(profile);
    expect(lines[0]).toBe('Sampled 0.0 s over 4 samples; wall 0.0 s.');
    expect(lines).toContain('| The quest estimate | 3 | 60.0% |');
    expect(lines).toContain('| copyWorld | 1 | 20.0% |');
    expect(lines).toContain('| passDegree engine/src/quest-engine/degree.ts | 2 | 40.0% |');
    expect(lines).toContain('| advance engine/src/advance.ts | 5 | 100.0% |');
    expect(lines).toContain('| engine/src/advance.ts | 5 | 100.0% |');
  });

  test('counts a sample once for a function or a module that its stack holds more than once', () => {
    // advance calls estimate, which calls itself: 3 ms in the inner estimate, then 3 ms in advance alone.
    const recursive: CpuProfile = {
      nodes: [
        { id: 1, callFrame: { functionName: 'advance', url: 'file:///C:/r/heroesim/engine/src/advance.ts', lineNumber: 1 }, children: [2] },
        { id: 2, callFrame: { functionName: 'estimate', url: 'file:///C:/r/heroesim/engine/src/quest-engine/estimate.ts', lineNumber: 9 }, children: [3] },
        { id: 3, callFrame: { functionName: 'estimate', url: 'file:///C:/r/heroesim/engine/src/quest-engine/estimate.ts', lineNumber: 9 } },
      ],
      samples: [3, 1],
      timeDeltas: [0, 3_000],
      startTime: 0,
      endTime: 4_000,
    };
    const lines = profileTables(recursive);
    expect(lines).toContain('| The quest estimate | 3 | 50.0% |');
    expect(lines).toContain('| engine/src/quest-engine/estimate.ts | 3 | 50.0% |');
    const inclusive = lines.slice(lines.indexOf('| Inclusive, by function | ms | Share |'));
    expect(inclusive).toContain('| estimate engine/src/quest-engine/estimate.ts | 3 | 50.0% |');
    expect(inclusive).toContain('| advance engine/src/advance.ts | 6 | 100.0% |');
  });
});

describe('npm run measure', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (text: string) => out.push(text), err: (text: string) => err.push(text), ciRun: () => ci } };
  };

  test('reads each file named, under its name, and coverage from the summary in coverage/ unless one is named', () => {
    const dir = mkdtempSync(join(tmpdir(), 'measure-'));
    made.push(dir);
    writeFileSync(join(dir, 'run.json'), JSON.stringify(report));
    const coverageDir = join(dir, 'coverage');
    rmSync(coverageDir, { recursive: true, force: true });
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary));

    const suite = io();
    expect(run(['suite', join(dir, 'run.json')], suite.io, dir)).toBe(0);
    expect(suite.out[0]).toContain(`## ${join(dir, 'run.json')}`);

    const named = io();
    expect(run(['coverage', join(dir, 'summary.json')], named.io, dir)).toBe(0);
    expect(named.out[0]).toContain('| engine | 2 |');

    const fallback = io();
    expect(() => run(['coverage'], fallback.io, dir)).toThrow(/coverage-summary\.json/);

    const runs = io();
    expect(run(['ci', '7', '8'], runs.io, dir)).toBe(0);
    expect(runs.out).toHaveLength(2);
    expect(runs.out[1]).toMatch(/^\n## 8\n\nRun 8/);

    writeFileSync(join(dir, 'game.cpuprofile'), JSON.stringify(profile));
    const profiled = io();
    expect(run(['profile', join(dir, 'game.cpuprofile')], profiled.io, dir)).toBe(0);
    expect(profiled.out[0]).toContain('| The quest estimate | 3 | 60.0% |');
  });

  test('gives its usage when asked, and refuses a command it does not know or one without its files', () => {
    const asked = io();
    expect(run(['help'], asked.io)).toBe(0);
    expect(asked.out[0]).toMatch(/^Usage: npm run measure/);
    for (const argv of [['nonsense'], ['suite'], ['coverage', 'a', 'b']]) {
      const refused = io();
      expect(run(argv, refused.io)).toBe(2);
      expect(refused.err[0]).toMatch(/^Usage/);
    }
  });
});
