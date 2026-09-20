# Solution architecture and engine contract

**Companion to:** [design](../design.md), [ADRs](../adr/), [decision log](00-decision-log.md), [epics](epics/README.md) · **Baselined:** 2026-09-19

This document is the contract the packages build to. Where it conflicts with a sketch in an epic file, this document wins; where it is silent, the epic file and then the design apply. Vocabulary is [CONTEXT.md](../../CONTEXT.md), used precisely.

---

## 1. Packages and data flow

```
content/*.toml ──parse──▶ Content ──┐
                                    ├──▶ engine ──events──▶ narrate ──prose──▶ cli / web
player decisions ───────────────────┘        │
                                             └──serialise──▶ save (file or browser storage)
```

| Package | Imports allowed | Forbidden |
| --- | --- | --- |
| `engine` | nothing outside itself | any other workspace; `Math.random`, `Date.now`, `new Date()`, `console`, `fs` |
| `content` | `smol-toml`, `engine` (types and validators only) | `narrate`, `cli`, `web` |
| `narrate` | `engine`, `content` (types) | `cli`, `web`, `Math.random`, `Date` |
| `cli` | anything above | `web` |
| `web` | anything above | `cli` |

All packages are TypeScript, `strict`, ES2022, ESM. Tests are Vitest. Node 22+ is the floor.

## 2. Time

- A **Day** is the atomic unit. `career.day` starts at 1.
- A year is `config.daysPerYear` (360). Retirement falls on Day `careerYears × daysPerYear + 1`.
- Every `config.boardRefreshEveryDays` (10) the Board refreshes. Every `config.upkeepEveryDays` (10) Upkeep falls due. Both fire on Days that are multiples of their interval.

## 3. World state (`Career`)

All ids are opaque strings, unique within a Career. All state is plain JSON-serialisable data; no classes, no functions, no `Date`.

```ts
type Stat = 'Might' | 'Craft' | 'Nerve' | 'Guile'
type Stats = Record<Stat, number>              // each 1–5 in E1
type Pronouns = 'she' | 'he' | 'they'

interface Regard { value: number; reason: string; nature: 'neutral' | 'bond' | 'rivalry' }
//   value is clamped to −5..+5. reason is the last thing that moved it.

interface HeroTrait { name: string; since: number; liftsOn?: number; kind?: TraitKind }
//   name refers to a TraitDef in content. liftsOn set ⇒ timed; absent ⇒ permanent.
//   E3: a Hero holding an Injury cannot be committed, and it is removed at the start of
//   the Day it lifts. E6 closes DL-16 §5: `kind` is copied off the TraitDef at the moment
//   the Trait is given, so a timed Trait that is NOT an Injury — which a Decision's option
//   may give — leaves its holder committable and is never shown as one. A timed Trait with
//   no `kind` is read as an Injury, which is what every save written before E6 means,
//   because E5 gave nobody a timed Trait that was not one (DL-21 §5, DL-23 §10).

interface Person {                              // E5: everything but who employs them
  id: string; name: string; pronouns: Pronouns
  stats: Stats
  age: number                                   // E3: [heroStartingAgeMin, heroStartingAgeMax]
  background: string                            // name of the Background in content
  traits: HeroTrait[]
  calibre: Calibre                              // E5: E4 put it on an Applicant; E5 on the person
  regardFor: Record<string, Regard>             // other Heroes, by id
  joinedOn: number
  lastCommittedOn: number                       // E2: Day of the last commit, not the return
  regardDecayedOn: number                       // E2: Day drift last told
  formerHeroId?: string                         // E4: set on somebody who walked out and came back
  exit?: HeroExit                               // E2: set only on a Hero in formerHeroes
}

interface Hero extends Person {                 // in the player's employ
  regardForGuildmaster: Regard
  regardForRival?: never                        // E5: not merely unset — unsettable
}

interface RivalHero extends Person {            // the same person, on a Rival's Roster
  regardForRival: Regard
  regardForGuildmaster?: never
}

type AnyHero = Hero | RivalHero
//   **A Hero holds Regard for one employer at a time** (E5-S1, DL-21 §3). The two `never`s
//   are what make that a fact the type system knows rather than a convention every rule has
//   to remember: neither shape is assignable to the other, and neither field can be set on
//   the wrong one. `employerRegard(career, heroId)` is the only reader the movement rules
//   use. A person keeps their id, their age, their Traits and their calibre when they cross.

type Calibre = 1 | 2 | 3

interface Applicant {                           // E4. Deliberately not a Hero with a flag (ADR-0003)
  id: string; name: string; pronouns: Pronouns
  stats: Stats
  background: string                            // a BackgroundDef name; supplies the starting Traits
  traits: HeroTrait[]
  age: number
  calibre: Calibre
  askingFee: number
  arrivedOn: number; expiresOn: number
  formerHeroId?: string                         // set when this is somebody coming back
}
//   A fresh Applicant's id is `a<n>` from `career.nextApplicantNumber`, which only ever
//   goes up; somebody coming back keeps the id they left the Roster with, so their id is
//   in `formerHeroes` and `applicants` at once while the offer stands (DL-19 §2).

type HeroExitKind = 'departure' | 'death' | 'retirement'   // widened from E2's one member
interface HeroExit { kind: HeroExitKind; onDay: number; reason: string }
//   A departed Hero keeps their id, which is the formerHeroId an E4 Applicant carries if
//   they come back. `reason` is the last thing that moved their Regard for a Departure,
//   and the engine's own reason for a Death or a Retirement (E3).

interface Guildmaster {
  name: string; pronouns: Pronouns
  stats: Stats; background: string; traits: HeroTrait[]
  regardFor: Record<string, Regard>             // Heroes, by id
  startingStats: Stats                          // for the reckoning
}

interface Patron {
  id: string; name: string; sphere: string     // sphere id from content
  regardForGuild: Regard
}

interface Commission {
  id: string; patronId: string; title: string
  fee: number; difficulty: number               // difficulty is the base DC, 8–15
  spanDays: number; beatCount: number
  postedOn: number; expiresOn: number           // expires at the next Board refresh
}

type BeatResult = 'failure' | 'success' | 'critical'

interface Party {
  id: string; commissionId: string; heroIds: string[]
  backing: number                               // fixed at commit; an answered Decision may move it
  departedOn: number; returnsOn: number
  beatDays: number[]                            // Days on which a Beat fires
  beatsResolved: BeatResult[]
  vignettesUsed: string[]
  decisionUsed: boolean                         // E6: this Commission has stopped to ask once
  dcDelta: number                               // E6: added to every remaining Beat's DC; 0 by default
  pendingWord?: PendingWord                     // E6: set while they are waiting for an answer
  turnedBackOn?: number                         // E6: the Day they were told to come home
}

interface PendingWord {                         // E6-S2. Ids and numbers; the prose is content
  decisionId: string
  beatIndex: number                             // the Beat it displaced; fires when they are answered
  askedOn: number; timesOutOn: number
  slots: { heroId: string; patronId: string; sphereId: string; trait?: string }
  optionIds: string[]                           // every option offered, in authored order (DL-23 §8)
}

interface Rival {                               // E5: E1 modelled the name and Standing only
  id: string; name: string
  standing: number                              // stored: a Rival has no Patrons to derive it from
  roster: RivalHero[]
  regardForGuild: Regard                        // what they make of your Guild
}
//   Deliberately not the same type as the player's Guild (ADR-0003): no Hall, no Board, no
//   coin, no Guildmaster, and none of them addable by a rule that forgot whose Guild it was
//   looking at. A Rival is never simulated — it takes work off the Board and its Roster
//   churns, and it runs no Beats (E5 §0).

interface LeagueRow {                           // E5-S6: a view, never stored
  guildId: string                               // a Rival's id, or 'player'
  name: string; standing: number; rosterSize: number; isPlayer: boolean
}

interface Guild {
  name: string
  guildmaster: Guildmaster
  roster: Hero[]
  formerHeroes: Hero[]                          // Death, Departure, Retirement keep them readable
  coin: number
  hall: HallImprovement[]                       // improvements bought, in order (E3)
}

type HallImprovement = 'infirmary' | 'trainingYard' | 'quarters'

interface Career {
  formatVersion: 1
  seed: string
  config: GameConfig
  rng: [number, number, number, number]
  day: number
  guild: Guild
  patrons: Patron[]
  board: Commission[]
  parties: Party[]
  rivals: Rival[]
  applicants: Applicant[]                       // E4: who is currently at the door
  nextApplicantNumber: number                   // E4: the monotonic id counter (DL-19 §2)
  nextRivalHeroNumber: number                   // E5: the same, for `<rivalId>h<n>` (DL-21 §2)
  ledger: CareerLedger                          // counters for the reckoning
  ended?: CareerEnd
}

interface CareerLedger {
  commissionsCompleted: number; commissionsFailed: number
  commissionsByPatron: Record<string, number>
  peakCoin: number; lastUpkeepNegative: boolean
  departures: number                            // E2: Heroes who walked out over low Regard
  heroesInjured: number; heroesScarred: number  // E3: harm given, counting each one
  heroesDied: number; heroesRetired: number     // E3
  applicantsSeen: number; applicantsAccepted: number                     // E4
  returners: number             // E4: taken back on, counted at acceptApplicant (DL-20 §1)
  returnersOffered: number      // E4: every offer of a returner, taken or not (DL-20 §1)
  heroesTransferredIn: number   // E5: brought over with a Rival's consent, people once each
  heroesPoachedIn: number       // E5: taken off a Rival without it
  heroesPoachedFromUs: number   // E5: taken off your Roster by a soured Rival
  wordsSent: number             // E6: Parties that stopped to ask, counted once each
  turnedBack: number            // E6: Commissions called off part-way through, counted once each
}

interface CareerEnd { reason: 'retirement' | 'insolvency'; onDay: number; reckoning: Reckoning }

interface Reckoning {
  years: number
  heroesOnRoster: number
  heroesLost: number                            // Death and Departure. E3: never Retirement
  heroesRetired: number                         // E3: apart, because it is not a loss
  heroesRecruited: number                       // E4: Applicants taken on, however they arrived
  heroesPoachedFromUs: number                   // E5: reported apart from the losses above
  commissionsCompleted: number; commissionsFailed: number
  favouritePatron?: { id: string; name: string; count: number }
  peakCoin: number; finalCoin: number
  standing: number
  guildmasterStats: { start: Stats; end: Stats }
}
```

**Standing** is derived, never stored on the Guild: `standing(career) = round(mean(patron.regardForGuild.value) × 10)` for the player's Guild. Rivals carry a stored `standing` because they are not simulated. **Nothing anywhere stores a League position**: `league(career)` orders the two together and is a view with no setter, which `content/tests/e5-league-position.test.ts` and `engine/tests/league.test.ts` guard from both sides (E5-S6).

### `GameConfig`

Every tunable is a named field with a default. The config is stored in the save.

