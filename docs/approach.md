# Heroesim — approach

How the game in [`requirements.md`](./requirements.md) is built, under the principles in
[`principles.md`](./principles.md): its components, the Turn pipeline, the engine's contract,
content, the repository and how it is verified. Tuning values are in `engine/src/config.json`,
content in `content/`, and each rule's reasons in its DL entry.

## 1. Architecture

The components below follow the owner's game-flow diagram
([`images/herosim-conceptual-gameflow.png`](./images/herosim-conceptual-gameflow.png)); the
deployed page's runtime is drawn in
[`images/heroesim-runtime-architecture.html`](./images/heroesim-runtime-architecture.html).
Everything above the line is the engine, a pure library; everything below renders or measures it.

```
World State ─────────────────────────────────────────────────────────────────
  meta · world (Guilds, Guildmasters, Heroes, Parties, Patrons, Quests, the Board, Items,
  Transfer Offers, Module slices, streams, Turn) · History

Generators ───────────  State Engines ──────────  Engines ────────────────────
  Heroes Generator        Hero State Engine        World Engine  (advance a Turn)
  Guild Generator         Guild State Engine       Quest Engine  (resolve a Quest)
  Patron Generator        Patron State Engine      Market Engine (prices, refresh)
  Quest Generator                                  Best Party    (choose, estimate)
  Transfer Generator
  Random Event Generator (Module, later)
  Inciting Event Generator (Module, later)

Controllers ──────────  Modules ───────────────────────────────────────────────
  Player (actions)        none shipped; the probe proves the contract (tests, CLI, harness)
  Rival (its Disposition)
──────────────────────────────────────────────────────────────────────────────
Words: narration, readings, refusals    Front ends: cli · web
Harness: the automatic policy over N seeds    Tools: portraits · editor · decisions · measure
```

**World State** is a plain serialisable document, `{ meta, world, history }`, holding the random
streams and the Turn, so a snapshot is the whole game ([`data-model.md`](./data-model.md)).

