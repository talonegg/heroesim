# Pre-M0 review: items to action

Temporary working file. Findings from the 2026-09-25 review of the planning documents
(`docs/plan.md`, `docs/planning/epics/*`) against the ADRs, `CONTEXT.md`, `requirements.md`,
`principles.md`, `approach.md` and `data-model.md`. Each item is walked through with the owner,
decided, actioned, and marked. Delete this file when every item is **done**; the decisions
live on in the documents they changed and in `docs/decision-log.md` from M0-S4.

Status: `open` · `decided` · `done`.

**All 43 items are `done` as of 2026-09-26.** Decisions that departed from the recommendation:
A2 (exceptions kept, ADR unchanged), A5 (Random Events deferred; probe module for M8), B3
(Guildmaster Regard writers built), D4 (Guildmaster Stats renamed rather than shared), D1
(hybrid `rebase`). M0-S4 copies every decision here into `docs/decision-log.md`; this file is
then deleted.

Correction to the review as delivered: there is no `docs/adr/CONTEXT.md`; that was a misread
of an `ls` listing. Struck from the list.

---

## A. Contradictions: a plan document breaks an ADR or principle

### A1 · Rivals run the Quest Engine; ADR-0002 says they do not — `done`

**Issue.** ADR-0002's consequence: "their Quests do not run the Quest Engine in the first
build." M2-S9 routes Rivals through `dispatch` and the same night resolution; M6 §0 says a DL
records the change, but a decision-log entry cannot override an ADR.

**Options.**
- (a) Amend ADR-0002 (dated note): Rivals resolve through the same Quest Engine; "light" Rival
  simulation means their *choices* are simple, not their resolution. One code path; the
  harness measures Rival growth and losses on the same counters.
- (b) Honour the ADR text: a second, cheap resolution path for Rivals (a success chance by
  disposition). Two code paths, and the Rivals' Heroes never Level or die the way the player's
  do.
- (c) A config switch between (a) and (b). Both paths, forever.

**Recommendation.** (a).

**Decision.** (a), owner, 2026-09-25.
**Actions.** ADR-0002 amended with a dated note withdrawing the last consequence; M6 §0
reworded to cite the amendment.

### A2 · Rules that treat the player's Guild specially — `done`