```ts
interface GameConfig {
  careerYears: 20; daysPerYear: 360
  boardRefreshEveryDays: 10; boardSizeMin: 4; boardSizeMax: 6
  upkeepEveryDays: 10; upkeepPerHero: 20; upkeepBase: 8       // 4 Heroes ⇒ 88 (DL-13)
  startingCoin: 500
  startingDebt: 0    // E7, DL-25 §1: the design's "a going concern … and a debt". The Guild
                     //   opens at `startingCoin - startingDebt` and `ledger.peakCoin` with
                     //   it; nothing is tracked afterwards, no event is emitted and no draw
                     //   is taken, so at 0 the game is exactly what it was. Read in one
                     //   place, `newCareer`, which a static scan holds it to
  feeMin: 45; feeMax: 115                                     // DL-13
  commissionSpanMin: 5; commissionSpanMax: 10
  beatsMin: 3; beatsMax: 5
  difficultyMin: 8; difficultyMax: 15
  criticalMargin: 9                                           // DL-13
  backingMax: 3; backingMin: -2; backingRegardDivisor: 2       // E2, DL-14
  backingStatDivisor: 2; backingStatOffset: 2                  // DL-15
  rivalTakesPerRefresh: 1
  patronPassedOverAboveRegard: -3; patronRegardRecoveryEveryDays: 60   // DL-13
  patronRegardRecoveryAmount: 1                                       // DL-13; named out of career.ts (invariant 8)
  startingHeroes: 4; patronCount: 5; rivalCount: 4

  // Refusals, drift and Departure (E2, DL-14)
  refusalRegardThreshold: -3        // at or below, a Hero refuses any Commission
  insistenceRegardCost: 2           // a magnitude, applied as a negative delta
  departureRegardThreshold: -5      // at or below, failing the Check loses them
  departureDc: 12                   // the Guildmaster's Guile Check to keep them
  talkedRoundRegardGain: 3          // DL-14: enough to lift them back out of refusing
  regardDecayEveryDays: 30; regardDecayAmount: 1               // a magnitude; 0 switches it off
  regardDecayQuartersFactor: 2      // read since E2; applies only once the Hall holds quarters

  // Harm from a Beat (E3)
  injuryChanceOnFailure: 0.25
  scarChanceOnCriticalFailure: 0.30; deathChanceOnCriticalFailure: 0.03
  injurySpanMin: 15; injurySpanMax: 30

  // Age and Retirement (E3)
  heroStartingAgeMin: 22; heroStartingAgeMax: 40; heroRetirementAge: 55

  // The Hall (E3; three named numbers rather than one table — DL-16 §3)
  hallInfirmaryCost: 200; hallTrainingYardCost: 250; hallQuartersCost: 250
  infirmaryInjuryFactor: 0.5        // multiplies the span of every Injury given afterwards
  trainingYardBacking: 1            // added to every Party's Backing, before the clamp

  // Recruitment (E4; three flat calibre budgets rather than one table — DL-19 §3)
  applicantsEveryDays: 20; applicantsEveryDaysBelowFloor: 10
  applicantBatchMin: 2; applicantBatchMax: 3
  applicantLingerDays: 20
  rosterCap: 12; rosterFloor: 6     // the cap is hard; the floor only changes the cadence
  calibre2Standing: 10; calibre3Standing: 30
  calibreStatBudget1: 10; calibreStatBudget2: 12; calibreStatBudget3: 14
  applicantFeeBase: 40; applicantFeePerCalibre: 40      // 80 / 120 / 160 coin
  joiningRegard: 1                  // what a newcomer thinks of the Guildmaster
  joiningRegardAmongHeroes: 0       // DL-19 §5: named out of `applicant.ts` (invariant 8)
  returnCooldownDays: 60; returnAsApplicantChance: 0.25; returningRegard: -1

  // Rivals, Transfers and the League (E5, DL-21)
  rivalRosterMin: 4; rivalRosterMax: 8
  rivalChurnChance: 0.3; rivalChurnGainChance: 0.5   // the second is churn's direction (DL-21 §10)
  rivalStartingRegard: 0                             // what a Rival makes of you at the start
  rivalHeroRegardMin: -3; rivalHeroRegardMax: 2      // the band one of their Heroes starts at
  transferFeeBase: 100; transferFeePerCalibre: 50    // 150 / 200 / 250 coin
  transferConsentRegard: 0              // a Rival consents at or above this
  transferJoiningRegard: 0              // what a moved Hero makes of their new employer
  poachFeeFactor: 0.5                   // 75 / 100 / 125 coin
  poachRegardThreshold: -2              // the Hero's Regard for their current employer
  poachRivalRegardCost: 3               // E5 §3 adopted −3 over INPUTS 6.3's −5
  retaliationRegardThreshold: -3
  souredRivalThreshold: -3; souredRivalExtraTakes: 1; rivalTakesMax: 3

  // Decisions mid-Commission (E6, DL-23; the chance lowered by the balance pass, DL-24 §B2)
  decisionChancePerBeat: 0.1        // considered at each Beat Day after the first; measured at
                                    //   0.210 words per Commission, one Commission in 4.8
  decisionsPerCommission: 1         // a cap, not a target; 0 switches Decisions off entirely
  wordTimeoutDays: 5
  turnBackTravelDays: 1
  turnBackFeeFactor: 1              // E6 §4's boolean `turnBackPaysProRata` as a number (DL-23 §6)
}
```

**`startingHeroes` (4) is below `rosterFloor` (6)**, so a Career opens short-handed: the
first batch arrives on Day 10 rather than Day 20 and every batch is `applicantBatchMax`
until the Roster reaches the floor. That follows from the two defaults E4 §3 adopted and is
deliberate — the game wants a new Guild to recruit early.

DL-09 named the rest of the fields the rules need; the config the engine ships is the whole
of `defaultConfig`, and every one of them is documented there.

## 4. Content

Parsed from TOML by `content`; validated by `engine`'s `validateContent(unknown): Content`, which throws a `ContentError` naming the file and field.

```ts
interface TraitDef {
  name: string; kind: 'background' | 'disposition' | 'injury' | 'scar'
  summary: string
  modifiers: { stat?: Stat; tags?: string[]; delta: number }[]  // applies when the Beat's Stat matches (if given) and any tag matches (if given)
  backing?: number                                              // Guildmaster-only contribution to Backing
  refusal?: { tags?: string[]; minDifficulty?: number }         // E2: present ⇒ the Trait can refuse
  //   Both fields absent ⇒ it refuses every Commission; otherwise tags intersecting the
  //   Commission's, or minDifficulty being reached, is enough. The summary is what a front
  //   end prints to explain the refusal, so it has to read as a reason, not as a label.
}

interface BackgroundDef { name: string; traits: string[]; summary: string }

interface SphereDef {
  id: string; name: string
  patronNames: string[]
  commissionTitles: { title: string; difficulty: number; tags: string[] }[]
}

interface NamePools { heroFirst: string[]; heroEpithets: string[]; guildNames: string[]; rivalNames: string[] }

interface Vignette {
  id: string; name: string
  stat: Stat; difficulty: number; weight: number
  tags: string[]
  conditions: { minBeat?: number; maxBeat?: number; spheres?: string[]; requiresTrait?: string; tags?: string[] }
  slots: { hero: 'any' | `with_trait:${string}` | `highest:${Stat}` | `lowest:${Stat}` }
  outcomes: Record<BeatResult, { narrative: string; consequences: Consequence[] }>
}

type Consequence =
  | { kind: 'coin'; delta: number }
  | { kind: 'patronRegard'; delta: number; reason: string }
  | { kind: 'heroRegardForGuildmaster'; delta: number; reason: string }
  | { kind: 'trait'; trait: string; days?: number }             // gives the slot Hero a Trait; days ⇒ Injury (E3 lifts it)
  | { kind: 'score'; delta: number }                            // adjusts the Commission's running score
  | { kind: 'rivalRegard'; rivalId?: string; delta: number; reason: string }   // E5
  | { kind: 'backing'; delta: number }                                        // E6
//   `rivalId` is optional because content cannot name a Rival: Rivals are generated and their
//   ids exist only inside a Career. Left out, the engine picks one — from a stream derived
//   from the seed and the Beat, never from `career.rng` — so authoring a Vignette that can
//   sour a Rival cannot reshuffle the Beats of a Career that never fires it (DL-21 §1). A
//   named id the Career does not hold does nothing at all.
//   `backing` moves the Backing fixed at commit, clamped as any Backing is. It is valid in a
//   Vignette's outcome and in a Decision option's `consequences` alike, because an option's
//   `effect` and a Vignette's outcome speak one vocabulary (E6 §4).

interface DecisionDef {                         // E6-S1. One per file, decisions/*.toml
  id: string; name: string; weight: number
  tags: string[]
  conditions: VignetteConditions                // exactly a Vignette's shape, and the same selector
  slots: { hero: HeroSlotRule }                 // exactly a Vignette's, and the same filler
  prompt: string                                // prose; filled by narrate
  options: DecisionOption[]
}

type DecisionOptionKind = 'pressOn' | 'sendCoin' | 'turnBack'   // closed, owned by the engine

interface DecisionOption {
  id: string                                    // kebab-case
  kind: DecisionOptionKind
  label: string                                 // prose; filled by narrate
  cost?: number                                 // coin. Required on sendCoin
  requires?: { minCoin?: number }               // re-checked at the moment of answering (DL-23 §8)
  default?: boolean                             // exactly one per Decision; taken on the timeout, and
                                                //   it may carry neither a cost nor a requires, so
                                                //   the Guild can always take it (DL-23 §3)
  consequences: Consequence[]
  effect?: { backingDelta?: number; dcDelta?: number; beatsRemainingDelta?: number }
}

interface Content { traits: TraitDef[]; backgrounds: BackgroundDef[]; spheres: SphereDef[]; names: NamePools; vignettes: Vignette[]; decisions: DecisionDef[] }
//   `decisions` is empty in a content set that ships none, which is complete rather than
//   broken: a Commission with nothing eligible simply never stops to ask (E6-S2).
```

Vignette TOML shape (one file per Vignette):

```toml
id = "night-attack"
name = "Night attack"
stat = "Nerve"
difficulty = 11
weight = 3
tags = ["danger", "camp"]

[conditions]
min_beat = 2
tags = ["escort", "wilds"]        # fires only on Commissions carrying one of these tags

[slots]
hero = "lowest:Nerve"

[outcomes.failure]
narrative = "Something moves beyond the firelight. {hero} freezes, knife in hand, and by the time {hero.they} {hero.moves} the packs are gone."
consequences = [{ kind = "coin", delta = -15 }]

[outcomes.success]
narrative = "{hero} is awake before the others and meets the first of them at the tree line. It is short and ugly and it is enough."
consequences = []

[outcomes.critical]
narrative = "{hero} lets them come all the way in, then closes the trap. Two of the Patron's missing crates are among what they drop."
consequences = [{ kind = "patronRegard", delta = 1, reason = "recovered the lost crates" }]
```

Decision TOML shape (one Decision per file, under `content/decisions/`). `prompt` sits with
the other top-level keys and **above** `[conditions]`, because a bare key written after a
table header belongs to that table:

