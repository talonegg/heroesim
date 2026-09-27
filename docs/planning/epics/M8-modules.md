# M8 — Modules

**Objective:** the pipeline becomes an interface, proved end to end by a module that exists only to prove it, before any real module is written
**Sessions:** 4–6 · **Depends on:** M7 · **Implements:** `plan.md` M8; N6; ADR-0005 as amended 2026-09-25; `data-model.md` §3.4
**Gate:** the module contract exists; a test-only probe module registers a slice, a stream and all three hooks, changes core tables only through the effects API, and requests a stop; the harness with no module installed is byte-identical to M7's tagged run

**Status:** in progress — M8-S1 to M8-S4 done

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
      Turn with a `ModuleError` naming the module and leaves the document as it was, as do eight
      other writes; `ctx.effects.adjustMorale` makes the change with its event; each effect is tested
      in `engine/src/effects.test.ts` (DL-77)
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
- [ ] The M8 tag exists; `plan.md` says the first build is complete and when — `plan.md` §2 now says
      the first build was completed on 2026-09-27, tagged `m8-modules`, with Random Events next, and
      ADR-0005's amendment has its closing line; the tag is the orchestrator's, made after the M8
      close's tagged run (DL-81), so this box is left for it (DL-79)

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
