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
| M9 | The page redesigned | The page as views in a shell, the History for any entity, a Party builder with each Hero's availability and attributes, a new style; the Guildmaster's setup within a Trait budget and Succession for a Rival (#30); the Bankruptcy and staffable-Quest stops (#32). The v1.1 line (DL-99, DL-100) | Built and verified 2026-09-29 on `v1.1-dev` (DL-108), with the owner's answers built (DL-109, DL-110); released as `v1.1.0` on 2026-09-30 from CI (DL-122, DL-123) after the owner's player test added a follow-on, M9-F1 to M9-F6 (DL-111, DL-112), planned 2026-09-29, approved as amended the same day (DL-113: every Guildmaster 21 to 50 and retiring at 61), built (DL-114 to DL-118) and verified 2026-09-30 on `v1.1-dev` (DL-119); the owner's answers on the close built as M9-F7 (DL-120, DL-121); `m9-redesign` and `v1.1.0` wait for the owner's steps (M9-S9, #37, DL-123, deployed from CI by DL-122) |

The first build is complete: M8 was tagged `m8-modules` on 2026-09-28. The next work is Random
Events (§4): the first real module, and the test of whether the module contract fits a real
feature (ADR-0005 as amended). Before it comes one small v1.0.x release, the move to Cloudflare
Workers static assets, which now heads §4's list (amended 2026-09-28, DL-88; originally "the
first line of §4"). That release is v1.0.1: the move, M8's deploy and its own recorded, and three
page fixes that change no play, planned in
[`planning/epics/v1.0.1-release.md`](./planning/epics/v1.0.1-release.md) (amended 2026-09-28,
DL-92). v1.0.1 is complete as of its tag, `v1.0.1`, on 2026-09-28 (amended 2026-09-28, DL-97).

**The measured game is a twenty-year slice** (amended 2026-09-28, DL-83). The harness plays each
seed for twenty years unless an ending comes first, so M2's row, which said "whole games to an
ending", now says a game played to an ending or to its twentieth year, and the years after the
twentieth are outside what the harness measures. The owner's decision, where the agents recommended a small full-length run
to the ending at each close.

**Releases after the first build** (amended 2026-09-28, DL-86; 2026-09-29, DL-109). The first build is released as
`v1.0.0`, tagged at `m8-modules`. New work is on `v1.1-dev` and is released by merging into
`v1.1-release`; milestone tags continue (`m9-random-events`); `v1.0-dev` and `v1.0-release` are
frozen but for v1.0.x hotfix releases, each committed on `v1.0-dev`, tagged on `v1.0-release`
and merged into `v1.1-dev` (DL-91); the first is the Workers move (DL-88). Production
serves the latest release: `v1.0.0` stays live until `v1.1-release`'s first release, when the
Pages production branch and the deploy script move to `v1.1-release`. GitHub's default branch
follows the same rule: `v1.0-release` from 2026-09-28, `v1.1-release` at its first release
(DL-88). The owner's decision to cut v1.0 now and open a new line, where
the agents recommended making Random Events M9 on the v1.0 line.

*Amended 2026-09-28 (DL-92).* The first v1.0.x release is `v1.0.1`: the Workers move, M8's deploy
and its own recorded, and three page fixes the owner added against the recommendation (tied
Rankings as a shared place, the Bankruptcy countdown, fast forward in steps with a Stop), amending
DL-91 item 4 for these three alone. Before its work, `v1.0-dev` is fast-forwarded to the commit
that recorded its plan, so the v1.0 line carries DL-82 onwards; then DL-91's flow applies. It is
deployed only from a clean checkout of its tag, to the Worker and then to Pages. From its deploy,
`v1.0.1`, not `v1.0.0`, is what production serves until `v1.1-release`'s first release.

*Amended 2026-09-28 (DL-94).* From `v1.0.1` the page is served at two addresses: the Worker
`heroesim` on Cloudflare Workers static assets, at <https://heroesim.magical-potato.workers.dev>,
and the Pages project `heroesims` at <https://heroesims.pages.dev>, which alone served the page
from M7 to `v1.0.0` (corrected 2026-09-28, DL-97). `npm run deploy` runs only from a clean
checkout of a release tag (`v*`) and refuses anything else before it builds; it builds once,
uploads that build to the Worker and then to Pages, stopping at the first failure, and prints the
record the release's decision-log entry keeps. `npm run e2e:live -w web` then checks both
addresses at both widths.

*Amended 2026-09-29 (DL-99).* The v1.1 line is the page redesigned.
- *M9, the redesign.* It is built on `v1.1-dev` with #30 (the Guildmaster's setup) and #32 (the
  Bankruptcy and staffable-Quest stops) as stories. It is tagged `m9-redesign` and released as
  `v1.1.0`, when #37 moves production and GitHub's default branch to `v1.1-release`.
