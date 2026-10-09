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