**Issue.** ADR-0002 and principle 4 forbid any rule asking "is this the player's?". Three
places do: M2-S10 (the player's ending ends the game; a Rival's only folds), M6-S3 (the
Transfer Generator skips the player's Guild), R22 ("the player first" on the Board).

**Options.**
- (a) Amend ADR-0002 to enumerate the permitted reads of `controller.kind`, and remove the
  ones that can be removed by design:
  - Choices: whose come from where. Inherent; permitted.
  - Ending: "the game ends when a player-controlled Guild ends". A property of the controller,
    not the Guild; permitted.
  - Transfer Generator: bids on *any* Guild's Hero through that Guild's controller; a Rival's
    disposition answers, the player's controller answers through the `transfer-offer` stop
    that M6-S2 already has. No skip needed.
  - Board order: controllers act in Guild id order; the player's Guild is generated first at
    creation, so "the player first" holds by construction, not by a rule.
- (b) Leave the three as they are and record them as accepted exceptions without amending
  the ADR. The ADR then says one thing and the code another.

**Recommendation.** (a).

**Decision.** (b), owner, 2026-09-25: the three stay as named exceptions; ADR-0002 unchanged for this item.
**Actions.** `plan.md` §1 gains an "accepted exceptions to ADR-0002" paragraph naming all three; M6-S3 and M2 §3 cite it.

### A3 · The engine imports a type from the content package — `done`

**Issue.** approach §5 and M0-S2 forbid `engine/` importing any package. M1-S4 has the engine
import the `ContentSet` type from `@heroesim/content`, and `content/` imports engine types, so
the two packages would depend on each other.

**Options.**
- (a) Define `ContentSet` and every content row type in `engine/src/content-types.ts`. The
  content package imports them from the engine; the engine imports nothing. The content
  package's job is parsing and validating text into the engine's type.
- (b) A third package `@heroesim/types`. One more package to keep in step for one file.
- (c) Allow type-only imports engine → content. A cycle the compiler tolerates and the lint
  rule forbids — and `tsc -b` with composite project references refuses outright.

**Recommendation.** (a).

**Decision.** (a), owner, 2026-09-25.
**Actions.** M1-S4 now puts `ContentSet` and the row types in `engine/src/content-types.ts`;
its acceptance asserts the engine imports nothing from content and `tsc -b` builds as a DAG.

### A4 · The stub ignores Skills; R15 says it reads them — `done`

**Issue.** R15: "the stub Quest Engine reads [the Skill rating] as a flat modifier." M2-S5's
score is weighted Stats only.

**Options.**
- (a) Add to the stub: Quest templates carry `skillKeys`; score gains
  `stubSkillBonusPerRating × Σ ratings` of those Skills across the Party. One config field.
- (b) Amend R15: the stub ignores Skills; Skills first matter in M4. Heroes then carry Skills
  with no effect through M2 and M3.

**Recommendation.** (a).

**Decision.** (a), owner, 2026-09-25.
**Actions.** M2-S3's template gains `skillKeys`; M2-S5's formula, config
(`stubSkillBonusPerRating`) and acceptance updated. R15 unchanged.

### A5 · Requirements §2 defers two generators the plan builds — `done`

**Issue.** §2's scope table puts the Random Event and Transfer generators under "later". R3
and R6 treat Random Events as first-build; approach §1 lists "Rival Rosters churning"; M6-S3
builds the Transfer Generator and M8 builds Random Events as the proving module.

**Options.**
- (a) Amend the §2 row: Random Event Generator and Transfer Generator move to the first build
  (M8 and M6); the Inciting Event Generator stays deferred.
- (b) Drop both from the plan. M8 then has no proving module and Rival Rosters never change
  except by the player's Transfers.
- (c) Transfer Generator now, Random Events later. Rival churn kept; M8 proves the contract
  with a test-only probe module.
- (d) Random Events now, Transfer Generator later.

**Recommendation.** (a).

**Decision.** (c), owner, 2026-09-25.
**Actions.** requirements §2 table (Transfer → first build; Random Event and Inciting Event
generators → modules), R3 and R6 reworded; principle 10 reworded; approach §1 diagram marks
the Random Event Generator a module and §2's night phase no longer lists it; `plan.md` §1,
milestone table, M8 list and §4 updated; ADR-0005's note no longer names Random Events;
INPUTS §8 emptied; M2 §0 and the epics README updated; M8 rewritten around a probe module
(4–6 sessions).

### A6 · First-build front ends expose more than R37 allows — `done`

**Issue.** R37 and §2: first-build front ends are "a viewer plus advance, dispatch and
recruit"; "full action set" is later. The plan's Q2 decision (thin CLI gaining one command per
increment) and M5–M7 expose every engine action.

**Options.**
- (a) Amend R37 and the §2 row: front ends expose each engine action as it lands; delete the
  "full action set later" cell. This is what the owner decided in the plan interview.
- (b) Keep R37: the CLI and web expose three actions; buying, equipping and building are
  harness-only until "later". Nobody could play M5 by hand.
- (c) CLI every action; web a viewer plus the three; full web set after the first build.

**Recommendation.** (a).

**Decision.** (a), owner, 2026-09-25.
**Actions.** R37 and the §2 front-end row amended; epics unchanged.

### A7 · Some state changes emit no event — `done`

**Issue.** R36, principle 11 and ADR-0003 say every change is explained by an event and every
event is kept. M3-S2 (training XP), M2-S6 (nightly Morale drift) and M4-S4 (Regard changes
recorded only on band crossings) change state silently. `CONTEXT.md`'s Milestone entry and
data-model §7's "archiving old years" lever imply that non-Milestone entries can be dropped,
which R36 forbids.

**Options.**
- (a) Write the rule: a *discrete* change (a Quest outcome, an Injury, a Level, a Transfer)
  emits an event; a *continuous nightly drift* (Morale drift, training XP, Regard decay)
  is a rule of the config, reconstructible from the events that bound it, and emits an event
  only when it crosses a band. Every emitted event is kept, unbounded. Delete "archiving old
  years" from data-model §7. Amend principle 11 and R36 to say "every event", with drift
  defined as not an event.
