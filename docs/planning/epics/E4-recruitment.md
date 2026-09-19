# E4 — Recruitment

**Objective:** People turn up asking for work, and how good they are is what your Standing has earned  
**Estimate:** 2–3 days · **Depends on:** E1 · **Implements:** [Design §The Career](../design.md#the-career), [CONTEXT · Standing](../../CONTEXT.md#regard-and-standing) · **Realises:** ADR-0003, ADR-0005  
**Gate:** A Career survives losing half its Roster: Applicants arrive, are accepted, and the Guild keeps working

---

## 0. What lands in E4

- **Applicants** arrive in a batch every `applicantsEveryDays`, sit on offer until they expire, and go away if ignored
- **Standing gates calibre** and nothing else. Regard gets you work; Standing gets you people. Commissions are never gated on Standing
- **Accept or decline:** `acceptApplicant` pays a joining fee and puts them on the Roster; `declineApplicant` sends them away
- **The Roster cap and floor:** twelve is the ceiling; below six, Applicants come twice as often and in larger batches
- **A departed Hero may come back** (E2 left the hook): after a cooldown they may reappear as an Applicant, carrying their Traits and their history

**Deliberately deferred:**

- Negotiating the joining fee against the Guildmaster's Guile — a Guild-side Check worth having, but it needs an interaction model the CLI does not have until E7
- Applicants poached from a Rival (E5 — that is a Transfer, and it is a different transaction)
- Dismissing a Hero you no longer want. The design gives the player no firing mechanic: Heroes leave by Departure, Death or Retirement, and that asymmetry is the point
- Applicant Backgrounds authored per Sphere; the E1 Background pool serves

---

## 1. Stories

### E4-S1 · Standing, and what it gates · 0.5 day

`standing(career)` already exists from E1 and is derived exactly as the architecture §3 says:

```
standing(career) = round(mean(patron.regardForGuild.value) × 10)
```

Patron Regard is clamped to −5..+5, so Standing runs −50..+50. Nothing stores it, nothing else derives from it, and nothing writes to it.

Calibre is the one thing it buys:

```
maxCalibre = 1 + (standing >= config.calibre2Standing ? 1 : 0) + (standing >= config.calibre3Standing ? 1 : 0)
```

and each Applicant in a batch draws a calibre uniformly in `1..maxCalibre`, so high Standing widens the range rather than guaranteeing the top of it.

**Acceptance:**

- [ ] `standing` is unchanged from E1 — E4 adds a reader, never a writer
- [ ] A test walks Patron Regard from −5 to +5 and asserts `maxCalibre` at each step
- [ ] At Standing below `calibre2Standing` no calibre-2 Applicant is ever generated across 200 seeds
- [ ] No Commission, fee or Board decision reads `standing` anywhere in the engine; a test greps the call sites

### E4-S2 · Applicants arrive · 1 day

- On Days where `day % applicantInterval === 0`, a batch of `applicantBatchMin..applicantBatchMax` arrives
- `applicantInterval` is `config.applicantsEveryDays`, or `config.applicantsEveryDaysBelowFloor` when `roster.length < config.rosterFloor`
- Each Applicant is generated from content: a name from `NamePools`, a Background from `content.backgrounds` (which supplies their starting Traits), an age in E3's range, and Stats distributed from `config.calibreStatBudget[calibre]` with each Stat in 1..5
- They expire at `arrivedOn + config.applicantLingerDays`; expiry emits `ApplicantDeclined` with `reason: 'expired'`
- Nothing arrives once the Career has ended

**Acceptance:**

- [ ] Batch arrival is deterministic from the seed and a test pins the ids and calibres of the first three batches
- [ ] Applicant Stats sum to the calibre budget exactly, and no Stat falls outside 1..5
- [ ] Applicants are serialised with the Career and survive a save/load round trip
- [ ] Below the Roster floor the interval halves and the batch is at `applicantBatchMax`, and a test drives the Roster down to prove it
- [ ] Expiry fires on the exact Day and removes them from `career.applicants`
- [ ] `ApplicantsArrived` carries the ids and their calibres so the CLI can render the batch without a second lookup

### E4-S3 · Accept and decline · 0.5–1 day

```ts
acceptApplicant(career, applicantId): Step
declineApplicant(career, applicantId): Step
```

Accepting costs `applicant.askingFee` coin and produces a Hero: same id, same name, Stats, Traits, Background and age, with `joinedOn` set to the current Day, `regardForGuildmaster` at `config.joiningRegard` with the reason recorded, `regardFor` seeded neutral against every current Roster member, and E2's `lastCommittedOn` and `regardDecayedOn` both at `joinedOn`.

**Acceptance:**

- [ ] Accepting at the Roster cap throws `EngineError('RosterFull')`; at `coin < askingFee` throws `EngineError('InsufficientCoin')`; both leave the Career byte-identical
- [ ] An accepted Applicant is gone from `career.applicants` and present in `roster` exactly once
- [ ] `regardFor` is symmetric: every existing Hero gains a neutral Regard for the newcomer in the same step
- [ ] `HeroJoined` follows `ApplicantAccepted` in the same `Step`, and `CoinChanged` reports the fee with `reason: 'recruitment'`
- [ ] Declining removes them and emits `ApplicantDeclined` with `reason: 'player'`
- [ ] Accepting or declining an unknown or expired id throws `EngineError('NoSuchApplicant')`
- [ ] Upkeep the following cycle reflects the larger Roster

### E4-S4 · They come back · 0.5 day

A Hero who walked out (E2) is the most interesting Applicant there is.

- On a batch arrival, each `formerHeroes` entry with `exit.kind === 'departure'` and `day - exit.onDay >= config.returnCooldownDays` has a `config.returnAsApplicantChance` chance to take one of the batch slots
- The Applicant carries `formerHeroId`, their Traits — Scars included — and their age brought forward
- Accepting them sets `regardForGuildmaster` to `config.returningRegard` with the reason recorded, and removes them from `formerHeroes`
- Death and Retirement never return. A test asserts it

**Acceptance:**

- [ ] A departed Hero can return no sooner than the cooldown and a test pins the earliest possible Day
- [ ] A returning Applicant's Scars and Injuries are intact; an unexpired Injury keeps its original `liftsOn`, so they may join injured
- [ ] `ApplicantsArrived` does not distinguish returners; `HeroJoined` carries `formerHeroId` so narration can say who came back
- [ ] The dead and the retired never appear in `career.applicants` across 200 seeds
- [ ] The CLI marks a returning Applicant in the batch listing

---

## 2. Definition of done

- [ ] Standing is derived, never stored, and gates calibre and nothing else
- [ ] An Applicant is a distinct type from a Hero, sharing the value types (ADR-0003); no `isApplicant` flag exists
- [ ] Recruitment is entirely optional: a player who declines everything reaches an ending
- [ ] A Roster driven to zero by E2 and E3 recovers through E4 without a special case
- [ ] Applicant generation is deterministic from the seed, including which formerHero returns
- [ ] Saves from E3 load; a Career without `applicants` takes an empty array
- [ ] Architecture §3, §4, §6 and §7 updated in the same change

---

## 3. Known unknowns — adopted defaults

| Question | Adopted default | Change it if |
| --- | --- | --- |
| Applicant frequency (INPUTS 5.1) | Every 20 Days; every 10 below the Roster floor | Nobody ever turns up when you need them, or the Roster fills itself |
| Standing → calibre (INPUTS 5.2) | Calibre 2 unlocks at Standing 10, calibre 3 at 30; each Applicant draws 1..maxCalibre | Calibre 3 arrives before the player has done anything to deserve it |
| Batch size (INPUTS 5.3) | 2–3, choose any number of them or none | Choosing feels like picking from a catalogue rather than meeting people |
| What calibre *is*, numerically | A Stat budget: 10, 12 or 14 points over four Stats, each 1..5 | A calibre-3 Hero is not visibly better than a calibre-1 one at the table |
| Joining fee | 40 + 40 × calibre, so 80 / 120 / 160 coin | Recruiting is never a real spend against the Hall (E3) |
| Roster cap and floor | Cap 12 (hard), floor 6 (soft — it only changes arrival cadence) | The design's "six to twelve active" stops feeling right in play |
| How long an Applicant waits | 20 Days, so exactly one Board refresh cycle plus a margin | Batches pile up, or vanish before the player looks |
| Does declining cost anything? | No. Declining is free; the cost is the Upkeep you did not take on | Declining everything becomes the dominant strategy |

---

## 4. Technical notes — exact engine additions

### `GameConfig`

```ts
applicantsEveryDays: 20
applicantsEveryDaysBelowFloor: 10
applicantBatchMin: 2; applicantBatchMax: 3
applicantLingerDays: 20
rosterCap: 12; rosterFloor: 6
calibre2Standing: 10; calibre3Standing: 30
calibreStatBudget: { 1: 10; 2: 12; 3: 14 }
applicantFeeBase: 40; applicantFeePerCalibre: 40
joiningRegard: 1
returnCooldownDays: 60
returnAsApplicantChance: 0.25
returningRegard: -1
```

### State

```ts
interface Applicant {
  id: string; name: string; pronouns: Pronouns
  stats: Stats
  background: string                  // a BackgroundDef name; supplies the starting Traits
  traits: HeroTrait[]
  age: number                         // E3
  calibre: 1 | 2 | 3
  askingFee: number
  arrivedOn: number; expiresOn: number
  formerHeroId?: string               // set when this is somebody coming back
}

interface Career { applicants: Applicant[] }                    // addition
interface Hero { formerHeroId?: string }                        // set on a returner, for narration
interface CareerLedger { applicantsSeen: number; applicantsAccepted: number; returners: number }
interface Reckoning { heroesRecruited: number }
```

An `Applicant` is deliberately not a `Hero` with a flag (ADR-0003): a Hero can be committed, injured and killed, and an Applicant can do none of those. They share the value types — `Stats`, `HeroTrait`, `Pronouns` — and nothing else.

### Events

```ts
| { type: 'ApplicantsArrived';  day; applicantIds: string[]; calibres: number[]; expiresOn: number }
| { type: 'ApplicantAccepted';  day; applicantId; heroId; fee: number; calibre: number }
| { type: 'ApplicantDeclined';  day; applicantId; reason: 'player' | 'expired' }
| { type: 'HeroJoined';         day; heroId; name: string; calibre: number; age: number; formerHeroId?: string }
```

`ApplicantAccepted` and `HeroJoined` are both emitted, in that order, and they are not redundant: the first is a transaction (an offer taken, coin paid), the second is a fact about the Roster. E5 emits `HeroJoined` after a Transfer, where no Applicant was ever involved.

`CoinChanged.reason` gains `'recruitment'` under the widening rule stated in [E3 §4](E3-injuries-and-scars.md#4-technical-notes--exact-engine-additions).

### Engine API

```ts
export function acceptApplicant(career: Career, applicantId: string): Step
//   throws EngineError('NoSuchApplicant' | 'RosterFull' | 'InsufficientCoin' | 'CareerEnded')
export function declineApplicant(career: Career, applicantId: string): Step
//   throws EngineError('NoSuchApplicant' | 'CareerEnded')
export function maxCalibre(career: Career): 1 | 2 | 3
export function applicantById(career: Career, id: string): Applicant | undefined
export function standing(career: Career): number                // unchanged from E1
```

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Standing quietly becomes a score the player optimises | It gates one thing and is derived from Patron Regard alone. A test asserts no other engine call site reads it, so the moment somebody gates a fee on it the suite fails |
| The Roster fills with interchangeable calibre-3 Heroes and nobody is missed | Calibre is a Stat budget only. Traits come from Backgrounds and from what happens to them, and the cap of twelve means taking one is choosing not to take another later |
| Recruiting is strictly better than not, so it stops being a decision | The joining fee plus permanent Upkeep is priced against the Hall (E3): a full Roster costs 146 coin per cycle against a 50-coin baseline |
| Returning Heroes are a gimmick that fires once and never again | The cooldown and the chance are both config. If returns never happen in a played Career, raise the chance rather than adding a mechanism |
| An Applicant's Stats read as a spreadsheet row | The CLI shows the Background summary and Traits first, Stats second. Calibre is never printed as stars or a grade |
