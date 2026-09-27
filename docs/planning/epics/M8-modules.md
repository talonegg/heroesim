# M8 — Modules

**Objective:** the pipeline becomes an interface, proved end to end by a module that exists only to prove it, before any real module is written
**Sessions:** 4–6 · **Depends on:** M7 · **Implements:** `plan.md` M8; N6; ADR-0005 as amended 2026-09-25; `data-model.md` §3.4
**Gate:** the module contract exists; a test-only probe module registers a slice, a stream and all three hooks, changes core tables only through the effects API, and requests a stop; the harness with no module installed is byte-identical to M7's tagged run

**Status:** done — 2026-09-28 (`m8-modules`)

## 0. What lands in M8

- Registration: `Module` interface, `createWorld` and `advance` taking `modules: Module[]`.
- Slices under `world.modules[id]`, validated and migrated by their owner.
- Phase hooks `onMorning`, `onAfternoon`, `onNight`, each able to emit events and to request a
  fast-forward stop with a typed reason.
- A module's own random stream, registered by name.
- A typed `effects` API, the only way a module changes a core table.
- A probe module under `engine/src/modules/probe.ts`, exported for tests and the harness only,
  never installed by a front end.
- ADR-0005's amendment closed out: the timing it records has happened.

**Deliberately deferred:** every real module — Random Events first (the owner moved it after
the first build in the pre-M0 review, A5), then Scenarios, Campaigns, Contacts, Factions,
Scouting, Workers (`plan.md` §4); a module's own UI (the front ends render a module's events
through the same narration map; a module that needs its own view is a later decision).

**Why a probe and not a real module.** ADR-0005 wants the contract proved by a small module
before any story module exists. With Random Events deferred, no first-build feature is a
module. A probe proves the *mechanics* — registration, slice lifecycle, stream isolation, hook
order, the effects API, stops, front-end narration — and cannot prove that the contract fits a
real feature. That second proof is Random Events' job, and it is the first thing built after
the M8 tag; if the contract needs to change for it, that change is a DL and not a surprise.

**Inputs:** none.

## 1. Stories

### M8-S1 · The `Module` interface and registration · 1–2 sessions

```ts
interface Module<Slice = unknown> {
  id: ModuleId;
  streamName?: StreamName;
  createSlice(ctx): Slice;
  validateSlice(slice: unknown): Failure[];
  migrateSlice?(slice: unknown, fromVersion: number): Slice;
  onMorning?(world, slice, ctx): ModuleResult;
  onAfternoon?(world, slice, ctx): ModuleResult;
  onNight?(world, slice, ctx): ModuleResult;
}
type ModuleResult = { events: Event[]; stop?: StopReason };
```

`createWorld(content, config, seed, setup, modules = [])` creates each slice and stream;
`advance(document, deps)` runs the hooks at the three phase positions approach §2 marks
`[modules: on…]`; `deserialise` takes `modules` and runs `validateSlice`/`migrateSlice` on each
present slice, warning on an unknown slice id (the module may have been uninstalled). The core
never reads inside a slice; a lint test greps `engine/src` outside `modules.ts` for
`world.modules`.

**Acceptance:**

- [x] With `modules: []` every M2–M6 harness counter is identical to the M7 tag's run for the
      same seeds (byte-equal saves) — 200 seeds × 20 years played at `m7-web` and here with the
      harness's own `playGame`: per seed, SHA-256 of the last save and of the game's counters and
      observations, all 200 equal; the harness now prints the sweep's fingerprint
      (`sweepFingerprint`), `7c71caae…458b` at `m7-web` over those seeds (DL-76)
- [x] A module with a stream draws without moving any core stream — `engine/src/modules.test.ts`:
      a module drawing at every hook for 30 Turns leaves every core stream, and the world without
      its slice and stream, equal Turn by Turn to the same seed with no module (DL-76)
- [x] A module that throws inside a hook fails the `advance` with the module id in the error
      (programming error; modules are code, not content) — `engine/src/modules.test.ts`: a
      `ModuleError` with `moduleId`, the hook and the cause, the document given left as it was
      (DL-76)

### M8-S2 · Phase hooks, effects and stops · 1 session

