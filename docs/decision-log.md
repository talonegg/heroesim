# Decision log

Significant decisions taken during the build, recorded before or alongside implementation.
Append a new entry; never edit an accepted one — supersede it with a later entry that names it.
Every entry says who decided: the owner, or an agent when the epic left a choice open or a
genuine contradiction forced one. Architecture decisions taken during the design session live in
[`./adr/`](./adr/) and are not repeated here.

Format (from DL-215, held by `npm test`; DL-219): `## DL-nn — title`, then
- a line `**Status:** … · **Date:** YYYY-MM-DD · **Decided by:** …`;
- **Context.**, why a decision was needed;
- **Decision.**, in numbered items;
- *Judgement calls, for the owner to see*, where an agent chose what was left open;
- **Consequences.**;
- **Evidence.**, a few lines naming the commits, the reports, the checks and the epic's boxes.

An entry is at most 6 KB. Checks with their counts, mutation runs, the doctor's readings, sweep
figures and a verification's findings go in the commit messages and the harness's reports, which the
Evidence names. An entry before DL-215 is as it was written.

**Where the entries are** (DL-215). This file holds the open release's entries, and a new entry is
appended at its end. Every earlier entry is in [`./decisions/archive/`](./decisions/archive/), one
file per release, and the Pre-M0 review decisions are in
[`./decisions/archive/pre-m0-review.md`](./decisions/archive/pre-m0-review.md). At a release's
close its entries move to an archive file of their own, `DL-<first>-<last>-<release>.md`, with the
text unchanged.

- *An item superseded in full* is a one-line stub in its entry, naming the entry that superseded it.
  Its text is in [`./decisions/archive/superseded/`](./decisions/archive/superseded/), in a file
  named for its entry.
- *An item superseded in part* keeps its text, with a note beneath it. The same file in
  `superseded/` records what superseded it.
- *When a new entry supersedes an earlier item,* the same commit writes the stub or the note and the
  record in `superseded/`. These, a move with the text unchanged, and a dated note are the only
  changes made to an accepted entry.

[`./decisions/index.md`](./decisions/index.md) lists every entry: its date, its title, what
superseded it and the file that holds it. `npm run decisions -- index` writes it after an entry is
added, moved or superseded. `npm test` fails when it is stale, or when a `DL-nn` cited anywhere in
the repository is no entry. To read an entry, find its file in the index, then search the file for
`## DL-nn `.

---

## DL-231 — v1.1.9 planned: the tests and the harness faster and leaner, play and the design unchanged

**Status:** Accepted · **Date:** 2026-10-09 · **Decided by:** the owner, answering Q1–Q30 of a
grilling after four read-only analyses ([the epic](./planning/epics/v1.1.9-release.md) §5, §6)

**Context.** After v1.1.8, the owner asked for a release of non-functional performance, better and
leaner tests, and a faster suite and harness, without compromising the architecture or the
engineering design. The analyses found the following:
- contention drives the local suite's 119–126 s;
- quest estimation is 48.7% of a harness game;
- CI bills 22–44 minutes a push;
- about 400 tests are candidates for removal or shrinking.

**Decision.**

1. **Scope.**
   - The tests, the harness, CI and the engine's hot paths are in scope (Q1 b). The game's figures
     are reported only, and its recorded targets are left as they are (Q21 a).
   - e2e is in scope (Q29 a).
   - There are no numeric targets: before and after are measured locally, in CI minutes, and for
     `gate` and `neutral` (Q17 c, Q6 c).
2. **Play.** Play stays neutral. A story that keeps the save's format shows an identical fingerprint.
   One that changes the format shows 0 play counters moved in `compare`, with a new baseline (Q2 b).
3. **The design.** An ADR may be amended where its intent holds, dated, with a DL entry and the
   owner's word for each amendment (Q14 a).
   - The engine may hold caches that last one call or one phase of a Turn. They are never stored in
     the document and never module-global, their key covers every input, and they are proved by the
     fingerprint. Identical-result algorithms come after, if needed (Q20).
4. **Pruning.**
   - Each package is one batch, approved by the owner (Q3 a).
   - A test is shown redundant by three things together: coverage per test, a named subsuming test,
     and one planted bug that turns the subsuming test red (Q9 b). No mutation-testing tool is used
     (Q4 c).
   - Pins of a default are removed; a test whose numbers merely rest on one stays (Q10 b).
   - Pins of content data become properties of the content (Q11 a).
   - `words` owns the narration's sentence tests, with one sentence end to end per front end (Q12 a).
   - Old-save loading tests go, as rule 5 allows (Q24 a).
   - Story ids leave test names and comments, which come under the citation ratchet (Q16 a, Q27 a).
5. **Structure.**
   - Coverage is added and reported, not enforced (Q5 b).
   - Speed assertions move to a run apart (Q22 a).
   - Tests that start processes or browsers go in a project with limited concurrency (Q23 a).
   - `owner.test.ts` becomes opt-in (Q15 a).
   - `withValid` passes `historyFrom` (Q26 a).
   - The dispositions box is split as DL-230 split the Transfer Generator's (Q25 a).
   - The twenty-year boxes stay at closes only (Q7 c).
6. **CI.**
   - The full suite and e2e run on `.node-version`. Node 22 runs `npm ci`, typecheck, the build, and
     the engine's and `words`' tests (Q18 a), with ADR-0007 amended.
   - The deploy skips the tests when the merge commit's tree is the tested release tree (Q19 a).

   *Superseded in part by DL-235, 2026-10-09: no Node 22 job; the floor is Node 26, `.node-version`, which the one `check` job tests. The record: [superseded/DL-231.md](./decisions/archive/superseded/DL-231.md).*
7. **The harness.** `neutral` runs as many workers as seeds. The `gate` keeps 8 workers and its
   replay alone (Q13 a).
8. **The plan** (Q28 a): S1 the tooling and baselines, S2 the suite's structure, S3 CI, S4–S6 the
   engine's and the harness's speed, S7–S10 pruning by package, S11 the close. The Gate is the four
   guardrails of Q30 (a): play unchanged; the ADRs hold, every amendment approved; three full runs
   in a row and every removal approved; coverage per package no lower, or each drop accepted.
9. **The branch.** `v1.1.9-dev` is cut from `26cd276`, and Dependabot is moved to it, on the owner's
   word (Q8 b).

*Judgement calls, for the owner to see:*
- Each pruning batch re-derives its candidates at its own commit, since S2–S6 move code. The
  research's lists are only a starting point and are not committed.
- Q10 (b) is read as removing tests that assert a default's value, not tests that merely depend on
  one.

**Consequences.** `npm test` loses no behavioural check without the owner's approval, and some move
to runs that only a close plays. CI proves Node 22's floor by a subset of the tests.

**Evidence.** The epic's §5. The analyses ran at `26cd276`: `npm test` twice, each project alone,
coverage via `npm i --no-save`, one profiled `neutral` game (with one worker, to profile a single
process), and CI's jobs by `gh`.

## DL-232 — v1.1.9 widened to the architecture review's twelve candidates

**Status:** Accepted · **Date:** 2026-10-09 · **Decided by:** the owner, answering QA–QD after an
architecture review ([the epic](./planning/epics/v1.1.9-release.md) §5.1, §6)

**Context.** After DL-231, the owner asked for a review of the codebase's architecture.
- Three read-only explorations of the hot spots since 2026-09-28 found twelve candidates: modules
  whose knowledge of one thing is spread across modules that change together, or written twice.
- The owner then asked how to fit them into v1.1.9.
- The agent recommended taking seven and deferring five.

**Decision.**

1. **All twelve candidates join v1.1.9** (QA c). The epic grows from 13–17 to 25–31 sessions, and
   its stories are renumbered S1–S16.
2. **The new and changed stories:**

   | Story | What it builds | Review |
   |---|---|---|
   | S4 | The Best Party module, replacing the plain caches | #1 |
   | S5 | Adds the list of a Guild's actions applied on one copy | #2 |
   | S6 | The harness's counters declared once, and the play loop observed | #7, #10 |
   | S7 | Refusals behind the Namer | #5 |
   | S8 | Readings in `words`, and the player's reading | #4, #8 |
   | S9 | The History reader | #9 |
   | S10 | Content kinds | #3, #11, #12 |
   | S11 | The editor's edit session | #6 |

   Pruning becomes S12–S15 and the close S16. The order keeps Q28 (a), and each review story comes
   before the pruning of the package whose tests it moves.
