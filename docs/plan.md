# Heroesim v2 — delivery plan

The order in which the first build is built, settled 2026-09-25 after two rounds of
questioning. It supersedes the build order that stood in [`approach.md`](./approach.md) §6.
What is being built is in [`requirements.md`](./requirements.md); why it is shaped this way is
in [`principles.md`](./principles.md); the document it starts from is
[`data-model.md`](./data-model.md). Vocabulary is [`../CONTEXT.md`](../CONTEXT.md).

## 1. How the plan works

**Working software at every increment.** An increment is a session or two of work. It is done
when the tests pass and, from M1-S9 onward, the harness runs and a human can drive the result
from the CLI; M0 and the first M1 stories end with passing tests (E9). The CLI
starts in M1 as a handful of commands over the engine's selectors and gains one command per
increment; it is never a separate milestone. The browser front end waits until the engine's
action set is stable (M7).

**Milestones group increments.** A milestone is one coherent subsystem: the eight of the old
§6, re-ordered, plus a skeleton. Each has a named "done" and the harness counters and measures
it must record. Milestones are sequential; increments inside one may be reordered as building
teaches.

**Tracking.** One GitHub issue per milestone, opened when the milestone starts and not before,
carrying its increments as a checklist. A milestone completes by merging `v1.0-dev` into
`v1.0-release`, a git tag on that merge (`m1-world-state`), the issue closed, and its status
and date written in the table in §2. After the first build the same holds on the next line:
work merges from `v1.1-dev` into `v1.1-release`, and milestone tags continue (amended
2026-09-28, DL-86; §2).
The rationale lives here; the checklist lives in the issue.

**Measure before tune.** Every milestone names the counters the harness must report from then
on. The performance targets in `data-model.md` §7 are recorded, not chased: each is measured in
the first milestone that can measure it, and the number is written into the decision log.
After the first build, §7's targets are rebaselined on the M8 run's verified figures, and save
size is measured compressed (amended 2026-09-28, DL-84).

**Rivals act from the loop.** The Guild Generator makes Rival Guilds in M1 and their controllers
draw from the Board and the Unattached pool from M2, with one trivial disposition. Every rule
after M2 is written and tuned against a contested Board (ADR-0002). M6 adds the named
dispositions and Transfers.

**Three accepted exceptions to ADR-0002.** The ADR says no rule asks whether a Guild is the
player's. Three rules in this plan do, and the owner accepted them on 2026-09-25 rather than
amend the ADR: the game ends when the player's Guild ends, while a Rival's ending only folds
that Guild (M2); the Transfer Generator never takes from the player's Guild (M6); and on the
Board, the player's controller acts before the Rivals' (M2, R22). A test may grep the engine
for `controller.kind` and expect exactly these reads. A fourth needs a decision, not a commit.

*Amended 2026-09-28.* The owner has made that decision: a fourth accepted exception is that
Random Events befall the player's Guild only, and the harness reports their effects on the
player's Guild alone (DL-82; ADR-0002 amended; the agents had recommended that Random Events
befall every Guild alike). The guard test is `engine/src/controller-reads.test.ts`, and its
recorded list, not "exactly these reads", is where every read of a Guild's controller the engine
may make is set down, each with its reason. Its entries beyond the exceptions are the agents'
reading, which the owner confirmed: a Guild answering a Transfer through an offer, where a Rival
answers through its Disposition, is the difference in controller that ADR-0002 allows, not an
exception (DL-85). The list gains the Random Events exception when that module lands. A read the
list does not record, or a further exception, still needs the owner's decision, not a commit.

**The module contract comes last in the first build.** The Turn pipeline is built flat in M2 and
given registration, state slices and phases in M8, proved by a test-only probe module that
exercises every part of the contract. Random Events, the first real module, follows the first
build (owner, 2026-09-25, pre-M0 review A5). ADR-0005 is amended accordingly: the contract is
built before any story module, not in the first increments.