- (b) Emit everything. Morale drift alone is Heroes × nights ≈ 170,000 entries per 20-year
  game. Breaks the save-size target with nothing the player would read.
- (c) One aggregated "night report" entry per Guild per night listing the drifts. ≈ 21,600
  entries per game; payloads grow with Roster size; still nothing the player reads.

**Recommendation.** (a).

**Decision.** (a), owner, 2026-09-25.
**Actions.** Principle 11, R36 and data-model rule 10 state the discrete/drift rule;
data-model §7 drops archiving as a lever; `CONTEXT.md` Milestone reworded ("surfaced", not
"never dropped"); M2-S6 emits `hero.morale-changed` on band crossings (`moraleBands` config)
and the event moves from M6 to M2; M3-S2 cites rule 10.

### A8 · Node 22 in the ADR, Node 26 in the accepted input — `done` · (a), owner, 2026-09-25 · ADR-0007 note, N8, approach §5, INPUTS 1.1, M0-S3 matrix and M0 risk row updated

**Issue.** ADR-0007, N8 and approach §5 say Node 22. INPUTS 1.1, accepted, pins `.node-version`
26.9.0 and runs CI on 26.

**Options.**
- (a) Amend ADR-0007 (dated note) to "Node 22 or later, developed on the current release";
  `engines: ">=22"`; CI runs a matrix of 22 and 26 so the floor is proved, not assumed.
- (b) Pin 22 everywhere. The owner's machine runs 26; every session starts with a version
  switch.
- (c) Leave the ADR at 22 and run only 26. The floor in `engines` is then untested.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### A9 · Unattached Heroes are never removed — `done` · (a), owner, 2026-09-25 · data-model rule 8 reworded with the passive-entry exception; M2-S8 text and acceptance aligned, plus a bounded-pool test

**Issue.** data-model rule 8 removes a Hero who leaves the pool unrecruited "unless they
appear in any History entry". M1-S5 emits `hero.generated` for every Hero and M2-S8 emits
`hero.left-pool`, so every Hero appears in an entry and the table grows by roughly a hundred
rows a year, forever.

**Options.**
- (a) Reword rule 8: removed unless a History entry *other than* their own `hero.generated`
  and `hero.left-pool` names them. Those two entries stay in the History with labels, so they
  narrate without the row.
- (b) Stop emitting `hero.generated` for pool Heroes. Generation then leaves no trace.
- (c) Keep every Hero forever. ≈ 2,000 rows and ≈ 2 MB over 20 years for people nobody met.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

## B. First-build requirements no epic delivers

### B1 · Outings (R4) — `done` · (a), owner, 2026-09-25 · R4 amended; M2 §0 deferral reworded

**Issue.** R4: one Outing per Turn (Market, scouting, a Patron visit). No epic builds the
limit. Scouting (R29) and Patron visits (§2) are deferred, leaving the Market as the only
Outing, and a limit of one kind per Turn limits nothing.

**Options.**
- (a) Amend R4: the Outing limit arrives with the second kind of Outing (scouting or Patron
  visits, both deferred). The Market has no per-Turn limit in the first build.
- (b) Build the limit in M5: `outingTakenOnTurn` on the Guild; a Market visit consumes it.
  Teaches nothing until a second Outing exists.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### B2 · Guildmaster Traits (R8) — `done` · (a), owner, 2026-09-25 · M1-S6 generates 0–2 (`guildmasterTraitsMin/Max`), M1-S4 traits row and config lists updated; M4 §0 and M4-S5 add the closed effect union and a test; INPUTS 3.13 added

**Issue.** R8: the Guildmaster has Traits that buff or penalise the Guild or a Class. M1-S6
generates none; nothing adds them.

**Options.**
- (a) M1-S6 generates 0–2 Traits with `owner: "guildmaster"` from `traits.json` (effects
  `null`); M4-S5 gives them effects through a closed union — `classStatBonus { classKey,
  statKey, delta }`, `guildMoraleShift { delta }`, `upkeepFactor { factor }` — applied in the
  selectors that already exist.
