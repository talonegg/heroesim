# Heroesim v2 — approach

How the game in [`requirements.md`](./requirements.md) gets built, under the principles in
[`principles.md`](./principles.md). Established 2026-09-24. Balance numbers and detailed
rules are decided per increment, not here.

## 1. Architecture

The owner's flow diagram maps onto these components. Everything above the line is the engine,
a pure library; everything below renders it.

```
World State ─────────────────────────────────────────────────────────────────
  Guilds (uniform, each with a controller) · Heroes (Rosters + Unattached pool)
  Patrons · Regard · Board · Quests in flight · Items · History · RNG state · clock

Generators ───────────  State Engines ──────────  Engines ────────────────────
  Heroes Generator        Hero State Engine        World Engine  (advance a Turn)
  Guild Generator         Guild State Engine       Quest Engine  (resolve a Quest)
  Patron Generator        Patron State Engine      Market Engine (prices, refresh)
  Quest Generator         Transfer Generator
  Random Event Generator (module)
  Inciting Event Generator (module)

Controllers ──────────  Modules ───────────────────────────────────────────────
  Player (choices in)     Campaign · Scenario · Contact · Faction · Scouting · Workers
  Rival disposition       (each owns a state slice, registers for Turn phases)
──────────────────────────────────────────────────────────────────────────────
Front ends: cli · web        Harness: automatic policy over N seeds
```

**World State** is a plain serialisable document: the data layer. It includes the random
source's state and the current Turn, so a snapshot is the whole game. Its shape, tables and
rules are in [`data-model.md`](./data-model.md).

**Generators** create entities from the seed: at world creation, and over time (Unattached
Heroes, Quests for the Board, events). Their outputs are World State changes plus events.

**State Engines** advance one kind of entity each Turn: healing, ageing, Morale drift, Regard
decay, Upkeep, Rival Rosters churning, Patron Regard recovering.

**World Engine** owns the Turn pipeline. It calls generators, state engines, controllers, the
Quest Engine for Parties whose Quests conclude, and every registered module at its phase.