```toml
id = "the-guide-wants-more"
name = "The guide wants more"
weight = 3
tags = ["escort", "wilds"]

prompt = "A runner comes back down the road with word. The guide has stopped at the ford and will not go on for what was agreed. {hero} wants to know what the Guild wants done."

[conditions]
min_beat = 2
tags = ["escort", "wilds", "water"]        # exactly a Vignette's conditions, and the same selector

[slots]
hero = "highest:Guile"

[[options]]
id = "press-on"
kind = "pressOn"
label = "Tell them to go on without him."
default = true                             # exactly one per Decision, and it costs nothing
consequences = [{ kind = "score", delta = -1 }]
effect = { dc_delta = 1 }

[[options]]
id = "send-coin"
kind = "sendCoin"
label = "Send forty coin up the road and settle it."
cost = 40
requires = { min_coin = 40 }
consequences = []
effect = { backing_delta = 1 }

[[options]]
id = "turn-back"
kind = "turnBack"                          # every Decision carries one
label = "Bring them home. The crossing is not worth it."
consequences = [{ kind = "patronRegard", delta = -1, reason = "came home without finishing" }]
```

`requires` and `effect` are snake_case on disk and camelCase in the contract, exactly as
`[conditions]` is, and the `content` package maps them with the same kind of named-field
error for a key that is not one.

**The `default` should be the option that keeps the Commission going** — a `pressOn`, as all
three shipped Decisions' are. The default is what a Party takes when nobody answers, so it is
what happens to a player who looked away: making it the `turnBack` would call the Commission
off over their shoulder, forfeit most of the fee and dock the Patron's Regard, all for a
moment's inattention. `validateContent` does **not** refuse it — that is a rule for the owner
to set, recorded as an open question in DL-24 — so it is a convention an author keeps rather
than one the engine enforces. What the validator does enforce is that the default carries
neither a `cost` nor a `requires`, so the Guild can always afford what the timeout takes
(DL-23 §3).

Narrative tokens, filled by `narrate`: `{hero}`, `{hero.they}`, `{hero.them}`, `{hero.their}`, `{hero.is}`, `{hero.has}`, `{hero.moves}` (verb agreement: they move / she moves), `{patron}`, `{sphere}`, `{guildmaster}`, `{commission}`, `{trait}` (the requiresTrait or with_trait name if any). Unknown tokens are a content validation error.

## 5. Rules

**Note.** DL-09 and DL-11 record additions and clarifications made while building E1 against this
contract; DL-13 records balance adjustments made during E1's balance pass; DL-14 records the rules
E2 added and the one place it amends this section — Backing, below; DL-15 names two more Backing
constants that independent verification of E2 found still inline; DL-16 records the rules E3 added;
DL-19 records the rules E4 added, and the three places it deviates from the E4 epic file;
DL-21 records the rules E5 added, and where it deviates from the E5 epic file.

**Check.** `roll = d20`, `total = roll + hero.stats[stat] + traitModifiers + party.backing`. `critical` if `total ≥ dc + config.criticalMargin`; `success` if `total ≥ dc`; else `failure`. `dc = vignette.difficulty + (commission.difficulty − 11)` clamped to 5..20, so hard Commissions make every Beat harder.

**Trait modifiers.** Sum of `delta` over the Hero's Traits whose modifier matches: `stat` absent or equal to the Beat's Stat, and `tags` absent or intersecting the Vignette's tags.

**Backing.** Computed once at commit, in three terms (E2, DL-14 — this supersedes E1's two-term
form and its "Regard does not yet contribute" note):

```
statTerm   = clamp(round((gm.Nerve + gm.Guile) / config.backingStatDivisor) − config.backingStatOffset, 0, config.backingMax)
traitTerm  = Σ gm.traits[].backing
regardTerm = round(mean(member.regardForGuildmaster.value) / config.backingRegardDivisor)
hallTerm   = config.trainingYardBacking when the Hall holds trainingYard, else 0   (E3)
backing    = clamp(statTerm + traitTerm + regardTerm + hallTerm, config.backingMin, config.backingMax)
```

Backing can therefore be **negative**: a Party that resents the Guildmaster is worse at the work.
`backingMax` is the ceiling on the whole of it, not on `statTerm` alone. An empty Party contributes
a `regardTerm` of zero rather than dividing by nothing. The Guildmaster's Regard *for* the Heroes
is not read; only theirs for them. `backingStatDivisor` and `backingStatOffset` were named in
DL-15: E2 named the Regard term's own constants but left `statTerm`'s divisor and offset as the
inline `2`s architecture always showed here, which CLAUDE.md invariant 8 makes a defect.

**Refusal.** A Hero declines a Commission for exactly two reasons, in this order: their
`regardForGuildmaster.value <= config.refusalRegardThreshold` (`reason: 'regard'`), or one of their
Traits carries a `refusal` that matches this Commission (`reason: 'trait'`, naming the Trait).
Regard wins where both apply, so narration blames the relationship. A `refusal` with neither `tags`
nor `minDifficulty` refuses everything; otherwise its `tags` intersecting the Commission's **or**
its `minDifficulty` being reached is enough. Refusal is data: a refusing Trait is a content edit.

**Insistence.** `commitParty` with refusals outstanding and no `insist` throws
`EngineError('HeroRefused')` and touches nothing. With `{ insist: true }` each refusing Hero is
charged `config.insistenceRegardCost` Regard, reported as `CommissionRefused` then
`HeroRegardForGuildmasterChanged` then `InsistenceApplied`, in the order the Heroes were named —
and **then** the Party's Backing is computed, so insisting visibly weakens the Party it creates.
Non-refusing members are untouched. `insist: true` with no refusals is legal and does nothing.

**Regard drift.** Evaluated at each Board refresh, before the Departure check. A Hero for whom
`day − max(lastCommittedOn, regardDecayedOn) >= config.regardDecayEveryDays × quartersFactor` loses
`config.regardDecayAmount` and has `regardDecayedOn` set to the current Day. `quartersFactor` is
`config.regardDecayQuartersFactor` when the Hall holds `quarters` and 1 otherwise, which is 1 for
the whole of E2 because E3 sells the improvement. Heroes away on a Commission do not drift.
`lastCommittedOn` is set at the commit, not at the return. Drift carries no event of its own: it is
a `HeroRegardForGuildmasterChanged` with a distinguishing reason.

**Departure.** At each Board refresh, every Hero at or below `config.refusalRegardThreshold` — the
wider band, DL-14 — is checked: `d20 + gm.stats.Guile + gm trait modifiers` against
`config.departureDc`. Passing gains them `config.talkedRoundRegardGain`, enough to lift them back
above the refusing line so they can be sent out and earn the rest themselves. Failing loses them
only if they are also at or below `config.departureRegardThreshold`: the Hero moves to
`guild.formerHeroes` with an `exit`, `ledger.departures` increments, and `HeroDeparted` carries the
Regard value that caused it. A Hero away on a Commission is skipped and settled on their return
Day, after the `PartyReturned` that closes the work; nobody is checked twice on the same Day. A
Roster emptied by Departure is survivable: Upkeep falls to `config.upkeepBase` and `advance` runs on.

**Harm from a Beat (E3).** A failed Check may cost the slot Hero something, and a badly
failed one may cost them a great deal. Critical failure is **not** a fourth `BeatResult`:
`injuryOutcome(total, dc, config)` classifies the margin the Check already produced as
`'none'` (`total >= dc`), `'critical'` (`total <= dc − config.criticalMargin`) or `'injury'`
(every failure between). **Authored harm wins**: an outcome carrying a `trait` Consequence
has said what happens, and the engine adds nothing. Otherwise a plain failure gives an
Injury with probability `config.injuryChanceOnFailure`, and a critical failure gives Death
with `config.deathChanceOnCriticalFailure` — checked **first**, so the rare case is not
swallowed — or else a Scar with `config.scarChanceOnCriticalFailure`. The Trait is drawn
evenly from `content.traits` of that `kind`, excluding ones the Hero already holds; an
Injury's span is `[injurySpanMin, injurySpanMax]`, shortened by the infirmary. One harm per
Beat. A Hero who dies leaves the Roster *and* their Party, so later Beats cannot draw them;
a Party with nobody left comes home that Day with `succeeded: false` and no fee.

**Injuries lift (E3).** At the start of each Day every Trait whose `liftsOn` has arrived is
removed. An Injury reports `InjuryLifted` alone and never a paired `TraitLifted`. An
injured Hero is excluded from `availableHeroes`, and naming one is `HeroNotAvailable` from
both `proposeParty` and `commitParty`.

**Age and Retirement (E3).** Every Hero carries an `age`, generated in
`[heroStartingAgeMin, heroStartingAgeMax]` from a stream derived from the Career's seed and
the Hero's id rather than drawn from `career.rng` (DL-16 §1). On every Day where
`day % daysPerYear === 0` each Hero on the Roster ages one year, at home or away. A Hero
who has reached `config.heroRetirementAge` retires at the next Board refresh — never
mid-Commission; one away on work retires on their return Day, on E2's cadence.
`HeroRetired` carries `age` and `yearsServed = round((day − joinedOn) / daysPerYear)`.
Retirement is settled **before** drift and before the Departure check, so a Hero old enough
for it leaves well rather than being soured and then lost.

**The Hall (E3).** `improveHall(career, improvement)` spends coin on one of three
improvements, each bought once, on any Day. The **infirmary** multiplies the span of every
Injury given afterwards by `config.infirmaryInjuryFactor`, rounded up, and shortens none
already borne; the **training yard** adds `config.trainingYardBacking` to every Party's
Backing, before the clamp; the **quarters** multiply the idle threshold Regard drift runs
against by `config.regardDecayQuartersFactor`.

**Decisions mid-Commission (E6).** At each Beat Day **after a Commission's first**, and at
most once per Commission (`party.decisionUsed`, gated by `config.decisionsPerCommission`), a
Decision is considered: `config.decisionChancePerBeat` of the time one fires, chosen from
those whose conditions hold by weight, exactly as a Vignette is. Whether it fires, which one
and who its slot Hero is are drawn from a stream derived from `"<seed>:decision:<partyId>:<beatIndex>"`
and **never** from `career.rng`, so a Career in which none fires is bit for bit the Career it
was before E6 (DL-23 §2). A Commission with no eligible Decision never stops; there is no
relaxed second pass, because a Beat must be filled and a Decision need not be.

When one fires the Day's Beat is **not** resolved, `party.pendingWord` is set and
`PartyAwaitingWord` is emitted. The Party then stands still — no Beat of its Commission
fires and it does not come home — until it is answered. A single `advance` or
`advanceUntilAttention` **stops on that Day**, having simulated up to and including it; a
**later** call runs on past it, the rest of the world carrying on, until `timesOutOn`, when
the Decision's `default` is taken and `PartyAnswered { byDefault: true }` is emitted. That
pair is what makes "a Career never deadlocks" true under any caller, including an automatic
policy that knows nothing about answering (DL-23 §3).

`answerParty` resolves the displaced Beat that Day, so `beatCount` is honoured; what is left
of the work is spread over the Days that are left, and `returnsOn` moves only as far as it
must to leave room for it. `pressOn` applies the option's consequences and `effect`;
`sendCoin` pays `cost` first (`CoinChanged` reason `'sendCoin'`); `turnBack` drops the
remaining Beats — so no further harm can reach anybody — sets `returnsOn` to
`day + turnBackTravelDays`, and the Party comes home through `PartyReturned` like any other,
with `succeeded: false` and a fee of `max(0, round(fee × turnBackFeeFactor × score / beatCount))`.
There is no second return path, which is what gives a turned-back Party E3's Retirement,
E2's Departure Check and E5's retaliation on the Day it arrives, and its place in the next
refresh's drift (DL-23 §5). `effect.dcDelta` accumulates on `party.dcDelta` and shifts every
remaining Beat's DC; `effect.backingDelta` moves the Party's fixed Backing within its clamp;
`effect.beatsRemainingDelta` lengthens or shortens the run, never below the Beats already
resolved plus the one being answered.

