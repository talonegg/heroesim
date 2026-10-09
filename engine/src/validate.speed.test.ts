import { expect, test } from 'vitest';
import { validate } from './validate.js';
import { buildDocument, testDeps, withValid } from './world.test-support.js';

// The validator's time limit, apart from `npm test` and played alone at a close, as the harness's
// long runs are (DL-233). 10 to 13 ms alone. Load only ever adds time, so the fastest run is the
// validator's own cost: it times runs until one is under 50 ms, for up to 400 runs or 15 s, so that a
// busy moment passes, while a validator slower than 50 ms is slower in every run and fails (DL-164).
// The timeout covers the world's building and 15 s of runs.
test('validate a 1,000-Hero world in under 50 ms (the fastest of up to 400 runs)', { timeout: 30_000 }, () => {
  const deps = testDeps();
  const { document } = buildDocument({ rivals: 9, rosterSize: 20, unattached: 799 });
  expect(Object.keys(document.world.heroes)).toHaveLength(1000);
  withValid(document, deps);

  // Timed in this process's CPU time, not wall-clock time: another process busy on the machine
  // delays the run without adding to its CPU time, while a validator that does more than 50 ms of
  // work still does in every run.
  const cpuMs = (since: NodeJS.CpuUsage): number => {
    const { user, system } = process.cpuUsage(since);
    return (user + system) / 1_000;
  };
  const began = performance.now();
  let fastest = Number.POSITIVE_INFINITY;
  for (let run = 0; run < 400 && fastest >= 50 && performance.now() - began < 15_000; run += 1) {
    const start = process.cpuUsage();
    validate(document, deps);
    fastest = Math.min(fastest, cpuMs(start));
  }

  expect(fastest).toBeLessThan(50);
});
