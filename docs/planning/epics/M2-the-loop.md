# M2 — The loop

**Objective:** a whole game that plays from creation to an ending, under a policy and under a hand
**Sessions:** 12–16 · **Depends on:** M1 · **Implements:** `plan.md` M2; approach §2 and §3; R2–R4, R11, R18, R20–R23, R25, R27, R34; ADR-0002, ADR-0003; requirements §5 open item on the stub (closed: weighted Stat demands, DL-06)
**Gate:** `npm run harness` plays 200 seeds × 20 years to an ending and reports the counters; from the CLI a human runs `advance`, `dispatch`, `recruit`, `advance --until party-returns` and reads what happened

**Status:** in progress — M2-S1 to M2-S10 done

## 0. What lands in M2

- `advance(document, deps)` and the Turn pipeline as a flat, ordered list of phase
  functions.
- Quest templates in content; the Quest Generator; the Board; dispatch; the stub Quest Engine.
- The Hero State Engine and Guild State Engine for the night phase.
- Recruitment from the Unattached pool and the pool's refresh.
- One Rival disposition, `steady`, acting each morning after the player.
- Endings and fast forward with typed stop reasons.
- The harness's automatic policy and the M2 counters and measures.

**Deliberately deferred:** XP applying to Levels (XP accrues, Level stays 1 until M3);
encounters (M4); Items and consumables at dispatch (M5); Transfers (M6); Random Events (a
module after the first build);
the Outing limit (R4 as amended: it arrives with the second kind of Outing, a module).

**Inputs:** 4.1–4.14. None blocking. Each is a `defaultConfig` value the harness measures.

## 1. Stories

### M2-S1 · `advance` one Turn · 1 session

`engine/src/advance.ts`: `advance(document, deps: EngineDeps): AdvanceResult`
where `AdvanceResult = { document, events, stoppedBecause: StopReason | null }` and rules read
`deps.config` (data-model §2). `engine/src/actions/rebase.ts`: `rebase(document, deps)`
rewrites `meta.config` to `deps.config` and emits `world.rules-adopted` (Milestone, payload the
old and new `configVersion`); rejected with `already-current` when the versions match. The CLI
passes `meta.config` by default and gains `rebase`; the harness passes its own config and never
rebases. Clones `world` with
`structuredClone`, shares `meta` and `history`, increments `turn`, runs the pipeline (S2) on the
clone, appends every event to `history`, returns. `advance` takes no player input: every player action is a
standalone call in any Turn (approach §3, pre-M0 review D2), and `advance` only moves time.
An `Action` discriminated union, which S4, S8 and later stories extend, enumerates the actions
for the harness policy, the Rival controller and the web reducer.
`engine/src/time.ts`: `dayOf(turn)`, `timeOfDay(turn)`, `yearOf(turn, config)`, `ageOf(hero,
turn, config)` as selectors.

**Acceptance:**

- [x] `advance` returns a new document whose `world` is not the input's (`!==`) while `meta`
      and `history` are (`===`)
- [x] The input document's `world` is deep-equal to what it was before the call
- [x] After three advances `dayOf(turn)` is 1 and `timeOfDay` is morning
- [x] CLI `advance [--turns n]` works and `show` reflects the Turn
- [x] A save created under `configVersion` 1 and loaded with defaults at version 2 still plays
      under version 1 until `rebase`, which rewrites `meta.config` and appends exactly one
      `world.rules-adopted`; a second `rebase` is rejected `already-current`

### M2-S2 · The pipeline · 1 session

`engine/src/pipeline.ts`: `const phases: Phase[]` where `Phase = { name, timeOfDay, run:
(world, ctx) => Event[] }` in the order of approach §2, and `runTurn(world, ctx)` filtering by
the Turn's time of day. Flat: no registration, no module hook (M8 adds them). `ctx` carries
`config`, `content`, `turn` and an `emit` that stamps `turn`, participants' labels and the
Guild of any Hero involved (data-model §4).

**Acceptance:**

- [x] The phase list's names and times of day match approach §2 exactly; a test compares them
      to a literal