- (b) Amend R8: Guildmaster Traits are deferred to the module that first needs them.

**Recommendation.** (a); it is small and gives the Guildmaster a face.

**Decision.** —
**Actions.** —

### B3 · Guildmaster Regard (R9) — `done` · (b), owner, 2026-09-25, against the recommendation · M4-S5 writes Regard for Patrons and Heroes (four config fields), M6-S2 for Rival Guildmasters (`guildmasterRegardPerTransferDeal`); Regard for a Guild is a selector; `guildmaster.regard-changed` on band crossings; `show guildmaster`; harness reports the band distribution since no rule reads it. R9 unchanged

**Issue.** R9: the Guildmaster holds Regard for Heroes, Guilds, Guildmasters and Patrons. The
map exists from M1; nothing writes or reads it in any epic.

**Options.**
- (a) Amend R9: the map exists in the first build; the rules that write and read it arrive
  with Contacts and Campaigns. A field with no writer, stated honestly.
- (b) Invent writers now (rises with Quests taken from a Patron, falls with Transfers out).
  Nothing in the first build reads them, so nothing checks they are sensible.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### B4 · Fame gating recruit calibre (R10) — `done` · (a), owner, 2026-09-25 · R10 reworded (Fame gates who will sign; "Applicant" removed); M3-S5 adds `signing-refused` with `fameRequiredPerLevel × (level − 1)`, config, counter and tests; INPUTS 5.6 added

**Issue.** R10: Fame "gates Campaigns and Applicant calibre". The pool is shared by every
Guild (R27), so Fame cannot gate the calibre of who *exists* per Guild. "Applicant" is a v1
term (F2).

**Options.**
- (a) Fame gates who will *sign*: an Unattached Hero refuses a Guild whose Fame is below
  `fameRequiredPerLevel × level`; `signing-refused` rejection; in M3-S5 with Rankings. Fame
  gets a use from M3.
- (b) Amend R10: drop "Applicant calibre"; Fame gates Campaigns only until a module needs it.
- (c) Pool calibre scales with the highest Fame in the world. Meaningless to the player.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### B5 · Patron State Engine and the "Patron draws" phase — `done` · (a), owner, 2026-09-25 · approach §2 morning phase renamed; M4-S5 adds nightly recovery (`patronRegardRecoveryPerYear`), config and a test

**Issue.** approach §1 lists a Patron State Engine ("Patron Regard recovering"); approach §2
has a morning "Patron draws" phase. Neither is in an epic by name.

**Options.**
- (a) M4-S5 gains nightly Patron Regard recovery toward neutral (`patronRegardRecoveryPerYear`);
  approach §2's "Patron draws" is renamed to what M2-S3 builds: "Board refresh, drawing from
  Patrons". Approach §1's engine list is kept; the Patron State Engine is that one rule.
- (b) Delete both from approach. Patron grudges then last forever.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### B6 · The Guildmaster's effect on recruitment (R8; plan M4 increment 5) — `done` · (a), owner, 2026-09-25 · Negotiation scales signing and Transfer fees inside the fee selectors (M4-S5 table; M6-S2 signature)

**Issue.** R8 says Guildmaster Stats resolve recruitment; `plan.md` M4-5 lists it; M4-S5's
table has Negotiation on reward only.

**Options.**
- (a) M4-S5: Negotiation also scales signing fees and Transfer fees by `(1 ∓ negotiationRange)`.
- (b) Amend R8 to drop recruitment.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### B7 · Fast forward stopping when a recruit arrives (approach §2) — `done` · (a), owner, 2026-09-25 · approach §2 distinguishes always-on and opt-in stops ("Applicant" removed); M2-S11 adds `pool-refreshed`

**Issue.** approach §2: fast forward stops when "an Applicant or Transfer offer arrives".
The pool refreshes most nights, so a stop on every new pool Hero makes fast forward useless.
M2-S11 has no such stop.

**Options.**
- (a) Opt-in stop condition `pool-refreshed` in M2-S11's `until` list; approach §2 reworded:
  Transfer offers always stop, pool arrivals stop only when asked.
