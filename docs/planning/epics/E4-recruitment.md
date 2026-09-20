# E4 — Recruitment

**Objective:** People turn up asking for work, and how good they are is what your Standing has earned  
**Estimate:** 2–3 days · **Depends on:** E1 · **Implements:** [Design §The Career](../design.md#the-career), [CONTEXT · Standing](../../CONTEXT.md#regard-and-standing) · **Realises:** ADR-0003, ADR-0005  
**Gate:** A Career survives losing half its Roster: Applicants arrive, are accepted, and the Guild keeps working

**Status:** Built and independently verified 2026-09-19 (DL-19, DL-20). The gate is met by `engine/tests/e4-gate.test.ts`, which takes seed `e4-gate-1`, loses half the starting Roster to a Departure and a Death before the first Day of work, and plays it to its end through the public API under a policy that answers the door. The rules as built are recorded in [DL-19](../00-decision-log.md#dl-19--the-e4-rules-as-built-applicants-drawn-from-a-stream-of-their-own-ids-that-never-repeat-a-flat-calibre-budget-and-a-returner-who-keeps-their-id-and-brings-their-age-forward), which deviates from this file in four places, all named there: `calibreStatBudget` is three flat `GameConfig` numbers rather than the table §4 sketches; a batch draws from a stream derived from the seed and the Day rather than from `career.rng`; `ApplicantDeclined` carries the person's `name` as well as their id; and a returner's calibre is read off the Stats they already have, clamped by Standing. Every acceptance box below is met. Independent verification is recorded in [DL-20](../00-decision-log.md#dl-20--e4-verification-recruiting-is-a-decision-with-a-sweet-spot-a-ledger-that-counts-people-and-four-questions-left-open), which corrects `ledger.returners` to count returners taken on rather than every offer of one (finding C7, fixed in the same change) and measures what recruiting is worth at fleet scale.

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

- [x] `standing` is unchanged from E1 — E4 adds a reader, never a writer (`engine/tests/standing.test.ts`: "is the mean Patron Regard scaled, and is unchanged from E1", computed independently of the engine at every step of the scale; "is derived and never stored: nothing in the Career holds it", over the save document itself; "reads a deep-frozen Career without writing to it", which `maxCalibre` is held to as well. `career.ts`'s `standing` is untouched — see the call-site map below)
- [x] A test walks Patron Regard from −5 to +5 and asserts `maxCalibre` at each step (`engine/tests/standing.test.ts`: "walks Patron Regard from −5 to +5 and answers at every step" — eleven rows of `{ value, standing, calibre }` asserted as one table, so a change anywhere on the scale is visible; "moves with the two thresholds and with nothing else" drives both config fields away from their defaults)
- [x] At Standing below `calibre2Standing` no calibre-2 Applicant is ever generated across 200 seeds (`engine/tests/standing.test.ts`: "never generates a calibre-2 Applicant below calibre2Standing, over two hundred seeds" — 2,000 batches, every calibre asserted to be 1, with the Standing re-checked at the end of each Career so the test cannot pass vacuously by having climbed over the threshold. "clamps somebody coming back to the ceiling Standing has earned" closes the one way round it: a returner's calibre comes from their own Stats and is clamped by Standing too, so the gate has no exception to remember)
- [x] No Commission, fee or Board decision reads `standing` anywhere in the engine; a test greps the call sites (`content/tests/e4-standing-callsites.test.ts`: "is exactly the four places that derive it, report it or gate calibre on it" — a file-to-count map of every call of `standing`/`standingOf` in `engine/src`, asserted whole, so adding *or* removing one fails; "is nobody in the Board, the fee, the Check or anything else that decides work" names the eighteen files that must hold none; "reads a call and not a Rival's own stored Standing" proves the scan is not vacuous and tells `standingOf(career)` from `rival.standing += 1`. Proved to fail by mutation: adding `fee: feeFor(…) + standingOf(draft)` to `board.ts` failed three of the four, and so did gating `postingPatrons` on it. It lives under `content/tests` because ESLint forbids `fs` under `engine/` including its tests — [DL-19](../00-decision-log.md#dl-19) §11)

### E4-S2 · Applicants arrive · 1 day

- On Days where `day % applicantInterval === 0`, a batch of `applicantBatchMin..applicantBatchMax` arrives
- `applicantInterval` is `config.applicantsEveryDays`, or `config.applicantsEveryDaysBelowFloor` when `roster.length < config.rosterFloor`
- Each Applicant is generated from content: a name from `NamePools`, a Background from `content.backgrounds` (which supplies their starting Traits), an age in E3's range, and Stats distributed from `config.calibreStatBudget[calibre]` with each Stat in 1..5
  - **Evidence (independent verification, 2026-09-19):** as built, `distributeStats` clamps each Stat to `config.statMin`..`config.statMax` — the general Stat-generation fields E1 already named — rather than to a literal 1 and 5 written for E4. At the shipped defaults `statMin` is 1 and `statMax` is 5, so this requirement's own numbers are exactly what ships; the requirement sentence above is unchanged.
- They expire at `arrivedOn + config.applicantLingerDays`; expiry emits `ApplicantDeclined` with `reason: 'expired'`
- Nothing arrives once the Career has ended

**Acceptance:**

- [x] Batch arrival is deterministic from the seed and a test pins the ids and calibres of the first three batches (`engine/tests/applicants.test.ts`: "pins the ids and the calibres of the first three batches" and "… where Standing has earned them", the second at Standing 50 so that all three calibres are actually in play; "is deterministic from the seed, and the same Career twice gives the same people"; and "takes no draw from the Career's own generator, so a Commission resolving the same Day is untouched", which plays the same seed with Applicants switched off and on and asserts every other event, and the generator state itself, identical — [DL-19](../00-decision-log.md#dl-19) §1)
- [x] Applicant Stats sum to the calibre budget exactly, and no Stat falls outside 1..5 (`engine/tests/applicants.test.ts`: "has Stats summing to the calibre budget exactly, none of them outside the range", over everybody who turned up in four hundred Days at Standing 50 so that all three budgets are exercised; and "distributes every calibre budget exactly, over six hundred fresh batches", which forces each calibre in turn through the two Standing thresholds. Ten points over four Stats each at least one — the distribution's tightest case — is the calibre-1 arm of both)
- [x] Applicants are serialised with the Career and survive a save/load round trip (`engine/tests/applicants.test.ts`: "survive a round trip, with everything about them intact" and "carry on from where the save left them, on the same path an unsaved Career would take"; `engine/tests/returning.test.ts`: "round-trips with their Traits, their age and the id they left with"; `engine/tests/save.test.ts`'s round-trip corpus now carries a batch on most of its stops, and its one-field-at-a-time corruption sweep covers every path through an Applicant)
- [x] Below the Roster floor the interval halves and the batch is at `applicantBatchMax`, and a test drives the Roster down to prove it (`engine/tests/applicants.test.ts`: "halves the interval and fills the batch once the Roster falls below it" — the same seed at the floor and one Hero short of it, arrivals on Days 20/40/60 against 10/20/30/40/50/60, with every short-handed batch at `applicantBatchMax`; "draws the batch size from the configured range while the Roster is not short-handed" proves both sizes occur above the floor)
- [x] Expiry fires on the exact Day and removes them from `career.applicants` (`engine/tests/applicants.test.ts`: "goes on the exact Day, and is gone from the Career" — still listed on the Day before, gone at the start of the Day itself, with an `ApplicantDeclined` carrying `reason: 'expired'` for each; "moves with the configured span, and nothing else does"; "leaves nobody lingering past their Day over a whole Career")
- [x] `ApplicantsArrived` carries the ids and their calibres so the CLI can render the batch without a second lookup (`engine/tests/applicants.test.ts`: "carries the ids and the calibres, so a front end needs no second lookup" — every id resolved back to the Applicant it names and its calibre, `arrivedOn` and `expiresOn` checked against the event)

### E4-S3 · Accept and decline · 0.5–1 day

```ts
acceptApplicant(career, applicantId): Step
declineApplicant(career, applicantId): Step
```

Accepting costs `applicant.askingFee` coin and produces a Hero: same id, same name, Stats, Traits, Background and age, with `joinedOn` set to the current Day, `regardForGuildmaster` at `config.joiningRegard` with the reason recorded, `regardFor` seeded neutral against every current Roster member, and E2's `lastCommittedOn` and `regardDecayedOn` both at `joinedOn`.

**Acceptance:**

- [x] Accepting at the Roster cap throws `EngineError('RosterFull')`; at `coin < askingFee` throws `EngineError('InsufficientCoin')`; both leave the Career byte-identical (`engine/tests/recruit.test.ts`: "throws RosterFull at the cap, and leaves the Career byte-identical" and "throws InsufficientCoin one coin short, and leaves the Career byte-identical", both compared through `serialiseCareer`, both with the one-more case going through; "is never exceeded, however many offers are taken" drives forty rounds of accepting against a cap of six)
- [x] An accepted Applicant is gone from `career.applicants` and present in `roster` exactly once (`engine/tests/recruit.test.ts`: "takes them out of the batch and puts them on the Roster exactly once", with `applicantById` asked as well as the array read; "produces a Hero with the same id, name, Stats, Traits, Background and age")
- [x] `regardFor` is symmetric: every existing Hero gains a neutral Regard for the newcomer in the same step (`engine/tests/recruit.test.ts`: "seeds Regard both ways in the same step, for every Hero already on the Roster" — both directions asserted whole, against `config.joiningRegardAmongHeroes`, with what the Roster already thought of one another untouched, and the Guildmaster's own map filled too. `engine/tests/returning.test.ts`: "remembers who they used to work with, and meets whoever is new" — somebody coming back keeps every entry they left with)
- [x] `HeroJoined` follows `ApplicantAccepted` in the same `Step`, and `CoinChanged` reports the fee with `reason: 'recruitment'` (`engine/tests/recruit.test.ts`: "reports the offer taken, then the coin, then the Roster gaining a person" — the three event types pinned as a list, in the order [E5-S2](E5-rivals.md) already fixes for its own Transfer, with every field of each checked and every one carrying the same Day)
- [x] Declining removes them and emits `ApplicantDeclined` with `reason: 'player'` (`engine/tests/recruit.test.ts`: "sends them away and says the player did it", the event asserted whole; "costs nothing at all"; "leaves the rest of the batch exactly where it was")
- [x] Accepting or declining an unknown or expired id throws `EngineError('NoSuchApplicant')` (`engine/tests/recruit.test.ts`: "throws NoSuchApplicant for an id nobody is waiting under", which includes a Hero's own id; "throws NoSuchApplicant for somebody who has already given up waiting")
- [x] Upkeep the following cycle reflects the larger Roster (`engine/tests/recruit.test.ts`: "is felt at the next Upkeep, which is larger for the larger Roster" — `upkeepDue` before and after, and then the `UpkeepOwed` the engine's own Day loop actually pays)

### E4-S4 · They come back · 0.5 day

A Hero who walked out (E2) is the most interesting Applicant there is.

- On a batch arrival, each `formerHeroes` entry with `exit.kind === 'departure'` and `day - exit.onDay >= config.returnCooldownDays` has a `config.returnAsApplicantChance` chance to take one of the batch slots
- The Applicant carries `formerHeroId`, their Traits — Scars included — and their age brought forward
- Accepting them sets `regardForGuildmaster` to `config.returningRegard` with the reason recorded, and removes them from `formerHeroes`
- Death and Retirement never return. A test asserts it

**Acceptance:**

- [x] A departed Hero can return no sooner than the cooldown and a test pins the earliest possible Day (`engine/tests/returning.test.ts`: "pins the earliest Day somebody who walked out can be asking again" — gone on Day 1, back on Day **70** and not Day 60, because `60 − 1 = 59` falls one short of the sixty-Day cooldown and a test that only said "after the cooldown" would not have caught it; "is never shortened, on any Day a batch arrives" over four Departure Days; "moves with the configured cooldown and with nothing else"; "never fires at all when the chance is zero, and always when it is one")
- [x] A returning Applicant's Scars and Injuries are intact; an unexpired Injury keeps its original `liftsOn`, so they may join injured (`engine/tests/returning.test.ts`: "keeps their Scars, and an Injury that has not run out keeps its own Day" — a Scar, a live Injury and one that healed while they were away, with the live one's original `liftsOn` carried through acceptance, the Hero left off `availableHeroes` by it, and the `InjuryLifted` landing on its own Day; "brings their age forward by the whole years since they went" and "is never handed the age the seed would have started them at", which is the defect [DL-17](../00-decision-log.md#dl-17) warned of; "may come back carrying a Scar that refuses everything, and the Guild bears it")
- [x] `ApplicantsArrived` does not distinguish returners; `HeroJoined` carries `formerHeroId` so narration can say who came back (`engine/tests/returning.test.ts`: "takes one of the batch's slots rather than adding to it" asserts the event's fields are exactly the five §4 names and nothing more; "says on HeroJoined who it was that came back". `narrate/tests/applicants.test.ts`: "is named as somebody coming BACK, not as somebody arriving", and "is not given away by the batch they arrive in")
- [x] The dead and the retired never appear in `career.applicants` across 200 seeds (`engine/tests/returning.test.ts`: "never appear in career.applicants, across two hundred seeds" — each seed given one of each of the three exits at once and played two hundred Days at `returnAsApplicantChance: 1`, so the one who walked out *does* come back on every seed and the other two never do, and both are still readable in the Guild's history afterwards. `engine/tests/e4-gate.test.ts`'s 200-seed smoke checks the same thing over played Careers, against the Day each of them actually left)
- [x] The CLI marks a returning Applicant in the batch listing (`cli/tests/display.test.ts`: "marks somebody coming back in words, not in colour" — the mark survives with no palette at all, which is the whole point; `cli/tests/e2e.test.ts`'s "the Applicants from the main screen" drives the real process over `--script`. The browser marks them too: `web/tests/applicants.test.tsx`: "marks somebody coming back in text, not in colour alone", and `web/e2e/applicants.spec.ts`: "marks somebody coming back, in text")

---

## 2. Definition of done

- [x] Standing is derived, never stored, and gates calibre and nothing else (`engine/tests/standing.test.ts`, the three tests under "Standing"; `content/tests/e4-standing-callsites.test.ts`, the call-site map, proved to fail by mutation)
- [x] An Applicant is a distinct type from a Hero, sharing the value types (ADR-0003); no `isApplicant` flag exists (`engine/tests/recruit.test.ts`, the "an Applicant is not a Hero" block: "carries none of the fields only somebody on the Roster can have" pins the eleven keys an Applicant has; "has no flag anywhere saying which of the two it is" searches the whole serialised Career and asserts no field of an Applicant is a boolean; "does not type-check as one, in either direction" is a type-level test — the two `@ts-expect-error` lines fail the build the moment the shapes become assignable)
- [x] Recruitment is entirely optional: a player who declines everything reaches an ending (`engine/tests/e4-gate.test.ts`: "lets a player who declines everything reach an ending" over three seeds, with nobody ever taken on; and "lets a player who ignores everything reach the same ending", which is the stronger statement — declining and ignoring produce the *same* Career, to the Day it ends and the coin it ends with, because neither takes a draw from the Career's generator)
- [x] A Roster driven to zero by E2 and E3 recovers through E4 without a special case (`engine/tests/e4-gate.test.ts`: "recovers a Roster driven to zero, without a special case" — everybody walks out on Day 1, Upkeep falls to `upkeepBase`, and the Career recruits its way back and finishes work; "brings Applicants sooner and in larger batches while the Roster is empty" pins the cadence that makes it possible)
- [x] Applicant generation is deterministic from the seed, including which formerHero returns (`engine/tests/applicants.test.ts`: "is deterministic from the seed, and the same Career twice gives the same people"; `engine/tests/returning.test.ts`: the whole file runs on fixed seeds and pins exact return Days. It is deterministic by construction rather than by luck: the stream is derived from `"<seed>:applicants:<day>"` — [DL-19](../00-decision-log.md#dl-19) §1)
- [x] Saves from E3 load; a Career without `applicants` takes an empty array (`engine/tests/save.test.ts`, the "a save written before E4 existed" block: six tests over the nineteen config fields, the four ledger counters, the empty batch, the id counter, loading twice giving the same bytes, the first arrival Day after a load bringing exactly the batch an unbroken Career would have brought, and the Career going on to an ending. "never hands out an id a hand-edited document is already using" covers the counter's fill)
- [x] Architecture §3, §4, §6 and §7 updated in the same change (§3 state, `Applicant`, `Calibre` and the nineteen `GameConfig` fields; §5 the three new rule blocks; §6 the six new API entries and the two new result types; §7 the four new events and `CoinChanged.reason`; §9 both front ends and §10 the three new suites. §4 needed no change: an Applicant's Background and Traits are read from the content shapes that already exist)

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

**As built**, `calibreStatBudget` is three flat fields — `calibreStatBudget1` (10),
`calibreStatBudget2` (12), `calibreStatBudget3` (14) — for the three reasons
[DL-16](../00-decision-log.md#dl-16) §3 gave the Hall's costs, and one more field is
named: `joiningRegardAmongHeroes` (0), what a newcomer and the Roster start out thinking
of one another, which would otherwise be a balance literal in rules code
([DL-19](../00-decision-log.md#dl-19) §§3, 5). Note that `startingHeroes` (4) is below
`rosterFloor` (6), so a Career opens short-handed and the first batch arrives on Day 10.

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
interface CareerLedger {
  applicantsSeen: number; applicantsAccepted: number
  returners: number            // taken back on, counted at acceptApplicant (DL-20 §1)
  returnersOffered: number     // every offer of a returner, taken or not (DL-20 §1)
}
interface Reckoning { heroesRecruited: number }
```

An `Applicant` is deliberately not a `Hero` with a flag (ADR-0003): a Hero can be committed, injured and killed, and an Applicant can do none of those. They share the value types — `Stats`, `HeroTrait`, `Pronouns` — and nothing else.

### Events

```ts
| { type: 'ApplicantsArrived';  day; applicantIds: string[]; calibres: number[]; expiresOn: number }
| { type: 'ApplicantAccepted';  day; applicantId; heroId; fee: number; calibre: number }
| { type: 'ApplicantDeclined';  day; applicantId; name: string; reason: 'player' | 'expired' }
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

// As built, two more read-only selectors, so that neither front end decides for itself
// what "full" or "cannot pay" means (DL-19 §8). E7 §4's dependency list carries all four.
export function acceptRefusal(career: Career, applicantId: string): AcceptRefusal | undefined
export function applicantOffers(career: Career): ApplicantOffer[]
```

`ApplicantDeclined` carries the person's `name` as well as their id — one addition to the
shape above, for the same reason `HeroJoined` carries one: somebody who has gone is gone
from `career.applicants` too, so narration has nothing left to look the id up in.

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Standing quietly becomes a score the player optimises | It gates one thing and is derived from Patron Regard alone. A test asserts no other engine call site reads it, so the moment somebody gates a fee on it the suite fails |
| The Roster fills with interchangeable calibre-3 Heroes and nobody is missed | Calibre is a Stat budget only. Traits come from Backgrounds and from what happens to them, and the cap of twelve means taking one is choosing not to take another later |
| Recruiting is strictly better than not, so it stops being a decision | The joining fee plus permanent Upkeep is priced against the Hall (E3): a full Roster costs 146 coin per cycle against a 50-coin baseline. **As built this is 248 against 88** — [DL-13](../00-decision-log.md#dl-13) §5 raised Upkeep from 12+2 to 20+8 per Hero before E4 existed to be re-priced against it — and the measurement in [DL-19](../00-decision-log.md#dl-19) §12 finds the opposite risk to the one this row names: a Guild that has bought the Hall is *worse* off recruiting to the cap (80.0% of Careers reach Retirement against 60.0%), while a Guild that has not is much better off (32.5% against 48.3%). Not rebalanced here: the pass is deferred past E6 ([DL-15](../00-decision-log.md#dl-15) §3), and `upkeepPerHero` and `rosterCap` are named there as the dials |
| Returning Heroes are a gimmick that fires once and never again | The cooldown and the chance are both config. If returns never happen in a played Career, raise the chance rather than adding a mechanism |
| An Applicant's Stats read as a spreadsheet row | The CLI shows the Background summary and Traits first, Stats second. Calibre is never printed as stars or a grade |

> **Where those tests are now.** E7 restructured the terminal front end and its suite (DL-25, DL-26): `cli/tests/display.test.ts` became `cli/tests/views.test.ts`, `layout.test.ts` and `screen.test.ts`, the screens that ask for a confirming keypress became `cli/tests/confirm.test.ts`, and `cli/tests/saves.test.ts` became `cli/tests/slots.test.ts`. Every assertion cited above moved with the code it covers; none was dropped.
