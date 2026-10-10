import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { runShardJobs } from './children.js';
import type { ShardJob } from './shard.js';

// The children a run shares its jobs among, played by a stand-in for shard.ts that
// plays no game: it writes its pid where the job says, then fails, sleeps or writes its result.

/** The stand-in child: a job of `fail` fails once `waitFor` pids are written, a job of `sleep` writes its result after that many ms. */
const standIn = `
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [jobPath, resultPath] = process.argv.slice(2);
const job = JSON.parse(readFileSync(jobPath, 'utf8'));
writeFileSync(join(job.pids, String(process.pid)), '');
if (job.fail) {
  setInterval(() => {
    if (readdirSync(job.pids).length >= job.waitFor) process.exit(1);
  }, 20);
} else {
  setTimeout(() => writeFileSync(resultPath, JSON.stringify({ played: job.name })), job.sleep);
}
`;

/** Whether the process `pid` is alive. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const made: string[] = [];

/** A fresh directory for the stand-in and its pids. */
function workspace(): { module: string; pids: string } {
  const dir = mkdtempSync(join(tmpdir(), 'heroesim-children-test-'));
  made.push(dir);
  const module = join(dir, 'stand-in.mjs');
  writeFileSync(module, standIn, 'utf8');
  const pids = join(dir, 'pids');
  mkdirSync(pids);
  return { module, pids };
}

/** The pids the stand-ins wrote in `pids`. */
const pidsIn = (pids: string): number[] => readdirSync(pids).map(Number);

afterEach(() => {
  // Leave nothing running, whatever the test found.
  for (const dir of made.splice(0)) {
    for (const pid of pidsIn(join(dir, 'pids'))) if (alive(pid)) process.kill(pid);
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('runShardJobs', () => {
  test("returns the stand-in's results in the jobs' order", async () => {
    const { module, pids } = workspace();
    const jobs = ['a', 'b', 'c'].map((name, at) => ({ name, sleep: 30 * (3 - at), pids }) as unknown as ShardJob);

    expect(await runShardJobs(jobs, 2, module)).toEqual([{ played: 'a' }, { played: 'b' }, { played: 'c' }]);
  }, 30_000);

  test('when one child fails, rejects promptly, starts no other job and leaves no child alive', async () => {
    const { module, pids } = workspace();
    const long = { sleep: 60_000, pids };
    const jobs = [{ fail: true, waitFor: 2, pids }, long, long, long] as unknown as ShardJob[];
    const started = Date.now();

    await expect(runShardJobs(jobs, 2, module)).rejects.toThrow(/A play shard exited with code 1/);

    expect(Date.now() - started).toBeLessThan(20_000);
    const ran = pidsIn(pids);
    expect(ran).toHaveLength(2);
    expect(ran.filter(alive)).toEqual([]);
  }, 30_000);
});
