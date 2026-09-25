# M8 — Modules

**Objective:** the pipeline becomes an interface, proved end to end by a module that exists only to prove it, before any real module is written
**Sessions:** 4–6 · **Depends on:** M7 · **Implements:** `plan.md` M8; N6; ADR-0005 as amended 2026-09-25; `data-model.md` §3.4
**Gate:** the module contract exists; a test-only probe module registers a slice, a stream and all three hooks, changes core tables only through the effects API, and requests a stop; the harness with no module installed is byte-identical to M7's tagged run

**Status:** not started

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

- [ ] With `modules: []` every M2–M6 harness counter is identical to the M7 tag's run for the
      same seeds (byte-equal saves)
- [ ] A module with a stream draws without moving any core stream
- [ ] A module that throws inside a hook fails the `advance` with the module id in the error
      (programming error; modules are code, not content)

### M8-S2 · Phase hooks, effects and stops · 1 session

The three hook positions in the flat pipeline become real. `ctx` for a module carries
`emit`, `rng` (its own stream only), `config`, `content`, `turn` and read-only selectors; a
module mutates only its slice and, through a small typed `effects` API (`adjustMorale`,
`adjustWealth`, `adjustRegard`, `injure`, `offerQuest`), the core tables, so the core stays
the only writer of its rows.

**Acceptance:**

- [ ] A module's `stop` halts fast forward with its reason and the CLI and web show it
- [ ] The `effects` API is the only way a module can change a Hero: a module that assigns
      `world.heroes[id].morale` directly fails the frozen-world test
- [ ] Hook order among several modules is registration order, tested with two spies

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

- [ ] Installed, over a year, the probe's counts equal the number of mornings, afternoons and
      nights; uninstalled, `world.modules` is empty
- [ ] Only the `probe` stream moves when the probe draws; core streams are unchanged
- [ ] A save with a version-0 probe slice loads and is migrated; a save with a negative count
      is refused naming the module
- [ ] `HEROESIM_MODULES=probe npm run harness` runs 50 seeds with the probe and reports
      `probe.fired` and the delta on each core counter it touched

### M8-S4 · Front ends and close-out · 0.5–1 session

CLI and web take a module list (empty by default; `--modules probe` for the CLI, a query
parameter for the web, both test-only). Narration maps handle an unknown module event type
with a generic sentence rather than a crash. ADR-0005's amendment gets a closing line with the
tag. `plan.md`'s milestone table is completed; `docs/planning/epics/README.md` gets the total
sessions actually spent. `plan.md` §4's first line — Random Events — becomes the next issue.

**Acceptance:**

- [ ] A `probe.fired` event is visible in both front ends' logs on a seed known to fire one
- [ ] The M8 tag exists; `plan.md` says the first build is complete and when

## 2. Configuration and events introduced

**Config:** none on `GameConfig`. A module's tunables live in its slice.

**Events:** `probe.fired` (test-only). **Stop reasons:** `module` with a `moduleId`.

**Counters:** every core counter with and without the probe; `probe.fired`.

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| The `effects` API is too narrow for the first real module | It is meant to be: Random Events, built right after M8, adds what it needs to the union with a DL. The alternative, a module writing core rows, is what ADR-0005 exists to prevent |
| The probe proves the mechanics and the contract still does not fit a real feature | Stated in §0; the M8 tag is not "modules are done", it is "the contract exists". Random Events is the acceptance test for the contract itself |
| Retrofitting hooks into a pipeline six milestones old | The three hook positions were named in approach §2 before M2 built the flat list, and M2-S2 tests the phase order against a literal, so the insertion points are known and tested |
