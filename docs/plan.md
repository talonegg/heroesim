# Heroesim v2 — delivery plan

The order in which the first build is built, settled 2026-09-25 after two rounds of
questioning. It supersedes the build order that stood in [`approach.md`](./approach.md) §6.
What is being built is in [`requirements.md`](./requirements.md); why it is shaped this way is
in [`principles.md`](./principles.md); the document it starts from is
[`data-model.md`](./data-model.md). Vocabulary is [`../CONTEXT.md`](../CONTEXT.md).

## 1. How the plan works

**Working software at every increment.** An increment is a session or two of work. It is done
when the tests pass, the harness runs, and a human can drive the result from the CLI. The CLI
starts in M1 as a handful of commands over the engine's selectors and gains one command per
increment; it is never a separate milestone. The browser front end waits until the engine's
action set is stable (M7).

**Milestones group increments.** A milestone is one coherent subsystem: the eight of the old
§6, re-ordered, plus a skeleton. Each has a named "done" and the harness counters and measures
it must record. Milestones are sequential; increments inside one may be reordered as building
teaches.

**Tracking.** One GitHub issue per milestone, opened when the milestone starts and not before,
carrying its increments as a checklist. A milestone completes with a git tag on the closing
commit (`m1-world-state`), the issue closed, and its status and date written in the table in §2.
The rationale lives here; the checklist lives in the issue.

**Measure before tune.** Every milestone names the counters the harness must report from then
on. The performance targets in `data-model.md` §7 are recorded, not chased: each is measured in
the first milestone that can measure it, and the number is written into the decision log.

**Rivals act from the loop.** The Guild Generator makes Rival Guilds in M1 and their controllers
draw from the Board and the Unattached pool from M2, with one trivial disposition. Every rule
after M2 is written and tuned against a contested Board (ADR-0002). M6 adds the named
dispositions and Transfers.

**The module contract comes last in the first build.** The Turn pipeline is built flat in M2 and
given registration, state slices and phases in M8, with Random Events as the proving module.
ADR-0005 is amended accordingly: the contract is built before any story module, not in the
first increments.

**No spikes.** Determinism, per-Turn copy cost and History size are measured inside M1 and M2
rather than investigated beforehand.

## 2. Milestones

| # | Milestone | Done when | Status |
| --- | --- | --- | --- |
| M0 | Skeleton | `npm test` runs; the lint rule fails a deliberate `Math.random` in `engine/`; CI green; decision log exists | |
| M1 | World State | A seeded world of Guilds, Heroes, Patrons and an Unattached pool is created, validated, saved, loaded and shown; 1,000 worlds byte-identical across two runs | |
| M2 | The loop | The harness plays whole games to an ending under an automatic policy; a human can advance, dispatch and recruit from the CLI | |
| M3 | Progression | Heroes gain Levels toward their Potential and decline with age; Rankings order Guilds by Fame and Wealth | |
| M4 | Quest Engine | The stub is replaced by typed encounters and checks reading Skills, Relationship and Synergies | |
| M5 | Items | Gear, consumables, the Market, Loot and Hall Improvements exist and are bought, sold, equipped and expended | |
| M6 | Rivals | Named dispositions; Transfers in both directions; Rivals transfer among themselves | |
| M7 | Web | The browser front end is served from a Cloudflare Pages URL with saves in IndexedDB | |
| M8 | Modules | The module contract exists and Random Events run as a module; the core runs with it uninstalled | |

The first build is complete when M8 is tagged.

## 3. Increments

Each line is a session or two. A line is a deliverable, not a task: it ends in a passing test
and, where it says so, a CLI command. Reorder within a milestone freely; record why in the
decision log.

### M0 Skeleton

1. npm workspaces for `engine/`, `content/`, `harness/`, `cli/`, `web/`; TypeScript; Vitest;
   one placeholder test per package.
2. ESLint: `engine/` may import nothing outside itself and may not use `Math.random`, `Date`,
   `console` or `fs`. A test proves the rule fires.
3. CI running `npm test` and lint on push.
4. `docs/decision-log.md` created with its first entries: the answers this plan was settled
   from.

### M1 World State

1. `WorldDocument` types with branded ids; the `meta` / `world` / `history` split; JSON-safe
   rule enforced by a test.
2. Seeded random source with named streams in `world.rng` (ADR-0009); a test that each stream
   advances only when its subsystem runs.
3. History append function with `byEntity`, `byType` and `milestones` indexes (ADR-0008); a
   test that entries only grow.
4. `content/`: the twenty Hero Stats and five Guildmaster Stats with areas and ranges, the four
   Classes with Stat bias, name lists, Backgrounds; the loader with a pure entry and a Node
   entry; content validation at load.
5. Heroes Generator: a Hero from a Class and the `heroes` stream, with Stats, Potential,
   starting Skills and age.
6. Guild Generator and Patron Generator: the player's Guild from the setup, Rival Guilds with a
   placeholder disposition, Patrons with Sphere flavour and Quest template keys, the Unattached
   pool.
7. The validator from `data-model.md` §6, run on every load and after every `advance` in tests.
8. Canonical serialise and deserialise with sorted keys; `meta.version`; a refused load names
   its versions.
9. CLI: `new --seed`, `show` (Guilds, Roster, pool, Patrons), `save`, `load`. Local file saves.
10. Harness skeleton: create 1,000 worlds, report Stat distributions and pool sizes.
    **Measure:** two runs of the same seed are byte-equal.