**Vignette selection.** At each Beat Day: candidates are Vignettes whose conditions hold (beat index within min/max, sphere matches if given, Commission tags intersect if given, a Party member has `requiresTrait` if given), preferring ones not yet used on this Commission when any remain; pick by weight. If no candidate exists, fall back to any Vignette whose only failing condition is `tags`. If still none, throw `ContentError` — the starter set must make this unreachable and a test proves it.

**Slot hero.** `any` picks uniformly among the Party; `with_trait:X` picks among members holding X, else any; `highest:Stat`/`lowest:Stat` pick the extreme, ties broken by RNG.

**Commission score.** Each Beat adds `+2` critical, `+1` success, `−1` failure (the engine does this; a Vignette adds a `score` consequence only for an exceptional outcome, never to repeat the per-Beat increment — DL-13). On return, `succeeded = score ≥ ceil(beatCount / 2)`. Success pays the fee, Patron Regard +1, and counts for the favourite Patron; failure pays nothing and Patron Regard −1.

**Board refresh (restated in its E5 form).** Unclaimed Commissions: `config.rivalTakesPerRefresh`
plus `config.souredRivalExtraTakes` for each Rival at or below `config.souredRivalThreshold`,
clamped to `config.rivalTakesMax`, are taken by Rivals — **a soured Rival preferred as the
taker** — and the rest expire. Each take is a `CommissionTakenByRival`, that Rival's Standing
rises by `rivalStandingPerCommission`, and that Patron's Regard falls by
`patronRegardOnPassedOver` with reason "you passed on their work", applied only while that
Patron's Regard is above `patronPassedOverAboveRegard` (DL-13). **With nobody soured this is
E1's rule to the draw**: the count takes no draw, and preferring a soured Rival is a narrower
pool for the one `pick` the taker already cost, never an extra one — so a Career in which no
Rival has been wronged unfolds exactly as it did before E5 (E5-S5, DL-21 §6). Negative Patron Regard recovers by `patronRegardRecoveryAmount` (default +1) every `patronRegardRecoveryEveryDays` with reason "time passed" (DL-13). The Board is refilled to a size in `[boardSizeMin, boardSizeMax]` from Patrons whose Regard is above −4, weighting Patrons with higher Regard. A Patron at −5 posts nothing.

**Upkeep.** `upkeepBase + upkeepPerHero × roster.length`, deducted whether anyone worked. If coin < 0 at this Upkeep and `ledger.lastUpkeepNegative` was already true, the Career ends in insolvency.

**Applicants (E4).** Settled at the **start** of each Day, after Injuries lift and the
Roster ages and before any Beat: whoever has reached their `expiresOn` goes first, with
`ApplicantDeclined` and `reason: 'expired'`, and then a batch arrives if one is due. A
batch is due when `day % interval === 0`, where `interval` is
`config.applicantsEveryDaysBelowFloor` while `roster.length < config.rosterFloor` and
`config.applicantsEveryDays` otherwise; below the floor a batch is always
`applicantBatchMax`, and otherwise it is drawn in `[applicantBatchMin, applicantBatchMax]`.
Every draw a batch takes — its size, which former Hero returns, each calibre, name,
Background and set of Stats — comes from a stream derived from `"<seed>:applicants:<day>"`
rather than from `career.rng`, exactly as `startingAge` derives an age (DL-19 §1), so
arrival is deterministic from the seed and ignoring a batch changes nothing else in the
world. Each Applicant draws a calibre uniformly in `1..maxCalibre(career)` and their four
Stats are distributed to `calibreStatBudget<n>` within `statMin`..`statMax`; their age is
`startingAge(seed, id, config)`; their fee is
`applicantFeeBase + applicantFeePerCalibre × calibre`. Nothing arrives once the Career has
ended, because neither advancing call ever steps a Day of one.

**Somebody coming back (E4).** On a batch arrival every `formerHeroes` entry whose
`exit.kind` is `'departure'` and for whom `day − exit.onDay >= config.returnCooldownDays`
has a `config.returnAsApplicantChance` chance of taking one of the batch's slots. They come
back under the id they left with, carrying their Traits and their Scars; an Injury whose
`liftsOn` has passed healed while they were away and is dropped, and one that has not keeps
its original `liftsOn`, so they may join injured. Their `age` is the age they left with plus
`floor((day − exit.onDay) / daysPerYear)`, set explicitly and never re-derived. Their
calibre is the highest budget their Stat total reaches, clamped to `maxCalibre` like
anybody else's. Death and Retirement never return.

**Rivals (E5).** Each Rival is generated with `rivalRosterMin`..`rivalRosterMax` Heroes from a
stream derived from `"<seed>:<rivalId>"`, never from `career.rng`; their calibre is drawn
against that Rival's **stored** Standing by E4's rule, their age from `"<seed>:age:<id>"`, and
their id is `<rivalId>h<n>` from `career.nextRivalHeroNumber`. A Rival's Hero ages at year
boundaries and retires at `heroRetirementAge` exactly as yours does, emitting `HeroRetired`
and leaving that Roster — and the world, because `guild.formerHeroes` is the player's own
history (DL-21 §8).

**Transfers and Poaching (E5).** `transferHero` costs
`transferFeeBase + transferFeePerCalibre × calibre` and needs the Rival's consent, which is
`rival.regardForGuild.value >= transferConsentRegard`; their Regard is untouched by it.
`poachHero` costs `round(transferFee × poachFeeFactor)`, needs no consent, is legal only while
`isPoachable(hero.regardForRival, config)` — that is, at or below `poachRegardThreshold` — and
costs that Rival `poachRivalRegardCost` Regard with the reason recorded. **Every in-world
refusal is a `TransferRefused` event and a Career byte-identical to the one passed in**; only
an unknown id or an ended Career throws. Where several refusals hold, the order reported is
`regard`, `heroRegard`, `rosterFull`, `coin`.

**Retaliation and churn (E5).** At each Board refresh, after Retirement, drift and the
Departure Check have settled the player's Roster: every Rival's Hero who has reached
`heroRetirementAge` retires; then every Rival at or below `retaliationRegardThreshold` whose
own Roster is below `rivalRosterMax` attempts one poach against your Roster, by the same
`isPoachable` predicate applied the other way, worst Regard first and ties by id, paying you
nothing; then each Rival churns with probability `rivalChurnChance`, gaining or losing one
person within `rivalRosterMin`..`rivalRosterMax` — gaining somebody made as their opening
Roster was made, losing whoever thought least of them. A Hero away on a Commission is not
taken mid-Commission: the attempt is deferred to their return Day, on E2's cadence (DL-14 §4).
Churn draws from `"<seed>:rival-churn:<day>"`; retaliation draws nothing at all.

**Every Hero movement runs through one internal `moveHero`** — a Transfer, a Poaching, a
Rival's retaliation and an Applicant taken on — which removes them from wherever they were and
from `formerHeroes`, gives them Regard for their new employer and none for the old one, seeds
`regardFor` both ways with `??=` against the destination Roster, fills the Guildmaster's own
map, and sets `joinedOn`/`lastCommittedOn`/`regardDecayedOn` to the current Day.

**Accepting (E4).** `acceptApplicant` pays `applicant.askingFee` and produces a Hero with
the same id, name, Stats, Traits, Background and age, `joinedOn`/`lastCommittedOn`/
`regardDecayedOn` at the current Day, `regardForGuildmaster` at `config.joiningRegard` —
or `config.returningRegard` for somebody coming back, who is also removed from
`formerHeroes` — and `regardFor` seeded at `config.joiningRegardAmongHeroes` in **both**
directions against every Hero already on the Roster. A returner keeps every `regardFor`
entry they left with. The Roster may never exceed `config.rosterCap`, and there is no
firing mechanic: a place taken is a place taken until somebody leaves.

**The Guildmaster's Retirement.** When `day` reaches `careerYears × daysPerYear + 1`, the Career ends in retirement with the reckoning. `advance` never steps past the end. This is the Career ending, and is distinct from a Hero's own Retirement above.

## 6. Engine API

All functions are pure. `Career` in, `{ career, events }` out. Inputs are never mutated.