- [x] A phase runs only on its time of day (spy counts over nine Turns)
- [x] `emit` adds a Hero's `guildId` to `participants` when only the `heroId` was given

### M2-S3 · Quest templates, Quest Generator, Board · 2 sessions

`content/quest-templates.json`: `{ key, name, sphereKeys, tags, difficultyMin/Max,
durationDaysMin/Max, rewardPerDifficulty, fameEffect, partySizeMin/Max, demands:
[StatKey, weight][], skillKeys: SkillKey[], requires: { classKey?, skillKey? }, lootTableKey:
null }`. `skillKeys` names the Skills that help on this kind of work (R15). Twelve to start,
two per Sphere. `meta.content` moves to version 2; templates are looked up by the Patron's Sphere at draw
time, so no Patron row changes and an M1 save draws from the new templates unchanged (D3). `engine/src/generators/quests.ts`: `generateQuest(world,
patron, content, config)` from the `board` stream. Morning phase `boardRefresh`: expire Quests
past `expiresOnTurn` (`quest.expired`), then draw until the Board holds `config.boardSize`,
choosing Patrons weighted by their Regard for … no Guild in particular (R22 weights by Regard
for *the* Guild; with several Guilds drawing, M2 weights Patrons uniformly and records the
simplification as a DL, revisited in M4 when Regard has rules).

Config: `boardSize`, `questOfferDays`, `questDifficultyMin/Max`.

**Acceptance:**

- [x] Each morning the Board is refilled to `boardSize` and never above
- [x] An offered Quest expires `questOfferDays` later with a `quest.expired` event and leaves
      `world.quests`
- [x] Every Quest's `demands` weights sum to 1 (content validation)
- [x] Only the `board` stream advances during refresh
- [x] CLI `show board`

### M2-S4 · Dispatch · 1–2 sessions

`engine/src/actions/dispatch.ts`: `dispatch(document, { guildId, questId, heroIds }, content)
-> ActionResult`. Rejections, typed: `quest-not-offered`, `hero-not-on-roster`,
`hero-unavailable` (injured, dead, in a Party), `party-size` (naming `partySizeMin` and
`partySizeMax`; any size within is accepted), `requirement-unmet`. On success:
a `parties` row, `quest.status = "taken"`, `quest.partyIds`, `hero.partyId`, `returnsOnTurn =
nightOf(dayOf(turn) + durationDays)` — always a night Turn, whatever Turn the Party left in
(data-model §3.2, pre-M0 review C4) — event `quest.taken`. `dispatch` is a standalone call in any
Turn (D2): the CLI calls it and saves; the harness policy calls it between advances; a Party
sent at night still returns on a night Turn (C4). The CLI prints a reminder that Rivals act in
the afternoon, so a Quest left on the Board in the morning may be gone by then.
Afternoon phase `questsAdvance` is a no-op that emits nothing in M2 (M4 gives it encounters);
the Party is simply away until `returnsOnTurn`.

**Acceptance:**

- [x] Every rejection has a test and none throws
- [x] A dispatched Hero cannot be dispatched again until the Party returns
- [x] The validator still accepts the document after dispatch (`quest.partyIds` ↔
      `party.questId`)
- [x] CLI `dispatch --quest <id> --heroes <id,id>` prints the Party and the return Day
- [x] A Party dispatched in any of the three Turns of Day d on a k-Day Quest has
      `returnsOnTurn` equal to the night Turn of Day d + k, and its Heroes are dispatchable
      again on the morning of Day d + k + 1
      _(M2-S4 proves the `returnsOnTurn` half for all three Turns of a Day; M2-S5's
      `questsConclude` closes the morning-after half, DL-25 item 16, DL-29 item 15.)_

### M2-S5 · Stub Quest Engine · 1–2 sessions

