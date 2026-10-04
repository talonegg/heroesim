// The child processes a parallel run shares its seeds among (M2-S12, DL-34): each job is written
// to a file, played by `shard.ts` in a child process under tsx (`node --import tsx shard.ts <job>
// <result>`), and its result read back. The play sweep (`sweepPlayInParallel`) and the Succession
// probe (`probeInParallel`, M9-F1) both run their shards through here.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShardJob, ShardResult } from './shard.js';

const shardModule = fileURLToPath(new URL('./shard.ts', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Runs one shard in a child process under tsx; resolves when it has written its result. The child
 * is in `live` while it runs (v1.1.4-S14), so that a failed run can stop it.
 */
function runChild(jobPath: string, resultPath: string, module: string, live: Set<ChildProcess>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', module, jobPath, resultPath], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    live.add(child);
    child.on('error', (error) => {
      live.delete(child);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      live.delete(child);
      if (code === 0) resolve();
      else reject(new Error(`A play shard exited with ${signal ?? `code ${code}`}: ${jobPath}`));
    });
  });
}

/**
 * Plays each job in a child process of its own, at most `concurrency` at once (all at once by
 * default), each next job starting as a child finishes, and returns their results in the jobs'
 * order. The job and result files live in a temporary directory, removed after. Each child runs
 * `module`, shard.ts but for a test's stand-in.
 *
 * When a child fails, no further job starts and the children still playing are killed, and the
 * run waits for them to exit before it removes the directory and throws (v1.1.4-S14): a failed
 * run leaves nothing playing.
 *
 * @throws Error when a child fails: a broken run, not a finding; the first child's to fail
 */
export async function runShardJobs(jobs: readonly ShardJob[], concurrency: number = jobs.length, module: string = shardModule): Promise<ShardResult[]> {
  const dir = mkdtempSync(join(tmpdir(), 'heroesim-play-'));
  const live = new Set<ChildProcess>();
  let failure: { error: unknown } | undefined;
  try {
    const paths = jobs.map((job, shard) => {
      const jobPath = join(dir, `job-${shard}.json`);
      writeFileSync(jobPath, JSON.stringify(job), 'utf8');
      return { jobPath, resultPath: join(dir, `result-${shard}.json`) };
    });
    // v1.1.4-S10: each lane takes the next job when its child is done, so a game that ends early
    // frees its process for another rather than leaving it idle to the slowest lane's end.
    let next = 0;
    const lane = async (): Promise<void> => {
      while (failure === undefined && next < paths.length) {
        const { jobPath, resultPath } = paths[next++] as (typeof paths)[number];
        try {
          await runChild(jobPath, resultPath, module, live);
        } catch (error) {
          if (failure === undefined) {
            failure = { error };
            for (const child of live) child.kill();
          }
          return;
        }
      }
    };
    // Every lane settles, the killed ones too, before the directory goes.
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, paths.length)) }, lane));
    if (failure !== undefined) throw failure.error;
    return paths.map(({ resultPath }) => JSON.parse(readFileSync(resultPath, 'utf8')) as ShardResult);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