```ts
export function newCareer(seed: string, content: Content, config?: Partial<GameConfig>): Step
export function advance(career: Career, days: number, content: Content): Step
//   Runs Day by Day, resolving Beats, returns, Upkeep and refreshes; stops early if the Career ends.
export function advanceUntilAttention(career: Career, content: Content, maxDays?: number): Step
//   Stops after the first Day on which a Party returns, the Board refreshes, Applicants
//   arrive, or the Career ends (E4; DL-19 §4). Invisible at the shipped defaults, because
//   every arrival Day is already a Board-refresh Day; it becomes visible for any
//   `applicantsEveryDays` that is not a multiple of `boardRefreshEveryDays`.
export function proposeParty(career: Career, commissionId: string, heroIds: string[], content: Content): PartyProposal
//   E2. Pure: what this Party would be, asked without committing to it. Throws the same
//   codes commitParty does, so asking and deciding are refused for the same reasons.
export function commitParty(career: Career, commissionId: string, heroIds: string[], content: Content,
                            options?: { insist?: boolean }): Step
//   Throws EngineError('CommissionNotOnBoard' | 'HeroNotAvailable' | 'EmptyParty' | 'CareerEnded'
//   | 'HeroRefused'). HeroRefused is thrown before anything is copied, so the Career is untouched.
export function serialiseCareer(career: Career): string
export function deserialiseCareer(text: string, content?: Content): Career
//   throws SaveError on any mismatch. `content` is optional and is E5's: with it, a Rival
//   written before Rivals had people is given a Roster at load, deterministically from a
//   stream derived from the seed and that Rival's id. Without it the Career loads exactly as
//   before and is populated at the first `advance`, before a Day is stepped (DL-21 §13).
export function validateContent(raw: unknown): Content          // throws ContentError
export function standing(career: Career): number
export function availableHeroes(career: Career): Hero[]         // not away, and not injured (E3)
export function injuredHeroes(career: Career): Hero[]           // E3
export function isInjured(hero: Hero): boolean                  // E3. True while a Trait of theirs carries `liftsOn`
export function injuredUntil(hero: Hero): number | undefined    // E3. The Day their last Injury lifts, or none carried
export function heroById(career: Career, id: string): Hero | undefined
export function commissionById(career: Career, id: string): Commission | undefined
export function improveHall(career: Career, improvement: HallImprovement): Step
//   E3. Throws EngineError('InsufficientCoin' | 'AlreadyImproved' | 'CareerEnded'), and
//   every rejection leaves the Career byte-identical to the one it was given.
export function acceptApplicant(career: Career, applicantId: string): Step
//   E4. Throws EngineError('NoSuchApplicant' | 'RosterFull' | 'InsufficientCoin' |
//   'CareerEnded'); every rejection leaves the Career byte-identical. Emits
//   ApplicantAccepted, then CoinChanged (reason 'recruitment'), then HeroJoined.
export function declineApplicant(career: Career, applicantId: string): Step
//   E4. Throws EngineError('NoSuchApplicant' | 'CareerEnded'). Declining is free.
export function maxCalibre(career: Career): Calibre
//   E4. The best calibre this Guild's Standing reaches. The only thing Standing buys.
export function applicantById(career: Career, id: string): Applicant | undefined
export function acceptRefusal(career: Career, applicantId: string): AcceptRefusal | undefined
//   E4. Why this Applicant cannot be taken on today, or undefined when they can. The
//   `code` is the very EngineErrorCode `acceptApplicant` would throw (DL-19 §8).
export function applicantOffers(career: Career): ApplicantOffer[]
//   E4. Every Applicant waiting, with the Days they have left and that same refusal.
export function applicantInterval(career: Career): number
//   E4. How often a batch is due as the Roster stands: applicantsEveryDaysBelowFloor
//   below rosterFloor, applicantsEveryDays otherwise.
export function calibreStatBudget(calibre: Calibre, config: GameConfig): number
//   E4. The Stat total a fresh Applicant of this calibre is generated against.
export function applicantFee(calibre: Calibre, config: GameConfig): number
//   E4. What an Applicant of this calibre asks for: applicantFeeBase + applicantFeePerCalibre × calibre.
export function calibreOfStats(total: number, config: GameConfig): Calibre
//   E4. The calibre a Stat total already earns — the highest budget it reaches. Used for a
//   returner, whose Stats are theirs and are not generated again (DL-19 §7).
export function injuryOutcome(total: number, dc: number, config: GameConfig): 'none' | 'injury' | 'critical'
//   E3. A pure margin classifier; the RNG draws are the caller's, so it stays table-testable.
export function hallCost(improvement: HallImprovement, config: GameConfig): number
export function startingAge(seed: string, heroId: string, config: GameConfig): number

// ── Rivals, Transfers and the League (E5) ───────────────────────────────────
export function transferHero(career: Career, rivalId: string, heroId: string): Step
export function poachHero(career: Career, rivalId: string, heroId: string): Step
//   Both throw EngineError('NoSuchRival' | 'NoSuchHero' | 'CareerEnded'); every in-world
//   refusal is a TransferRefused event and a byte-identical Career instead. On success:
//   HeroTransferred | HeroPoached, then CoinChanged ('transfer' | 'poach'), then HeroJoined.
export function league(career: Career): LeagueRow[]
//   Pure. Ordered by Standing descending, ties by name. Your row is marked and is not
//   special-cased in the ordering.
export function employerRegard(career: Career, heroId: string): Regard | undefined
//   What this person makes of whoever employs them. The only reader the movement rules use.
export function isPoachable(regard: Regard, config: GameConfig): boolean
//   One predicate, used in both directions, which is what makes the symmetry literal.
export function transferFee(hero: AnyHero, config: GameConfig): number
export function poachFee(hero: AnyHero, config: GameConfig): number
export function rivalById(career: Career, id: string): Rival | undefined
export function rivalHeroById(career: Career, heroId: string): { rival: Rival; hero: RivalHero } | undefined
export function souredRivals(career: Career): Rival[]
export function hasRoomForAnother(rival: Rival, config: GameConfig): boolean
//   E5. Whether their own Roster has room for anybody else. `retaliate`'s own guard: a
//   wronged Guild already at `rivalRosterMax` can take nobody off yours (DL-21 §7, DL-22 §2).
export function retaliationRisks(career: Career): RetaliationRisk[]
//   E5 (DL-22 §2). Who on YOUR Roster another Guild could take as things stand, and by
//   whom — worst Regard first, ties by id, somebody away on a Commission listed because
//   their attempt is only deferred. Pure and read-only. It shares `retaliate`'s three
//   predicates (`isPoachable`, and the two above it here) rather than restating them, so it
//   can never promise what the next Board refresh then contradicts. Both front ends mark a
//   Hero from it, in words.
export function rivalOffers(career: Career, rivalId: string): RivalHeroOffer[]
export function rivalHeroOffer(career: Career, rivalId: string, heroId: string): RivalHeroOffer | undefined
//   E5. Both fees and both refusals for everybody a Rival employs, asked before the coin is
//   spent — so no front end decides for itself what "they will not deal with you" means
//   (the rule DL-18 followed). An unknown Rival or an ended Career offers nobody.
export function moveRefusal(career: Career, rival: Rival, hero: RivalHero, kind: MoveKind): MoveRefusal | undefined
export function maxCalibreFor(standing: number, config: GameConfig): Calibre
export function statTotal(stats: Stats): number
export function unavailableAmong(career: Career): { heroId: string; reason: 'away' | 'injured' }[]
//   E3. Who on the Roster cannot be sent, and why; away beats injured (DL-18).
// ── Decisions mid-Commission (E6) ───────────────────────────────────────────
export function answerParty(career: Career, partyId: string, optionId: string, content: Content): Step
//   E6. Throws EngineError('NoSuchParty' | 'NotAwaitingWord' | 'NoSuchOption' |
//   'InsufficientCoin' | 'CareerEnded'); every rejection leaves the Career byte-identical.
//   Emits PartyAnswered, then CoinChanged ('sendCoin') for a sendCoin, then the option's
//   Consequences, then either PartyTurnedBack or the Beat the Decision displaced.
export function awaitingParties(career: Career): Party[]
//   E6. Every Party waiting for word, in the order they set out.
export function wordOffers(career: Career, content: Content): WordOffer[]
export function wordOffer(career: Career, partyId: string, content: Content): WordOffer | undefined
//   E6 (DL-23 §9). For each awaiting Party: the Decision, the slots, the Day it was asked,
//   the Day it times out, the Days waited and left, which option the timeout will take, and
//   every option with its kind, its cost and whether the Guild can take it **now** — read
//   fresh, because coin moves while a Party waits. Pure, read-only, and carrying no prose:
//   `narrate`'s `wordProse` fills the prompt and the labels. The `turnBack` option also
//   carries its `outcome` (below).
export function turnBackFee(fee: number, score: number, beatCount: number, config: GameConfig): number
//   E6. What calling a Commission off part-way through pays. Pure and table-testable.
export function projectedReturn(career: Career, partyId: string): number | undefined
//   E6 (DL-24 §A2a). The earliest Day a Party can now be home: `returnsOn` for a Party at
//   work, and something later for one standing still on a word — the Beats the waiting
//   strands are re-spread on the Day it is answered and the return moves with them, so the
//   `returnsOn` both front ends were showing was a Day that was going to slip. Shares the
//   arithmetic `answerParty` applies rather than restating it. Shown as "back no sooner
//   than …" while a Party waits.
export function turnBackOutcome(career: Career, partyId: string, content: Content): TurnBackOutcome | undefined
//   E6 (DL-24 §A2b). What calling a waiting Party home would pay, before the player
//   chooses it: `{ feePaid, fullFee, beatsResolved, beatCount }`, from the very expression
//   `answerParty` then applies — including the `turnBack` option's own `score`
//   Consequences, which move the fee. `turnBackFee` was exported but a view would have had
//   to assemble its four arguments itself, which is a rule restated in a front end (DL-18).
//   The same value rides on `WordOffer`'s `turnBack` option as `outcome`.
export function decisionById(content: Content, id: string): DecisionDef | undefined
export function isInjuryTrait(trait: HeroTrait): boolean
//   E6. Whether one held Trait is an Injury: timed, and of the Injury kind. One definition,
//   which `isInjured` is built on and both front ends read rather than restating (DL-23 §10).

export function postingPatrons(career: Career): Patron[]
//   E1. The Patrons willing to post: Regard strictly above `patronPostsAboveRegard`. What
//   `refreshBoard` itself asks, re-exported for E7's Patrons view so that a front end can
//   say a Patron is posting nothing without deciding where the floor is (DL-25 §2).
export function upkeepDue(career: Career): number
//   E1. What the next Upkeep will cost, at the current Roster size (DL-18).
export function daysUntilUpkeep(career: Career): number
export function daysUntilBoardRefresh(career: Career): number
//   E1. Days until each next falls due, built on the Day loop's own schedule test.
//   Never zero: on a Day that is itself due, this is the interval to the following one,
//   because the Day loop has already settled that Day by the time a caller sees it (DL-18).
export function yearOf(day: number, config: GameConfig): number
export function dayOfYear(day: number, config: GameConfig): number
//   E1. The Year a Day falls in, and the Day within it, both counting from one (DL-18).

interface Step { career: Career; events: GameEvent[] }

interface PartyProposal {
  commissionId: string; heroIds: string[]; backing: number; refusals: Refusal[]
  unavailable: { heroId: string; reason: 'away' | 'injured' }[]   // E3: the whole Roster's
}
interface Refusal { heroId: string; reason: 'regard' | 'trait'; trait?: string; regardValue: number }

type AcceptRefusalCode = 'CareerEnded' | 'NoSuchApplicant' | 'RosterFull' | 'InsufficientCoin'
interface AcceptRefusal { code: AcceptRefusalCode; shortfall?: number }   // E4
interface ApplicantOffer { applicant: Applicant; daysLeft: number; refusal?: AcceptRefusal }

type MoveKind = 'transfer' | 'poach'                                      // E5
interface MoveRefusal { reason: TransferRefusedReason; shortfall?: number }
interface RivalHeroOffer {
  hero: RivalHero; rivalId: string
  transferFee: number; poachFee: number
  transferRefusal?: MoveRefusal; poachRefusal?: MoveRefusal
}

interface RetaliationRisk {                                               // E5, DL-22 §2
  heroId: string
  regardValue: number        // what they think of the Guildmaster: what made them takeable
  rivalIds: string[]         // soured enough to try AND with room; empty means nobody is
}

interface WordOption {                                                    // E6, DL-23 §9
  id: string; kind: DecisionOptionKind; cost?: number
  affordable: boolean                                       // against the coin held NOW
  refusal?: { code: 'InsufficientCoin'; shortfall: number }
  isDefault: boolean                                        // the one the timeout takes
}
interface WordOffer {
  partyId: string; commissionId: string; decisionId: string; beatIndex: number
  slots: BeatSlots
  askedOn: number; timesOutOn: number; daysWaited: number; daysLeft: number
  defaultOptionId: string
  options: WordOption[]
}
```

**`proposeParty` answers, `commitParty` decides, and neither is ever the only way to learn what the
other will do.** The proposal's `backing` is the Backing the Party would have *as the world stands*.
Where nobody refuses it is exactly what `commitParty` computes; where somebody does, insisting
charges them first, so the committed Party sets out with less — and that gap is the price, made
visible before it is paid (DL-14).

## 7. Events

Every event carries `day`. Names are past-tense facts. No event carries prose.

