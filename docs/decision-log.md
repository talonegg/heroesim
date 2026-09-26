# Decision log

Significant decisions taken during the build, recorded before or alongside implementation.
Append a new entry; never edit an accepted one — supersede it with a later entry that names it.
Every entry says who decided: the owner, or an agent when the epic left a choice open or a
genuine contradiction forced one. Architecture decisions taken during the design session live in
[`./adr/`](./adr/) and are not repeated here.

Format: `## DL-nn — title`, then **Status**, **Date**, **Decided by**, **Context**, **Decision**,
**Consequences**.

---

## DL-01 — Session-sized increments grouped into milestones

**Status:** Accepted · **Date:** 2026-09-25 · **Decided by:** the owner

**Context.** `plan.md` §1 defines the unit of work as "a session or two", over the week-sized
increments the old `approach.md` §6 order implied. Milestones group increments into one coherent
subsystem each — the eight of the old §6, re-ordered, plus a skeleton.

**Decision.** Increments are sized to a session or two, not a week. Milestones (M0–M8) are
sequential and each has a named "done" and the harness counters it must report; increments
inside one milestone may be reordered as building teaches.

**Consequences.** Progress is tracked at increment granularity inside a milestone. The estimate
in the epics register (60–78 sessions) is stated in sessions, against no calendar.

## DL-02 — Harness and a thin CLI from M1 are the bar for working software

**Status:** Accepted · **Date:** 2026-09-25 · **Decided by:** the owner

**Context.** `plan.md` §1: "Working software at every increment... It is done when the tests
pass and, from M1-S9 onward, the harness runs and a human can drive the result from the CLI; M0
and the first M1 stories end with passing tests."

**Decision.** "Working software" means tests passing from M0 onward, and from M1-S9 onward also
a harness run and a CLI command a human can drive. The CLI starts in M1 as a handful of commands
over the engine's selectors, gaining one command per increment; it is never a separate
milestone.

**Consequences.** M0 and M1-S1 to S8 are judged by tests alone. The browser front end waits
until M7, once the engine's action set is stable.

## DL-03 — Rivals act from M2 with one trivial disposition

**Status:** Accepted · **Date:** 2026-09-25 · **Decided by:** the owner

**Context.** `plan.md` §1: "Rivals act from the loop. The Guild Generator makes Rival Guilds in
M1 and their controllers draw from the Board and the Unattached pool from M2, with one trivial
disposition... M6 adds the named dispositions and Transfers."

**Decision.** Rival controllers begin acting in M2 with a single trivial disposition (`steady`:
take the easiest affordable Quest, recruit when Wealth allows — INPUTS 4.12); named
dispositions and Transfers arrive in M6.

**Consequences.** Every rule written after M2 is designed and tuned against a Board that Rivals
actually contest (ADR-0002), not a placeholder.

## DL-04 — Module contract last in the first build

**Status:** Accepted · **Date:** 2026-09-25 · **Decided by:** the owner

**Context.** `plan.md` §1: "The Turn pipeline is built flat in M2 and given registration, state
slices and phases in M8, proved by a test-only probe module... Random Events, the first real
module, follows the first build (owner, 2026-09-25, pre-M0 review A5). ADR-0005 is amended
accordingly."

**Decision.** The Turn pipeline is flat through M2–M7. M8 retrofits registration, state slices
and phase hooks, proved by a test-only probe module that exercises every part of the contract.
Random Events, the first real module, is built after the first build completes.

**Consequences.** ADR-0005 is amended to record this timing. M8 must run the core byte-identical
to M7 with no module installed, and prove the same counters with the probe module installed.

## DL-05 — Progression before the Quest Engine before Items before Rivals

**Status:** Accepted · **Date:** 2026-09-25 · **Decided by:** the owner

**Context.** `plan.md` §2's milestone table orders M3 Progression, M4 Quest Engine, M5 Items, M6
Rivals. §1 gives the reason: "growth is the pull (principle 2), so Levels and Potential land
first and are tuned against the stub; the real Quest Engine then has Skills and Levels to read;
Items and Loot are consumed by the Quest Engine so they follow it; Transfers are the last thing
the automatic policy needs to be sensible about."

**Decision.** The build order after M2 is Progression, then the Quest Engine, then Items, then
Rivals.

**Consequences.** Hall Improvements move from M5 to M3 (pre-M0 review D8) so Wealth has a sink
while growth is tuned; each milestone's rules are built against state the previous milestone
already proved.

## DL-06 — The stub Quest Engine scores weighted Stat demands carried on the Quest template

**Status:** Accepted · **Date:** 2026-09-25 · **Decided by:** the owner

**Context.** `plan.md` §3 M2 increment 5: "Stub Quest Engine: the Party's Stats scored against
the Quest's weighted demands." This closes the assessment-method item that stood open in
`requirements.md` §5 before this plan (pre-M0 review F4).

**Decision.** The M2 stub Quest Engine scores a Party by its Stats weighted against
`[StatKey, weight][]` demands carried on the Quest template and copied to the Quest row
(pre-M0 review C1); the outcome band follows INPUTS 4.3.

**Consequences.** `requirements.md` §5 no longer lists the stub's assessment method as an open
item.

## DL-07 — `content/` exists from M1, not extracted later

**Status:** Accepted · **Date:** 2026-09-25 · **Decided by:** the owner

**Context.** `plan.md` §3 M1 increment 4: "`content/`: the twenty Hero Stats and five
Guildmaster Stats with areas and ranges, the four Classes with Stat bias, name lists,
Backgrounds; the loader with a pure entry and a Node entry; content validation at load."

**Decision.** The `content` package is built in M1, alongside the world-state types, rather than
being extracted from inline data in a later milestone.

**Consequences.** Hero Stats, Classes, name lists and Backgrounds are content files from the
first milestone that needs them; the loader's pure/Node entry split exists from the start.

## DL-08 — No timeboxed spikes; measures recorded in the first milestone that can take them

**Status:** Accepted · **Date:** 2026-09-25 · **Decided by:** the owner

**Context.** `plan.md` §1: "Measure before tune. Every milestone names the counters the harness
must report... The performance targets in `data-model.md` §7 are recorded, not chased... No
spikes. Determinism, per-Turn copy cost and History size are measured inside M1 and M2 rather
than investigated beforehand."

**Decision.** No separate timeboxed spike work is scheduled. Each performance target
(determinism, per-Turn copy cost, History size, save size) is measured inside the first
milestone that can measure it, and the number is written into this log.

**Consequences.** M1-S10 measures byte-equal determinism across 1,000 worlds; M2-S12 measures
advance cost per Turn, History entries and save size after 20 simulated years.

## DL-09 — One GitHub issue per milestone, opened lazily; git tag per milestone

**Status:** Accepted · **Date:** 2026-09-25 · **Decided by:** the owner

**Context.** `plan.md` §1: "One GitHub issue per milestone, opened when the milestone starts and
not before, carrying its increments as a checklist. A milestone completes by merging
`v1.0-dev` into `v1.0-release`, a git tag on that merge (`m1-world-state`), the issue closed, and
its status and date written in the table in §2."

**Decision.** Each milestone gets exactly one GitHub issue, opened only when the milestone
starts, carrying its increments as a checklist. A milestone completes by merging `v1.0-dev` into
`v1.0-release`, tagging that merge (e.g. `m1-world-state`), closing the issue, and recording the
status and date in `plan.md` §2.

**Consequences.** The rationale for an increment lives in `plan.md`; the day-to-day checklist
lives in the issue and is not duplicated there.

## DL-10 — Cloudflare Pages deploy is part of M7's done

**Status:** Accepted · **Date:** 2026-09-25 · **Decided by:** the owner

**Context.** `plan.md` §3 M7 increment 5: "Deployed to Cloudflare Pages; the URL recorded in the
README." INPUTS 7.8/7.9 fix the project name (`heroesims`, production branch `v1.0-release`) and
a local `npx wrangler login` with no secrets in the repository.

**Decision.** M7 (Web) is not complete until the browser front end is deployed to Cloudflare
Pages and the URL is recorded in the README; deployment is local via `npx wrangler login`, with
no CI secrets in the first build.

**Consequences.** M7's "done" line includes a live URL, not only a passing Playwright suite.

## DL-11 — CI proved to fail on a boundary break

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M0-S3, as specified by
the owner's plan)

**Context.** M0-S3's acceptance requires more than a green workflow: "A pushed commit that
breaks the boundary test turns CI red (tried once, then reverted, and the two commits named in
DL-11)."

**Decision.** Commit `378fdc7f4412baa766adb11c893a4772ac6d9f79` added
`export const r = Math.random();` to `engine/src/index.ts` and was pushed to `v1.0-dev`; CI run
[36150346701](https://github.com/talonegg/heroesim/actions/runs/36150346701) failed on
`npm run lint`, on both Node legs, with the ADR-0001 message. Commit
`a2e2b0d24340184fd1684641b6e88441baac0c15` (`git revert 378fdc7f`) removed it and was pushed; CI
run [36150443076](https://github.com/talonegg/heroesim/actions/runs/36150443076) passed on both
legs.

**Consequences.** The workflow added by M0-S3 (`.github/workflows/check.yml`) is proved to fail
on the rule it exists to enforce, not merely assumed to. M0-S3's three acceptance boxes are met.

## DL-12 — Random streams are xoshiro128\*\* seeded by cyrb128 of `seed:name`

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M1-S2), taking the epic's
proposal unchanged

**Context.** ADR-0001 puts a seeded generator's state inside the World State; ADR-0009 (as
amended 2026-09-26) gives every drawing subsystem its own stream, seeded from the master seed
and the stream's name. Neither names an algorithm, and the algorithm fixes what every seed plays.
M1-S2 proposed xoshiro128\*\* seeded through cyrb128 and reserved this entry. The v1 proof of
concept (`feature/poc:engine/src/rng.ts`) also used xoshiro128\*\*, but with one stream, FNV-1a
and splitmix32 seeding, and draws that returned a new state rather than mutating one.

**Decision.** In `engine/src/rng.ts`:

1. **Generator: xoshiro128\*\*** (Blackman and Vigna, reference implementation v1.1). A stream's
   state is its four 32-bit words as unsigned integers in a plain array, `RngState = [number,
   number, number, number]`: JSON-safe, 16 bytes a stream, period 2^128 − 1, and each step is a
   handful of 32-bit operations JavaScript does exactly with `Math.imul` and `>>> 0`. Rejected:
   `Math.random` (not seedable); 32-bit-state generators such as mulberry32 (a period of 2^32 is
   within reach of a long harness run); the 64-bit xoshiro and PCG variants (they need `BigInt`
   in JavaScript, which is slow and not JSON-safe).
2. **Seeding: cyrb128 of `${masterSeed}:${streamName}`**, bryc's 128-bit string hash, which fills
   all four words from any string and spreads similar seeds (`seed-0001`, `seed-0002`) far apart.
   A stream depends on the master seed and its own name only. A name may not be empty or contain
   `:`, so no two (seed, name) pairs hash the same text. An all-zero hash (one input in 2^128),
   which xoshiro would never leave, is replaced by a fixed constant; `next` throws on an all-zero
   state, since only a hand-written one can hold it.
3. **Draws** mutate the state in place (it lives in the per-Turn copy of `world`) and take a fixed
   number of draws whatever their arguments: `next` is a word divided by 2^32, so a fraction in
   [0, 1) with 32 bits of resolution; `int(min, max)`, inclusive, is `min + floor(next × span)`
   for spans up to 2^32, each value's chance off by less than one part in 2^32 per value;
   `pick` is one `int`; `shuffle` returns a new array by Fisher–Yates in `length − 1` draws and
   leaves its argument alone; `chance(p)` draws once even at 0 and 1, so tuning a probability
   never shifts later draws.
4. **Engine-internal.** `@heroesim/engine` exports `streamNames` and `StreamName` only; the state
   type and the draw functions are imported by engine modules from `rng.ts`, and only `rng.ts`
   and `document.ts` name the state type (a test scans `engine/src`). Front ends draw cosmetics
   from their own source (ADR-0001).
5. **Pinned by tests** (`engine/src/rng.test.ts`): xoshiro128\*\*'s reference outputs from state
   [1, 2, 3, 4] (the values Rust's `rand_xoshiro` pins from the C reference), cyrb128 of one seed,
   and the SHA-256 of a seed's first 1,000 draws; the cyrb128 transcription and the 1,000th
   state were also checked against an independent Python transcription at the time of writing.

**Consequences.** Changing the algorithm, the seeding text, or any draw function's arithmetic or
draw count changes every seed's game. The pinned tests fail first, and the change needs a new
entry superseding this one. Saves are snapshots, so games in progress continue (ADR-0001); only
replaying a seed from the start changes. Adding a stream moves no other: a milestone that
appends a name to `streamNames` gives an older save that stream, `createStreams(meta.seed,
[name])`, in its migration step. A rule needing a probability finer than 2^-32 would need a
second draw; none is foreseen. The API hides the algorithm, so a swap is one file and one entry
(the epic's risk table).

## DL-13 — Determinism measured: 1,000 worlds, each created twice, are byte-identical

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M1-S10), recording a
measure and the method that took it

**Context.** DL-08 has each performance target measured in the first milestone that can take it,
and M1-S10 is where determinism can first be measured; pre-M0 review E1 reserved this number for
it. ADR-0001 promises that a seed plays the same game, data-model rule 7 makes a save canonical
text, and pre-M0 review D10.1 has the harness pass a fixed `createdAt` so that `meta` compares.
The epic names the measure but not the method, the reports' place in Git, or the machine.

**Decision.**

1. **Method.** `npm run harness` runs `harness/src/create.harness.test.ts`. For `HEROESIM_SEEDS`
   seeds (1,000 by default, INPUTS §9) named `seed-0001` onward, it calls `createWorld(seed,
   harnessSetup, { config: { ...defaultConfig }, content: loadContent() })`, the core content
   and the default config passed explicitly, with `createdAt: "harness"`; validates, describes
   and serialises each world; then, once every world exists, creates each again and compares its
   `serialise` output with the first as a string (equal strings are equal bytes). A SHA-256 over
   every serialisation in seed order, the report's *fingerprint*, lets two runs in two processes,
   or on two machines, be compared without keeping the worlds. The run fails on any refusal, any
   mismatch, or any Hero Stat outside its content range; warnings are counted, not failed on.
   Creation time is `performance.now()` around the `createWorld` call alone.
2. **Result, 2026-09-26** (`harness/reports/m1-2026-09-26.md`, committed with this entry):
   - **1,000 of 1,000 worlds byte-identical** when created again. The validator refused none and
     warned about none.
   - Fingerprint `82c1e94e0a16a96f57eb59539dce93d97ac16b3ae7d42adab8794fd38e1b8244`, the same in
     three separate `npm run harness` processes that day: byte equality holds across processes
     as well as within one.
   - **Creation time per world: mean 0.494 ms, p99 1.131 ms** (p50 0.430, max 2.751) in the first
     pass; mean 0.426 ms, p99 0.752 ms in the second, warmed up.
   - **Total run time: 2.81 s** for the sweep (both passes, validation, serialisation and the
     report's statistics); 3.92 s wall for `npm run harness`, Vitest's start-up included.
   - The two earlier runs that day gave creation means of 0.479 and 0.618 ms, p99s of 1.099 and
     1.399 ms, and sweeps of 2.72 and 3.19 s. The machine was shared with other work, and the
     timings vary by about a quarter from run to run.
   - **Machine:** AMD Ryzen AI Max+ 395 (32 logical cores), Windows 11 (Windows_NT 10.0.26200)
     x64, Node v26.9.0, Vitest 5.0.2.
   - A world serialises to 54,348 characters on average (44,629 to 64,498) and holds 35.9 Heroes
     (28 to 44). Leading Stats average 9.5 and the others 6.5 in every Class, as DL-19 item 5
     predicts, and no Stat leaves its range.
3. **Reports in Git.** Every run writes `harness/reports/m<n>-<local date>.md`. `.gitignore`
   ignores `harness/reports/*`; the report of a milestone's run is committed with
   `git add -f`, after which Git tracks it despite the ignore line. M1's is committed here; if
   M1's tagged run writes a newer one, that one is force-added in its place.
4. **Reusable parts.** `harness/src/stats.ts` (summaries, nearest-rank percentiles),
   `report.ts` (Markdown tables, report paths, the machine), `seeds.ts` (`HEROESIM_SEEDS` and seed
   names) and `creation.ts` (`sweepCreation`, `describeWorld`, `creationReport`) are plain
   modules with ordinary tests under `npm test`, for M2-S12's play sweep to extend.
5. **`npm test` stays fast.** Without `HEROESIM_HARNESS` the `harness-run` project does not
   exist, so no `*.harness.test.ts` file is collected (`vitest list --filesOnly` lists none) and
   skipping it costs nothing. Measured the same day: `npm test` took 2.85 s wall for 475 tests;
   asking Vitest for the harness file by name without the flag exits in 0.31 to 0.43 s, finding
   no project that includes it.

**Consequences.** `createWorld` is deterministic byte for byte under the core content and
`defaultConfig`. The fingerprint pins what the first 1,000 seeds create: a change to draw order,
to content or to a generation default changes it, and the next report shows that it did (like a
change under DL-12, it changes every seed's world). Creation is not a cost worth tuning. M2-S12
measures determinism under play, one seed played twice, and data-model §7's play targets.

## DL-14 — Toolchain pins and boundary-rule choices made in M0-S1/S2

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent

**Context.** M0-S1 and M0-S2 built the workspace skeleton and the engine's lint boundary. Their
implementer reported several departures from the epic's literal text that were not separately
logged at the time; each is verified against the repository below rather than taken on trust.

**Decision.**

1. TypeScript is pinned at 6.0.3, not the current 7.0.2 (npm registry, checked 2026-09-26),
   because `typescript-eslint` 8.70.1's `peerDependencies` requires
   `typescript: ">=4.8.4 <6.1.0"` (`package-lock.json`). Vitest 5.0.2 requires `vite` as a
   non-optional peer (`"vite": { "optional": false }` on the `vitest` entry in
   `package-lock.json`); `vite` is resolved in the lockfile but is not a `devDependencies` entry
   in `package.json`.
2. `engine/**/*.ts` bans the `console` global with `no-restricted-globals` rather than
   `no-console`, because `no-console` cannot carry the custom message that names the ADR
   (ADR-0003); `no-restricted-globals` can (`eslint.config.js`).
3. `engine/**/*.ts` (source) bans every bare-specifier import (`regex: '^[^./]'`), wider than the
   epic's named list (`@heroesim/*`, `node:*`, `fs`, `path`), so any npm dependency is caught
   too. `engine/**/*.test.ts` may still import `node:*` and other npm tooling, but not
   `@heroesim/*` (`eslint.config.js`, `engineSource` and `engineTests`). `engine/tsconfig.json`
   sets `"types": ["node"]` so the tests, which read and write files, type-check, while lint
   still refuses `node:*` in the engine's own source.
4. `harness/**` is given a rule the epic did not state for it by name: like `cli`, it may import
   `engine` and `content` by package name only and may not import `web`
   (`consumerImports('harness', ['cli', 'web'])` in `eslint.config.js`).
5. The harness run is a separate `harness-run` Vitest project (`vitest.config.ts`) that exists
   only when `HEROESIM_HARNESS` is set; `harness/run.mjs` sets that variable itself via
   `spawnSync`, with no `cross-env`-style dependency, because inline `VAR=1 vitest run` syntax
   fails on Windows shells.
6. `play` currently runs `tsx cli/src/index.ts` (`package.json`); M1-S9 is expected to repoint it
   to `main.ts` once the CLI exists.
7. M1-S4 will need to allow `@heroesim/content/node` as a named exception to the subpath ban
   (`noSubpath` in `eslint.config.js`); the config already carries a comment anticipating this.

**Consequences.** Items 1–5 are built and verified in the repository as it stands
(`package.json`, `package-lock.json`, `eslint.config.js`, `engine/tsconfig.json`,
`vitest.config.ts`, `harness/run.mjs`). Items 6 and 7 are forward notes for M1-S9 and M1-S4, not
yet built.

## DL-15 — Corrections to two transcriptions in this log

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (the M0 verification pass)

**Context.** The M0 verifier compared this log with its sources and found two slips of
transcription, not of decision. The log is append-only, so they are corrected here rather than
in place.

**Decision.** (1) DL-05's quoted reason ("growth is the pull (principle 2), so Levels and
Potential land first…") is from `docs/planning/epics/README.md` §2, not `plan.md` §1. (2) Pre-M0
review E2 added three variables to INPUTS §9, not two: `HEROESIM_SEEDS`, `HEROESIM_VALIDATE` and
`HEROESIM_MODULES` (the review's table row, `git show a8973d2:docs/planning/PRE-M0-TO-ACTION.md`
line 567).

**Consequences.** DL-05 and E2 are read with these corrections. No decision changes.

## DL-16 — Engine lint forbids performance, crypto, process, timers, the global object and dynamic import

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M1-S2's implementer,
closing a gap the M0 verification found)

**Context.** ADR-0001 forbids the engine the platform's clock and random source; ADR-0007 has the
engine run unchanged in Node, in a browser and in a test, importing nothing outside itself.
M0-S2's lint enforced `Math.random`, `Date`'s clock reads, `console` and static imports. The M0
verifier found that `performance.now()`, `crypto.randomUUID()`, `crypto.getRandomValues()`,
`process.env`, `process.hrtime`, `setTimeout`, `setInterval` and dynamic `import()` all passed
lint in engine source.

**Decision.** `eslint.config.js` additionally forbids, in engine source (`engine/**/*.ts`), each
with a message naming its ADR:

1. With `no-restricted-globals`: `performance` and `crypto` (ADR-0001); `process` (ADR-0001,
   ADR-0007); `setTimeout`, `setInterval` and `setImmediate` (ADR-0001: time advances only when
   `advance` is called); and the global object's four names, `globalThis`, `global`, `window`
   and `self`, through which every forbidden global, `Math.random` included, would otherwise
   be reachable.
2. With `no-restricted-syntax`: `ImportExpression`, the dynamic `import()` (ADR-0007).

Engine tests (`engine/**/*.test.ts`) keep the bans on `Math.random`, `Date`'s clock reads and
`console`, and may use everything this entry forbids, because they time what they measure
(M1-S3, M1-S7), spawn processes (M1-S2's cross-process test) and inspect the repository.
`queueMicrotask` is left alone: it reads no clock. `engine/src/boundary.test.ts` proves each new
rule fires once in source with its ADR, and that a test file may use them.

**Consequences.** Lint guards against the accidental read; it is not a sandbox, and a deliberate
way round it (the `Function` constructor, say) is left to review. Browser globals that reach the
environment — `fetch`, `localStorage`, `navigator`, `document` — still pass lint, and they
type-check because `tsconfig.base.json` sets no `lib`, so the engine compiles against the DOM
library (`tsc -p engine --listFilesOnly` lists `lib.dom.d.ts`). Forbidding them, or narrowing
`lib` for the engine, is a later decision if a change ever reaches for one. A helper that engine
tests share but that is not itself a `*.test.ts` file is linted as source.

## DL-17 — Content file layout, schema refusals and the first content values (M1-S4)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M1-S4's implementer)

**Context.** M1-S4 left open how a content file is laid out, how the schema reports a refusal and
how duplicate keys are found in JSON, whose parser discards them. The owner's inputs leave some
values to choose: INPUTS 3.6 gives the Stat range but no `default`; R14 gives areas to Hero
Stats only; INPUTS 5.3's "weighted 2:1 toward the Class's leading Stats" does not say whether
the ratio is per Stat or in total.

**Decision.**

1. Each file is a JSON object keyed by content key, and a row does not repeat its key: the
   parser adds `key` from where the row is stored. A field the schema does not know is refused,
   so a misspelt field cannot vanish silently.
2. Both entries throw a `ContentError` rather than return a failure value. Its `problems` list
   every problem found, each naming the file or table and the key. `parseContent` checks every
   row's shape, then runs `validateContent`, so no path from text yields an unvalidated set.
3. Duplicate keys are found in each file's raw text by a scanner that tracks strings, nesting
   and commas (`content/src/duplicate-keys.ts`), before the parse discards the evidence. Keys
   are per table: one key in two tables is not a duplicate. A name repeated in a name list and a
   key listed twice in a Class's `leadingStats` or `gatedSkills` are refused too.
4. `parseContent` reads the seven files it knows by name and ignores the rest, so a glob of the
   directory (M7-S1) may pass `package.json` along with them.
5. Growth is read as a split of each Level's points: a Class's four leading Stats share two
   thirds (0.1667 each) and its sixteen other Hero Stats one third (0.0208 each). Thirds do not
   terminate as decimals, so the weights must sum to 1 within `growthSumTolerance`, 0.001.
6. Every Stat, Hero and Guildmaster alike, ranges 1–20 with `default` 10, the middle, so a Stat
   added in a later release neither cripples nor flatters a Hero saved before it (data-model
   rule 5).
7. The Guildmaster's Stats take display areas: Inspiration, Influence and Negotiation `social`;
   Coaching and Judgement `mental`.
8. `ContentSet`'s `{ id: "core", version: 1 }` are constants of the content package
   (`contentSetId`, `contentVersion`), raised when the files change.

**Consequences.** M3-S1 should draw growth points in proportion to the weights, normalising by
their sum, not treat them as exact probabilities. Items 5–7 and every name and key in `content/`
are an agent's choice, open to the owner as a content change. The `@heroesim/content/node`
exception to the subpath ban (DL-14 item 7) admits the harness and the CLI and still refuses the
web, which runs in a browser.

## DL-18 — The History's range bounds and paging, what `append` checks, and no freezing

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M1-S3)

**Context.** M1-S3 names the functions of `engine/src/history.ts` (ADR-0008, data-model §4)
but leaves open the bounds of `entriesBetween`, the meaning of `entriesFor`'s `{ from, limit }`,
how much `append` checks, and whether it freezes what it stores; the acceptance box "a test
freezes every entry after append and reads back unchanged" reads either way. `advance` (M2-S1),
the CLI's `show history` (M1-S9) and the web's Hero pages (M7) build on these contracts.

**Decision.**

1. `entriesBetween(history, fromTurn, toTurn)` is half-open, `fromTurn` included and `toTurn`
   excluded, like `Array.prototype.slice`, so consecutive ranges tile: Turn `t` alone is
   `(t, t + 1)`, Day `d` is `(3d, 3d + 3)`, year `y` is `(y × turnsPerYear, (y + 1) ×
   turnsPerYear)`. Either bound may be an infinity; an empty or reversed range returns `[]`; a
   NaN bound throws.
2. `entriesFor(history, entityId, { from = 0, limit })` returns newest first; `from` is how many
   of the newest entries to skip and `limit` the most to return (all when omitted), each a whole
   number from 0 or it throws. `{ from: 20, limit: 10 }` is the third page of ten.
3. `append` checks, before changing anything, only what its indexes and the binary search rely
   on: the type contains a dot (what `EventType` promises), each participant is an id of the
   data-model §3.1 form (what `EntityId` promises, and what the validator refuses otherwise), and
   the Turn is a whole number from 0 not below the last entry's. Because a type always has a dot
   and an id is always `<table>-<six digits>`, no index key can be a key of `Object.prototype`
   such as `__proto__` or `constructor`; the readers also look keys up with `Object.hasOwn`, so
   any string reads as absent unless indexed, in a History parsed from JSON too. The indexes stay
   ordinary `{}` objects rather than null-prototype ones, because a loaded save gives ordinary
   objects and the two must behave alike.
4. `append` does not check that the entry is JSON-safe. The validator runs on every load and,
   in tests, after every `advance` (data-model §6), and reuses `isJsonSafe`; walking every
   payload on every append would repeat that in play. For this to hold, **M1-S7's validator runs
   `isJsonSafe` over `history`**.
5. `append` stores the entry as given, neither copied nor frozen. Measured here, a deep freeze
   costs about 0.4 µs an entry against about 0.07 µs for the checks in item 3, and data-model
   §7's harness target (1,000 games of 20 years in 10 minutes) leaves about 27 µs a Turn:
   freezing ten entries a Turn would spend some 15% of it. Freezing would also guard only the
   entries appended in the running process, since `JSON.parse` and `structuredClone` return
   unfrozen copies, so a loaded game would behave unlike a new one; and it would freeze objects
   the caller still holds (the events `advance` returns are the same objects). Immutability after
   append rests instead on the module's shape and its tests: `append` is the only export that
   writes, the readers return new arrays, one test deep-freezes every entry after append and
   reads everything back unchanged, and another runs every reader on a wholly frozen History.
6. An entity listed twice among one entry's participants is indexed once; the entry itself is
   stored as given. `append` returns the new entry's position, its sequence number.

**Consequences.** Code that changes an entry after appending it, or one a reader returned,
rewrites the past for every document sharing the History, and does so silently unless a test
has frozen that entry. If such a bug turns up, freezing in `append` is a small change to weigh
against the per-Turn cost M2-S12 measures.

## DL-19 — Generator signatures, draw order and the starting world's defaults (M1-S5, M1-S6)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M1-S5 and M1-S6's
implementer)

**Context.** M1-S5 and M1-S6 name the Heroes, Guild and Patron Generators and `createWorld`, but
their signatures predate the one-`deps` convention (approach §3, epics README §4, pre-M0 review
D1): the epic writes `createWorld(content, config, seed, setup)` and `generateHero(world,
content, config, …)`. M2-S8 needs the Heroes Generator to draw from a stream its caller names
(D7). The epics leave open the base Stat draw before the Class bias, the Guildmaster's Stats, two
config defaults with no INPUTS row (`rivalStartingWealthMin/Max`, `patronCount`), how "one Hero
per Class" arises for the player without a player rule (ADR-0002), and the events' payloads.

**Decision.**

1. **Signatures follow the convention.** `createWorld(seed, setup, deps) -> { document, events }`
   with `setup = { guildmasterName, guildName, backgroundKey?, createdAt }`: `createdAt` comes
   from the caller (D10.1), and `backgroundKey` may be left out, in which case it is drawn like a
   Rival's, so a front end never draws. The generators are `generateHero(world, deps, options)`,
   `generateGuild(world, deps, options)` and `generatePatron(world, deps, options)`. Each mutates
   the `world` it is given (the one being created, or later the per-Turn copy), takes ids from
   `world.counters` through `takeId`, and returns its row and its typed events; the caller
   appends the events to the History through `append`, as `createWorld` does. M8-S1 adds
   `modules` to `deps`, not a fifth parameter to `createWorld`.
2. **The caller names the stream.** Every generator takes `stream`, a `StreamName` defaulting to
   `generation`, and draws from `world.rng[stream]` alone; `generateGuild` passes it on to its
   Roster's Heroes. M2-S8's pool refresh passes `pool`, and M2-S10's Rival replacement names
   whichever stream it owns. A stream missing from `world.rng` throws.
3. **Draws walk content in sorted key order.** Classes, Backgrounds, Spheres, Stats and Traits are
   drawn from their keys sorted by code unit, not in content's insertion order, so a seed's world
   does not change when rows in a file are reordered or a front end assembles the set another
   way. A Class's gated Skills are drawn in the list's own order, which is content.
4. **The Hero.** In draw order: sex; given name by sex; family name; Background (`owner: "hero"`);
   Class, uniform unless given; age, `int(heroStartingAgeMin, heroStartingAgeMax)`; then for each
   Hero Stat, a base `int(statBaseMin, statBaseMax)`, plus `int(statBiasMin, statBiasMax)` on the
   Class's leading Stats, clamped to the Stat's content range, and Potential `min(stat.max, base +
   int(potentialGapMin, potentialGapMax))`; then `int(startingSkillsMin, startingSkillsMax)`
   Skills (at most the gated list's length) from a shuffle of the Class's gated list, each rated
   `int(1, startingSkillRatingMax)`. `xp: 0`, `morale: moraleBaseline`, no Injury, Traits or
   Regard. `level` is 1 unless the caller gives one; a higher Level is stored as given, with no
   growth applied, until M3 has a growth rule.
5. **The base Stat draw is uniform over 3–10** (`statBaseMin/Max`, chosen). A leading Stat then
   starts at 5–14 (mean 9.5) and every other at 3–10 (mean 6.5), all inside 1–20 before the
   clamp. Potential on a leading Stat lands at 8–20, so M3's growth (INPUTS 5.3: three points a
   Level weighted 2:1, about nine or ten points on each leading Stat over twenty Levels) meets
   Potential within a typical career rather than never or at once. A Warrior's mean Strength
   exceeds a Mage's by the mean bias, 3. Uniform rather than bell-shaped because it is one draw
   and M1-S10's harness reports the spread before anything is tuned.
6. **The Guild and its Guildmaster.** The name is as given or drawn from `names.guild` among the
   names no Guild in the world already has; the Background is as given or drawn from `owner:
   "guild"`; `fame: 0`; `hall` at grade 0 for each facility; `belowFloorSince` and `foldedOnTurn`
   null; `foundedTurn` the world's Turn. The Guildmaster: sex, a name as given or drawn (given and
   family), age `int(guildmasterStartingAgeMin, guildmasterStartingAgeMax)`, each of the five
   Guildmaster Stats `int(guildmasterStatMin, guildmasterStatMax)`, **5–15, chosen** to centre on
   the Stats' middle, 10, because M4-S5's effects scale across the Stat's range; and
   `int(guildmasterTraitsMin, guildmasterTraitsMax)` Traits from a shuffle of the `owner:
   "guildmaster"` rows, none twice. Nothing excludes one Trait from another (Thrifty with
   Spendthrift is possible): content has no field for it yet.