**Generators** draw new things into the world from the seed: at creation, and as time passes
(Unattached Heroes, Quests for the Board, the Transfer Generator's bids). Each writes what it draws
into the World State and returns its events.

**State Engines** advance one kind of entity each night: the Hero State Engine (healing, Morale
drift, Fatigue, Regard decay, Retirement), the Guild State Engine (Upkeep, the Bankruptcy floor, the Fame
floor) and the Patron State Engine (Patron Regard recovering toward neutral).

**World Engine** owns the Turn pipeline (§2). It calls the Generators, the State Engines, the
Rivals' Controllers, the Quest Engine for Parties whose Quests conclude, and each installed Module
at its Hooks.

**Quest Engine** resolves a Quest against its Party: a sequence of typed Encounters, each of one to
four Checks combined into a Degree, with typed consequences by Degree (DL-42, DL-148).

**Best Party** chooses a Guild's Party for a Quest, with its estimate, for the Rivals, the policy
and the front ends (`engine/src/best-party.ts`, DL-237).

**Controllers** decide what a Guild does. The player acts through standalone actions on the
current document, at any time of day, and `advance` only moves time; a Rival's Controller is its
Disposition, at the start of the afternoon. No rule asks which a Guild has, beyond the exceptions
ADR-0002 accepts (DL-86).

**Modules** are installed through `deps.modules`, own a named slice of the World State, and are
called at the Turn's Hooks (ADR-0005). The core runs with none installed. Random Events will be
the first ([`plan.md`](./plan.md) §3); whether a later feature is a Module is decided in its epic
(DL-89).

## 2. The Turn pipeline

```
morning    Board refresh (drawing from Patrons) · Market refresh · [modules: onMorning]
afternoon  Rival Controllers act on what the player left · Quests in flight advance
           · [modules: onAfternoon]
night      Training yard XP · Quests concluding → Quest Engine → outcomes applied → Level-ups
           Hero State Engine (heal, Morale, Fatigue, Regard decay, Retirement checks) · ageing (Decline
           on those nights) · Gear of the dead and retired back to their Guilds
           Guild State Engine (Upkeep on its Day, the Bankruptcy floor, the Fame floor)
           Transfer Generator (on its Days: Rivals bid for one another's Heroes)
           Patron State Engine (Patron Regard recovering toward neutral)
           Unattached pool refresh · [modules: onNight]
           Transfer Offers past their night, or whose Hero has left, removed
           Ending checks (Retirement, Bankruptcy, Roster wiped)
```

The player acts between Turns, whatever the time of day; no phase takes the player's choices. The
order is `phases` in `engine/src/pipeline.ts`.

Fast forward plays Turns for a Watched Guild until a Fast-forward stop holds or its Turns run out.
The stops are typed (`StopReason`, `engine/src/stops.ts`); which always stop it and which the
caller opts into is in [`CONTEXT.md`](../CONTEXT.md) (DL-33, DL-85).

## 3. Engine contract

The engine is functions of a document and its deps. Each reads no file, clock, environment or global
random source, and writes no output (ADR-0001, ADR-0003, ADR-0007). `createWorld`, `advance`,
`fastForward` and an accepted action each return a new document with its events; the History alone
is appended in place and shared by reference (ADR-0008), as the write-once rows are shared
(ADR-0011).

```
deps = { config, content, modules? }        what play takes (EngineDeps)
createWorld(seed, setup, deps)              -> { document, events }
advance(document, deps)                     -> { document, events, stoppedBecause }
fastForward(document, { guildId, until, maxTurns }, deps)
                                            -> { document, events, stoppedBecause }
applyAction(document, action, deps)         -> { document, events } or a typed rejection
  action: rebase, or a Guild's: dispatch, recruit, transferIn, transferOut, offerTransfer,
          acceptTransfer, declineTransfer, buy, sell, equip, unequip, build, nameCaptain
applyActions(document, actions, deps)       -> { document, results }: a Guild's actions,
                                               in order, on one copy
selectors and History readers (rankings, offeredQuests, entriesFor, returnOf, …), read-only
playDeps(document, content, modules?)       -> deps, or the config's refusal
serialise(document)                         -> text: one format, one version field
deserialise(text, { content, modules? })    -> { document, warnings, deps } or a refusal
```

An action is a value told apart by its `kind`, and its rejection is that action's own. A refused
action in `applyActions`' list changes nothing (ADR-0011, DL-238). The engine has three entries:
`@heroesim/engine` for the front ends, the words, the harness and the tools;
`@heroesim/engine/content`, content's vocabulary, for content, the words and the content editor
(DL-243); and `@heroesim/engine/testing`, for tests alone (DL-194).

Rules read `deps.config`, never `meta.config`. Every front end, the harness and a save's load take
their deps from `playDeps`: `defaultConfig` with the save's `meta.config` over it, so a setting the
save lacks reads as the current default and one the current `GameConfig` lacks is ignored
([`data-model.md`](./data-model.md) rule 5). `checkConfig` then checks every setting by its rule:
its range, every Min at most its Max, the bands and the Degrees' thresholds in their order, each
list's members. A save with a setting no rule allows is refused at load, naming it (DL-193). A
loaded game plays under the rules it began with until `rebase` adopts the current defaults (pre-M0
review D1); the harness creates its games under its own config and never rebases. What the save
stores, and how a content change reaches it, is [`data-model.md`](./data-model.md) §2's.

Events are typed records of the Turn they happened on and the entities they concern, the shape of
a History entry. Front ends narrate them; the History stores them; tests assert on them.

## 4. Content

JSON files under `content/` (ADR-0007), one Content kind to a file, or to a folder of one file a
row named by its key, as its kind declares: Quest templates, Encounters, Items and Loot tables are
folders (DL-260). Each is read and checked by its module in `content/src/kinds/`; `kinds/index.ts`
lists them (DL-243). The engine reads content by
key. Adding a Stat, Class, Trait or Synergy is a content change; a new kind of condition or effect
is an engine change, and rare (ADR-0006). The format is revisited when authored Campaign prose
arrives.

## 5. Repository layout

One repository, npm workspaces, TypeScript, Vitest, ESLint, on Node 26 or later: `engines` is the
major of `.node-version`, the one Node CI tests (ADR-0007, DL-235).

```
engine/     pure rules, state, Generators, engines; zero dependencies; tests beside
content/    the JSON content and its kinds; a browser entry, a Node entry, and the tools' entries
words/      the words the front ends and the tools share: narration, readings, refusals, the
            calendar, the Quest review's page; runs in a browser
harness/    the automatic policy, seed sweeps, counters; its runs are Vitest projects of their
            own, which `npm run harness` runs
cli/        terminal front end; local file saves
web/        browser front end; one static build on Cloudflare (docs/deploy.md); browser saves
tools/      the owner's tools: portraits, the content editor, the decisions' index and checks,
            the measures
media/      the pictures: Portraits, Banners and Items, each with its Silhouette; the inbox
docs/       the documents, listed in README.md
```

ESLint holds the boundaries (`eslint.config.js`): the engine imports nothing outside itself, reads
no clock, random source or environment, and writes no output; every package imports another by its
name and entry, never by a relative path. `engine/src/boundary.test.ts` proves each rule fires.

## 7. Verification

- The engine's tests assert on events and state, never strings.
- `npm test` runs every package's tests and checks but the harness's runs and the speed
  tests, which `npm run harness` runs; CI adds lint, typecheck and the browser specs in Chromium at
  three widths.
- The harness measures play; a release proves it by `gate` or `neutral --expect`
  ([`plan.md`](./plan.md) §1).
- Coverage is reported, never enforced (DL-233).
- What runs when: [`agents/delivery.md`](./agents/delivery.md).

## 8. Conventions

- British English in documents, prose and UI. Kebab-case files.
- The glossary's words, exactly ([principle 13](./principles.md)), capitalised as
  [`agents/ui-text.md`](./agents/ui-text.md) says.
- Decisions, comments and documents as [`agents/documentation.md`](./agents/documentation.md) and
  [`agents/comments.md`](./agents/comments.md) say; tuning values as
  [`agents/config.md`](./agents/config.md) says.
- Prefer boring and testable. One maintainer, intermittent hours.