The three hook positions in the flat pipeline become real. `ctx` for a module carries
`emit`, `rng` (its own stream only), `config`, `content`, `turn` and read-only selectors; a
module mutates only its slice and, through a small typed `effects` API (`adjustMorale`,
`adjustWealth`, `adjustRegard`, `injure`, `offerQuest`), the core tables, so the core stays
the only writer of its rows.

**Acceptance:**

- [x] A module's `stop` halts fast forward with its reason and the CLI and web show it —
      `engine/src/module-hooks.test.ts` ("a module's stop"): fast forward stops after the Turn whose
      hook asked, with `{ kind: 'module', moduleId }`, and not without the module; the CLI's
      `narrateStop` (`cli/src/narrate.test.ts`) and the web's (`web/src/state/narrate.test.ts`, and
      `web/src/views/world.test.tsx`, its button to the log) say "Stopped: the probe module asked to
      stop." (DL-77)
- [x] The `effects` API is the only way a module can change a Hero: a module that assigns
      `world.heroes[id].morale` directly fails the frozen-world test —
      `engine/src/module-hooks.test.ts`: that assignment is a type error and, at run time, fails the
      Turn with a `ModuleError` naming the module and leaves the document as it was, as do the
      nineteen other writes of its table (nine at M8-S2; a define, a prototype and an extensibility
      change, a freeze and six writes through a property's descriptor since DL-80) and a write through
      a descriptor to rules and to content that are not frozen; `ctx.effects.adjustMorale` makes the
      change with its event; each effect is tested in `engine/src/effects.test.ts` (DL-77, DL-80)
- [x] Hook order among several modules is registration order, tested with two spies —
      `engine/src/module-hooks.test.ts`: two spy modules registered each way round are called in
      that order at all three hooks, and their events follow it (DL-77)

### M8-S3 · The probe module · 1–2 sessions

`engine/src/modules/probe.ts`: id `probe`, stream `probe`, a slice `{ version: 1, hooks:
Record<phase, count>, lastStopTurn }`. `onMorning` counts; `onAfternoon` counts and, every
`probeStopEveryDays` (a field on its slice, not on `GameConfig`, because a module owns its own
tunables), returns `stop: { kind: "module", moduleId: "probe" }`; `onNight` draws one number
from its stream and, on a threshold, applies one effect of each kind through the effects API
and emits `probe.fired` with the effect list as payload. `validateSlice` refuses a negative
count; `migrateSlice` from a fabricated version 0 adds `lastStopTurn`, so the migration path is
exercised.

**Acceptance:**

- [x] Installed, over a year, the probe's counts equal the number of mornings, afternoons and
      nights; uninstalled, `world.modules` is empty — `engine/src/modules/probe.test.ts` ("over a
      year"): 1,080 Turns with the probe count 360 of each, the Turns' own times of day; the same year
      with no module has `world.modules` `{}` on every Turn and only the core streams (DL-78)
- [x] Only the `probe` stream moves when the probe draws; core streams are unchanged —
      `engine/src/modules/probe.test.ts` ("only the probe stream moves"): each of 30 Turns played
      from one document with the probe firing every night and without it leaves every core stream
      equal, the `probe` stream moving on nights only; with the probe drawing and never firing, the
      world without its slice and stream equals the plain game's Turn by Turn for 60 Turns (DL-78)
- [x] A save with a version-0 probe slice loads and is migrated; a save with a negative count
      is refused naming the module — `engine/src/modules/probe.test.ts` ("a save with a probe
      slice"): a version-0 slice without `lastStopTurn` loads as version 1 with `lastStopTurn: null`
      and plays on; a negative morning, afternoon or night count is refused as `module-slice` at
      `$.world.modules.probe.hooks.<time>`, "The probe module refuses its slice: …" (DL-78)
- [x] `HEROESIM_MODULES=probe npm run harness` runs 50 seeds with the probe and reports
      `probe.fired` and the delta on each core counter it touched — run 2026-09-27, 50 seeds × 20
      years with the probe and without, validated after every advance, 23.3 minutes, every assertion
      met on both: `harness/reports/m8-probe-2026-09-27.md` states `probe.fired` 7,242 times (0.0201
      a night), the 7,242 each of Morale, Wealth, Injury and Quest events its effects made, and the
      delta on each of the 314 of 404 core counters that moved (DL-78)

### M8-S4 · Front ends and close-out · 0.5–1 session

CLI and web take a module list (empty by default; `--modules probe` for the CLI, a query
parameter for the web, both test-only). Narration maps handle an unknown module event type
with a generic sentence rather than a crash. ADR-0005's amendment gets a closing line with the
tag. `plan.md`'s milestone table is completed; `docs/planning/epics/README.md` gets the total
sessions actually spent. `plan.md` §4's first line — Random Events — becomes the next issue.

**Acceptance:**

- [x] A `probe.fired` event is visible in both front ends' logs on a seed known to fire one —
      seed `modules`, on which the probe's stream first draws below 0.02 on the eleventh Turn, the
      night of Day 3. CLI: `cli/src/main.test.ts` ("--modules: the test-only probe"): `new --modules
      probe` then `advance --turns 11 --modules probe` prints "The probe module recorded probe.fired
      for …" at Turn 11, the engine's own event narrated, its effects' events after it; `advance
      --until` and `load` take `--modules` too, and without it the probe's slice is warned of and kept.
      Web: `web/src/app.test.tsx` (the page opened at `?modules=probe`, a game started from the form
      and eleven Turns advanced: the sentence in "Since your last action" at "Day 3, night", and the
      footer's "Installed for testing: the probe module."; without the parameter, neither), the
      reducer threading the modules to every engine call (`web/src/state/reducer.test.ts`), and
      `web/e2e/modules.spec.ts` in the built page at both widths (`npm run e2e -w web`, 20 of 20).
      Both narration maps give any module event type one generic sentence, never a crash
      (`cli/src/narrate.test.ts`, `web/src/state/narrate.test.ts`) (DL-79)
- [x] The M8 tag exists; `plan.md` says the first build is complete and when — `plan.md` §2 (the M8
      row and the line under the table) and §4 say the first build is complete, M8 tagged
      `m8-modules` on 2026-09-28, with Random Events next; ADR-0005's closing line and the README's
      line on the first build say the same, written by the M8 close after its tagged run (DL-81). The
      tag itself is the orchestrator's, made on the close's commit, so this box is ticked when it
      exists (DL-79, DL-80, DL-81)

## Measured

The first build's tagged run (INPUTS 4.13, DL-39): `HEROESIM_VALIDATE=1 HEROESIM_SEEDS=1000 npm run
harness -- play.harness`, begun 2026-09-28 00:50, **1,000 seeds × up to 20 years**, validated after
every advance, no module installed, config version 10, content version 14, schema version 3; 6 h 12
min on 16 processes. Full report: `harness/reports/m8-2026-09-28.md`; decisions DL-76 to DL-81.

| Counter or measure | Result (M6's 200 × 20 beside it) |
| --- | --- |
| Byte identity with `m7-web` | the saves of `seed-0001` to `seed-0200` give `m7-web`'s own fingerprint, `7c71caae…458b` (DL-76), and their counters are the M6 report's exactly; all 1,000 give `9d804517…b19e` |
| Player games ended | 4 Bankruptcies in 1,000: `seed-0049` and `seed-0188` (M6's two), `seed-0942` and `seed-0807`, in years 17 and 19 |
| Rival folds a game | 2.78 (2.88); a Guild-year `ambitious` 0.022, `steady` 0.035, `miserly` 0.037, `reckless` 0.046 (0.021, 0.034, 0.038, 0.052); one Roster wiped, the first (`seed-0849`) |
| Rival-to-Rival Transfers | 6,075, 6.08 a game (5.47): 5,687 afternoon choices, 380 by the Transfer Generator, 8 with the seller in debt; 629 back to a former seller (10.4%); mean fee 493 |
| Transfers into and out of the player's Guild | none — 951 offers for its Heroes, all declined by the policy (161) |
| Player Quests failed / success / strong | 14.8 / 13.7 / 71.5% (14.9 / 13.7 / 71.3%) |
| Rivals' Quests failed / success / strong | 12.9 / 12.1 / 75.0% (12.9 / 12.0 / 75.1%) |
| Deaths a game, player / Rivals | 33.6 / 78.4 (34.1 / 77.0) |
| Mean Level at year 10, player / Rivals | 7.58 / 6.93 (7.60 / 6.98) |
| Wealth after 10 and 20 years, the player's; a Rival's | 125,897 and 192,614 (123,818 and 189,977); 28,354 and 22,923 (27,918 and 22,487) |
| Wealth spent | the player: Upkeep 86.1%, Items 13.3%, signing 0.4%, Improvements 0.2% (the same); the Rivals: Upkeep 98.0%, Improvements 1.2%, Items 0.3%, signing 0.3%, Transfers 0.1% (Improvements 1.3%) |
| The player's Rankings place | first by Fame at 88.8% of year-starts (89.5%), by Wealth at 91.4% (91.6%) |
| Loot | the player 47.2 awards a Guild-year, 0.135 a Quest (47.1, 0.135); the Rivals 21.1, 0.103 (20.6, 0.102); unique Items 4.99 a game (4.99) |
| Consumables, the player's Parties | 2.91 carried and 0.70 expended a Quest, 52.8% of Quests using one (2.90, 0.70, 52.6%); the Rivals none |
| `advance` a Turn under 16 processes' load | 5.91 ms, p99 14.2 (5.98, 13.8; target 5 ms) |
| A Turn alone; fast forward a year | 4.96 ms in the report (1.50), so 5.4 s a year (1.6 s; target 1 s). The machine, not M8: replayed alone in fresh processes after the run, M8 3.79 to 4.30 ms and `m7-web` 4.04 to 4.45 ms, the processor giving no boost that morning (DL-81 item 6) |
| Save after 20 years; load | mean 99.2 MiB, max 118.3 MiB (98.5, 118.3; target 20 MiB); load 4.6 s under load (4.5 s; target 1 s) |
| 1,000 games of 20 years | 367 minutes of games, 372 in all (M6 projected 366; target 10 minutes) |

No validator refusal, no policy action refused, no harness assertion broken, the replay
byte-identical, all 1,000 saves round-trip. Seeds 201 to 1,000 move nothing beyond what 200 seeds
could tell but `reckless`'s folds (0.044 a Guild-year against 0.052), still the most (DL-81 item 5).

The probe run (M8-S3, DL-78): `HEROESIM_MODULES=probe HEROESIM_VALIDATE=1 npm run harness`,
2026-09-27, 50 seeds × 20 years with the probe and with none, 23.3 minutes, every assertion met on
both (`harness/reports/m8-probe-2026-09-27.md`):

| Counter or measure | With the probe | With none |
| --- | --- | --- |
| `probe.fired` | 7,242, 0.0201 a night | none |
| Core events its effects made, naming it | 7,242 each of `hero.morale-changed`, `guild.wealth-changed`, `hero.injured` and `quest.offered`; 1,137 `patron.regard-changed` (a band crossed) | none |
| Core counters moved | 314 of 404, the games going otherwise from the first effect; no core stream moved by a module's draw | — |
| Player games ended | none | 1 Bankruptcy |
| `advance` a Turn under the run's load | 3.00 ms, p99 6.60 | 2.82 ms, p99 6.26 |
| Fingerprint of every seed's last save | `e8fa3460…41bf` | `11a18457…9e02`, the tagged run's first 50 |

Verified independently before the close by five lenses (acceptance, the module contract,
byte identity with `m7-web` on 50 × 20, 104 mutants, decisions); 24 confirmed findings fixed in DL-80,
among them a read-only view by every route of reading, a hook's events kept as frozen copies, and a
context that lasts for its call; the 21 surviving mutants now killed; 2,722 tests. Left to the owner
across the first build: DL-81's Consequences.

## 2. Configuration and events introduced

**Config:** none on `GameConfig`. A module's tunables live in its slice.

**Events:** `probe.fired` (test-only); `guild.wealth-changed`, the `adjustWealth` effect's (M8-S2,
DL-77). **Stop reasons:** `module` with a `moduleId`.

**Counters:** every core counter with and without the probe; `probe.fired`.

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| The `effects` API is too narrow for the first real module | It is meant to be: Random Events, built right after M8, adds what it needs to the union with a DL. The alternative, a module writing core rows, is what ADR-0005 exists to prevent |
| The probe proves the mechanics and the contract still does not fit a real feature | Stated in §0; the M8 tag is not "modules are done", it is "the contract exists". Random Events is the acceptance test for the contract itself |
| Retrofitting hooks into a pipeline six milestones old | The three hook positions were named in approach §2 before M2 built the flat list, and M2-S2 tests the phase order against a literal, so the insertion points are known and tested |