- *Random Events moves to the v1.2 line.* It becomes M10, tagged `m10-random-events` in place of
  `m9-random-events`, on `v1.2-dev`, which is created from `v1.1-release` at `v1.1.0`. Every other
  open issue goes with it, in the order it had against Random Events.
- *The v1.1 line after `v1.1.0`.* It is frozen but for v1.1.x hotfixes, merged forward into
  `v1.2-dev`, as the v1.0 line is. Production moves to `v1.2-release` at its first release.

The order is the owner's decision. The branch and tag names are an agent's proposal (DL-99
item 10).

*Amended 2026-09-29 (DL-109).* The v1.0 line is never deployed again once `v1.1.0` is live. A
Worker has no branches, so a v1.0.x deploy would replace v1.1 at the workers.dev address. A fix
after `v1.1.0` goes out as v1.1.x on the v1.1 branches, merged forward, which amends DL-91 item 4's
flow for v1.0 from then on. The owner's decision (DL-109 item 5).

## 3. Increments

The detailed implementation plan — stories, acceptance, files, config fields, events and
counters per milestone, and the inputs the owner must supply — is in
[`planning/epics/`](./planning/epics/README.md). This section is the summary it expands.

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

## 4. After the first build

Modules, in whatever order the module contract makes cheapest: Random Events (the smallest,
and the first real module; the next work, the first build being complete), Scenarios,
Campaigns, Contacts, Factions, Scouting and hidden information, Workers, Skill growth, the
Guildmaster in a Party, the deferred endings. They are not sequenced here; the first build will
show which is cheapest to prove next.

*Amended 2026-09-28 (DL-89).* The list is completed with the deferrals recorded elsewhere, and
it is ordered after Random Events: Random Events' close picks what comes next. Whether a later
feature is a module or a change to the core is decided per feature, in its epic, with no general
rule, so "Modules" above no longer decides it for any line below (the owner's decision, where
the agents recommended that story features be modules and rule extensions core increments).

- **First, before Random Events:** the move to Cloudflare Workers static assets, as the first
  v1.0.x release, on v1.0; it deploys to both the new `*.workers.dev` address and Pages, and
  Pages stays until Cloudflare retires it (DL-88). It is `v1.0.1`, with three page fixes beside
  the move and the Worker named `heroesim` (amended 2026-09-28, DL-92).
- **Next:** the page redesigned, M9, on `v1.1-dev`, with #30 and #32, released as `v1.1.0`
  (§2). Views in a shell, the History for any Guild, Hero or Patron, a Party builder showing each
  Hero's availability and attributes, and a new visual style (DL-99). Autosave and keyboard
  shortcuts come after it (DL-99 items 4 and 5). *Amended 2026-09-29 (DL-99): the owner put the
  redesign before Random Events.* *Amended 2026-09-29 (DL-111): the owner's player test of M9 adds a
  follow-on inside `v1.1.0` (`docs/planning/epics/M9-feedback.md`).*
- **Then, inside the v1.1 line:** Portraits, Guild Banners and Unique Items' pictures, the
  Guildmaster described from content, and every standalone text beginning with a capital, as the
  patch `v1.1.2`, built on `v1.1.2-dev` from `main` (`docs/planning/epics/v1.1.2-release.md`).
  *Added 2026-09-30 (DL-125).* *Built and verified on `v1.1.2-dev` 2026-09-30 (DL-133); S7, which
  renames the Portrait stream `gm-portraits`, was built 2026-10-01 (DL-137). Released as `v1.1.2`
  on 2026-10-01.*
