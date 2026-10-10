// A Vitest JSON report read into time per project, file and test (DL-233): how long the suite
// takes, and where, so that each story of v1.1.9 measures against the same tables (DL-231 Q6).

/** The parts of Vitest's JSON reporter's output these tables read. */
export interface VitestReport {
  startTime: number;
  numTotalTests: number;
  numFailedTests: number;
  success: boolean;
  testResults: {
    name: string;
    startTime?: number;
    endTime?: number;
    status: string;
    assertionResults: { fullName?: string; title: string; duration?: number | null; status: string }[];
  }[];
}

/** A project's name from a test file's path: its package, the tools' by their folder. */
export function projectOf(file: string): string {
  const path = relative(file);
  const tool = /^tools\/([^/]+)\//.exec(path);
  if (tool) return tool[1] ?? 'other';
  return /^([^/]+)\//.exec(path)?.[1] ?? 'other';
}

/** A path from the repository's root, with forward slashes, however the report spelled it. */
export function relative(file: string): string {
  const path = file.replace(/\\/g, '/');
  const at = path.search(/\/(?:engine|content|words|harness|cli|web|tools\/[^/]+)\/src\//);
  return at < 0 ? path : path.slice(at + 1);
}

const seconds = (ms: number, places = 1): string => (ms / 1000).toFixed(places);
const cell = (text: string): string => text.replace(/\|/g, '/');

/** One run's tables, as Markdown lines: totals, per project, the slowest files and tests, and how the tests' time spreads. */
export function suiteTables(report: VitestReport, top = 25): string[] {
  const files = report.testResults.map((result) => {
    const tests = result.assertionResults.map((test) => ({ name: test.fullName ?? test.title, ms: test.duration ?? 0, status: test.status }));
    return {
      file: relative(result.name),
      project: projectOf(result.name),
      span: (result.endTime ?? 0) - (result.startTime ?? 0),
      testMs: tests.reduce((sum, test) => sum + test.ms, 0),
      end: result.endTime ?? report.startTime,
      tests,
    };
  });
  const wall = Math.max(report.startTime, ...files.map((file) => file.end)) - report.startTime;
  const lines = [`${report.numTotalTests} tests in ${files.length} files, ${report.numFailedTests} failed; wall ${seconds(wall)} s from the run's start to its last file's end.`, ''];

  const projects = new Map<string, { files: number; tests: number; testMs: number }>();
  for (const file of files) {
    const project = projects.get(file.project) ?? { files: 0, tests: 0, testMs: 0 };
    projects.set(file.project, { files: project.files + 1, tests: project.tests + file.tests.length, testMs: project.testMs + file.testMs });
  }
  lines.push('| Project | Files | Tests | Tests\' time, s |', '|---|---:|---:|---:|');
  for (const [name, project] of [...projects].sort((a, b) => b[1].testMs - a[1].testMs)) lines.push(`| ${name} | ${project.files} | ${project.tests} | ${seconds(project.testMs)} |`);

  lines.push('', `| Slowest files | Tests | Tests' time, s |`, '|---|---:|---:|');
  for (const file of [...files].sort((a, b) => b.testMs - a.testMs).slice(0, top)) lines.push(`| ${file.file} | ${file.tests.length} | ${seconds(file.testMs)} |`);

  const tests = files.flatMap((file) => file.tests.map((test) => ({ ...test, file: file.file })));
  lines.push('', '| Slowest tests | s |', '|---|---:|');
  for (const test of [...tests].sort((a, b) => b.ms - a.ms).slice(0, top)) lines.push(`| ${test.file} › ${cell(test.name).slice(0, 120)} | ${seconds(test.ms, 2)} |`);

  const bounds = [100, 1_000, 5_000, 30_000, Number.POSITIVE_INFINITY];
  const spread = bounds.map(() => ({ count: 0, ms: 0 }));
  for (const test of tests) {
    const bucket = spread[bounds.findIndex((bound) => test.ms < bound)];
    if (bucket) {
      bucket.count += 1;
      bucket.ms += test.ms;
    }
  }
  lines.push('', '| A test\'s time | Tests | Their time, s |', '|---|---:|---:|');
  spread.forEach((bucket, at) => {
    const from = at === 0 ? 0 : (bounds[at - 1] ?? 0) / 1000;
    const to = bounds[at] === Number.POSITIVE_INFINITY ? 'more' : `${(bounds[at] ?? 0) / 1000} s`;
    lines.push(`| ${from} s to ${to} | ${bucket.count} | ${seconds(bucket.ms)} |`);
  });

  const failed = tests.filter((test) => test.status === 'failed');
  if (failed.length > 0) lines.push('', 'Failed:', ...failed.map((test) => `- ${test.file} › ${test.name}`));
  return lines;
}
