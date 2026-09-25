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

---

DL-11, DL-12 and DL-13 are reserved by the epics and are not written here: DL-11 is M0-S3's CI
red/green proof, DL-12 is M1-S2's PRNG choice, and DL-13 is M1-S10's determinism measure
(renumbered from a collision by pre-M0 review E1). The next writer of a new decision uses DL-14
onward.

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
