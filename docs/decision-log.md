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
