/**
 * The end-to-end test (DL-04): the real process, driven by a script, played to a save,
 * then played again from that save until the Career ends. It spawns Node directly with
 * tsx as an import hook rather than going through a shell, which is what makes it behave
 * the same on Windows as anywhere else.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const entry = join(root, 'cli', 'src', 'index.ts');
const workspace = mkdtempSync(join(tmpdir(), 'heroesim-e2e-'));
const careerDir = join(workspace, '.career');

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function script(name: string, lines: readonly string[]): string {
  const path = join(workspace, name);
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
  return path;
}

function play(args: readonly string[]): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', entry, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const first = play([
  '--seed',
  'e2e',
  '--years',
  '1',
  '--career-dir',
  careerDir,
  '--script',
  // Take the first Commission, send two Heroes, let the Days run, save twice, leave.
  script('first.txt', ['1', 'a', 'b', '', 'n', 'n', 'n', 'n', 's', 's one', 'q']),
  '--no-colour',
]);

const second = play([
  '--career-dir',
  careerDir,
  '--slot',
  'one',
  '--script',
  script('second.txt', [...Array.from({ length: 400 }, () => 'n'), 'q']),
  '--no-colour',
]);

describe('a scripted Career, played twice', () => {
  it('runs both times without failing', () => {
    expect(first.status, first.output.slice(-2000)).toBe(0);
    expect(second.status, second.output.slice(-2000)).toBe(0);
  });

  it('shows the Board, sends a Party and narrates what happened', () => {
    expect(first.output).toContain('Board');
    expect(first.output).toContain('set out on');
    expect(first.output).toContain('Saved to slot "one".');
  });

  it('wrote the save the first run asked for', () => {
    expect(existsSync(join(careerDir, 'one.json'))).toBe(true);
  });

  it('carried the Career on from the save rather than starting a new one', () => {
    expect(second.output).toContain('Loaded slot "one"');
  });

  it('reaches the end of the Career and prints the reckoning', () => {
    expect(second.output).toContain('Commissions:');
    expect(second.output).toContain('Standing:');
    expect(second.output).toContain('Coin:');
    expect(second.output).toMatch(/(retires on Year|cannot meet its Upkeep)/);
  });

  it('leaves no dangling autosave for a Career that has ended', () => {
    expect(existsSync(join(careerDir, 'autosave.json'))).toBe(false);
    expect(existsSync(join(careerDir, 'one.json'))).toBe(true);
    expect(second.output).toContain('The autosave for this Career has been removed.');
  });

  it('names the Heroes the player was given', () => {
    const saved = JSON.parse(readFileSync(join(careerDir, 'one.json'), 'utf8')) as {
      guild: { roster: { name: string }[] };
    };
    const names = saved.guild.roster.map((hero) => hero.name);
    expect(names.length).toBeGreaterThan(0);
    const together = `${first.output}\n${second.output}`;
    expect(names.some((name) => together.includes(name))).toBe(true);
  });

  it('keeps every line it printed inside 80 columns', () => {
    for (const line of first.output.split('\n')) {
      expect(line.trimEnd().length, line).toBeLessThanOrEqual(80);
    }
  });
});

describe('--quiet', () => {
  const quiet = play([
    '--seed',
    'e2e-quiet',
    '--years',
    '1',
    '--career-dir',
    join(workspace, '.quiet'),
    '--script',
    script('quiet.txt', ['n', 'n', 'q', 'y']),
    '--quiet',
    '--no-colour',
  ]);

  it('leaves out the Board redraw and keeps the narration', () => {
    expect(quiet.status, quiet.output.slice(-2000)).toBe(0);
    expect(quiet.output).not.toContain('1-6 take work');
    expect(quiet.output).not.toContain('M/C/N/G');
    expect(quiet.output).toMatch(/Year 1, Day \d+/);
  });
});

describe('the command line', () => {
  it('explains itself and refuses a flag it does not know', () => {
    const help = play(['--help']);
    expect(help.status).toBe(0);
    expect(help.output).toContain('--career-dir');

    const wrong = play(['--turbo']);
    expect(wrong.status).toBe(2);
    expect(wrong.output).toContain('--turbo');
  });
});
