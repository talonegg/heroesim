# The measures

`npm run measure` reads the files that the test runs, the coverage run, CI and a profiled game write.
It turns them into tables, so that every story measures before and after in the same way (DL-233,
DL-231 Q6). It reports and enforces nothing (Q5, Q17).

| Command | What it reads |
| --- | --- |
| `npm run coverage` | Runs the whole suite under V8's coverage, on half the workers, with 120 s a test where a test sets none, since the instrumentation slows every test. Writes `coverage/coverage-summary.json`, even when a test fails |
| `npm run measure -- coverage [<summary.json>]` | The coverage per package, from `coverage/` unless another summary is named, and the files that no test reaches |
| `npm run measure -- suite <report.json>...` | The time per project, file and test in a Vitest JSON report. Write one with `npx vitest run --reporter=dot --reporter=json --outputFile.json=<file>` |
| `npm run measure -- ci <run-id>...` | A workflow run's jobs and their slowest steps, through `gh`, with the minutes billed, each job rounded up to a minute |
| `npm run measure -- profile <file.cpuprofile>...` | Where a profiled game's time goes: the quest estimate, the Rivals' controllers, the policy, `copyWorld` and the other parts DL-231 measured, then by module and by function |

## How v1.1.9 measures

Each measure runs alone, with nothing else running.

- **The suite.** Two full runs and each project alone, each with Vitest's JSON reporter.
- **A game's profile.** One game of 20 years in one process:
  `HEROESIM_SEEDS=1 HEROESIM_YEARS=20 HEROESIM_WORKERS=1 NODE_OPTIONS="--cpu-prof --cpu-prof-dir=<dir>" npm run harness -- neutral <name>`.
  The shard's profile is the largest file in `<dir>`.
- **Peak memory.** `peak.mjs`, preloaded into every process a run starts, appends each process's peak
  resident memory, CPU and wall time to the file named by `MEASURE_PEAK_LOG`:
  `MEASURE_PEAK_LOG=<file> NODE_OPTIONS="--import=file:///<repo>/tools/measure/peak.mjs" <command>`.
- **The game's figures.** These are a year's fast forward, a save's load and the bundle's size. The
  first two come from a `neutral` report's measures, and the bundle from `npm run build`.

[v1.1.9's measures](../../docs/planning/archive/v1.1.9-measures.md) are its baseline and its
after-report.
