import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { deps, ruleProblems } from './transfer-generator.test-support.js';
import type { Swept, Tally } from './transfer-generator.sweep.test-support.js';

// The first of two acceptance boxes (DL-59): over 100 seeds × 20 years, Rival-to-Rival Transfers occur,
// and the Roster-size distribution across Rivals stays within the range a Rival is generated with
// (`rivalRosterMin` to `rivalRosterMax`). The second box, that the phase never changes the player's
// Roster, is `transfer-generator.test.ts`, in `npm test`.
//
// The distribution is held, since v1.1.5's re-close (DL-185), by its floor alone: no Guild's Roster is
// capped, and a Roster grows as far as its Guild's finances support (the owner's answer). The
// Generator's own moves are still held within the range (`ruleProblems`), a bound kept for now
// only as a development measure, to constrain testing load, and to be removed (backlog, DL-185).
//
// Each seed is a default world, four Rivals dealt the four Dispositions (DL-56), the player idle and
// rich (its Guildmaster young enough not to retire), played Turn by Turn on the one world, in place,
// as the Dispositions' and the Rivals' building tests are (DL-56, DL-58), the `transfers` phase
// watched, its seeds shared among four processes side by side (DL-324). The box, with the four seeds of
// Rivals building and buying beside it, takes about forty-five minutes alone: a harness run,
// `npm run harness -- transfer-generator`, which `npm test` never plays (DL-230). A Rival bids only
// while it would hire (DL-59), which the test content's Rivals seldom would: the Generator dealt in 20
// of the 100 seeds, 24 times, so its own count is asserted over the hundred.

const years = 20;
const seeds = Array.from({ length: 100 }, (_, index) => `transfer-generator-${index + 1}`);

const sweepModule = new URL('./transfer-generator.sweep.test-support.ts', import.meta.url).href;
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
/** The processes the seeds are shared among, in runs of consecutive seeds (DL-324). */
const processes = 4;
/** A child under tsx: it plays the seeds given and writes what it swept, as JSON, to its output. */
const child = [
  'const { sweep } = await import(process.argv[1]);',
  'process.stdout.write(JSON.stringify(process.argv.slice(3).map((seed) => sweep(seed, Number(process.argv[2])))));',
].join('\n');

/** Plays `shared` seeds in a child process and returns what it swept. */
function sweepInChild(shared: string[], live: ChildProcess[]): Promise<Swept[]> {
  return new Promise((resolve, reject) => {
    const sweeper = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', child, sweepModule, String(years), ...shared], { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'inherit'] });
    const out: Buffer[] = [];
    live.push(sweeper);
    sweeper.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    sweeper.on('error', reject);
    // 'close', not 'exit': the output is read whole only once its stream has closed.
    sweeper.on('close', (code, signal) => {
      if (code !== 0) return reject(new Error(`A sweep exited with ${signal ?? `code ${code}`}: ${shared[0]}`));
      try {
        resolve(JSON.parse(Buffer.concat(out).toString('utf8')) as Swept[]);
      } catch (error) {
        reject(new Error(`A sweep wrote more than its JSON: ${shared[0]}`, { cause: error }));
      }
    });
  });
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] as number) : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};
const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

describe(`the Transfer Generator over ${seeds.length} seeds × ${years} years`, () => {
  let tallies: Tally[] = [];
  // The seeds are played in four processes side by side, every one back in order, and each is checked
  // here, named by its seed.
  // The limit is an hour: the Rosters Contracts let grow take a seed about 75 s (DL-324).
  beforeAll(async () => {
    const live: ChildProcess[] = [];
    try {
      const size = Math.ceil(seeds.length / processes);
      const swept = (await Promise.all(Array.from({ length: processes }, (_, lane) => sweepInChild(seeds.slice(lane * size, (lane + 1) * size), live)))).flat();
      expect(swept.map(({ seed }) => seed)).toEqual(seeds);
      for (const { seed, ended, problems } of swept) {
        expect(ended, seed).toBeNull();
        expect(problems, seed).toEqual([]);
      }
      tallies = swept.map(({ tally }) => tally);
    } finally {
      for (const running of live) running.kill();
    }
  }, 3_600 * 1000);

  test('Rival-to-Rival Transfers occur; those the Generator makes go to the more transferAppetite-heavy Rival', () => {
    expect(tallies.reduce((sum, tally) => sum + tally.rivalToRival, 0)).toBeGreaterThan(0);
    for (const tally of tallies) expect(ruleProblems(tally, deps)).toEqual([]);
    // The Generator's own, over the hundred seeds: Rivals seldom would hire (DL-59).
    expect(tallies.reduce((sum, tally) => sum + tally.transfers.length, 0)).toBeGreaterThan(0);
  });

  test("the Roster-size distribution across Rivals keeps to the generation range's floor, and is not capped at its top", () => {
    const { rivalRosterMin: min } = deps.config;
    // The Generator's own moves never take a Roster out of the range (`ruleProblems`, above), a
    // bound kept for now only to constrain testing load, to be removed (backlog, DL-185). At every
    // year's end, across the seeds' Rivals in play, the distribution's median lies at the range's floor
    // or above, and so does the mean of every year-end: Deaths, Retirements, the afternoon's Transfers
    // and folds take single Rosters below it, which the Generator does not undo (DL-59), and a Rival
    // below the floor hires back towards it by need (DL-60), so the distribution does not fall below it.
    // Above the range nothing is held: no Guild's Roster is capped, and a Roster grows as far as its
    // Guild's finances support (the owner's answer at v1.1.5's re-close, DL-185). DL-59 read the box as
    // each year's median and mean within the range; DL-157 dropped a year's mean, DL-184 took
    // the median of the four seeds' years, and DL-185 every check at the top. With the XP split
    // (DL-182, DL-184) the Rivals here keep more Heroes: over the box's hundred seeds the mean of every
    // year-end is 9.17 and the largest 33, each year's median reaching 8, the range's top, in years 4 to
    // 7 (S13's verification, DL-184).
    const every: number[] = [];
    for (let year = 0; year < years; year += 1) {
      const sizes = tallies.flatMap((tally) => tally.yearEnds[year] ?? []);
      expect(sizes.length, `year ${year + 1}`).toBeGreaterThan(0);
      expect(median(sizes), `year ${year + 1} median`).toBeGreaterThanOrEqual(min);
      every.push(...sizes);
    }
    expect(median(every)).toBeGreaterThanOrEqual(min);
    expect(mean(every)).toBeGreaterThanOrEqual(min);
  });

  test("the player's Roster is never changed by the phase, on any night of twenty years", () => {
    for (const tally of tallies) {
      // One run each night: a third of the Turns played, which start on a morning (DL-24).
      expect(tally.runs, tally.seed).toBe((years * deps.config.turnsPerYear) / 3);
      expect(tally.playerChanged, tally.seed).toBe(0);
    }
  });
});