**No spikes.** Determinism, per-Turn copy cost and History size are measured inside M1 and M2
rather than investigated beforehand.

## 2. Milestones

| # | Milestone | Done when | Status |
| --- | --- | --- | --- |
| M0 | Skeleton | `npm test` runs; the lint rule fails a deliberate `Math.random` in `engine/`; CI green; decision log exists | Done 2026-09-26 (`m0-skeleton`) |
| M1 | World State | A seeded world of Guilds, Heroes, Patrons and an Unattached pool is created, validated, saved, loaded and shown; 1,000 worlds byte-identical across two runs | Done 2026-09-26 (`m1-world-state`) |
| M2 | The loop | The harness plays each game for twenty years, or to its ending if that comes first, under an automatic policy; a human can advance, dispatch and recruit from the CLI (amended 2026-09-28, DL-83: originally "plays whole games to an ending"; the measured game is a twenty-year slice, below) | Done 2026-09-26 (`m2-the-loop`) |
| M3 | Progression | Heroes gain Levels toward their Potential and decline with age; Rankings order Guilds by Fame and Wealth; Hall Improvements are bought | Done 2026-09-26 (`m3-progression`) |
| M4 | Quest Engine | The stub is replaced by typed encounters and checks reading Skills, Relationship and Synergies | Done 2026-09-26 (`m4-quest-engine`) |
| M5 | Items | Gear, consumables, the Market and Loot exist and are bought, sold, equipped and expended | Done 2026-09-27 (`m5-items`) |
| M6 | Rivals | Named dispositions; Transfers in both directions; Rivals transfer among themselves | Done 2026-09-27 (`m6-rivals`) |
| M7 | Web | The browser front end is served from a Cloudflare Pages URL with saves in IndexedDB | Done 2026-09-27 (`m7-web`); the twenty-year save measure left to the owner |
| M8 | Modules | The module contract exists and a probe module proves every part of it; the core runs with none installed, byte-identical to M7 | Done 2026-09-28 (`m8-modules`); the first build's 1,000 × 20 tagged run in DL-81 |
| M9 | The page redesigned | The page as views in a shell, the History for any entity, a Party builder with each Hero's availability and attributes, a new style; the Guildmaster's setup within a Trait budget and Succession for a Rival (#30); the Bankruptcy and staffable-Quest stops (#32). The v1.1 line (DL-99, DL-100) | Done 2026-09-30 (`m9-redesign`), released as `v1.1.0` with its follow-on, M9-F1 to M9-F7 |

**The measured game is a twenty-year slice** (amended 2026-09-28, DL-83). The harness plays each
seed for twenty years unless an ending comes first, so M2's row, which said "whole games to an
ending", now says a game played to an ending or to its twentieth year, and the years after the
twentieth are outside what the harness measures. The owner's decision, where the agents recommended a small full-length run
to the ending at each close.

**Releases.** The first build was released as `v1.0.0`, tagged at `m8-modules`, and the v1.0 line is
frozen and never deployed again (DL-86, DL-109). The v1.1 line followed it. Since `v1.1.1`, every
release is a merged pull request to `main`, which is production. A release is built on its own dev
branch (`v1.1.N-dev`), and `v1.1-release` is moved to it. CI then raises the pull request to `main`,
and the owner's merge tags the release and deploys it to both addresses (DL-124; the README's
Deploy). Random Events, M10, opens the v1.2 line on `v1.2-dev` (DL-99). The record of how this flow
came to be, from DL-86 to DL-109, is in [`planning/archive/`](./planning/archive/README.md).

**The release ledger.** Each release's one record, written at its close. The epics are in
[`planning/archive/`](./planning/archive/README.md), the decisions in
[`decisions/index.md`](./decisions/index.md).

