// The editor's tests' scratch template, made once a run in the project's global setup (DL-249): the
// repository's content (its JSON, `version.json` among it, and the source of its checks, which the
// drift check reads), `docs/agents/traits-register.md`, `engine/src/config.json` and a planted `npm
// test`, committed. Every scratch copy copies it, `.git` and all, so that no test spawns git to make
// one: three git commands for each test took most of the editor's tests' time (DL-164). Removed when
// the run ends.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { repositoryRoot } from './content-files.js';

declare module 'vitest' {
  export interface ProvidedContext {
    /** The scratch copies' first state, made once a run. */
    editorTemplate: string;
  }
}

/**
 * Runs git in a scratch repository, and gives its output. Never its automatic maintenance: on Linux a
 * commit leaves `git maintenance run --auto --detach` behind it, holding `.git/objects/maintenance.lock`
 * a moment after the commit ends, and a copy of the template taken in that moment fails with ENOENT
 * on the lock it saw go (DL-167). Git for Windows runs it before the commit ends.
 */
export function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'maintenance.auto=false', '-c', 'core.autocrlf=false', '-c', 'user.name=editor test', '-c', 'user.email=test@example.invalid', ...args], { cwd: dir, encoding: 'utf8' });
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

/** The template: content, its checks' source, the register, the config file and the planted tests, committed. */
function templateRepository(): string {
  const root = repositoryRoot;
  const dir = mkdtempSync(path.join(tmpdir(), 'heroesim-editor-template-'));
  cpSync(path.join(root, 'content'), path.join(dir, 'content'), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(path.join(root, 'content'), source).replace(/\\/g, '/');
      // The checks' source the drift check reads: the driver and the content kinds (DL-243), their tests left out.
      const kind = relative.startsWith('src/kinds/') && !relative.endsWith('.test.ts');
      return relative === '' || relative.endsWith('.json') || ['src', 'src/validate.ts', 'src/kinds'].includes(relative) || kind;
    },
  });
  cpSync(path.join(root, 'docs', 'agents', 'traits-register.md'), path.join(dir, 'docs', 'agents', 'traits-register.md'));
  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'scratch', private: true, scripts: { test: 'node planted-test.mjs' } }, null, 2)}\n`);
  writeFileSync(path.join(dir, 'planted-test.mjs'), plantedTest);
  writeFileSync(path.join(dir, 'test-outcome.txt'), 'pass\n');
  // The defaults' values, which the config kind writes (DL-204), committed; the rest of engine/src/ ignored.
  cpSync(path.join(root, 'engine', 'src', 'config.json'), path.join(dir, 'engine', 'src', 'config.json'));
  writeFileSync(path.join(dir, '.gitignore'), '.editor/\ntests-started.txt\nengine/src/*\n!engine/src/config.json\n');
  // No template: git's sample hooks are files each copy would copy for nothing.
  git(dir, 'init', '--quiet', '--template=');
  git(dir, 'add', '--all');
  git(dir, 'commit', '--quiet', '-m', 'scratch');
  return dir;
}

/** The project's global setup: the template made and given to the tests, and removed after them. */
export default function setup(project: TestProject): () => void {
  const template = templateRepository();
  project.provide('editorTemplate', template);
  return () => rmSync(template, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
