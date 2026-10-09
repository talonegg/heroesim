// @vitest-environment node
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, expect, test, vi } from 'vitest';
import { deploy, type Spawn } from '../scripts/deploy.mjs';

// Wrangler walks up from web/ for a configuration to the filesystem's root, and the deploy's guard
// walks with it (DL-94 item 2): the root is the last directory looked in. No test may
// write there, so `existsSync` answers for one file at the root and asks the disk for the rest
// (DL-97). The other refusals are src/deploy.test.ts's.

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(actual.existsSync) };
});

const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
const place = actual.mkdtempSync(path.join(tmpdir(), 'heroesim-deploy-root-test-'));

afterEach(() => {
  vi.mocked(fs.existsSync).mockImplementation(actual.existsSync);
});
afterAll(() => {
  actual.rmSync(place, { recursive: true, force: true });
});

/** An empty file, and the directories it needs. */
function touch(file: string): string {
  actual.mkdirSync(path.dirname(file), { recursive: true });
  actual.writeFileSync(file, '');
  return file;
}

/** git answering as a clean checkout of v1.0.1 would; nothing else may run. */
const spawn: Spawn = (command, args) => {
  const asked = `${command} ${args.join(' ')}`;
  if (asked === 'git status --porcelain') return { status: 0, stdout: '' };
  if (asked === 'git tag --points-at HEAD') return { status: 0, stdout: 'v1.0.1\n' };
  if (asked === 'git rev-parse HEAD') return { status: 0, stdout: `${'0'.repeat(40)}\n` };
  throw new Error(`an unexpected ${asked}`);
};

test.each(['wrangler.json', path.join('.wrangler', 'deploy', 'config.json')])(
  'the guard refuses a %s at the filesystem root, the last directory wrangler looks in',
  (name) => {
    const execPath = path.join(place, 'node', 'node.exe');
    touch(path.join(place, 'node', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    touch(path.join(place, 'node', 'node_modules', 'npm', 'bin', 'npx-cli.js'));
    const webDir = path.join(place, 'checkout', 'web');
    touch(path.join(webDir, 'wrangler.jsonc'));
    const stray = path.join(path.parse(webDir).root, name);
    vi.mocked(fs.existsSync).mockImplementation((file) => file === stray || actual.existsSync(file));
    const output: string[] = [];

    const status = deploy({
      argv: ['--dry-run'],
      env: {},
      webDir,
      execPath,
      tmpdir: place,
      spawn,
      log: (line) => output.push(line),
      warn: (line) => output.push(line),
    });

    expect(status).not.toBe(0);
    expect(output.join('\n')).toContain(`a wrangler configuration sits at ${stray}`);
    expect(output.join('\n')).toContain('refused; nothing was built or uploaded');
  },
);