```ts
type GameEvent =
  | { type: 'CareerStarted'; day; seed; guildName; heroIds: string[] }
  | { type: 'BoardRefreshed'; day; commissionIds: string[] }
  | { type: 'CommissionPosted'; day; commissionId; patronId }
  | { type: 'CommissionExpired'; day; commissionId; patronId }
  | { type: 'CommissionTakenByRival'; day; commissionId; patronId; rivalId }
  | { type: 'CommissionRefused'; day; heroId; commissionId; reason: 'regard' | 'trait'; trait?: string; regardValue: number }
  | { type: 'InsistenceApplied'; day; heroId; commissionId; delta: number; value: number }
  | { type: 'HeroDeparted'; day; heroId; regardValue: number; reason: 'regard' }
  | { type: 'PartyCommitted'; day; partyId; commissionId; heroIds; backing; returnsOn }
  | { type: 'BeatResolved'; day; partyId; commissionId; vignetteId; beatIndex; heroId; stat; roll; total; dc; result: BeatResult; slots: { heroId; patronId; sphereId; trait?: string } }
  | { type: 'ConsequenceApplied'; day; partyId; consequence: Consequence; heroId?: string }
  | { type: 'PartyReturned'; day; partyId; commissionId; patronId; heroIds; succeeded: boolean; score; feePaid }
  | { type: 'CoinChanged'; day; delta; balance; reason: 'fee' | 'upkeep' | 'consequence' | 'hall' | 'recruitment' | 'transfer' | 'poach' | 'sendCoin' }
  | { type: 'PatronRegardChanged'; day; patronId; delta; value; reason }
  | { type: 'HeroRegardForGuildmasterChanged'; day; heroId; delta; value; reason }
  | { type: 'TraitGained'; day; heroId; trait; liftsOn?: number }
  | { type: 'TraitLifted'; day; heroId; trait }   // a timed Trait that is not an Injury (E3)
  | { type: 'HeroInjured'; day; heroId; trait; liftsOn: number; partyId?; beatIndex? }
  | { type: 'InjuryLifted'; day; heroId; trait; injuredOn: number; daysBorne: number }
  | { type: 'HeroScarred'; day; heroId; trait; partyId?; beatIndex? }
  | { type: 'HeroDied'; day; heroId; partyId?; beatIndex? }
  | { type: 'HeroRetired'; day; heroId; age: number; yearsServed: number }
  | { type: 'ApplicantsArrived'; day; applicantIds: string[]; calibres: Calibre[]; expiresOn: number }
  | { type: 'ApplicantAccepted'; day; applicantId; heroId; fee: number; calibre: Calibre }
  | { type: 'ApplicantDeclined'; day; applicantId; name: string; reason: 'player' | 'expired' }
  | { type: 'HeroJoined'; day; heroId; name: string; calibre: Calibre; age: number; formerHeroId? }
  | { type: 'HeroTransferred'; day; heroId; fromRivalId: string; fee: number; balance: number }
  | { type: 'HeroPoached'; day; heroId; fromRivalId: string; fee: number; balance: number;
                                rivalRegardDelta: number; rivalRegardValue: number }
  | { type: 'RivalPoachedHero'; day; heroId; toRivalId: string; regardValue: number }
  | { type: 'RivalRosterChanged'; day; rivalId; joinedHeroIds: string[]; leftHeroIds: string[] }
  | { type: 'RivalRegardChanged'; day; rivalId; delta; value; reason }
  | { type: 'TransferRefused'; day; rivalId; heroId; reason: 'regard' | 'heroRegard' | 'rosterFull' | 'coin' }
  | { type: 'PartyAwaitingWord'; day; partyId; commissionId; decisionId: string; beatIndex: number;
      timesOutOn: number;
      options: { id: string; kind: 'pressOn' | 'sendCoin' | 'turnBack'; cost?: number; affordable: boolean }[];
      slots: BeatSlots }
  | { type: 'PartyAnswered'; day; partyId; commissionId; decisionId: string; optionId: string;
      byDefault: boolean; slots: BeatSlots }
  | { type: 'PartyTurnedBack'; day; partyId; commissionId; beatsResolved: number; beatCount: number }
  | { type: 'HallImproved'; day; improvement: HallImprovement; cost: number; balance: number }
  | { type: 'UpkeepOwed'; day; amount; balance }
  | { type: 'CareerEnded'; day; reason: 'retirement' | 'insolvency'; reckoning: Reckoning }
```

Later epics add to this union; they never change an existing member's shape.

The three E2 members are reported only where the fact happened: `CommissionRefused` and
`InsistenceApplied` come from the commit that insisted, never from `proposeParty`, which is a pure
query and reports nothing at all. Every Regard movement E2 makes — insistence, drift, and the
Guildmaster talking somebody round — travels on the one existing `HeroRegardForGuildmasterChanged`
with a distinguishing `reason`, because none of them is a different kind of fact. `HeroDeparted` has
its own member because a Hero leaving the Roster is (DL-14).

The six E3 members follow the same rule. `TraitGained` still fires for every Injury and
every Scar, because it is the mechanical fact; `HeroInjured` and `HeroScarred` are the
narratable ones and carry what narration needs, and `narrate` stays silent on the
`TraitGained` that one of them already tells. An Injury lifting emits `InjuryLifted` alone,
so narration never has to de-duplicate a pair, and `TraitLifted` is reserved for a timed
Trait that is **not** an Injury. `CoinChanged.reason` gains `'hall'`: adding a literal to a
closed union is an addition, no field is removed or retyped, producers are unaffected, and
the exhaustiveness check makes every consumer declare what it does with the new case.

The four E4 members follow the same rule, and `CoinChanged.reason` gains `'recruitment'`
under it. `ApplicantAccepted`, that `CoinChanged` and `HeroJoined` are three events and
one moment for the reader: `narrate` tells it once, in the `HeroJoined` (E4 §4, DL-19 §5).
`ApplicantsArrived` deliberately does **not** say which of a batch have been here before —
the offer itself does, and `HeroJoined` carries `formerHeroId` once one is taken.
`ApplicantDeclined` carries the person's `name` as well as their id, for the reason
`HeroJoined` does: somebody who has gone is gone from `career.applicants` too, so narration
has nothing left to look the id up in (one addition to the shape E4 §4 sketches, DL-19).

The six E5 members follow the same rule, and `CoinChanged.reason` gains `'transfer'` and
`'poach'` under it. `HeroTransferred`, that `CoinChanged` and `HeroJoined` are three events
and one moment for the reader, told once on the `HeroJoined` — exactly as an offer taken is
(E4 §4) — and the same for a Poaching. `RivalRegardChanged` is one member more than E5 §4
sketches, so that **every** Regard movement in the game arrives as an event carrying the delta
that actually landed after clamping; it is emitted only where nothing else tells it, which is
a Vignette's `rivalRegard` Consequence, because `HeroPoached` already carries what a Poaching
cost (DL-21 §11). `TransferRefused` is an event and not an error, because a refusal is a thing
that happened in the world; where several refusals hold at once the one reported is the first
of `regard`, `heroRegard`, `rosterFull`, `coin`.

The three E6 members follow the same rule, and `CoinChanged.reason` gains `'sendCoin'` under
it. `PartyAwaitingWord` is the one place the player's attention snaps back mid-Commission, so
it is its own member of the attention set, and it carries option **ids**, kinds, costs and
numbers and never a word of the prose the front ends print. `PartyAnswered` is emitted for
the Guildmaster's own answer and for the `default` the timeout takes alike, so narration can
say what was chosen either way without a front end having remembered it; it carries
`commissionId` and `slots` as well as the ids E6 §4 sketches, for the reason `ApplicantDeclined`
carries a name — the option's `label` is authored prose with the same tokens a prompt has, and
`pendingWord` is cleared by the time the event is read (DL-23 §11). `PartyTurnedBack` says the
work was **stopped** rather than finished; the Party's return is still the one `PartyReturned`
every consumer already handles, with `succeeded: false` and the pro-rata fee.

**E6-S2's "no event payload contains a space" is met as amended** (DL-20 §7, DL-22, DL-23 §12).
It cannot be met as written: names of things in the world and content-authored reasons carry
spaces by design. The test asserts that **no event carries engine-authored English**, exempting
`name`, `guildName`, `trait` and the content-authored `reason` on `RivalRegardChanged` and
`ConsequenceApplied` by field, naming `HeroRegardForGuildmasterChanged.reason` and
`PatronRegardChanged.reason` as a **known exemption** that predates E6 — turning those two into
ids is its own decision and is not taken here — and holding E6's own three members to the letter
of the box: no string field of theirs contains a space at all.

## 8. Saves

`serialiseCareer` writes `JSON.stringify(career, null, 2)`. `deserialiseCareer` parses, checks `formatVersion === 1`, checks the structural shape, and returns the Career. `deserialiseCareer(serialiseCareer(c))` deep-equals `c` for every reachable Career, and a test proves it across many seeds and decision paths.

**The CLI's slot file (E7-S4).** A slot at `.career/<slot>.json` wraps that document rather than replacing it:

```ts
interface SlotHeader { guildName: string; day: number; year: number; rosterSize: number; seed: string; ended: boolean }
interface SlotFile { formatVersion: 1; savedOn: string; header: SlotHeader; career: string; history: string[] }
//   `career` is the EXACT string serialiseCareer returned and is never re-encoded, so
//   DL-02's one-serialiser rule holds and the web client reads the same document.
//   `history` is the CLI's own rolling five (E7-S2), which the engine knows nothing about.
//   `header` is E7 §4's shape plus the one thing the slot picker needs (DL-25 §9): the
//   picker lists each slot's Guild, Day, Year and Roster size without deserialising the
//   Career at all, which it could not do if those four facts only lived inside the string.
//   It is written from the Career by one function, and a test asserts it agrees with the
//   document it wraps.
```

Three slots are named — `one`, `two`, `three` — beside one `autosave`, which **nothing but an autosave ever writes**, so it can never overwrite a Career the player meant to keep. Every write is atomic: `<slot>.json.tmp`, `fsync`, rename over the slot. A stale temporary file from a killed write is never listed and never loaded, and the next save writes over it. A **bare `serialiseCareer` string** — which is every save E1 to E6 wrote — is read rather than refused, with an empty history, and nothing on disk is rewritten by reading it (DL-25 §10); a wrapper whose `formatVersion` is not 1 is refused with a sentence naming the version found and the one expected, and the file is left exactly as it was.

## 9. Front ends