7. **Classes on a Roster are dealt evenly**: every Class once, in shuffled order, before any
   twice. Four Heroes are therefore one per Class (INPUTS 3.3), and a Rival's four to eight are as
   balanced, by a rule every Guild shares rather than one for the player's. Nothing in
   `generateGuild` reads `controller`, so a player's and a Rival's Guild from the same seed and
   parameters differ in that field alone (tested, ADR-0002). `createWorld` deals Spheres to
   Patrons the same way.
8. **The Patron** is a name from `names.patron` among the names no Patron has, and a Sphere as
   given or uniform; no template keys are stored (D3).
9. **`createWorld`** builds `meta` (`version: config.schemaVersion`, the seed, content's `id` and
   `version`, a copy of `deps.config`, the caller's `createdAt`) and the streams, then generates
   the player's Guild from the setup with `startingRosterSize` and `startingWealth`, first, so it
   is `guild-000001`; then `rivalCount` Rivals, each drawing its Roster size `int(rivalRosterMin,
   rivalRosterMax)` and Wealth `int(rivalStartingWealthMin, rivalStartingWealthMax)` before it is
   generated, controller `{ kind: "rival", disposition: "steady" }` (INPUTS 4.12; dispositions
   become content in M2-S9); then `patronCount` Patrons; then `unattachedPoolSize` Unattached
   Heroes, Classes uniform. A blank name or a key that is not a Guild Background throws: the front
   end checks its input first.
10. **Events**, each at the world's Turn, labelled with every participant's name: `world.created`
    `{ seed }`, no participants, the first entry; `guild.founded` `{ guildId, guildmasterId }`,
    a Milestone, naming both; `guildmaster.generated` `{ guildmasterId, guildId }`, naming both;
    `hero.generated` `{ heroId, guildId, classKey }`, naming the Hero and, on a Roster, the Guild
    (data-model §4); `patron.generated` `{ patronId, sphereKey }`. Their types, and the union
    `EngineEvent` later stories add to, are in `engine/src/events.ts`.
11. **Config defaults.** From INPUTS: `startingRosterSize` 4 and `startingWealth` 500 (3.3),
    `rivalCount` 4 and `rivalRosterMin/Max` 4/8 (3.4), `heroStartingAgeMin/Max` 18/36 (3.5),
    `statBiasMin/Max` 2/4 and `potentialGapMin/Max` 3/12 (3.6), `unattachedPoolSize` 8 (3.7),
    `startingSkillsMin/Max` 1/2 and `startingSkillRatingMax` 2 (3.11), `guildmasterTraitsMin/Max`
    0/2 (3.13), `moraleBaseline` 60 (4.8), `guildmasterStartingAgeMin/Max` 30/45 (4.10). Chosen
    here: `rivalStartingWealthMin/Max` **300/700**, centred on the player's 500 so the player
    starts mid-table in Wealth; `patronCount` **12**, two for each of INPUTS 3.8's six Spheres;
    `statBaseMin/Max` **3/10** (item 5); `guildmasterStatMin/Max` **5/15** (item 6). Fields were
    added and no existing default changed, so `configVersion` stays 1.

**Consequences.** Engine tests build worlds from a fixture content set in
`engine/src/generators/test-content.ts`, because engine tests may not import
`@heroesim/content`; the core content is first exercised end to end by the CLI and the harness
(M1-S9, M1-S10). A Guild generated when every name in `names.guild` is taken throws; the core
list has thirty against five Guilds, but M2-S10's Rival replacement (D6) keeps folded Guilds'
rows and so their names, and must add names or a rule for reuse. Hero and Guildmaster names are
not unique. Any change to the draw order in items 3–9 changes every seed's world, like a change
under DL-12. M1-S6's first acceptance box, that the validator accepts what `createWorld`
returns, waits for M1-S7.

## DL-20 — What the validator checks beyond §6's table, and how a save is written and read

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M1-S7 and M1-S8)

**Context.** Data-model §6 lists what the validator refuses and warns about; rules 5 to 8 and
DL-18 item 4 add to it; M1-S7 and M1-S8 name the functions. Left open: how a failure is reported,
how a document of the wrong shape is refused without the validator throwing, what "more Parties
than the build allows" is, what a counter is compared with, how Quest template and Item keys are
checked before content has either, how the migration chain runs, and which `schemaVersion` a load
compares against.

**Decision.**

1. **Reports.** `validate(document, content)` (`engine/src/validate.ts`) returns
   `{ ok: true, warnings }` or `{ ok: false, failures }`. A failure is `{ check, id, detail }` and a
   warning `{ check, id, key, detail }`: `check` is a kebab-case name from `refusalChecks` or
   `warningChecks`, each the function of the same name in camelCase; `id` is the offending row or
   entity, or, where no row is at fault, the path of the offending value (`$.world.counters.heroes`,
   `$.history.byType["quest.resolved"]`); `key` is the unknown content key; `detail` is prose for
   a front end. Tests assert on `check`, `id` and `key`, never on `detail`. Warnings are reported
   only when nothing is refused.
2. **Shape first.** `document-shape` checks that every section, table, row and History entry is a
   plain object carrying each field of its interface with the right kind (string, number,
   integer, list, map, or nullable), and every list and map a later check walks. The field lists
   are typed `Record<keyof Row, FieldKind>`, so the compiler refuses one that drifts from
   `document.ts`. When the shape fails, only it and `json-safe` report, so no later check can throw
   on a missing field: a damaged or hand-made save is refused and never crashes a load. A field no
   interface names is kept and ignored (rule 5). Enumerated values and numeric ranges are not
   checked; §6 does not ask for them.
3. **Beyond the table's rows.** `json-safe` covers the whole document, the History included
   (rule 6, DL-18 item 4), naming the first offending path. `id-format` covers each table's keys,
   `row.id` equal to its key, Regard keys, History participants and `byEntity` keys.
   `roster-guild-mismatch` also refuses a living, unretired Hero whose Guild's Roster does not
   list them; dead and retired Heroes leave the Roster and keep `guildId` (M2-S5, M2-S6).
   `party-member-mismatch` holds `hero.partyId` and `party.heroIds` to agree, as
   `quest-party-mismatch` holds `quest.partyIds` and `party.questId`. `history-index-mismatch`
   checks each index list ascends strictly and points at entries of its entity, type or Milestone
   flag, and that the lists' lengths account for every entry (counting, linear, no rebuild).
   `history-turn-order` refuses an entry out of Turn order, before Turn 0 or after `world.turn`.
4. **Rule 8.** `passiveEntryTypes` is `['hero.generated', 'hero.left-pool']`.
   `removed-hero-in-history` refuses a Hero id absent from `world.heroes` that any other entry
   names. It is about Heroes only: Quests, Parties, offers and stacks are removed while the History
   keeps their ids, and that is not refused.
5. **Parties.** "More Parties than the build allows" is `maxPartiesPerQuest = 1`, a named constant
   and not a `GameConfig` field: it is a limit of the first build's rules, not a balance number,
   and the later "at most one per Guild" changes the check, not a value.
6. **Counters.** A counter is the next id number (`emptyDocument` starts each at 1), so
   `counter-range` refuses one that is missing, not a whole number, past 999,999, or not above the
   highest id of its table in use, among the table's own keys or in the History's `byEntity`
   keys: the next id must never repeat a removed Quest's. The last usable id is 999,998.
7. **Offers.** Expired means `expiresOnTurn < world.turn`: an offer is live through its expiry
   Turn and removed that night (M6-S2).
8. **Content keys** warn by owner: a Hero's Stats, Potential, Traits and Background must be
   content rows with `owner: "hero"`, a Guildmaster's Stats and Traits `"guildmaster"`, a Guild's
   Background `"guild"`. Quest demands, Skill keys and requirements are checked too. Quest
   template and Item keys are looked up in content tables named `questTemplates` and `items`,
   which M2-S3 and M5-S1 add to `ContentSet`; until one exists, content defines no such key and
   every one warns, as §6 says. Injury types, Dispositions, Encounters, Loot tables, slots and tags
   are not checked until their content exists.
9. **Serialisation** writes object keys in `Array.prototype.sort`'s default order (UTF-16 code
   units, the same in every JavaScript engine), arrays in their own order, scalars by
   `JSON.stringify`, and no whitespace. `serialise` throws on a document that is not JSON-safe,
   naming the path: a programming error, since the engine makes only JSON-safe documents.
10. **Loading.** `deserialise(text, deps)` never throws on its input; it refuses with a typed
    `reason` whose `kind` is `malformed-json`, `not-a-document` (no whole-number `meta.version`),
    `unsupported-version` (naming `documentVersion` and `schemaVersion`, when no chain leads from
    one to the other, including from a newer save) or `invalid` (carrying the validator's
    failures). On success it returns the validator's `warnings` beside the document, so a front
    end can show them (rule 5). `migrations[n]` turns a version-n document into version n + 1; the
    runner checks every step exists before running any, and sets `meta.version` after each, so a
    step cannot forget. `meta.config` is left alone: only `rebase` rewrites it.
11. **The version a load compares is `deps.config.schemaVersion`, and the `deps` given to
    `deserialise` carry the engine's own `defaultConfig`, not a config merged from the save.** A
    config built as `{ ...defaultConfig, ...meta.config }` carries the save's own
    `schemaVersion`, which equals its `meta.version`, and would skip every migration. Front ends
    (M1-S9, M7-S2) build that merged config for play, after the load.
12. **Test support.** `withValid(document, content, { allowWarnings })` and the fixtures (a small
    content set mirroring the real keys, with Quest template and Item tables, and `buildDocument`,
    a valid document using every table and lifecycle) are in `engine/src/world.test-support.ts`:
    not run as a test, linted as engine source (DL-16), not exported from the package. The engine's
    tests cannot load the real content (ADR-0007). `withValid` throws on a failure, and on a
    warning unless allowed, since a document the engine makes from content should hold only that
    content's keys.

**Consequences.** M2-S3 and M5-S1 should name their content tables `questTemplates` and `items`
or change the two lookups in `validate.ts`; a mismatch shows as a warning on every Quest or Item,
which `withValid` turns into a failing test. A new row field needs its kind in the validator's
field lists, which the compiler demands. A later build allowing more Parties changes
`tooManyParties`. The validator walks the History a few times, each pass linear; measured here, a
1,000-Hero world with about a thousand entries validates in about 11 ms, and M2-S12 measures a
20-year save.

## DL-21 — The CLI's command line, save files, and the selectors it reads through (M1-S9)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M1-S9's implementer)

**Context.** M1-S9 names the CLI's commands, its save location (INPUTS 3.12, §9) and how it
builds `deps.config` (data-model §2, pre-M0 review D3), and says `cli/` holds no rule. It leaves
open how the runner is shaped and tested, what a `<file>` on the command line means, what `new`
does without `--background` or over an existing save, what `save --as` and `load` write, the exit
codes, and where the numbers a view needs, such as a Hero's age, come from.

**Decision.**

1. **The runner.** `cli/src/main.ts` exports `main(argv, io)`, returning the exit code, with `io`
   the output streams, the working directory, the environment, the clock and a random source; its
   last line runs it with Node's when the file is the entry (`import.meta.main`). Tests run it in
   process against a temporary directory and real files. `play` runs `tsx cli/src/main.ts`
   (DL-14 item 6); the placeholder `cli/src/index.ts` and its test are gone, and the package
   exports `main.ts`. Output goes through `render.ts` as plain text tables.
2. **Exit codes.** 0 done; 1 refused (no save, a save that does not load, an id the save lacks, a
   save `new` would replace, a file-system error); 2 a bad command line (an unknown command, flag
   or view, a flag without its value or given twice, a missing argument, a blank name, a key that
   is not a Guild Background, a word that is not an id), printed with the usage when the command
   line does not parse, and with what is expected when a value is wrong.
3. **Save files.** `--save`, `save --as` and `load` take a `<file>`: one with no slash and no
   `.json` is a name, `<dir>/<name>.json`, where `<dir>` is `HEROESIM_SAVE_DIR` resolved against
   the working directory or else `.saves/` in it; anything else is a path from the working
   directory. `--save` defaults to `current`.