- (b) Drop the stop; the pool is browsed, never announced.
- (c) Stop only when a pool Hero is above the Roster's mean Level. An arbitrary threshold.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

## C. Fields the epics need that `data-model.md` does not have

### C1 · Missing fields and tables — `done` · (a), owner, 2026-09-25 · data-model §3.1 `ended`; §3.2 `belowFloorSince`, `foldedOnTurn`, Quest `demands`/`skillKeys`/`encounterKeys` copied from the template, `offers` table; validator row; type sketch; M6-S2 uses `world.offers` and emits `guild.transfer-offer-expired`

**Issue.** Epics rely on: `guild.belowFloorSince` (M2-S7), a folded Guild's state (M2-S10,
D6), `world.ended` (M2-S10), Stat demands on the Quest row (M2-S5 reads them there; only the
template has them), `quest.encounterKeys` (M4-S1), pending Transfer offers (M6-S2), the Turn a
Hero entered the pool (M2-S8).

**Options.**
- (a) Add to data-model §3.2: `guild.belowFloorSince: turn | null`, `guild.foldedOnTurn: turn
  | null`; `world.ended: { turn, reason } | null`; `quest.demands: [StatKey, weight][]` and
  `quest.skillKeys` copied from the template at generation so a Quest row is self-contained
  and templates may change under a live save; `quest.encounterKeys: string[]` (M4);
  a new table `offers: Record<OfferId, { kind: "transfer", fromGuildId, toGuildId, heroId,
  fee, expiresOnTurn }>`. No pool-entry field: a pool Hero is generated on entering the pool,
  so `enteredTurn` already is it.
- (b) Leave the data model as is and let M1 discover the fields. The document is then wrong
  from the first commit.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### C2 · `requirements.partySize` is a value in the data model, a range in the templates — `done` · (a), owner, 2026-09-25 · data-model `partySizeMin/Max`; M2-S4 `party-size` rejection names the bounds

**Options.** (a) `partySizeMin`/`partySizeMax` on both the template and the Quest row.
(b) One value; templates lose the range.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### C3 · Id padding is inconsistent, and string order breaks past the padding — `done` · (a), owner, 2026-09-25 · data-model §3.1 six digits every table, validator row; M1-S1 example

**Issue.** data-model examples: `hero-0042`, `guild-0002`, `quest-01337`. Selectors and the
morning controller order sort by id string; `hero-10000` sorts before `hero-9999`.

**Options.** (a) Six digits for every table (`hero-000042`); the validator refuses a counter
past 999,999 (a 20-year game reaches ~50,000 Quests). (b) No padding; every sort parses the
number. (c) Keep the examples and never sort by id — but two epics already do.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### C4 · Quest timing: Turns versus Days, and when a Party is back — `done` · (a), owner, 2026-09-25 · data-model `durationTurns` and `returnsOnTurn` notes; M2-S4 formula `nightOf(dayOf(turn) + durationDays)` and a test

**Issue.** The Quest row stores `durationTurns`; templates author Days; M2-S4 computes
`returnsOnTurn = turn + days × 3`; M2-S5 resolves at night. A Party dispatched in the morning
would be "back" in a morning and resolve that night, idle in between.

**Options.** (a) Templates author `durationDaysMin/Max`; generation stores `durationTurns =
days × 3`; `returnsOnTurn` is always the night Turn of `dayOf(departedOnTurn) + days`; the
Party resolves that night and its Heroes are available the next morning. (b) Resolve in
whichever phase the Party returns. Three resolution points instead of one.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

## D. Ambiguities that need a decision

### D1 · `advance` has three signatures — `done` · (d) hybrid, owner, 2026-09-25: one `deps = { config, content, modules }` object; rules read `deps.config`; front ends pass `meta.config`; a `rebase` action adopts current defaults and records `world.rules-adopted`; harness passes config explicitly · approach §3, data-model §1/§2, N1, M1-S1 (`configVersion`, `EngineDeps`), M1-S8, M2-S1 (`rebase`, test), M2 events, M7-S3 notice, epics README convention