`engine/src/quest-engine/stub.ts`: `resolveQuest(world, quest, party, content, config, rng)
-> QuestOutcome` where `score = Σ demands[stat] × Σ heroes[stat] + stubSkillBonusPerRating ×
Σ ratings of quest.skillKeys held by Party members` (R15: the rating as a flat modifier),
`ratio = score / quest.difficulty`, band from `config.stubBands` (INPUTS 4.3), one roll from
the `quests` stream of ±`config.stubVariance`. Outcome: `{ band, wealthDelta, fameDelta, xpPerHero,
injuries: [{ heroId, typeKey }], deaths: HeroId[] }` per INPUTS 4.4. Night phase
`questsConclude`: for each Party with `returnsOnTurn <= turn`, resolve, apply (Wealth, Fame,
XP, Injury with `healsOnTurn`, Death with `diedOnTurn` and removal from the Roster), remove the
Party and the Quest, emit `quest.resolved` (payload the outcome), `hero.injured`, `hero.died`
(Milestone), `hero.xp-gained`. Injury types live in `content/injuries.json` with
`healDaysMin/Max` and `leavesTrait: TraitKey | null`.

Config: `stubBands`, `stubVariance`, `stubSkillBonusPerRating`, `stubInjuryChance`,
`stubDeathChance` per band.

**Acceptance:**

- [x] A Party whose Stats exceed the demands by 2× strongly succeeds with variance 0
- [x] Two Parties with identical Stats differ in score by exactly `stubSkillBonusPerRating ×`
      the difference in their summed ratings of the Quest's `skillKeys`
- [x] Wealth, Fame and XP move by the outcome; a dead Hero leaves the Roster, keeps their row,
      and appears in `history.byEntity`
- [x] All randomness in resolution draws from `quests`
- [x] A resolved Quest is gone from `world.quests` and present in `history.byType["quest.resolved"]`

### M2-S6 · Hero State Engine · 1 session

Night phase `heroState`: healing (`injury.healsOnTurn <= turn` clears it, applies
`leavesTrait`, emits `hero.healed`); Morale drift toward `moraleBaseline` by `moraleDrift`,
emitting no entry per night (data-model rule 10) and `hero.morale-changed` when the value
crosses one of `moraleBands` (`wretched`, `low`, `steady`, `high`, `elated`); the discrete
Morale changes (`moraleOnRosterDeath`, `moraleOnStrongSuccess`) emit `hero.morale-changed`
always. Ageing is derived, but the yearly Retirement check runs on the Hero's entry
anniversary (INPUTS 4.11) emitting `hero.retired` (Milestone) and removing them from the
Roster with `retiredOnTurn`. Infirmary grade reads `config.infirmaryHealFactor[grade]` at
injury time.

Config: `moraleDrift`, `moraleBands`, `moraleOnRosterDeath`, `moraleOnStrongSuccess`,
`heroRetirementAge`, `heroRetirementChancePerYear`, `heroRetirementInjuredMultiplier`,
`infirmaryHealFactor`.

**Acceptance:**

- [x] An Injury heals on its Turn, not before; a type with `leavesTrait` adds the Trait once
- [x] Morale converges on the baseline over nights without overshooting
- [x] A year of drift with no band crossing appends nothing; a crossing appends exactly one
      `hero.morale-changed`
- [x] Retirement never fires below `heroRetirementAge`; over 10,000 Hero-years past it the rate
      is within 20% of the configured chance
- [x] Only the `heroes` stream advances

### M2-S7 · Guild State Engine · 1 session

Night phase `guildState`: on every `upkeepEveryDays`th Day, `upkeep(guild)` selector (wages
by Level plus Hall maintenance, INPUTS 4.6) is deducted from every Guild (ADR-0002), emitting
`guild.upkeep-paid`; a Guild below `bankruptcyFloor` gets `belowFloorSince` set, cleared when
it recovers; Fame is applied by Quest outcomes already, so this phase only clamps it at `config.fameFloor`
(D10.3).

Config: `upkeepEveryDays`, `wagePerLevel`, `hallMaintenancePerGrade`, `bankruptcyFloor`,
`bankruptcyGraceDays`, `fameFloor`.

**Acceptance:**