3. **A cache lives no longer than its unchanging world** (QB a). This amends Q20's "one call or one
   phase of a Turn". The page's lifetime is one document, which is immutable. A cache is never
   module-global and never stored in the document. The world's identity is its key.
4. **Drifted wording** (QC a). Where the CLI and the page now differ, the wording is settled by
   `docs/agents/ui-text.md`. Every changed sentence is listed in the story's DL entry for the owner.
5. **Deferral** (QD a). A deferred candidate would be recorded in `plan.md` §3. With QA (c), none is
   deferred.
6. **The Gate gains a content line.** S10 reads the shipped content to the same value, deep-equal,
   and refuses every row it refused before.

*Judgement calls, for the owner to see:*
- #1's module is named for the glossary's Best Party, so `CONTEXT.md` gains no term. A story that
  names a new domain concept adds it in the same story.
- S9 may tag a return's events with their Quest. That changes the save's shape, so it is proved by
  `compare` and a new baseline (Q2), not by an identical fingerprint.

**Consequences.**
- The release doubles in size.
- S9 to S11 are the most separable stories, if it must be cut.
- Players may see settled wording from S7 and S8.

**Evidence.** The review's report, written outside the repository, was summarised in the epic's
§5.1. The epic's §0 table and §1 stories give the new plan.

## DL-233 — v1.1.9-S1 built: coverage, the measures, the time limits apart, and the baseline