**Issue.** approach §3: `advance(world, choices, config)`; data-model §1: `advance(document,
choices)` with config from `meta.config`; M2-S1: `advance(document, choices, content)`; M8
adds `modules`. data-model §2 also says the harness "passes configuration explicitly and
ignores this field", which no signature allows. Interacts with D3.

**Options.**
- (a) `advance(document, deps)` with `deps = { config, content, modules }`; `config` is what
  the game *plays under* and defaults to `defaultConfig`; `meta.config` is provenance (what the
  world was created under), never read by rules. The harness passes its config in `deps`; the
  CLI and web pass `defaultConfig` unless told `--keep-config`. Actions take the same `deps`.
- (b) `advance(document, deps)` with config read from `meta.config` always. Consistent, but
  see D3: tuning never reaches an existing game.
- (c) Keep three signatures and reconcile in M2. The documents disagree until then.

**Recommendation.** (a); D2 removes `choices` from the signature.

**Decision.** —
**Actions.** —

### D2 · When player actions happen — `done` · (a), owner, 2026-09-26 · actions are standalone calls in any Turn; `advance(document, deps)` only moves time; `Choice` union replaced by `Action`; Rival controllers act at the start of the afternoon · approach §2/§3, data-model §1, M2-S1/S2/S4/S9/S11 and §2, plus the leftovers listed below

**Issue.** approach §3 makes each action a standalone call. M2-S4 routes dispatch through
`advance` as a `Choice` applied in the morning phase — so the CLI's `dispatch` would advance a
Turn — while M5-S2's `equip` is standalone. Unstated whether the player may dispatch in the
afternoon.

**Options.**
- (a) Every action is a standalone call on the current document, any time of day; `advance`
  only moves time. The `Choice` union goes; an `Action` union remains for the harness policy
  and the web reducer. Rival controllers act at the start of the afternoon phase, on whatever
  the player left on the Board and in the pool during the morning. approach §2 reworded.
- (b) Every action is a `Choice` batched into the next `advance`, including buy and equip.
  Consistent, but no action can be taken without moving time.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### D3 · Old saves under later rules — `done` · (a), owner, 2026-09-26 · fill-forward on load (`{ ...defaultConfig, ...meta.config }`, data-model §2 and rule 5); `patron.questTemplateKeys` dropped, templates looked up by Sphere (data-model §3.2, M1-S6, M2-S3); CLI (M1-S9) and web reducer (M7-S2) build deps the same way; (iv) settled by D1(d); schema migrations unchanged

**Issue.** (i) A save from M2 has no M3 config fields and M4 removes the stub's; (ii) M2-S3's
content bump leaves old Patrons with no templates; (iii) migrations cover the schema version
only; (iv) a frozen `meta.config` means tuning never reaches an existing game, which is the
opposite of what ADR-0004's reasoning wants during months of tuning.

**Options.**
- (a) With D1(a): rules read config from `deps`, so tuning reaches every game; `meta.config`
  is provenance. Missing config fields never arise. Content references are re-validated on
  load (warn, rule 5). `patron.questTemplateKeys` is dropped: templates are looked up by
  Sphere at draw time (rule 1, store base values only), so a content bump needs no migration.
  Schema migrations stay as designed.
- (b) Keep `meta.config` authoritative and add a config migration chain beside the schema one.
  More machinery, and tuning still never reaches a live game.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### D4 · Leadership and Perception are both Hero and Guildmaster Stats — `done` · owner's own option, 2026-09-26: the Guildmaster's Stats are renamed Inspiration (was Leadership) and Judgement (was Perception), so no key is shared and `stats.json` keeps a single `owner` · `CONTEXT.md` Stat entry, R8, M4 §0/S5 table/§2 config (`inspirationMoraleShift`, `judgementHintSharpening`)

**Options.** (a) One Stat definition each in `stats.json` with `owners: ["hero",
"guildmaster"]`; the key is shared; Hero and Guildmaster rules read the same key on different
rows. (b) Distinct keys (`leadership` / `gm-leadership`). Two names for one word.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### D5 · Who pays the Morale cost of a Transfer (R28) — `done` · (a), owner, 2026-09-26 · R28 and `CONTEXT.md` Transfer reworded to the pairwise reading M6-S2 builds