### M2 The loop

1. `advance` one Turn: clone `world`, share `meta` and `history`, bump `turn`; Day and time of
   day derived. CLI `advance`.
2. Turn pipeline as a flat ordered list of phases: morning, afternoon, night, in the order
   `approach.md` §2 gives.
3. Quest Generator and Quest templates in content, each carrying weighted Stat demands
   (`[StatKey, weight][]`); the Board refreshes each morning, weighted by Patron Regard.
4. Dispatch: a Party from the Roster to an offered Quest; Party unavailable while away; the
   Quest advances every Turn. CLI `dispatch`.
5. Stub Quest Engine: the Party's Stats scored against the Quest's weighted demands; outcome
   applies reward or penalty, Fame effect, XP, simple Injury or Death; typed events.
6. Hero State Engine at night: healing, Morale drift, ageing, Retirement checks.
7. Guild State Engine at night: Upkeep on its Day, Fame, Wealth floor.
8. Recruitment from the Unattached pool for a signing fee; pool refresh at night. CLI `recruit`.
9. One trivial Rival disposition: take the easiest affordable Quest, recruit when Wealth
   allows. Rivals act after the player each morning.
10. Endings: Retirement, Bankruptcy, Roster wiped; typed ending events.
11. Fast forward with typed stop reasons: a Party returns, an ending, a decision needed. CLI
    `advance --until`.
12. Harness automatic policy playing to an ending over N seeds. **Counters:** Quests taken and
    outcomes by kind, deaths, Bankruptcies, years survived. **Measure:** advance cost per Turn,
    History entries and save size after 20 simulated years.

### M3 Progression

1. XP and Levels; Class growth profiles in content raise Stats per Level up to Potential.
2. Potential hints as a selector the CLI shows.
3. Ageing decline past a configured age.
4. Rankings by Fame and by Wealth as selectors. CLI `rankings`.
5. **Counters:** Levels gained, Heroes reaching Potential, Retirements by age.

### M4 Quest Engine

1. Encounter model: a Quest template carries a sequence of typed encounters, each a check
   with typed consequences.
2. Skills as modifiers to checks; requirements for a needed Class or Skill enforced.
3. Regard between Heroes and Relationship as a selector; Relationship scales teamwork.
4. Synergies in content, matched on Party Classes and Skills.
5. Guildmaster Stats in Guild-side actions: negotiation on reward, recruitment, Morale.
6. **Counters:** encounter outcomes by check type, Synergies triggered, Injuries by type.

### M5 Items

1. Item definitions in content; `items` and `stacks` tables with holders; the duplicate-stack
   validator check.
2. Gear slots on a Hero modifying effective Stats through the selector. CLI `equip`.
3. Consumables assigned at dispatch and expended by the Quest Engine.
4. Market refresh each morning; buy and sell with the sell price below the buy price. CLI
   `buy`, `sell`.
5. Loot tables and Loot on hard Quests.
6. Hall Improvements raising infirmary, training yard and quarters grades. CLI `build`.
7. **Counters:** Wealth spent by category, Loot awarded, Improvement grades reached.

### M6 Rivals

1. Named Rival dispositions in content, weighting Board and pool draws.
2. Transfers in both directions for a fee; Morale cost to the Roster that stays. CLI
   `transfer`.
3. Transfer Generator moving Heroes between Rivals as time passes.
4. Rival Hall and Wealth advancing under their disposition.
5. **Counters:** Transfers by direction, Rival Roster sizes and Wealth over time.

### M7 Web

1. Static build of a browser viewer over the same engine and selectors: world, Roster, Board,
   Hero page from the History.
2. Advance, dispatch, recruit from the browser.
3. Saves in IndexedDB with compression on write.
4. Playwright covering create, advance, save, reload.
5. Deployed to Cloudflare Pages; the URL recorded in the README.

### M8 Modules

1. Registration: a module declares its id, its `world.modules` slice, its random stream and
   the phases it hooks.
2. The pipeline calls registered modules at `onMorning`, `onAfternoon` and `onNight`; a
   module may ask fast forward to stop.
3. Random Events as a module: content with conditions and effects, drawn at night.
4. Slice validation and migration owned by the module; a test that the core runs with no
   module installed.
5. ADR-0005 amended to record the timing.
6. **Counters:** Random Events by type; a harness run with and without the module.

## 4. After the first build

Modules, in whatever order the module contract makes cheapest: Scenarios, Campaigns, Contacts,
Factions, Scouting and hidden information, Workers, Skill growth, the Guildmaster in a Party,
the deferred endings. They are not sequenced here; the first build will show which is cheapest
to prove next.

## 5. Decisions this plan rests on

Recorded here until `docs/decision-log.md` exists in M0, then copied there.

- Session-sized increments grouped into milestones, over week-sized increments (owner).
- Harness and a thin CLI from M1 are the bar for working software (owner).
- Rivals act from M2 with one trivial disposition (owner).
- Module contract last in the first build; ADR-0005 amended for timing (owner).
- Progression before the Quest Engine before Items before Rivals (owner).
- The stub Quest Engine scores weighted Stat demands carried on the Quest template, closing the
  open item in `requirements.md` §5 (owner).
- `content/` exists from M1, not extracted later (owner).
- No timeboxed spikes; measures recorded in the first milestone that can take them (owner).
- One GitHub issue per milestone, opened lazily; git tag per milestone (owner).
- Cloudflare Pages deploy is part of M7's done (owner).