- **Then, inside the v1.1 line:** Portraits that follow the person, as the patch `v1.1.3`, built on
  `v1.1.3-dev` from `main` (`docs/planning/epics/v1.1.3-release.md`):
  - a Portrait for every Guildmaster and Hero, chosen to fit them, with the Silhouette where none
    fits;
  - Guildmasters' Portraits drawn on `gm-portraits`, which `v1.1.2` names in its S7, and Heroes' on
    `hero-portraits`;
  - Heroes gaining an Appearance and a Biography;
  - a portrait tool, with its skills, for intake, analysis and apply.

  *Added 2026-10-01 (DL-134, DL-135).* *Built and verified on `v1.1.3-dev` 2026-10-02 (DL-138 to
  DL-147). Released as `v1.1.3` on 2026-10-02 (pull request #47).*
- **Then, inside the v1.1 line:** Richer Quests, as the patch `v1.1.4`, built on `v1.1.4-dev` from
  `main` (`docs/planning/epics/v1.1.4-release.md`):
  - a Check's score written in content as a Query over the Party's Heroes, and a Synergy's
    requirements too;
  - one to four named Checks to an Encounter, with Degrees from Triumph to Failure, and a strong
    success needing Triumphs;
  - each Hero's form, from their Morale and any wound taken on the Quest, and harm that falls by
    the Stats;
  - the chances shown as words on the Board and in the Party builder, and the Rivals choosing their
    Parties by the same estimate;
  - Guildmaster and Hero Traits in two lists, each Trait a list of effects; Hero Traits with
    effects, and Traits rarely earned on Quests;
  - the Encounters widened, with a `lore` kind and finales, so that every Hero Stat is read by at
    least three Checks;
  - the Guildmaster's setup: "Choose for me" for the whole Guildmaster, or the player's own sex,
    age, picture and Stats from a pool of points;
  - a local content editor for the owner, Traits its first kind, and Claude Code skills for Traits,
    kept current by a register of every use of a Trait that CI checks.

  *Added 2026-10-02 (DL-148): the owner put it inside the v1.1 line, before Random Events. The
  setup (DL-149), and Traits with their editor and skills (DL-150), added the same day.* *Built and verified on
  `v1.1.4-dev` 2026-10-03 (DL-151 to DL-167), the Quest target deferred by the owner and recorded
  unmet (DL-165, DL-166). Released as `v1.1.4` on 2026-10-03 (pull request #50).*
- **Then, inside the v1.1 line:** the owner's answers to v1.1.4's open questions, as the patch
  `v1.1.5`, built on `v1.1.5-dev` from `main` (`docs/planning/epics/v1.1.5-release.md`):
  - one 20-year game's memory profiled, and its main cause fixed with the same games;
  - the harness's automatic player choosing its Quests by their chance, not the highest reward it
    can staff, and a new 50 × 20 baseline, with no rule of the game changed for it;
  - an Injury falling on the next-weakest unhurt Hero, and the positive earned Traits back at a
    chance of 0.05, each measured by its own sweep;
  - `partyFor` adding a Hero only for a real gain, the estimate's harness test with Morale's
    consequences in, and the words of the Earned Trait and the Chance band;
  - an information-only sweep with the XP split across the Party, for the owner's decision;
  - on the Board, the Heroes who cannot go, Away or Injured, listed last in the Party builder, their
    chips reading just "Away" and "Injured";
  - the Roster as Tiles or a Table of each Hero's effective Stats, its columns chosen, sorted by any
    of them, with each Hero's Traits and Items.

  *Added 2026-10-03 (DL-168); the Board and the Roster added the same day, and the build order
  optimised: the screens and the words first, then the engine's chain (DL-169).* At its close, the owner's rule picks
  what follows (DL-168 item 16): if the new harness player brings the player's Bankruptcies within
  5 to 15% of games, Random Events next and the economy pass (#51) after; if not, the economy pass
  first, as `v1.1.6`. *Built, verified and closed on `v1.1.5-dev` 2026-10-04 (DL-170 to DL-181), the
  release awaiting the owner. The closing sweep's player Bankruptcies, 12 of 50 (24%; S3's baseline
  13), fall outside 3 to 7, so the economy pass comes first, as `v1.1.6` (DL-181).* *Reopened
  2026-10-04 by the owner's answers at the close (DL-182): the XP split across the Party, each Hero
  who comes home taking the Quest's XP divided by the Party's size, ships in `v1.1.5` (S13), and the
  Roster's Tiles show a Unique Item's picture with a thin gold glow around its Hero, the Table the glow
  alone (S14); then a short re-close. The rule's outcome is overridden: the economy pass goes to the
  backlog, and what follows `v1.1.5` is to be decided.* *Re-closed 2026-10-04 (DL-183 to DL-185): S14 and
  S13 built and verified, S13's sweep the closing sweep (0 of 50 player Guilds bankrupt); #52's
  judgement calls 4 and 6 built; no Guild's Roster capped; the release awaiting the owner.*
- **The economy pass (#51), in the backlog:** after other game balances and features, by the owner's
  answer at v1.1.5's close (DL-182): the late Bankruptcies, the DL-83 targets, the wage's shape, Rival
  income, the form factors, and the Market's size and draws by slot (DL-168 items 2, 9 and 12). The
  XP split is no longer in it: it ships in `v1.1.5`. *Added 2026-10-04 (DL-181) as the patch
  `v1.1.6`, before Random Events, by DL-168 item 16's rule; amended the same day (DL-182): not
  `v1.1.6`, but deferred to the backlog by the owner, its place to be decided.*
- **The Transfer Generator's Roster bound removed, in the backlog:** its own bids keep a Rival's
  Roster at or below `rivalRosterMax` (DL-59), kept for now only as a development measure to
  constrain testing load; no Guild's Roster is otherwise capped, each growing as far as its finances
  support. *Added 2026-10-04 (DL-185), by the owner's answer at v1.1.5's re-close: "the transfer
  generator cap stays purely for development and constraining testing load for now, will remove
  this in the future".*
- **The History's size and the save's compression investigated, in the backlog:** the save after 20
  years has grown from 47.1 MiB (M7) to 136.7 MiB uncompressed (v1.1.5-S13), most of it History, about
  11,700 entries a year at about 475 characters each; shorter entries, or compressed saves, to be
  weighed. `v1.1.6`'s growth guard (S2) watches it meanwhile. *Added 2026-10-05 (DL-186 item 31), the
  owner's yes.*
- **A Hero's page showing a Stat's sources, in the backlog:** the Roster's tooltip ("Base 12, +2 from
  Gear…") on a Hero's page too, once `v1.1.6`'s `statBreakdown` exists. *Added 2026-10-05 (DL-186
  item 31): A3's option (b), not chosen for `v1.1.6`.*
- **Next: `v1.1.6`, deeper modules, less duplication, and tuning as checked data**, on `v1.1.6-dev`
  ([epic](./planning/epics/v1.1.6-release.md), DL-186). The owner's answers to an architecture review
  after `v1.1.5`, every candidate and small fix in scope, no new gameplay, 19 stories:
  - the harness's tooling: a sweep's totals by one fold; one parser of the run's settings with
    profiles (`gate`, `neutral`); a JSON report, `compare`, and a declared Gate spec
    (`harness/gate.json`) a `gate` run checks; the replay played once against the shard's record;
  - content and configuration as checked data: the content version as a data file and the editor's
    `update` for a use; content importing the engine's values; `playDeps` checking all 121 settings;
    the old content form and the Quests' `demands` gone; the tuning values in `engine/src/config.json`
    with the editor's config kind;
  - deeper engine modules: harm targeting in `harm.ts`; one Query operator table; a Stat's breakdown;
    the engine's interface narrowed; the write-once data outside the per-Turn copy (ADR-0011);
  - one set of words for the CLI and the page, and the page's plumbing: whether a Hero can go, the
    Party builder, a declared Class order, breakpoints and remembered preferences;
  - new knobs defaulting to today's play: draw weights, the sex weight, the Rivals' orders and the
    Finale's loot.

  *Added 2026-10-05 (DL-186). What follows `v1.1.5` had been left to the owner (DL-182 item 2).*
- **Then:** Random Events, M10, on `v1.2-dev` (§2), with its groundwork and the issues ordered
  against it. Random Events never produce Quests (DL-82). *Amended 2026-09-29 (DL-99): it was
  "Next", on `v1.1-dev`.* *Amended 2026-10-03 (DL-168): after `v1.1.5`, or after a `v1.1.6`
  economy pass, by DL-168 item 16's rule.* *Amended 2026-10-04 (DL-181): after `v1.1.6`, the rule
  having named the economy pass first.* *Amended 2026-10-04 (DL-182): there is no `v1.1.6` economy
  pass; when Random Events comes is the owner's to decide.* *Amended 2026-10-05 (DL-186): `v1.1.6` is the
  architecture work, with no gameplay; when Random Events comes is still the owner's to decide.*
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

## 5. Decisions this plan rests on

The decisions this plan was settled from are recorded as DL-01 to DL-10 in
[`decision-log.md`](./decision-log.md), in the order this plan reached them.
