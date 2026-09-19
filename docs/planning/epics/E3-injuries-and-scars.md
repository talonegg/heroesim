# E3 — Injuries and Scars

**Objective:** Work marks people — Injuries that lift, Scars that never do, and careers that end  
**Estimate:** 2–3 days · **Depends on:** E1 · **Implements:** [Design §People](../design.md#people) · **Realises:** ADR-0005, ADR-0006  
**Gate:** A Career runs to Retirement in which a Hero is injured and recovers, a Hero is scarred and keeps working, and a Hero retires by age

---

## 0. What lands in E3

- **Injury:** a Trait with `liftsOn`, which the engine lifts on that Day. Injured Heroes cannot be committed
- **Scar:** a Trait without `liftsOn`, left by a critical failure. Permanent, and it keeps modifying Checks forever
- **Death:** rare, from a critical failure. The Hero moves to `formerHeroes` and never returns
- **Age and Retirement:** Heroes gain an `age`, tick over at each year boundary, and retire at a configured age — an exit that ends well, which is the whole reason it exists
- **The Hall:** `improveHall` spends coin between Commissions on an infirmary, a training yard or quarters

**Deliberately deferred:**

- Any injury *severity* model beyond the span of Days (`liftsOn` is the whole of it)
- Treating an injury faster by spending coin per Hero — the infirmary is bought once and helps everyone
- A Hero declining to go out *because* they are still sore — that is a refusal, and refusal is E2's
- Heroes improving with training (see §3; the training yard does something simpler)
- Hall improvements beyond the three the design names

---

## 1. Stories

### E3-S1 · Harm from a Beat · 1 day

A failed Check may cost the slot Hero something, and a badly failed one may cost them a great deal.

- **Critical failure** is `total <= dc - config.criticalMargin`. It is not a fourth `BeatResult` (see §3); it is a failure whose margin the engine reads from the numbers it already emits
- **Authored harm wins.** If the Vignette's outcome already carries a `trait` Consequence, the engine adds none — the content said what happens
- Otherwise, on a plain failure the Hero takes an Injury with probability `config.injuryChanceOnFailure`; on a critical failure a Scar with `scarChanceOnCriticalFailure`, or Death with `deathChanceOnCriticalFailure`, checked in that order
- The Trait given is drawn from `content.traits` by `kind` (`'injury'` or `'scar'`), weighted evenly, excluding ones the Hero already holds

**Acceptance:**

- [ ] `injuryOutcome(roll, dc, config)` is a pure exported helper and has a table test over the full margin range
- [ ] A Vignette outcome carrying a `trait` Consequence suppresses engine-supplied harm entirely, and a test proves it
- [ ] Death is checked before Scar so the rare case is not swallowed by the common one
- [ ] A Hero who dies mid-Commission stops appearing in later Beats of that Commission; the Party continues short-handed
- [ ] A Party wholly dead returns immediately with `succeeded: false` and no fee
- [ ] Harm probabilities are `GameConfig` fields; no literal probability appears in `beat.ts`

### E3-S2 · Injuries lift; injured Heroes cannot be committed · 0.5 day

`liftsOn` has existed on `HeroTrait` since E1 and nothing has ever set or honoured it. Both happen here.

- At the start of each Day, every Trait with `liftsOn <= day` is removed and reported
- `availableHeroes` excludes any Hero holding a Trait of `kind: 'injury'`
- `proposeParty` (E2) reports them in a new `unavailable` list rather than silently dropping them, so the CLI can say *why* a name is greyed out

**Acceptance:**

- [ ] An Injury given on Day 40 with span 20 lifts on Day 60, emitting `InjuryLifted` exactly once
- [ ] `availableHeroes` excludes injured Heroes; `commitParty` throws `EngineError('HeroNotAvailable')` for one
- [ ] `PartyProposal.unavailable` names each excluded Hero with `'away' | 'injured'`
- [ ] A Hero injured on the last Beat of a Commission is injured when they return, not while away
- [ ] Two Injuries at once lift independently and neither lift frees the Hero while the other stands

### E3-S3 · Age, Retirement and the exit ledger · 0.5 day

Without Retirement every exit is a failure and the tone flattens. Heroes age.

- Every Hero and Applicant carries `age`. Starting Heroes are generated in `[heroStartingAgeMin, heroStartingAgeMax]`
- On each Day where `day % config.daysPerYear === 0`, every Hero on the Roster ages one year
- A Hero reaching `config.heroRetirementAge` retires at the next Board refresh, moving to `formerHeroes` with `exit.kind === 'retirement'`
- `HeroExit.kind` widens to `'departure' | 'death' | 'retirement'` — one union, three ways out, all readable

**Acceptance:**

- [ ] Ages advance exactly once per in-game year across a full 20-year Career and a test counts them
- [ ] A Hero retires on a Board refresh, never mid-Commission; one away on work retires on their return Day
- [ ] `HeroRetired` carries `age` and `yearsServed = round((day - joinedOn) / daysPerYear)`
- [ ] The reckoning's `heroesLost` counts Death and Departure; Retirement is reported separately, because it is not a loss
- [ ] `formerHeroes` after a full Career contains a mix of all three exit kinds on most seeds

### E3-S4 · The Hall · 0.5–1 day

Coin buys exactly one thing besides Upkeep.

```ts
improveHall(career, 'infirmary' | 'trainingYard' | 'quarters'): Step
```

- Throws `EngineError('InsufficientCoin')` or `EngineError('AlreadyImproved')`; buying is legal on any Day
- **Infirmary:** halves the span of every Injury given from then on — `ceil(span × config.infirmaryInjuryFactor)`. It does not shorten one already borne
- **Quarters:** multiplies E2's idle threshold by `config.quartersRegardDecayFactor`, so neglect takes twice as long to bite
- **Training yard:** adds `config.trainingYardBacking` to every Party's Backing, before the clamp

**Acceptance:**

- [ ] `guild.hall` is a string array of improvement ids and is serialised with the Career
- [ ] Each improvement's effect has a test that pins a value with it and without it
- [ ] `HallImproved` carries the cost and the resulting balance; `CoinChanged` reports the same movement with `reason: 'hall'`
- [ ] Buying with insufficient coin throws and leaves the Career byte-identical
- [ ] The CLI offers the Hall from the main screen with the cost and the effect in one line each
- [ ] Costs and factors are `GameConfig` fields

---

## 2. Definition of done

- [ ] An Injury, a Scar and a Death are all `HeroTrait`s or exits — no parallel harm system exists anywhere (ADR-0005)
- [ ] Critical failure is derived from `roll`, `total` and `dc`, and adds no `BeatResult` member
- [ ] Every Vignette outcome can still be authored without knowing harm exists; harm is the engine's fallback, not a content burden
- [ ] Injuries lift deterministically from a seed, and a 200-seed smoke run finds no Hero stuck injured forever
- [ ] A Career that loses its whole Roster to harm is survivable and reaches an ending
- [ ] Saves from E2 load; Heroes without `age` are given one from the configured range and the save is rewritten
- [ ] Two or three Injury Traits and two or three Scar Traits ship in `content/traits.toml` with summaries
- [ ] Architecture §3, §4, §5, §6 and §7 updated in the same change

---

## 3. Known unknowns — adopted defaults

| Question | Adopted default | Change it if |
| --- | --- | --- |
| Injury duration (INPUTS 4.1) | 15–30 Days, uniform | Recovery outlasts the player's memory of the Beat that caused it |
| Infirmary (INPUTS 4.2) | 200 coin, halves the span of future Injuries | 200 is unreachable in a first Career, or trivial in a tenth |
| Scar flavours (INPUTS 4.3) | Authored in content when writing them; four ship in E3 | The set reads as a list of wounds rather than of people |
| Is critical failure a fourth `BeatResult`? | **No.** `Vignette.outcomes` is `Record<BeatResult, …>`, so a fourth member would invalidate every authored Vignette and force a fourth block into every future one. Critical failure is a failure with `total <= dc − criticalMargin` | Vignettes ever want to *narrate* a critical failure differently — at which point it is an optional `outcomes.criticalFailure` falling back to `failure`, not a new result |
| What does the training yard do? | +1 Backing for every Party | A flatter effect is wanted. The richer reading — idle Heroes raise a Stat — is deferred because it needs a progression model the game does not otherwise have, and because rising Stats quietly erase the Traits that make a Hero legible |
| Hero retirement age | 55, from a starting range of 22–40 | A twenty-year Career retires nobody, or retires everybody |
| Death rate | 3% of critical failures, which is well under 1% of Beats | A Career loses nobody, or loses somebody every month |
| Can a Scar be removed? | No, ever. That is what makes it a Scar | — |

---

## 4. Technical notes — exact engine additions

### `GameConfig`

```ts
injuryChanceOnFailure: 0.25
scarChanceOnCriticalFailure: 0.30
deathChanceOnCriticalFailure: 0.03
injurySpanMin: 15; injurySpanMax: 30
heroStartingAgeMin: 22; heroStartingAgeMax: 40
heroRetirementAge: 55
hallImprovementCosts: { infirmary: 200; trainingYard: 250; quarters: 250 }
infirmaryInjuryFactor: 0.5        // multiplies the span of future Injuries
quartersRegardDecayFactor: 2      // multiplies E2's idle threshold
trainingYardBacking: 1            // added before the Backing clamp
```

### State

```ts
interface Hero { age: number }                                  // addition
interface Applicant { age: number }                             // E4 generates it in the same range

type HallImprovement = 'infirmary' | 'trainingYard' | 'quarters'
interface Guild { hall: HallImprovement[] }                     // narrows the existing string[]

interface HeroExit { kind: 'departure' | 'death' | 'retirement'; onDay: number; reason: string }
//   widened from E2's single member

interface CareerLedger { heroesInjured: number; heroesScarred: number; heroesDied: number; heroesRetired: number }
interface Reckoning { heroesRetired: number }                   // reported apart from heroesLost
```

`HeroTrait.liftsOn` is unchanged — E1 defined it and E3 is the first epic to set or honour it.

### Events

```ts
| { type: 'HeroInjured';  day; heroId; trait: string; liftsOn: number; partyId?: string; beatIndex?: number }
| { type: 'InjuryLifted'; day; heroId; trait: string; injuredOn: number; daysBorne: number }
| { type: 'HeroScarred';  day; heroId; trait: string; partyId?: string; beatIndex?: number }
| { type: 'HeroDied';     day; heroId; partyId?: string; beatIndex?: number }
| { type: 'HeroRetired';  day; heroId; age: number; yearsServed: number }
| { type: 'HallImproved'; day; improvement: HallImprovement; cost: number; balance: number }
```

`TraitGained` continues to fire for every Trait, including Injuries and Scars — it is the mechanical fact. `HeroInjured` and `HeroScarred` are the narratable ones and carry what narration needs. `TraitLifted` is reserved for timed Traits that are **not** Injuries (E6 can give one); an Injury lifting emits `InjuryLifted` alone, so narration never has to de-duplicate a pair.

**Rule for widening, stated once for E3, E5 and E6.** Adding a literal to a closed `reason` union on an existing event is an addition: no field is removed or retyped, producers are unaffected, and TypeScript's exhaustiveness check makes every consumer declare what it does with the new case. Here `CoinChanged.reason` gains `'hall'`.

### Engine API

```ts
export function improveHall(career: Career, improvement: HallImprovement): Step
//   throws EngineError('InsufficientCoin' | 'AlreadyImproved' | 'CareerEnded')
export function injuredHeroes(career: Career): Hero[]
export function availableHeroes(career: Career): Hero[]         // now also excludes injured Heroes
export function injuryOutcome(total: number, dc: number, config: GameConfig): 'none' | 'injury' | 'critical'
//   pure margin classifier; the RNG draws are made by the caller so the helper stays table-testable

interface PartyProposal { unavailable: { heroId: string; reason: 'away' | 'injured' }[] }   // addition to E2's shape
```

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Harm becomes a death spiral: injured Roster ⇒ failed Commissions ⇒ more harm | Injury excludes a Hero from work but does not cost Upkeep-free time; the infirmary is reachable on a first Career's coin, and E4 brings Applicants. The 200-seed smoke run asserts most seeds still reach 10 years |
| Death is either never seen or seen constantly | 3% of critical failures is deliberately at the edge of noticeable. Count deaths across the smoke run and read the distribution before tuning |
| Injury Traits stack into an unplayable Hero | Harm never gives a Trait the Hero already holds, and only one harm is drawn per Beat |
| Age quietly makes every starting Hero retire together | Starting ages are drawn across an 18-year range, so exits stagger |
| The Hall becomes the only interesting decision | Three improvements, bought once each, totalling 700 coin. It is a milestone, not an economy |
| Critical failure silently changes E1's balance | It changes nothing about whether a Beat succeeds — only what a failure costs. E1's Check rule is untouched and its tests still pass unmodified |
