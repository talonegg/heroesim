# E3 — Injuries and Scars

**Objective:** Work marks people — Injuries that lift, Scars that never do, and careers that end  
**Estimate:** 2–3 days · **Depends on:** E1 · **Implements:** [Design §People](../design.md#people) · **Realises:** ADR-0005, ADR-0006  
**Gate:** A Career runs to Retirement in which a Hero is injured and recovers, a Hero is scarred and keeps working, and a Hero retires by age

**Status:** Built and independently verified 2026-09-19 (DL-16, DL-17). The gate is met by `engine/tests/e3-gate.test.ts`, which plays seed `e3-gate-14` to Retirement through the public API under a policy that improves the Hall when it can comfortably afford to. The rules as built are recorded in [DL-16](../00-decision-log.md#dl-16--the-e3-rules-as-built-ages-derived-from-the-seed-rather-than-drawn-from-the-career-three-named-hall-costs-and-retirement-taken-before-the-departure-check), which deviates from this file in three places, all named there: the Hall's costs are three flat `GameConfig` numbers rather than the `hallImprovementCosts` table §4 sketches; `quartersRegardDecayFactor` is E2's existing `regardDecayQuartersFactor` with its default moved from 1 to 2; and a Hero's starting age is derived from the Career's seed and their id rather than drawn from `career.rng`. **One acceptance box below is not met** — a mix of all three exit kinds on most seeds — and the measured reason is given with it.

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

- [x] `injuryOutcome(total, dc, config)` is a pure exported helper and has a table test over the full margin range (`engine/tests/harm.test.ts`: "classifies the whole margin range, one point either side of every boundary" — every total from `dc - 20` to `dc + 20` as a table, then the three boundaries named; "moves with criticalMargin and with nothing else"; "is pure: the same answer for the same numbers, and it draws nothing". The signature takes `total` rather than the `roll` this line first said, because the margin is a property of the total; §4 already said so)
- [x] A Vignette outcome carrying a `trait` Consequence suppresses engine-supplied harm entirely, and a test proves it (`engine/tests/harm.test.ts`: "suppresses engine-supplied harm entirely" — the same seed and the same forced config twice, differing only in whether the outcome carries the Consequence; and "suppresses a Scar and a Death as well as an Injury")
- [x] Death is checked before Scar so the rare case is not swallowed by the common one (`engine/tests/harm.test.ts`: "checks Death before the Scar, so the rare case is not swallowed by the common one" — both chances set to 1, so only the order can decide it)
- [x] A Hero who dies mid-Commission stops appearing in later Beats of that Commission; the Party continues short-handed (`engine/tests/harm.test.ts`: "stops appearing in later Beats, and the Party carries on short-handed"; "leaves the Roster for formerHeroes with an exit that says so, and never returns")
- [x] A Party wholly dead returns immediately with `succeeded: false` and no fee (`engine/tests/harm.test.ts`: "returns a wholly dead Party at once, with succeeded false and no fee" — home on the Day the last of them died, `heroIds` empty, and no `CoinChanged` carrying reason `fee`)
- [x] Harm probabilities are `GameConfig` fields; no literal probability appears in `beat.ts` (`engine/tests/harm.test.ts`: "reads every probability and every span from GameConfig and from nowhere else" — each of the four numbers driven to both of its extremes through `newCareer`'s config alone, and the span driven to three different ranges. Proved behaviourally rather than by reading the source, which is how `backing.test.ts` proves the same thing of Backing)

### E3-S2 · Injuries lift; injured Heroes cannot be committed · 0.5 day

`liftsOn` has existed on `HeroTrait` since E1 and nothing has ever set or honoured it. Both happen here.

- At the start of each Day, every Trait with `liftsOn <= day` is removed and reported
- `availableHeroes` excludes any Hero holding a Trait of `kind: 'injury'`
- `proposeParty` (E2) reports them in a new `unavailable` list rather than silently dropping them, so the CLI can say *why* a name is greyed out

**Acceptance:**

- [x] An Injury given on Day 40 with span 20 lifts on Day 60, emitting `InjuryLifted` exactly once (`engine/tests/injury.test.ts`: "comes off on Day 60 when it was given on Day 40 with a span of 20, exactly once" — nothing on Day 59, one event on Day 60 carrying `injuredOn: 40` and `daysBorne: 20`, and never again over the next two hundred Days; "reports InjuryLifted alone, and never a paired TraitLifted")
- [x] `availableHeroes` excludes injured Heroes; `commitParty` throws `EngineError('HeroNotAvailable')` for one (`engine/tests/injury.test.ts`: "is left out of availableHeroes and named by injuredHeroes"; "is refused by commitParty with HeroNotAvailable, and the Career is untouched" — compared through `serialiseCareer`, with `proposeParty` refused for the same reason; "can be sent again on the very Day the Injury lifts")
- [x] `PartyProposal.unavailable` names each excluded Hero with `'away' | 'injured'` (`engine/tests/injury.test.ts`: "names every Hero who cannot be sent, with the reason"; "is empty when everybody can go, and says away for a Hero who is both away and injured". It lists the whole Roster's unavailable members rather than only the ones the proposal named — [DL-16](../00-decision-log.md#dl-16) §8)
- [x] A Hero injured on the last Beat of a Commission is injured when they return, not while away (`engine/tests/injury.test.ts`: "is injured when they come home, not while they are away" — the Party returns naming them, and on that Day they are off `availableHeroes`, on `injuredHeroes` and refused by `commitParty`)
- [x] Two Injuries at once lift independently and neither lift frees the Hero while the other stands (`engine/tests/injury.test.ts`: "lifts two Injuries independently, and neither frees the Hero while the other stands" — spans of 10 and 20 Days, with the Hero still refused between the two lifts)

### E3-S3 · Age, Retirement and the exit ledger · 0.5 day

Without Retirement every exit is a failure and the tone flattens. Heroes age.

- Every Hero and Applicant carries `age`. Starting Heroes are generated in `[heroStartingAgeMin, heroStartingAgeMax]`
- On each Day where `day % config.daysPerYear === 0`, every Hero on the Roster ages one year
- A Hero reaching `config.heroRetirementAge` retires at the next Board refresh, moving to `formerHeroes` with `exit.kind === 'retirement'`
- `HeroExit.kind` widens to `'departure' | 'death' | 'retirement'` — one union, three ways out, all readable

**Acceptance:**

- [x] Ages advance exactly once per in-game year across a full 20-year Career and a test counts them (`engine/tests/age.test.ts`: "advances exactly once per in-game year across a full twenty-year Career" — the whole Career walked one Day at a time, twenty birthdays counted and their Days asserted to be exactly the year boundaries; "happens on the year boundary and on no other Day, in one stretch as in many"; "ages a Hero who is away on work as well as one who is at home")
- [x] A Hero retires on a Board refresh, never mid-Commission; one away on work retires on their return Day (`engine/tests/age.test.ts`: "takes a Hero at the configured age, on a Board refresh, with age and years served" — nothing on Day 9, the exit on Day 10; "never happens mid-Commission: a Hero away on work retires on their return Day" — a refresh falls on Day 10 while they are out and the `HeroRetired` lands on Day 16, after the `PartyReturned` that closes the work)
- [x] `HeroRetired` carries `age` and `yearsServed = round((day - joinedOn) / daysPerYear)` (`engine/tests/age.test.ts`: "takes a Hero at the configured age, on a Board refresh, with age and years served"; "counts years served from the Day they joined")
- [x] The reckoning's `heroesLost` counts Death and Departure; Retirement is reported separately, because it is not a loss (`engine/tests/age.test.ts`: "counts Retirement apart from the losses in the reckoning"; `engine/tests/e3-gate.test.ts`: "retires a Hero by age, and it is not counted as a loss", and the 200-seed smoke asserts both sides of the split on every seed)
- [ ] `formerHeroes` after a full Career contains a mix of all three exit kinds on most seeds (**not met**, and unreachable at the adopted defaults under any policy independent verification measured — [DL-17](../00-decision-log.md#dl-17) §5, correcting the cause given here at build time. The binding constraint is **Departure, not Death**: under the Hall-buying policy, P(≥1 Death) 9.2%, P(≥1 Departure) 0.8%, P(≥1 Retirement) 70.0%, joint about 0.05%; with no Hall, 26.7% / 13.3% / 39.2%, joint about 1.4% (2 of 120 observed). Departure is rare because a sensible policy never insists and buys quarters, not because the death rate is too low. All three kinds are reachable individually: `engine/tests/e3-gate.test.ts` requires a Death and a Retirement across the fleet and requires every exit found to carry one of the three kinds, and Departure is proved deterministically by E2 in `engine/tests/departure.test.ts`. The criterion itself is the mistake, and it shows E2's headline mechanic nearly switched off under a sensible policy — DL-17 §5 recommends the deferred balance pass look at the criterion. Not rebalanced here: [DL-15](../00-decision-log.md#dl-15) §3 defers that pass past E6)

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

- [x] `guild.hall` is a string array of improvement ids and is serialised with the Career (`engine/tests/hall.test.ts`: "keeps all three, in the order they were bought, through a save". Narrowed from `string[]` to `HallImprovement[]` as §4 asks, and `deserialiseCareer` refuses an entry outside the union — `engine/tests/save.test.ts`: "refuses a Hall improvement the world has no meaning for")
- [x] Each improvement's effect has a test that pins a value with it and without it (`engine/tests/hall.test.ts`: "halves the span of a future Injury, pinned with it and without it" — 21 Days against 11; "adds its Backing to every Party, pinned with it and without it"; "multiplies the idle threshold, pinned with it and without it" — drift on Days 40/70/100/130/160/190 against 70/130/190. Each has a "moves with …" test driving its own config field beside it, and the infirmary has "does not shorten an Injury already borne" and "shortens an authored Injury as well as one the engine drew")
- [x] `HallImproved` carries the cost and the resulting balance; `CoinChanged` reports the same movement with `reason: 'hall'` (`engine/tests/hall.test.ts`: "puts it in the Hall, takes the coin, and reports both" — for all three improvements, with the two balances asserted equal)
- [x] Buying with insufficient coin throws and leaves the Career byte-identical (`engine/tests/hall.test.ts`: "throws InsufficientCoin and leaves the Career byte-identical", compared through `serialiseCareer`, with one coin more going through; and the same for "throws AlreadyImproved…" and "throws CareerEnded…")
- [x] The CLI offers the Hall from the main screen with the cost and the effect in one line each (`cli/tests/display.test.ts`: "offers all three improvements with the cost and the effect on one line each"; "says in words whether each can be afforded, and what is already built"; "offers the Hall from the main screen's command bar and from the help". `cli/tests/e2e.test.ts`, the "the Hall from the main screen" block, drives the real process over `--script`: it buys one, is refused a second purchase of it, and is refused one it cannot pay for — every line inside 80 columns)
- [x] Costs and factors are `GameConfig` fields (`engine/tests/hall.test.ts`: "costs what GameConfig says it costs, and nothing is a literal", with the three "moves with …" tests beside it. Three flat numbers rather than one table — [DL-16](../00-decision-log.md#dl-16) §3)

---

## 2. Definition of done

- [x] An Injury, a Scar and a Death are all `HeroTrait`s or exits — no parallel harm system exists anywhere (ADR-0005) (`engine/src/harm.ts` gives a `HeroTrait` through the same `giveTrait` an authored Consequence uses, or writes a `HeroExit`; there is no other state. `engine/tests/harm.test.ts`: "is a Trait of kind injury, and the mechanical TraitGained fires beside it"; "leaves a Scar when Death does not fall, and the Scar never lifts"; "leaves the Roster for formerHeroes with an exit that says so, and never returns")
- [x] Critical failure is derived from `roll`, `total` and `dc`, and adds no `BeatResult` member (`engine/tests/harm.test.ts`: "adds no fourth BeatResult: a critical failure is still reported as a failure" — every Beat of a run in which every Check is a critical failure still reports `result: 'failure'`; `engine/tests/events.test.ts` pins the whole event union and `BeatResult` is untouched)
- [x] Every Vignette outcome can still be authored without knowing harm exists; harm is the engine's fallback, not a content burden (`engine/tests/harm.test.ts`: "suppresses engine-supplied harm entirely"; "leaves E1's own authored Injury exactly as it was: Bruised, for six Days". No authored Vignette changed in E3 and none had to: `content/tests/parse.test.ts`: "gives every Injury a Vignette or the engine can reach it (E3)")
- [x] Injuries lift deterministically from a seed, and a 200-seed smoke run finds no Hero stuck injured forever (`engine/tests/e3-gate.test.ts`: "leaves nobody injured for ever, and most of them still reach ten years" — over two hundred Careers, no Hero left on a Roster carries a Trait whose Day has passed, and every Injury given long enough ago either lifted or its bearer left the Roster first; the same Career replayed clears the same Injuries on the same Days)
- [x] A Career that loses its whole Roster to harm is survivable and reaches an ending (`engine/tests/harm.test.ts`: "is survivable when the whole Roster is lost to it: the Career still reaches an ending"; `engine/tests/e3-gate.test.ts`: "is survivable: the Career runs on and reaches an ending", where the Roster empties to Retirement instead and Upkeep falls to `upkeepBase`)
- [x] Saves from E2 load; Heroes without `age` are given one from the configured range (`engine/tests/save.test.ts`, the "a save written before E3 existed" block: five tests covering the thirteen config fields, the four ledger counters, the age fill, its determinism across two loads, and that the Career goes on being played to an ending. The age is the one world generation would have given that Hero, derived from the seed and their id, so the load advances no generator — [DL-16](../00-decision-log.md#dl-16) §1. "and the save is rewritten" is the front ends' business and neither of them was changed for it: both already write the whole Career back on the next save)
- [x] Two or three Injury Traits and two or three Scar Traits ship in `content/traits.toml` with summaries (four Injuries and six Scars ship — more than either count this box asks for. §3's "Known unknowns" (§3, Scar flavours) adopted four Scars; six shipped, not four, so the record here says which is which rather than repeating §3's number as if it matched. They were authored in E1 and E3 is the first thing to draw from them. `content/tests/parse.test.ts`: "ships Injuries and Scars for E3 to draw from, each with a summary (E3)" names all ten and requires a summary, a modifier and no Background handing one out at world generation)
- [x] Architecture §3, §4, §5, §6 and §7 updated in the same change (§3 state and `GameConfig`, §5 the four new rule blocks and Backing's fourth term, §6 the API and `PartyProposal`, §7 the six new events and `CoinChanged.reason`, and §9/§10 for the front ends and the new suites. §4 needed no change: `TraitDef` already carries `kind: 'injury' | 'scar'` and the `trait` Consequence already carries `days`)

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

> **Where those tests are now.** E7 restructured the terminal front end and its suite (DL-25, DL-26): `cli/tests/display.test.ts` became `cli/tests/views.test.ts`, `layout.test.ts` and `screen.test.ts`, the screens that ask for a confirming keypress became `cli/tests/confirm.test.ts`, and `cli/tests/saves.test.ts` became `cli/tests/slots.test.ts`. Every assertion cited above moved with the code it covers; none was dropped.