**Status:** Accepted · **Date:** 2026-10-09 · **Decided by:** the owner ("develop as per the detailed
development plan … for the epic 1.1.9"); the measures' shape by the agent

**Context.** DL-231 asked for coverage reported but not enforced (Q5), the speed assertions in a
run apart (Q22), and one baseline that every story and the close measure against (Q6, Q17).

**Decision.**

1. **Coverage.** `@vitest/coverage-v8` 5.0.2, the same version as Vitest, is a development dependency.
   `npm run coverage` runs the suite under V8 over each package's source, without its tests or their
   support files. It writes `coverage/coverage-summary.json` with `reportOnFailure`. It runs on half
   the workers, with 120 s a test where a test sets none: with every worker, 18 tests timed out under
   V8's instrumentation, and with half, all pass in the same time.
2. **The measures.** A tool, `tools/measure` (`npm run measure`), has four commands. `coverage` gives
   coverage per package; `suite` gives a Vitest JSON report's time per project, file and test; `ci`
   gives a workflow run's jobs and billed minutes, through `gh`; and `profile` shows where a profiled
   game's time goes. `peak.mjs`, preloaded, logs each process's peak memory to `MEASURE_PEAK_LOG`.
   Its README holds the method, so that S16 measures in the same way.
3. **Time limits apart.** A test of a time limit is a `*.speed.test.ts` file. It is left out of
   `npm test` and runs in the harness's projects, through `npm run harness -- speed`, alone, at a
   close. `delivery.md`'s close says so. Two tests moved, unchanged:
   - the History's range read, under 1 ms;
   - the validator, under 50 ms.

   What each returns, and how few entries the range read reads, stay in `npm test`.
4. **The baseline.** [`v1.1.9-measures.md`](./planning/epics/v1.1.9-measures.md), beside the epic,
   holds the baseline, taken at `07ca2f2`:
   - two full runs and each project alone;
   - coverage per package;
   - five pushes' and the v1.1.8 release's CI minutes;
   - a `neutral` run, identical to v1.1.8's baseline;
   - one game's profile;
   - the game's figures.

   S16 adds the after column.

*Judgement calls, for the owner to see:*
- `harness/src/children.test.ts` ("rejects promptly", under 20 s) stays in `npm test`. It checks
  that a failing shard is not waited out behind 60 s jobs. That is behaviour, and its bound is
  three times what it needs.
- The tool is a workspace package, not a set of scripts, so that its tables are tested and the same
  at the close.
- The baseline's `neutral` report, `v1.1.9-s1-baseline`, is committed, since this entry cites it.

**Consequences.** `npm test` no longer fails on a busy machine because of a time limit. The limits
are still checked, at every close.

**Evidence.** `v1.1.9-measures.md`; `harness/reports/v1.1.9-s1-baseline-2026-10-09.md`. The epic's
S1 boxes.
Verified 2026-10-09 at `3631851`: the baseline re-read from its raw runs, its run 2 failures, tests'
times and coverage note on `tools/measure` corrected; the tool's untested sorting, cuts and
once-a-stack counts given tests, and the time limits held out of `npm test` by `speed-runs.test.ts`.

## DL-234 — v1.1.9-S2 built: the suite's structure

**Status:** Accepted · **Date:** 2026-10-09 · **Decided by:** the owner (DL-231 Q15, Q23, Q26, the
epic's S2); the groups, the stubs and the check at a test's end by the agent

**Context.** S1's baseline (DL-233) found the full run's time spent mostly in contention. The tests
that start browsers, builds and processes ran beside the rest, each slowing the other: the editor's
`cli.test.ts` took 90 s in the full run and 24 s alone. Vitest queued the projects by name, so the
page's slow files started last, and the owner's 40 pictures were the local run's tail. DL-231 asked
for those tests in a limited group with their counts cut (Q23), the owner's pictures apart (Q15), the
page's state on Node, a test-support module for the CLI, the transform cache, isolation off where
safe, and `withValid` reading only the History's new entries (Q26).

**Decision.**

1. **Two groups.** `vitest.config.ts` runs the projects in two groups, one after the other. First
   every project but three, on every worker. Then the editor's, the portrait tool's and `web-build`
   (the page's production build and bundle gate, `bundle.test.ts`), on 8 workers. Vitest 5 runs
   projects of different `maxWorkers` only in groups of their own (`sequence.groupOrder`), so the
   limited group follows the rest rather than running beside it.
2. **Longest first.** A sequencer starts, within each group, the files that took longest in the last
   run, whatever their project, and a file never run first of all. The Treasury's ledger games are
   played in a `beforeAll`, not as the file is collected, so that their time is counted.
3. **Fewer processes.**
   - The editor's "Finish" tests read the planted `npm test` in this process (`plantedTests`), but
     for the two of `cli.test.ts`'s `finish`, which run it through npm, and `recovery.test.ts`'s
     cut-off Finish.
   - The editor page's three Chromium tests share one browser, a context each, and its commands' 68
     tests are three files, `cli.test.ts`, `uses.test.ts` and `update.test.ts`, run side by side.
   - The portrait tool's scratch copies copy a template made once a file, as the editor's do (DL-164).
   - `bundle.test.ts` builds 3 pages, not 5. The refusal of `fs` and `fs/promises` is asked of the
     configuration's plugin, and `node:fs` is refused by a build, end to end.
4. **The page's state on Node.** The 20 `web/src/state/*.test.ts` say `// @vitest-environment node`,
   as the 12 top-level files do.
5. **The owner's pictures apart.** `owner.test.ts` runs only when `HEROESIM_OWNER_PICTURES` is set,
   from the folder it names; set, a folder without the 40 fails it. `docs/environment.md`, the tool's
   README and the intake and analyse skills say so.
6. **The CLI's commands.** `cli/src/context.ts` holds what every command shares: the outside world,
   the exit codes, the save opened, `say`, `refuse` and `over`. `recruit.ts` imports it, not
   `main.ts`, so the cycle is gone. `play.test-support.ts` gives the tests a scratch directory, `play`
   and the save read back. It alone imports `main.ts`, where seven test files did.
7. **Transforms and isolation.** Every project keeps its transforms in `node_modules/.vitest-cache`
   (`fsModuleCache`). `content`, `words`, `decisions` and `measure` run without isolation: their
   tests mock nothing, no module of theirs keeps state, and they passed three times both ways.
8. **`withValid`.** It reads a History from where its last check of that History left it
   (`historyFrom`, DL-34), and the World State in full. `engine/src/test-setup.ts` reads each such
   History whole at the test's end, and fails the test on any refusal the partial checks could not
   see. Where the setup is not installed, every History is read whole.

*Judgement calls, for the owner to see:*
- The ESLint boundary tests and the scans of the repository stay in the first group. They run ESLint
  in the worker, each under 7 s, and were no slower in the full run than alone.
- The harness's tests that start child processes stay in the first group: alone they total 30 s, and
  in the limited group they would lengthen its tail.
- The engine, the CLI, the harness and the page keep isolation. The CLI's portrait test mocks a
  module, the page's tests share jsdom's storage, and nothing proved the engine's or the harness's
  modules free of state.
- One group, every project on every worker and the slowest files first, ran in 91 s, faster than
  the two groups. But under its load the editor page's last Chromium test failed: it reads a control
  enabled without waiting for it. The two groups stay, and the test is unchanged, for the owner to see.
- `owner.test.ts` is skipped, not left out of the configuration, so `npm test` still counts it.
- `historyFrom` would hide a fault planted in an older entry: the next Turn's check passes it.
  So a full check stays, at each test's end, and it fails such a test (Evidence).

**Consequences.** The full run no longer waits on its slowest processes beside 31 workers, and its
tail is the limited group. A new test that starts a browser or a build belongs in that group's
projects. A test of the engine that damages an older entry of a History after `withValid` read it
fails at its end unless it repairs the entry first.

**Evidence.** The epic's S2 boxes. `validate.test.ts`'s `withValid` test plants the fault and finds
it at the end; a planted test file that passed its own body failed at its end, and was deleted. The
commit's message holds the runs' times per project and the counts.
Verified 2026-10-09 at b8d763a: the counts, the groups, the withValid check at a test's end, isolation
and the owner's pictures held, and "Finish" through npm no longer proved the lines of npm's run
passed on, now a test of `cli.test.ts`; of five full runs two failed, the words' scan of `web/src`
reading a probe file of `engine/src/boundary.test.ts` that the longest-first order now runs beside
it, and `app.test.tsx`'s 5 s limit as at the baseline, both for the owner.

## DL-235 — v1.1.9-S3 built: CI on Node 26 alone, and a deploy that tests a tree once

**Status:** Accepted · **Date:** 2026-10-09 · **Decided by:** the owner ("nothing will be released
on node 22 going forward", then option (a): raise the floor to Node 26 and drop the Node 22 job;
DL-231 Q19 a); the deploy's script by the agent

**Context.** DL-231 item 6 kept a Node 22 job, the floor, on a subset of the tests (Q18 a), and had
the deploy skip the tests on a tree already tested (Q19 a). S1's baseline found the Node 22 job
billing 9–13 of each push's 22–29 minutes, and a release running the suite and the browser specs
again on the tree its release branch had passed. Asked about the subset, the owner answered that
nothing will be released on Node 22, and chose to raise the floor.

**Decision.**

1. **The floor is Node 26.** `engines` declares `>=26`, the major of `.node-version` (`.npmrc`'s
   `engine-strict` enforces it), and the lock's root says the same. ADR-0007 takes a dated
   amendment; N8 and `docs/approach.md` read "Node 26 or later". This supersedes in part DL-231
   item 6 (record: `superseded/DL-231.md`).
2. **One `check` job.** `check.yml` has no matrix: lint, typecheck and `npm test` on
   `node-version-file: '.node-version'`, with `e2e` beside it. Testing the development version tests
   the floor, so the intent "tested rather than assumed" holds. `deploy.test.ts` holds `engines` to
   `.node-version`'s major and the job to that file.
3. **The deploy tests a tree once** (Q19 a). `web/scripts/tested.mjs <event> [commit]` decides, and
   `deploy.yml` runs `npm test` and `npm run e2e -w web` unless it wrote `run=false`. It writes
   `run=false` only when all of these hold:
   - the event is a push: release.yml's call, or a tag pushed by hand;
   - the commit is a merge, and its tree is its second parent's (`git rev-parse <a>^{tree}`), the
     release branch's tip;
   - GitHub lists a push run of `check.yml` on that tip, completed with success. That run is both
     jobs, `check` and `e2e`.

   Anything else runs them: a deploy run by hand, no second parent, another tree, git or `gh api`
   failing, or no such run. The reason goes to the log and the run's summary. Lint, typecheck, the
   build with its bundle gate (inside `npm run deploy`) and `e2e:live` always run. The deploy job
   reads with `actions: read`, which release.yml's call now grants. `docs/deploy.md` and
   `docs/environment.md` say so.

*Judgement calls, for the owner to see:*
- Every manual dispatch runs the tests, the newest tag's redeploy as well as a rollback: both are
  rare, and a redeploy usually follows a failure.
- Only a push run counts. A pull request's run tests the pull request merged into its base, not the
  tip's own tree.
- The proof is the whole workflow's run, read through the workflow-runs API (`actions: read`),
  rather than the `check` job's check run (`checks: read`), so that the browser specs count too.
- The deploy's `if` is `run != 'false'`, so a missing output runs the tests.
- Tying `engines` to `.node-version`'s major means a new development version raises the floor with
  it. Otherwise CI would stop testing the floor.
- The job's name is now `check`, not `check (node-version-file)`. The private repository has no
  branch protection to name it (the API answers that the plan lacks it).

**Consequences.** Node 22 is no longer supported. An install on an older Node is refused. A push is
estimated to bill 11–17 minutes, not 22–29: the five baseline pushes less their Node 22 job, about
10.6 minutes a push on average. A release whose tree is its tested tip skips about 748 s of its
deploy (v1.1.8's `npm test` 479 s and specs 269 s), estimated at 5 billed minutes rather than 17.
Both are measured after the owner's push.

**Evidence.** `web/src/tested.test.ts` compares trees in temporary repositories both ways: a merge
whose tree is the tested tip, and one whose `main` moved first. A dry run on this repository's
history, read-only: `v1.1.8`, `v1.1.7` and `v1.1.6` would have skipped, the first on run
37862464900 of `3f11670`; `c844dcd`, a merge with another tree, and `061c7ce`, no merge, would run
them. The epic's S3 boxes.
Verified 2026-10-09 at 99d6032: the dry run, the floor, the supersession and the minutes held, and
22 mutations of the script and the workflows went red once the script also required the run to be
check.yml's own and tests were added for unread trees, an answer listing no runs, no repository
asked nothing, and no deploy step conditional but the suite, the specs and the record.
Measured 2026-10-10 on the owner's push of `15e5833` (run 37953845586, passed): `check` 492 s
(`npm test` 407), `e2e` 302 s; 15 minutes billed a push, against 22–29 before.

## DL-236 — v1.1.9: three tests that failed under load fixed on the owner's word

**Status:** Accepted · **Date:** 2026-10-09 · **Decided by:** the owner (answers a, a, a to the three
questions, 2026-10-09)

**Context.** DL-234's verification found three tests that fail when the suite runs at full load.
The words' scan of `web/src` read a probe file that `engine/src/boundary.test.ts` had deleted. The
page's test of every view's words passed its 5 s limit. The editor page's last Chromium test read
the controls before the page had enabled them again, after the page said "Finished".

**Decision.**

1. **The scans skip the boundary probes.** `engine/src/boundary.test.ts` writes and deletes
   `boundary-probe-*` files in the `src/` of the engine, content, the CLI, the harness and the page.
   Every scan that lists one of those folders and reads what it lists now skips them, as the
   engine's, content's and the page's scans already did. These are the words' scan of the CLI and
   the page, the harness's scan for `process.env`, and the decision tool's list of the
   repository's files, which the citation and story-id checks read. Each has a test that plants a
   probe and finds it skipped.
2. **The page's test of every view's words has 30 s,** like its slow neighbours in the file.
   Splitting it by view is S13's.
3. **The editor page says how "Finish" ended only once its controls are enabled again.** It reads
   the rows, enables the controls, then shows the result. The last Chromium test checks the controls
   and the pending count at the moment the result appears, and waits for both before it asserts.
4. **The two groups stay** (DL-234). With the editor moved back into the first group, a full run
   took longer and failed two tests: `recovery.test.ts`'s Finish that is killed, and
   `app.test.tsx`'s test of every control's name, which took more than its 5 s limit.

*Judgement calls, for the owner to see:*
- The decision tool's file list is not a test, but `npm test` reads it through the citation and
  story-id checks, so it skips the probes too. The editor's register already does (`reads.ts`).
- The other scans cannot meet a probe. Either they list folders the boundary test never writes to
  (`tools/*/src`, `media/`), or they read only names (`speed-runs.test.ts`), or they already skip a
  file that has gone (`deploy.test.ts`).
- The 30 s limit uses the form its neighbours in `app.test.tsx` use, a third argument.
- `app.test.tsx`'s test of every control's name (0.5 s alone) keeps its 5 s limit. It failed only
  in the trial of one group, which was not kept; the owner may give it 30 s too.
- If the rows cannot be read again, the page does not show the result. Before, it showed the result
  and then failed to read the rows.

**Consequences.** A new scan of a package's `src/` that reads the files it lists must skip
`boundary-probe-*` files too.

**Evidence.** Each new test was red before its fix and green after: the three scans listed a
planted probe, and the Chromium test saw `#add-hero` disabled when "Finished" appeared. The commit
message holds the three full runs' times.
Verified 2026-10-10 at 0fb1bbc: the four changes are the owner's answers and nothing else; every
scan of a folder the probes reach skips them or reads names only; each skip removed, and the page's
old order restored, turned its test red; nothing fixed.

## DL-237 — v1.1.9-S4 built: the Best Party module

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner (DL-231 Q20, DL-232 QB a,
the epic's S4); the interface, the guard and the formulas' cache by the agent

**Context.** The architecture review's #1 (the epic's §5.1). `bestParty` built a new estimator on
every call. Five callers reached it and shared no work: the Rivals (through `partyFor`, a
pass-through), the policy (every Quest, again after each dispatch), the page's Board, the CLI's
board and the calibration. The baseline profile (DL-233) put the estimate at 49.0% of a game.

**Decision.**

1. **One deep module,** `engine/src/best-party.ts`. Its interface is small:
   - `bestParties(world, guild, deps)` opens it over one world and a Guild;
   - `party(quest, heroes)` names the Best Party and the estimate it was chosen by;
   - `chance(quest, heroes)` gives a Party's estimate, carrying nothing.

   Behind it: the rule, moved unchanged from `rival.ts`; the Guild's margin; each Hero brought home
   once a return night (`partyEstimator`, `estimate.ts`); and every Party weighed, keyed by what the
   estimate reads of a Quest (difficulty, length, Encounters) and the Heroes in order. The engine's
   entry exports `bestParties` and its two types. `bestParty`, `partyFor` and `questEstimator` are
   gone.
2. **Its lifetime** (QB a): one `rivalChoices` call (opened after its draw), one `automaticPolicy`
   call, one document on the page (a `WeakMap` keyed by the world, in `web/src/state/selectors.ts`),
   one board the CLI renders, and one pool or drawn Quest in the calibration. It is never
   module-global in the engine and never stored in the document.
3. **A change of world fails.** Each question compares the world's Turn, id counters and random
   streams with theirs at opening, and each Hero asked of with the world's own row. A difference
   throws a `RangeError`.
4. **The policy's reuse.** After each dispatch the policy asks again of the Heroes left, of the same
   module. A Quest whose Party lost no Hero is answered from Parties already weighed, with no new
   estimate. That is S6's memo.
5. **The formulas' cache** (Q20 b). After items 1 to 4 the profile still had the estimate on top
   (47.7%), with 38% of the game spent folding each Encounter's Checks through its pass formula. The
   estimator now reads each Encounter's formula once for each combination of its Checks' Degrees
   (`Passes`), a combination numbered in base 4. The combinations are met and summed in the same
   order as before, so every sum is the same to the last bit.
6. **`chooser`** moves to `controllers/chooser.ts`, read by the Rivals and for the Best Party's
   margin. `controller-reads.test.ts` names that file: the same one read, moved.

*Judgement calls, for the owner to see:*
- The guard reads a stamp, not the whole world. An in-place change that moves no Turn, counter or
  stream (an equip), asked of Heroes the world still holds, is not seen. The lifetimes are chosen
  so that no caller changes its world while a module is open.
- Item 5 is a cache whose key is every input of `passDegree`; the search is unchanged. Q20 (b)'s
  pruning of the search was not built: it cannot name the same Party, ties included, without
  weighing every candidate, and after item 5 the estimate is no longer on top.
- A Hero brought home later joins the world the first brought home, since each comes home of their
  own alone, as the estimator's test of a pool already held.
- The calibration's report and `docs/quests/calibration.md` name `bestParties`, and the sweep's
  report line names the Best Party. No other wording changes.
- The tests that called `partyFor` ask the module. The Rival test that compared `bestParty` with
  `partyFor`, the same code, now compares it with its own greedy reference.

**Consequences.** One game of 20 years in one process took 65.3 s, from 102.3 s. Of it:
- the estimate, 23.7% (from 49.0%);
- the Rivals' controllers, 21.8% (from 51.9%, which then counted the policy's calls of the rule,
  since it lived in `rival.ts`); their phase, 22.3% (from 42.1%);
- the policy, 11.8% (from 13.6%);
- `copyWorld`, now on top, 25.1%.

A caller that changes its world opens a new module.

**Evidence.** `engine/src/best-party.test.ts`, red before the module and again before item 5; the
page's test of one module a document. `neutral --expect` identical, alone:
`harness/reports/v1.1.9-s4-neutral-2026-10-10.md`, 274.8 s against the baseline's 413.9 s.
The epic's S4 boxes. The profiles and the doctor's readings are in the commit message.
Verified 2026-10-10 at e2aef7d: the five callers give the Best Party, chances, Rival choices,
policy, CLI board and calibration that 0fb1bbc's code gave, on 128 documents; no caller keeps a
module across an in-place change; but `rebase` makes a document of the same world under other
rules, and the page answered it by the old rules, so the page now keeps a module with the rules it
was opened under; a test holds the formulas' cache to a fold read afresh.

## DL-238 — v1.1.9-S5 built: a Guild's actions on one copy, and the save in one walk

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner (DL-231 Q2, Q14, Q20, DL-232,
the epic's S5); the interface, the refusals and the counts by the agent; ADR-0011's amendment awaits
the owner's word

**Context.** The architecture review's #2 (the epic's §5.1). `applyAction` copied the world for each
action, and the Rival phase applied its lists in a loop of its own. After DL-237, `copyWorld` was
the largest part of a game (25.1%). A save walked the document twice, once to check it JSON-safe
(`findJsonUnsafe`) and once to write it, and the play loop walked the whole document as each year
ended (`savedLength`, 5.4% of a game at the baseline).

**Decision.**

1. **One copy for a Guild's actions.** `applyActions(document, actions, deps)`, in the engine's
   entry, copies `world` once and applies the actions to the copy in order. It returns the document
   they left and each action's outcome, done with its events or refused. Under it,
   `applyGuildActions(world, actions, deps)`, not exported, applies them in place, and both adapters
   run it: `applyActions` on its copy, the Rival phase on the Turn's. The harness's play loop takes
   its policy's list through `applyActions`; the page and the CLI keep `applyAction`, a copy an
   action.
2. **A refusal changes nothing,** as every rule's contract already said (DL-30): a rule decides a
   refusal before it writes, so the next action finds the copy as the refused one did. Nothing is
   undone. The done actions' events are appended to the History an action at a time, in order,
   after the list: no rule reads the History, so that is appending after each. A list with nothing
   done gives back the document given, and an empty one copies nothing.
3. **The save in one walk.** `serialise`'s writer vouches for each value as its replacer meets the
   list or object holding it: a string, a boolean, null, a finite number but -0, or a plain list or
   object with no `toJSON`. A document it cannot vouch for (a value unsafe or not plainly safe, a
   cycle, an array-index or own `__proto__` key) is walked by `findJsonUnsafe`, which names the
   refusal as before, or finds it safe and has it written as before. The bytes and the refusals are
   the same, and the page saves through the same `serialise`.
4. **The save's length counted as it grows.** `historyLengthCounter` (`counters.ts`) keeps the
   History's length in the save, reading at each call only the entries appended since the last and,
   of the indexes, the lists of the types and entities those entries name. It follows one History
   and throws on another. As each year ends, the play loop walks the World State once (it walked it
   twice, for the save and for `observeWorld`) and adds the History so counted
   (`savedDocumentLength`).
5. The profile's `applyAction` part counts `applyActions` too.

*Judgement calls, for the owner to see:*
- **ADR-0011's amendment, for the owner's word** (Q14). The ADR carries it marked as proposed:
  "*Amended 2026-10-10 (DL-238):* a Guild's list of actions in a Turn is played on one copy of
  `world`, not on one an action. `applyActions` copies `world` once (`copyWorld`) and applies the
  list's actions to the copy in order, each through its rule. A refused action changes nothing,
  since every rule decides a refusal before it writes, and the done actions' events are appended to
  the History in order. The harness's policy acts so, and the Rival phase applies each Rival's list
  to the Turn's own copy; the page and the CLI take one action at a time through `applyAction`, a
  copy each. The write-once rows are still frozen and shared by reference, a row by the first copy
  made of a world in which it is write-once. The saved shape, the save's bytes and the fingerprints
  are unchanged."
- Validate before mutate, not an undo: a rule that wrote before refusing would now leave its write
  in the list's copy. Tests hold all twelve rules to it.
- The counter takes one fact from `append`: an entry's position joins only its type's and its
  participants' lists.
- The writer vouches for less than `findJsonUnsafe` accepts (a list with a `toJSON` of its own); such
  a document takes the old two walks, with the old bytes.

**Consequences.** The neutral run took 237.1 s, from S4's 274.8 s. One game of 20 years in one
process sampled 57.7 s, from 65.3 s. Of it:
- `copyWorld`, 24.6% (from 25.1%): 18.2% under `advance`'s copy a Turn, 6.4% under the lists';
- `applyAction` with `applyActions`, 8.4%;
- the yearly count of the save (`savedLength`), 1.0% (from 5.4% at the baseline).

A rule must refuse before it writes, now that a list's copy outlives a refused action.

**Evidence.** `engine/src/actions/actions.test.ts`, `harness/src/actions.test.ts` (three played
games, each Turn's list three ways), `engine/src/serialise-safety.test.ts` and the counter's tests in
`counters.test.ts` and `play.test.ts`, each red first. `neutral --expect` identical, alone:
`harness/reports/v1.1.9-s5-neutral-2026-10-10.md`. The epic's S5 boxes but ADR-0011's.
The profile and the doctor's readings are in the commit message.
Verified 2026-10-10 at 2ff2a7a: every rule refuses before it writes (no id, draw, move or event
before its last refusal), the Rival phase and the neutral's counters are as before, the save's
bytes and refusals are the old ones, and the count matches the walk; added a test of each rule's
late refusals, which the existing tests missed, and one of the profile's `applyAction` part.
The owner approved ADR-0011's amendment on 2026-10-10 ("2.a"), and it was made as proposed.

## DL-239 — v1.1.9-S6 built: the harness's counters declared once, and play observed

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner (DL-231 Q13, DL-232, the
epic's S6); the declaration's shape, the kinds and the moments by the agent

**Context.** The architecture review's #7 and #10 (the epic's §5.1). A counter was written in up to
six places in `sweep.ts` (1,889 lines) and `counters.ts`: its reading, its observation, its zero, its
fold, its report lines, and `notCore` or `isMeasure`. The play loop took its observations through one
`observe` call and an `afterAdvance` hook. The last year's save was gzipped on the game's thread
while the game's document was still held.

**Decision.**

1. **One declaration a counter** (`Counter`, `harness/src/counter.ts`). Each declares its key; its
   kind; how a game gives it (`read` from the History once the game stops, or `observe`, a new
   observer a game); its zero and fold (`sum`, `greatest`, `joined`, or one a field), or its
   `total` or `of` the games; and its Summary rows and its section's lines. The core's 62 are
   `gameCounters` (`game-counters.ts`). `sweepTotals` folds them and `playReport`
   (`play-report.ts`) renders them, reading nothing else; a key no counter declares is refused.
2. **The kinds:** `play`, `measure` (the save's sizes, DL-205), `timing` (the World State's copy,
   DL-203) and `module` (DL-78). `compare` lists measures apart and leaves out timings and modules';
   the module report's core is play and measure. `notCore` and `isMeasure` are gone.
3. **The play loop's moments,** told to a list of observers in play order: `created`,
   `beforeChoices`, `actionApplied`, `advanced` (with the History's length before it),
   `yearEnded` (the World State walked once however many ask, DL-238) and `ended`. Each observed
   counter's state lives in its observer; the loop's own sight (a Quest's difficulty, the
   afternoons) is one more (`seenInPlay`). The replay passes none. The Succession probe is an
   observer. `sweep.ts` (203 lines) keeps running and replay.
4. **The end of a game.** The game's document is out of reach before its save is loaded back, and
   the last year's save is gzipped with `zlib.gzip`, in its thread pool, once the load is done:
   zlib's copy of the text held through the load raised a game's peak by some 230 MB.
5. **`neutral`'s workers** are its seeds (Q13 a); `HEROESIM_WORKERS` still overrides. Rule 6 of
   `docs/agents/delivery.md` says so; the `gate` keeps 8 and its replay alone (DL-189).
6. The policy's memo (a Quest's choice kept when none of its Party was sent) is the Best Party
   module's reuse (DL-237): verified, nothing added.

*Judgement calls, for the owner to see:*
- **A fourth kind, `timing`,** so the copy's times stay out of `compare` and the module report, as
  `notCore` kept them.
- A game's record keeps two lists, `counters` (read) and `observations` (observed), as before, so
  the record's JSON and the fold's tests keep their shape.
- The census counters (Rosters, Rivals, Rankings, the Regard) are taken as the world is created and
  as each year ends, not on a year's first morning and at the end: the same Turns.
- **The totals' keys now follow the report's order:** a run's JSON lists them so, and the module
  report's rows follow it. `compare` reads by key and is unchanged.
- The Gate still reads its counters by key.
- `countGame` stays, as the declarations' readings, for the tests and the sample.
- Tests that called `observe`, `takeCensus`, `afterAdvance` or the sweep at once moved to the
  observers and `await`, keeping their assertions: `counters`, `play`, `sweep`, `gate`,
  `run-report`, `module-report`, `modules`, `calibrate`, `write-once`, `play.harness`,
  `modules.harness`. The settings test that pinned `neutral` at 8 workers now pins it at 10, its
  seeds.
- `counter.test.ts` was written with the code, not before it; it was shown red by two mutations
  (a recorded game gathering only the core's counters: 5 of 7 fail; every fold a sum: 3 of 7).
- Source lines citing a story fell from 1,788 to 1,747, comments in the old `sweep.ts` rewritten;
  `tools/decisions/story-citations.json` is not yet lowered (the agent was refused the edit).

**Consequences.** The neutral run took 215.1 s in 10 processes, from S5's 237.1 s in 8 and the
baseline's 413.9 s. Its shards peaked at 1,129 to 1,573 MB each, one game a process, with the gzip
after the load (1,106 to 1,686 MB with it beside the load; the baseline's 1,072 to 1,426 MB, one or
two games in each of 8). A counter is added by one declaration.

**Evidence.** `harness/src/counter.test.ts`; the moments' and gzip's tests in `play.test.ts`; the
workers' in `settings.test.ts`. `neutral --expect` identical, alone:
`harness/reports/v1.1.9-s6-neutral-2026-10-10.md`; `compare` with S5's: 0 moved, 505 the same, and
the Markdown the same but its timings. DL-176's "stale Parties kept" mutation fails 8 of
`policy.test.ts`'s 32 against S4's module. The epic's S6 boxes.
Verified 2026-10-10 at 7b70ab2: the claims hold (compare 0 moved, 505 the same; the replay bare and
identical; the Succession probe's report and games byte-equal to S5's over 8 seeds); one game's peak
had risen 230 MB because zlib's copy of the text was held through the load, so the gzip now starts
once the load is done (one game 1,735 to 1,509 MB; `neutral` again identical, shards 1,129 to
1,573 MB, `v1.1.9-s6v-neutral`), and the census's ended world and the probe's observer are now tested.

## DL-240 — v1.1.9-S7 built: refusals behind the Namer

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner (DL-232 QC a, the epic's S7);
the slots, the settled wording and the module's seams by the agent

**Context.** The architecture review's #5 (the epic's §5.1). A refusal was worded twice: the page's
`rejections.ts` and the CLI's `explain` functions in each command and `setupRefusalWords`, with
`requirementWords` in both. The CLI's had drifted from ui-text rule 2 ("gear, not a consumable").

**Decision.**

1. **One table** (`words/src/refusals.ts`): `refusalSentence(refusal, { world, content, calendar })`
   returns a `Sentence` for every `Refusal`, the engine's `ActionRejection`, a new game's
   `SetupRefusal` as `NewGameRejection`, and the two any play can meet, `NoPlayerGuild` and
   `GameEnded`. It is keyed by `RefusalKind`, so `tsc -b` refuses a kind without a sentence.
   `requirementWords` is the table's, and the preview's. The interface is that one function; the
   seam is the `Namer`, as the narration's (DL-186 item 1).
2. **The slots.** A Hero, a Guild, a Quest and a held Item are labelled from the world, or not.
   `CommandSlot` gains the CLI's pointers and flags (`show-roster`, `roster-holds`, `name-guild`,
   `portrait-sex` and the like); `DateSlot`, a date the CLI follows with its Turn (ui-text); and
   `EntrySlot`, a setup's entry, the CLI's `--age 51`, the page's `51`.
3. **The adapters.** The CLI's `cliNamer` and `refusalLine`, which every command, `over`, `rebase`
   and `preview` use; `new` adds the keys to choose from after an unknown Trait or Portrait. The
   page's `pageNamer` with "that Hero" for a refusal (`rejectionSentence` in `state/namer.ts`), which
   also keeps the page's own refusals: no game in hand, and a save that does not load. The CLI keeps
   its own: a save or a command line it cannot read.
4. **Gone:** `rejections.ts`, the `explain` functions, both `requirementWords`, `transfers.ts`
   (its words now the table's).

**The changed sentences** (QC a). The page's: none of 180 captured. The CLI's: 33 of 88 captured, and `new`'s own Stat:
- *Rule 2, the glossary's capitals:* "gear, not a consumable … consumables only" → "Gear, not a
  Consumable … Consumables only"; "is not gear" → "is not Gear"; "is weapon gear" → "is weapon Gear";
  "A Guildmaster's sex" → "Sex"; "in whole years" → "in whole Years"; "choose a Portrait of that sex" → "Sex".
- *Rule 4, data in a sentence:* "The game ended on Year 1 Day 1 (Turn 0): bankruptcy." → "…: The Test
  went bankrupt." (and Retirement's and a wiped Roster's), its Turn kept.
- *One wording for both front ends* (the page's, which the form shows as it is typed): `--stats sets
  every Guildmaster Stat or none; it leaves out coaching and judgement.` → "Every Guildmaster Stat is
  chosen, or none; Coaching and Judgement are not."; "A Guildmaster's Stat is 5 to 15 …" →
  "A Guildmaster's Inspiration is 5 to 15 …"; "Those Stats spend 55 Stat points and a Guildmaster has
  50 to share: …" → "Those Stats spend 55 points, and the Stat points are 50: …"; "--traits names
  miser twice." → "Miser is chosen twice."; "…; --traits names 3." → "…; 3 are chosen.";
  "--appearance is 281 characters once trimmed; …" → "The Appearance is 281 characters long; …";
  `No Guildmaster Trait is keyed "x".` → `… is called "x".` (a Hero Trait: "Scarred is not a
  Guildmaster Trait."), the choices kept; the Portrait's and `new`'s own Stat's "keyed" → "called";
  `No Guild Background "x". Choose one of: old-charter (Old charter), …` → `No Guild Background is
  called "x". Choose one of: Old charter (old-charter), …`; "--portrait gm-male-01 is a male
  Guildmaster's Portrait, and --sex is female: …" → "That Portrait is of a male Guildmaster, and your
  Guildmaster's Sex is female: …"; "save.json already plays under …" → "This game already plays under …";
  "Wilda Scarth (hero-000001)'s signing fee is 900 Wealth" → "The signing fee is 900 Wealth".
- *The CLI's Namer, its names with the id a command takes:* "quest-000001 is not on the Board" (also
  preview's) and "… needs …" → "A quiet word (quest-000001) …"; "does not hold stack-000001", "holds no
  stack-000001 to sell", "carries stack-000001" → "Whetstone (stack-000001)"; "stack-000001 holds 2" → "That stack
  of Whetstone (stack-000001) holds 2"; "is away with party-000001" → "is away with a Party
  (party-000001)"; "No Transfer Offer offer-000001 stands" → "No such Transfer Offer (offer-000001)
  stands".

*Judgement calls, for the owner to see:*
- A new game's setup is in the table, since the page's `rejections.ts` held it and the epic leaves
  the page only its own two; the CLI's flags became slots, and its sentences took the page's.
- No glossary headword: "refusal" stays a word, so player text does not capitalise it; the Action
  entry in `CONTEXT.md` says how one is worded.
- The CLI's tests that pinned a changed sentence now pin the new one, their assertions otherwise
  kept: `main.test.ts` (25 lines), `setup.test.ts` (4), `portrait.test.ts` (2), `equip`, `market` and
  `transfer.test.ts` (1 each). `transfers.test.ts` moved into `refusals.test.ts`;
  `web/src/state/rejections.test.ts` became `refusals.test.ts`, on `rejectionSentence`.
- `advance`'s own report still says "(Turn 11): bankruptcy." beside the refusal's "The Test went
  bankrupt": a reading, left to S8.

**Consequences.** A refusal kind is worded once; a front end changes only its Namer. Source lines
citing a story fell from 1,747 to 1,727, and the baseline with them.

**Evidence.** `words/src/refusals.test.ts` (every kind, its words and slots); the CLI's Namer's
refusals in `cli/src/namer.test.ts`; the page's in `web/src/state/refusals.test.ts`. Every sentence
captured before and after over 88 samples. The epic's S7 boxes.
Verified 2026-10-10 at d1d9f51: 82 kinds, one deleted failing `tsc -b`; the page's 740 refusals as
15e5833's, the CLI's 182 lines changed only as listed (a wiped Roster's added); preview's own two
refusals now the table's.

## DL-241 — v1.1.9-S8 built: readings in `words`, and the player's reading

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner (DL-232 QA c, QB a, QC a, the
epic's S8); the interface, the seams and the settled wording by the agent

**Context.** The architecture review's #4 and #8 (the epic's §5.1). `cli/src/render.ts` and
`web/src/state/selectors.ts` changed together 9 times, each reading a Hero, the Board and the pool
afresh, their words drifting (`'none'`/`'None'`). The page found the player's Guild in 39 places and
its deps in 32, `playDeps` checking the config each time. There were three row lookups.

**Decision.**

1. **Readings** (`words/src/readings.ts`): `heroReading`, `rosterReading`, `poolReading` with
   `poolNote` and `signsWords`, `boardReading` and `questReading`, and `bestPartyReading`. Each gives
   rows of words and numbers and no layout: the Stats with their Outlook, gear by slot, Skills,
   Relationships as bands, the fees and the Best Party. The seam is the layout, with two adapters:
   - the CLI's `renderHero`, `renderRoster`, `renderPool` and `renderBoard` take a reading and lay it
     out as tables;
   - the page's `heroPage`, `poolView`, `guildPage`'s Roster, the Board's cards, `bestPartyView` and
     the Roster's rows lay it out, adding only a Class's mark, where a Hero is, the actions and the
     Milestones.
2. **The player's reading** (`playerReading(document, deps)`): the world, the deps, the content, the
   calendar, the player's Guild and Guildmaster, the hint bands their Judgement reads, and
   `bestParty(quest)`, one Best Party module over the world opened at the first question (DL-237). The
   rule that the player sees what their Guildmaster sees and pays is said there once.
   - The page's adapter, `readingOf(document, given?)` in `web/src/state/reading.ts`, adds the
     narration. It keeps one reading a document while the document holds the world and the rules it
     was read from, and makes one afresh for a test's own content or config.
   - Every selector of `state/` reads it in place of `playerGuild`, `playDeps`, `calendarFor` and
     `narrationFor`. Two `calendarFor` calls stay, where a test holds that a view reads the calendar
     once. The CLI opens one reading for each `show`.
3. **`playDeps`** fills forward and checks each config once, keeping its deps by the config object,
   which no play changes in place.
4. **One row lookup**, `rowOf` in `words`; the CLI's `rowIn`, the page's `rowOf` and the refusals'
   own are gone.
5. **How a game ended** is `endedSentence`, the lead of the refusal after it. The page's header and
   the CLI's `advance` say it.

**The changed sentences** (QC a). The page's: none of 3,954 views captured over 20 documents (three
games played to Turn 2,400 by the policy, a bankrupt and an idle one, each also with no player's
Guild, some edited). The CLI's: 2,170 of 3,102 views, in eight kinds:
- *Rule 1, a cell or a value that stands alone opens with a capital, as the page writes them:*
  - `show hero`'s Outlook `promising` → `Promising` (and `modest`, `exceptional`);
  - its gear slots `weapon` → `Weapon`, and an empty slot `none` → `None`;
  - `Injury  none` → `Injury  None`;
  - a band in `show hero`'s Relationships, `show guildmaster` and `show patrons`, `neutral` →
    `Neutral`;
  - the Board's Encounters cell `combat, travel` → `Combat, travel`, `drawn on the way` → `Drawn on
    the way`.
- *One wording for both front ends:*
  - "Your best Party: Likely (60% if no one falls), A, B, C." → "…, A, B and C.";
  - `advance`'s "The game ended on Year 1 Day 41 (Turn 122): bankruptcy." → "…: The Test went
    bankrupt.";
  - "<save path> has no player's Guild." → "The save has no player's Guild.", the table's, in
    `recruit`, `show roster`, `show hall`, `show guildmaster` and `advance --until`. `show offers`
    reads its line from the table, and its words are unchanged.

*Judgement calls, for the owner to see:*
- `show guildmaster`'s and `show patrons`' bands are no reading's; they were capitalised too, so that
  the CLI writes a band one way.
- No glossary headword: "reading" is the code's word, not the player's. The rule it carries is now
  in `CONTEXT.md`'s Guildmaster entry.
- The page's selectors still take a document and derive the reading from it once. A test gives its
  own content or config to `readingOf`, or its own deps to `playerReading`.
- `show offers` with no player's Guild still writes to standard output and exits 0.
- Tests moved:
  - `heroPage`'s six tests of what a Hero is became `words/src/readings.test.ts`, with one layout test;
  - the CLI's 17 `show` checks of a Hero, the Board, the pool and a Roster (`main.test.ts` 15,
    `render.test.ts` 2) did too, with four layout tests in `render.test.ts`.
  Kept: the commands' refusals, a content key's warning, an Age under the save's own config, the
  Milestones and the actions. The pins of a settled sentence pin the new one: `main.test.ts` 9 lines,
  `equip.test.ts` 2.

**Consequences.** A new Hero field touches the reading and its layouts. Tried: a field
`enteredOnTurn` changed `readings.ts`, `render.ts` and `selectors.ts`, and the CLI's layout test's
reading. Source lines citing a story fell from 1,727 to 1,706, and the baseline with them.

**Evidence.** `words/src/readings.test.ts` (25 tests), `web/src/state/reading.test.ts` (4), the layout
tests in `cli/src/render.test.ts` and `web/src/state/selectors.test.ts`, and `main.test.ts`'s test of
the one refusal. The readings' and the page reading's tests were each red against a mutation of the
code. Every view was captured before and after. The epic's S8 boxes.
Verified 2026-10-10 at 3c798f3: over 22 documents the page's 5,287 views were the same from 7d82a02
and 82184ad, the CLI's 1,951 runs changed only as listed, and one reading and one config check served
a document. Fixed: the page's copies of the reading's Traits and Skills became `heroTraits` and
`heroSkills`; the CLI's check that `show hero` never prints Potential is back; the Skills' order tested.

## DL-242 — v1.1.9-S9 built: the History reader

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner (DL-232 QA c, the epic's S9);
the engine's reader over tagged events, the interface and the seams by the agent; `withReturn`
through the engine awaits the owner's word

**Context.** The architecture review's #9 (the epic's §5.1). `history.ts`, `quest-return.ts` and
`treasury.ts` read the History's lists themselves, 34 reads; the page size lived in `selectors.ts`;
and the page guessed which Levels and dead Heroes' gear were a return's by Hero and night
(`partOfAReturn`, `nightFrom`), which is the engine's order of its night. `withReturn`, the page's test
fixture, copies how the engine writes a return.

**Decision.**

1. **A return's entries are the engine's to say** (`engine/src/returns.ts`). `returnOf(history, key)`
   gives a return's outcome and its place, the entries naming its Quest, and the Levels of its Heroes
   and its dead's gear on its night. `nightsReturnOf(history, entry)` names the return whose night
   brought a Level or a dead Hero's gear, or none. Why they are the return's is said there, beside the
   pipeline: `levelUps` runs straight after `questsConclude` and a Hero away trains for none; a Hero
   dies only on a Quest, and `gearReturn` takes the gear back that night. Readers of the index by
   participant only; the save, the events and the narration are unchanged.
2. **The page's History reader** (`web/src/state/history-reader.ts`), the only page module that reads
   the History's entries or indexes. Its interface:
   - a Quest's return: `returnEntries` (the engine's `returnOf`), `partOfAReturn`, `awayAt`,
     `besideAReturn`;
   - a Guild's Wealth: `wealthChanges(history, guildId, changeOf)`, `foundingOf`;
   - a scope's page: `scopePositions`, kept until the History grows, `historyPage` with
     `historyPageSize`, which leaves `selectors.ts`, and the page's edges (a Party's steps stay with
     its outcome, a return's Loot, Injuries and Deaths with the return);
   - lookups: `entryAt`, `historyLength`, `newestNaming`, `namedEntities`, `newestEntries`,
     `appendedOf`.

   The seam is the reader's interface, with four adapters: the History view (`history.ts`, which keeps
   the scopes, filters, grouping, folds and lines), the Quest report and entry (`quest-return.ts`),
   the Treasury (`treasury.ts`) and the rail (`digest.ts`, through `historyEntries` and
   `besideAReturn`, no longer written twice).
3. **ADR-0008 holds:** every entry the reader gives is the History's own, never a copy; a test reads a
   frozen History through each function.
4. **The line is tested:** no page module but the reader reads `entries`, `byEntity`, `byType` or
   `milestones` of the History, read or taken apart, by the syntax of every file under `web/src`.

*Judgement calls, for the owner to see:*
- **An engine reader, not events naming their Quest** (the epic left either; DL-232's call). It puts
  the knowledge in the engine with the least churn: `schemaVersion` stays 7, no event or baseline
  changes, and `neutral --expect` is identical, so `compare` moves nothing. Tagging would have raised
  `schemaVersion`, changed every Level and gear event, and recorded a new baseline.
- `nightsReturnOf` gives a dead Hero's gear to the return they died on that night; the page took every
  `item.returned` of a Death as a part. Over the captured games the two are the same.
- **`withReturn` through the engine, for the owner.** A prototype played a return through the engine,
  `questsConclude`'s applying of a chosen resolution, then `levelUps` and `gearReturn`. Eight tests then
  fail, because they tell outcomes the engine never writes: a strong success with no Morale change
  (`quest-return.test.ts` two, `quest-report.test.tsx` one); a Death's grief at −4 where the rule is
  −10 (`quest-return.test.ts` two, `quest-report.test.tsx` one); a Morale of 40 called low, where 40 is
  Steady (one); and two Loot on one return, where the engine draws one (one). By the standing rule they
  are reported, not rewritten, so `withReturn` is as it was until the owner answers.
- No glossary headword: "the History reader" is the code's term, not the player's.
- Tests moved: `historyPageSize` and `partOfAReturn` are imported from the reader; no assertion changed.

**Consequences.** A change to how the engine writes a return's night changes `returns.ts`, and the page
follows. Source lines citing a story fell from 1,706 to 1,701, and the baseline with them.

**Evidence.** `engine/src/returns.test.ts` (Histories built by hand, and a year the engine played with
every failed Check fatal) and `web/src/state/history-reader.test.ts`, each red first. Every return,
History page, rail and ledger the page showed over 22 played documents (three seeds, one to seven
years, and their edge cases), 261,792 views, identical before and after. `neutral --expect` identical,
alone: `harness/reports/v1.1.9-s9-neutral-2026-10-10.md`; `compare` with S6's verified run: 0 moved,
505 the same. The epic's S9 boxes.
Verified 2026-10-10 at af72f08: `returnOf` and `nightsReturnOf` equal the old night walk and
`partOfAReturn` over five multi-year games (32,940 returns, every listed edge met), and the page's
views from 82184ad's sources equal today's over eleven documents (about 400,000 views); four mutants
of `returns.ts` lived (the newest outcome, the night's bound, before the outcome, the gear's cause)
and the line test missed an alias and a read by key, each now red under test; the eight `withReturn`
tests do tell outcomes the rules never write (Morale bands, −10 grief, +5 on a strong success, one Loot).

## DL-243 — v1.1.9-S10 built: content kinds, effect kinds by their fields, and content's own entry

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner (DL-232 QA c, the epic's S10);
the kinds' interface, the seams and the vocabularies by the agent

**Context.** The architecture review's #3, #11 and #12 (the epic's §5.1). A kind of content's shape,
reading and rules lay in `content-types`, `parse.ts` (1,054 lines) and `validate.ts` (1,372), which
changed together in 19 of 39 commits. A Trait's effect kind touched eight modules, and the
validator's switch over them was not exhaustive. The engine's one entry held all of content's
vocabulary.

**Decision.**

1. **A content kind in one module** (`content/src/kinds/`, one a file, the two Trait lists in one).
   Each holds its file, its fields typed against the engine's row, its defaults, and its rules with
   their refusals. A field of the engine's type that no kind reads fails to compile.
   - *Interface:* a reader, `KindReader` (`key`, `file`, `read(json, problems)`), and rules,
     `KindRules` (`key`, `check(set, problems, known)`).
   - *Seam:* `kinds/index.ts`'s two lists. `contentKinds` is keyed by the content set's places, so a
     place no kind reads fails to compile; `contentRules` follows the same order.
   - *Adapters:* the content's kinds, and a test's (`readKinds`, `validateKinds`).
   - `parse.ts` and `validate.ts` are thin drivers.
2. **Two small vocabularies, no library** (ADR-0007). `read.ts` holds the fields (text, numbers,
   choices, optional, defaults, objects, rows by key, a union by kind, a table, a file of one object)
   and the row reader, moved unchanged. `rules.ts` holds references, tags, ranges, row keys,
   weights and the keys content defines.
3. **The page carries the readers alone.** Each kind's readers and rules are separate exports, so
   the page's script holds no rule (`bundle.test.ts`). It is 830,033 bytes, 3,517 fewer.
4. **Effect kinds by their fields** (#11, `kinds/trait-effects.ts`). Each list's kinds are described
   once, keyed by the engine's union, each field by its type: kind, bounds, choices, optional where
   the engine's type is, and the editor's label.
   - The reader, the rules, the editor's forms and the editor's scan derive from it. The scan takes
     its kinds, and which share a field's name, from every kind's fields.
   - The rule has no switch over kinds: a kind described is checked, one undescribed fails to
     compile, and one named in a set built in memory is refused.
5. **Content's own entry** (#12). `@heroesim/engine/content` holds content's types, its lists, the
   bounds content checks against and `queryProblems`.
   - Content imports the engine by it alone, its tests by either entry.
   - The words and the content editor take content's names from it.
   - The main entry names only the content types a front end, the harness or the portrait tool
     takes: 503 names where it had 583.
   - ESLint bars the CLI, the page and the harness from it. `testing.test.ts` and
     `boundary.test.ts` hold both entries.
6. **Tests by kind.** `refusals.test.ts`'s 398 cases moved whole, each with its assertion, to
   `parse.test.ts`, `validate.test.ts` and a file a kind. Each builds content in memory from files
   read once (`kinds/content.test-support.ts`): 1.6 s where they took 5.8 s. `kinds.test.ts` adds a
   field to the Sphere's module alone, and reads and checks it.

*Judgement calls, for the owner to see:*
- The rules run kind by kind, in the set's order, so refusals of several kinds may list in another
  order. None of the 718 planted cases does. A Background's Station is checked by its own kind now.
- One new refusal: an effect kind no description has, in a set built in memory:
  `….effects.0.kind is "x"; it is classStatBonus, guildMoraleShift or upkeepFactor`.
- The description's labels and its "names no Encounter kind and no tag" travel into the page's
  script, about 200 bytes, as the reader reads by the description.
- The doctor's places gain `content/src/kinds/`, and the register's content-checks entry names the
  kinds' rules. AGENTS.md, `delivery.md` and `traits.md` say so.
- A glossary headword, Content kind, distinct from the content editor's kinds.

**Consequences.** A new field or rule is written in its kind's module; a new effect kind in the
engine's union and its description. Nothing changed for Traits' content; the register counts 104
reads where it counted 107, the same rules in fewer declarations, and the doctor reports no drift.
Source lines citing a story fell from 1,701 to 1,638, and the baseline with them.

**Evidence.** Commits 0e190e8 (the entry) and the kinds' commit after it. The shipped content as
`loadContent` reads it is the same before and after, key order and all. The 718 `parseContent` and
`validateContent` calls the old suite made, 581 of them refused, were replayed: each the same, its
problems in the same order, so no words change (QC a: none to list). `neutral --expect` identical,
alone: `harness/reports/v1.1.9-s10-neutral-2026-10-10.md`. The epic's S10 boxes.
Verified 2026-10-10 at 2c2981c: the shipped content, the drafts and the raw read deep-equal under
the old package and the new; 22,921 broken files and 14,081 broken sets built in memory checked by
both, every refusal kept, changed only in order across kinds (29 and 11 cases) and by the listed
refusal of an undescribed effect kind; fixed an Encounter bonus's `kinds` or `tags` null in memory,
which threw where it was refused, and pinned the editor's forms to the description.

## DL-244 — v1.1.9-S11 built: the editor's edit session

**Status:** Accepted · **Date:** 2026-10-10 · **Decided by:** the owner (DL-232 QA c, the epic's S11);
the interface, the seam and the adapters by the agent

**Context.** The architecture review's #6 (the epic's §5.1). The content editor's `Kind` had one
adapter, the Traits, and its core (`editor.ts`) held the pending edits, the checks, the journal, the
transaction, the content version's raise, the tests and the putting back. The config kind
(`config-kind.ts`) held its own copy of each of those steps but the checks.

**Decision.**

1. **One edit session** (`tools/editor/src/session.ts`, `EditSession`). Its interface: `edits()`,
   `replay(edits, held)`, `checked(edits, held)`, `hold(edits, held)`, `problems()`,
   `discard(drop?, { check })`, `recover({ force })`, `recovered` and
   `finish({ runTests, onLine, reason })`. Behind it:
   - the pending edits in `.editor/<kind>.json`, written whole or not at all, every list of them
     checked before it is saved;
   - the journal as the lock: every call refused while a "Finish" runs, and one cut off put back
     first;
   - "Finish": the edits checked again, the files written in their own layout in one transaction,
     the version raised by one with its changelog's line, the tests run, every file put back if one
     fails (`Undone`), the journal kept where a file is not (`NotUndone`), and the edits it read
     cleared.
2. **Its seam,** `SessionAdapter`: `name`, `replay(root, edits, held)`, `problems(root, working)` and
   `finishing(root, working, edits, reason)`. The last gives each file written (its text, its value
   after, and whether a row on one line stays on one), what changed, and the versioned file with why.
   The session raises the version on that file's value, and writes each file once.
3. **Two adapters.**
   - *The content files* (`contentFiles(kind, uses)`, `content-files.ts`): a content kind's row
     edits made on the content's JSON, checked with the content's checks, each changed file written
     with a row on one line kept on one, and the content version raised. *Trait uses are its
     extension:* `UseKind` (`useEntries`, `assign`, `unassign`, `update`) is split from `Kind`, and
     the adapter makes a use's edit through it, refusing one where the kind has none. `Edit` is
     `RowEdit | UseEdit`.
   - *The config file* (`configFile`, `config-kind.ts`): a setting's edit made on the file's
     sections, checked with `checkConfig`, the file written with the config version raised,
     `<version> from <why>: <setting> <was> to <value>, ….`
4. **What left:** `config-kind.ts`'s copy of the finish steps, with its guard, its pending file and
   its journal; `editor.ts`'s own. `Editor` and `ConfigEditor` are each kind's commands over the
   session: the rows and their forms' edits, and the sections and `set`.
5. **One raise of a version:** content's write module gains `raisedVersion(value, why, file)`, which
   `raiseContentVersion` and the session both use.

*Judgement calls, for the owner to see:*
- The config kind's `discard` checks nothing it leaves (`{ check: false }`), as before; the Traits'
  checks what it leaves. A check would refuse discarding one of a Min and Max pair.
- Unchanged: every command's JSON and lines, every refusal's words and the line before the tests.
  The journal now names only the files a "Finish" writes, so the content version's file is left out
  where no content file changed.
- A config "Finish" cut off is reported as "1 files are put back", as before; the words are the
  commands', left for the owner.
- `Editor.pending` went: every read is guarded now, so `traits pending` calls `edits`.
- Tests moved: `recovery.test.ts`'s two tests of `Editor.finish` (a file not put back keeps its
  journal; Ctrl+C puts the files back) are `session.test.ts`'s, for both adapters, their assertions
  kept. The commands' tests, `cli.test.ts` and `config-kind.test.ts`, are unchanged.
- A glossary headword, Edit session.

**Consequences.** Another kind of file the editor writes is an adapter: its replay, its checks and
what it writes. Source lines citing a story fell from 1,638 to 1,623, and the baseline with them.

**Evidence.** `tools/editor/src/session.test.ts`, red first: seven tests for each adapter ("Finish";
a failing test undoing it; a "Finish" cut off put back by the next call, then finished; a journal
whose process number another holds; a file not put back; Ctrl+C; the shared lock).
`content/src/write/version.test.ts`'s `raisedVersion` (2). The epic's S11 boxes.
Verified 2026-10-10 at 3ff06c2: 156 command runs, JSON and text, the same under the old editor and
the new, files and all, and every raise of either version byte for byte; of 24 mutations of the
session, 22 go red at its tests for both adapters, four of them only with the tests added, and 2
are equivalent under the lock; added three tests for each adapter (a "Finish" cut off at each step;
a refused edit not held and "Finish" checking again; `discard`'s check), and a second "Finish" and
`recover --force` to the lock's.
