// A process's peak memory and time (DL-233), preloaded into every Node process a run starts:
//   NODE_OPTIONS="--import=file:///<repo>/tools/measure/peak.mjs" MEASURE_PEAK_LOG=<file> <command>
// On exit, each process appends one line to MEASURE_PEAK_LOG: its peak resident memory, its CPU
// and wall time, and its command line's file names. Without MEASURE_PEAK_LOG it does nothing.

import { appendFileSync } from 'node:fs';

const log = process.env['MEASURE_PEAK_LOG'];
if (log) {
  const started = Date.now();
  process.on('exit', () => {
    const usage = process.resourceUsage();
    const argv = process.argv.slice(1).map((arg) => arg.replace(/^.*[\\/]/, '')).join(' ').slice(0, 160);
    const seconds = (us) => (us / 1e6).toFixed(1);
    appendFileSync(log, `pid=${process.pid} maxRSS_MB=${(usage.maxRSS / 1024).toFixed(0)} user_s=${seconds(usage.userCPUTime)} sys_s=${seconds(usage.systemCPUTime)} wall_s=${((Date.now() - started) / 1000).toFixed(1)} argv=${argv}\n`);
  });
}