| Release | Date | Pull request | Merge commit | Decisions | Epic |
| --- | --- | --- | --- | --- | --- |
| `v1.0.0` | 2026-09-28 | — | `70508c6`, into `v1.0-release` | DL-01 to DL-85 | [M0](./planning/archive/M0-skeleton.md) to [M8](./planning/archive/M8-modules.md) |
| `v1.0.1` | 2026-09-28 | — | `5b0d66e`, into `v1.0-release` | DL-86 to DL-98 | [v1.0.1](./planning/archive/v1.0.1-release.md) |
| `v1.1.0` | 2026-09-30 | — | `4ec857f`, into `v1.1-release` | DL-99 to DL-123 | [M9](./planning/archive/M9-redesign.md), [its follow-on](./planning/archive/M9-feedback.md) |
| `v1.1.1` | 2026-09-30 | #42 | `a1b4178` | DL-124 | None: the release flow, no play changed |
| `v1.1.2` | 2026-10-01 | #45 | `800a402` | DL-125 to DL-133, DL-137 | [v1.1.2](./planning/archive/v1.1.2-release.md) |
| `v1.1.3` | 2026-10-02 | #47 | `18ab6a6` | DL-134 to DL-147 but DL-137 | [v1.1.3](./planning/archive/v1.1.3-release.md) |
| `v1.1.4` | 2026-10-03 | #50 | `75ee77f` | DL-148 to DL-167 | [v1.1.4](./planning/archive/v1.1.4-release.md) |
| `v1.1.5` | 2026-10-04 | #54 | `8bca6b9` | DL-168 to DL-185 | [v1.1.5](./planning/archive/v1.1.5-release.md) |
| `v1.1.6` | 2026-10-06 | #56 | `7fda66e` | DL-186 to DL-205 | [v1.1.6](./planning/archive/v1.1.6-release.md) |
| `v1.1.7` | 2026-10-07 | #58 | `25f8fa0` | DL-206 to DL-214 | [v1.1.7](./planning/archive/v1.1.7-release.md) |

A release's close adds its row here and fills its epic's Status line, and nothing else records it.

## 3. Increments