**Quest Engine** resolves a Quest against a Party and returns outcomes and events. First
build: a stub. Target: a sequence of typed encounters, each a check with typed consequences.
(Amended 2026-09-28, DL-86: the first build reached the target, M4 replacing M2's stub, DL-42.)

**Controllers** decide what a Guild does in a Turn. The player acts through standalone actions
on the current document, at any time of day, and `advance` only moves time; a Rival's choices
come from its disposition, at the start of the afternoon. Neither is special to the engine.
(Amended 2026-09-28, DL-86: originally "The player's choices arrive as inputs to `advance`";
pre-M0 review D2.)

**Modules** register with the World Engine, own a named slice of World State, and are called
at defined Turn phases. The core runs with none installed.

## 2. The Turn pipeline

```
morning    Board refresh (drawing from Patrons) · Market refresh · [modules: onMorning]
           (the player acts through standalone actions in any Turn; time does not move)
afternoon  Rival controllers act, on what the player left (Improvements, Market purchases,
           Transfers and Transfer Offers among their choices) · Quests in flight advance
           · [modules: onAfternoon]
night      Training yard XP · Quests concluding → Quest Engine → outcomes applied → Level-ups
           Hero State Engine (heal, Morale, Regard decay, Retirement checks) · ageing (decline
           on those nights) · gear of the dead and retired back to their Guilds
           Guild State Engine (Upkeep on its Day, Fame, Rankings)
           Transfer Generator (weekly: Rivals bid for one another's Heroes)
           Patron State Engine (Patron Regard recovering toward neutral)
           Unattached pool refresh · [modules: onNight — Random Events, when built]
           Transfer Offers past their night, or whose Hero has left, removed
           Ending checks (Retirement, Bankruptcy, Roster wiped)
```

Fast forward runs Turns until a stop condition. Some always stop it: a Party returns, an
ending is reached, a Transfer offer arrives, or a module asks for a decision. Others the
caller opts into, such as the Unattached pool having refreshed. The stop reasons are typed
events.

## 3. Engine contract

Pure functions over the World State. No files, output, clock or global random inside the
engine. Sketch, to be refined in the first increment:

```
deps = { config, content, modules }         every entry point takes the same object
createWorld(seed, setup, deps)              -> { document, events }
advance(document, deps)                     -> { document, events, stoppedBecause }
actions: dispatch, recruit, transferIn, transferOut, offerTransfer, acceptTransfer,
         declineTransfer, buy, sell, equip, unequip, build, rebase
         each (document, params, deps) -> { document, events } or a typed rejection
selectors: rankings, roster, board, hero, history   (read-only, shared by front ends)
serialise(document) / deserialise(text, deps)   -> one format, one version field
```

The action list is amended 2026-09-28. `recall?` is struck: no Party is recalled (DL-89). The
actions it had missed are added, as DL-86 corrects: `offerTransfer`, `acceptTransfer` and
`declineTransfer` from M6 (DL-57), and `unequip` from M5 (DL-49).

Rules read `deps.config`. A front end passes the document's own `meta.config`, so a loaded
game plays under the rules it was started with; `rebase` rewrites `meta.config` to the
current defaults and records a `world.rules-adopted` Milestone, so tuning reaches a game when
the player says so and the History says when. The harness passes its configuration
explicitly (owner, 2026-09-25, pre-M0 review D1). Where pre-M0 review D3's record says tuning
reaches every game, D1 governs: a config field newer than a save follows the current default
until the save is rebased (amended 2026-09-28, DL-84). Content has no `rebase`: a content
change reaches a saved game when it is loaded (D3). Decided, to be built: on load a content
version other than `meta.content`'s is shown, a `world.content-changed` Milestone is appended
and `meta.content` is updated, so the History says when content changed as it says when rules
were adopted (amended 2026-09-28, DL-84).

Events are typed records with the Day and Turn they happened on. Front ends narrate them; the
History stores them; tests assert on them.

## 4. Content

Data files under `content/`, JSON in the first build so the engine stays zero-dependency.
Revisit the format when authored Campaign prose arrives and wants something friendlier.

Content defines: Stats (keyed, with display group and range), Classes (Stat bias, gated
Skills, growth profile), Skills, Traits, Synergies, Items and Loot tables, Quest templates,
Patron and Sphere-like flavour, Random Events with conditions, Rival dispositions, names.

The engine reads content by key. Adding a Stat, Class or Synergy is a content change. A rule
that needs a new kind of condition or effect is an engine change, and should be rare.

## 5. Repository layout

One repository, npm workspaces, Node 22 or later (developed on the current release, CI on
both), TypeScript, Vitest, ESLint.

```
engine/     pure rules, state, generators, engines; zero dependencies; tests beside
content/    JSON content and a loader with a pure entry (browser) and a Node entry
harness/    automatic policy, seed sweeps, counters; runs under Vitest with an env flag
cli/        terminal front end; local file saves
web/        browser front end; static build for Cloudflare Pages; browser saves
docs/       requirements, principles, approach, adr/, decision log once building starts
```

ESLint forbids `engine/` from importing any other package and from using `Math.random`,
`Date`, `console` or `fs`.

## 6. Build order

Superseded 2026-09-25 by [`plan.md`](./plan.md): nine milestones of session-sized
increments, each ending in a harness run and a CLI a human can drive. The plan is the build
order; this section only points at it.

## 7. Verification

- Unit tests on engine functions assert on events and state, never strings.
- Each increment defines the harness counters it needs (Quests taken, Levels gained, deaths,
  Bankruptcies, years survived) and records the measured values before and after tuning.
- Front ends are checked with their own tests; the browser build with Playwright when it has
  enough to check.
- The ESLint rules above are part of the test run.

## 8. Conventions

- British English in documents, prose and UI. Kebab-case files.
- Vocabulary from `CONTEXT.md`, exactly. Change the glossary first.
- An ADR in `docs/adr/` for decisions that are hard to reverse, surprising later and a real
  trade-off. A decision log for the rest, started with the first increment.
- Every tunable on a named, defaulted configuration object.
- Prefer boring and testable. One maintainer, intermittent hours.
