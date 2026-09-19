# E5 — Rivals and the League

**Objective:** Other Guilds hold people and opinions; Heroes move between Guilds both ways  
**Estimate:** 4–5 days · **Depends on:** E2 + E3 + E4 · **Implements:** [Design §Rivals and the League](../design.md#rivals-and-the-league) · **Realises:** ADR-0003  
**Gate:** A Career in which the player Transfers one Hero, Poaches another, and loses one to a soured Rival's retaliation

---

## 0. What lands in E5

- **Rivals get Rosters.** Ordinary Heroes, with Traits and Regard you can read, on a Guild that has no Hall, no Board and no coin (ADR-0003)
- **Rivals hold Regard for your Guild**, and it moves when you cross them
- **Transfer:** above board — you pay a fee and the Rival consents, if their Regard for you allows it
- **Poaching:** cheaper, needs the Hero's Regard for their own Guild to have soured, and costs you that Rival's goodwill
- **Retaliation by the same rule.** A soured Rival poaches from you, targeting Heroes whose Regard for the Guildmaster has fallen. Regard is what defends your Roster
- **Churn:** Rival Rosters gain and lose people at each Board refresh, and age
- **A soured Rival takes more off your Board**, which is where the cost of poaching is actually felt
- **The League** as a pure view: every Guild ordered by Standing, and nothing else

**Deliberately deferred:**

- Rivals running Beats. They take work and churn; they are not simulated (design, not omission)
- A bonded Hero refusing a Transfer their Rival has already consented to — one line, but it needs a rule about what a bond *is* that the game does not yet have
- Rivals bidding against you for an Applicant (E4's batch stays yours)
- Publishing the League anywhere (INPUTS 6.5 — terminal and browser views only; see E7 and E8)

---

## 1. Stories

### E5-S1 · Rivals gain Rosters and Regard · 1 day

`Rival` grows from `{ id, name, standing }` to a Guild-shaped thing that is still not a Guild.

- At `newCareer`, each Rival is generated with `rivalRosterMin..rivalRosterMax` Heroes from the same generator E4 uses for Applicants, with calibre drawn against that Rival's stored Standing by E4's rule
- Each of those Heroes carries `regardForRival` in place of `regardForGuildmaster` — a Hero holds Regard for whoever employs them, and only one employer at a time
- `rival.regardForGuild` starts neutral
- Rival Heroes age at year boundaries exactly as yours do (E3), and retire at the same age

**Acceptance:**

- [ ] A Rival has a Roster, a Standing and a Regard for your Guild, and no Hall, Board, coin or Guildmaster — a type test proves the last four are not expressible
- [ ] `employerRegard(career, heroId)` returns `regardForGuildmaster` for a Roster Hero and `regardForRival` for a Rival's, and is the only way either is read by the movement rules
- [ ] Rival Heroes are serialised with the Career and survive a round trip
- [ ] Rival Heroes ageing out emit `HeroRetired` and leave that Rival's Roster
- [ ] Generating 200 Careers produces no Hero on two Rosters at once

### E5-S2 · Transfers · 1 day

```ts
transferHero(career, rivalId, heroId): Step
```

- Fee is `config.transferFeeBase + config.transferFeePerCalibre × calibre`
- The Rival consents when `rival.regardForGuild.value >= config.transferConsentRegard`; otherwise `TransferRefused` with `reason: 'regard'`, and nothing moves
- Insufficient coin refuses with `reason: 'coin'`; a full Roster refuses with `reason: 'rosterFull'`
- On success the Hero moves across: `regardForRival` is dropped, `regardForGuildmaster` is set to `config.transferJoiningRegard`, `joinedOn` is the current Day, E2's timers reset, and `regardFor` is seeded neutral both ways against the Roster
- The Rival's Regard for you is untouched. You did it properly

**Acceptance:**

- [ ] `TransferRefused` is an event, not a thrown error — a refusal is a thing that happened in the world, and the CLI narrates it
- [ ] `EngineError` is still thrown for unknown ids and an ended Career
- [ ] A refused Transfer leaves the Career byte-identical
- [ ] A successful Transfer emits `HeroTransferred`, then `CoinChanged` with `reason: 'transfer'`, then `HeroJoined`
- [ ] The Hero is gone from the Rival's Roster and present in yours exactly once
- [ ] Fee and consent threshold are `GameConfig` fields

### E5-S3 · Poaching, and the bill it runs up · 1 day

```ts
poachHero(career, rivalId, heroId): Step
```

- Fee is `round(transferFee × config.poachFeeFactor)` — half
- It is legal only when `hero.regardForRival.value <= config.poachRegardThreshold`; otherwise `TransferRefused` with `reason: 'heroRegard'`
- The Rival is not asked. Their Regard for you falls by `config.poachRivalRegardCost`, with the reason recorded
- Everything else about the move is identical to a Transfer

**Acceptance:**

- [ ] A Hero at Regard −1 for their Rival cannot be poached; at −2 they can, and a test pins the boundary
- [ ] `HeroPoached` carries the fee, the Rival Regard delta and the resulting value
- [ ] Poaching twice from the same Rival sours them twice, and Regard clamps at −5
- [ ] Poaching is cheaper than the equivalent Transfer in every case, and a property test over calibres asserts it
- [ ] `CoinChanged` reports the fee with `reason: 'poach'`

### E5-S4 · Retaliation, by exactly the same rule · 0.5–1 day

At each Board refresh, every Rival with `regardForGuild.value <= config.retaliationRegardThreshold` attempts one poach against your Roster, using the same predicate applied the other way: your Heroes with `regardForGuildmaster.value <= config.poachRegardThreshold`, worst first. They pay you nothing, because poaching is without consent.

**Acceptance:**

- [ ] The predicate is one exported function used by both directions; a test calls it with the arguments swapped and gets the mirror answer
- [ ] A Guild with no soured Heroes loses nobody, however soured the Rivals are
- [ ] A Hero away on a Commission is not taken mid-Commission; retaliation is deferred to their return Day
- [ ] `RivalPoachedHero` carries the Regard value that made them takeable
- [ ] The taken Hero appears on that Rival's Roster with `regardForRival` at `config.transferJoiningRegard` and is gone from yours
- [ ] `ledger.heroesPoachedFromUs` increments and the reckoning reports it

### E5-S5 · Churn, and a soured Rival on your Board · 0.5 day

- At each Board refresh, each Rival with probability `config.rivalChurnChance` gains or loses one Hero, staying within `rivalRosterMin..rivalRosterMax`
- E1's rule was "one unclaimed Commission is taken by a random Rival per refresh". It becomes: `config.rivalTakesPerRefresh` plus `config.souredRivalExtraTakes` for each Rival at or below `config.souredRivalThreshold`, capped at `config.rivalTakesMax`, and a soured Rival is preferred as the taker

**Acceptance:**

- [ ] Churn never pushes a Rival Roster outside its bounds
- [ ] A Career with no soured Rivals loses exactly one Commission per refresh, as in E1, and E1's test passes unmodified
- [ ] Souring two Rivals costs you up to three Commissions a refresh, capped, and a test pins it
- [ ] Each taken Commission still emits `CommissionTakenByRival` and still drops that Patron's Regard — poaching costs you work, which is the whole point
- [ ] `RivalRosterChanged` carries the ids that joined and left

### E5-S6 · The League · 0.5 day

```ts
league(career): LeagueRow[]
```

A pure view, ordered by Standing descending, ties broken by name. It includes your Guild, whose Standing is `standing(career)` and is derived, and each Rival, whose Standing is stored. It computes nothing that is not already modelled.

**Acceptance:**

- [ ] `league` is pure, takes no RNG, emits no events and is covered by a snapshot test
- [ ] Your row is marked, and is not special-cased in the ordering
- [ ] `LeagueRow` carries Roster size, so the view says something a bare number does not
- [ ] Nothing in the engine writes a League position; a test asserts no field named `position` or `rank` exists on any state type

---

## 2. Definition of done

- [ ] A Rival is not a Guild and a Hero is a Hero wherever they work (ADR-0003)
- [ ] Departure (E2) and poaching are visibly one mechanism: the Hero who walks out is the Hero somebody else approached
- [ ] Every Hero movement — Transfer, poach, retaliation — runs through one internal `moveHero` so the two directions cannot drift apart
- [ ] The League is derived and is never written
- [ ] Refusals are events; only programming errors throw
- [ ] Saves from E4 load; Rivals without a Roster are populated at load from the Career's own RNG, deterministically
- [ ] Architecture §3, §4, §6 and §7 updated in the same change; the E1 Board-refresh rule is restated with its E5 form

---

## 3. Known unknowns — adopted defaults

| Question | Adopted default | Change it if |
| --- | --- | --- |
| Rival count (INPUTS 6.1) | 4, from E1's `rivalCount`, spaced evenly in Standing | The League reads as a crowd rather than as four named competitors |
| Transfer fee (INPUTS 6.2) | 100 + 50 × calibre, so 150 / 200 / 250 coin | Buying a Hero is never worth it against recruiting one for 80–160 |
| Poaching cost (INPUTS 6.3) | Half fee, needs Hero Regard ≤ −2, costs **−3** Rival Regard | Souring is either free or terminal |
| Rival turn order (INPUTS 6.4) | Once per Board refresh, in id order | Rivals feel reactive rather than scheduled |
| Published League (INPUTS 6.5) | Not published. Terminal view in E7, browser view in E8 | — |
| Does the Hero consent to a Transfer? | Not in E5. The Rival consents; the Hero's own Regard gates poaching only | A bond ought to hold somebody in place — see §0 |
| What sours a Rival besides poaching? | Nothing in E5, except a Vignette authoring the new `rivalRegard` Consequence | Rivals feel inert until you wrong them |
| Retaliation frequency | One attempt per soured Rival per Board refresh | Losing people feels like weather rather than consequence |

INPUTS 6.3 offered −5 Rival Regard. **−3 is adopted**, because at −5 a single poach takes a Rival straight past the retaliation threshold to the clamp, and the escalation the design wants — soured, then souring further — has nowhere to go.

---

## 4. Technical notes — exact engine additions

### `GameConfig`

```ts
rivalRosterMin: 4; rivalRosterMax: 8
rivalChurnChance: 0.3
transferFeeBase: 100; transferFeePerCalibre: 50
transferConsentRegard: 0              // Rival consents at or above this
transferJoiningRegard: 0              // the moved Hero's Regard for their new employer
poachFeeFactor: 0.5
poachRegardThreshold: -2              // the Hero's Regard for their current employer
poachRivalRegardCost: 3
retaliationRegardThreshold: -3
souredRivalThreshold: -3; souredRivalExtraTakes: 1; rivalTakesMax: 3
//   rivalTakesPerRefresh: 1 and rivalCount: 4 already exist from E1
```

### State

```ts
interface Rival {                     // additions to E1's { id, name, standing }
  roster: Hero[]
  regardForGuild: Regard
}

interface Hero {                      // addition
  regardForRival?: Regard             // set while employed by a Rival; absent on your Roster
  calibre: 1 | 2 | 3                  // E4 introduced it on Applicant; E5 carries it onto Hero
}

interface CareerLedger {
  heroesTransferredIn: number; heroesPoachedIn: number; heroesPoachedFromUs: number
}
interface Reckoning { heroesPoachedFromUs: number }

interface LeagueRow { guildId: string | 'player'; name: string; standing: number; rosterSize: number; isPlayer: boolean }
```

`regardForGuildmaster` and `regardForRival` are exclusive: a Hero holds Regard for whoever employs them, and `employerRegard` is the only reader. That keeps the poaching predicate literally symmetric instead of symmetric-by-convention.

### Events

```ts
| { type: 'HeroTransferred';   day; heroId; fromRivalId: string; fee: number; balance: number }
| { type: 'HeroPoached';       day; heroId; fromRivalId: string; fee: number; balance: number;
                                    rivalRegardDelta: number; rivalRegardValue: number }
| { type: 'RivalPoachedHero';  day; heroId; toRivalId: string; regardValue: number }
| { type: 'RivalRosterChanged'; day; rivalId; joinedHeroIds: string[]; leftHeroIds: string[] }
| { type: 'TransferRefused';   day; rivalId; heroId; reason: 'regard' | 'coin' | 'rosterFull' | 'heroRegard' }
```

`HeroJoined` (E4) fires after `HeroTransferred` and `HeroPoached`, because the Roster gaining a person is the same fact however they arrived. `CoinChanged.reason` gains `'transfer'` and `'poach'` under the widening rule in [E3 §4](E3-injuries-and-scars.md#4-technical-notes--exact-engine-additions).

### Consequence

One new kind, so a Vignette can sour a Rival without an engine change:

```ts
| { kind: 'rivalRegard'; rivalId?: string; delta: number; reason: string }
//   rivalId absent ⇒ a Rival chosen by the engine's RNG, so content need not name one
```

### Engine API

```ts
export function transferHero(career: Career, rivalId: string, heroId: string): Step
export function poachHero(career: Career, rivalId: string, heroId: string): Step
//   both throw EngineError('NoSuchRival' | 'NoSuchHero' | 'CareerEnded'); every in-world
//   refusal is a TransferRefused event instead
export function league(career: Career): LeagueRow[]
export function employerRegard(career: Career, heroId: string): Regard | undefined
export function isPoachable(regard: Regard, config: GameConfig): boolean   // used in both directions
export function transferFee(hero: Hero, config: GameConfig): number
export function rivalById(career: Career, id: string): Rival | undefined
```

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The two poaching directions drift apart and the symmetry the design rests on quietly breaks | One `isPoachable` predicate and one `moveHero` internal, both used by both directions, with a test that calls the predicate with swapped arguments |
| Poaching is strictly cheaper and therefore always correct | It costs Board access, which is the resource the whole Career runs on: a soured Rival takes up to three Commissions per refresh instead of one. Play a Career before tuning the fee |
| Rival Rosters become a second game the player manages | Rivals are never simulated in detail: they churn once per refresh and run no Beats. If a Rival needs a decision made for it, the scope has slipped |
| The League becomes a score | It is a derived view with no setter. The test asserting no `rank` field exists on any state type is the guard |
| Rival Heroes double Career memory and slow the 200-seed smoke run | Four Rivals × up to 8 Heroes is bounded and small. Measure the smoke run's wall time before and after; if it doubles, cap `rivalRosterMax` rather than adding a lazy representation |
| A save from E4 has Rivals with no Roster and loading is non-deterministic | Population at load draws from the Career's own serialised RNG state, so the same save always produces the same Rosters, and a test loads one twice |