The detailed implementation plan of the first build — stories, acceptance, files, config fields,
events and counters per milestone — is in its epics, now in
[`planning/archive/`](./planning/archive/README.md); the inputs the owner supplied are in
[`planning/archive/INPUTS-REQUIRED.md`](./planning/archive/INPUTS-REQUIRED.md). This section is the
summary they expand.

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
   placeholder disposition, Patrons with Sphere flavour, the Unattached pool. (Amended
   2026-09-28, DL-86: originally "Sphere flavour and Quest template keys"; pre-M0 review D3
   dropped the keys, a Patron's templates being looked up by Sphere at draw time.)
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
   (`[StatKey, weight][]`); the Board refreshes each morning. Weighting by Patron Regard
   arrives in M4, once Regard has rules (E5).
4. Dispatch: a Party from the Roster to an offered Quest; Party unavailable while away; the
   Quest advances every Turn. CLI `dispatch`.
5. Stub Quest Engine: the Party's Stats scored against the Quest's weighted demands; outcome
   applies reward or penalty, Fame effect, XP, simple Injury or Death; typed events.
6. Hero State Engine at night: healing, Morale drift, ageing, Retirement checks.
7. Guild State Engine at night: Upkeep on its Day, Fame, Wealth floor.
8. Recruitment from the Unattached pool for a signing fee; pool refresh at night. CLI `recruit`.
9. One trivial Rival disposition: take the easiest affordable Quest, recruit when Wealth
   allows. Rivals act at the start of the afternoon, on what the player left in the morning.
   (Amended 2026-09-28, DL-86: originally "Rivals act after the player each morning";
   pre-M0 review D2.)
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
5. Hall Improvements: `build` raises a facility's grade for Wealth; `improvements.json`. CLI
   `build`. (Moved from M5, pre-M0 review D8.)
6. **Counters:** Levels gained, Heroes reaching Potential, Retirements by age, Improvement
   grades reached.

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
6. **Counters:** Wealth spent by category, Loot awarded, consumables expended per Quest.
   (Hall Improvements moved to M3, pre-M0 review D8.)

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
3. A probe module, test-only, exercising every hook, its slice, its stream and the effects
   API.
4. Slice validation and migration owned by the module; a test that the core runs with no
   module installed.
5. ADR-0005 amended to record the timing.
6. **Counters:** every core counter with and without the probe module installed.

## 4. Next

What comes next, in order. Releases already made are §2's ledger. Whether a later feature is a
module or a change to the core is decided per feature, in its epic (DL-89). The record of how this
list came to its order is in [`planning/archive/`](./planning/archive/README.md).

- **Now: `v1.1.8`, the documentation slimmed**, on `v1.1.8-dev`
  ([epic](./planning/epics/v1.1.8-release.md)): the documentation audit of 2026-10-08. Proposed;
  the decision log's archive and index built (DL-215), and the closed epics archived with this
  ledger.
- **Then: Random Events, M10** (#12; its groundwork #15 and #17), the first real module, on
  `v1.2-dev` (§2), with the issues ordered against it. Random Events never produce Quests (DL-82).
  When it starts is the owner's (DL-214).
  Its epic opens with a table of the owner's inputs, as the first build's `INPUTS-REQUIRED.md` §8
  asked: rows an agent drafts, each a question with a default and the owner's answer. Three of them
  block the build story until the owner answers: the catalogue of events, their rate, and whom they
  befall. DL-82 already answers some of it. Random Events befall the player's Guild only, and the
  harness reports their effects on that Guild alone. Morale's band edges are among their inputs.
  An agent proposes the harness's acceptance bands, and the owner approves them before the run.
  When their installation lands, the probe module leaves the public page.
- **After Random Events, in an order chosen at its close:**
  - Scenarios; Campaigns, with the Inciting Event generator beside them (DL-82); Contacts;
    Factions; Scouting and hidden information.
  - Patron visits. The Outing limit comes with the first of Patron visits and scouting, as
    pre-M0 review B1 decided, and applies to every Guild (R4, DL-89).
  - Poaching; Rival encounters during Quests; direct contests between Guilds, a separate later
    feature (DL-89). Guild Battle, the owner's diagram's term, keeps the meaning CONTEXT gives
    it: Rival encounters during Quests and the deferred ending Defeated by a Rival (DL-89).
  - Several Guilds' Parties on one Quest, as a candidate (DL-89).
  - The Guildmaster Trait that sharpens Potential hints (requirements §2, pre-M0 review D9);
    mid-Quest reports, the afternoon reporting a Quest's progress (M4's deferral).
  - Workers; Skill growth; the Guildmaster in a Party; the deferred endings.
  - Patron pictures, drawn on a `patron-portraits` stream, through the portrait tool (DL-135
    item 10).
- **In the backlog, their place to be decided:**
  - The economy pass (#51): the late Bankruptcies, the DL-83 targets, the wage's shape, Rival
    income, the form factors, and the Market's size and draws by slot (DL-168 items 2, 9 and 12),
    deferred by the owner after other balances and features (DL-182).
  - The Transfer Generator's Roster bound removed: its own bids keep a Rival's Roster at or below
    `rivalRosterMax` (DL-59), kept only as a development measure to constrain testing load
    (DL-185).
  - The History's size and the save's compression: after 20 years the History holds about 265,000
    entries a game and the save about 141 million characters, 17.5 MiB gzipped (DL-211). The Gate
    holds the gzipped mean under 30 MiB (DL-186 item 31, DL-188).
  - A Hero's page showing a Stat's sources, as the Roster's tooltip does (DL-186 item 31).
  - The weighted draws updated: a deal at creation that keeps to the weights' proportions when
    they are not all 1 (DL-210's review).

## 5. Decisions this plan rests on

The decisions this plan was settled from are recorded as DL-01 to DL-10 in
[`decision-log.md`](./decision-log.md), in the order this plan reached them.