- [x] Upkeep is deducted from Rivals and the player alike on the same Day
- [x] `upkeep()` is a selector: no `upkeep` field exists on the Guild row
- [x] A Guild that recovers above the floor loses `belowFloorSince`

### M2-S8 · Recruitment and the pool · 1 session

`engine/src/actions/recruit.ts`: `recruit(document, { guildId, heroId }, content)`;
rejections `hero-not-unattached`, `insufficient-wealth`; fee from `signingFee(hero, config)`
selector (INPUTS 4.7); sets `guildId`, appends to `rosterIds`, emits `hero.recruited`
(Milestone). Night phase `poolRefresh`: Unattached Heroes past `unattachedStayDays` leave
(`hero.left-pool`; row removed unless a History entry other than their own `hero.generated`
and `hero.left-pool` names them, rule 8), then the pool is refilled to `unattachedPoolSize`
from the `pool` stream (D7: the Heroes Generator takes the stream to draw from; `generation`
at creation, `pool` here).

Config: `signingFeeBase`, `signingFeePerLevel`, `signingFeeStatDivisor`, `unattachedStayDays`.

**Acceptance:**

- [x] Recruiting deducts exactly `signingFee` and moves the Hero; the validator accepts
- [x] A Hero who leaves the pool with only `hero.generated` and `hero.left-pool` entries is
      gone from `world.heroes`, and both entries still read with their labels; one named by any
      other entry stays (test with a synthetic non-passive entry, since release arrives in M6)
- [x] The pool table is bounded: after 20 simulated years of refresh with no recruitment,
      `world.heroes` holds no more Unattached rows than `unattachedPoolSize`
- [x] CLI `recruit --hero <id>`

### M2-S9 · The `steady` disposition · 1 session

`engine/src/controllers/rival.ts`: `rivalChoices(world, guild, deps): Action[]`
producing the same `Action` values a player's front end produces, applied at the start of the
afternoon phase `rivalControllers`, in Guild id order, on whatever the player left on the Board
and in the pool during the morning (D2). `steady` (INPUTS 4.12): take the
easiest Quest it can staff with its available Heroes; recruit the cheapest Unattached Hero when
`wealth > 3 × upkeep`. Dispositions are content keys in `content/dispositions.json` with one
entry; the rule is code keyed by disposition (a disposition that needs a new kind of rule is an
engine change, approach §4).

**Acceptance:**

- [x] Rivals take Quests off the Board so the player sees fewer; the harness counts Quests
      taken per controller kind
- [x] A Rival's choices go through `dispatch` and `recruit`, not a side path (spy)
- [x] The `rivals` stream is the only one a disposition draws from (it draws none in `steady`;
      the test asserts no stream moved)

### M2-S10 · Endings · 1 session

Night phase `endings`, last: Guildmaster Retirement at `guildmasterRetirementAge`
(`game.ended` with `reason: "retirement"`); Bankruptcy when `belowFloorSince + grace` has
passed (`reason: "bankruptcy"`); Roster wiped when the Roster is empty and Wealth is below the
cheapest signing fee in the pool (`reason: "roster-wiped"`). Checked for every Guild. A Rival's
ending folds it (D6): `foldedOnTurn` is set, `guild.folded` (Milestone) is emitted, its Heroes
join the Unattached pool with `hero.left-guild`, its controller stops acting, it leaves the
Rankings, and from M5 its unique Items are listed on the Market. After `rivalReplacementDays`
a new Rival is generated (`guild.founded`) so the Rival count holds. The player's ending sets
`world.ended: { turn, reason }` instead (an accepted exception to ADR-0002, `plan.md` §1), and
`advance` on an ended world returns the document unchanged with `stoppedBecause: { kind:
"ended" }`.

Config: `guildmasterRetirementAge`, `rivalReplacementDays`.

**Acceptance:**

- [x] Each of the three endings has a test that arranges it and asserts the event and
      `world.ended`
- [x] `advance` after an ending is a no-op with the typed stop
- [x] A Rival that goes bankrupt folds without ending the game: its Heroes are Unattached the
      same night, it is absent from `rankings()`, its controller emits nothing afterwards, and a
      new Rival exists `rivalReplacementDays` later with a `guild.founded` entry