**Options.** (a) Each Hero whose own Regard for the transferred Hero is `warm` or above
(M6-S2 as written). (b) The whole Roster, when the Roster's mean Regard is high.

**Recommendation.** (a); reword R28 and `CONTEXT.md`'s Transfer entry to match.

**Decision.** —
**Actions.** —

### D6 · What happens when a Rival goes bankrupt — `done` · (a), owner, 2026-09-26 · `CONTEXT.md` Bankruptcy reworded; M2-S10 folds, releases Heroes (`hero.left-guild`), drops from Rankings, replaces after `rivalReplacementDays`, with a test; M5-S4 lists a folded Guild's unique Items on the Market

**Issue.** M2-S10 says a Rival "folds" and its rows stay; nothing says what happens to its
Heroes and Items, whether Rankings still list it, or whether it is replaced. `CONTEXT.md`'s
Bankruptcy entry says it "ends the game".

**Options.**
- (a) The Guild folds: `foldedOnTurn` set; its Heroes join the Unattached pool
  (`hero.left-guild`); its Items go to the Market at sell price; it leaves the Rankings; after
  `rivalReplacementDays` a new Rival is generated (`guild.founded`) so the count holds. For a
  player-controlled Guild, the game ends instead. `CONTEXT.md` Bankruptcy reworded.
- (b) As (a) without replacement; the world thins over decades.
- (c) Rivals cannot go bankrupt. Breaks ADR-0002.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### D7 · Random streams drift as milestones add draws — `done` · (a), owner, 2026-09-26 · ADR-0009 amended (nine streams by drawing subsystem, `events` dropped, "never share an old stream"); data-model §3.1; M1-S2 tuple; M2-S8 `pool`; M3-S1 `progression`; M4-S1 `encounters`

**Issue.** ADR-0009 gives one stream per subsystem so a later milestone never shifts an earlier
seed. But `heroes` serves pool refresh (M2), the Hero State Engine (M2) and level-ups (M3), so
M3 changes every seed's pool; M4-S1 draws encounters from `board`; the Random Events *module*
draws from the *core* `events` stream while the ADR says a module registers its own.

**Options.**
- (a) Streams by the subsystem that actually draws: `generation`, `board`, `quests`,
  `encounters`, `pool`, `heroes` (state engine), `progression`, `rivals`, `market`. `events`
  leaves the core list; modules register their own. ADR-0009 amended with a dated note; a stream
  is added in the milestone that introduces its subsystem.
- (b) Keep the seven and accept the drift inside them. ADR-0009's reason is then only half
  honoured.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### D8 · Hall grades cannot be raised before M5 — `done` · (a), owner, 2026-09-26 · Improvements are M3-S6 (`build`, `improvements.json`, `quartersMoraleBonus`, policy build rule); M5-S6 is a pointer; M3/M5 headers, gates, config, events, counters; `plan.md` lists and table; epics README rows (M3 6–7, M5 6–8); INPUTS 7.3 annotated

**Issue.** M2-S6 (infirmary) and M3-S2 (training yard) read Hall grades; `build` arrives in
M5-S6, so neither can be exercised or measured for two milestones.

**Options.** (a) Move M5-S6 (Improvements, `build`, `improvements.json`) into M3 as M3-S6.
Small, and gives Wealth its first sink where growth is being tuned. (b) `startingHallGrade`
config so every Guild begins at grade 1. (c) Accept grade 0 until M5.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### D9 · Judgement (Perception before D4) sharpening Potential hints — `done` · (a), owner, 2026-09-26 · no change: the deferred item is a Trait effect, Judgement's Stat rule stands (R8). When the Trait arrives, a stacking rule is a DL

**Issue.** §2 defers "Guildmaster Traits that sharpen Potential hints". M4-S5 has the
Judgement *Stat* (Perception before D4) sharpen hints. On reading again these are different things: the deferred item
is Traits; a Stat rule is R8's "Guildmaster Stats resolve Guild-side actions".

**Options.** (a) No change: keep Perception's rule, Traits stay deferred; note it here.
(b) Drop Perception's rule, leaving Perception with no effect in the first build.

