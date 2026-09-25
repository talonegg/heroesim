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