### M2-S11 · Fast forward · 1 session

`fastForward(document, { until: StopCondition[], maxTurns }, content)` calling `advance` in
a loop, stopping on the first `StopReason`: `party-returned`,
`ended`, `decision-needed` (the Board has a Quest the Guild could staff and the Roster is
idle — the M2 reading of "a decision is needed"; later milestones widen it), `max-turns`,
and the opt-in `pool-refreshed` (approach §2 as amended, pre-M0 review B7), which stops only
when the caller lists it in `until`.
`StopReason` is a typed union carried in `AdvanceResult.stoppedBecause`.

**Acceptance:**

- [x] `until: ["party-returned"]` stops on the exact Turn the Party's `returnsOnTurn` falls
- [x] `maxTurns` always terminates
- [x] CLI `advance --until party-returns|ended|decision|pool-refreshed --max <n>` prints the
      stop reason and the events since the last command; `pool-refreshed` never stops unless
      asked for
      _(DL-33: `fastForward` takes `deps` and the watched `guildId`; `until` adds the opt-in
      `pool-refreshed` and never narrows the always-on stops.)_

### M2-S12 · Automatic policy, counters and measures · 1–2 sessions

`harness/src/policy.ts`: `automaticPolicy(document, deps): Action[]` per INPUTS
4.14, used by the player's Guild in the harness only. `harness/src/play.harness.test.ts`:
for each seed, `createWorld`, apply the policy's actions then `advance`, in a loop until `ended` or
`years × turnsPerYear`, validating after every advance when `HEROESIM_VALIDATE` is set; report
counters from `history.byType` lengths and measures. `npm run harness:sample` plays one seed
for 20 years and writes `harness/samples/twenty-years.json` (gitignored) for M7-S4 and for
hand inspection (E8).

**Counters:** Quests taken by controller kind, `quest.resolved` by band, `hero.injured`,
`hero.died`, `hero.recruited`, `hero.retired`, `game.ended` by reason, years survived (mean,
min, max).
**Measures:** `advance` cost per Turn (mean, p99); `history.entries.length` and
`serialise(document).length` after 20 years; time to serialise and deserialise. Recorded in
the decision log against `data-model.md` §7's targets, with the seed count.

**Acceptance:**

- [ ] 200 seeds × 20 years complete; no validator failure with `HEROESIM_VALIDATE=1`
- [ ] The report is committed at `harness/reports/m2-<date>.md` and the measures are in a DL
      entry
- [ ] Byte equality holds for one seed played twice under the policy (the policy is
      deterministic: it draws no random numbers)

## 2. Configuration and events introduced

**Config:** listed per story above; all on `defaultConfig`, none literal in a rule.

**Events:** `quest.offered`, `quest.expired`, `quest.taken`, `quest.resolved`, `hero.injured`,
`hero.healed`, `hero.died` (Milestone), `hero.xp-gained`, `hero.morale-changed` (band
crossings and discrete changes only), `hero.retired` (Milestone), `hero.recruited`
(Milestone), `hero.left-pool`, `guild.upkeep-paid`, `guild.folded`, `game.ended` (Milestone),
`world.rules-adopted` (Milestone), `hero.left-guild`.

**Actions:** `dispatch`, `recruit`, `rebase`. **Stop reasons:** `party-returned`, `ended`,
`decision-needed`, `max-turns`, `pool-refreshed` (opt-in).

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| The stub makes every game end the same way (all Bankruptcies, or none) | That is what S12 measures; the dials in INPUTS 4.x are turned in a balance pass recorded as a DL, not in the stories |
| `structuredClone` per Turn is too slow at 5 ms | Measured in S12. If it shows, the levers are fewer rows in `world` (dead Heroes are already kept; they could move to `history`) before any structural sharing |
| The pipeline grows conditionals for "is this the player" | The `steady` story's spy test and ADR-0002; the reads of `controller.kind` are the three accepted exceptions in `plan.md` §1 (choices source and order, endings) and no other; a test greps for them |