4. **Reading a save** is `openSave` in `cli/src/saves.ts`: `deserialise` with
   `deps.config = defaultConfig` (DL-20 item 11), then, only after the load, the play deps
   `{ config: { ...defaultConfig, ...meta.config }, content }`, which every view reads (a Hero's
   age uses the save's `turnsPerYear`). Content keys the content lacks print a warning and the
   save still loads (rule 5).
5. **What is written.** A command writes only when the World State it names changes: `new`
   writes the new world, `load` writes the loaded document to `--save`, `save --as` writes to its
   target; `show` only reads, since writing back what it read would change nothing. What is
   written is always `serialise` of a document that loaded or was just created, so `save --as`
   refuses to copy a save that does not load, `load` changes nothing when it refuses, and a save
   copied then loaded back is byte for byte the original (the M1 gate).
6. **`new`.** Without `--background`, the setup leaves `backgroundKey` out and `createWorld`
   draws it from the seed as it does a Rival's (DL-19 item 1), rather than the CLI taking the
   first Guild Background in content order, which would be a rule outside the engine, or
   refusing, which makes a flag the epic lists as optional compulsory. A given key must be an
   `owner: "guild"` Background; otherwise the choices are listed. Names are trimmed and a blank
   one refused, since `createWorld` throws on one. `createdAt` is the CLI's clock as an ISO
   string (D10.1), and a new world is created under `defaultConfig`. `new` refuses to replace an
   existing save unless given `--force`, a flag the epic does not list: with no prompts, a
   repeated `new` would otherwise lose a game silently. `save --as` replaces its target, since
   naming it is the request.
7. **The made-up seed** (INPUTS 3.1) is `<adjective>-<animal>-<four digits>` from two lists of
   sixteen words in `cli/src/seed.ts`, drawn with `Math.random`: 2,560,000 seeds, each readable
   and typeable. To the engine it is any string.
8. **The views.** `show` alone prints the seed, the Turn, the Guilds table and counts of Guilds,
   Heroes, Unattached Heroes, Patrons and History entries. `show history` prints the whole
   History oldest first (`entriesBetween(history, 0, Infinity)`), `show history <id>` one
   entity's entries newest first (`entriesFor`, DL-18), each row the Turn, the type, a Milestone
   mark and the participants' labels. `show roster` without an id is the player's Guild. A
   content key the content lacks is shown as the key. `show hero` shows base Stats and never
   reads `potential` (rule 9).
9. **Selectors added to the engine**, so that every number the CLI prints is a document field,
   a table's size or a selector's result: `ageOf(person, turn, config)` in `engine/src/time.ts`,
   a Hero's or Guildmaster's age in whole years, `ageAtEntry` plus the years completed since
   `enteredTurn`, rising on the Turn a year completes and throwing for a Turn before entry
   (M2-S1 adds `dayOf`, `timeOfDay` and `yearOf` beside it); and in `engine/src/selectors.ts`
   `playerGuild(world)`, `unattachedHeroes(world)` in id order, and `baseStat(values, stat)`,
   the stored value or the content's default for a Stat the row lacks (rule 5).

**Consequences.** M2-S1's `advance` command follows the same shape: open the save, act through
the play deps, write it back. A rule reading age should call `ageOf` rather than the fractional
formula in data-model §3.2, or add a selector beside it and say which it uses. The web (M7-S2)
builds its deps the same two-step way and can share the selectors. Replacing a save with `new`
needs `--force`; nothing else in the CLI asks for confirmation.

## DL-22 — One fixture module for the engine's tests

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M1-S10's implementer, at
the orchestrator's request)

**Context.** M1-S5/S6 and M1-S7/S8 were built in parallel, and each made its own test content:
`engine/src/generators/test-content.ts` (DL-19's consequences), a fresh copy per call with
`testDeps` and `testWorld`; and `engine/src/world.test-support.ts` (DL-20 item 12), a constant
with `testMeta`, `buildDocument` and `withValid`. Two content sets that drift apart would let a
generator test and a validator test disagree about what content holds.

**Decision.**

1. `engine/src/world.test-support.ts` is the one fixture module; `test-content.ts` is deleted and
   its `testDeps` and `testWorld` moved in. It stays under DL-20 item 12's terms: not a test,
   linted as engine source, not exported from the package.
2. There is one content set, `testContent`, the union of the two: every Trait and Sphere of the
   core, four Hero and three Guild Backgrounds, the generator set's name lists (long enough for
   `createWorld` under `defaultConfig`), its growth weights (two thirds shared by the leading
   Stats, DL-17 item 5), and the validator set's Quest template and Item tables. Its `id` is
   `"test"`, since it is not the core set.
3. It is a deep-frozen constant rather than a fresh copy per call: a test that changed shared
   content throws at once instead of changing another test's input, and a test that needs other
   content spreads a copy.

**Consequences.** DL-19's and DL-20's references to where the fixtures live are read with this
entry. No test's expectation changed: the generators read no Quest template or Item table, and
no validator test names a key the union adds.

## DL-23 — M1 verification corrections

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (the M1 verification pass)

**Context.** The M1 verifier found two defects, one of transcription and one of design, neither
in the built engine's rules.

**Decision.**

1. **DL-19 item 4 misstates the Stat draw order.** It reads "a base `int(statBaseMin,
   statBaseMax)`, plus `int(statBiasMin, statBiasMax)` on the Class's leading Stats", which reads
   as base drawn first, bias second. `engine/src/generators/heroes.ts`'s `drawStats` (lines
   141–142) draws the other way round:

   ```
   const bias = heroClass.leadingStats.includes(stat.key) ? int(state, config.statBiasMin, config.statBiasMax) : 0;
   const base = clamp(int(state, config.statBaseMin, config.statBaseMax) + bias, stat.min, stat.max);
   ```

   On a leading Stat, the bias is drawn first (`int(state, config.statBiasMin,
   config.statBiasMax)`), then the base (`int(state, config.statBaseMin, config.statBaseMax)`),
   which has the already-drawn bias added to it before the clamp. On a Stat that does not lead,
   no bias is drawn at all — `bias` is the literal `0` — so only the base is drawn. The true order
   per Stat is: the bias, when the Stat leads the Class (one draw), then the base (one draw), then
   the Potential gap (one draw): two draws for an ordinary Stat, three for a leading one. The
   function's own doc comment already says as much ("Two draws a Stat, three on a leading one").
   The code is correct and is **not changed**; only DL-19's prose was wrong. Changing the draw
   order would change every seed's Heroes (DL-19's own consequence), which is not wanted here —
   this entry corrects the record, not the game.
2. **`validate(document, content)` breaks the one-`deps` convention** (epics README §4): every
   other engine entry point reads `deps = { config, content, modules }`, but `validate`
   (`engine/src/validate.ts`) and the test helper `withValid`
   (`engine/src/world.test-support.ts`) took a bare `ContentSet` as their second parameter. M8's
   modules will need `deps.modules` to validate their own state slices, so both are changed to
   take `deps: EngineDeps`, reading `deps.content` where they read `content` before. Every caller
   is updated to match: `deserialise` (`engine/src/serialise.ts`), `withValid`'s own call into
   `validate`, the CLI's tests (which call `deserialise`, whose signature is unchanged, so nothing
   there needed editing), the harness (`harness/src/creation.ts` and its test), and every engine
   test that called `validate` or `withValid` with a bare content set, which now pass or build an
   `EngineDeps`.

**Consequences.** No behaviour changes: `validate` still reads only `content`, since M1 gives it
nothing else worth reading from `deps`. A later story that gives `validate` reason to read
`deps.config` or `deps.modules` needs no further signature change. DL-19 item 4 is read with this
entry's correction; DL-19 itself is not edited, and neither is DL-20 (item 1 names
`validate(document, content)`, item 12 `withValid(document, content, …)`), per this log's
append-only rule — both are read with this correction instead.

## DL-24 — `advance`, the Turn pipeline, `emit`, actions and `rebase` (M2-S1, M2-S2)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M2-S1 and M2-S2's
implementer)

**Context.** M2-S1 and M2-S2 name `advance`, `rebase`, the `Action` union, the time selectors,
the pipeline and its `emit`, and lay the ground every later M2 story builds on. They leave open
which Turn's phases `advance` runs and how Days and Years are counted; where the phases live
before their stories fill them; what `emit` labels and when it refuses; the shapes of
`StopReason`, a rejection and `ActionResult`; how `rebase` treats `meta` and a config field the
new rules lack; and the CLI's `advance` and `rebase`.

**Decision.**

1. **Time.** Turn 0, where `createWorld` leaves a world, is the morning of Day 0 in Year 0: Day,
   time of day and Year count from 0, as the Turn does (`dayOf`, `timeOfDay`, `yearOf` and
   `nightOf(day)` in `engine/src/time.ts`, each throwing on a value that is not a whole number
   from 0). `advance` increments the Turn and then runs the phases of the *new* Turn's time of
   day, so the first `advance` plays the afternoon of Day 0 and Turn 0's morning phases never
   run. Three Turns a Day is `turnsPerDay`, the length of `timesOfDay`: the calendar, not a
   balance number, so not a `GameConfig` field.
2. **The pipeline.** `phases` in `engine/src/pipeline.ts` is a literal list of `{ name,
   timeOfDay, run }`, and each `run` is in a file of its own under `engine/src/phases/`, declared
   now as a stub that changes nothing and returns no events: morning `boardRefresh` (M2-S3),
   `marketRefresh` (M5-S4); afternoon `rivalControllers` (M2-S9), `questsAdvance` (M4); night
   `questsConclude` (M2-S5), `heroState` (M2-S6), `guildState` (M2-S7), `poolRefresh` (M2-S8),
   `endings` (M2-S10). `marketRefresh` is declared before M5 because approach §2 lists it; the
   module hook positions are M8's. `runTurn` returns the phases' events in the order they ran,
   and `advance` appends them once the whole Turn has run, so a phase reads the World State,
   never the History, for what happened earlier in the same Turn.
3. **`emit`** (`engine/src/emit.ts`; `ctx.emit` in a phase, `eventEmitter(world)` in an action)
   completes a draft `{ type, participants, payload }`: `turn` is `world.turn`; the participants
   keep their order, each once, followed by the Guild of each Hero among them who has one and
   whose Guild is not listed; `labels` hold the `name` of each participant whose row has one
   (Guild, Guildmaster, Hero, Patron), while a row with no name of its own (Quest, Party, offer,
   Item, stack) gets no label and a front end shows its id, until content gives it a name;
   `milestone` is `milestoneTypes[type]`, a record keyed by every `EngineEventType`, so the
   compiler refuses an event type added without its flag. `emit` throws on a participant that is
   not an id or whose row is not in the world: a rule emits before it removes a row. It makes the
   event; appending it is the caller's.
4. **Stops.** `StopReason` is `{ kind }` over `party-returned`, `ended`, `decision-needed`,
   `max-turns` and `pool-refreshed`, with no fields until M2-S11 needs some. `advance` on a world
   whose `ended` is set returns the same document object, no events and `{ kind: 'ended' }`; it
   reports `ended` too for the Turn whose phases set `world.ended`, and nothing else yet.
5. **Actions.** `Action` (`engine/src/actions/action.ts`) is a union on `kind`, only `{ kind:
   'rebase' }` so far, and `applyAction(document, action, deps)` switches over it exhaustively.
   Each action's file defines its action and its rejection; a story adding an action adds both to
   the unions and a case to the switch. A rejection is `{ action, reason, …what the reason names
   }`, data and no prose (ADR-0003), naming its action so two actions' reasons never collide;
   `ActionResult<R>` is `{ ok: true, document, events } | { ok: false, rejection: R }`.
6. **`rebase(document, deps)`** refuses `already-current`, carrying the version, when
   `meta.config.configVersion` equals `deps.config.configVersion`, and only then: a lower version
   in `deps` is adopted as a higher one is. It returns a new `meta` whose `config` is a copy of
   `deps.config`, whole (a field the save had and `deps.config` lacks is dropped: `rebase`
   rewrites, it does not merge), and never writes to the old `meta`, which the documents of
   earlier Turns share. `world` does not change and is shared, like `history`.
   `world.rules-adopted` is a Milestone at `world.turn` naming no participant, the rules being the
   whole world's, with payload `{ oldConfigVersion, newConfigVersion }`.
7. **The CLI.** `advance [--turns n]`, `n` a whole number from 1 and 1 by default, plays under
   the play deps `openSave` builds, stops early when the game ends, writes the save and prints the
   Turns played, where time stands and the events; on a game already ended it refuses (exit 1)
   and writes nothing. `rebase` passes `{ config: defaultConfig, content }`, never the play deps:
   their config is the save's own, carrying its `configVersion`, under which every save would be
   `already-current`. `already-current` exits 1 and writes nothing. `show`'s first line and
   `advance`'s output print `Turn t (Day d, <time of day>, Year y)` from the engine's selectors,
   the Year under the save's own `turnsPerYear`.

**Consequences.** The Board is empty at Turn 0 and first refills on Turn 3, the morning of Day 1,
unless M2-S3 has `createWorld` draw one: that is M2-S3's call. Filling a phase changes only its
file; adding one (M3's `training` and `ageing`, M6's `transfers`) is a line in `phases` and in
the literal `pipeline.test.ts` holds it to. The generators still set `milestone` by hand; a test
holds what `createWorld` emits to `milestoneTypes`. An action that changes `world` (M2-S4's
`dispatch`, M2-S8's `recruit`) copies it first, as `advance` does, since documents share it.
M2-S11 gives a `StopReason` fields if it needs them, and makes `advance` detect the other
reasons; until then the CLI's `advance` stops early only on `ended`. No `GameConfig` field was
added and no default changed, so `configVersion` stays 1.

## DL-25 — Quest templates, the Board and its first draw, streams for old saves, and dispatch (M2-S3, M2-S4)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M2-S3 and M2-S4's
implementer)

**Context.** M2-S3 names the template's fields, the Quest Generator, the morning's Board refresh
and three config fields; M2-S4 names `dispatch` and its rejections. They leave open which of the
Quest's ranges are content and which config; how difficulty, duration and reward are drawn; when
an offer expires; how Patrons are weighted, given that R22 weights them by Regard for *the*
Guild while every Guild draws from one Board; whether `createWorld` draws the first Board (DL-24's
consequences: otherwise a new game opens on an empty Board until Turn 3); how a save made before
the `board` stream plays on (the text requires M1 saves to keep working); the events' payloads;
the order and shape of dispatch's rejections and what it throws on; and the CLI's `show board`
and `dispatch`.

**Decision.**

1. **Twelve templates**, `content/quest-templates.json`, content table `questTemplates` (DL-20),
   each naming one Sphere, so two to a Sphere: Crown `clear-the-barrow`, `hold-the-border-fort`;
   Church `escort-the-tithe`, `lay-the-restless-dead`; Merchants `guard-the-caravan`,
   `recover-the-strongbox`; Villages `the-beast-of-the-fells`, `the-sickness-at-the-mill`;
   Scholars `survey-the-old-workings`, `break-the-sealed-vault`; Underworld `a-quiet-word`,
   `the-counting-house-job`. Three require a Class (Warrior, Healer, Mage) and one a Skill
   (Lockpicking), so most of the Board is open to any Party. Tags come from the v1 proof of
   concept's controlled vocabulary (`escort`, `wilds`, `town`, `talk`, `fight`, `delve`, `dark`,
   `water`, `guard`, `recover`, `hunt`); no rule reads them yet. `parseContent` reads the file as
   the eighth it knows by name (DL-17 item 4). `contentVersion`, and so a new world's
   `meta.content.version`, is 2.
2. **Content validation** refuses a template whose demands are empty, name anything but a Hero
   Stat, repeat a Stat, weigh one at 0 or less, or sum further than `demandSumTolerance`, 0.001,
   from 1 (written by hand, like growth weights, DL-17 item 5); whose `sphereKeys`, `skillKeys`
   or `requires` name a key content lacks; whose difficulty, Day or Party-size range is upside
   down or starts below 1; whose `rewardPerDifficulty` or `fameEffect` is negative; whose tag is
   not kebab-case or is listed twice; whose `requires` has any field but `classKey` and
   `skillKey`; or whose `lootTableKey` is not null. It also refuses a Sphere that no template
   names, since its Patrons would offer nothing.
3. **Which ranges are content.** INPUTS 4.2 says durations and rewards are per template, so they
   are content: a template carries its Day range and a `rewardPerDifficulty`, and content tests,
   not rules, hold the shipped twelve to 2–10 Days, a reward of 40–400 Wealth and a Fame effect of
   1–5. The config holds the difficulty scale, `questDifficultyMin/Max` (INPUTS 4.3): a template's
   difficulty range is clamped into it before the draw, so a template wholly outside the scale
   draws its nearer bound. `fameEffect` is copied as a magnitude; M2-S5 gives it its sign by band.
4. **The Quest Generator**, `generateQuest(world, patron, deps, { stream = 'board', templateKey?
   })` in `engine/src/generators/quests.ts`, draws in this order: the template, uniformly among
   those whose `sphereKeys` hold the Patron's Sphere, in key order (no draw when one is given);
   the difficulty, `int` over the clamped range; the Days, `int` over the template's range. It
   stores `durationTurns = Days × 3`, `reward = Math.round(difficulty × rewardPerDifficulty)`,
   `requirements` as the template's Party sizes plus its `requires` keys where present, and
   copies of the demands, tags and Skill keys, sharing nothing with content. It adds the row and
   appends its id to the Board, since an offered Quest is on the Board by definition, and returns
   `quest.offered`. It throws on a programming error: a Patron not in the world, a Sphere no
   template serves, a template that is not the Patron's, a missing stream.
5. **Offer and expiry.** A Quest offered on Day d has `expiresOnTurn = nightOf(d + questOfferDays
   − 1)`: it is on offer through that night, and the next morning's refresh expires it
   (`expiresOnTurn < turn`), which is how DL-20 item 7 reads an offer's expiry. With the defaults
   a Quest drawn on the morning of Day 0 is on offer on Days 0, 1 and 2 and expires on the
   morning of Day 3, `questOfferDays` later. Only offered Quests on the Board expire; a taken
   Quest's `expiresOnTurn` is never read again.
6. **The refresh**, `boardRefresh` in `engine/src/phases/board-refresh.ts`: first each expired
   Quest emits `quest.expired` and its row is removed (the History keeps its record; the
   validator's rule-8 check is about Heroes, DL-20 item 4), the Board keeping the order of what
   stays; then Quests are drawn until the Board holds `boardSize`, and a Board already that full
   (after `boardSize` is lowered) draws nothing and loses nothing. Each Quest's Patron is one draw,
   uniform among the Patrons, in id order, whose Sphere some template serves, then the
   generator's draws, all from `board`. **R22 is simplified**: Patrons are weighted uniformly, not
   by Regard, until M4 gives Regard its rules and M4-S5 weights by the mean across Guilds. The
   same template may be on the Board twice.
7. **The first Board.** `createWorld` runs `boardRefresh` last, at Turn 0, so a new game opens on
   a full Board; Turn 0's morning phases never run in `advance` (DL-24 item 1). Every draw before
   it is unchanged, since it draws from `board` alone, so a seed's Guilds, Heroes and Patrons are
   what they were. The document does gain six Quests, their `quest.offered` entries and a `board`
   stream, so the M1 creation sweep's fingerprint (DL-13's harness report) is no longer what a run
   prints. That fingerprint measured M1; it is not a contract, and DL-13's result, two creations
   byte-identical, stands.
8. **Streams for old saves.** `ensureStreams(world, seed)` in `engine/src/rng.ts` gives a world
   each core stream it lacks, seeded as `createStreams(seed, [name])` seeds a new world's, and
   moves none it has; `advance` calls it on its copy with `meta.seed` before the pipeline. An M1
   save (no `board` stream, an empty Board, `meta.content.version` 1) loads unchanged, and on its
   next morning fills its Board exactly as a world created now with an empty first Board would.
   No migration is needed; DL-12's consequence, which gave an old save a new stream "in its
   migration step", is read with this. Every later stream (M2-S5 `quests`, M2-S8 `pool`, M2-S9
   `rivals`) reaches old saves the same way by being appended to `streamNames`.
9. **Events.** `quest.offered` and `quest.expired`, neither a Milestone, name the Quest and its
   Patron, with payload `{ questId, patronId, templateKey }`: the template's key lets a front end
   name a Quest whose row is gone, since a Quest has no name of its own and `emit` labels only
   named rows (DL-24 item 3).
10. **Config.** `boardSize` 6 and `questOfferDays` 3 (INPUTS 4.1); `questDifficultyMin/Max` 10/100
    (INPUTS 4.3). Fields were added and no default changed, so `configVersion` stays 1.
11. **The CLI's `show board`** lists the Quests in the Board's order, each with its template's
    name, its Patron, difficulty, Days (`durationDaysOf`, a selector added to `time.ts`), reward,
    Fame, Party size, required Class or Skill, and the last Day it is on offer; then each Quest's
    weighted demands and the Skills that help.
12. **Dispatch's checks, in order.** `dispatch(document, { guildId, questId, heroIds }, deps)` in
    `engine/src/actions/dispatch.ts` rejects on the first check that fails: the Quest is offered
    and on the Board (`quest-not-offered`, naming it; taken, expired, resolved and never offered
    read alike); then each Hero, in the order given, is the Guild's (`hero-not-on-roster`, naming
    the Hero and the Guild: another Guild's, Unattached, or no row at all) and free to go
    (`hero-unavailable`, whose `because` is `dead`, `retired`, `injured` or `in-party`); then the
    Party's size is within the Quest's bounds (`party-size`, naming `size`, `partySizeMin` and
    `partySizeMax`); then some Hero in the Party is of the required Class and some holds the
    required Skill, at any rating (`requirement-unmet`, whose `unmet` names whichever of
    `classKey` and `skillKey` the Party lacks). Death and Retirement are checked before the Roster,
    since a dead or retired Hero has left it and keeps `guildId` (DL-20 item 3), so they read as
    unavailable rather than as strangers. Retirement is not in the epic's list; it is Death's case.
    M4-S5 gives `requirement-unmet` its own reason field on top of this shape.
13. **Programming errors throw** rather than reject: a Guild not in the world, and a Hero named
    twice. The CLI refuses a repeated Hero, and a word without an id's form, as a bad command line
    before it calls.
14. **On success** `dispatch` copies `world` (DL-24's consequences), adds a `parties` row
    departing this Turn with `returnsOnTurn = nightOf(dayOf(turn) + durationDaysOf(quest))`, a
    night whichever Turn of the Day it left in (pre-M0 review C4); sets the Quest `taken`, lists
    the Party in `partyIds` and takes it off the Board; sets each Hero's `partyId`; and appends and
    returns `quest.taken`, not a Milestone, naming the Quest, the Party, each Hero, the Guild and
    the Patron, with payload `{ questId, partyId, guildId, heroIds, returnsOnTurn }`. `meta` and
    `history` are shared, as `advance` shares them. `deps` is taken, as by every entry point, and
    read by no rule of dispatch until M4-S5's Negotiation scales the reward. `dispatch` joins the
    `Action` union and `applyAction`. The afternoon's `questsAdvance` stays a no-op.
15. **The CLI's `dispatch --quest <id> --heroes <id,id>`** sends Heroes of the player's Guild and
    prints the Party, the Quest's template name, its length in Days and the night it returns
    (Day and Turn), then after every dispatch: "Rivals take Quests from the Board each afternoon: a
    Quest left on it may be gone by then." A rejection is put into words, exits 1 and writes
    nothing. The command's logic is `cli/src/commands/dispatch.ts`, which returns an outcome;
    `main.ts` registers it through a new `act`, which opens the save, applies a command's change
    under the save's deps, and writes and prints, or refuses, for M2-S8's `recruit` to share.
16. **M2-S4's last box is half proved.** A test dispatches in each of the three Turns of three
    Days and finds `returnsOnTurn` on the night of Day d + k each time. That the Heroes are
    dispatchable again on the morning of Day d + k + 1 needs M2-S5's `questsConclude` to bring the
    Party back, so the box stays unticked until then. The test that a dispatched Hero cannot go
    again checks every Turn before `returnsOnTurn`; that night itself is M2-S5's.

**Consequences.** A template changed in content reaches only Quests drawn after the change
(data-model §3.2). The shipped templates' ranges are INPUTS values held in content, so tuning
them is a content change with a `contentVersion` bump rather than a `configVersion` one; only the
difficulty scale, the Board's size and the offer's length are config. M2-S5 reads `fameEffect` as
a magnitude and `durationDaysOf` for a Quest's Days, and frees the Party's Heroes by clearing
their `partyId` when it removes the Party; a taken Quest's `expiresOnTurn` is never read again, so
it cannot expire under a Party. M2-S9's Rival controller and M2-S12's policy produce `dispatch`
actions and meet the same rejections. M4-S5 replaces the uniform Patron draw with Regard weights,
changing what every seed's Board draws from Day 1.

## DL-26 — Which Day is an Upkeep Day, and what the Guild State Engine leaves silent (M2-S7)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M2-S7's implementer)

**Context.** M2-the-loop.md says Upkeep falls "on every `upkeepEveryDays`th Day" without saying
which Days those are numerically, and describes the Bankruptcy floor and the Fame floor without
saying whether they act only on an Upkeep Day or every night.

**Decision.**

1. **The Upkeep Day.** `dayOf(turn) % config.upkeepEveryDays === config.upkeepEveryDays - 1`:
   under `upkeepEveryDays` 10, Days 9, 19, 29, … Days count from 0 (DL-24), so the "10th Day" is
   Day index 9, the same ordinal reading DL-24 already gives Turn and Day; Upkeep then falls once
   every ten Days have completed, not after eleven. `upkeepEveryDays` 1 charges Upkeep every
   night, which the formula gives without a special case.
2. **The Bankruptcy floor and the Fame floor act every night, not only on an Upkeep Day.**
   Wealth can cross `bankruptcyFloor` on a night that is not an Upkeep Day (a Quest reward, a
   future purchase), and Fame moves on Quest outcomes any night, so `guildState` checks
   `belowFloorSince` and clamps Fame every night it runs, for every non-folded Guild, whether or
   not Upkeep is deducted that night.
3. **No event for the floor or the Fame clamp.** The story names one event, `guild.upkeep-paid`,
   for the Upkeep deduction; `belowFloorSince` moving and Fame being clamped stay silent state
   changes, like Morale's nightly drift (data-model rule 10), not Milestones. `belowFloorSince`
   itself is the record a front end or a later story (M2-S10's Bankruptcy ending) reads; nothing
   is lost by not also logging its change as an entry.
4. **A folded Guild is skipped whole**, before Upkeep, the floor check or the Fame clamp, per
   the M2 shared context's rule that every per-Guild loop skips a folded Guild now, ahead of
   M2-S10 setting `foldedOnTurn`.

**Consequences.** `engine/src/phases/guild-state.ts` and its tests fix Day 9 (not Day 10) as the
first Upkeep Day under the default `upkeepEveryDays`. `bankruptcyGraceDays` is defined as a
`GameConfig` field here but read by no rule until M2-S10's ending.

## DL-27 — Recruitment, the signing fee, and the Unattached pool's lifecycle (M2-S8)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M2-S8's implementer)

**Context.** M2-S8 names `recruit`, the `signingFee(hero, config)` selector (INPUTS 4.7), the
night phase `poolRefresh`, rule 8's removal of a Hero who leaves the pool, and four config
fields. It leaves open: the selector's inputs and rounding, and whether it takes the buying Guild
before M4-S5 scales the fee by that Guild's Negotiation; what `recruit` does with a folded or
unknown Guild, or a Hero id with no row; how the pool knows when a Hero entered it, since a Hero
released into it later (M2-S10's folds, M6) did not enter at `enteredTurn`; what becomes of a
Hero who leaves while an entry keeps their row, who would otherwise still read as Unattached and
leave again every night; how a phase reads the History; `unattachedStayDays`' default; the
events' payloads; and the CLI.

**Decision.**

1. **Two Hero fields, and the first schema step.** `unattachedSince: Turn | null` is the Turn the
   Hero last entered the Unattached pool (generated into it; from M2-S10, released into it), null
   on a Roster and once they have left the pool. `leftPoolOnTurn: Turn | null` is set when a Hero
   leaves the pool unrecruited and a History entry keeps their row (rule 8): such a Hero is on no
   Roster and in no pool, out of play as a dead or retired Hero is. The pool is the Heroes whose
   `unattachedSince` is set (`unattachedHeroes`). Stored, not read from the History, because a
   phase reads the World State and not the History for what happened earlier in its Turn (DL-24
   item 2): a Hero released by an earlier night phase would read as having entered at an older
   entry and leave that same night. And every pool reader but this phase, M2-S9's
   `rivalChoices(world, guild, deps)` among them, has the world and not the History.
   `schemaVersion` becomes **2**, and `migrations[1]` adds both fields to a version-1 save:
   `unattachedSince` is `enteredTurn` for a living, unretired Hero with no Guild (in a version-1
   world only generation puts a Hero in the pool) and null for every other Hero; `leftPoolOnTurn`
   is null. `configVersion` stays 1: `schemaVersion` is the format the engine writes, read by
   `createWorld` and by a load against `defaultConfig`, never by a rule, so no game plays
   differently, and a version bump would tell every save that new rules await a `rebase` that
   changes nothing a rule reads. The validator's new check `unattached-mismatch` refuses a Hero
   on a Roster's Guild with either field set, and a Hero with no Guild who is both in the pool and
   gone (left, dead or retired), or neither.
2. **When a Hero leaves.** On the night of Day `dayOf(unattachedSince) + unattachedStayDays`,
   in the pool refresh, and not before: a Hero who enters on Day d, almost always at night since
   the refill is at night (INPUTS 3.7), is in the pool for the next `unattachedStayDays` Days.
   `unattachedStayDays` is **10**, chosen: as long as the longest Quest (INPUTS 4.2, 2–10 Days),
   so a Party that sets out the Day a Hero enters is home before the Hero goes, and one upkeep
   cycle (INPUTS 4.6); with a pool of 8 about one Hero leaves a night. Heroes leave in id order,
   each with `hero.left-pool`, payload `{ heroId }`, not a Milestone, emitted before the row
   changes so its label is the Hero's name.
3. **Rule 8 reads the History.** `PhaseContext` gains `history`, the History as it stood before
   the Turn, for reading: `advance` passes the document's, and `append` stays its one writer
   (ADR-0008). `phaseContext`'s new third parameter defaults to an empty History, so a test of a
   phase that reads none (M2-S3's, M2-S4's, M2-S7's) builds its context as before. A leaving Hero's row is removed when every position in `byEntity[heroId]` is an
   entry whose type is in `passiveEntryTypes`, the validator's list (DL-20 item 4), imported
   rather than repeated; otherwise the row stays with `unattachedSince` null and `leftPoolOnTurn`
   set. The Hero's own `hero.left-pool` is passive, so it never keeps a row. An entry naming a
   pool Hero made by a night phase before `poolRefresh` in the same Turn is not yet in the
   History and would be missed; no M2 phase makes one, and the validator after an `advance` in
   the tests refuses the removed row if a later one does.
4. **The refill** generates `unattachedPoolSize` less the pool's size, after the departures, so
   a Hero who leaves is replaced the same night. Each is drawn by the Heroes Generator from the
   `pool` stream (D7; `pool` is appended to `streamNames`), Class uniform, and emits its own
   `hero.generated`. `pool` is the only stream the phase moves.
5. **`signingFee(hero, deps)`** (`selectors.ts`) is `floor(signingFeeBase + signingFeePerLevel ×
   level + Σ Stats ÷ signingFeeStatDivisor)`, defaults **50, 25, 4** (INPUTS 4.7). The sum is over
   content's Hero Stats read through `baseStat`, so a Stat content no longer defines is ignored
   and one the row lacks reads as the content's default (rule 5); that needs content, so the
   selector takes `deps` where the epic wrote `config`. The fee is a whole number rounded down
   once, at the end: "÷" read as whole-number division, and a factor M4-S5 multiplies in is then
   rounded with the rest, not before it. It takes no buying Guild yet: nothing of the buyer's
   moves the fee in M2, and M4-S5 needs the buyer's Guildmaster, so the shape of that argument (a
   Guild, a Guildmaster, or the world) is M4-S5's to choose. Every caller (`recruit`, the CLI,
   M2-S9's `steady`, M2-S10's roster-wiped check, M2-S12's policy) has the Guild to hand, and the
   compiler finds each one when the signature changes. It stays the one place a fee is computed.
6. **`recruit(document, { guildId, heroId }, deps)`** checks, in order: a Guild id not in the
   world throws, a programming error, since Guild rows are never removed and no front end or
   controller can offer one; a folded Guild (`foldedOnTurn` set) is refused `guild-folded`,
   carrying the `guildId`, a rule rather than a programming error because the Guild row is there
   but the Guild has left play (M2-S10) and must never gain a Roster; a Hero not in the pool is
   refused `hero-not-unattached`, carrying the `heroId`, whether on a Roster, gone from the pool,
   or with no row at all, since a Hero who left has a valid id the History still shows; Wealth
   below the fee is refused `insufficient-wealth`, carrying `fee` and `wealth` (Wealth equal to
   the fee recruits, leaving 0). On success it copies `world` (DL-24's consequence), deducts
   exactly the fee, sets `guildId`, clears `unattachedSince`, appends the Hero to the Roster and
   emits `hero.recruited`, a Milestone naming the Hero and the Guild, payload `{ heroId,
   guildId, fee }`. `recruit` joins the `Action` union as `{ kind: 'recruit', guildId, heroId }`.
7. **The CLI.** `recruit --hero <id>`, in its own module `cli/src/commands/recruit.ts`, recruits
   for the player's Guild, writes the save, and prints the fee and the new Roster size. A word
   that is not a Hero id is a bad command line (exit 2); a Hero the save lacks, one not in the
   pool, or a fee above the Guild's Wealth is refused (exit 1) and nothing is written. `show pool`
   gains a Fee column read through `signingFee`; `show hero` shows when a kept Hero left the pool.

**Consequences.** M2-S10's fold releases a Hero by setting `guildId` null and `unattachedSince`
to the Turn; M6's release does the same. A rule that retires or kills an Unattached Hero clears
`unattachedSince`, or the validator refuses the document. A Hero kept after leaving the pool
stays for good (rule 8), so `world.heroes` grows by the released Heroes nobody re-signs and by no
one else; with no recruitment it holds exactly the Rosters and `unattachedPoolSize` pool Heroes
from the first refill on. A version-1 save loads through the migration and plays once M2-S3's
`ensureStreams` gives it the `pool` stream; on this story's branch alone its first night throws
for the missing stream (DL-19 item 2). A test of a phase that reads the History passes it to
`phaseContext`; left out, the phase sees an empty one. The bounded-pool test drives all twenty
years, 21,600 advances with only this phase live, in 4.5 to 6 s here (about 0.2 ms a Turn), so it
runs in `npm test` at full length with a 60 s timeout. Fields were added and `schemaVersion` changed, no rule's default, so `configVersion` stays 1.

## DL-28 — Endings: the checks, what a fold does, the replacement Rival, and Rankings pulled forward (M2-S10)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M2-S10's implementer)

**Context.** M2-S10 names the night phase `endings`, three endings, the player's ending setting
`world.ended` and a Rival's folding it (pre-M0 review D6), `rivalReplacementDays` and
`guildmasterRetirementAge`, and four events. It leaves open: when each ending falls precisely,
which wins when a Guild meets two, whether a Rival Guildmaster's Retirement folds the Rival, what
becomes of a folded Guild's Parties in flight, which stream the replacement draws from and how the
phase knows a folded Rival has been replaced, the names the replacement takes (DL-19's
consequences ask for "names or a rule for reuse"), and what the validator says of a folded Guild.
Its acceptance asks that a folded Rival be absent from `rankings()`, which arrives in M3-S5, and
the epic's risk table asks for a test that finds every read of `controller.kind`.

**Decision.**

1. **The checks.** Night, last, after the Guild State Engine and the pool refresh, over every
   Guild not folded, the player's and each Rival's alike, in Guild id order (ADR-0002). A Guild
   has reached the first of these that holds:
   - **Retirement**: its Guildmaster's `ageOf` is at least `guildmasterRetirementAge`, **65**
     (INPUTS 4.10). `ageOf` already reads a Guildmaster (`Aged`), so no new selector: the age
     rises on the Turn a year completes and the ending falls on the first night after.
   - **Bankruptcy**: `belowFloorSince` is set and `dayOf(turn) ≥ dayOf(belowFloorSince) +
     bankruptcyGraceDays`: on the night `bankruptcyGraceDays` Days after the night Wealth first
     fell below the floor, the ordinal reading DL-26 and DL-27 give Days. The Guild State Engine
     runs first the same night, so a Guild back at the floor tonight has `belowFloorSince` cleared
     and does not end. "At least", not "equal", so that a grace shortened by `rebase` ends the
     Guild at once rather than never.
   - **Roster wiped**: an empty Roster and Wealth below the cheapest `signingFee` in the pool as
     tonight's refresh left it. With nobody in the pool no Hero can be signed at any price, so an
     empty Roster is then wiped whatever the Wealth (the least of no fees is infinite).

   One ending per Guild, the first in the story's order: Retirement, Bankruptcy, Roster wiped.
   A Rival Guildmaster's Retirement folds that Rival: the same rules for every Guild.
2. **The accepted exception, in one place.** `end` in `phases/endings.ts` is the phase's one read
   of `controller.kind` (`plan.md` §1). The player's ending sets `world.ended` to `{ turn, reason
   }`, once, and emits `game.ended`, a Milestone naming the Guild and its Guildmaster, payload
   `{ guildId, reason }`. That Guild is not folded and keeps its Roster and Parties: the world
   stops as it stands, and the Guild stays in the Rankings. A Rival's ending folds it (item 3).
   The replacement reads no controller, since only a Rival folds.
3. **The fold.** First the events, made before any row changes: `guild.folded`, a Milestone,
   payload `{ guildId, reason }`, naming the Guild, its Guildmaster, and each Party the fold
   disbands and each Quest it abandons, so that their History pages end with it; then
   `hero.left-guild`, not a Milestone, payload `{ heroId, guildId }`, for each Hero on the Roster
   in Roster order. Then **its Parties in flight are disbanded**: each Party row is removed, its
   members' `partyId` cleared and its id taken off its Quest's `partyIds`; a Quest left with no
   Party is removed from the world and the Board, unresolved (no reward, Fame, harm or XP), since
   nobody is left to finish it or to be paid. Chosen over letting the Party finish because the
   story releases every Hero the same night, and a Hero in the pool must be in no Party. Then
   each Roster Hero is released: `guildId` null and `unattachedSince` the Turn (DL-27), keeping
   their Injury, Level, XP and Morale. The Roster is emptied and `foldedOnTurn` set. The Guild
   keeps its row, its Guildmaster, its Wealth (perhaps negative), Fame, Hall and
   `belowFloorSince`, a record no rule reads again; its dead and retired Heroes keep it as their
   `guildId`. `hero.left-guild` is not a passive entry, so a released Hero nobody re-signs keeps
   their row, with `leftPoolOnTurn`, when they leave the pool (DL-27's consequences). M5-S4 lists
   the folded Guild's unique Items on the Market; M6 settles its Transfer offers.
4. **Out of play.** A folded Guild is skipped by every per-Guild rule: the Guild State Engine
   (since M2-S7) and this phase; `recruit` refuses it `guild-folded` (DL-27); M2-S4's `dispatch`
   and M2-S9's controller must refuse or skip it the same way. The validator gains
   `folded-guild-in-play`, refusing a folded Guild with a Hero on its Roster or a Party of its
   own, so that a later rule giving one a Hero fails in the tests; and `world.ended`, when set,
   must have an integer `turn` and a string `reason`.
5. **The replacement.** On the night of Day `dayOf(foldedOnTurn) + rivalReplacementDays`, one new
   Rival for each Guild that folded that many Days before, in their id order, through
   `generateRival`: the draws `createWorld` makes for each Rival (Roster size, then Wealth, then
   `generateGuild` with the `steady` controller), now one function both call, so no seed's world
   changes. It emits `guild.founded` (a Milestone), `guildmaster.generated` and a
   `hero.generated` per Roster Hero. `rivalReplacementDays` is **30**, chosen, having no INPUTS
   row: a month, as long as the Bankruptcy grace. It fires on exactly that night, so no field
   records that a folded Rival has been replaced and the schema does not change; the cost is that
   a `rebase` shortening `rivalReplacementDays` past a pending replacement's night leaves that
   Rival unreplaced.
6. **The stream.** The replacement draws from `generation`, the Guild Generator's own stream,
   which nothing draws from once the world is created: a replacement moves no other subsystem's
   draws (ADR-0009), and every save already has the stream, so it needs no `ensureStreams`.
   `rivals` is M2-S9's controller's, and a new core stream would stray from pre-M0 review D7's
   list. A fold draws nothing.
7. **Guild names.** A generated Guild takes a name no Guild has ever had while one is left; once
   every name in `names.guild` has been used, one that only folded Guilds have had, never the
   name of a Guild in play. One draw either way, and with no folded Guild exactly DL-19 item 6's
   draw. It throws only when every name belongs to a Guild in play: thirty names against five
   Guilds in the core content.
8. **Rankings, pulled forward from M3-S5.** `rankings(world, by: "fame" | "wealth")` in
   `selectors.ts` returns M3-S5's shape, `{ guildId, value, rank }[]`: every Guild not folded,
   highest first, ties by Guild id in code-unit order, `rank` its position from 1, so that no two
   Guilds share a rank; never stored (rule 1). M3-S5 adds the CLI and whatever else its story
   asks.
9. **The reads of `controller.kind`.** `engine/src/controller-reads.test.ts` strips the comments
   from every engine source file that is not a test and counts its reads: `controller.kind` (with
   optional chaining), `controller['kind']`, `kind` destructured from a controller, a key tested
   `in` a controller, and a call of `playerGuild`. Its allow-list, a file, a count and a reason,
   holds today `selectors.ts` (1: `playerGuild`, how the front ends and the harness find the
   player's Guild; no rule calls it) and `phases/endings.ts` (1). M2-S9's order and M6's Transfer
   Generator add their lines; a fourth exception needs the owner first.
10. **Config.** `guildmasterRetirementAge` 65 and `rivalReplacementDays` 30. Fields were added and
    no default changed, so `configVersion` stays 1.

**Consequences.** A game now ends, so M2-S12's `game.ended` counter has something to count; on
this story's branch, with no Quest income, every game ends in Bankruptcy within its first Year. A Rival's fold grows the
pool past `unattachedPoolSize` until its Heroes leave or are signed, and the refill waits until
then. `world.guilds` grows by one row for each replacement over the life of a game. The engine
exports `generateRival` and `rankings`. The CLI's `show` still lists a folded Guild among the
Guilds, with its empty Roster; M3-S5's `show rankings` leaves it out.

## DL-29 — The stub Quest Engine, Injury types, Morale bands and the Hero State Engine (M2-S5, M2-S6)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M2-S5 and M2-S6's
implementer)

**Context.** M2-S5 gives the stub's score, the outcome's shape, five config fields, the night's
`questsConclude` and `content/injuries.json`; M2-S6 the night's healing, Morale drift and yearly
Retirement check with nine config fields. They leave open: how the roll applies and the defaults
INPUTS does not give (`stubVariance`, `stubSkillBonusPerRating`); how Wealth, Fame and XP follow
from the band, and how much XP a Quest gives before M3; the order of the draws; whether one Hero
can be both killed and injured; how the infirmary's factor rounds; Morale's scale and band edges;
how "2% per year past it" reads; which night is an anniversary; which Heroes the Hero State Engine
covers, and what becomes of a Hero away on a Quest on their anniversary; the events' payloads;
the content version; and when a returned Hero may be sent again (M2-S4's last box, DL-25 item 16).

**Decision.**

1. **Streams.** `quests` and `heroes` join `streamNames` in ADR-0009's order: `generation`,
   `board`, `quests`, `pool`, `heroes`, which is also a new world's order of `rng` keys; an old save
   gains both through `ensureStreams` (DL-25 item 8). `questsConclude` draws from `quests` alone
   and `heroState` from `heroes` alone.
2. **The score**, `stubScore` in `engine/src/quest-engine/stub.ts`: for each demand, its weight
   times the sum of that base Stat across the Party (`baseStat`), plus `stubSkillBonusPerRating`
   times the ratings, summed across the Party, of the Skills in the Quest's `skillKeys` (pre-M0
   review A4). A demand on a Stat, or a Skill, that content no longer defines counts for nothing
   (rule 5). Base Stats, since no effective-Stat selector exists before M5. `stubSkillBonusPerRating`
   is **2**, chosen: three rating points of the Quest's Skills add 6, about a third of what two
   starting Heroes' Stats score.
3. **The roll** is one draw scaling the score: `ratio = score × (1 + roll) / difficulty`, the roll
   uniform from −`stubVariance` up to +`stubVariance`; `stubVariance` is **0.2**, chosen, so a Party
   exactly at the difficulty always succeeds and one at 0.9 of it fails about a fifth of the time.
   `stubBands` is `{ successAtLeast: 0.8, strongAbove: 1.2 }` (INPUTS 4.3): fail below 0.8, success
   from 0.8 up to and including 1.2, strong success above. The bands are named `fail`, `success`
   and `strong` (`questBands`). `resolveQuest(world, quest, party, deps)` takes `deps` where the epic
   wrote `content, config`, as every entry point does, and draws from `world.rng.quests` where it
   wrote `rng`, since only `rng.ts` and `document.ts` name a stream's state type.
4. **Wealth, Fame and XP.** A success or a strong success pays the Quest's `reward` and gains its
   `fameEffect`; a failure pays nothing and loses `fameEffect`, the magnitude DL-25 item 3 stores.
   A strong success earns no more than a success: it differs in harming no one and in Morale. XP
   before M3 is `stubXpPerDifficulty[band]` times the difficulty, rounded down, with `{ fail: 0.5,
   success: 1, strong: 1 }`: INPUTS 5.1's values brought forward, so the XP a Hero banks now means
   what M3 will read, and M3-S2 replaces the field with `xpPerDifficultyPoint × xpBandFactor`. Each
   Hero who comes home alive gains it, with `hero.xp-gained`; Level stays 1.
5. **Harm** (INPUTS 4.4): `stubDeathChance` `{ fail: 0.05, success: 0, strong: 0 }` and
   `stubInjuryChance` `{ fail: 0.4, success: 0.1, strong: 0 }`, each for one Hero, every Hero in the
   Party equally likely. The Death is drawn first and the Injury among the survivors, so no Hero
   is both, and a lone Hero who dies is not also injured.
6. **Seven draws.** Every resolution takes exactly seven draws from `quests`, in this order: the
   roll; whether a Hero dies; which; whether a Hero is injured; which; the Injury's type, uniform
   over content's types in key order; its Days, `int` over the type's range. Each is taken whether
   or not it is used, so neither an outcome nor a tuned chance shifts a later draw, as `chance`
   promises for one. Parties resolve in id order.
7. **Injury types** are content: `content/injuries.json`, `ContentSet.injuries`, seven types healing
   in 5 to 30 Days (INPUTS 4.5): `bruised-ribs`, `sprained-ankle` and `broken-arm` leave nothing;
   `deep-cut` leaves `scarred`, `shattered-knee` `lame`, `eye-wound` `one-eyed` and `lung-fever`
   `short-winded`, the four Hero Traits of M1-S4. Content validation refuses an empty table, a Day
   range starting below 1 or upside down, and a `leavesTrait` that is not a Hero Trait, whether
   unknown or a Guildmaster's. `contentVersion` becomes **3**. The World State validator gains the
   warning `unknown-injury` for an Injury whose type content does not define (rule 5); such an
   Injury heals on its night and leaves no Trait.
8. **The infirmary** is read when the Injury is inflicted (M2-S6): the Days times
   `infirmaryHealFactor[grade]`, `[1, 1/2, 1/3]` (INPUTS 4.5: grade 1 halves, grade 2 thirds),
   rounded to the nearest Day and at least 1, a grade past the list reading its last factor. The
   Injury heals on `nightOf(dayOf(turn) + Days)`, so never on the night it was inflicted; a grade
   raised later does not shorten an Injury already carried.
9. **`questsConclude`**, for each Party whose `returnsOnTurn <= turn`: `quest.resolved` first,
   while the Quest and Party rows can be labelled, its payload the outcome (`band`, `score` before
   the roll, `ratio`, `wealthDelta`, `fameDelta`, `xpPerHero`, `injuries` each with its `healDays`,
   `deaths`) with the Quest's, Party's and Guild's ids, the Heroes and the template's key; then the
   Guild's Wealth and Fame (Fame's floor is `guildState`'s, later that night); `hero.injured` per
   Injury and `hero.died` (Milestone) per Death, both naming the Quest too, the dead Hero off the
   Roster with `diedOnTurn`, keeping row and Guild; `hero.xp-gained` per survivor; the Morale
   changes; then the survivors are freed and the Party and Quest rows removed. A folded Guild's
   Party is skipped, as every per-Guild rule skips a folded Guild, so M2-S10's fold must disband
   the Parties it leaves away. A Party's holdings go back to its Guild from M5-S2; none exist
   before.
10. **Morale** runs from `moraleMin` 0 to `moraleMax` 100 (INPUTS 4.8), two fields, since a literal
    bound in a rule is a defect. A discrete change is clamped into the scale and always emits
    `hero.morale-changed`, even when the clamp leaves the value where it was: `moraleOnStrongSuccess`
    **+5** to each Hero home from a strong success, `moraleOnRosterDeath` **−10** to every living Hero
    left on the Roster for each Death, those away on other Quests included. **Bands**
    (`moraleBands`, where each starts): `wretched` 0, `low` 20, `steady` 40, `high` 75, `elated` 90,
    chosen so the baseline, 60, sits in `steady`, and neither one Death nor one strong success moves
    a Hero at the baseline out of it. `hero.morale-changed` carries `{ heroId, cause, before, after,
    bandBefore, bandAfter }`, `cause` being `roster-death`, `strong-success` or `drift`.
11. **The Hero State Engine covers** the Heroes on the Roster of a Guild that has not folded, in
    Guild id order and Roster order, those away on a Quest included; a dead or retired Hero has
    left the Roster. **The Unattached pool is left alone**: rule 8 keeps for good the row of a pool
    Hero named by any entry but their two passive ones, so a `hero.healed` or a band crossing in the
    pool would break M2-S8's bound; a pool Hero stays ten Days, too few to meet an anniversary; and
    a Hero released into the pool by a fold (M2-S10) keeps their Injury and Morale until a Guild
    signs them, when the next night heals an Injury whose night has passed.
12. **Healing** clears the Injury on the first night at or after `healsOnTurn`, adds `leavesTrait`
    unless the Hero holds it already, and emits `hero.healed` `{ heroId, typeKey, traitKey }`,
    `traitKey` being the Trait added or null. **Drift** moves Morale `moraleDrift` (**1**) toward
    `moraleBaseline` and stops on it, emitting only on the night it crosses a band.
13. **Retirement.** "From 45, 2% per year past it" (INPUTS 4.11) is read as a chance that rises
    with age, as `CONTEXT.md` says Retirement's likelihood does: `heroRetirementChancePerYear` (0.02)
    for each whole year of age past `heroRetirementAge` (45), so none at 45, 2% at 46 and 10% at 50,
    times `heroRetirementInjuredMultiplier` (2) while injured, at most 1 (`retirementChance`). The
    check falls on the night of the Day on which each anniversary of the Hero's `enteredTurn` falls
    (`lastAnniversaryNight`), by when `ageOf` has counted the new year. Every due check takes one
    draw from `heroes`, whatever the age, so tuning the age or the chance shifts no later draw. A
    retired Hero leaves the Roster and keeps row, Guild and any Injury, with `retiredOnTurn`, and
    `hero.retired` (Milestone) carries `{ heroId, guildId, age }`.
14. **A Hero away on their anniversary** is not checked that night, since they cannot leave a Party
    in the field, but on the night their Party brings them home: `heroState` reads the Hero's latest
    `quest.taken` entry in the History as it stood before the Turn, and checks them when its
    `returnsOnTurn` is tonight and an anniversary night fell after the Turn it was taken. Without it
    a Hero kept busy would seldom be checked at all. It reads the History for earlier Turns, as the
    pool refresh does (DL-27 item 3); a phase test that passes no History sees no such check.
15. **The return night.** `questsConclude` runs first at night, so a returned Hero is free from that
    night's end: dispatchable on the morning of Day d + k + 1, as M2-S4's last box asks, and on the
    return night itself too, since an action may be taken in any Turn (pre-M0 review D2) and a Party
    sent at night leaves on that Day (C4). M2-S4's test that a dispatched Hero cannot go again checks
    every Turn before the return night and holds unchanged; a new test proves the morning after for
    a Party sent in each of the three Turns of a Day.
16. **Config.** The fields are added and no default changes, so `configVersion` stays 1. A default
    that is an object or a list is frozen with `defaultConfig`.

**Consequences.** Quests now end, Heroes are hurt, die, heal and retire, and every Guild's Parties
come home, so a created world played forward changes on its nights where it did not. As specified
the stub is hard on a starting Guild: two starting Heroes score about 15 to 20 against difficulties
of 10 to 100, so most Quests fail. A crude ten-year run sending every idle Hero out resolved 514
Quests, 41% of them with an Injury, at about 0.23 ms a Turn, and its document validated; tuning
the score, the difficulty scale and the bands is M2-S12's balance pass, as M2's risks say. M3-S2
replaces `stubXpPerDifficulty`; M3-S4 puts the decline beside the Retirement check and can reuse
`lastAnniversaryNight`. M2-S10's fold disbands a folded Guild's Parties, and its endings read a
retired Hero as off the Roster with `guildId` kept. M4 replaces the stub and keeps `QuestOutcome`'s
shape where it can. M5-S2 returns a Party's holdings before its row is removed. Another story
appending a stream appends it after `heroes`; another adding a content file raises `contentVersion`
past 3.

## DL-30 — The `steady` Disposition, and a Rival acting through the player's actions (M2-S9)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M2-S9's implementer)

**Context.** M2-S9 names `rivalChoices(world, guild, deps)`, the afternoon phase
`rivalControllers`, `content/dispositions.json` with one entry, and INPUTS 4.12's rule: take the
easiest Quest it can staff, and recruit the cheapest Hero when Wealth exceeds three Upkeeps. It
leaves open how a phase, which changes the Turn's copy of the world in place, applies actions
that take and return documents; which Heroes `steady` sends and how many; how much a Rival does
in one afternoon; what becomes of a refused Rival action; what a Disposition's row holds; where
the three lives; and where the engine reads `controller.kind` to find the Rivals.

**Decision.**

1. **One rule per action, two ways in.** `dispatch` and `recruit` are each split into their
   rule, `applyDispatch(world, request, deps)` and `applyRecruit(world, request, deps)`, which
   check and then change a world in place and return `{ ok: true, events } | { ok: false,
   rejection }` without appending (`WorldActionResult`), and the document-level action, which
   runs the rule on a copy through `applyToCopy(document, rule)` (`actions/result.ts`) and
   appends the events. Checks, their order, rejections, throws and events are unchanged, and the
   actions' tests pass unchanged; a refused document-level call now copies the world before
   refusing and drops the copy. `applyGuildAction(world, action, deps)` in `actions/action.ts`
   switches over `GuildAction`, `dispatch | recruit`: the actions a Guild takes, `rebase` being
   the save's. Rejected: wrapping the Turn's world in a transient document, which copies the
   whole world per Rival action, copies it back, and needs a `meta` a phase does not have.
2. **The phase** walks every Guild in id order and applies what `rivalChoices` returns through
   `applyGuildAction` on the Turn's world, so a later Rival chooses from what an earlier one
   left; it returns the rules' events in order and `advance` appends them. It adds no event
   type. The spy test watches `applyDispatch` and `applyRecruit`, the rules `dispatch` and
   `recruit` run, and finds every Rival choice there and the afternoon's events theirs.
3. **A refused Rival action is dropped silently**, the world unchanged, and the Guild's next
   choice applied. `steady` chooses only what the rules accept on the world it reads, so a
   refusal is a bug, not a move; a test plays ten Days and finds none. Not thrown, because a
   later controller that chooses several things from one world (M6: buying and recruiting from
   one Wealth) may lose one to another, and a player's game should not stop on a Rival's
   mistake; not an event, because the epic lists none and nothing would read it.
4. **`steady`** makes at most one dispatch and one recruit an afternoon, the dispatch first, both
   chosen on the world as the afternoon found it: a dispatch moves no Wealth and a recruit sends no
   one. It draws nothing.
   - *Which Quest:* the offered Quests on the Board by difficulty, lowest first, then Quest id;
     the first it can staff.
   - *Which Heroes:* those on its Roster and free to go by `dispatch`'s own test
     (`unavailability`, now exported; `availableHeroes` in `controllers/rival.ts`). The fewest the
     Quest allows: `partySizeMin`, or two when it requires a Class and a Skill and no one Hero has
     both. A requirement goes to the strongest Hero who meets it (one who meets both, if any),
     every other place to the strongest of the rest. A Hero's strength for a Quest is the sum of
     its demand weights times the Hero's base Stats, the stub's own measure less its Skill bonus;
     ties by Hero id; the Party is listed strongest first. Few Heroes keeps the rest free and the
     Board contested (`plan.md` §1); small Parties will fail more often under the stub, which
     M2-S12 measures and M6-S1's `questRiskAppetite` revisits.
   - *Recruiting:* when Wealth is strictly above `recruitWealthMultiple × upkeep(guild)` ("exceeds"),
     the Unattached Hero with the lowest `signingFee`, lowest id among equal fees, and only if
     Wealth covers the fee, since `recruit` would refuse it. No Roster cap: INPUTS 4.12 names
     none, where 4.14's policy does.
5. **Config.** `recruitWealthMultiple` 3 (INPUTS 4.12), named for the rule rather than for
   `steady`, so that M2-S12's policy, whose threshold is the same three Upkeeps (INPUTS 4.14),
   can read it; M6-S1 moves each Disposition's threshold into its row. A field was added and no
   default changed, so `configVersion` stays 1.
6. **Content.** `content/dispositions.json`, content table `dispositions`, holds one row,
   `steady: { name: "Steady" }`: a name only, the rule being code keyed by it (`dispositionRules`,
   approach §4). The content validator holds its keys to kebab-case and to their rows;
   `contentVersion` is 3. The engine's validator warns `unknown-disposition` for a Rival whose
   Disposition the content lacks (rule 5), and `rivalChoices` returns nothing for that Rival, nor
   for one whose Disposition content defines and the engine has no rule for.
7. **The `rivals` stream** is appended to `streamNames` now, after `pool`; merging with M2-S5 and
   M2-S6 puts the tuple in ADR-0009's order. `steady` draws from no stream: the test runs the phase
   with every planned stream present, choices made, and finds none moved.
8. **`controller.kind`** is read in one new place, `dispositionOf(guild)` in `selectors.ts`
   beside `playerGuild`'s existing read: the Disposition that makes a Guild's choices, or `null`
   for the player's. `rivalChoices` and the new warning call it; the phase reads no controller.
   It is `plan.md` §1's accepted exception for the source of a Guild's choices.
9. **`rivalChoices` returns `GuildAction[]`**, the epic's `Action[]` narrowed to what a Guild
   does; every value is an `Action` a front end produces. The player's Guild and a folded Guild
   get none.
10. **The counter.** `questsTakenByController(document)` in `harness/src/counters.ts` counts
    `history.byType['quest.taken']` by the kind of controller of the Guild each entry names. It
    is the harness's, for M2-S12's report: a measure, not a rule, and no read of the engine's.
11. **Tests of one phase that play Turns** (the Board refresh, the pool refresh, dispatch's
    Parties in play) now create worlds with `rivalCount: 0`, and the Guild State test that needs a
    Rival stills its controller with a spy, since Rivals now take Quests and recruit each afternoon.

**Consequences.** On the first afternoon of a default world the four Rivals take most of the
Board and recruit a Hero each (seed `s9-smoke`: four of six Quests, four recruits). A Rival
recruits every afternoon that its Wealth is above three Upkeeps, so Rival Rosters grow as Quest
rewards arrive (M2-S5) and the pool, refilled each night, is drawn on daily; M2-S12 measures
Roster sizes and the per-Turn copy cost, and `recruitWealthMultiple` is the dial. A merged story
whose tests play Turns on a created world meets the Rivals too, and stills them as item 11 does
when it watches something else. M2-S11's `decision-needed` and M2-S12's policy can use
`availableHeroes`. M6-S1 replaces `dispositionRules` with one rule reading weights from the rows.

## DL-31 — Merging M2-S9 with M2-S10: `dispatch` refuses a folded Guild, and the endings' tests still the Rivals

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (the merge of M2-S9 into
`v1.0-dev`)

**Context.** M2-S9 (DL-30) and M2-S10 (DL-28) were built side by side. Merged, the Rivals act
every afternoon in the endings' tests, which were written when they did not: a Rival signs the
cheapest Hero, so the player's Wealth arranged at Turn 0 no longer covers the cheapest left; a
bankrupt Rival still sends Parties, which its fold disbands; a Rival's Roster grows by a recruit
after the test records it; and released Heroes are re-signed. DL-28 item 4 says `dispatch` must
refuse a folded Guild as `recruit` does; `dispatch` had no such check, and refused one only by
the accident of its empty Roster.

**Decision.**

1. **`dispatch` refuses a folded Guild `guild-folded`**, payload `{ guildId }`, before every
   other check, as `recruit` does; `DispatchGuildFolded` joins `DispatchRejection`, and the
   CLI narrates it. The Rival controllers already skip a folded Guild (`rivalChoices`), so this
   is the rules' own guard, not the controllers'.
2. **The endings' tests still the Rivals that are not their subject**, in DL-30 item 11's style:
   the player's "not wiped" test plays with `rivalCount: 0`; the Rival fold tests still the
   `rivalControllers` phase with a spy. The bankrupt-Rival test stills it only until the fold,
   then lets the Rivals act again with `recruitWealthMultiple` out of reach, so that "it acts no
   more" is proved against running controllers while no one re-signs the released Heroes.
3. `controller-reads.test.ts` allows `selectors.ts` its two reads: `playerGuild` and
   `dispositionOf` (DL-30 item 8). No assertion was weakened and no other engine rule changed.

**Consequences.** Both actions a Guild takes refuse a folded Guild by name. A later story whose
tests play Turns on a created world meets the Rivals, and stills them when it watches something
else.

## DL-32 — Merging M2-S5/S6 with M2-S9/S10: the content version and stream list DL-29 named

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (the orchestrator, on the
M2-S5/S6 implementer's report)

**Context.** M2-S5/S6 were built in parallel with M2-S9 and M2-S10, then merged. Two statements in
DL-29 were true of their branch and are not true of the merged code.

**Decision.** (1) DL-29 item 7 says the content version becomes 3 with `injuries.json`; M2-S9's
`dispositions.json` took 3 first, so after the merge `meta.content.version` is **4**. (2) DL-29
item 1's stream list gains `rivals` at the end, as DL-30 item 7 said it would: the core streams are
`generation`, `board`, `quests`, `pool`, `heroes`, `rivals`, in ADR-0009's order. The merge also
proved that a folded Guild's Parties are handled once: `questsConclude` runs first at night and
resolves a Party due that night; the fold runs last and disbands any Party still out; tests cover
both orders.

**Consequences.** DL-29 is read with these corrections. No rule changed.

## DL-33 — Fast forward: always-on and opt-in stops, the watched Guild, and the CLI's `--until` (M2-S11)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M2-S11's implementer)

**Context.** M2-S11 names `fastForward(document, { until, maxTurns }, content)` calling `advance`
in a loop, five stop reasons, `pool-refreshed` opt-in (pre-M0 review B7), and the CLI's `advance
--until … --max <n>`. Approach §2 says some stops *always* stop fast forward (a Party returns, an
ending, a Transfer offer, a module asking for a decision) and others the caller opts into;
principle 10 and R2 say the engine stops when a decision is needed. The story leaves open: whether
`until` can narrow the always-on set; whose Party and whose decision stop it, when ADR-0002 forbids
a rule asking which Guild is the player's (`controller-reads.test.ts` holds the engine to the three
accepted reads); what "returned" and "a decision is needed" mean exactly; what `advance` itself
reports; the shapes of the reasons; how several reasons on one Turn are ordered; the CLI's cap
without `--max`; and how it prints what happened. DL-28 also left the CLI listing a folded Guild
among the Guilds, and DL-31 added `dispatch`'s `guild-folded` for the CLI to put in words.

**Decision.**

1. **Signature.** `fastForward(document, { guildId, until, maxTurns }, deps)` in
   `engine/src/fast-forward.ts` returns `{ document, events, stoppedBecause }`: every event of every
   Turn played, in order, and one `StopReason`, never null. `deps` where the epic wrote `content`,
   as every entry point takes it. It plays each Turn through `advance` and adds no rule, so it lands
   exactly where the same number of `advance` calls would (a test compares the saves).
2. **The watched Guild.** `guildId` names the Guild whose Parties and decisions stop it; the CLI
   passes the player's (`playerGuild`, a front end's read). The engine never asks whose Guild it is,
   so no fourth read of `controller.kind` is needed and the stops are the same rules for any Guild
   (ADR-0002). A Rival's Party therefore never stops the player's fast forward. Chosen over reading
   the player's Guild inside the engine, which `plan.md` §1 would make a fourth accepted exception
   needing the owner.
3. **Always on, and `until` does not narrow them.** `ended`, `party-returned` and `decision-needed`
   always stop it (`alwaysStops` in `engine/src/stops.ts`, a record keyed by every condition so a new
   one must say which it is); `pool-refreshed` only when listed in `until`. Naming an always-on
   condition in `until` is accepted and changes nothing. Approach §2's "always" is the owner's word
   (B7), and principle 10 says fast forward without the decision stop is unsafe; a player who wants
   Turns played regardless has `advance --turns n`. M6's `transfer-offer` and M8's `module` join as
   always-on. `max-turns` is not a condition: `maxTurns` sets it.
4. **`party-returned`**: a `quest.resolved` this Turn naming the watched Guild, the Party home and
   resolved, so it falls on the Party's `returnsOnTurn` exactly. It carries `{ guildId, partyIds }`
   in resolution order. A Party a fold disbands has not returned; only a Rival folds.
5. **`decision-needed`, the M2 reading**: the watched Guild's Roster is idle, no Hero on it away in
   a Party, and the Board holds Quests it could staff that it could not before the Turn. "Could
   staff" is `staffableQuests(world, guild, content)` in `controllers/rival.ts`: the Quests on offer
   for which `partyFor`, `steady`'s own Party-maker, finds a Party of the Heroes `dispatch`'s
   `unavailability` leaves free (`availableHeroes`); a test finds that `dispatch` accepts the Party
   for every Quest the stop names. It carries `{ guildId, questIds }` in Board order.
   - *Idle Roster.* The epic's "and the Roster is idle" is read as a clause of its own: while any
     Party of the Guild is out, its return is the next thing to wait for, and no decision stops
     fast forward, even with Heroes at home. Otherwise `advance --until party-returns`, the M2
     gate's command, would stop every morning that new Quests arrive for the Heroes kept at home.
   - *New, not standing.* Only Quests that became staffable this Turn count: new on the Board, or
     within reach because the last Party came home or a Hero healed. A Quest the caller could
     already staff when the Turn began has been seen and passed over; were it counted, fast forward
     from an idle Guild would stop after every Turn and be useless (B7's own objection).
   So an idle Guild is stopped on the mornings new Quests it can staff arrive, and on the night its
   last Party returns when the Board holds one it can staff (after `party-returned`).
6. **`pool-refreshed`**: Heroes in the Unattached pool after the Turn who were not in it before,
   the night's refill and a fold's released Heroes alike, carrying `{ heroIds }` in id order.
   `ended` carries nothing more (`world.ended` says why); `max-turns` nothing.
7. **Several reasons on one Turn** are reported in the order `ended`, `party-returned`,
   `decision-needed`, `pool-refreshed` (`stopConditions`); fast forward stops with the first it is
   listening for. `stopsOfTurn(turn, guildId, deps, conditions)` returns every reason a played Turn
   gives among the conditions asked, one detector per condition in `stops.ts`, the one place each
   is detected.
8. **What `advance` reports.** `advance` has no watched Guild, and `pool-refreshed` is opt-in, so
   its `stoppedBecause` stays what DL-24 made it: `ended` or null, now from the same detector
   (`endedStop`). `StopReason` moves from `advance.ts` to `stops.ts` with fields added, as DL-24
   allowed.
9. **`maxTurns`** must be a whole number from 0, or fast forward throws `RangeError`, a
   programming error, as it does for a condition that is not one or a Guild not in the world. It
   always terminates: 0 returns the same document, no events, `max-turns`. An ended world returns
   the same document with `ended` whatever `maxTurns`, since no Turn can follow.
10. **The CLI.** `advance --until <stops> [--max <n>]`, or `advance --max <n>` alone, fast forwards
    for the player's Guild; `<stops>` is any of `party-returns`, `decision`, `ended`,
    `pool-refreshed` (the epic's words, mapped to the engine's conditions), joined by commas, each
    once; `--max` is a whole number from 1; `--turns` cannot be combined with either (exit 2). Without
    `--max` the cap is **one year of Turns**, the save's `turnsPerYear` (1,080 by default): longer
    than any Quest many times over, and data-model §7's own measure of a fast forward. It prints the
    Turns played, where time stands, a `Stopped: …` line for the reason, and every event of those
    Turns, one line each in the CLI's words (`cli/src/narrate.ts`: typed event in, line out, a
    switch the compiler holds to every event type and stop reason, and a test with one event of
    each type). Plain `advance` and `--turns` print the same narrated lines in place of the
    event-type table. A game already over is refused, as `--turns` refuses it.
11. **Folded Guilds in the CLI (DL-28's follow-up).** `show` lists only the Guilds in play and
    counts the folded ones ("4 Guilds in play and 1 folded (show guilds lists them)"); `show guilds`
    lists every Guild and, once any has folded, adds a last column marking each folded one "on Day
    N". The CLI's map of `dispatch`'s rejections already puts `guild-folded` (DL-31) in words; a test
    now proves it.

**Consequences.** `staffableQuests` and `partyFor` are exported from `controllers/rival.ts`, and
`easiestStaffable` shares their Board walk (`offeredQuests`); `steady`'s choices are unchanged. The
engine exports `fastForward`, `stopsOfTurn`, `alwaysStops` and the detectors. A year of fast forward
on a created world with four Rivals, 1,080 Turns, took 0.6 to 0.9 s here under Vitest, within
data-model §7's 1 s; the stop checks add under a tenth to `advance`'s own cost, which M2-S12
measures. Listening to every condition from an idle Guild stops about 400 times a year, most of them
the pool, which is why it is opt-in. M7's web front end offers the conditions as buttons and names
the watched Guild as the CLI does; a later milestone that widens "a decision is needed" (M4's
Regard, M6's offers) changes `decisionNeededStop` alone.

## DL-34 — The automatic policy, the play sweep, validating from where the last validation stopped, and the M2 measures (M2-S12)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M2-S12's implementer),
recording a measure and the method that took it

**Context.** M2-S12 names the harness's automatic policy (INPUTS 4.14), a play sweep of 200 seeds ×
20 years (INPUTS 4.13) validated after every advance when `HEROESIM_VALIDATE` is set, the counters
and measures, `npm run harness:sample` (pre-M0 review E8), and asks for the measures in this log
against `data-model.md` §7's targets (DL-08). It leaves open: how "the strongest available Party of
the required size" reads, how many Parties the policy sends a Turn and which Hero it recruits, where
the policy's own numbers live, how a validation after each of 21,600 advances stays affordable when
the validator reads the whole History, how a counter joins an entry to a Guild, where a game that
outlives its 20 years stands in "years survived", and how long the sweep may take.

**Decision.**

1. **The policy**, `automaticPolicy(document, deps, policy?)` in `harness/src/policy.ts`, returns
   `GuildAction[]` (the epic's `Action[]` narrowed, as `rivalChoices` does, DL-30 item 9) for the
   player's Guild, on the document as it stands:
   - *Dispatch.* The offered Quests on the Board by `reward`, highest first, then Quest id. "The
     required size" is read as the least the Quest takes, the size `steady` sends, and "the
     strongest" as the strongest Heroes by the Quest's demand weights: the Party is
     `partyFor(quest, availableHeroes, content)`, the Rival controller's staffing rule, now exported
     from `engine/src/controllers/rival.ts` rather than copied (no rule changed). A Quest it cannot
     staff is passed over; it keeps sending Parties, each to the next Quest, until no Hero is free,
     no Hero twice. Read the other way, a Party as large as the Quest allows, the policy would send
     fewer, stronger Parties; the owner can say so and it is one argument to `partyFor`.
   - *Recruit.* One a Turn, when the Roster is below `rosterLimit` (8) and Wealth is strictly above
     `recruitWealthMultiple` (3) Upkeeps: the cheapest Hero in the pool, lowest id among equal
     fees, when Wealth covers the fee. INPUTS 4.14 names no Hero; this is `steady`'s choice, so the
     two players differ only where 4.14 says they do. Never a transfer.
   - *Its numbers are the harness's.* `PolicyConfig` (`recruitWealthMultiple` 3, `rosterLimit` 8)
     lives in the harness, not in `GameConfig`: the policy is not a rule of the game. It does not
     read the Rivals' `recruitWealthMultiple` (DL-30 item 5 thought it might), so tuning the Rivals
     (DL-35) leaves the harness's player as INPUTS 4.14 defines it.
   - *Deterministic.* It reads the document and draws nothing; a test finds the document's
     serialisation unchanged by a call and the same choices twice.
2. **The play loop**, `playGame` in `harness/src/play.ts`: `createWorld(seed, harnessSetup, deps)`;
   then, until `world.ended` is set or the world reaches `years × turnsPerYear` (21,600 Turns), the
   policy's actions applied in order through `applyAction`, each copying the world as a front end's
   action does, then one `advance`, timed with `performance.now()`. A refused action is recorded and
   fails the run: the policy chooses only what the rules accept.
3. **Validating from where the last validation stopped.** Measured before choosing: `validate`
   costs about 5.8 µs a History entry (31 ms at 6,910 entries after a year, 95 ms at 15,347, 241 ms
   at 41,706 after five), so validating after each of a game's 21,600 advances is quadratic, hours
   a game at 20 years. `validate(document, deps, { historyFrom })` (engine,
   `validate.ts`) now checks the World State in full and the History only from position
   `historyFrom`, taking the entries before it as accepted by an earlier validation of the same
   History, which is append-only (ADR-0008). From there: JSON safety of every section but the
   History and of each new entry (`findJsonUnsafe` gained a path prefix); each new entry's shape,
   participants' id form and Turn order (after the last older entry's Turn); the counters against
   the world's ids and the new entries' participants; each index list a new entry names ends in
   exactly the new positions that belong in it, in order, and holds none outside `entries`; and a
   Hero a new entry names who has no row and a non-passive entry anywhere (rule 8). What it cannot
   see, and a validation from 0 does: damage to an older entry or to an index list no new entry
   names (only something other than `append` could do it), a counter lowered below an id only
   older entries name, and a Hero's row removed while no new entry names them (no rule does: the
   pool refresh emits `hero.left-pool` first). `historyFrom` defaults to 0, the whole History, as
   every load's validation is; one past the History's end, or not a whole number, throws. Tests in
   `validate.test.ts` play 60 Turns validating from the last length each Turn and find the same
   verdict as a validation from 0, find each kind of damage among new entries under the check and id
   it names, and show that damage before `historyFrom` is left to a validation from 0. The harness
   validates the new world from 0, after every advance from the History's length at the last
   validation, and the whole document once more when the game stops; a refusal or a warning stops
   the game and fails the run. The full validator's own cost is unchanged (12 ms for the
   1,000-Hero fixture before and after).
4. **Counters** (`harness/src/counters.ts`, `countGame`), each read through `history.byType` and
   joined to the Guild the entry is about: its payload's `guildId`, or else the first Guild among its
   participants, which `emit` adds for any Hero it names at the time (DL-24 item 3), so a Hero's
   Injury or Death counts for the Guild they were on then. Quests taken and `quest.resolved` by band
   are split by controller kind, as are `hero.injured`, `hero.died`, `hero.recruited` and
   `hero.retired`; `game.ended` by reason; `guild.folded` by reason (the Rival folds). **Years
   survived** is `world.ended.turn / turnsPerYear` for a game that ended and the full 20 for one
   that did not, a censored figure the report states beside how many games ran the full length and
   how many ended in each year.
5. **Measures.** `advance` per Turn, every Turn of every game (mean, p50, p99, max), and the first
   seed's replay timed alone; for the last document of every game that ran the full 20 years:
   `history.entries.length`, `serialise(document).length`, and the time to serialise it and to
   `deserialise` it (parse, migrate and a whole validation: a load), which also checks that it loads
   and serialises back to the same text. The 1,000-game estimate is the run's wall-clock time per
   Turn played × 21,600 × 1,000.
6. **The sweep runs in parallel.** A 20-year game takes most of a minute, so 200 of them one after
   another take hours. `sweepPlayInParallel` deals the seeds in turn among child processes, half the
   logical processors by default (16 here), each running `harness/src/shard.ts` under tsx (`node
   --import tsx`) with the core content and the sweep's config, and merges the records in seed
   order; the byte-equality replay runs in the parent afterwards. Games share nothing and each is
   seeded, so where one is played does not change it: a test runs the same seeds both ways and finds
   the same records. Timings taken under that load are higher than one process alone, which is why
   the replay is timed as well. `sweepPlay`, in one process, serves the ordinary tests.
7. **Seeds and flags.** The play sweep plays 200 seeds when `HEROESIM_SEEDS` is unset (INPUTS 4.13's
   per-milestone run), the creation sweep still 1,000 (`seedCount` takes the fallback); the tagged
   run sets `HEROESIM_SEEDS=1000`. `HEROESIM_VALIDATE` is `1` or `true`, or unset, blank, `0` or
   `false`; anything else throws, so a mistyped flag cannot quietly skip validation. `npm run
   harness` runs both sweeps; `npm run harness -- play.harness` runs this one alone.
8. **Byte equality.** After the sweep, one seed is played twice more under the policy and the two
   last documents' serialisations compared: the first seed whose game ran its full length, the
   longest comparison and the fairest single-game timing, or `seed-0001` when none did. An
   ordinary test does the same for 20 Days.
9. **`npm run harness:sample`** runs `harness/src/sample.ts` under tsx and writes a 20-year save,
   `serialise`'s text, to `harness/samples/twenty-years.json`, which `.gitignore` already ignores:
   it plays `seed-0001`, `seed-0002`, … under `defaultConfig` and writes the first game to run
   its full 20 years (under DL-35's defaults, `seed-0004`, the fourth tried, 45 s), or the longest
   of the first twenty when none does, since M7-S4 asks for a 20-year save and a game that ends in
   its first months is not one. `npm run play -- load harness/samples/twenty-years.json` makes it
   the CLI's game.
10. **Result, 2026-09-26** (`harness/reports/m2-2026-09-26.md`, committed with this entry): 200
    seeds, `seed-0001` to `seed-0200`, each up to 20 years (21,600 Turns), validated after every
    advance, under DL-35's defaults (config version 2, content version 4), in 16 processes on the
    machine of DL-13 (AMD Ryzen AI Max+ 395, 32 logical cores, Windows 11, Node v26.9.0). The run
    took 53.6 minutes. The defaults' own run, before DL-35, is in DL-35.
    - **Validation.** No refusal and no warning in any of the 200 games, after every advance and
      over the whole document at each game's end; no policy action refused; all 200 last documents
      load and serialise back to the same text.
    - **Byte equality.** `seed-0004`, the first seed to run its full 20 years, played twice more
      after the sweep: identical, 79,719,374 characters.
    - **Counters.** 134 games ran the full 20 years; 66 ended in Bankruptcy, none in Retirement
      or a wiped Roster. Years survived: mean 14.07, min 0.14, max 20. Rivals folded 190 times
      (0.95 a game: 187 Bankruptcies, 3 wiped Rosters). Quests taken: the player 679,616 (3,398 a
      game), the Rivals 3,756,277. Resolved, fail / success / strong success: the player 52.2% /
      33.4% / 14.4%, the Rivals 11.7% / 33.4% / 54.9%. A game, player and Rivals: `hero.injured`
      797 and 1,480, `hero.died` 88.4 and 109.8, `hero.recruited` 91.2 and 172.9, `hero.retired`
      0 and 3.07.
    - **Measures against `data-model.md` §7** (provisional targets, recorded and not chased,
      DL-08). "Alone" is `seed-0004`'s replay in one process, 21,600 Turns, or the sample save of
      the same game loaded alone; "loaded" is every Turn of the sweep, 16 processes at once.

      | Measure | Target | Measured |
      | --- | --- | --- |
      | Advance one Turn | under 5 ms | alone: mean 1.27 ms, p99 2.79 ms; loaded: mean 5.84 ms, p99 11.9 ms |
      | Fast forward a year | under 1 s | 1.37 s (mean alone × 1,080 Turns): over |
      | Harness: 1,000 games of 20 years | under 10 min | 372 min at this run's rate (16 processes, validated; validation about doubles it): over |
      | Save after 20 years | under 20 MB | mean 74.9 MiB (78.6 million characters, 210,663 entries), max 78.4 MiB, over 134 games: about four times over |
      | Load a save | under 1 s | alone: 1.04 s (parse 0.25 s, the whole validation 0.75 s); loaded: mean 4.6 s |

      Serialising the 20-year save takes 0.74 s alone. Validating after an advance, from where the
      last validation stopped, costs about what the advance does (6.28 ms mean loaded, beside its
      5.84 ms), where validating the whole document would have cost 0.75 s by the twentieth year.

**Consequences.** M2's gate has its run: 200 seeds × 20 years play to an ending or their last
Turn, and the report gives the counters. What the measures say, for the owner and later
milestones, not acted on here (DL-08):

- **The History is the save.** About 10,500 entries a year at about 370 characters each: 20
  years is 75 MiB, four times §7's target and past what a browser holds in `localStorage` (M7
  saves to IndexedDB, §7). By share of its characters: `quest.resolved` 27% (its payload is the
  whole outcome), `hero.xp-gained` 20% (one entry a Hero a Quest), `quest.taken` 20%,
  `hero.morale-changed` 15% (every strong success moves every Hero home), `quest.offered` 12%.
  §7's levers, in order: leaner entries (one XP entry a Party, fewer labels), then compression on
  write. Rivals take a Quest a day each and make most of it.
- **Fast forward a year is 1.37 s alone**, over the 1 s target: M2-S11's fast forward will show it.
  `advance`'s cost grows with the Heroes `world` keeps (362 rows after 20 years in `seed-0004`,
  dead, retired and released Heroes among them, every one copied each Turn): the epic's risk
  table names the lever, fewer rows in `world`.
- **Timings under load are not timings alone.** A Turn of the sweep, 16 processes at once, cost
  4.6 times one of `seed-0004`'s replay alone. Two runs' timings compare only at the same number of
  processes; the report states it.
- **A load validates the whole document**, as before (`historyFrom` defaults to 0); only a caller
  that validated the same History before, as the harness does, passes it. The 1,000-Hero
  validator timing test (M1-S7) failed one full `npm test` in three on this machine before this
  story, at 55 ms against its 50 ms bound, 12 ms alone; it now retries twice rather than having
  its bound raised.
- **`partyFor` is the engine's one staffing rule**, exported: M2-S11's `decision-needed` (a Quest
  the Guild could staff) can call it rather than keep a third.
- **Nobody retires on the player's Roster**: its Heroes die, 88 a game, before any reaches 46, since
  the policy takes the hardest Quests and a failure kills one Hero in twenty (INPUTS 4.4). And no
  game can end in the Guildmaster's Retirement within 20 years: the oldest starting Guildmaster
  (45, INPUTS 4.10) turns 65 on Turn 21,600, which the sweep does not play past.
- **`npm run harness` takes about an hour** at 200 seeds (DL-13's creation sweep, seconds, runs
  with it); the tagged run of 1,000 seeds, about six hours validated on this machine.

## DL-35 — The first balance pass: the stub's bands, the wage, and how much a Rival keeps before it recruits (M2-S12)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M2-S12's implementer), as
the story asks: a first pass for the owner to tune

**Context.** The M2 implementers warned that the stub as specified fails most Quests for starting
Parties (DL-29's consequences) and that Rivals fold again and again beside an idle player. M2-S12
runs the 200 × 20 sweep on the defaults first (DL-34), and turns the INPUTS 4.x dials, config
defaults only, if the outcome is degenerate.

It is. **Before**, under the defaults (config version 1; 200 seeds × 20 years, validated, the
same harness): all 200 games ended in Bankruptcy in their first year, after 0.15 years on
average (0.11 to 0.25). The player's Guild failed 99.1% of its 5,933 resolved Quests and the
Rivals 96.1% of their 23,116; Rivals folded 391 times, 1.96 a game in those 55-odd Days. A game:
the player's Heroes injured 11.3 times, 1.5 died, 4.0 recruited. Three causes:

1. **The stub's scale.** A Level-1 Hero weighs about 7.5 on a Quest's weighted demands, so the
   Party of the size a Quest requires scores about 15 to 25 against difficulties of 10 to 100: a
   ratio near 0.25 to 0.35 on the high-reward Quests the policy takes and 0.5 to 0.8 on the easy
   ones the Rivals take, all below INPUTS 4.3's 0.8. M2 has no Levels (XP accrues, Level stays 1
   until M3), so no Guild grows into the scale.
2. **Upkeep is a rounding error beside a reward.** 5 Wealth a Hero every ten Days against rewards of
   40 to 450: in trials with workable bands, even a wage of 50, ten times INPUTS 4.6's, let Wealth
   grow without end (the player about 63,000 after five years), and nothing ended a game after its
   first months. Under the defaults the policy's first Turns instead spend its 500 on four
   recruits, down to three Upkeeps, and every Quest fails.
3. **`steady` recruits to the edge.** It recruits whenever Wealth exceeds three Upkeeps, without a
   cap, so a Rival grows its Roster until its Upkeep eats its income of one Quest a day. With
   INPUTS 4.6's wage and workable bands that is hundreds of Heroes (354 a Rival after three years,
   1,469 Hero rows in `world`, `advance` at 6.5 ms), and at a wage of 50 about 31, with a month's
   Upkeep in hand, so that an ordinary bad month folds it: 9.2 folds a game in five years.

**Decision.** Three defaults change, and `configVersion` goes from 1 to 2 (data-model §2):

| Field | INPUTS default | Now | Why |
| --- | --- | --- | --- |
| `stubBands` | 0.8 / 1.2 (4.3) | **0.26 / 0.39** | Both scaled by 0.325, keeping the success band's width in proportion: a Party of the size a Quest requires, at Level 1, succeeds about half the time on the hardest Quests and nearly always on the easiest |
| `wagePerLevel` | 5 (4.6) | **70** | A Hero's wage becomes a real cost against Quest rewards, so a Guild must keep succeeding to stay afloat, and a Rival's Roster settles near 20 |
| `recruitWealthMultiple` | 3 (4.12) | **10** | A Rival recruits only while it holds ten Upkeeps, about 100 Days of wages, so an ordinary run of failures no longer folds it |

The trials that chose them, all under the policy of DL-34 (scratch runs, not committed; 20 seeds
unless said): the bands alone (0.3 / 0.5) gave Rival Rosters in the hundreds; 0.25 / 0.5 with a
wage of 50 gave no Bankruptcy in five years and 9.2 Rival folds a game; the Rivals' ten Upkeeps
took that to 0.05; wages of 85 and 100 bankrupted 9 and 17 of 20 within five years, most in the
first; over 20 years, 0.25 / 0.375 at 75 left 84 of 100 games alive with 12 of the 16 Bankruptcies
in the first year, and **0.26 / 0.39 at 70 left 63 of 100 alive**, its 37 Bankruptcies spread over
years 0 to 8 and 16, with a Rival fold a game. The last is taken: games that last years, some
Bankruptcies, some Rival turnover, a spread for the owner to tune rather than one outcome.

Not turned: the difficulty scale (`questDifficultyMin/Max` clamps a template's range, so lowering
the top would pin every hard template at one difficulty); rewards and durations (content, DL-25
item 3); harm (INPUTS 4.4), the Bankruptcy grace (4.9) and starting Wealth (3.x), which the trials
did not need; and the policy's own numbers (INPUTS 4.14, the harness's player, DL-34).

**After** (DL-34's run, 200 × 20, validated): 134 games ran the full 20 years and 66 ended in
Bankruptcy, 41 of them in the first year and the rest over years 1 to 8 and one in the sixteenth;
years survived mean 14.07. The player fails 52.2% of its Quests (33.4% succeed, 14.4% strongly),
the Rivals 11.7% (54.9% strongly). Rivals fold 0.95 times a game (187 Bankruptcies, 3 wiped
Rosters), where the M2 implementers saw 11 to 14 in a 20-year run beside an idle player. A game:
the player's Heroes injured 797 times, 88 died, 91 recruited, none retired; the Rivals' 3.07
retired.

Tests that relied on a changed default now pin it: the stub's tests pin INPUTS 4.3's bands they
are written against, beside a new test of the new defaults; the Rival-controller phase tests that
watch a first-afternoon recruit pin INPUTS 4.6's wage and three Upkeeps; the rebase tests pin
versions 1 and 2; the Rival test of the default multiple expects ten. No assertion was loosened.

**Consequences.** A save made before this entry plays under version 1 until the player rebases
(DL-24 item 6), when `world.rules-adopted` records 1 to 2. A fifth of games still end in their
first year: the start is the fragile part (500 Wealth against 280 Upkeep every ten Days, and the
hardest Quests first), and the Bankruptcy grace, starting Wealth or the policy's choice of Quest
are the levers there. The policy's Heroes die at four a year. M3's Levels change the stub's scale
and M4 replaces the stub and its bands; both call for the next pass. INPUTS 4.3, 4.6 and 4.12
keep their rows; their defaults now differ from the config's, as this entry records.

## DL-36 — XP, Levels and growth; Quest XP and the training yard; the wage for Levels (M3-S1, M3-S2)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M3-S1 and M3-S2's
implementer)

**Context.** M3-S1 gives `xpForLevel`, the night phase `levelUps`, the `progression` stream (pre-M0
review D7) and four config fields; M3-S2 the stub's new XP formula, the night phase `training` and
three fields (INPUTS 5.1 to 5.3). They leave open: whether "XP for Level n" is cumulative or within
the Level, and how `hero.xp` reads beside it; how a growth point is drawn; which Heroes level and
train; where the two phases sit in the night; what becomes of DL-29's `stubXpPerDifficulty`; the
event's payload; whether `configVersion` moves; and whether M2's balance (DL-35) stands once wages
rise with Level.

**Decision.**

1. **XP is cumulative and never spent.** `hero.xp` is every XP the Hero has earned.
   `xpToNextLevel(L)` is INPUTS 5.2's "XP to next Level", `xpCurveBase × L^xpCurveExponent` rounded
   to the nearest whole number: 100 × L² by default. `xpForLevel(n)` is the XP a Hero has earned on
   reaching Level n, the sum of `xpToNextLevel(L)` for L from 1 to n − 1: 0 at Level 1, 100 at 2,
   500 at 3, 1,400 at 4, 247,000 at the cap, 20. A Hero holds Level n once `xp >= xpForLevel(n)`, as
   the epic's test reads. Read the other way, XP within the Level and reset at each one, a Level-up
   would spend XP, `hero.xp` would no longer say what a Hero has earned, and the XP M2 banked (DL-29
   item 4) would mean something else. A Hero generated at a Level above the first (a caller's
   option, which no rule uses yet) starts with `xpForLevel` of it, and no growth: the Stats drawn
   stand for that Level. Levels never fall: a rebase to a steeper curve leaves a Level where it is.
2. **`levelUps`** gives every Hero it covers each Level from the next up to `levelCap` whose
   `xpForLevel` their XP has reached, several in a night if the XP reaches them, one at a time. XP
   past the cap still accrues and waits for the cap to rise. Each Level applies
   `growthPointsPerLevel` points, each one `next` draw from `progression` times the sum of the
   Class's growth weights (content, DL-17), falling in one Stat's share of them taken in key
   order. A point on a Stat already at its Potential, or at content's maximum should Potential ever
   exceed it, is lost, not redirected (the epic), so Potential binds. Every point takes its draw
   wherever it lands, so a night's draws depend only on the Levels gained; a Class content no longer
   defines grows nothing and still draws (data-model rule 5). Each Level emits `hero.levelled`, a
   Milestone naming the Hero and so their Guild, with `{ heroId, guildId, level, statDeltas,
   pointsLost }`: the Level reached, each Stat that rose and by how much, and how many of the
   Level's points Potential took. The CLI narrates the Stats that rose and never the points lost,
   since Potential is shown only as a hint.
3. **Which Heroes.** Every living Hero on the Roster of a Guild that has not folded, in Guild id and
   Roster order, the player's and the Rivals' alike (ADR-0002), those away on a Quest included:
   Level follows XP wherever the Hero is. **The Unattached pool is left out.** A pool Hero earns no
   XP, from a Quest or a yard, so has no Level to gain, and a `hero.levelled` naming them would keep
   their row for good (data-model rule 8), as DL-29 item 11 left the pool out of the Hero State
   Engine. A Hero a fold released (DL-28) levelled on their Roster first; a Level a later rebase
   makes due waits for the Guild that signs them.
4. **The `progression` stream** joins `streamNames` after `heroes` and before `rivals`, ADR-0009's
   order as amended; an old save gains it through `ensureStreams`. `levelUps` draws from it alone,
   and nothing else draws from it.
5. **Quest XP** (M3-S2): `xpPerHero` is `difficulty × xpPerDifficultyPoint × xpBandFactor[band]`,
   rounded down, with `xpPerDifficultyPoint` **1** and `xpBandFactor` **`{ fail: 0.5, success: 1,
   strong: 1 }`** (INPUTS 5.1; a strong success is a success). **`stubXpPerDifficulty` is removed**,
   not renamed: the new fields' product equals it in every band, so every Quest gives the XP it gave,
   and keeping it would leave a tunable that does nothing. A save's `meta.config` that holds it keeps
   it, unread (data-model §2).
6. **The training yard** (M3-S2). Night phase `training`: each living Hero on the Roster of a Guild
   that has not folded, in no Party and carrying no Injury, gains `xpPerTrainingDay` (**2**) times
   the Guild's `hall.trainingYard` grade as it stands that night; grade 0 gives nothing. Every Guild
   alike (ADR-0002). No event: training XP is a drift (data-model rule 10), recorded by the
   `hero.levelled` it causes; `hero.xp-gained` stays for Quest XP. It draws nothing.
7. **The night's order: `training`, `questsConclude`, `levelUps`, then the Hero State Engine and the
   rest.** Training runs first so that it covers the Day just ending as the Hero spent it: a Hero
   whose Party comes home tonight is still in it, and gains nothing for a Day away; a Hero whose
   Injury heals tonight, later in the Hero State Engine, spent the Day injured. A Party is away from
   the night it leaves to the night it returns, both included, and trains on none of them.
   `levelUps` comes straight after `questsConclude` (the epic) and after `training`, so a night's
   Quest XP and training XP are levelled that night: at every night's end each covered Hero's Level
   is the highest their XP reaches, up to the cap. Approach §2's night line names both.
8. **Upkeep** already reads Level (`wagePerLevel`, DL-26, DL-35), so a Level gained costs its Guild
   `wagePerLevel` more at each Upkeep from then on.
9. **Config.** Seven fields are added with INPUTS 5.1 to 5.3's values (`xpCurveBase` **100**,
   `xpCurveExponent` **2**, `levelCap` **20**, `growthPointsPerLevel` **3**, and item 5's and 6's),
   and one removed with its effect kept. The growth weights are content's and already refused
   unless they sum to 1 within 0.001 (`checkGrowth`, content's refusal test); the core's 0.1667 ×
   4 + 0.0208 × 16 sums to 0.9996, and a draw weighs by the sum it finds.
10. **The wage, for Levels: `wagePerLevel` 70 → 20, and `configVersion` 2 → 3.** Measured under the
    automatic policy (DL-34) on the core content, 8 seeds × 10 years (scratch runs, not
    committed): with Levels held at 1 (`levelCap` 1, M2's rules) 5 of 8 games lasted the ten years;
    with Levels and DL-35's wage of 70, **all 8 went bankrupt within 0.17 to 0.44 years**, their
    Heroes at Level 2 to 4 costing two to four times the wage DL-35 tuned against. A Level adds a
    whole `wagePerLevel` to a Hero's wage but three Stat points spread over twenty Stats to the
    stub's score, a few per cent, so under the stub a Level is a cost before it is an earning.
    Trials of the wage: 35 bankrupted 8 of 8 within 2 years; 30 8 of 8 within 5; 25 4 of 8, over
    years 2 to 6; **20 none in 10 years**, the player's Roster at a mean Level of 3.6 after the
    first year and 4.1 to 4.7 after, where Deaths and Level-1 recruits hold it. At that mean a Hero
    costs about what DL-35's Level-1 Hero cost. Over 16 seeds × 20 years at 20: no Bankruptcy, the
    player's mean Level 3.7 after the first year and 4.0 to 4.9 in each later one, Rivals gaining
    about 31 Levels a Rival-year, and 74 of 1,540 Roster Heroes at the end with a Stat at Potential.
    No Bankruptcy is not DL-35's spread (25 gave one), but the other M3 tracks add costs, and this
    is a stopgap so that M3's harness pass measures games rather than first-year Bankruptcies; that
    pass tunes the wage again with the other M3 tracks' rules merged. The wage's shape, all per
    Level with no base (INPUTS 4.6), is unchanged; a base plus a smaller per-Level part is the other
    lever, and the owner's. Tests pin the wages they rely on; one pins the new default.

**Consequences.** Heroes grow now, on every Roster, and their wages with them (item 10). A save made
before this entry plays under `configVersion` 2, a wage of 70, until the player rebases. The curve
asks about 50,000 XP for Level 12 and 247,000 for Level 20; a Hero taking a Quest of difficulty 50
every week earns some 2,500 a year from Quests and 720 more at yard grade 1, and the policy's Roster,
thinned by Deaths and refilled at Level 1, holds a mean Level near 4.5 (item 10), so the cap is far
off in a 20-year game unless the curve or the XP is tuned (the epic's second risk). The M3 counters
read: Levels gained per Guild-year, the `hero.levelled` entries by `payload.guildId` and
`yearOf(turn)`; the mean Level of the player's Roster by year, and the Heroes with a Stat at
Potential after 10 years, from the World State at each year's end (`level`; a base Stat against
`potential`), with `pointsLost` summing the growth Potential refused. M3-S6's `build` raises the
yard's grade; until it lands only a test sets it. M3-S4's decline may lower a Stat that a later
Level regrows, up to Potential.

## DL-37 — Potential hints, and the yearly ageing decline beside the Retirement check (M3-S3, M3-S4)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M3-S3 and M3-S4's
implementer)

**Context.** M3-S3 asks for `potentialHint(hero, statKey, config)` giving one of INPUTS 5.4's three
words from the gap between base and Potential, bands in config (`potentialHintBands`), and `show
hero` printing the word and never the number; pre-M0 review D9 keeps Judgement's sharpening of the
hints for M4-S5. M3-S4 asks for a night phase `ageing`, "on the Hero's entry anniversary alongside
the Retirement check", in which a Hero past `declineAge` loses `declinePerYear` from one Stat of
`declineAreas` drawn from `heroes`, with `hero.declined`. They leave open: the bands' shape and
defaults; what a Stat the row lacks hints; where the hint sits in the view; whether decline is a
phase of its own or part of `heroState`; which comes first on a shared night and whether a Hero
who retires also declines; how "past `declineAge`" reads against INPUTS 5.5's "from 40"; which
Stats the draw is over and whether an unused draw is taken; the event's payload.

**Decision.**

1. **The hint** is `potentialHint` in `engine/src/potential.ts`, a file of its own as `moraleBand`
   has `morale.ts`, exported from the package. The words are `potentialHints`, `modest`,
   `promising`, `exceptional`, in `config.ts` beside `moraleBandNames`.
2. **The bands** say where each word starts on the gap, Potential less base, in Stat points, and a
   gap takes the highest word whose start it has reached, the lowest for a gap below every start:
   `moraleBand`'s rule. Every gap so has exactly one word whatever the three numbers are, which is
   the partition with no hole the first box asks for; the test walks every gap from 0 to 19, the
   widest content allows. Defaults **`{ modest: 0, promising: 6, exceptional: 10 }`**, chosen so a
   generated Hero's gaps, 3 to 12 (`potentialGapMin/Max`, fewer where Potential meets the Stat's
   maximum), split near thirds: 3 to 5 modest, 6 to 9 promising, 10 to 12 exceptional. A Hero grown
   close to Potential reads modest.
3. **A Stat the row lacks**, in its base or its Potential (data-model rule 5), reads as a gap of 0,
   the lowest word: there is no stored Potential to hint at. The hint reads the Hero and the bands
   alone, never content.
4. **The M4 seam.** `potentialHint` takes the bands from the `config` it is given and nothing else,
   so M4-S5 sharpens hints by passing bands narrowed by the Guildmaster's Judgement
   (`judgementHintSharpening`), with no change to the function.
5. **The view.** `show hero`'s Stats table gains a fourth column, **Outlook**, after the value. The
   heading avoids the word Potential, which M1-S9's test forbids anywhere in the printed Hero; the
   test is kept and extended: every Stat row ends in a hint word, its base before it, and a hint
   comes from the save's own bands.
6. **`ageing` is a phase of its own**, as the epic names it, placed **right after `heroState`**
   and before `guildState`. It does not repeat the anniversary rule: it asks `heroState`'s
   `retirementCheckDue`, now exported, so a Hero is checked for decline on exactly the nights they
   are checked for Retirement — the night of each anniversary of `enteredTurn` if home, or the
   night their Party brings them home if away over it (DL-29 item 14). It covers the Heroes
   `heroState` covers: the Roster of each Guild that has not folded, in Guild id and Roster order.
7. **Retirement first; a Hero who retires does not decline.** `heroState` has run, so a Hero who
   retired tonight has left the Roster and `ageing` never reaches them: no draw, no change, no
   `hero.declined`. A career's Stats stay as they stood when it ended, and the History does not
   record a change to a Hero no one can field.
8. **From `declineAge`.** A due check declines when `ageOf` at that night is **at least**
   `declineAge` (40), so the first decline falls on the anniversary the Hero turns 40: INPUTS 5.5's
   "from 40" is read over the epic's "past", which for Retirement (DL-29 item 13) means "above".
9. **The draw.** Every due check takes **one** `int` draw from `heroes`, whatever the age, as every
   due Retirement check does, so tuning `declineAge` or `declineAreas` shifts no later draw. It
   picks among content's Hero Stats whose area is in `declineAreas` (default `["physical"]`), in
   key order (DL-19 item 3), **that are still above their content minimum**, so a Hero past the age
   loses exactly one Stat a year while any can fall. The Stat loses `declinePerYear` (1), never
   past its minimum; a Hero whose every such Stat is at its minimum, or a `declinePerYear` of 0,
   changes nothing and emits nothing. Stats are read through `baseStat`: one the row lacks reads as
   the content default and is written when it declines; a key content does not define never
   declines. **Potential is untouched**, so a declined Stat can be grown back by a Level (M3-S1),
   and its hint may rise as the gap widens.
10. **`hero.declined`** `{ heroId, statKey, delta, age }`, `delta` negative, naming the Hero (and,
    through `emit`, their Guild); not a Milestone, since the epic names none.
11. **Config.** `potentialHintBands`, `declineAge`, `declinePerYear` and `declineAreas` are added;
    the objects are frozen. No default changes, so `configVersion` stays 2 (as DL-29 item 16), and
    a save from before M3 reads the new fields as the defaults.

**Consequences.** Every due yearly check now takes a second `heroes` draw after the night's
Retirement draws, so a seed's Retirements after its first anniversary differ from M2's; saves are
snapshots (ADR-0001). Heroes generated at 18 to 36 start declining within 4 to 22 years, while
Retirement starts at 46. M3-S1's level-up reads a declined Stat as below Potential and may raise it
again, which the harness's Levels-gained counter measures against `hero.declined`. The M3 counter
task reads Retirements by age band from `hero.retired`'s `age`, and declines from `hero.declined`.
M4-S5 narrows the hint bands through the `config` it passes.

## DL-38 — Rankings are read, not narrated; Fame gates who will sign; Hall Improvements are built (M3-S5, M3-S6)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M3-S5 and M3-S6's
implementer); items 7 and 8 fold in two M2 verification defects at the orchestrator's request

**Context.** M3-S5 asks for the CLI's `show rankings`, an entry recording that Rankings are read and
not narrated, and Fame's first rule (R10 as amended, pre-M0 review B4): a `signing-refused`
rejection with the shortfall, `show pool` marking whom the player cannot yet sign, the automatic
policy and `steady` skipping such Heroes, every Guild gated alike, and a harness counter of
"signings refused by Fame per controller kind". It leaves open where the test of a signing lives,
the rejection's payload and its place among `recruit`'s checks, whether a refusal the policy or
`steady` never meet because they skip counts, how the counter is measured, and whether the Roster
wiped ending (DL-28 item 1), which asks whether a Guild can still sign anyone, should heed Fame.
M3-S6 (moved from M5, pre-M0 review D8) names `improvements.json` `{ facility, grade, cost, name }`
(INPUTS 7.3), `build` with `max-grade` and `insufficient-wealth`, `guild.improved`,
`quartersMoraleBonus`, and the policy and `steady` building the infirmary "when Wealth exceeds three
times its cost". It leaves open the content's keys and checks, where the build threshold lives, how
a build and a recruit share one Wealth, the bonus's default, and the CLI's words. The M2
verification, meanwhile, found the "cheapest Unattached Hero" rule written three times and the
Board's offered Quests read twice, and a policy test claiming "draws no random number" that a
`Math.random` tie-break passed.

**Decision.**

1. **Rankings are read, not narrated.** `rankings(world, by)` already has the epic's shape (DL-28
   item 8): every Guild not folded, highest first, ties by Guild id, `rank` its place from 1, the
   player's Guild not special-cased. Rank is never stored (rule 1), and M3 emits no
   `guild.rank-changed`: nothing reads one, a change of rank follows from Fame and Wealth moving,
   which have their entries already (`quest.resolved`, `guild.upkeep-paid`, `hero.recruited`), and
   an event per Guild per change of place would add entries on most nights to a History already
   four times its size target (DL-34). A front end that wants to tell the player they climbed
   compares two readings; the event is added when a front end asks for it.
2. **`show rankings [--by fame|wealth]`**, by Fame unless given: rank, id, name, controller and the
   measure, straight from `rankings`. `--by` on any other view is a bad command line (exit 2).
3. **One test of a signing: `signingRefusal(guild, hero, config)`** in `selectors.ts`, `null` when
   the Hero would sign and otherwise `{ fameRequired, fame, shortfall }`, where `fameRequired` is
   `fameRequiredPerLevel × (level − 1)` and Fame equal to it is enough. `fameRequiredPerLevel` is
   **10** (INPUTS 5.6). `recruit`, `cheapestUnattached` (so `steady` and the automatic policy) and
   the CLI's `show pool` ask it, and no other code works the threshold out. It asks nothing of
   Wealth, which stays the fee's check.
4. **`recruit`'s checks** are now `guild-folded`, `hero-not-unattached`, **`signing-refused`**,
   `insufficient-wealth`, in that order: the Hero refuses before a fee is asked, so a Guild short of
   both Fame and Wealth is told of the Fame, not sent away to save up for a Hero who would still
   refuse it. The rejection carries `{ heroId, fameRequired, fame, shortfall }`. It is the same
   rule for the player and every Rival (ADR-0002); the CLI puts it as "will not sign for a Guild
   with less than 40 Fame; The Test has 0, 40 short".
5. **`steady` and the policy pass over** a Hero who would refuse, and recruit the cheapest who would
   sign; they never ask one who would not, so neither meets `signing-refused` (a Rival's refused
   action is a bug, DL-30 item 3; the harness fails a run on one, DL-34 item 2).
6. **The Roster wiped ending does not heed Fame.** DL-28's check, an empty Roster and Wealth below
   the cheapest fee in the pool as tonight's refresh left it, stands: the cheapest fee of any Hero
   in the pool, whoever they would sign for. An ending is for good and a refusal for Fame is not.
   A Guild with an empty Roster cannot raise its Fame (Fame moves with Quest outcomes), so a Hero
   who refuses it tonight refuses it until they leave the pool; but every Hero the refill brings is
   Level 1 and signs for any Guild, and the pool turns over within `unattachedStayDays`. Heeding
   Fame would end a Guild, the player's game with it, for a pool that is for a few Days all
   veterans a fold released (a Rival's Roster settles near 20, DL-35, and the refill waits while
   the pool is over its size), whatever Wealth it holds: a false ending. Not heeding it leaves a
   Guild whose Wealth reaches only refusing Heroes waiting, and wipes it once its Wealth is short of
   every fee in the pool, as before. (This branch first heeded Fame here; the orchestrator asked
   that the choice be weighed, and it was reversed before merging.)
7. **One selector for each repeated rule** (M2 verification). `cheapestUnattached(world, deps,
   guild?)` in `selectors.ts` is the one "cheapest Hero in the Unattached pool, lowest id among
   equal fees, with the fee": given a Guild, only Heroes who would sign for it (item 3). `steady`'s
   `cheapestHire`, the policy's recruit and the Roster wiped ending (without a Guild, item 6) each
   had a copy and now call it. `offeredQuests(world)`, private in `controllers/rival.ts` and copied in
   the policy's `byReward`, moves to `selectors.ts` and both call it. `affordableImprovement(guild,
   facility, wealthMultiple, content)` is the one "build when Wealth is above a multiple of the next
   grade's cost" for `steady` (the game's multiple) and the policy (its own), item 12.
8. **The policy's determinism is tested, not asserted** (M2 verification). The test that says the
   policy draws no random number spies on `Math.random` and finds no call, across dispatches, a
   build and a recruit; a new test arranges equal rewards on a Board held in reverse id order and
   equal fees across the pool, and finds the Quests taken in Quest id order and the Hero of the
   lowest id recruited, with no call to `Math.random`. Replacing the reward tie-break with a random
   one fails it (checked by hand).
9. **The Fame counter, for the M3-close counter task** (not added to the harness here). "Signings
   refused by Fame" counts the refusals a Guild meets **whether or not it asks**: because the policy
   and `steady` skip, the `signing-refused` rejections they return are zero by construction and would
   say nothing about how Fame gates a Guild. It is measured with `unsignableHeroes(world, guild,
   config)` (`selectors.ts`, the pool's Heroes for whom `signingRefusal` is not null): once a Day,
   on the morning Turn before the policy acts, for every Guild in play, the count is added to its
   controller kind's total. The report gives, per controller kind, that total (Hero-Days refused),
   its mean per Guild-Day, and the Guild-Days on which at least one pool Hero refused. Beside it,
   the `signing-refused` rejections actually returned, which must be 0. No event is needed: the
   pool and every Guild's Fame are in `world`.
10. **`content/improvements.json`**, content table `improvements`, rows keyed `infirmary-1`,
    `training-yard-2`, `quarters-3` and so on, each `{ facility, grade, cost, name }`; `facility` is
    the Hall's own key (`infirmary`, `trainingYard`, `quarters`). Three grades of each facility at
    **200, 500 and 1,000** Wealth (INPUTS 7.3), named by the agent (the infirmary: Sickroom,
    Infirmary ward, Physicians' wing; the training yard: Practice yard, Drill ground, Tiltyard and
    armoury; the quarters: Dormitory, Private rooms, Comfortable lodgings). Content validation
    refuses a facility that is not one of the Hall's three, a grade that is not a whole number from
    1, a cost that is not a whole number above 0, and a facility whose grades are not 1 to n, each
    once; a facility no row names cannot be built. `contentVersion` becomes **5**; the engine's test
    content carries the same nine rows.
11. **`build(document, { guildId, facility }, deps)`** and its rule `applyBuild(world, …)` (DL-30's
    seam), in `actions/build.ts`, join `Action` and `GuildAction`. The next grade is content's row
    for the facility at its grade plus one (`nextImprovement`). Checks, in order: `guild-folded`
    (`{ guildId }`), `max-grade` (`{ facility, grade }`: no next row, a grade past content's top
    after content shrank included, rule 5), `insufficient-wealth` (`{ facility, cost, wealth }`;
    Wealth equal to the cost builds). A Guild id the world lacks, or a facility the Hall lacks,
    throws. Success deducts the cost, sets the grade and emits `guild.improved`, a Milestone naming
    the Guild, payload `{ guildId, facility, grade, improvementKey, cost }`. No selling or pulling
    down. Upkeep already charges `hallMaintenancePerGrade` a grade (DL-26).
12. **What a grade does, read where it matters.** The infirmary as DL-29 item 8 has it, at the
    Injury's infliction. The training yard by M3-S2's `training` phase, built in parallel: this
    branch proves only that `build` puts the grade on the Guild's row. The quarters through
    **`moraleBaselineFor(hero, world, config)`** (`morale.ts`): `moraleBaseline` plus
    `quartersMoraleBonus` for each grade of the Hero's Guild's quarters, held inside `moraleMin` to
    `moraleMax`; a Hero on no Roster has none. The Hero State Engine's drift reads it, the one place
    the baseline is worked out, which M4-S5's Inspiration and Guildmaster Traits extend. A generated
    Hero still starts at `moraleBaseline`. `quartersMoraleBonus` is **5**, chosen, having no INPUTS
    row: grade 3 lifts the baseline from 60 to 75, where `high` starts, so the best quarters hold an
    idle Roster high, and at grade 1 (65) one Death on the Roster (−10) still leaves a Hero `steady`.
13. **The controllers build the infirmary**, and only it: its next grade when Wealth is strictly
    above three times that grade's cost. `steady`'s multiple is a rule of the game,
    **`buildWealthMultiple` 3** in `GameConfig`; the policy's is the harness's, `buildWealthMultiple`
    3 in `PolicyConfig`, as each has its own `recruitWealthMultiple` (DL-34). Each makes **one
    purchase** an afternoon (`steady`) or a Turn (the policy): the build when due, else the recruit.
    Both are chosen on the world as it stands, so a second purchase could find the Wealth the first
    spent and be refused, which neither may be (item 5); a build due delays a recruit by one
    afternoon or Turn, three times a Guild's life.
14. **The CLI.** `build --facility infirmary|training-yard|quarters`, kebab-case words for the Hall's
    keys, as `--until` has its own words (DL-33): builds for the player's Guild, writes the save, and
    prints what was built and for how much, the Wealth and Upkeep after, and the next grade's cost
    or that the facility is at its highest; a refusal is put into words and nothing is written
    (exit 1); a word that is not a facility is a bad command line (exit 2). `narrate` has a line for
    `guild.improved`.
15. **The Improvements counter, for the M3-close counter task.** "Improvement grades reached by year
    10 per controller kind" reads `history.byType['guild.improved']`: the entries before Turn
    `10 × turnsPerYear`, the highest `grade` per Guild and `facility`, the Guild's controller kind
    from its row by the payload's `guildId`. A Guild that built nothing has grade 0 in each facility,
    so the denominator is the Guilds founded before year 10 (`guild.founded` entries, replacement
    Rivals included). Reported per controller kind and facility: the mean grade per Guild, and how
    many Guilds reached each grade 0 to 3.

**Consequences.** `configVersion` stays 2: `fameRequiredPerLevel`, `quartersMoraleBonus` and
`buildWealthMultiple` were added and no default changed (DL-28 item 10's reading). Until M3-S1 gives
Heroes Levels every Hero is Level 1 and nothing is refused; after it, a pool Hero above Level 1 is one
a folded Guild released, the generator making Level 1 Heroes, so the Fame counter measures how often
a fallen Rival's veterans are out of a Guild's reach. A Guild at Fame 0 signs only Level 1 Heroes and
needs Fame 40 for a Level 5. Wealth now has a sink: a Rival founded with more than 600 Wealth builds
its infirmary on its first afternoon, 1,700 Wealth over three grades, and 30 more Upkeep each ten
Days once all three are up; the M3 run should watch whether that hastens Rival folds, and
`buildWealthMultiple` is the dial. Tests that watch a recruit by a Guild with ample Wealth, and the
fold test with its two Days' grace, put building out of reach, as DL-30 item 11 stills what a test
does not watch. A merge with M3-S1 to S4 takes the next content version if one of them raised it too,
and ticks the training-yard half of M3-S6's second box once M3-S2's `training` phase is in.

## DL-39 — M2 close: verification, the timing tests, and which harness run a tag carries

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (the orchestrator, on the
M2 verifier's report)

**Context.** M2's twelve stories were built partly in parallel and verified independently before
the `m2-the-loop` tag: every box proved, 20 of 23 mutation tests turned a test red, and the three
survivors were weak tests, now strengthened. INPUTS 4.13 names "200 seeds × 20 years for the
per-milestone run, 1,000 × 20 for the tagged run".

**Decision.** (1) The validator's 1,000-Hero timing test asserts the fastest of repeated runs
under the unchanged 50 ms bound, and its retry is removed (commit `28f10a3`); this supersedes the
"retries twice" in DL-34. DL-34's remark that fast forward "can call" `partyFor` is out of date:
it does, through `staffableQuests`. (2) The `controller.kind` guard also counts calls of
`dispositionOf`; the Upkeep test checks the Turn each Guild pays on; the harness writes MiB where
it divides by 1,024². (3) The "cheapest Unattached Hero" rule, written three times in M2
(`rival.ts`, `policy.ts`, `endings.ts`), and the policy's copy of `offeredQuests`, become one
engine selector each in M3-S5 (DL-38), where the Fame gate changes who can be signed. (4) Each
milestone tag carries the epic gate's 200 × 20 run, committed as `harness/reports/m<n>-<date>.md`;
the 1,000 × 20 run INPUTS 4.13 calls "the tagged run" is made once, for the first-build tag at M8,
because a 1,000-game sweep costs over an hour of the machine per milestone and the counters are
read at 200.

**Consequences.** `m2-the-loop` carries `harness/reports/m2-2026-09-26.md` (200 × 20, validated
after every advance). The owner may ask for a 1,000 × 20 run at any tag; it is the same command
with `HEROESIM_SEEDS=1000`.

## DL-42 — Encounters, the drawn sequence, the Check and its two seams, and the Quest Engine's balance (M4-S1, M4-S2)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M4-S1 and M4-S2's
implementer)

**Context.** M4-S1 names `content/encounters.json` and its row, the typed `Consequence` union, the
templates' `encounterKinds` and `encountersMin/Max`, and the sequence drawn at generation from the
new `encounters` stream and stored as `encounterKeys`, so that the Board a seed produces is
unchanged (ADR-0009 as amended, pre-M0 review D7). INPUTS 6.1 says "count by difficulty", 2 to 5. It
leaves open: how a consequence is written in JSON and what each kind does; what content validation
refuses beyond the first box; how the count follows difficulty and how a slot's Encounter is
drawn; which draws come first; and how a Quest saved before M4, whose `encounterKeys` is `[]`, is
resolved. M4-S2 names `quest-engine/check.ts` and its capability, `resolveQuest` as the sequence,
`quest.encounter`, the band from the count of successes, the stub's deletion and three config
fields (INPUTS 6.2: best or summed weighted Stats, Skill rating × 2, a Synergy bonus, a ±20% roll
from `quests`). It leaves open: where effective Stats come from before gear; the shape of the two
terms M4-S3 and M4-S4 fill; what the working outcome holds and when a Party stops; the draws; the
events' payloads; what becomes of the stub's five fields and of `quest.resolved`'s `score` and
`ratio`; and the defaults, which the story asks a balance pass to set.

**Decision.**

1. **Twelve Encounters**, `content/encounters.json`, content table `encounters`: three `combat`
   (`ambush-on-the-road`, `the-restless-dead`, `hold-the-line`), three `travel` (`the-long-march`,
   `the-flooded-ford`, `lost-in-the-fells`), two `social` (`a-hostile-reeve`,
   `the-patrons-steward`), two `arcane` (`the-sealed-door`, `a-restless-power`) and two `stealth`
   (`past-the-watch`, `the-trapped-passage`). Fighting, marching and holding back a power are
   `sum` (the whole Party bears it); finding a way, talking, opening a seal and slipping past are
   `best` (one Hero does it). Harm is only on a failure. Each row is `{ name, kind, demands,
   aggregate, skillKeys, difficultyFactor, consequences: { success, failure } }`, demands weighted
   as a template's. The numbers are item 15's.
2. **A consequence is a flat object with a `kind`**, `{ "kind": "injury", "typeKey": "deep-cut",
   "chance": 0.2, "count": 1 }`, the engine's closed union `Consequence` (`content-types.ts`); a
   new kind is an engine change. What each does, applied by the Quest Engine (M4-S2) to a working
   outcome in sequence order:
   - `injury { typeKey, chance, count }`: `count` times, with probability `chance`, one Hero is
     injured with that type, drawn among the Party's living members who carry no Injury from this
     Quest yet (a Hero comes home with at most one, as `hero.injury` holds one);
   - `death { chance }`: with probability `chance` one living member dies and takes no part in the
     rest of the sequence; an Injury they took earlier on the Quest is dropped (no Hero is both,
     DL-29 item 5);
   - `morale { delta }`: summed over the sequence, applied once to each Hero who comes home;
   - `regard { between: "party", delta }`: summed into the outcome for M4-S4, which gives Regard
     between Heroes its writer and band events; until then nothing applies it;
   - `xp { factor }` and `wealth { factor }`: multiplied together over the sequence, then applied to
     the Quest's XP and to its reward (which a failed Quest does not pay, so a wealth factor matters
     only on a Quest that succeeds);
   - `fame { delta }`: summed, beside the Quest's own Fame effect.
3. **Content validation refuses** (the first box, and the rest of the row): a demand on an unknown
   or Guildmaster Stat, a repeated one, one weighing 0 or less, weights not summing to 1 within
   `demandSumTolerance`, or none; an unknown or repeated Skill; a `difficultyFactor` not above 0;
   an injury consequence naming an unknown Injury type or a `count` below 1; a `chance` outside 0
   to 1; a factor below 0; a kind, aggregate or consequence kind outside its choices; a field a
   consequence's kind lacks; and in a template, no `encounterKinds`, one listed twice, one that is
   not a kind, one no Encounter is of, or an `encountersMin/Max` range upside down or below 1. Morale
   and Fame deltas are whole numbers; a Regard delta is any number, its scale being M4-S4's.
4. **Template kinds and counts** (`quest-templates.json`): each template lists the kinds its tags
   suggest, two or three, and counts rising with its difficulty: `the-sickness-at-the-mill` 2,
   `escort-the-tithe`, `recover-the-strongbox` and `a-quiet-word` 2 to 3, `clear-the-barrow`,
   `guard-the-caravan`, `the-beast-of-the-fells` and `survey-the-old-workings` 2 to 4,
   `lay-the-restless-dead` 3 to 4, `hold-the-border-fort` and `the-counting-house-job` 3 to 5,
   `break-the-sealed-vault` 4 to 5. A content test holds them to INPUTS 6.1's 2 to 5.
   `contentVersion` becomes **6**; the engine's test content carries the same twelve keys and kinds.
5. **The count follows difficulty, with no draw** (`encounterCount`): `encountersMin` at the bottom
   of the template's difficulty range, `encountersMax` at the top, in proportion between, rounded
   to the nearest whole number; the range is the one the difficulty was drawn over, held inside
   `questDifficultyMin/Max`, and a range of one value gives `encountersMin`. "By difficulty" read
   as a rule, not a chance: a harder Quest of a kind is always at least as long.
6. **The draw.** After the Board's three draws (template, difficulty, Days — DL-25 item 4,
   unchanged), `generateQuest` draws the sequence from `encounters` and no other stream, two draws
   an Encounter: a kind uniformly among the template's `encounterKinds` as listed, then an Encounter
   uniformly among content's of that kind in key order (`drawSequence`). A kind a Patron's
   templates name that content has no Encounter of throws before any draw, as the generator's other
   programming errors do. `encounters` joins `streamNames` after `quests` (ADR-0009's order); an old
   save gains it through `ensureStreams`. **The Board is unchanged**: a test pins, from the engine
   at M3's end, a seed's first Board, the Board after 30 Days of refreshes and expiries (no Rivals,
   no Party sent) and the `board` stream's state then, and M4's engine draws them the same.
7. **A Quest saved before M4** (its `encounterKeys` `[]`, offered or already taken) is resolved
   through a sequence drawn when it resolves (`sequenceFor`), from `encounters`, by the same rule
   and its template's kinds and count at its difficulty; for a template content no longer defines,
   one Encounter drawn among all of content's. Drawing at resolution rather than at dispatch covers
   Quests already away when the save is loaded, with one rule. A stored key content no longer
   defines is left out, and a Quest left with none draws afresh; the validator warns of such a key
   (`unknown-encounter`, data-model rule 5).
8. **The Check** (`quest-engine/check.ts`): `capability(heroes, encounter, world, deps)` is, for
   each demand, its weight times the best member's effective value of the Stat (`best`) or the
   members' sum (`sum`); plus, for each of the Encounter's Skills, `skillBonusPerRating` times the
   best rating any member holds, 0 when none does; plus the Synergy term; all times the teamwork
   scalar. It takes `world` (for the teamwork scalar and effective Stats) and `deps`, not the epic's
   `content, config`, as every entry point takes `deps`. A demand on a Stat, or a Skill, content no
   longer defines counts for nothing (rule 5). `check(heroes, encounter, quest, world, deps)` rolls
   `capability × (1 + r)`, `r` one draw from −`checkVariance` to +`checkVariance` from `quests`,
   never below 0; succeeds when the roll is at least `difficultyFactor × quest.difficulty`; and
   records `roll`, `target` and `margin = roll − target`.
9. **Effective Stats are one selector**, `effectiveStats(hero, world, deps)` in `selectors.ts`:
   every Hero Stat content defines, at its base (`baseStat`) until something modifies it. M5-S2 adds
   gear there, and any other modifier belongs there (M4-S5's `classStatBonus` Trait effect names
   `effectiveStats` too), so the Check and every view read one value. It takes the world, which
   those modifiers read and nothing reads yet.
10. **The two seams**, each a function in its own module returning its neutral value, with a
    comment naming the story that fills it: **`synergyBonus(heroes, encounter, base, deps)`** in
    `quest-engine/synergy.ts`, 0 until M4-S3, added to the capability before the scalar and given
    `base` (the Stats and Skills term) so that a Synergy's `factor` can be read against it;
    **`teamwork(heroes, world, deps)`** in `quest-engine/teamwork.ts`, 1 until M4-S4, multiplying
    the whole. `heroes` is the Party's members still in the sequence.
11. **The sequence** (`quest-engine/resolve.ts`): `resolveQuest(world, quest, party, deps)` returns
    `{ outcome, encounters }`. For each Encounter in order, the living members are checked and the
    outcome's consequences applied in content's order to a working outcome (item 2's rules). A
    Hero killed takes no part in any later Check. **A Party with no one left stops**: the
    Encounters it never reached are not checked, emit nothing, and count as not succeeded. The band
    is `questBand(successes, the sequence's length, config)` over `bandBySuccessShare`
    **`{ successAbove: 0.5, strongAtLeast: 1 }`**: all strong, a majority success, else fail, so a
    Quest of two Encounters is strong or failed. M2's rules run through the band as before: the
    reward on a success (times the wealth factors, rounded), nothing on a failure; the Fame effect
    won or lost (plus the Encounters' Fame); XP by DL-36's `xpBandFactor` (times the XP factors,
    rounded down); `moraleOnStrongSuccess` on a strong success; `moraleOnRosterDeath` for each Death.
12. **Draws.** Everything but a pre-M4 Quest's sequence is drawn from `quests`: one draw a Check,
    then, for each consequence of its outcome, three per `count` of an Injury (whether it lands, on
    whom, its Days) and two for a Death (whether, on whom), taken whether or not they land, so tuning
    a chance shifts no later draw. An Injury's Days are its type's range times
    `infirmaryHealFactor` at the Guild's grade then, as DL-29 item 8. Parties resolve in id order.
13. **Events.** `quest.encounter`, not a Milestone, one per Encounter checked, in sequence order,
    all before `quest.resolved`: `{ questId, partyId, guildId, index, encounterKey, kind, roll,
    target, margin, outcome, injured, died }` (`outcome` is `success` or `failure`), naming the
    Quest, the Party, the Guild and any Hero it hurt. `quest.resolved`'s outcome loses the stub's
    `score` and `ratio` and gains `successes`, `encounterCount`, `moraleDelta` and `regardDelta`.
    `hero.morale-changed` gains the cause `encounters`: the Encounters' Morale, summed, one change a
    Hero home, before any strong-success change, and none when the sum is 0. The CLI narrates
    `quest.encounter` ("party-000004 failed at Ambush on the road: … was injured"), and `show board`
    gains an Encounters column, each Quest's kinds in order ("drawn on the way" for a pre-M4 Quest).
14. **The stub is deleted, and its fields leave the config**: `stubBands` for `bandBySuccessShare`,
    `stubVariance` for **`checkVariance` 0.2**, `stubSkillBonusPerRating` for
    **`skillBonusPerRating` 2** (INPUTS 6.2's ±20% and rating × 2), and `stubInjuryChance` and
    `stubDeathChance` for each Encounter's consequences, which are content. A save's `meta.config`
    that holds them keeps them, unread (data-model §2). Rivals resolve through the same engine: the
    night's `questsConclude` resolves every Guild's Parties. `check.ts` names nothing of the
    Guildmaster's, and a test reads the file to hold it so (M4's third risk).
15. **The balance pass**, measured under the automatic policy (DL-34) on the core content, 16
    seeds × 20 years, not validated, 16 processes (scratch runs, not committed; `countGame`'s
    counters). *Before*, the engine at M3's end (v1.0-dev `8229670`, the stub, config version 3):
    no game ended; the player failed 40.3% of 91,598 Quests, succeeded 37.3%, strongly 22.4%; the
    Rivals 8.4% / 27.0% / 64.5% of 374,113; a game, the player's Heroes injured 1,110 times, 113
    died, 117 recruited; the Rivals' 1,410, 100 and 749; Rivals folded 27.6 times a game; the
    player's Roster at a mean Level 5.34. (DL-34's M2 run: the player 52.2 / 33.4 / 14.4, 797
    injured, 88 died; the Rivals 11.7 / 33.4 / 54.9, 1,480 and 110.) *Trials*, 8 seeds × 3 to 5
    years: the first factors (`sum` 0.3, `best` 0.18) bankrupted both of 2 seeds within a year, the
    player failing 62% at Level 1; factors × 0.8 made two of every five Quests strong and halved
    the Deaths; × 0.9 and × 0.85 with twice the Death chance gave 7 Deaths a year; a variance of 0.3
    moved the bands by a point, so INPUTS 6.2's 0.2 stays. *Chosen*: every `sum` Encounter's
    `difficultyFactor` **0.25** and every `best` Encounter's **0.15**; a Death's chance **0.03**
    (on the three `combat` Encounters, `a-restless-power` and `the-trapped-passage`); Injury
    chances **0.08 to 0.25**, one Hero a time but `hold-the-line`'s two. *After*: no game ended;
    the player failed 37.5% of 91,808 Quests, succeeded 22.4%, strongly 40.2%; the Rivals 18.9% /
    15.6% / 65.5% of 351,163; a game, the player's Heroes injured 931 times, 79 died, 83 recruited;
    the Rivals' 2,080, 180 and 446; Rivals folded 20.9 times; the player's mean Level 5.34. The
    player's Encounters succeeded 56% (`arcane`) to 69% (`stealth`), the Rivals' 75% to 82%.
    Validated after every advance, 4 seeds × 2 years: no refusal, no warning. **`configVersion`
    goes from 3 to 4** (the stub's defaults removed, the Quest Engine's added); no other default
    changes.

**Consequences.** Every Quest drawn from M4 on carries two to five Encounter keys, which `show
board` shows before dispatch. The `encounters` stream moves only when a Quest is generated or a
pre-M4 Quest resolves. The Quest template's own `demands` and `skillKeys` stay: `partyFor` (the
Rival controller's and the policy's staffing rule) and `show board` read them, and the Check reads
the Encounters' instead. A save made before this entry plays under config version 3 until the player
rebases, and a loaded game resolves through the Encounters whatever its config, the stub's fields
being unread.