**Recommendation.** (a).

**Decision.** —
**Actions.** —

### D10 · Three small ones — `done` · all (a), owner, 2026-09-26 · M1-S10 and data-model §2: harness passes a fixed `createdAt`; N2 and principle 12: "no player accounts", hosting at zero cost allowed; M2-S7: `config.fameFloor`

- **D10.1** Byte-equal harness runs need a fixed `meta.createdAt`. (a) The harness passes a
  fixed value (`"harness"`); the CLI passes the clock. (b) Exclude `meta` from the comparison.
  Recommend (a).
- **D10.2** N2 and principle 12 say "no accounts"; M7 needs a Cloudflare account. (a) Reword
  both: "no *player* accounts; a hosting account at zero running cost is allowed" (v1 DL-30
  reached the same reading). Recommend (a).
- **D10.3** M2-S7 invents a Fame floor of 0. (a) Keep as `config.fameFloor: 0`. (b) Fame may
  go negative. Recommend (a).

**Decision.** —
**Actions.** —

## E. Inconsistencies inside the planning documents (mechanical)

| # | Issue | Fix | Status |
| --- | --- | --- | --- |
| E1 | DL-11 assigned twice (M0-S3 and M1-S2) | Renumber: M0-S3's CI proof is DL-11, M1-S2's PRNG is DL-12, M1-S10's measure is DL-13; later references shift | `done` 2026-09-26 |
| E2 | INPUTS §9 lists 3 environment variables; the epics use 5 | Add `HEROESIM_SEEDS`, `HEROESIM_VALIDATE`, `HEROESIM_MODULES` to INPUTS §9 | `done` 2026-09-26 |
| E3 | Branch policy told two ways (INPUTS 1.2 vs M0-S0) and the release merge is missing from plan.md §1 and epics README §3 | INPUTS 1.2 follows M0-S0 (`v1.0-release` from `planv2`, `v1.0-dev` from it); plan.md §1 and README §3 add "merge `v1.0-dev` into `v1.0-release`, then tag there" | `done` 2026-09-26 |
| E4 | INPUTS 1.3 says "see 7.3"; the Playwright row is 7.10 | Fix the reference | `done` 2026-09-26 |
| E5 | plan.md M2-3 weights the Board by Patron Regard; M2-S3 defers that to M4 | plan.md follows the epic: weighting arrives in M4 | `done` 2026-09-26 |
| E6 | M2-S4 already rejects unmet requirements; M4-S5 "introduces" it | M4-S5 reworded: adds the reason to the rejection and the Skill/Class checks the M2 data lacked | `done` 2026-09-26 |
| E7 | M1's stories sum to 12–14 sessions against 10–13; totals off | M1 → 12–14; README total → 60–78 (after A5 and D8) | `done` 2026-09-26 |
| E8 | M7-S4 loads "a 20-year save from `harness/reports/`", which holds Markdown | `npm run harness:sample` writes `harness/samples/twenty-years.json` (gitignored) on demand | `done` 2026-09-26 |
| E9 | plan.md §1 says every increment ends with a harness run and a CLI; M0 and M1-S1–S8 cannot | Reword: "from M1-S9 onward"; M0 and the first M1 stories end with tests | `done` 2026-09-26 |

## F. Out-of-date text in the design documents

| # | Issue | Fix | Status |
| --- | --- | --- | --- |
| F1 | principles.md principle 6: "the first sixteen Stats" | "twenty" | `done` 2026-09-26 |
| F2 | "Applicant" in R10 and approach §2 is a v1 term; `CONTEXT.md` says Unattached Hero | Replace; R10's clause is reworded by B4's decision | `done` 2026-09-26 — R10 by B4, approach §2 by B7; no other mention remains |
| F3 | Domain terms not in `CONTEXT.md`: Sphere, Disposition, Encounter, Check, Market Engine; the epics add Regard band and Transfer Offer | Add glossary entries (principle 13: glossary first) | `done` 2026-09-26 — seven entries added |
| F4 | requirements §5 still lists the stub's assessment as open; DL-06 settled it | Remove the item; note the resolution | `done` 2026-09-26 |
