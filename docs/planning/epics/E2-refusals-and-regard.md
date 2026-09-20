# E2 — Refusals and Regard

**Objective:** Heroes can say no, and the price of making them go anyway is paid in Regard  
**Estimate:** 3–4 days · **Depends on:** E1 · **Implements:** [Design §People](../design.md#people) · **Realises:** ADR-0003, ADR-0005, ADR-0007  
**Gate:** A Career can be played to Retirement in which at least one Hero refuses work, is insisted upon, and departs

**Status:** Built and verified 2026-09-19. The gate is met by `engine/tests/gate.test.ts`, which plays seed `gate-3` to Retirement under a policy that insists and loses Hero `h2` on Day 97 at a Regard of −5, having refused and been insisted upon first (it was `h3` on Day 86 when E2 was built; E3's harm draws from the shared generator and moved the pin, not the arc — [DL-16](../00-decision-log.md#dl-16) §2). The rules as built are recorded in [DL-14](../00-decision-log.md#dl-14--the-e2-rules-as-built-backing-gains-its-regard-term-and-a-hero-at-the-bottom-of-the-scale-is-talked-round-before-they-are-lost), which amends this file in one place: the Departure Check is taken over a wider band than Departure itself, so a Hero below the refusing line can be talked round rather than only lost. See §1 E2-S3.

---

## 0. What lands in E2

- **Refusal:** a Hero declines a Commission because their Regard for the Guildmaster has soured, or because a Trait says *not this, not for them*
- **Proposal before commitment:** the player sees who would refuse, and why, before paying anything
- **Insistence:** commit anyway; it costs Regard and moves the Hero toward Departure
- **Decay:** Regard drifts down by 1 for every `regardDecayEveryDays` a Hero spends idle
- **Backing includes Regard:** the architecture's §5 formula gains its Regard term, as it always said it would
- **Departure:** a Hero at or below the threshold may walk out; they move to `formerHeroes` and stay readable

**Deliberately deferred:**

- Returning as an Applicant later (E4 — the `formerHeroId` hook is written here, the arrival is not)
- Regard between Heroes driving anything (the field exists from E1; E2 moves only Regard **for the Guildmaster**)
- `quarters` slowing decay (E3 — the multiplier is read here, the Hall improvement that sets it is bought there)
- A Rival approaching the same soured Hero (E5 — Departure and poaching are one mechanism seen from two sides)
- Romance, rivalry or any other `nature` beyond the three E1 already defines

---

## 1. Stories

### E2-S1 · Refusal rules and `proposeParty` · 1 day

A Hero refuses for exactly two reasons, and the engine can answer "who would refuse?" without changing anything.

- **Regard refusal:** `hero.regardForGuildmaster.value <= config.refusalRegardThreshold`
- **Trait refusal:** any of the Hero's Traits whose `TraitDef.refusal` matches this Commission — its `tags` intersect the Commission's tags, or `minDifficulty` is met, or neither is given (an unconditional refusal, for a Trait like *Worn*)

Refusal is a declarative property of content plus state. No Trait gets a branch in the engine.

**Acceptance:**

- [x] `TraitDef.refusal` parses from `content/traits.toml` and fails validation with a named field on a malformed entry (`engine/tests/refusal.test.ts`: "parses `refusal` from a TraitDef in all three of the shapes the rule allows", "refuses a malformed `refusal`, naming the field" — seven malformed shapes, each asserted against the field name in the message; `content/tests/parse.test.ts`: "ships at least three refusing Traits, each with a summary that reads as a reason (E2)" proves the real file parses)
- [x] `proposeParty` returns the Backing the Party would have and one `Refusal` per refusing Hero, and never mutates the Career (`engine/tests/refusal.test.ts`: "answers in the order the Heroes were named, one entry each"; "changes nothing at all, over a deep-frozen Career")
- [x] A Hero refusing for both reasons yields one `Refusal` with `reason: 'regard'` (Regard wins, so the narration blames the relationship, not the Trait) (`engine/tests/refusal.test.ts`: "blames the relationship, not the Trait, when a Hero would refuse on both counts" — and asserts the `trait` key is absent, not merely undefined)
- [x] A Party with no refusals yields an empty `refusals` array and the same Backing `commitParty` will compute (`engine/tests/refusal.test.ts`: "says nobody when the Roster is content, and agrees with the Backing commitParty computes")
- [x] `proposeParty` on an unknown Commission or Hero throws the same `EngineError` codes `commitParty` does (`engine/tests/refusal.test.ts`, the "asking is refused for the same reasons deciding is" block — every code driven through both functions from the same table)

### E2-S2 · Insistence and its cost · 0.5 day

`commitParty` refuses to insist by accident.

- Called with refusals outstanding and no `insist`, it throws `EngineError('HeroRefused')`
- Called with `{ insist: true }`, it commits and charges `config.insistenceRegardCost` Regard to **each** refusing Hero, with the reason recorded on the Regard
- Non-refusing members of the same Party are untouched

**Acceptance:**

- [x] `commitParty(..., { insist: true })` emits one `InsistenceApplied` and one `HeroRegardForGuildmasterChanged` per refusing Hero, in Hero order (`engine/tests/insistence.test.ts`: "charges each refusing Hero once, in Hero order, and leaves the willing untouched" — with a Party of three whose refusers are first and last)
- [x] `commitParty` without `insist` throws and leaves the Career byte-identical to its input (`engine/tests/insistence.test.ts`: "throws HeroRefused and leaves the Career byte-identical to its input" — compares `serialiseCareer` before and after, for both an absent `insist` and an explicit `insist: false`)
- [x] Insisting twice on the same Hero costs twice; Regard clamps at −5 and the clamp is asserted (`engine/tests/insistence.test.ts`: "costs twice when it happens twice, and stops at the Regard floor" — four commits, pinning the exact `(value, delta)` sequence `(−2,−2) (−4,−2) (−5,−1) (−5,0)`)
- [x] Backing is computed **after** the insistence penalty, so insisting visibly weakens the Party it creates (`engine/tests/insistence.test.ts`: "sends a weaker Party than the one proposeParty described" — proposal 1, committed 0, on a Career whose Guildmaster's Stats are asserted in the test above it)
- [x] `insist: true` with no refusals is legal and emits nothing extra (`engine/tests/insistence.test.ts`: "is legal with `insist: true` when nobody refuses, and emits nothing extra" — the two event streams and the two Careers are compared whole)

### E2-S3 · Departure · 1 day

Departure is a Guild-side Check, which is what gives the Guildmaster's Stats their second job.

At each Board refresh, every Hero with `regardForGuildmaster.value <= config.departureRegardThreshold` is checked: `d20 + gm.stats.Guile + gm traitModifiers` against `config.departureDc`. Success and they stay, and the Regard's reason records that you talked them round. Failure and they leave: the Hero moves to `guild.formerHeroes` with an `exit` recorded, any Party they are on is unaffected (they finish the Commission first — a Hero away on work departs on their return Day instead).

**As built, amended by DL-14.** The Check is taken over the wider band `value <= config.refusalRegardThreshold`, and passing it *gains* the Hero `config.talkedRoundRegardGain` (+3) rather than only recording a reason. Failing it still loses them only at or below `departureRegardThreshold`. Without the wider band the bottom three points of the scale were a one-way ride: a Hero who refuses every Commission cannot be sent anywhere, and being sent is the only way E2 gives anyone to earn Regard back. The reasoning and the new tunable are in [DL-14](../00-decision-log.md#dl-14--the-e2-rules-as-built-backing-gains-its-regard-term-and-a-hero-at-the-bottom-of-the-scale-is-talked-round-before-they-are-lost) §3.

**Acceptance:**

- [x] A Hero at or below the threshold is checked once per Board refresh, never twice on the same Day (`engine/tests/departure.test.ts`: "checks a Hero at the threshold once per Board refresh and never twice on a Day" — over ten refreshes, the Check Days are asserted equal to the `BoardRefreshed` Days; "leaves a Hero above the threshold alone entirely" is its other half)
- [x] A departing Hero appears in `formerHeroes` with `exit.kind === 'departure'` and is gone from `roster` (`engine/tests/departure.test.ts`: "leaves the Roster for formerHeroes, with an exit and everything else intact")
- [x] A Hero away on a Commission does not vanish mid-Commission; the check is deferred to their return Day (`engine/tests/departure.test.ts`: "does not vanish mid-Commission; the check is deferred to their return Day" — a Board refresh falls on Day 10 while they are out, and the `HeroDeparted` lands on Day 15 after the `PartyReturned`)
- [x] `HeroDeparted` carries the Regard value that caused it, so narration can say how far it had fallen (`engine/tests/departure.test.ts`: "leaves the Roster for formerHeroes…" asserts the whole event; `narrate/tests/regard.test.ts`: "says a Hero has left, how far their Regard had fallen, and what moved it last" proves narration uses it)
- [x] `ledger.departures` increments and the reckoning's `heroesLost` counts them (`engine/tests/departure.test.ts`: "counts in the ledger and in the reckoning at the end")
- [x] A Roster emptied by Departure does not crash `advance`; it is survivable and Upkeep falls to `upkeepBase` (`engine/tests/departure.test.ts`: "is survivable: advance does not crash and Upkeep falls to upkeepBase" — the whole Roster walks out on Day 10 and the Career still reaches Retirement with `heroesOnRoster: 0`)

### E2-S4 · Regard decay · 0.5 day

A Hero you never send out drifts away.

Decay is evaluated at each Board refresh: a Hero for whom `day - max(lastCommittedOn, regardDecayedOn) >= config.regardDecayEveryDays × hallQuartersFactor` loses `config.regardDecayAmount`, and `regardDecayedOn` is set to the current Day. `hallQuartersFactor` is 1 until E3 buys quarters.

**Acceptance:**

- [x] A Hero committed to a Commission has `lastCommittedOn` set at commit, not at return (`engine/tests/decay.test.ts`: "starts at the commit, not at the return, and leaves a Hero away untouched")
- [x] 30 idle Days costs exactly 1 Regard, 60 costs 2, and a test walks 200 Days asserting the exact sequence (`engine/tests/decay.test.ts`: "costs exactly one Regard at thirty idle Days, two at sixty, and not a point before" proves the literal cadence at a one-Day Board refresh; "walks two hundred Days at the ten-Day cadence and drifts on exactly these Days" pins `(40,−1) (70,−1) (100,−1) (130,−1) (160,−1) (190,−1)`. Note what the second one shows: because drift is *evaluated at the Board refresh*, at the shipped ten-Day cadence the first point is lost on Day 40 rather than Day 31 — the rule is "at the first refresh at or after the thirtieth idle Day", and the Days above are what a player actually sees)
- [x] Decay emits `HeroRegardForGuildmasterChanged` with a reason naming the idleness; no new event type is introduced for it (`engine/tests/decay.test.ts`: "reports drift as a Regard movement and introduces no event of its own" — asserts the whole set of event types a 200-Day idle run produces)
- [x] Decay can push a Hero below the Departure threshold, and the Departure check that follows sees the new value in the same refresh (`engine/tests/decay.test.ts`: "checks the Hero on the value the drift has just taken them to" — the drift to −5 and the `HeroDeparted` at −5 share Day 40, in that order)
- [x] Heroes away on a Commission do not decay (`engine/tests/decay.test.ts`: "starts at the commit, not at the return, and leaves a Hero away untouched" — everybody left in the hall drifts on the refresh; the one out on the work does not, and their `regardDecayedOn` is untouched)

### E2-S5 · Regard in Backing, and content · 0.5–1 day

The architecture's §5 note "Regard does not yet contribute (E2)" is discharged here.

```
statTerm   = clamp(round((gm.Nerve + gm.Guile) / 2) − 2, 0, config.backingMax)
traitTerm  = Σ gm.traits[].backing
regardTerm = round(mean(member.regardForGuildmaster.value) / config.backingRegardDivisor)
backing    = clamp(statTerm + traitTerm + regardTerm, config.backingMin, config.backingMax)
```

Plus content: two or three Traits carrying a `refusal`, and at least two Vignettes whose outcomes move `heroRegardForGuildmaster` (that Consequence kind already exists from E1 and is unused).

**Acceptance:**

- [x] Backing is negative for a Party of resentful Heroes and a test pins the exact value for a fixed Career (`engine/tests/backing.test.ts`: "goes negative for a Party of resentful Heroes" pins −1 on seed `backing-1`, whose Guildmaster's Nerve 2 / Guile 3 and absence of Backing Traits are asserted by the test above it; "bottoms out at the configured floor rather than running away downwards" pins −2 on seed `backing-14`. Both go through `proposeParty` and `commitParty` and read the number off the `PartyCommitted` event)
- [x] `backingMin` and `backingRegardDivisor` are `GameConfig` fields; no literal appears in `backing.ts` (`engine/tests/backing.test.ts`: "moves with backingRegardDivisor" and "moves with backingMin" drive the rule through four divisors and three floors. One note, honestly: there is no `backing.ts` — `backingFor` lives in `engine/src/check.ts` alongside the Check it feeds. The Stat term's own `/ 2` and `− 2`, inline since E1 and not in E2's scope to name, are resolved by [DL-15](../00-decision-log.md#dl-15): they are now `backingStatDivisor` and `backingStatOffset`)
- [x] At least three Traits with `refusal` ship in `content/traits.toml`, each with a `summary` the CLI can print (`content/tests/parse.test.ts`: "ships at least three refusing Traits, each with a summary that reads as a reason (E2)" — Godfearing, Never again the deep and Worn, with every refusal tag checked against the tags a Commission can actually carry)
- [x] At least two Vignettes move Regard for the Guildmaster on a non-success outcome (`content/tests/parse.test.ts`: "moves Regard for the Guildmaster on at least two non-success outcomes (E2)" — five, listed exactly: `collapsed-passage:failure`, `fever-in-the-wet:failure`, `quarrel-on-the-road:failure`, `quarrel-on-the-road:critical`, `terms-on-the-road:critical`)
- [x] The CLI shows refusals at the commit screen with the reason, and requires a second keypress to insist (`cli/tests/e2e.test.ts`, the "a Roster that will not go" block: the real process, driven by a script over `--config refusalRegardThreshold=5`, shows "Who will not go" with the reason, asks `insist>` before anything sets out, sends on `i` and sends nobody on anything else. `cli/tests/display.test.ts`, the "the refusals shown at the commit screen (E2)" block, holds the lines themselves inside 80 columns with the reason wrapped rather than clipped)

---

## 2. Definition of done

- [x] `proposeParty` is pure and its result is exactly what `commitParty` will do (`engine/tests/refusal.test.ts`: "changes nothing at all, over a deep-frozen Career"; "says nobody when the Roster is content, and agrees with the Backing commitParty computes". With one qualification the story itself sets out and DL-14 §2 records: where somebody refuses, insisting charges them *before* the Backing is worked out, so the committed Backing is lower than the proposal's by design, and `engine/tests/insistence.test.ts`: "sends a weaker Party than the one proposeParty described" pins the gap. The refusals themselves are always identical)
- [x] No Hero is ever committed against their will without an explicit `insist` (`engine/tests/insistence.test.ts`: "throws HeroRefused and leaves the Career byte-identical to its input"; `web/tests/careerReducer.test.ts`: "refuses to commit a Hero who will not go unless the action says to insist (E2)"; `cli/tests/e2e.test.ts`: "sends nobody at all when the second keypress is anything else")
- [x] Insistence, decay and Departure all move Regard through the one existing event, `HeroRegardForGuildmasterChanged` (`engine/tests/decay.test.ts`: "reports drift as a Regard movement and introduces no event of its own" pins the whole event-type set of a 200-Day run; `engine/tests/insistence.test.ts` and `departure.test.ts` read insistence and the talk-round off the same event by its `reason`. Departure itself is the one new event, because a Hero leaving the Roster is a different kind of fact)
- [x] Departed Heroes are readable in `formerHeroes` with their Traits, Regard and the reason intact (`engine/tests/departure.test.ts`: "leaves the Roster for formerHeroes, with an exit and everything else intact" — name, Stats, Traits and Regard are all compared against the Hero as they were; `engine/tests/gate.test.ts`: "keeps them readable afterwards, and counts them in the reckoning")
- [x] Refusal is data: adding a refusing Trait is a content edit, never an engine edit (`engine/tests/refusal.test.ts`: "names a Hero whose Trait refuses this Commission, and quotes the Trait" drives all three shapes — unconditional, by tag and by difficulty — through one rule with no Trait named in the engine; `engine/src/refusal.ts` contains no Trait name)
- [x] A save written by E1 loads in E2 (missing fields take their documented defaults) and a test proves it (`engine/tests/save.test.ts`, the "a save written before E2 existed" block: a document with all ten new `GameConfig` fields, both new `Hero` fields and `ledger.departures` stripped out loads, takes `defaultConfig` / `joinedOn` / `0`, goes on being played and still round-trips — and a field E1 itself always wrote is still refused)
- [x] `docs/planning/03-solution-architecture.md` §3, §5, §6 and §7 are updated in the same change (§3 state and `GameConfig`, §4 `TraitDef.refusal` as well, §5 the three-term Backing and the Refusal / Insistence / drift / Departure rules, §6 `proposeParty` and `commitParty`'s options, §7 the three new events, §10 the new suites)
- [x] The Backing formula change is recorded in the decision log ([DL-14](../00-decision-log.md#dl-14--the-e2-rules-as-built-backing-gains-its-regard-term-and-a-hero-at-the-bottom-of-the-scale-is-talked-round-before-they-are-lost) §1, with the two consequences of the clamp spelled out)

**Also landed, beyond the list above.** E8's browser client shows refusals in the Party picker as Heroes are toggled and puts insisting behind two taps (`web/tests/partyPicker.test.tsx`, six tests), with no component calling an engine function — the picker asks `web/src/state/selectors.ts` and the selector asks `proposeParty`, which `web/tests/engine-imports.test.ts` still enforces. `narrate/tests/regard.test.ts` holds the English for all four movements, including that a negative Backing is spelled out rather than printed as a minus sign. The `formerHeroId` hook E4 will need is written as documentation on `HeroExit` and `Guild.formerHeroes`: a departed Hero keeps their id and ids are never reused. `hallQuartersFactor` is read as `config.regardDecayQuartersFactor` behind `quartersFactor()` and is 1 for the whole of E2, as deferred.

---

## 3. Known unknowns — adopted defaults

| Question | Adopted default | Change it if |
| --- | --- | --- |
| Regard decay rate (INPUTS 3.1) | −1 per 30 idle Days | Heroes drift out faster than you can use them |
| Insistence cost (INPUTS 3.2) | −2 Regard, plus the Departure check it may now fail | Insisting never feels expensive, or is never worth it |
| Which Traits refuse (INPUTS 3.3) | Defined in content when writing them; three ship in E2 | The starter set makes refusal too common to be interesting |
| Refusal threshold | Regard ≤ −3 | Refusals cluster at the very bottom and nothing happens above it |
| Departure threshold and Check | Regard ≤ −5, `d20 + Guile` vs DC 12 at each Board refresh | Departure feels arbitrary rather than earned |
| Does Regard **for other Heroes** matter yet? | No. The field exists; nothing reads it until a later epic | A Party of enemies ought to fight worse — but that is a new rule, not a tweak |
| Can a Hero refuse a Commission they are already on? | No. Refusal happens at commitment only | Mid-Commission refusal is E6's territory, as a Decision |

---

## 4. Technical notes — exact engine additions

### `GameConfig`

```ts
refusalRegardThreshold: -3        // at or below, a Hero refuses
insistenceRegardCost: 2           // magnitude; applied as a negative delta
departureRegardThreshold: -5
departureDc: 12                   // Guildmaster's Guile Check to keep them
regardDecayEveryDays: 30
regardDecayAmount: 1              // magnitude
backingMin: -2                    // backingMax: 3 already exists
backingRegardDivisor: 2           // mean party Regard ÷ this ⇒ −2..+2
```

### State

```ts
interface Hero {                  // additions only
  lastCommittedOn: number         // Day of the last commit; initialised to joinedOn
  regardDecayedOn: number         // Day decay last fired; initialised to joinedOn
  exit?: HeroExit                 // set only on Heroes in formerHeroes
}

interface HeroExit { kind: 'departure'; onDay: number; reason: string }
//   E3 widens kind to 'departure' | 'death' | 'retirement'.

interface CareerLedger { departures: number }   // addition
```

### Content

```ts
interface TraitDef {              // addition only
  refusal?: { tags?: string[]; minDifficulty?: number }
  //   Present ⇒ the Trait can refuse. Both fields absent ⇒ refuses everything.
  //   tags match the Commission's tags; minDifficulty matches commission.difficulty.
}
```

### Events

```ts
| { type: 'CommissionRefused'; day; heroId; commissionId; reason: 'regard' | 'trait'; trait?: string; regardValue: number }
| { type: 'InsistenceApplied'; day; heroId; commissionId; delta: number; value: number }
| { type: 'HeroDeparted'; day; heroId; regardValue: number; reason: 'regard' }
```

`HeroRegardForGuildmasterChanged` carries every Regard movement — insistence, decay and the talk-round — with a distinguishing `reason` string. No new event is added for decay, because decay is not a different kind of fact.

### Engine API

```ts
export function proposeParty(career: Career, commissionId: string, heroIds: string[], content: Content): PartyProposal
export function commitParty(career: Career, commissionId: string, heroIds: string[], content: Content,
                            options?: { insist?: boolean }): Step
//   now also throws EngineError('HeroRefused') when refusals exist and insist is not set

interface PartyProposal { commissionId: string; heroIds: string[]; backing: number; refusals: Refusal[] }
interface Refusal { heroId: string; reason: 'regard' | 'trait'; trait?: string; regardValue: number }
```

**Why both, and why `proposeParty` is the load-bearing one.** An `insist` flag on `commitParty` alone cannot work: to decide whether to insist, the player must already know who refuses and why, and the only way to learn that from a commit-shaped API is to call it and read an exception — which means either parsing an error payload or committing to find out. `proposeParty` makes the question a pure read with no cost, which is what every front end actually needs: the CLI renders refusals under the Party it is assembling, and the web client (E8) does the same reactively as Heroes are toggled. `insist` still has to exist, because the commit must record that the player accepted the price — but it is a confirmation, not a query. The rule that falls out is worth stating: **`proposeParty` answers, `commitParty` decides, and neither is ever the only way to learn what the other will do.**

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Regard becomes a resource the player farms rather than a relationship | Regard cannot be bought or spent directly — it moves only through work done, insistence and neglect. If a path to buying it appears, it is a defect |
| The Roster empties in a bad run and the Career becomes unplayable | Departure is survivable by design: Upkeep falls with the Roster, and E4 brings Applicants. A test asserts `advance` over an empty Roster |
| Refusals fire so often that committing anyone becomes a chore | Refusal is gated on a threshold that only neglect or insistence reaches. Tune `refusalRegardThreshold` after one played Career, not before |
| Backing changing shape invalidates a player's intuition mid-Career | It changes once, here, with the architecture note that promised it. It is recorded in the decision log and never changed again silently |
| The Departure Check reads as random punishment | `HeroDeparted` carries the Regard value; narration names the neglect. A Hero never departs from a Regard the player has not watched fall |

> **Where those tests are now.** E7 restructured the terminal front end and its suite (DL-25, DL-26): `cli/tests/display.test.ts` became `cli/tests/views.test.ts`, `layout.test.ts` and `screen.test.ts`, the screens that ask for a confirming keypress became `cli/tests/confirm.test.ts`, and `cli/tests/saves.test.ts` became `cli/tests/slots.test.ts`. Every assertion cited above moved with the code it covers; none was dropped.