What the pass leaves for the owner: the player's Deaths fall to 79 a game, near M2's 88; the
Rivals', who take four times the Quests on the easiest terms, rise to 180. Success and strong
success have swapped places beside M2 (22% and 40%): a Party's Checks on one Quest share its Stats
and its difficulty, so they tend to go all one way, and a Quest of two Encounters has no plain
success; `bandBySuccessShare` is the dial, and the epic's "all strong, majority success" its
default. The player's Wealth still grows without end (137,000 after 20 years, 207,000 before), which
is M3's close to tune. **The History grows by about half** (283,610 entries a 20-year game, 201,677
before): a `quest.encounter` for each of about three Encounters a Quest, as the epic asks; a lighter
entry is the lever if §7's save size is chased. A game's Turns cost no more (a 3-year game alone:
24.2 s before, 21.2 s after).

**For M4-S3, M4-S4 and M4-S5.** M4-S3 fills `synergyBonus` and adds the Synergy keys to
`quest.resolved`; M4-S4 fills `teamwork` and applies `outcome.regardDelta` (the Encounters' Regard,
summed) beside `regardPerSharedQuest` with its band events; M4-S5's `classStatBonus` goes in
`effectiveStats`. **For the M4-close counter task**: encounter outcomes by kind and outcome are the
`quest.encounter` entries by `payload.kind` and `payload.outcome`, split by the controller kind of
`payload.guildId`'s Guild (the harm each kind does is in its `injured` and `died`); Injuries by type
are the `hero.injured` entries by `payload.typeKey`, joined to the Guild as DL-34 item 4 joins them.

