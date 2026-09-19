# E2 — Refusals and Regard

**Objective:** Heroes can say no, and the price of making them go anyway is paid in Regard  
**Estimate:** 3–4 days · **Depends on:** E1 · **Implements:** [Design §People](../design.md#people) · **Realises:** ADR-0003, ADR-0005, ADR-0007  
**Gate:** A Career can be played to Retirement in which at least one Hero refuses work, is insisted upon, and departs

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

- [ ] `TraitDef.refusal` parses from `content/traits.toml` and fails validation with a named field on a malformed entry
- [ ] `proposeParty` returns the Backing the Party would have and one `Refusal` per refusing Hero, and never mutates the Career
- [ ] A Hero refusing for both reasons yields one `Refusal` with `reason: 'regard'` (Regard wins, so the narration blames the relationship, not the Trait)
- [ ] A Party with no refusals yields an empty `refusals` array and the same Backing `commitParty` will compute
- [ ] `proposeParty` on an unknown Commission or Hero throws the same `EngineError` codes `commitParty` does

### E2-S2 · Insistence and its cost · 0.5 day

`commitParty` refuses to insist by accident.

- Called with refusals outstanding and no `insist`, it throws `EngineError('HeroRefused')`
- Called with `{ insist: true }`, it commits and charges `config.insistenceRegardCost` Regard to **each** refusing Hero, with the reason recorded on the Regard
- Non-refusing members of the same Party are untouched

**Acceptance:**

- [ ] `commitParty(..., { insist: true })` emits one `InsistenceApplied` and one `HeroRegardForGuildmasterChanged` per refusing Hero, in Hero order
- [ ] `commitParty` without `insist` throws and leaves the Career byte-identical to its input
- [ ] Insisting twice on the same Hero costs twice; Regard clamps at −5 and the clamp is asserted
- [ ] Backing is computed **after** the insistence penalty, so insisting visibly weakens the Party it creates
- [ ] `insist: true` with no refusals is legal and emits nothing extra

### E2-S3 · Departure · 1 day

Departure is a Guild-side Check, which is what gives the Guildmaster's Stats their second job.

At each Board refresh, every Hero with `regardForGuildmaster.value <= config.departureRegardThreshold` is checked: `d20 + gm.stats.Guile + gm traitModifiers` against `config.departureDc`. Success and they stay, and the Regard's reason records that you talked them round. Failure and they leave: the Hero moves to `guild.formerHeroes` with an `exit` recorded, any Party they are on is unaffected (they finish the Commission first — a Hero away on work departs on their return Day instead).

**Acceptance:**

- [ ] A Hero at or below the threshold is checked once per Board refresh, never twice on the same Day
- [ ] A departing Hero appears in `formerHeroes` with `exit.kind === 'departure'` and is gone from `roster`
- [ ] A Hero away on a Commission does not vanish mid-Commission; the check is deferred to their return Day
- [ ] `HeroDeparted` carries the Regard value that caused it, so narration can say how far it had fallen
- [ ] `ledger.departures` increments and the reckoning's `heroesLost` counts them
- [ ] A Roster emptied by Departure does not crash `advance`; it is survivable and Upkeep falls to `upkeepBase`

### E2-S4 · Regard decay · 0.5 day

A Hero you never send out drifts away.

Decay is evaluated at each Board refresh: a Hero for whom `day - max(lastCommittedOn, regardDecayedOn) >= config.regardDecayEveryDays × hallQuartersFactor` loses `config.regardDecayAmount`, and `regardDecayedOn` is set to the current Day. `hallQuartersFactor` is 1 until E3 buys quarters.

**Acceptance:**

- [ ] A Hero committed to a Commission has `lastCommittedOn` set at commit, not at return
- [ ] 30 idle Days costs exactly 1 Regard, 60 costs 2, and a test walks 200 Days asserting the exact sequence
- [ ] Decay emits `HeroRegardForGuildmasterChanged` with a reason naming the idleness; no new event type is introduced for it
- [ ] Decay can push a Hero below the Departure threshold, and the Departure check that follows sees the new value in the same refresh
- [ ] Heroes away on a Commission do not decay

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

- [ ] Backing is negative for a Party of resentful Heroes and a test pins the exact value for a fixed Career
- [ ] `backingMin` and `backingRegardDivisor` are `GameConfig` fields; no literal appears in `backing.ts`
- [ ] At least three Traits with `refusal` ship in `content/traits.toml`, each with a `summary` the CLI can print
- [ ] At least two Vignettes move Regard for the Guildmaster on a non-success outcome
- [ ] The CLI shows refusals at the commit screen with the reason, and requires a second keypress to insist

---

## 2. Definition of done

- [ ] `proposeParty` is pure and its result is exactly what `commitParty` will do
- [ ] No Hero is ever committed against their will without an explicit `insist`
- [ ] Insistence, decay and Departure all move Regard through the one existing event, `HeroRegardForGuildmasterChanged`
- [ ] Departed Heroes are readable in `formerHeroes` with their Traits, Regard and the reason intact
- [ ] Refusal is data: adding a refusing Trait is a content edit, never an engine edit
- [ ] A save written by E1 loads in E2 (missing fields take their documented defaults) and a test proves it
- [ ] `docs/planning/03-solution-architecture.md` §3, §5, §6 and §7 are updated in the same change
- [ ] The Backing formula change is recorded in the decision log

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