**CLI.** Node, `node:readline`, no rendering dependency. Loop: show the screen, accept a command, call the engine, narrate, repeat (E7 restructured it into `main.ts`, `screen.ts`, `layout.ts`, `views/*.ts`, `commit.ts`, `word.ts`, `history.ts`, `slots.ts`, a `confirm.ts` holding every screen that asks for a confirming keypress (DL-26 §3) and an `errors.ts` that is a re-export of `narrate`'s one map; `cli/src/index.ts` is a three-line entry point so `npm run play` and every spawned test keep one path).

*The main screen* is 80 columns and 24 rows and a player can act from all of it without reaching for the scrollback (E7-S1): the Guild, the Day and Year and the coin — grouped with a thin separator and **never** abbreviated, `1,140 coin` and not `1.1k` — the Upkeep owed with the Days until it and the Days until the Board refreshes; the Board, one line per Commission with its fee, difficulty band, span and Beats; who is away and the earliest Day they can be back; how the Roster stands (places taken, injured, away, and how many another Guild could take — *"unhappy" is not vocabulary and is not printed*); the Applicants cue; the last five decisions; and the keys. **An awaiting Party displaces the Board** and a bare number answers it. Where the room runs out the oldest history entries go first and then the Applicants cue, because both are one keypress away and the Board, the Roster and the money are not.

*The keys*: `1`–`6` pick a Commission, then `a`–`l` toggle Heroes and Enter commits; `1`–`9` answer a waiting Party **where its options are numbered in front of the player**, and `w` opens the Word view — every waiting Party's prompt and options whole, paged at twenty rows, a number answering there — which is where the summary form sends them and the only way in when two Parties wait at once (DL-26 §2); `r` the Roster, `p` the Patrons, `g` the League, `f` the Heroes who have left, `a` the Applicants, `o` the other Guilds, `i` the Hall; `n` advance; `s [slot]` save, `l` the slots, `l <slot>` load, `d <slot>` delete; `h` help; `q` leave. `r` was the other Guilds from E5 and is the Roster from E7, which is what E7-S1's own mock draws (DL-25 §13). Each read-only view is one keypress away and one keypress back, pages at twenty rows with `-- page 1 of 3 --` and `[m] more`, and is a **pure function** `render(career, width, content?) => string[]` that holds no state and is snapshot-tested at 40, 60, 80 and 120 columns.

*Every coin spend takes a confirming keypress* (DL-20 §6, settled in DL-25 §3): insisting (E2), a Transfer and a Poaching (E5), and now buying a Hall improvement, taking an Applicant on — which names the fee *and* the Upkeep their place will cost from now on — and answering a Party with an option that costs coin. Declining an Applicant is free and takes none. Every sentence about what *will* happen comes from the engine's own selector — `proposeParty`, `acceptRefusal`, `applicantOffers`, `rivalOffers`, `wordOffer`, `turnBackOutcome` — and never from the front end's own reasoning.

*The views*. The Roster gives each Hero their name, age, Stats, every Trait **with the summary content gives it**, their Regard for the Guildmaster **with the reason it last moved** — a bare number is never the whole cell — where they are in full (`available`, `away until Year 2, Day 58`, `injured until Year 2, Day 61`, or `back no sooner than …, and later the longer they wait` for a Party standing on a word), and, in words, whether another Guild could take them and which Guilds are minded to try; it is sorted by where they are and then by name, and a departed or dead Hero is on the separate former-Heroes page and nowhere else. The Patrons are grouped by Sphere with each one's Regard, the reason it last moved and what they have on the Board, and one at the posting floor is said **explicitly** to be posting nothing, from the engine's own `postingPatrons`. The League is every Guild in Standing order with Roster sizes, the player's row marked with a leading `>` and not moved for it, and `STANDING_EXPLAINED` in a footer, word for word with the browser's.

*Three flags let the CLI be driven by a test rather than a terminal* (DL-12): `--script <file>` reads commands from a file one per line, `--quiet` drops the screen redraw between commands, and `--config key=value` (repeatable, E2) overrides one `GameConfig` field — an unknown key or a non-numeric value is a usage error rather than a silent no-op. E7 adds `--width <n>`, which lays out at a width a pipe cannot report, and `--ascii`.

*Accessibility* (E7-S5). The width is `process.stdout.columns`, then `COLUMNS`, then 80. **Below 80 the layout stacks**: no columns, no tables, one label and value per line. **At or below 40** headings shorten to a single word and the keys go one per line; 40 is the floor and it is tested, with a committed snapshot for every view. **Nothing is ever truncated with an ellipsis** — it wraps; the one sanctioned cut in the whole front end is a history entry, which at 80 columns and above is trimmed to two lines ending at a sentence boundary where there is one and at the author's own clause boundary where there is not, never on a word that points forward; below 80 the Day stamp takes a line of its own and the entry is given the lines its first sentence needs, because sixty characters is not a sentence (DL-26 §4, superseding DL-25 §14). Colour is applied at the **output boundary** in `screen.ts` and to exactly two things — a block heading and a line of key hints — so it carries emphasis and never meaning; `NO_COLOR`, `TERM=dumb`, a non-TTY stdout and `--no-colour` each produce output with no ANSI escape in it at all. `TERM=dumb` or a locale that names an encoding which is not UTF-8 maps the em dash, the middle dot and the curly quotes to ASCII **at that same boundary**, so narration — which is shared with the browser — is not rewritten for a terminal's sake. Every screen reads heading, then content, then actions. `screen.ts` is the only module in `cli/` that reads `process.env` or touches the terminal, which a test asserts by scanning the source; a lint rule forbids `cli/` from reaching into another workspace's source rather than its package entry point.

*Saves and exits* (E7-S4). Slots are §8's `SlotFile`. `q` writes the autosave and says where it went, and asks **once** before it writes a named slot as well; an interrupt does the same; and an error thrown while a view is rendering autosaves the Career **before** it says a word about it, so no Career is lost by any exit path. A Career that has ended is loadable, shows its reckoning and offers exactly two things — `b` for a new Career, deliberately not `n`, and `q`.

**Web.** Vite + React, no router. Three layouts by width: under 600px single column with a bottom bar (Board / Roster / Report); 600–1023px two columns; 1024px and up three panes. The Roster shows each Hero's age, the Injuries they carry with the Day each one lifts and the Scars they keep; the Party picker leaves an injured Hero out and says why; a Hall sheet offers the three improvements with the cost and the effect, disabled with the reason written out when one cannot be bought (E3). An Applicants sheet does the same for the people at the door — Background and Traits first, Stats second, age, fee and the Days they have left, somebody coming back marked in text, and Accept disabled with the reason written out when the Roster is full or the coin is short; the header carries the count and the countdown as its cue, and calibre is never shown (E4). A Rivals sheet shows each other Guild, what it makes of yours and everybody it employs, with both fees on the controls themselves, every reason a move cannot be made written out in text beside a disabled control, and what a Poaching costs in goodwill warned **before** the tap; a League sheet lists every Guild ordered by Standing as stacked rows rather than a table, so that nothing is ever dragged sideways at 320px, with your row marked in words and the same footer the terminal prints (E5). The Roster pane marks a Hero another Guild could take, in words rather than by colour, naming the Guilds minded to try, and the Rivals sheet says of a wronged Guild whether they have room to take anybody at all — both from the engine's own `retaliationRisks` and `hasRoomForAnother`, read in `state/selectors.ts` and only rendered in the panes (DL-22 §2). A Party waiting on word takes the **Report pane's place** while it stands and raises a badge on
the bottom bar — `Word (2)`, in words and a number rather than a dot — and Advance is disabled
with the reason written out in the header, so the Days can never pass a waiting Party silently.
Each option is its own control, at least 40×40, carrying its label and its cost; one the Guild
cannot pay for is disabled with the reason in text beside it, the one the timeout will take is
marked in words, and the countdown is in words. Long prompts and long labels wrap; nothing in
the pane is ever cut short with an ellipsis (E6-S4). Saves in `localStorage`. Content bundled via `import.meta.glob('../../content/**/*.toml', { query: '?raw' })` and parsed with the pure content entry. Nothing is fetched from the network.

*Parity with the terminal* (E8-S6, DL-27). The browser has a counterpart for every view the terminal has, reading the same selectors [E7 §4](epics/E7-terminal-ui-and-saves.md#4-technical-notes) lists. The panes are `Board`, `Roster`, `Report` and `Word`; the sheets over them are `PartyPicker`, `SlotPicker`, `Hall`, `Applicants`, `Rivals`, `League` and — added by E8-S6 — **`Patrons`** (by Sphere, each with their Regard, the reason it last moved, what they have on the Board, and, at the posting floor, `narrate`'s sentence saying they are posting nothing at all), **`Former`** (everybody who has left: how they went, when, their Stats, their Traits and their Regard, and never shown on the Roster) and **`History`** (the last five things the player did and what came of them). A single **`More`** control in the header opens a sheet naming those three in words, because the header already carried seven controls and wrapped to two rows at 360px and a third row pushes the Board off a phone screen (DL-27 §8). The Roster gives each Trait the summary content gives it, as the terminal's does.

*Where the browser's history lives.* Under `heroesim.history.<slot>`, **beside** the Career and never inside it, as full paragraphs — so `heroesim.career.<slot>` stays exactly the string `serialiseCareer` returned and the terminal reads it unchanged (DL-02). Which moments are worth remembering and what an entry says are `narrate`'s `WORTH_REMEMBERING` and `entriesFrom`, shared with the terminal so neither front end re-words an entry; the trim to two lines is the terminal's alone, because the browser wraps and scrolls. The window is accumulated in the reducer's one `accept` funnel, follows the autosave, comes back with a load and is removed with its slot.

*A coin spend in the browser takes one tap*, deliberately unlike the terminal (DL-27 §5). Every one of these is a labelled button at least 40×40 CSS pixels carrying its own price, aimed at rather than typed, which is the protection the terminal's confirming keypress was standing in for. A **second** tap is reserved for an action whose cost is not on the control: insisting, which spends a Hero's Regard (E2), and letting the Days run past a waiting Party, which spends the outcome (DL-24 §A1). The Applicants sheet names the fee **and** the Upkeep the new place adds from now on before the tap, which is the information the terminal's second keypress carries.

*Two places the browser deliberately differs, and both are arrangement.* It shows **every** waiting Party whole rather than the terminal's summary, because the pane scrolls and every option is a labelled button tied to its own Party, so DL-26 §2's row budget and its ambiguity about what a number means have no counterpart here (DL-27 §10). And the Board card shows the difficulty **word** and not the raw number, which is what the terminal shows (DL-27 §3).

*A finished Career* offers no decision about itself — no Advance, no Send on any card, no Applicants, no Hall, no deal, no Saves and no Word controls, and the header's cues go with them — and keeps every view that is only reading: the League, the Patrons, the former Heroes, the rolling five and the Roster, because the reckoning is the point of an ending (DL-27 §9). Loading an ended Career from a slot lands in the same state.

**Narrate.** `narrateEvents(events, career, content): Paragraph[]` where `Paragraph = { kind: 'beat' | 'return' | 'board' | 'coin' | 'commit' | 'end' | 'note' | 'word' | 'answer'; text: string; day: number; partyId?: string }` (E6 adds the last two: a Party's question and the reply, both tagged with the Party so they group into its report). `wordProse(subject, career, content): { prompt, labels }` fills a Decision's prompt and each option's label through the same token filler a Vignette's narrative goes through, which is how both front ends get an option's words while the engine gives them its numbers (DL-12: `commit` and `partyId` are additions to the sketch drafted here, so a Party's report can be grouped by `partyId` without reordering paragraphs out of Day order). Groups a Party's Beats and its return into one report. Both front ends render the same paragraphs.

## 10. Verification

| Layer | Tool | Proves |
| --- | --- | --- |
| Engine unit | Vitest | Checks, selection, refresh, Upkeep, ending, serialisation |
| Engine rules, E3 | Vitest `engine/tests/{harm,injury,age,hall}.test.ts` | `injuryOutcome` over the whole margin range; authored harm suppressing engine harm; Death before the Scar; a Party that loses everybody; the lift on its own Day and the exclusion that follows; ageing counted over a full Career and Retirement deferred off a Commission; each Hall improvement pinned with it and without it |
| Engine gate, E3 | Vitest `engine/tests/e3-gate.test.ts` | A Career played to Retirement on one seed in which a Hero is injured and recovers, a Hero is scarred and keeps working, and a Hero retires by age; and a 200-seed smoke run for a Hero stuck injured for ever and for the death spiral |
| Engine rules, E4 | Vitest `engine/tests/{standing,applicants,recruit,returning}.test.ts` | `maxCalibre` walked over the whole Patron Regard scale; no calibre-2 Applicant below the threshold over 200 seeds; the cadence, the Roster floor and the exact expiry Day; Stats summing to every calibre budget exactly; the three events of an acceptance in order and every rejection byte-identical; the return cooldown pinned, the age brought forward, and the dead and the retired never coming back over 200 seeds |
| Engine gate, E4 | Vitest `engine/tests/e4-gate.test.ts` | A Career that has lost half its Roster recovering through Applicants and reaching an ending; a player who declines everything reaching the same ending; a Roster driven to zero recovering; and a 200-seed smoke for the Roster cap, the ids, the coin and the ledger |
| Standing's one job | Vitest `content/tests/e4-standing-callsites.test.ts` | A static scan of `engine/src` proving no Commission, fee or Board decision reads `standing` (DL-19 §11 says why it lives in `content/`) |
| Engine rules, E5 | Vitest `engine/tests/{rivals,transfer,poach,retaliation,churn,league}.test.ts` | A Rival with no Hall, Board, coin or Guildmaster expressible; the two employer Regards proved exclusive by the types and over 200 Careers; fees and consent at non-default config; refusals as events and byte-identical Careers; the −1/−2 poaching boundary; a property test that Poaching is never dearer; `isPoachable` called with its arguments swapped; the order of Retirement, drift, Departure, retaliation and churn in one refresh; E1's Board draw with nobody soured and three Commissions with two soured; the League ordered, marked and snapshot-tested; and, from DL-22, `retaliationRisks` predicting exactly who the next refresh takes over a fleet, one shared notion of the names anybody alive answers to, and a Rival's Roster size drawn at one unconditional draw |
| The League is never a score | Vitest `content/tests/e5-league-position.test.ts` | A static scan proving no state type declares a `position`, `rank` or `ranking` |
| One `moveHero` | Vitest `content/tests/e5-one-move.test.ts` | Exactly two `guild.roster.push(` sites in the whole engine, and one comparison against `poachRegardThreshold` |
| Engine gate, E5 | Vitest `engine/tests/e5-gate.test.ts` | A Career that Transfers one Hero, Poaches another and loses one to a soured Rival's retaliation; 200 Careers checked at every state a player could observe; 25 three-year Careers checked on every single Day |
| Engine rules, E2 | Vitest `engine/tests/{refusal,insistence,departure,decay,backing}.test.ts` | Refusal rules and `proposeParty`'s purity; insistence order, cost and clamp; the Departure cadence, the deferral to a return Day and an emptied Roster; the exact drift sequence over 200 Days; Backing's Regard term pinned on fixed Careers |
| Engine gate, E2 | Vitest `engine/tests/gate.test.ts` | A Career played to Retirement on one seed, losing a Hero who refused, was insisted upon and walked out |
| Engine API contract | Vitest `engine/tests/api.test.ts` | Determinism, immutability, round-trip, typed errors, 200-seed full-Career smoke, auto-player survives ≥ 10 years on most seeds |
| Content | Vitest | Every TOML file loads; every token resolves; every Commission tag set has a Vignette |
| Narrate | Vitest | Every Vignette outcome renders with every pronoun set; no `{` survives |
| CLI end-to-end | Vitest spawning the process | Scripted stdin plays to Retirement; save then load resumes |
| CLI end-to-end spawn test | `cli/tests/e2e.test.ts` | Spawns the real process over `--script`/`--quiet`; a scripted Career saves, reloads and reaches Retirement or Insolvency |
| CLI views, E7 | Vitest `cli/tests/views.test.ts` | Every view a pure `render(career, width, content?)`, snapshot-tested at 40, 60, 80 and 120 columns, with the committed 40-column snapshots; every width assertion holds both halves of the rule at once — no line over the width **and** nothing cut short |
| CLI main screen, E7 | Vitest `cli/tests/layout.test.ts` | 80 columns and 24 rows; the Upkeep, the coin, the Day and the Roster size always on it; an awaiting Party displacing the Board; coin grouped and never abbreviated; the row budget giving up the oldest history entries rather than running over |
| CLI reachable-state sweep, E7 | Vitest `cli/tests/sweep.test.ts` | 200 seeded **played** Careers over the authored content with adversarially long Guild, Hero, Patron, Sphere and Commission names injected through it, every view at four widths, paged and in ASCII — and an assertion that the sweep actually **saw** an awaiting Party, an injured Hero, a takeable Hero, a wronged Rival, a door nobody can be taken from, a Patron at the posting floor and an ended Career, so it cannot pass vacuously |
| CLI terminal boundary, E7 | Vitest `cli/tests/screen.test.ts` | Width detection, wrapping that never cuts, paging, grouped coin, the ASCII fallback, the two things colour dresses, and a static scan proving `screen.ts` is the only module that reads `process.env` or touches the terminal |
| CLI slots, E7 | Vitest `cli/tests/slots.test.ts` | The slot file's shape and its header; a rename over an existing slot on Windows; a **child process killed mid-write** leaving the slot intact and the stale temporary file harmless; a bare E1-era save read rather than refused; a mismatched slot format refused with both versions named and the file untouched |
| CLI exits, E7 | Vitest `cli/tests/loop.test.ts` | No Career lost by any exit path: quitting, an injected throwing view, and the interrupt handler each write the autosave first; a named slot is never written without being asked; an ended Career loads, shows its reckoning and offers exactly two things |
| CLI errors, E7 | Vitest `cli/tests/errors.test.ts` | One map, `narrate`'s, exhaustive over `EngineErrorCode` by the type checker; no sentence names an identifier, a type or a function; every sentence says what would change it |
| CLI history, E7 | Vitest `cli/tests/history.test.ts` | Five entries with the oldest dropped over twenty decisions; each entry `narrate`'s own sentence, Day-stamped and trimmed to two lines at a sentence or word boundary with no ellipsis; the same five after a save and a load |
| E7's gate | `cli/tests/e2e.test.ts` | A full Career played to Retirement in an 80-column terminal, quit mid-Career and resumed from the autosave to the **byte-identical** Career, read at 40 columns, with no ANSI escape under `NO_COLOR` and pure ASCII under a locale that is not UTF-8 |
| E7's two engine additions | Vitest `engine/tests/e7-additions.test.ts`, `content/tests/e7-starting-debt.test.ts` | `config.startingDebt` pinned at a non-default value and proved inert at its default, byte for byte over 400 played Days, with a static scan proving it is read in exactly one file; `postingPatrons` proved against the Board's own floor and proved read-only |
| Web unit | Vitest + Testing Library | Components render state and dispatch decisions |
| Web bundle network check | `web/scripts/check-bundle.mjs` | The built bundle contains no `fetch(`, `XMLHttpRequest`, `node:*` specifier, `process.env` read or stray URL literal (CLAUDE.md invariant 9) |
| Browser | Playwright, Chromium, three device projects | Journey to a returned Party and a saved game, through the Patrons, the former Heroes and the history on the way; no horizontal overflow in the document **or any scrollable container**; tap targets ≥ 40px; screenshots kept under `docs/verification/`. The tablet project is an 820×1180 Chromium viewport (DL-10), not the WebKit-backed `iPad Mini` device |
| Web parity views, E8-S6 | Playwright `web/e2e/parity.spec.ts` | The Patrons by Sphere with one at the posting floor; the former Heroes with every exit kind the engine records; the rolling five at none, at one and at five, surviving a save, a reload and a load and cleared with its slot; the More sheet; and a finished Career offering only a new one while keeping its read-only views — each swept at 320/360/414/768/1024/1280 and at the project's own viewport. Every state is reached by saving through the UI, editing the document in `localStorage` and loading it back, never by a test-only door |
| No identifier reaches the browser player, E7-S5 | Vitest `web/tests/identifiers.test.tsx` | Every pane and sheet of a played Career, the Word pane with its option labels and its default-option line, the Party picker with somebody away and somebody refusing, the Patrons sheet with one at the posting floor and the former-Heroes sheet with every exit kind — each read a text node at a time and checked against the **content's own** Decision, option, Vignette and Sphere ids **and the ids the Career in hand carries**. The terminal's equivalent is `cli/tests/sweep.test.ts` (DL-28 §2) |
| Every sheet from the keyboard, E8-S3 | Vitest `web/tests/parity.test.tsx` | A sheet is labelled and `aria-modal`, takes the focus when it opens, closes on Escape and gives the focus back to the control that opened it; each More control says what it opens through `aria-describedby` (DL-28 §6) |
| 200% browser zoom, E8-S3 | Playwright `web/e2e/zoom.spec.ts` | A 640×400 CSS viewport at `deviceScaleFactor: 2` — which is what Chromium does to a 1280×800 window at 200%, and unlike pinch zoom it re-runs every media query — falling back to the **two-column tablet arrangement**, with no overflow and no tap target under 40px. Evidence: `docs/verification/desktop/zoom-200.png` |
| Narration parity across front ends | Vitest `web/tests/narration-parity.test.ts` | One seed and one decision list — 26 decisions covering a commit, an insistence, stretches of Days, a return, a Hall purchase, an Applicant taken on and one declined, a Transfer, a refused Poaching, a waiting Party answered three ways and one that acted on its own judgement — taken down **both** front ends' own paths and diffed, 142 paragraphs, with the terminal's own `narrationLines` as the expected side (DL-01). It loads `cli/src/layout.ts` by file URL, as `save-interop.test.ts` loads `cli/src/slots.ts`, because the import boundary between the two front ends is real and stays (DL-27 §11) |
| Save interoperability | Vitest `web/tests/save-interop.test.ts` | A slot file the terminal wrote opened in the browser, and a document the browser wrote read by the terminal's own slot module |
| The words and numbers both front ends share | Vitest `narrate/tests/e7-words.test.ts`; source scans in `cli/tests/screen.test.ts` and `web/tests/engine-imports.test.ts` | One number format, grouped and never abbreviated, swept over every paragraph of a played Career **and** enforced by a scan of `narrate/src` itself, which fails any `${…}` interpolating a money field that has not been through `coin()` or `groupDigits()` — the played sweep alone only constrains an amount that reaches four figures on that seed (DL-28 §4); the returner, the silent Patron and the wronged-Rival sentences, how a Hero's going is said and why nobody at the door can be taken on (DL-28 §3); and a scan of each front end's source proving it holds no copy of them, writes no coin figure by hand and hard-codes no plural of Day beside the count |
| Engine rules, E6 | Vitest `engine/tests/{decisions,word,answer,turn-back,timed-traits}.test.ts` | Decisions validated with the same named-field errors Vignettes get; the same seed played with the machinery switched off and with no Decisions at all, byte for byte; at most one per Commission over 200 seeds; the pending state, both clocks and the save round trip; every option kind, every `effect`, the timeout on its exact Day and the typed refusals; the pro-rata fee as a table; no harm after a turn-back over a fleet at the harshest settings; and a timed Trait that is not an Injury leaving its holder committable |
| Engine gate, E6 | Vitest `engine/tests/e6-gate.test.ts` | One seed in which a Party sends word, is told to turn back and comes home early with a partial outcome while a second Party's word times out into its default; `advance(career, 10_000)` reaching an ending from an awaiting Party; every automatic policy written before Decisions still finishing, unedited; and 200 played Careers under a policy that answers and one that never does, with E6-S2's "no engine-authored English" box in its amended form |
| Static | `tsc --noEmit`, ESLint | Purity rules, import boundaries |

The definition of done in [epics/README.md](epics/README.md) §5 applies to every epic.