## DL-43 — Requirements by reason, Patron Regard and the Board, the Guildmaster's Stats and Traits, and Guildmaster Regard (M4-S5)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M4-S5's implementer)

**Context.** M4-S5 asks for a reason on `dispatch`'s `requirement-unmet` (`class`, `skill`,
`party-size`) and a CLI `preview`; Patron Regard for each Guild written on Quest outcomes (+1, −2,
and −1 "when their offer expires untaken by anyone"), a Board refresh weighting Patrons by their
mean Regard across Guilds (closing DL-25's uniform draw), and a nightly recovery toward neutral
(pre-M0 review B5); one rule for each Guildmaster Stat, Guild-side and inside the selector or phase
the table names (R8, B6, D9, INPUTS 6.5); the closed Trait effect union with the six starter
Traits' effects (B2, INPUTS 3.13); Guildmaster Regard writers for Patrons and Roster Heroes with
band-crossing events and "Regard for a Guild is a selector over Regard for its Guildmaster" (B3);
and `show guildmaster`. It leaves open: the shape of the reason; Regard's scale and bands, which
M4-S4 names (`regardBands`) but this story needs first; how an expiry "untaken by anyone" is
charged across Guilds; how the mean weights the draw; what "within 1 / `patronRegardRecoveryPerYear`
years" makes the rate's unit; how each Stat reads "across the Stat range" and "up to"; what
"narrowing" hint bands means; where Negotiation meets the reward; the Traits' effects when INPUTS
3.13's example gives Miser two; and how the 50-seed acceptance is run.

**Decision.**

1. **Requirements by reason.** `requirement-unmet` carries `unmet: UnmetRequirement[]`, every
   requirement the Party misses in the order party size, Class, Skill, each named by
   `requirement: 'party-size' | 'class' | 'skill'` with its detail (`size`, `partySizeMin/Max`;
   `classKey`; `skillKey`). The separate `party-size` rejection of M2-S4 is folded into it, as the
   epic lists party size among the reasons: `dispatch`'s checks are now `guild-folded`,
   `quest-not-offered`, `hero-not-on-roster`, `hero-unavailable`, `requirement-unmet`. The one test
   is `unmetRequirements(quest, party)` (actions/dispatch.ts), which the CLI's `preview` reads too.
2. **One Regard scale for every holder**, `regardMin` −20 to `regardMax` 20, neutral 0 (absence),
   and one set of bands, `regardBands` `{ hostile: −20, cool: −12, neutral: −4, warm: 4, close: 12 }`,
   read as Morale's are (the highest start reached). M4-S4's Regard between Heroes is meant to
   share both; its story may retune them. `adjustRegard` holds a value in the scale and sets
   `since` and `reason` (an event type: `quest.resolved`, `quest.expired`); a drift leaves them, and
   an entry drifted back to 0 is removed. **Every** Regard change, discrete or drift, emits its event
   only on a band crossing, as the epic has M4-S4's `hero.regard-changed` do.
3. **Where Regard is kept.** A Patron's Regard for a Guild is `patron.regard[guildId]`, as the
   M1 fixture already had it. "Regard for a Guild is a selector over Regard for its Guildmaster" is
   read as R9's Guildmaster Regard for a Guild: `guildmasterRegardForGuild(guildmaster, guildId,
   world)` returns their Regard for that Guild's Guildmaster, and nothing is stored under a Guild's
   id in a Guildmaster's map. Guildmaster Regard is keyed by the Patron's, Hero's or (M6-S2)
   Guildmaster's id.
4. **The writers** (regard.ts), for every Guild alike, player's and Rivals' (ADR-0002). A success is
   any band but `fail`. On a resolution (`questsConclude` calls `regardOnQuestResolved`): the
   Patron's Regard for the Guild `patronRegardOnSuccess` 1 × Influence, or `patronRegardOnFailure`
   −2; the Guildmaster's Regard for the Patron `guildmasterRegardOnPatronSuccess/Failure` 1 / −1;
   and for each Hero of the Party home on the Roster (the dead excluded) `…OnHeroSuccess/Failure`
   1 / −1. **An offer expiring untaken** costs `patronRegardOnExpiry` −1 with **every Guild in
   play**: no Guild took it, so each passed it over and each is charged alike; a folded Guild is out
   of play and is not. The alternative, only the Guilds that could have staffed it, would need a
   staffing test for every Guild at every expiry and gives the same mean in the common case.
   Events: `patron.regard-changed` `{ patronId, guildId, cause, before, after, bandBefore,
   bandAfter }` naming the Patron and the Guild, `cause` one of `quest-success`, `quest-failure`,
   `offer-expired`, `recovery`; `guildmaster.regard-changed` `{ guildmasterId, guildId, entityId,
   cause, before, after, bandBefore, bandAfter }` naming the Guildmaster, the entity and the
   Guildmaster's Guild. Neither is a Milestone.
5. **The Board's weighting** (R22). Each refresh reads, once, after its expiries, each Patron's mean
   Regard across the Guilds in play and draws Patrons in proportion to
   `max(0, 1 + boardRegardWeight × mean / reach)`, the reach being `regardMax` for a positive mean
   and −`regardMin` for a negative one. **`boardRegardWeight`** is a new field, default 1: a Patron at
   the scale's top posts twice as often as one at neutral, one at its bottom never; 0 restores
   DL-25's uniform draw. The draw is `weightedPick` (rng.ts, one draw), which with every weight 1 draws
   what `pick` draws: a new world opens on the Board it opened on before this story, and a seed's
   Boards change only once Regard moves, which is expected.
6. **The Patron State Engine** is the night phase `patronState`, after `guildState` and before
   `poolRefresh` (approach §2). Each night every Patron's Regard for each Guild in play moves toward
   neutral by `patronRegardRecoveryPerYear` × the scale's reach ÷ the year's nights, from either
   side, and stops there. The rate is a **share of the scale's reach a year**, so that the epic's
   bound holds for any start: even the scale's end is neutral within 1 / `patronRegardRecoveryPerYear`
   years. Default **0.5** (ten points a year): a bad year is gone within two.
7. **The Guildmaster's Stats** (guildmaster.ts). Each rule reads where the Stat falls between its
   content `min` and `max`: Negotiation from −1 at the bottom to +1 at the top ("±10% across the
   range", INPUTS 6.5), the other four from 0 at the bottom to 1 at the top ("up to"). A Stat content
   does not define has no effect. Defaults: **`negotiationRange` 0.1** (INPUTS 6.5),
   **`inspirationMoraleShift` 10**, **`coachingFactor` 0.5**, **`influenceFactor` 0.5**,
   **`judgementHintSharpening` 0.25**. Where each lives:
   - *Negotiation* at dispatch: `applyDispatch` writes the reward agreed,
     `negotiatedReward(reward, guildmaster)` rounded, onto the Quest it takes, which the Quest Engine
     pays on a success; `quest.taken` carries it as `reward`. And in `signingFee(hero, deps, buyer)`,
     × (1 − the same), before the fee's one rounding down: `recruit` passes the buying Guild's
     Guildmaster, `cheapestUnattached` does so given a Guild (so `steady` and the automatic policy
     pay the same price), and the Roster wiped ending now prices a way back at the Guild's own fee
     (`cheapestUnattached(world, deps, guild, heedFame = false)`, keeping DL-38 item 6). With no
     buyer it is the list price, which only callers from before this story ask for. M6-S2's
     `transferFee` multiplies by the same `feeFactor`.
   - *Inspiration* and `guildMoraleShift` Traits in `moraleBaselineFor(hero, world, config,
     content)`, the sum rounded to a whole number so that Morale stays whole.
   - *Coaching* in `training`: `xpPerTrainingDay × grade × (1 + up to coachingFactor)`, rounded down,
     as Quest XP is.
   - *Influence* on the gains in a Patron's Regard for the Guild only; losses are not scaled.
   - *Judgement* by `judgedHintBands`: each start of `potentialHintBands` × (1 − up to
     `judgementHintSharpening`). "Narrowed" is read literally: every band but the open last one is
     narrower, so a sharper judge calls a smaller gap promising or exceptional. `potentialHint` is
     unchanged (DL-37 item 4); `show hero` passes the player's Guildmaster's bands.
8. **The Trait effects**: the closed union `classStatBonus { classKey, statKey, delta }`,
   `guildMoraleShift { delta }`, `upkeepFactor { factor }` (`TraitEffect`, content-types.ts), one
   effect a Guildmaster Trait, none a Hero Trait; content validation refuses an unknown kind or
   field, a Class or Hero Stat content lacks, a bonus or shift of 0, a factor of 0 or less, a
   Guildmaster Trait without an effect and a Hero Trait with one. The six: *Old soldier* +1 Weaponry
   to Warriors, *Well liked* Morale baseline +5, *Thrifty* Upkeep ×0.9 (buffs); *Miser* Morale
   baseline −5, *Spendthrift* Upkeep ×1.1, *Mistrusts magic* −1 Arcana to Mages (penalties). INPUTS
   3.13's example gives Miser both Upkeep ×0.9 and baseline −5; the epic allows one effect a Trait,
   so Miser keeps the penalty and Thrifty carries the saving. `contentVersion` is **6**; the
   engine's test content carries the same six. `classStatBonus` is applied in **`effectiveStats(hero,
   world, content)`** (selectors.ts), held inside the Stat's range, for Heroes of the Class on the
   Guildmaster's Guild; M4-S2's check, built in parallel, should read Stats through it (the stub in
   `quest-engine/`, which this story does not touch, still reads base Stats). `upkeepFactor` is in
   `upkeep(guild, world, config, content)`, the product rounded to a whole Wealth; `content` is
   optional so that tests written before this story still compile, and every rule, controller and
   front end passes it (the harness's policy included).
9. **The CLI.** `show guildmaster [guildId]` prints the Guildmaster's Stats with what each bears on,
   their Traits with each effect in words, and their Regard for every Patron, each Hero on the
   Roster and each other Guild in play (through its Guildmaster), as bands only; `show patrons` adds
   each Patron's Regard for the player's Guild as a band; `preview --quest --heroes` prints each
   requirement met or missed, any Hero who cannot go, the reward agreed and `dispatch`'s own verdict
   (its rule run on a copy), writing nothing, as a list of sections M4-S3 extends with Synergies;
   `dispatch` prints the reward agreed. `narrate` has a line for each new event, naming bands only.
10. **The 50-seed acceptance** is an engine test (`phases/patron-offers.test.ts`), as the
    orchestrator asked, not a harness run: 50 seeds, a year each of the Board refresh and the
    Patron State Engine, the player taking every Quest two chosen Patrons post, one's always failing
    and the other's always succeeding, the rest expiring. The failing Patron offered 1,082 Quests in
    all against 56,445, fewer in every seed.
11. **Versions.** `configVersion` stays 3: fields are added and no default changes (DL-38's reading).

**Consequences.** Tests that watch a fee, a Morale baseline or training XP pin
`negotiationRange`, `inspirationMoraleShift` or `coachingFactor` to 0, or clear the generated
Guildmasters' Traits, and say so; `effectiveStats` and M4-S2's own Stats selector are to be
reconciled at merge. A scratch run of the automatic policy (4 seeds × 3 years, default config)
saw about 8% of offers expire, no Patron silent in years 0 to 2, 101 to 213 offers per Patron in
year 2, most Patrons neutral or cool with the Rivals and cool or hostile with the player, and the
player's Guildmaster's Regard mostly warm or close by year 3 (nothing decays it): the M4 counters
should watch these. **For the M4-close counter task:** *Patrons silent* reads
`history.byType['quest.offered']` by `payload.patronId` per year of `turn` and counts the Patrons
with none, over the years the game played through whole; *the player's Guildmaster's
Regard band distribution at year 10* is `regardBandCounts(guildmaster.regard, config)` on the world
at Turn `10 × turnsPerYear` (or the crossings in `guildmaster.regard-changed`, `bandAfter` by
`entityId`), split by the entity's table (Patrons, Heroes).

## DL-44 — Merging M4-S2's Quest Engine with M4-S5's Guildmaster rules: one effective Stats selector, content version 7

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (the M4 integration merge)

**Context.** M4-S1 and M4-S2 (DL-42) and M4-S5 (DL-43) were built in parallel from v1.0-dev
`8229670`. Each added an `effectiveStats` selector to `selectors.ts`: M4-S2's `(hero, world, deps)`,
base Stats only, which its Check reads; M4-S5's `(hero, world, content)`, which applies the
Guildmaster's `classStatBonus` Traits and which nothing but its own tests read, since the stub it
knew still read base Stats. Both raised `contentVersion` to 6 for different content. M4-S5 folded
`party-size` into `requirement-unmet`'s `unmet[]` and wrote Patron and Guildmaster Regard from the
stub's outcome in `questsConclude`, which M4-S2 had rewritten around the Encounter sequence. M4-S5's
Board weighting by Patron Regard moved a Board that M4-S2 pins as M3's.

**Decision.**

1. **One `effectiveStats(hero, world, content)`**, in `selectors.ts`: M4-S5's body (base Stat plus
   the Class Stat bonuses of the Guildmaster of the Hero's Guild for the Hero's Class, held inside
   the Stat's range; a Hero on no Roster, or of a Guild whose Guildmaster has no row, has only their
   base) under M5-S2's epic signature `(hero, world, content)`, which M5-S2 extends with gear. M4-S2's
   `(hero, world, deps)` is gone, superseding DL-42 item 9's signature, not its rule: the Check's
   `capability` reads every member's Stats through it (`effectiveStats(hero, world, content)`), so a
   Guildmaster Trait's Class Stat bonus now moves Quest outcomes for that Guild's Heroes of that
   Class and no other, every Guild alike. `check.ts` still names nothing of the Guildmaster's (M4's
   third risk): the rule lives in the selector. A base Stat is always inside its range, so for a
   Guild with no such Trait the Check reads what DL-42 measured. Tests: `check.test.ts` shows Old
   soldier lifting the capability of its own Guild's Warrior by 1 and turning a Check at the edge,
   and nobody else's, for the player's Guild and a Rival's; Mistrusts magic lowering its own Mages'
   Arcana only.
2. **`contentVersion` is 7**: the core content holds both M4-S1's Encounters and M4-S5's Trait
   effects, which no version 6 held. **`configVersion` stays 4** (DL-42): the merge changes no
   default.
3. **Requirements.** The Quest Engine tests no requirement: `dispatch` alone does, through
   `unmetRequirements` (DL-43 item 1). The staffing rule `partyFor`, which `steady` and the
   harness's policy share, is held to it by a test (`rival.test.ts`): every Party it names meets
   `unmetRequirements`, size, Class and Skill, so neither is refused on `party-size`, now one
   reason among `unmet[]`.
4. **Patron and Guildmaster Regard are written once per resolved Quest**, in `questsConclude`'s
   `conclude`, after the Encounter sequence's outcome is applied: `regardOnQuestResolved` with
   `succeeded` for any band but `fail` of DL-42 item 11's `questBand`, the Heroes home on the Roster,
   for every Guild's Party alike. A test (`quests-conclude.test.ts`) resolves a strong and a failed
   Quest for the player's Guild and for a Rival's and finds the Patron's Regard for that Guild moved
   by `patronRegardOnSuccess` or `patronRegardOnFailure` once, the Guildmaster's for the Patron by
   one writer's delta once, and no other Guild's Regard moved.
5. **The Encounters' Regard stays unapplied.** `outcome.regardDelta` (the Encounters' `regard`
   consequences, summed, between Heroes) is M4-S4's to apply (DL-42 item 2); M4-S5's writers read
   the band, never `regardDelta`, so nothing is counted twice. M4-S4 applies it on DL-43 item 2's
   scale and bands, or retunes them.
6. **The pre-M4 Board test pins `boardRegardWeight` 0.** Offers expiring over its 30 Days move
   Patron Regard, which DL-43 item 5's weighting reads, so the Patrons drawn change, as DL-43
   expects; with the weight at 0 (DL-25's uniform draw) the pinned Board, and the `board` stream's
   state, are M3's still, which is what the test holds M4-S1's new stream to.

**Consequences.** DL-42's balance pass was measured without M4-S5's rules: the reward agreed
through Negotiation (±10%), the six Traits (Old soldier's Weaponry and Mistrusts magic's Arcana
now reach the Check; Thrifty and Spendthrift move Upkeep), Coaching, and the Board's weighting. Only
a smoke run is made here: 4 seeds × 5 years, the automatic policy, validated after every advance.
The M4 close's balance pass measures them together.

## DL-45 — Synergies: the row, the match, how a bonus combines, the Quest's record and the preview (M4-S3)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M4-S3's implementer)

**Context.** M4-S3 names `content/synergies.json` and its row `{ key, name, requires: { classes?:
Record<ClassKey, count>, skills?: SkillKey[] }, bonus: { flat?, factor? }, kinds?: EncounterKind[] }`,
six starter Synergies written by the agent (INPUTS 6.4: "e.g. Warrior + Healer, Rogue + Mage, three
Warriors"), a `synergiesFor(party heroes, content)` selector, the bonus applied in the Check through
DL-42's seam `synergyBonus(heroes, encounter, base, deps)`, `quest.resolved` listing the Synergy keys
that applied and nothing emitted per Encounter, and a CLI view of a proposed Party's Synergies, which
the box calls `show party` and M4-S5 built as `preview --quest --heroes` for this story to extend
(DL-43 item 9). It leaves open: what meeting a count or a Skill means; what `factor` is, and how
`flat`, `factor`, `base` and several Synergies combine; which members are matched on an Encounter;
what "applied" means for the Quest's list; what content validation refuses; and the values.

**Decision.**

1. **The match** (`quest-engine/synergy.ts`, beside the seam; exported from the engine). A Party
   meets a Synergy (`meetsRequirement`) when it has **at least** the count named of each Class, and
   each Skill named is held, at any rating, by at least one member; different members may hold
   different Skills, and a Hero counts once, for their Class. `synergiesFor(heroes, content)` is
   every Synergy met, in key order, whatever the Encounter: the selector a front end shows for a
   proposed Party. `synergiesOn(heroes, encounter, content)` narrows it to those whose `kinds` hold
   the Encounter's kind, or that name none (`appliesOn`: every kind). `synergiesFor` lives with the
   seam rather than in `selectors.ts`, as `unmetRequirements` lives with `dispatch`.
2. **The bonus.** `factor` is a **multiplier**, as every `factor` in content is (the Encounters' `xp`
   and `wealth` consequences, `upkeepFactor`): 1.1 is +10%. On an Encounter, the factors of the
   Synergies that apply are **multiplied together and scale `base`** (the capability's Stats and
   Skills term) and nothing else; their **`flat`s are summed and added unscaled**; a missing `factor`
   is 1 and a missing `flat` 0. The seam returns `base × (∏ factor − 1) + Σ flat`, so the capability
   is `(base × ∏ factor + Σ flat) × teamwork` (DL-42 item 10). No Synergy's bonus is read against
   another's, so the order Synergies are listed in never matters; a flat is worth the same to any
   Party, a factor more to a stronger one. Multiplying the factors follows the Encounters' factors
   (DL-42 item 2); with the starter values, multiplying and adding differ by under half a point of
   capability. No config field: a Synergy's numbers are content (principle 6).
3. **Who is matched**: the members still in the sequence, whom the Check reads (DL-42 items 10, 11).
   A Synergy lost with a member who died adds to no later Encounter.
4. **The Quest's record.** `QuestOutcome.synergyKeys`, and so `quest.resolved`'s payload, lists each
   Synergy that added to at least one Check of the sequence (met by the members checked, on an
   Encounter of its kinds), once, in key order, `[]` for none. A Synergy the Party met only on kinds
   its Quest did not have is not listed. `quest.encounter` gains nothing (the epic: "emits nothing
   per encounter"). The event type makes the field optional: an entry written before this story lacks
   it, and reads as none. The CLI's narration of `quest.resolved` names them ("Synergies: Shield wall,
   Sword and salve."), and says nothing when there are none.
5. **Content validation refuses** (the parser the shape, `validateContent` the rest): a requirement
   naming no Class and no Skill; a Class or Skill content lacks; a count that is not a whole number
   from 1; a Skill listed twice; a bonus with neither `flat` nor `factor`; a `flat` of 0 or less; a
   `factor` of 1 or less, a Synergy being a bonus and a factor a multiplier, so that a factor written
   as a share (0.1 meaning +10%) is caught; `kinds` listed empty (it is left out for every kind),
   naming a kind that is not one of the five, or naming one twice; and a field the row, its
   `requires` or its `bonus` does not have. `synergies.json` is required and may be `{}`. A Synergy no
   Party could meet (counts above every template's Party size) is not refused.
6. **The six** (`content/synergies.json`, table `synergies`); the engine's test content carries the
   same six, and no earlier test's outcome changed with them:

   | Key | Requires | Bonus | Kinds |
   | --- | --- | --- | --- |
   | `sword-and-salve` | a Warrior and a Healer | +2 | combat, travel |
   | `shadow-and-spell` | a Rogue and a Mage | ×1.1 | stealth, arcane |
   | `shield-wall` | three Warriors | ×1.15 | combat |
   | `a-full-company` | one of each Class | +1 and ×1.05 | every kind |
   | `wards-and-blessings` | Warding and Benediction | +3 | arcane, combat |
   | `scouting-ahead` | Tactics and Stealth | +2 | travel, stealth |

   Against DL-42's scale (a `sum` Encounter's target is 0.25 × difficulty, a `best` one's 0.15 ×,
   and a Party's base is a few tens on `sum`, ten to twenty on `best`), a flat of 2 or 3 is worth
   about 5 to 20% of a capability and a factor its stated share. **`contentVersion` becomes 8**;
   **`configVersion` stays 4**, no config field being added or changed.
7. **The preview.** `preview --quest --heroes` gains a Synergies section: each Synergy the named Heroes
   would have (`synergiesFor`), its bonus, its kinds, and how many of the Quest's drawn Encounters are
   of them ("Sword and salve: +2 on combat and travel Encounters; 2 of this Quest's 3."), "drawn on
   the way" for a Quest drawn before M4 (DL-42 item 7), or "None: this Party meets no Synergy." This
   meets the epic's `show party` box, as DL-43 item 9 intended.
8. **The balance check** (scratch runs, not committed): 12 seeds × 5 years under the automatic
   policy (DL-34) and the default config, the core content with its six Synergies and with none,
   the run with them validated after every advance (no refusal, no warning, no policy action
   refused). *With them*: a Synergy applied on 17.3% of the player's 18,373 Quests (0.18 a Quest:
   3,031 Quests with one, 149 with two) and on 15.0% of the Rivals' 70,834 (0.15 a Quest); by key,
   the player's Sword and salve 1,383, Scouting ahead 821, Shadow and spell 807, Shield wall 204,
   Wards and blessings 114, and A full company never (`partyFor`, which the policy and `steady`
   share, sends the fewest Heroes a Quest allows, one to three in the core templates, so never four
   of four Classes). *Shift*: the player's Quests
   succeeded 60.6% without and 62.9% with (strong 38.9% to 41.3%, failed 39.4% to 37.1%), its
   Encounters 60.9% to 63.3%; the Rivals' Quests 82.9% to 83.0%, their Encounters 80.6% to 80.8%; the
   player's Deaths a game 22.3 to 21.2, its Injuries 264 to 239. A bonus on about one Quest in six
   that moves success by two points is a flavour, not a new balance, so **no value was adjusted**; a
   player who composes Parties for them will see more, which is the point of showing them in
   `preview`.

**Consequences.** A Party's Classes and Skills now move its Checks beyond its Stats, for every Guild
alike (ADR-0002); neither the automatic policy nor `steady` chooses a Party for its Synergies
(`partyFor` staffs by the template's demands), so the rates above are what chance composition earns,
and a Synergy-seeking policy would earn more. A new Synergy is a content change with no engine change
(principle 6); a new kind of bonus is an engine change and earns a decision. The M4 close's balance
pass measures Synergies beside M4-S4's teamwork. **For the M4-close counter task**: *Synergies
applied per Quest* is, for each `quest.resolved` entry, the length of `payload.synergyKeys` (absent,
in an entry from before this story, is none), reported as the share of Quests with at least one, the
mean per Quest and the count by key, split by the controller kind of `payload.guildId`'s Guild, as
DL-34 item 4 joins entries to Guilds.

## DL-46 — Regard between Heroes: its writer, its decay and the dead; Relationship; the teamwork scalar (M4-S4)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M4-S4's implementer)

**Context.** M4-S4 gives Regard between Heroes its first writer (after a Quest every pair of the
Party gains `regardPerSharedQuest`, more on success), emitting `hero.regard-changed` only on a band
crossing; `relationship(a, b, world)`, the mean of the two Regards, clamped, never stored;
`teamwork(party, world, config)`, a scalar over the Party's mean pairwise Relationship (INPUTS 6.3:
×0.9 to ×1.1 across the Relationship range); and, in the night's `heroState`, decay toward neutral
at `regardDecayPerYear` for pairs who have not shared a Quest that year. DL-42 left the Encounters'
`regard` consequences summed in `outcome.regardDelta`, applied by nothing, and the `teamwork` seam
at 1; DL-43 set one Regard scale and one set of bands for every holder. The story leaves open:
whether a Hero killed on the Quest takes part; what "that year" means and the decay rate's unit;
what becomes of the Regard of, and for, dead, retired and Unattached Heroes; a Party of one's
teamwork; the event's shape; the defaults; and whether `show hero` shows Regard.

**Decision.**

1. **One scale.** Regard between Heroes and the Relationship read from it use DL-43's `regardMin`
   −20 to `regardMax` 20 and its `regardBands` (hostile, cool, neutral, warm, close) unchanged, and
   its `adjustRegard`, `recoverRegard` and `regardBand`; no second scale. New module
   `hero-regard.ts`.
2. **The writer** (`regardOnSharedQuest`), called by `questsConclude` after the Patron's and the
   Guildmaster's Regard (DL-44 item 4), for every Guild's Party alike: once for each resolved Quest,
   each Hero who came home alive gains, for each other who did, **one** change of
   `regardPerSharedQuest` + `regardOnSuccessBonus` (for any band but `fail`) + `outcome.regardDelta`
   (the Encounters' Regard, now applied, closing DL-42 item 2 and DL-44 item 5). One `adjustRegard`
   each way, so a Quest makes at most one event each way; `since` is the return night and `reason`
   `quest.resolved`, even for a change of 0 (the two shared the Quest, which the decay reads).
3. **The dead take no part.** A Hero killed on the Quest gains no Regard and nobody's for them
   moves: Relationship with the dead is never read (no Party can hold them), and writing it would
   only grow the maps and the History. Their own map stays as it stood (rule 8: dead Heroes stay,
   with their State).
4. **`hero.regard-changed`** `{ heroId, entityId, cause, before, after, bandBefore, bandAfter }`,
   `cause` `shared-quest` or `decay`, one entry for each Hero whose Regard crossed: Regard is held
   one way, and a pair's two values part once one of them leaves the Roster. It names both Heroes
   (and, through `emit`, their Guilds); not a Milestone. `entityId` is any entity, as
   `guildmaster.regard-changed`'s is, so that a later writer of a Hero's Regard for another kind of
   entity shares the event.
5. **The decay** (`decayHeroRegard`), in the Hero State Engine after Morale drift, for each Hero on
   the Roster of a Guild in play, every Guild alike. "Not shared a Quest that year" is read as **a
   whole year, `turnsPerYear` Turns, since the entry's `since`**, the last shared Quest, not a
   calendar year, so two Heroes home on a year's last night do not begin to drift on the next. From
   then on each night moves the value toward neutral by `regardDecayPerYear` × the scale's reach ÷
   the year's nights, the unit of DL-43's `patronRegardRecoveryPerYear`; it stops at neutral, where
   the entry goes, and `since` and `reason` stay. Only entries keyed by a Hero the world holds
   decay; a Hero's Regard for anyone else is another rule's. Due entries are visited in id order, so
   that a loaded save, whose maps come back with sorted keys, emits what the unsaved game would.
   Default **`regardDecayPerYear` 0.25**: five points a year, so a pair at the scale's top is
   neutral again about four years after their last Quest together (a year's grace, then 16 points).
6. **The Regard of the dead, the retired and the Unattached is left; Regard for them decays.** The
   Hero State Engine reaches no Hero off a Roster, so a dead or retired Hero's Regard stays as it
   stood, and a pool Hero's waits until a Guild signs them. A living Hero's Regard for any of them
   decays as for anyone they no longer quest with and goes at neutral, so a Roster Hero's map holds
   only the Heroes they shared a Quest with in the last four years or so: the bound on the epic's
   risk that the maps grow quadratically.
7. **Relationship** (`relationship(a, b, world, config)`): the mean of `a`'s Regard for `b` and
   `b`'s for `a`, each neutral when not held, held inside the scale; symmetric by construction. It
   takes `config` beside the epic's `(a, b, world)` for the clamp. It reads any two entities that
   hold Regard (Guilds, Guildmasters, Heroes, Patrons; any other id, or a row the world lacks, holds
   none), as CONTEXT.md defines Relationship between entities; the first build reads it between
   Heroes. `relationshipBetween(a, b, config)` does the same for two rows in hand, and
   `relationshipBandCounts(heroIds, world, config)` counts each pair's band. **Never stored**: a
   test reads `document.ts` for a field named for it, checks the Regard-holding rows' keys, and
   checks a saved game's text after ten shared Quests.
8. **Teamwork** (`quest-engine/teamwork.ts`, DL-42's seam, signature unchanged `(heroes, world,
   deps)`): **`1 + teamworkRange × regardShare(mean pairwise Relationship)`**, `regardShare`
   (regard.ts) being the value over the scale's reach on its side. Default **`teamworkRange` 0.1**,
   INPUTS 6.3's ×0.9 to ×1.1. **A Party of one**, or a Party down to one in the sequence, has no
   pair and is at 1: a lone Hero neither gains nor loses for working alone. The members read are
   those still alive in the sequence (DL-42 item 10).
9. **Defaults**: **`regardPerSharedQuest` 1** and **`regardOnSuccessBonus` 0.5**, 1.5 a successful
   Quest: warm after three, close after eight, so the epic's "close after ten shared successful
   Quests" holds with room. A failed Quest shared still counts 1 ("more on success"). The core
   content's Encounter Regard (+1 on `hold-the-line`'s success, −1 on `a-hostile-reeve`'s failure)
   moves a Quest's change between 0 and 2.5. `configVersion` stays **4**: fields are added and no
   default changes (DL-43 item 11's reading).
10. **The CLI.** `narrate` has a line for `hero.regard-changed`, bands only ("…'s Regard for … rose
    from warm to close after a Quest together", "… fell from warm to neutral as time passed apart").
    `show hero`, for a Hero on a Roster, lists "Relationships on the Roster": each other Hero on it,
    with the Hero's Regard for them and their Relationship, both as bands, never numbers (the
    story's option, taken: it is what a Party's teamwork reads, and the player picks Parties from
    it).

**Consequences.** A scratch run (not committed) played four seeds, `seed-0001` to `seed-0004`, 20
years each under the automatic policy (DL-34), the core content and `defaultConfig`, and read the
world at each year's end. **Regard maps.** Across every Hero row the world keeps, the entries a Hero
holds for other Heroes numbered 3,431 to 4,126 at year 10 and 6,999 to 7,434 at year 20, over 820 to
911 rows. Heroes on a Roster, of all five Guilds, held 448 to 829 of them at year 20: a mean of 5.2
to 11 a Roster Hero at any year's end, and 25 at the most for any one Hero in any year. The rest,
about 6,400 to 6,600, are the frozen maps of the dead, the retired and the departed, about eight a
Hero, growing with the Heroes who leave play and not with the pairs: linear, not quadratic. The same
seed with the new rules stilled (no Quest Regard, no decay, no teamwork, the Encounters' ±1 still
applied) reached a map of 56 and 12.4 a Roster Hero by year 20: the decay is what bounds them.
**Relationship in the player's Roster at year 10**, 28 pairs each: neutral 4, 7, 9, 16; warm 3, 13,
13, 7; close 21, 8, 6, 5; none cool or hostile, since only the Encounters' −1 lowers Regard between
Heroes and turnover and decay return the rest to neutral. **The History** gained 7,619 to 8,130
`hero.regard-changed` entries a game (the stilled run 1,518), about 2.5% of some 315,000 entries.
**Outcomes**: the player failed 33.5 to 43.1% of Quests and succeeded strongly 35.5 to 43.6%; the
Rivals failed 16.5 to 17.2%; on `seed-0001` the stilled run gave the player 32.5 / 23.2 / 44.3 and
the Rivals 18.1 / 14.0 / 67.8 against 33.5 / 22.9 / 43.6 and 16.5 / 14.1 / 69.4: teamwork's ±10%
moves the Rivals' failures by under two points, and no game ended. **Time**: a 4-year game of
`seed-0001` took 55 to 62 s with the rules and 54 to 59 s without, on a machine shared with other
runs: within the noise. The M4 close's balance pass measures these with M4-S3's Synergies.

**For the M4-close counter task.** The Relationship band distribution within the player's Roster at
year 10 is `relationshipBandCounts(playerGuild(world).rosterIds, world, config)` on the world at
Turn `10 × turnsPerYear`: each unordered pair of the Roster once (the Roster holds only the living),
the five bands always listed. It cannot be rebuilt from the History alone, since a Relationship is
the mean of two values whose entries record only band crossings; the counter reads a snapshot of the
world at year 10, as DL-43's Guildmaster Regard counter does. `hero.regard-changed` entries, by
`cause` and `bandAfter`, are there for any count of crossings.

## DL-48 — Item definitions, one holder type, and the primitives that keep one stack per holder (M5-S1)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M5-S1's implementer)

**Context.** M5-S1 names `content/items.json` and its row `{ key, name, kind: "gear" | "consumable",
unique, slot?: "weapon" | "armour" | "trinket", statModifiers?, effect?: ConsumableEffect, buyPrice,
tags }`, the effect union `reroll { kinds }`, `bonus { flat, kinds }`, `heal { days }`, twenty
definitions (nine gear, three a slot at three grades; six consumables; five unique gear as Loot only,
`buyPrice: null`), `engine/src/items.ts` with `holdings`, `moveStack` and `moveItem`, the config field
`gearSlots`, and three boxes. M5-S2 to S5 build on it in parallel. Left open: the typed shape; whether
the slots are content's or config's; what content validation refuses beyond a slot on the wrong kind;
whether a consumable may be unique; what the validator checks beyond §6's duplicate stacks; how a new
stack gets its id; and what else the next stories need from `items.ts`. And one contradiction:
data-model §3.3 lets only a stack be held by the Market, while the owner's pre-M0 review D6 and M5-S4
put a folded Guild's unique Items on the Market.

**Decision.**

1. **The row** (`content-types.ts`). `ItemDefinition` is a union on `kind`: `GearDefinition` has
   `slot` and `statModifiers`, `ConsumableDefinition` has `effect`, and both have `name`, `unique`,
   `buyPrice` (a whole number above 0, or `null` for an Item found only as Loot) and `tags`
   (`ItemTagKey[]`, kebab-case, none twice, may be none). A union rather than the epic's optional
   fields, so that M5-S2 reads a gear's slot and M5-S3 a consumable's effect without a check the
   compiler cannot see. `statModifiers` is required on gear, at least one, each a Hero Stat and a
   whole number other than 0 (a penalty is negative): R30's gear modifies Stats. `ConsumableEffect`
   is the epic's closed union, `kinds` one or more Encounter kinds, none twice; `flat` above 0; `days`
   a whole number from 1. `ContentSet.items`, the table name DL-20 set, so `unknown-item` reads it.
   **`contentVersion` becomes 9.**
2. **Slots are a closed list; which a Hero has is config.** `gearSlotKeys = ['weapon', 'armour',
   'trinket']` sits beside `encounterKinds`, and `SlotKey` is its union, so content validation refuses
   a slot no Hero could have (it cannot read config). `GameConfig.gearSlots` (default the three,
   frozen; INPUTS 7.1) is the slots every Hero has, in the order a front end lists them; rules read
   only these. A fourth slot is an engine change, as a new Encounter kind is. **`configVersion` stays
   4**: a field is added and no default changes (DL-38's reading).
3. **Content refuses** (the parser the shape, `validateContent` the rest, in memory as well): gear
   without a slot or with one outside the three, or with an `effect`; a consumable with a `slot` or
   `statModifiers`, or without an `effect`; an effect of a kind outside the union or with a field its
   kind lacks; an Encounter kind that is not one, none, or one twice; a modifier that is empty, on a
   Stat that is no Hero Stat, 0 or not whole; a price of 0 or less or not whole; a tag not in
   kebab-case or listed twice; `unique` that is not a boolean. **A unique consumable is refused**: a
   consumable is expended from a stack, M5-S3's dispatch names consumables by definition and
   quantity, which a unique row cannot answer, and no rule would expend an individual; a one-off
   potion is a common definition of which one exists. **Unique gear with a price is not refused**: the
   core's five have none, and M5-S4, which must price a folded Guild's unique Items (D6), may want one.
   So `buyPrice: null` means the Market never stocks it; the Market's refresh draws stacks and so
   never stocks a unique definition whatever its price, and **M5-S4's draw filters on both `!unique`
   and `buyPrice !== null`**. `items.json` is required and may be `{}`.
4. **One holder type** (`document.ts`). `Holder` is hero-with-slot, guild, party or market, for
   unique Items and stacks alike, and `StackHolder` is gone: D6 (owner, 2026-09-26) is later than
   data-model §3.3 (2026-09-25) and needs the Market to hold a unique Item, so §3.3 now says so. The
   validator's shape check accepts a unique Item on the Market; the test that refused it now accepts.
5. **`items.ts`**, world-level primitives for the rules M5-S2 to S5 write. They emit nothing and
   check no rule of play (a free slot, a Guild owning the Item, a price paid): the action does, and
   rejects. They throw a `RangeError` only on a programming error. Each copies the holder it is given,
   so rows share no object. Ids come from `world.counters` through `takeId`.
   - `holdings(world, holder: HolderQuery): { items, stacks }`, each in id order; a `HolderQuery` is a
     `Holder` or `{ kind: 'hero', id }`, which reads the Hero in every slot.
   - `findStack(world, definitionKey, holder)`: the holder's one stack of a definition, or none.
   - `moveStack(world, stackId, quantity, toHolder): StackId`: `quantity` from 1 to the stack's; joins
     the target's stack of the definition, or becomes a new stack; a whole stack moving where there is
     none keeps its id; the emptied source is removed; to its own holder, nothing changes. Returns the
     stack the quantity is now in.
   - `moveItem(world, itemId, toHolder)`.
   - `addStack(world, definitionKey, quantity, holder): StackId`: merges into the holder's stack or
     creates one (a Market refresh, a purchase, common Loot).
   - `removeFromStack(world, stackId, quantity)`: removes an emptied stack (expended, sold, cleared).
   - `createItem(world, definitionKey, holder): ItemId` (unique Loot).
   - `sameHolder(a, b)`: kind, row and, for a Hero, slot. `itemDefinition(content, key)`: the row,
     or `undefined` for a key content lacks.
6. **The validator.** §6's `duplicate-stack` and `dangling-reference`'s holder check stood. It gains
   two refusals: `empty-stack`, a stack whose quantity is below 1 (the shape check already holds it
   whole), and `gear-slot-overfull`, a Hero's slot holding more than one Item (unique Items plus stack
   quantities), once per slot, naming the Hero: M5-S2's `slot-occupied` as an invariant. And two
   warnings, which rule 5 makes of a key that may drift under a live save (DL-20 item 8 already named
   slots among them): `unknown-slot`, an Item a Hero holds in a slot `deps.config.gearSlots` does not
   list (key: the slot), and `misplaced-item`, an Item a Hero holds that is not gear for its slot
   (key: the definition). The warning checks now receive `deps.config` beside the content.
7. **The twenty** (`content/items.json`; the engine's test content carries the same). A grade is a
   tag, `plain`, `fine` or `masterwork`, not a field no rule reads.

   | Slot / kind | plain (40) | fine (120) | masterwork (300) |
   | --- | --- | --- | --- |
   | weapon | Short sword: Weaponry +1 | Arming sword: Weaponry +2, Strength +1 | Masterwork blade: Weaponry +3, Strength +2 |
   | armour | Padded jack: Constitution +1 | Mail shirt: Constitution +2, Endurance +1 | Plate harness: Constitution +3, Endurance +2, Dexterity −1 |
   | trinket | Lucky charm: Courage +1 | Silver amulet: Willpower +2, Spirit +1 | Runed circlet: Arcana +3, Spelllore +2 |

   Consumables, two of each effect: Whetstone (+3 on combat, 25), Set of lockpicks (+3 on stealth,
   25), Grappling line (reroll travel or stealth, 45), Blessed candle (reroll arcane or social, 60),
   Healing draught (heal 5 Days, 30), Physician's kit (heal 10 Days, 70). Unique gear, Loot only: the
   Barrow King's blade (weapon: Weaponry +4, Strength +2, Courage +1), the Vault Warden's staff
   (weapon: Arcana +3, Power +3), Mantle of the Fells (armour: Endurance +3, Constitution +2,
   Adaptability +1), the Lantern of Stannary (trinket: Perception +3, Wits +2), the Abbot's reliquary
   (trinket: Spirit +3, Willpower +2, Resistance +1). The scale: Stats run 1 to 20 with bases of 3 to
   14; a flat of 3 is worth about what DL-45's Synergy flats are (5 to 20% of a capability); Injuries
   heal in 5 to 30 Days; prices sit against rewards of 40 to 450 and a signing fee near 100. No rule
   reads any of it until M5-S2 to S5, so the values are untested; the M5 close measures them.
8. **Test support.** The fixture's Hero stack was a healing draught in a `belt` slot, which is no
   slot; it is now a Padded jack in the Party Hero's armour slot.

**Consequences.** M5-S2's `equip` checks `holdings(world, slotHolder)` is empty, the definition is
gear for that slot and the slot is in `config.gearSlots`, then calls `moveItem` or `moveStack(…, 1,
slotHolder)`; `effectiveStats` reads `holdings(world, { kind: 'hero', id })` for the slots
`gearSlots` lists, skipping a misplaced Item. M5-S3 moves consumables with `moveStack` Guild → Party
and back, and expends with `removeFromStack`. M5-S4 refreshes with `removeFromStack`/`addStack` on
`{ kind: 'market' }`, moves bought and sold stacks with `moveStack` and a folded Guild's unique Items
with `moveItem`, and settles what a unique Item sells for. M5-S5 awards with `createItem` or
`addStack`. S1 adds no event, so it gives the M5-close counter task nothing to count. A new slot or
effect kind is an engine change and earns a decision; a new Item is content only.

## DL-49 — Equip and unequip, gear in effective Stats, gear going back to its Guild, and the controllers equipping (M5-S2)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M5-S2's implementer)

**Context.** M5-S2 names `equip(document, { guildId, heroId, itemId | stackId, slot })` and `unequip`,
the rejections `not-gear`, `slot-occupied`, `hero-unavailable` and `not-held-by-guild`, gear's
modifiers inside `effectiveStats(hero, world, content)` (the selector the Check reads, DL-44), base
and effective Stats side by side in `show hero`, and gear on a dead or retired Hero returning to the
Guild's holding at night with `item.returned`. It leaves open: the other rejections and their order;
whether `slot` is needed; whether equipping emits an event; the order of the modifiers and the hold
to the Stat's range; which night phase returns gear, and when; what becomes of the gear of a folding
Rival's Heroes, while M5-S4 (built in parallel) lists a folding Guild's unique Items on the Market
and discards its stacks; how M6's Transfer will return a Hero's gear; and whether `steady` or the
automatic policy equip. The epic's risk table has the policy buy armour (M5-S4); unworn, it would do
nothing.

**Decision.**

1. **Two actions, one file** (`engine/src/actions/equip.ts`), each a world-level rule and a
   document-level wrapper (DL-30): `applyEquip`/`equip` and `applyUnequip`/`unequip`, in the
   `Action` and `GuildAction` unions and `applyAction`/`applyGuildAction`. `equip`'s request is
   `{ guildId, heroId, slot?, itemId | stackId }`, exactly one of the two ids (neither or both
   throws, as a programming error). **`slot` is optional**: the gear's definition names its slot, so
   it defaults to that and, when given, must be it. `unequip`'s request is `{ guildId, heroId, slot }`.
2. **`equip`'s rejections, in the order it checks**: `guild-folded`; `hero-not-on-roster` (read as
   `dispatch` reads it: a dead or retired Hero who kept the Guild's id is the Guild's, and refused
   next); `hero-unavailable`, `because` `dead`, `retired` or `in-party` — **an injured Hero may be
   equipped**, being at the Hall, and a Hero away has their gear with them; `not-held-by-guild` (no
   such row, or not in this Guild's holding: gear on another Hero is unequipped first, the Market's
   bought first); `not-gear` (a consumable, or a definition content lacks); **`wrong-slot`** (a slot
   asked that is not the gear's own, or the gear's own not among `config.gearSlots`; it carries the
   slot asked, the gear's slot and the Heroes' slots); and `slot-occupied`, naming the occupant:
   **`equip` never swaps**. `unequip`'s: `guild-folded`, `hero-not-on-roster`, `hero-unavailable`,
   **`slot-empty`**. A Guild the world lacks throws.
3. **Moves.** A unique Item moves whole (`moveItem`). **Common gear takes one unit**
   (`moveStack(…, 1, heroSlot)`), the rest staying in the holding; the last unit moves the stack
   itself, which keeps its id. `unequip` moves whatever the slot holds to the Guild's holding, a
   stack joining the Guild's stack of its definition. `unequip` empties any slot, one
   `config.gearSlots` no longer lists included, so such gear can always be recovered.
4. **Events.** Beside the epic's `item.returned`, **`item.equipped` and `item.unequipped`** (not in
   the epic's list; data-model rule 10 makes every discrete change an entry). All three carry a
   `GearMove` — `heroId`, `guildId`, `slot`, `definitionKey`, and `itemId` for a unique Item or
   `stackId` for a common one (the stack the unit is in after the move), the other `null` — and name
   the Hero, the Guild and the Item or stack. `item.returned` adds `cause`: `died`, `retired` or
   `guild-folded` (M6 adds its Transfer's). None is a Milestone: the Death, Retirement or fold is.
5. **Effective Stats** (`selectors.ts`): the base, **plus** the Guildmaster's `classStatBonus`
   (DL-43), **plus** the Stat modifiers of the gear the Hero carries (`gearModifiers`,
   `engine/src/gear.ts`), **summed first and held inside the Stat's content range once**, at the end,
   so the order of the modifiers never matters and none is lost to an early hold (a Mage with Arcana
   1, Mistrusts magic and a Runed circlet reads 3). Gear counts when its definition is gear made for
   the slot it is in; a misplaced Item, or a definition content lacks, counts for nothing. The
   signature stays the epic's `(hero, world, content)` (DL-44) and the Check's call is unchanged;
   `hero` now needs its `id`, `world` its `items` and `stacks`, `content` its `items`. **It reads no
   config**, so it does not ask whether a slot is among `config.gearSlots`: `equip` alone does, and
   fills no other. This **supersedes the clause of DL-48 item 2** "rules read only these", and that
   entry's consequence that `effectiveStats` reads only the listed slots: gear already in a slot a
   rebased config drops still counts until it is unequipped, and the validator still warns
   `unknown-slot`. A config parameter would have changed the Check's call in `check.ts`, which M5-S3
   is changing in parallel, for a case only a change to `gearSlots` under a live save can make.
6. **The return at night is a phase of its own, `gearReturn`**, after `ageing` and before
   `guildState`. Every Item held by a Hero who is dead or retired goes to the holding of the Guild
   their row keeps (`guildId`, DL-20 item 3), with `item.returned`, Heroes in id order and each Hero's
   Items in slot order (`gearSlotKeys`), then id. A Hero dies in `questsConclude` and retires in
   `heroState` earlier the same night, so **the gear is back the night of the Death**, and no Turn
   begins with gear on a Hero who can never carry it again. A phase rather than a line in each rule
   that kills or retires, so that those rules stay as they were and one sweep catches every case. It
   draws nothing. `approach.md` §2's night line names it.
7. **A fold returns the Roster's gear first.** `fold` (`phases/endings.ts`) now begins by returning
   the gear of each Hero on the Roster, in Roster order, with `item.returned` for `guild-folded`,
   **before `guild.folded`** and before any row changes, so that the Heroes enter the pool carrying
   nothing and whatever the fold then does with the Guild's holding — M5-S4 lists its unique Items on
   the Market and discards its stacks — finds that gear there. `gearReturn` runs before `endings`, so
   a Hero who died on the night their Guild folds has returned theirs too. A folding Guild's Parties'
   consumables are M5-S3's and M5-S4's.
8. **One reusable return**: `returnGear(world, hero, cause, emit)` (`gear.ts`), which `gearReturn`
   and the fold call, and which **M6's Transfer calls before the Hero's Guild changes**. It throws on
   a Hero who carries gear and has no Guild, which no rule makes.
9. **The controllers equip.** One engine helper, `gearChoices(world, guild, deps)` (`gear.ts`), which
   `steady` and the harness's automatic policy both put **first** among their choices, before any
   dispatch, since equipping moves no Wealth and sends no one, and is refused for a Hero away. Its
   rule: every piece of gear in the Guild's holding for a slot `config.gearSlots` lists whose
   modifiers sum above 0, best first (that sum, then id; each unit of a stack a piece), each to the
   first Hero in Roster order whom `equip` would accept with that slot empty; no swaps, no draw.
   Applied in order, every action it names is accepted. So the armour M5-S4's policy buys, and Loot
   (M5-S5), is worn from the next Turn. Rivals do not buy in M5 (M5-S4), but they wear their Loot.
10. **CLI.** `equip --hero <id> --item <id> | --stack <id>` (no `--slot`: the gear's own) and
    `unequip --hero <id> --slot <weapon | armour | trinket>`, each printing its event's line and the
    effective Stats that changed. `show hero` shows Base and Effective side by side, never Potential,
    and a Gear table by slot; `show roster` lists what the Guild holds, with the ids `equip` takes.
    `narrate.ts` has a line for each new event.
11. **No config field and no default change**: `configVersion` stays 4, `contentVersion` 9.

**Consequences.** A smoke run (4 seeds × 5 years under the default config, the automatic policy,
every Guild handed three mail shirts, two arming swords and a unique trinket at creation, validated
after every advance) equipped 45 to 65 Items a game and returned 33 to 59 from the dead and the
folded, with no action refused and no document refused or warned about. Until M5-S4 or M5-S5 gives a
Guild gear, a harness game equips nothing. For the M5-close counter task: `item.equipped`,
`item.unequipped` and `item.returned` by `cause` and by Guild; gear worn at year 10 is `carriedGear`
over the player's Roster on the world at that Turn.

## DL-50 — Consumables carried at dispatch, used by the Quest Engine, expended or sent home (M5-S3)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M5-S3's implementer)

**Context.** M5-S3 says `dispatch` accepts `consumables: [{ definitionKey, quantity }]`, moving
stacks from the Guild's holding to the Party's; that a `bonus` consumable adds its flat bonus to the
first Encounter of a matching kind and is expended, a `reroll` re-rolls the first failed matching
Encounter once, and a `heal` shortens an Injury taken on the Quest; that unused consumables return to
the Guild on the Party's return, the Party holding nothing after resolution; and that the Quest
Engine emits `item.expended`. It leaves open: the rejections' names; whether Rivals and the
automatic policy carry any; where the rules live, given `check.ts` must stay free of Guild-side
rules; how a `bonus` combines with the Check, and a second Item of it; where a `reroll` draws from
and what it costs the stream; which Injury a `heal` shortens and by how much; what becomes of a
disbanded Party's consumables (a fold, M2-S10, DL-28); what the History records; and the CLI's
words. DL-48's primitives (`moveStack`, `removeFromStack`, `holdings`) are what it builds on.

**Decision.**

1. **The request.** `DispatchRequest` gains an optional `consumables: ConsumableRequest[]`,
   `{ definitionKey, quantity }`, each definition once and a quantity a whole number from 1 (either
   broken is a programming error and throws, as a Hero named twice does); absent means none. After
   the requirements (DL-25's order, then M4-S5's), each consumable in the order given is checked,
   and the first failure is the rejection: **`not-consumable`** (content defines no consumable of the
   key: it is gear, or no Item at all; `{ definitionKey }`), **`not-held-by-guild`** (the Guild's
   holding has no stack of it; `{ definitionKey, guildId }`) and **`insufficient-quantity`** (its
   stack holds fewer than asked; `{ definitionKey, guildId, held, requested }`). The names follow M5-S2's
   `not-gear`/`not-held-by-guild` and M5-S4's `insufficient-quantity`; each is typed per action
   (`Rejection<'dispatch', …>`, exported as `DispatchNotConsumable`, `DispatchNotHeldByGuild`,
   `DispatchInsufficientQuantity`), so the other actions' own rejections of the same reason do not
   clash. On success each is moved with `moveStack` from `{ kind: 'guild' }` to `{ kind: 'party' }`,
   and `quest.taken` gains `consumables`, the list carried (`[]` for none; absent from an older
   entry). No limit on how many a Party carries: nothing in the epic or INPUTS asks for one.
2. **Rivals and the automatic policy carry none.** Neither holds a consumable: M5 defers Rivals'
   buying to M6, and the policy's one Market rule (M5-S4) buys armour. A rule to carry what the Guild
   holds would be dead code today; `consumables` is optional so neither changes. So under the
   harness the M5 counter "consumables expended per Quest" reads 0 until a policy buys consumables;
   that is the M5 close's to judge.
3. **Where the rules live.** `engine/src/quest-engine/consumables.ts`, the Party's consumables from
   the moment they are carried: `kitOf(world, party, content)`, the kit the Quest Engine uses as it
   resolves (read-only: it records the Items used and changes no row), `expendUsed` (removes them
   from their stacks and emits `item.expended`) and `sendHome` (every row the Party holds to its
   Guild's holding). A consumable is the Party's own, so it sits with the Quest Engine; it reads
   nothing of the Guild's leader or dealings, and a test reads the file for the word, as for
   `check.ts`. `check.ts` gains one parameter, a flat `bonus` added to the capability before the
   roll (0 by default), and no rule; `resolve.ts` asks the kit for the bonus and the reroll around
   the Check and for the heals after the sequence, and returns the uses beside the outcome
   (`Resolution.consumables`, not in `QuestOutcome`, so `quest.resolved`'s payload is unchanged).
   A stack whose definition content lacks, or is not a consumable, is carried and used for nothing
   (data-model rule 5), and goes home.
4. **`bonus`.** Before each Check, each carried bonus definition with an Item left whose `kinds`
   hold the Encounter's kind gives one Item and its `flat`, added to the capability after the
   teamwork scalar and before the roll (S1's reading: "added to the capability of the first Check").
   One Item per definition per Check, so a second Item of the same definition goes to the next
   Encounter of its kinds, and two definitions matching one kind both add. The Item is spent on the
   Check whatever its outcome. No draw.
5. **`reroll`.** After a failed Check, the first carried reroll definition (in key order) with an
   Item left whose `kinds` hold the Encounter's kind gives one Item, and the Check is rolled again:
   the same capability, the bonus of item 4 included, and **one more draw from `quests`, taken
   straight after the failed Check's draw and before any consequence's draws**. The second roll
   stands, success or failure: an Encounter is rolled again at most once, however many Items are
   carried, and a further Item waits for the next failed Encounter of its kinds. The consequences
   are the second roll's outcome's. So a Party carrying no reroll draws exactly as M4 did (DL-42
   item 12), and a reroll shifts the later draws of its own Quest by one.
6. **`heal`.** After the sequence, when the Injuries are final (a Hero who died has none), the heal
   Items carried are given out one at a time, the definition healing most Days first (ties by key),
   each to **the Injury with the most Days** among those not yet treated (ties to the one taken
   first), shortening it by the definition's `days` **to no fewer than 1 Day** — the Injury is
   shortened, not cured, so `hero.injured`, its night and any Trait it leaves on healing still
   follow (DL-29). The Days shortened are those after the infirmary (DL-29 item 8). **One Item per
   Injury**; an Injury at 1 Day takes none; Items left over go home. No draw.
7. **Expended and sent home.** `questsConclude`, after the Quest's `quest.encounter` entries and
   before its `quest.resolved`, removes each Item used from its stack (`removeFromStack`) and emits
   one **`item.expended`** an Item, in the order used; then, as the Party's row goes, `sendHome`
   moves every stack (and any unique Item) the Party still holds to its Guild's holding
   (`moveStack`, merging with the Guild's stack of the definition). A fold (DL-28) calls `sendHome`
   for each Party it disbands before removing it, so the folded Guild holds them, and M5-S4's rule
   for a folding Guild's stacks decides what then becomes of them. **No event for a return**: the
   Party's return is `quest.resolved` and a fold is `guild.folded`, and M5-S2's `item.returned` is
   gear's. So no stack is ever held by a removed Party, which the validator's
   `dangling-reference` holder check (DL-48 item 6) refuses; a test now holds it for a Party.
8. **`item.expended`** (not a Milestone), payload `{ questId, partyId, guildId, stackId,
   definitionKey }` and by `effect`: `bonus` with `encounterIndex` and `flat`; `reroll` with
   `encounterIndex` and `firstRoll` (the failed roll it replaced; the Encounter's own entry records
   the second); `heal` with `heroId` and `days` (the Days it took off). It names the Quest, the
   Party, the Guild and, for a heal, the Hero. `stackId` names a stack that may since have gone, as
   the History keeps other removed rows' ids.
9. **CLI.** `dispatch` and `preview` take `--consumables <key:n,...>` (a kebab-case key and a whole
   number from 1, joined by commas, each key once). `dispatch` prints what the Party carries; each
   new rejection is put into words. `preview` gains a Consumables section: for each asked, how many,
   how many the Guild holds, what it does and on how many of the Quest's Encounters; with none asked,
   the consumables the Guild holds that could be carried. `narrate.ts` gains `item.expended`, and
   `quest.taken` names what was carried.

**Consequences.** No config field and no content change: `configVersion` stays 4 and the content
version 9. A Quest drawn and resolved with nothing carried draws and resolves as before. **For the
M5-close counter task**: consumables expended per Quest are the `item.expended` entries grouped by
`payload.questId` (by `payload.effect` and `payload.definitionKey` for the detail), divided by the
`quest.resolved` entries, split by the controller kind of `payload.guildId`'s Guild; the
consumables carried are `quest.taken`'s `payload.consumables`, so carried minus expended is what
went home.

## DL-52 — Loot: the tables, where the threshold is applied, the draw, and one of each unique Item (M5-S5)

**Status:** Accepted · **Date:** 2026-09-26 · **Decided by:** an agent (M5-S5's implementer)

**Context.** M5-S5 names `content/loot-tables.json` with rows `{ key, entries: [{ definitionKey, weight,
quantityMin/Max }] }`, Quest templates' `lootTableKey` "set for templates with `difficultyMin` above
`lootDifficultyThreshold`", one entry drawn from `quests` on a strong success and awarded to the Guild's
holding (a unique Item with a fresh id), the event `quest.loot` ("Milestone when unique"), the config
fields `lootDifficultyThreshold` and `lootOnBands`, and three boxes. INPUTS 7.4's default: Loot on strong
success only, the table chosen by difficulty band. It leaves open: what content refuses; how a config
threshold and content's templates agree, since content validation cannot read config (DL-48 item 2);
when the draws are taken; whether a unique Item may be awarded twice; how an event type is a Milestone
for some payloads only, when `milestoneTypes` is one boolean a type (DL-24); and where the award is
applied, since the Quest Engine changes nothing but the streams (DL-42).

**Decision.**

1. **The row** (`content-types.ts`). `LootTable { key, entries: LootEntry[] }`, `LootEntry {
   definitionKey, weight, quantityMin, quantityMax }`, as the epic writes it, no name (no rule or front
   end shows a table). `ContentSet.lootTables`; `QuestTemplate.lootTableKey` becomes `LootTableKey |
   null`. `loot-tables.json` is required and may be `{}`. **`contentVersion` becomes 10.**
2. **Content refuses** (the parser the shape, `validateContent` the rest): a table with no entries; an
   entry whose definition content lacks; a definition listed twice in one table; a weight that is not a
   number above 0; a quantity that is not a whole number from 1, or a range upside down; a unique Item
   with a quantity other than 1 at either end, since a unique Item is an individual; a field the row
   lacks; and a template naming a table content lacks. A table no template names is allowed.
3. **The threshold is applied at generation.** The Quest Generator copies the template's
   `lootTableKey` onto the Quest when the template's `difficultyMin` is above `lootDifficultyThreshold`,
   and `null` otherwise; nothing else reads the threshold. So content says which table a template's
   Quests award from, config says from which difficulty a Quest awards Loot at all, and the Quest row
   stays self-contained, as data-model §3.2 has it: a Quest offered keeps what it was offered with.
   Not a validator rule, which cannot read config; not a resolution rule, which would read the template
   again. The core names a table for exactly the templates the default threshold admits, and the
   harness's `creation.test.ts`, which loads both, holds that agreement. The default threshold is
   **25**: the six templates whose `difficultyMin` is 30 to 60 carry Loot, the six from 10 to 25 none.
   Lowering it admits a template only where content names it a table.
4. **Two tables, by difficulty band** (INPUTS 7.4): `lesser-loot` for a `difficultyMin` from 26 to 44
   (Clear the barrow, The beast of the fells, Lay the restless dead) and `greater-loot` from 45 (The
   counting-house job, Hold the border fort, Break the sealed vault). Weights total 100 in each. The
   lesser: consumables at 74 (whetstone, lockpicks and healing draught 16 each, 1 to 3; grappling line
   10 and blessed candle 8, 1 to 2; physician's kit 8, 1), fine gear at 20 (arming sword 7, mail shirt
   7, silver amulet 6) and three unique Items at 2 each (the Barrow King's blade, Mantle of the Fells,
   the Abbot's reliquary). The greater: consumables at 43 in larger quantities (healing draught 13,
   2 to 4; physician's kit 12, 1 to 2; grappling line and blessed candle 9 each, 1 to 3), fine gear at
   18, masterwork gear at 24 (8 each) and all five unique Items at 3 each. No other rule reads them, so
   the values are untested; the M5 close measures them. The engine's test content carries the same.
5. **`lootOnBands`** is a list of bands, default `['strong']` (INPUTS 7.4), frozen. **`configVersion`
   stays 4**: two fields are added and no default changes (DL-38's reading).
6. **The draw** (`quest-engine/loot.ts`, `drawLoot`), the Quest Engine's last step, one line in
   `resolveQuest` beside the Encounters so that M5-S3's consumables and this touch that file apart.
   `Resolution` gains `loot: LootDraw | null`, beside the outcome rather than in it, so `quest.resolved`'s
   payload is unchanged. For a Quest whose table content defines: two draws from `quests`, the entry by
   `weightedPick` over the weights, then its quantity by `int`, **taken whatever the band**, so tuning
   `lootOnBands` never shifts a later draw (`chance`'s promise, rng.ts). A Quest with no table draws
   nothing; one naming a table content lacks draws nothing and the validator warns, `unknown-loot-table`
   (rule 5). Loot is awarded only on a band in `lootOnBands`.
7. **One of each unique Item in a world.** A unique definition already in `world.items`, whoever holds
   it (a Hero, a Guild, a Party or the Market), is drawn with weight 0, so it is never awarded twice;
   when every entry of the table is such, the draw (uniform then, as `weightedPick` is when every weight
   is 0) is taken and awards nothing. A unique Item is an individual (data-model §3.3) and the core's
   five are named relics: a second Barrow King's blade would contradict its name, and re-drawing would
   make the draw count depend on the world. Two Parties home the same night are resolved and awarded one
   after the other, in id order, so the second's draw sees the first's Item.
8. **The award** (`awardLoot`, applied by `questsConclude` right after `quest.resolved`, one line): to
   `{ kind: 'guild', id }` of the Party's Guild, a unique Item by `createItem` with a fresh id, a common
   Item by `addStack`, which joins the Guild's stack of it. Every Guild alike (ADR-0002); a folded
   Guild's Party is never resolved.
9. **`quest.loot`**: `{ questId, partyId, guildId, lootTableKey, definitionKey, quantity, itemId |
   null, stackId | null }`, naming the Quest, the Party, the Guild and, for a unique Item, the Item, so
   an Item's own History begins with its finding. A stack is not named: it is a quantity, not an
   individual. **A Milestone when unique:** `events.ts` gains `milestoneWhen`, a rule by payload for the
   event types that are Milestones for some payloads only (`quest.loot`: `itemId !== null`), where
   `milestoneTypes` holds `false`; `emit` reads both through `isMilestone`. The CLI narrates it
   ("The Kestrel Guild found Loot on quest-000003: The Barrow King's blade (item-000006).").

**Consequences.** M5-S5's third box, "the harness's Loot counter rises with the player's mean Quest
difficulty", is proved in the engine before the counter exists: `loot.test.ts` plays eight seeds for 90
Days each under two regimes, the player sending every free Hero the Quest allows on the easiest or the
hardest Quest it can staff; measured when written, a mean difficulty of 24 to 27 gave 20 Loot in all and
46 to 75 gave 46. The M5 close's counter task computes **Loot awarded by table**: the `quest.loot` entries
(`history.byType['quest.loot']`) grouped by `payload.lootTableKey`, for the player's Guild and for all,
with unique ones (`itemId !== null`) apart; beside the player's mean Quest difficulty, which it can read
from the resolved Quests. A unique Item sold to the Market stays in `world.items`, so it is still never
awarded again; one M5-S4 removed would be. Balance of the tables and the threshold is the M5 close's.

---

## Pre-M0 review decisions, 2026-09-25 to 2026-09-26

Decisions from the review of the planning documents (`docs/plan.md`, `docs/planning/epics/*`)
against the ADRs, `CONTEXT.md`, `requirements.md`, `principles.md`, `approach.md` and
`data-model.md`, held with the owner over 2026-09-25 and 2026-09-26. Every decision below was
actioned in the documents named at the time it was made; this section is the permanent record of
those 43 items, kept under the review's own IDs (A1–F4) so the reserved DL-11 to DL-13 numbers
above stand for the stories that own them. All 43 items closed `done`; none is open.

### A1 — Rivals run the Quest Engine; ADR-0002 says they do not

**Decided by:** the owner, 2026-09-25.

**Decision.** ADR-0002 is amended with a dated note: Rivals resolve through the same Quest
Engine as the player; "light" Rival simulation means their choices are simple, not their
resolution. One code path, with the harness measuring Rival growth and losses on the same
counters.

**Actioned in:** ADR-0002 (dated note withdrawing the last consequence); M6 §0.

### A2 — Rules that treat the player's Guild specially

**Decided by:** the owner, 2026-09-25, against the recommendation (amending ADR-0002 to
enumerate permitted reads of `controller.kind`; the owner instead left the ADR unchanged for
this item).

**Decision.** The three player-specific rules stay as named exceptions rather than being
designed away: the game ends when the player's Guild ends, while a Rival's ending only folds
that Guild; the Transfer Generator never takes from the player's Guild; and on the Board, the
player's controller acts before the Rivals'.

**Actioned in:** `plan.md` §1 (new "accepted exceptions to ADR-0002" paragraph naming all
three); M6-S3; M2 §3.

### A3 — The engine imports a type from the content package

**Decided by:** the owner, 2026-09-25.

**Decision.** `ContentSet` and every content row type are defined in
`engine/src/content-types.ts`. The content package imports them from the engine to parse and
validate text into that type; the engine imports nothing from content and no third shared
package is added.

**Actioned in:** M1-S4 (acceptance asserts the engine imports nothing from content and `tsc -b`
builds as a DAG).

### A4 — The stub ignores Skills; R15 says it reads them

**Decided by:** the owner, 2026-09-25.

**Decision.** The M2 stub gains Skills: Quest templates carry `skillKeys`, and the score gains
`stubSkillBonusPerRating × Σ ratings` of those Skills across the Party.

**Actioned in:** M2-S3 (template `skillKeys`); M2-S5 (formula, config, acceptance). R15
unchanged.

### A5 — Requirements §2 defers two generators the plan builds

**Decided by:** the owner, 2026-09-25, against the recommendation (moving both the Random Event
and Transfer generators into the first build; the owner kept Random Events deferred).

**Decision.** The Transfer Generator moves into the first build, in M6. The Random Event and
Inciting Event generators stay deferred; M8 proves the module contract with a test-only probe
module instead of building Random Events.

**Actioned in:** `requirements.md` §2 table, R3, R6; principle 10; `approach.md` §1/§2;
`plan.md` §1, milestone table, M8 list, §4; ADR-0005's note; INPUTS §8; M2 §0; epics README; M8
rewritten around a probe module.

### A6 — First-build front ends expose more than R37 allows

**Decided by:** the owner, 2026-09-25.

**Decision.** R37 and the requirements §2 front-end row are amended to match what the plan
already does: front ends expose each engine action as it lands, rather than holding a reduced
"viewer plus three actions" set until later.

**Actioned in:** `requirements.md` R37 and §2 front-end row. Epics unchanged.

### A7 — Some state changes emit no event

**Decided by:** the owner, 2026-09-25.

**Decision.** A discrete change (a Quest outcome, an Injury, a Level, a Transfer) emits an
event. A continuous nightly drift (Morale drift, training XP, Regard decay) is a rule of the
config, reconstructible from the events that bound it, and emits an event only when it crosses a
configured band. Every emitted event is kept, unbounded; "archiving old years" is dropped as a
lever.

**Actioned in:** principle 11; R36; `data-model.md` rule 10 and §7 (archiving lever dropped);
`CONTEXT.md` Milestone entry; M2-S6 (`hero.morale-changed` on band crossings, `moraleBands`
config, moved from M6 to M2); M3-S2.

### A8 — Node 22 in the ADR, Node 26 in the accepted input

**Decided by:** the owner, 2026-09-25.

**Decision.** ADR-0007 is amended (dated note) to "Node 22 or later, developed on the current
release"; `engines: ">=22"`; CI runs a matrix of both 22 and 26 so the floor is proved, not
assumed.

**Actioned in:** ADR-0007 note; N8; `approach.md` §5; INPUTS 1.1; M0-S3 CI matrix; M0 risk row.

### A9 — Unattached Heroes are never removed

**Decided by:** the owner, 2026-09-25.

**Decision.** `data-model.md` rule 8 is reworded: a Hero is removed from the pool when
unrecruited unless a History entry other than their own `hero.generated` and `hero.left-pool`
names them; those two entries stay in the History with labels so they narrate without keeping
the Hero's own row.

**Actioned in:** `data-model.md` rule 8 (passive-entry exception); M2-S8 text, acceptance and a
bounded-pool test.

### B1 — Outings (R4)

**Decided by:** the owner, 2026-09-25.

**Decision.** R4 is amended: the one-Outing-per-Turn limit arrives with the second kind of
Outing (scouting or Patron visits, both deferred). The Market has no per-Turn limit in the first
build.

**Actioned in:** R4; M2 §0 deferral note reworded.

### B2 — Guildmaster Traits (R8)

**Decided by:** the owner, 2026-09-25.

**Decision.** M1-S6 generates 0–2 Guildmaster Traits (`guildmasterTraitsMin/Max`) from
`traits.json` with `owner: "guildmaster"` and null effects; M4-S5 gives them effects through a
closed union (`classStatBonus`, `guildMoraleShift`, `upkeepFactor`) applied in the selectors that
already exist.

**Actioned in:** M1-S6; M1-S4 traits row and config lists; M4 §0 and M4-S5 (closed effect union
and a test); INPUTS 3.13.

### B3 — Guildmaster Regard (R9)

**Decided by:** the owner, 2026-09-25, against the recommendation (leaving the Regard map with
no writer until Contacts/Campaigns; the owner had writers built now).

**Decision.** Writers for Guildmaster Regard are built in the first build: M4-S5 writes it for
Patrons and Heroes (four config fields), M6-S2 for Rival Guildmasters
(`guildmasterRegardPerTransferDeal`). Regard for a Guild is exposed as a selector, with
`guildmaster.regard-changed` on band crossings and a `show guildmaster` command; the harness
reports the band distribution even though no rule reads it yet.

**Actioned in:** M4-S5; M6-S2; `show guildmaster`; harness reporting. R9 unchanged.

### B4 — Fame gating recruit calibre (R10)

**Decided by:** the owner, 2026-09-25.

**Decision.** Fame gates who will *sign*, not who exists: an Unattached Hero refuses a Guild
whose Fame is below `fameRequiredPerLevel × (level − 1)`, raised as a `signing-refused`
rejection, arriving in M3-S5 alongside Rankings. R10's "Applicant calibre" wording is removed.

**Actioned in:** R10 (reworded); M3-S5 (`signing-refused`, config, counter, tests); INPUTS 5.6.

### B5 — Patron State Engine and the "Patron draws" phase

**Decided by:** the owner, 2026-09-25.

**Decision.** M4-S5 gains nightly Patron Regard recovery toward neutral
(`patronRegardRecoveryPerYear`), so the Patron State Engine listed in `approach.md` §1 is a real
rule. The morning phase named "Patron draws" is renamed to what M2-S3 actually builds: "Board
refresh, drawing from Patrons".

**Actioned in:** `approach.md` §2 (phase renamed); M4-S5 (nightly recovery, config, a test).

### B6 — The Guildmaster's effect on recruitment (R8; plan M4 increment 5)

**Decided by:** the owner, 2026-09-25.

**Decision.** Negotiation, the Guildmaster Stat already scaling Quest reward, also scales
signing fees and Transfer fees by `(1 ∓ negotiationRange)`, matching R8 and `plan.md`'s M4
increment 5.

**Actioned in:** M4-S5 table; M6-S2 signature.

### B7 — Fast forward stopping when a recruit arrives (approach §2)

**Decided by:** the owner, 2026-09-25.

**Decision.** An opt-in stop condition `pool-refreshed` is added to M2-S11's `until` list.
`approach.md` §2 is reworded to distinguish always-on stops (a Transfer offer) from opt-in ones
(a pool arrival), since the pool refreshes most nights and a stop on every arrival would make
fast forward useless.

**Actioned in:** `approach.md` §2 (always-on vs opt-in stops, "Applicant" removed); M2-S11
(`pool-refreshed`).

### C1 — Missing fields and tables

**Decided by:** the owner, 2026-09-25.

**Decision.** `data-model.md` §3.2 gains `guild.belowFloorSince`, `guild.foldedOnTurn`,
`world.ended`, `quest.demands`/`quest.skillKeys` (copied from the template at generation so a
Quest row is self-contained), `quest.encounterKeys`, and a new `offers` table for pending
Transfer offers. No separate pool-entry field is added: `enteredTurn` already serves that
purpose.

**Actioned in:** `data-model.md` §3.1 (`ended`), §3.2 (new fields and `offers` table), validator
row, type sketch; M6-S2 (uses `world.offers`, emits `guild.transfer-offer-expired`).

### C2 — `requirements.partySize` is a value in the data model, a range in the templates

**Decided by:** the owner, 2026-09-25.

**Decision.** Both the Quest template and the Quest row carry `partySizeMin` and
`partySizeMax`, rather than collapsing to one value.

**Actioned in:** `data-model.md` (`partySizeMin/Max`); M2-S4 (`party-size` rejection names the
bounds).

### C3 — Id padding is inconsistent, and string order breaks past the padding

**Decided by:** the owner, 2026-09-25.

**Decision.** Every table uses six-digit zero-padded ids (e.g. `hero-000042`); the validator
refuses a counter that passes 999,999, comfortably above the roughly 50,000 Quests a 20-year
game reaches.

**Actioned in:** `data-model.md` §3.1 (six digits, every table), validator row; M1-S1 example.

### C4 — Quest timing: Turns versus Days, and when a Party is back

**Decided by:** the owner, 2026-09-25.

**Decision.** Templates author `durationDaysMin/Max`; generation stores `durationTurns = days ×
3`; `returnsOnTurn` is always the night Turn of `dayOf(departedOnTurn) + days`, so the Party
resolves that night and its Heroes are available the next morning, rather than resolving in
whichever phase they happen to return.

**Actioned in:** `data-model.md` (`durationTurns`, `returnsOnTurn` notes); M2-S4 (formula
`nightOf(dayOf(turn) + durationDays)` and a test).

### D1 — `advance` has three signatures

**Decided by:** the owner, 2026-09-25, against the recommendation (config read from `deps`
alone; the owner chose a hybrid not among the listed options).

**Decision.** A hybrid: `advance` and every action take one `deps = { config, content, modules
}` object; rules read `deps.config`, which is what the game plays under. Front ends pass
`meta.config` into `deps` by default; a new `rebase` action lets a save adopt the current
defaults instead, recording `world.rules-adopted`. The harness passes its config explicitly.

**Actioned in:** `approach.md` §3; `data-model.md` §1/§2; N1; M1-S1 (`configVersion`,
`EngineDeps`); M1-S8; M2-S1 (`rebase`, a test); M2 events; M7-S3 notice; epics README
convention.

### D2 — When player actions happen

**Decided by:** the owner, 2026-09-25.

**Decision.** Every action is a standalone call on the current document, at any time of day;
`advance` only moves time. The `Choice` union is removed in favour of an `Action` union used by
the harness policy and the web reducer. Rival controllers act at the start of the afternoon
phase, on whatever the player left on the Board and in the pool during the morning.

**Actioned in:** `approach.md` §2/§3; `data-model.md` §1; M2-S1/S2/S4/S9/S11 and §2.

### D3 — Old saves under later rules

**Decided by:** the owner, 2026-09-26.

**Decision.** Because D1's hybrid has rules read config from `deps`, tuning reaches every game
and missing config fields never arise; on load, config is filled forward
(`{ ...defaultConfig, ...meta.config }`). Content references are re-validated on load with a
warning (rule 5). `patron.questTemplateKeys` is dropped: templates are looked up by Sphere at
draw time, so a content bump needs no migration. Schema migrations stay as designed.

**Actioned in:** `data-model.md` §2 and rule 5 (fill-forward); `data-model.md` §3.2, M1-S6,
M2-S3 (Sphere lookup); M1-S9 (CLI), M7-S2 (web reducer) build deps the same way.

### D4 — Leadership and Perception are both Hero and Guildmaster Stats

**Decided by:** the owner, 2026-09-26, in an option of the owner's own rather than either
listed choice (neither the shared-key option nor the distinct-key option; the owner renamed the
Stats instead).

**Decision.** The Guildmaster's Stats are renamed Inspiration (was Leadership) and Judgement
(was Perception), so no key is shared between Hero and Guildmaster Stats and `stats.json` keeps
a single `owner` field.

**Actioned in:** `CONTEXT.md` Stat entry; R8; M4 §0/S5 table/§2 config
(`inspirationMoraleShift`, `judgementHintSharpening`).

### D5 — Who pays the Morale cost of a Transfer (R28)

**Decided by:** the owner, 2026-09-26.

**Decision.** Each Hero whose own Regard for the transferred Hero is `warm` or above pays the
Morale cost, matching what M6-S2 already builds, rather than a flat cost to the whole Roster.

**Actioned in:** R28 and `CONTEXT.md`'s Transfer entry, reworded to the pairwise reading.

### D6 — What happens when a Rival goes bankrupt

**Decided by:** the owner, 2026-09-26.

**Decision.** A bankrupt Rival Guild folds: `foldedOnTurn` is set, its Heroes join the
Unattached pool (`hero.left-guild`), its Items go to the Market at sell price, it leaves the
Rankings, and after `rivalReplacementDays` a new Rival is generated (`guild.founded`) so the
Rival count holds. A player-controlled Guild's bankruptcy ends the game instead.

**Actioned in:** `CONTEXT.md` Bankruptcy entry (reworded); M2-S10 (folds, releases Heroes, drops
from Rankings, replaces, a test); M5-S4 (folded Guild's Items listed on the Market).

### D7 — Random streams drift as milestones add draws

**Decided by:** the owner, 2026-09-26.

**Decision.** ADR-0009's streams are redefined by the subsystem that actually draws:
`generation`, `board`, `quests`, `encounters`, `pool`, `heroes` (state engine), `progression`,
`rivals`, `market`. The core `events` stream is dropped; a module registers its own. A stream is
added in the milestone that introduces its subsystem, and never shares an old one.

**Actioned in:** ADR-0009 (amended, dated note); `data-model.md` §3.1; M1-S2 (tuple); M2-S8
(`pool`); M3-S1 (`progression`); M4-S1 (`encounters`).

### D8 — Hall grades cannot be raised before M5

**Decided by:** the owner, 2026-09-26.

**Decision.** Improvements (`build`, `improvements.json`) move from M5-S6 into M3 as M3-S6, so
Wealth has a sink and the infirmary and training-yard rules that read Hall grades can be
exercised and measured from the milestone that adds them; M5-S6 becomes a pointer back to
M3-S6.

**Actioned in:** M3/M5 headers, gates, config, events, counters; `plan.md` lists and milestone
table; epics README rows (M3 increments 6–7, M5 increments 6–8); INPUTS 7.3 annotated.

### D9 — Judgement (Perception before D4) sharpening Potential hints

**Decided by:** the owner, 2026-09-26.

**Decision.** No change: the deferred item in requirements §2 is a Guildmaster Trait effect,
while Judgement's own Stat rule (sharpening Potential hints) is a distinct, standing rule under
R8. When the deferred Trait arrives, how it stacks with the Stat rule needs its own decision.

**Actioned in:** none — recorded as a clarification only.

### D10 — Three small ones

**Decided by:** the owner, 2026-09-26.

**Decision.** All three follow the recommended option. D10.1: the harness passes a fixed
`meta.createdAt` (`"harness"`) for byte-equal runs; the CLI passes the real clock. D10.2: N2 and
principle 12 are reworded to "no *player* accounts"; a hosting account (Cloudflare) at zero
running cost is allowed. D10.3: the Fame floor is kept as an explicit `config.fameFloor: 0`
rather than letting Fame go negative.

**Actioned in:** M1-S10 and `data-model.md` §2 (`createdAt`); N2 and principle 12 (accounts
wording); M2-S7 (`config.fameFloor`).

### E1 — DL-11 assigned twice (M0-S3 and M1-S2)

**Decided by:** the owner, 2026-09-26.

**Decision.** Renumber so no ID collides: M0-S3's CI red/green proof is DL-11, M1-S2's PRNG
choice is DL-12, M1-S10's determinism measure is DL-13; later references shift accordingly.

**Actioned in:** M0-S3, M1-S2, M1-S10 and cross-references to the old numbering.

### E2 — INPUTS §9 lists 3 environment variables; the epics use 5

**Decided by:** the owner, 2026-09-26.

**Decision.** Add the two missing variables, `HEROESIM_SEEDS` and `HEROESIM_VALIDATE`, alongside
`HEROESIM_MODULES`, to the INPUTS §9 table so it lists all five the epics actually use.

**Actioned in:** `INPUTS-REQUIRED.md` §9.

### E3 — Branch policy told two ways

**Decided by:** the owner, 2026-09-26.

**Decision.** INPUTS 1.2 follows M0-S0's branch scheme (`v1.0-release` created from `planv2`'s
tip, `v1.0-dev` from it); `plan.md` §1 and the epics README §3 add the missing step: a milestone
completes by merging `v1.0-dev` into `v1.0-release`, then tagging there.

**Actioned in:** `INPUTS-REQUIRED.md` 1.2; `plan.md` §1; epics README §3.

### E4 — INPUTS 1.3 says "see 7.3"; the Playwright row is 7.10

**Decided by:** the owner, 2026-09-26.

**Decision.** Fix the cross-reference to point at 7.10, where the Playwright-in-CI row actually
is.

**Actioned in:** `INPUTS-REQUIRED.md` 1.3.

### E5 — `plan.md` M2-3 weights the Board by Patron Regard; M2-S3 defers that to M4

**Decided by:** the owner, 2026-09-26.

**Decision.** `plan.md` follows the epic, not the other way round: Board weighting by Patron
Regard arrives in M4, once Regard has rules, not in M2.

**Actioned in:** `plan.md` §3 M2 increment 3.

### E6 — M2-S4 already rejects unmet requirements; M4-S5 "introduces" it

**Decided by:** the owner, 2026-09-26.

**Decision.** M4-S5 is reworded to say it adds the rejection *reason* and the Skill/Class checks
the M2 data lacked, rather than claiming to introduce rejection of unmet requirements from
scratch.

**Actioned in:** M4-S5.

### E7 — M1's stories sum to 12–14 sessions against 10–13; totals off

**Decided by:** the owner, 2026-09-26.

**Decision.** Correct the stated totals: M1 is 12–14 sessions; the epics README grand total
becomes 60–78 sessions, reflecting the work A5 and D8 moved into the first build.

**Actioned in:** M1 epic header; epics README total.

### E8 — M7-S4 loads "a 20-year save from `harness/reports/`", which holds Markdown

**Decided by:** the owner, 2026-09-26.

**Decision.** Add `npm run harness:sample`, which writes a real save to
`harness/samples/twenty-years.json` (gitignored) on demand, for M7-S4 to load instead of a
Markdown report.

**Actioned in:** M7-S4; package scripts; `.gitignore`.

### E9 — `plan.md` §1 says every increment ends with a harness run and a CLI; M0 and M1-S1–S8 cannot

**Decided by:** the owner, 2026-09-26.

**Decision.** Reword `plan.md` §1 to "from M1-S9 onward"; M0 and the first M1 stories (S1–S8)
end with passing tests only, since neither the harness nor the CLI exists yet.

**Actioned in:** `plan.md` §1.

### F1 — `principles.md` principle 6: "the first sixteen Stats"

**Decided by:** the owner, 2026-09-26.

**Decision.** Correct the stale count: "sixteen" becomes "twenty", matching the twenty Hero
Stats fixed elsewhere.

**Actioned in:** `principles.md` principle 6.

### F2 — "Applicant" in R10 and approach §2 is a v1 term

**Decided by:** the owner, 2026-09-26.

**Decision.** Replace "Applicant" with `CONTEXT.md`'s "Unattached Hero" everywhere it appears;
R10's clause is reworded as part of B4's decision and `approach.md` §2's as part of B7's.

**Actioned in:** R10 (via B4); `approach.md` §2 (via B7); confirmed no other mention remains.

### F3 — Domain terms not in `CONTEXT.md`

**Decided by:** the owner, 2026-09-26.

**Decision.** Add glossary entries for Sphere, Disposition, Encounter, Check, Market Engine,
Regard band and Transfer Offer, per principle 13's rule that the glossary comes first.

**Actioned in:** `CONTEXT.md` — seven entries added.

### F4 — requirements §5 still lists the stub's assessment as open; DL-06 settled it

**Decided by:** the owner, 2026-09-26.

**Decision.** Remove the item from requirements §5's open list and note that it was settled by
the decision now recorded as DL-06.

**Actioned in:** `requirements.md` §5.
