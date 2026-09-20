# E5 — Rivals and the League

**Objective:** Other Guilds hold people and opinions; Heroes move between Guilds both ways  
**Estimate:** 4–5 days · **Depends on:** E2 + E3 + E4 · **Implements:** [Design §Rivals and the League](../design.md#rivals-and-the-league) · **Realises:** ADR-0003  
**Gate:** A Career in which the player Transfers one Hero, Poaches another, and loses one to a soured Rival's retaliation

**Status:** Built and independently verified 2026-09-20 (DL-21, DL-22). The gate is met by `engine/tests/e5-gate.test.ts`, which takes seed
`e5-gate-1` at the shipped defaults and plays it to Retirement through the public API under a
policy that answers the door, buys the Hall and — once each — brings somebody over above board
and takes somebody who had had enough of the Guild paying them; the retaliation is not arranged
at all, and two Heroes are taken back. The rules as built are recorded in
[DL-21](../00-decision-log.md#dl-21--the-e5-rules-as-built-a-rivals-people-drawn-from-a-stream-of-their-own-employer-regard-made-exclusive-by-the-types-one-movehero-for-every-direction-and-a-board-rule-that-is-e1s-to-the-draw-until-somebody-is-wronged),
which deviates from this file in five places, all named there: a Rival's Roster is drawn from a
stream derived from the seed and that Rival's id rather than from the Career's own serialised
RNG (§5's mitigation); employer Regard is two sibling types with a `never` apiece rather than one
optional field on `Hero` (§4); there are four more `GameConfig` fields than §4 names and one more
event member (`RivalRegardChanged`); `deserialiseCareer` gains an optional `content` argument; and
retaliation is bounded by room on the other Roster, which §4 does not state. Every acceptance box
below is met.

A second, independent verification is recorded in
[DL-22](../00-decision-log.md#dl-22--e5-verification-names-nobody-shares-a-roster-that-shows-who-can-be-taken-and-what-rivals-actually-cost).
It makes two decisions — one shared notion of the names anybody alive in a Career answers to, so
that two people the player could meet never share one; and one read-only selector,
`retaliationRisks`, so that both front ends can mark **in words** the line at which another Guild
can take a Hero off you — and it corrects three pieces of evidence cited above that did not show
what they claimed. Everything else in it is a measured fact or a question for the owner, with
nothing built or tuned for it: notably that Poaching costs a large Guild **less** Board access
than never dealing at all, and that one authored Vignette drives retaliation hard enough to cost a
blameless Guild 4.6 Heroes a Career. Nothing there is rebalanced here.

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

- [x] A Rival has a Roster, a Standing and a Regard for your Guild, and no Hall, Board, coin or Guildmaster — a type test proves the last four are not expressible (`engine/tests/rivals.test.ts`: "has no Hall, no Board, no coin and no Guildmaster, and none of them is expressible" — four `@ts-expect-error` lines that fail the build the moment somebody adds the field, plus the whole key list asserted; "is not a Guild to the type checker either, in either direction". "has a Roster, a Standing and a Regard for your Guild" is the other half)
- [x] `employerRegard(career, heroId)` returns `regardForGuildmaster` for a Roster Hero and `regardForRival` for a Rival's, and is the only way either is read by the movement rules (`engine/tests/rivals.test.ts`: "answers `employerRegard` with whichever one it is", "answers with nothing for somebody nobody employs", "reads a deep-frozen Career without writing to it"; "does not type-check as the other, in either direction" and "cannot be given the other one, even by hand" are the type-level half, and 200 played Careers prove nobody ever holds both or neither. `content/tests/e5-one-move.test.ts` proves `poachRegardThreshold` is compared in exactly one place)
- [x] Rival Heroes are serialised with the Career and survive a round trip (`engine/tests/rivals.test.ts`: "survives a round trip with everything about them intact, over 120 played Days" — solvent for the whole of them since DL-22, and asserting it, where before the Career ended on Day 70 and the last fifty never happened; "refuses a document that gives one of them Regard for the Guildmaster too" and its mirror keep the exclusivity true at the boundary. `engine/tests/save.test.ts`'s one-field-at-a-time corruption sweep now covers every path through a Rival's Roster)
- [x] Rival Heroes ageing out emit `HeroRetired` and leave that Rival's Roster (`engine/tests/rivals.test.ts`: "retires at the configured age, emits HeroRetired and leaves that Rival's Roster", which also pins that they leave the world rather than the player's history and that `ledger.heroesRetired` is untouched; "gets a year older at every year boundary, at home and on every Roster")
- [x] Generating 200 Careers produces no Hero on two Rosters at once (`engine/tests/rivals.test.ts`: "never has one person on two Rosters, and never one holding both employer Regards" — 200 seeds, each played 400 Days so that churn, Retirement and the Board have moved everything. **That sentence was false until DL-22:** the test commits no Party, so no fee ever came in against Upkeep and every one of the 200 Careers went insolvent on **Day 70** — seven Board refreshes rather than forty and not one `HeroRetired`. It now buys the Days with `startingCoin`, brings `heroRetirementAge` within reach of people generated between 22 and 40, and **asserts** that every Career reached Day 400 solvent, that the fleet saw churn, and that Rival Heroes actually retired, so it can never pass vacuously again. `engine/tests/e5-gate.test.ts`'s smoke checks the same thing at every state a player could see, over played Careers, and `engine/tests/e5-verification.test.ts`'s 150-Career and 30-Career every-Day fleets check it over Careers played to their own end)

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

- [x] `TransferRefused` is an event, not a thrown error — a refusal is a thing that happened in the world, and the CLI narrates it (`engine/tests/transfer.test.ts`, the "a refusal is an event, and the Career does not move" block: three reasons, each asserted as a whole event; `narrate/tests/rivals.test.ts`: "reads differently for each of its four reasons" and "is a thing that happened, not an error message". The CLI says it in `cli/tests/e2e.test.ts`: "says plainly when the Guild cannot pay, and nobody moves")
- [x] `EngineError` is still thrown for unknown ids and an ended Career (`engine/tests/transfer.test.ts`, the "only a programming error throws" block: `NoSuchRival`, `NoSuchHero` — including for one of your own Heroes and for somebody on a *different* Rival's Roster — and `CareerEnded`; `engine/tests/poach.test.ts` holds the same for the other call)
- [x] A refused Transfer leaves the Career byte-identical (`engine/tests/transfer.test.ts`: each of the three refusals compared through `serialiseCareer` before and after, and the Career passed in checked too; `engine/tests/poach.test.ts`: "still refuses for a full Roster and for want of coin, byte-identically")
- [x] A successful Transfer emits `HeroTransferred`, then `CoinChanged` with `reason: 'transfer'`, then `HeroJoined` (`engine/tests/transfer.test.ts`: "reports the transaction, then the coin, then the Roster gaining a person" — the three types pinned as a list and every field of each asserted whole, all carrying the same Day)
- [x] The Hero is gone from the Rival's Roster and present in yours exactly once (`engine/tests/transfer.test.ts`: "takes them off the Rival's Roster and puts them on yours exactly once", with `formerHeroes` checked too; "counts people once each, however many are brought over")
- [x] Fee and consent threshold are `GameConfig` fields (`engine/tests/transfer.test.ts`: "moves with both fields, at values neither of them defaults to" and "moves with the configured threshold and with nothing else"; `engine/tests/rivals.test.ts`: "ships every field with the default E5 §4 adopted" and "is all numbers, so `--config key=value` and the save can carry every one of them")

### E5-S3 · Poaching, and the bill it runs up · 1 day

```ts
poachHero(career, rivalId, heroId): Step
```

- Fee is `round(transferFee × config.poachFeeFactor)` — half
- It is legal only when `hero.regardForRival.value <= config.poachRegardThreshold`; otherwise `TransferRefused` with `reason: 'heroRegard'`
- The Rival is not asked. Their Regard for you falls by `config.poachRivalRegardCost`, with the reason recorded
- Everything else about the move is identical to a Transfer

**Acceptance:**

- [x] A Hero at Regard −1 for their Rival cannot be poached; at −2 they can, and a test pins the boundary (`engine/tests/poach.test.ts`: "cannot be poached at −1 and can be at −2, and the boundary is pinned"; "moves with poachRegardThreshold and with nothing else" drives the threshold to −4 and re-pins the boundary there)
- [x] `HeroPoached` carries the fee, the Rival Regard delta and the resulting value (`engine/tests/poach.test.ts`: "carries the fee, the Regard it cost and the Regard it left behind" — the event asserted whole)
- [x] Poaching twice from the same Rival sours them twice, and Regard clamps at −5 (`engine/tests/poach.test.ts`: "sours them twice over for a second one, and clamps at the bottom of the scale" — 0 → −3 → −5 → −5, with the third reporting a delta of 0 because that is what actually landed; "sours the Rival by the configured cost, with the reason recorded" checks nobody else moves; "moves with poachRivalRegardCost, at a value it does not default to")
- [x] Poaching is cheaper than the equivalent Transfer in every case, and a property test over calibres asserts it (`engine/tests/poach.test.ts`: "is cheaper than the equivalent Transfer for every calibre, at every factor under one" — six factors × seven fee shapes × three calibres, never dearer anywhere and strictly cheaper across the whole space the game is balanced in; the shipped 150/200/250 against 75/100/125 pinned exactly)
- [x] `CoinChanged` reports the fee with `reason: 'poach'` (`engine/tests/poach.test.ts`: "reports the transaction, then the coin, then the Roster gaining a person")

### E5-S4 · Retaliation, by exactly the same rule · 0.5–1 day

At each Board refresh, every Rival with `regardForGuild.value <= config.retaliationRegardThreshold` attempts one poach against your Roster, using the same predicate applied the other way: your Heroes with `regardForGuildmaster.value <= config.poachRegardThreshold`, worst first. They pay you nothing, because poaching is without consent.

**Acceptance:**

- [x] The predicate is one exported function used by both directions; a test calls it with the arguments swapped and gets the mirror answer (`engine/tests/poach.test.ts`: "is decided by the one predicate, which gives the mirror answer with the arguments swapped" — eight values, each asked as "what I think of the Guildmaster" and as "what they think of their Rival". `content/tests/e5-one-move.test.ts` proves nobody compares against the threshold by hand anywhere else)
- [x] A Guild with no soured Heroes loses nobody, however soured the Rivals are (`engine/tests/retaliation.test.ts`: "takes nobody at all from a Guild whose Heroes are content, however soured they are" — every Rival at −5, a year of Board refreshes, nobody taken and the Roster identical; "takes only those the one predicate says are takeable" walks the whole band)
- [x] A Hero away on a Commission is not taken mid-Commission; retaliation is deferred to their return Day (`engine/tests/retaliation.test.ts`: "is not taken mid-Commission, and is settled on the Day they come home" — every Day up to the one before, then the attempt on the return Day itself, and after the `PartyReturned` that closes the work, which is E2's own cadence)
- [x] `RivalPoachedHero` carries the Regard value that made them takeable (`engine/tests/retaliation.test.ts`: "takes the worst first, and one per soured Rival per refresh" pins the values; `engine/tests/e5-gate.test.ts`: "loses one to that soured Rival's retaliation, and never to a Regard it had not watched fall"; `narrate/tests/rivals.test.ts`: "leads with how far their Regard had fallen")
- [x] The taken Hero appears on that Rival's Roster with `regardForRival` at `config.transferJoiningRegard` and is gone from yours (`engine/tests/retaliation.test.ts`: "is on that Rival's Roster and gone from yours"; "thinks of their new employer what config.transferJoiningRegard says, and of you nothing"; "keeps their age, their Traits and what they thought of the people they worked with"; "is not in the Guild's history: they are working, not gone")
- [x] `ledger.heroesPoachedFromUs` increments and the reckoning reports it (`engine/tests/retaliation.test.ts`: "is counted once in the ledger and reported in the reckoning"; `engine/tests/e5-gate.test.ts`'s smoke checks the ledger against the event count and the ids against each other, over 200 Careers)

### E5-S5 · Churn, and a soured Rival on your Board · 0.5 day

- At each Board refresh, each Rival with probability `config.rivalChurnChance` gains or loses one Hero, staying within `rivalRosterMin..rivalRosterMax`
- E1's rule was "one unclaimed Commission is taken by a random Rival per refresh". It becomes: `config.rivalTakesPerRefresh` plus `config.souredRivalExtraTakes` for each Rival at or below `config.souredRivalThreshold`, capped at `config.rivalTakesMax`, and a soured Rival is preferred as the taker

**Acceptance:**

- [x] Churn never pushes a Rival Roster outside its bounds (`engine/tests/churn.test.ts`: "never pushes a Rival's Roster outside its bounds, over a whole Career" — sixty refreshes at a churn chance of one; "gains where a Roster is at the floor and loses where it is at the ceiling"; "moves with rivalChurnGainChance: always up at one, always down at zero". `engine/tests/e5-gate.test.ts`'s smoke checks `roster.length <= rivalRosterMax` at every state a player could see and on every Day of 25 Careers)
- [x] A Career with no soured Rivals loses exactly one Commission per refresh, as in E1, and E1's test passes unmodified (`engine/tests/churn.test.ts`: "is exactly one a refresh with nobody soured, which is E1's rule to the draw". E1's own suite was not touched at all: the count takes no draw and preferring a soured Rival is a narrower pool for the `pick` the taker already cost, never an extra one — DL-21 §6)
- [x] Souring two Rivals costs you up to three Commissions a refresh, capped, and a test pins it (`engine/tests/churn.test.ts`: "costs up to three a refresh once two Rivals are soured, and is capped there" — one soured gives two a refresh, two give three, four still give three; "moves with every one of the three fields, at values none of them defaults to")
- [x] Each taken Commission still emits `CommissionTakenByRival` and still drops that Patron's Regard — poaching costs you work, which is the whole point (`engine/tests/churn.test.ts`: "still drops that Patron's Regard for every Commission it takes", which also checks each taker's Standing rose; "prefers a soured Rival as the taker")
- [x] `RivalRosterChanged` carries the ids that joined and left (`engine/tests/churn.test.ts`: "carries the ids that joined and left, and they are real people either side of it"; "gives somebody churned in an id nobody has ever held", over twenty refreshes; "lets go of the one who thought least of the Guild paying them")

### E5-S6 · The League · 0.5 day

```ts
league(career): LeagueRow[]
```

A pure view, ordered by Standing descending, ties broken by name. It includes your Guild, whose Standing is `standing(career)` and is derived, and each Rival, whose Standing is stored. It computes nothing that is not already modelled.

**Acceptance:**

- [x] `league` is pure, takes no RNG, emits no events and is covered by a snapshot test (`engine/tests/league.test.ts`: "is a snapshot of every Guild in the world, the player's among them" — an inline snapshot of all five rows; "takes no generator, emits no event and writes nothing", against a deep-frozen Career and the Career's own bytes before and after)
- [x] Your row is marked, and is not special-cased in the ordering (`engine/tests/league.test.ts`: "marks your row and does not special-case it in the ordering" — at the bottom of the League the player is last, at the top they are first; "orders by Standing descending, and ties by name"; "reads the player's Standing as derived and a Rival's as stored". `web/tests/rivals.test.tsx`: "does not move your row for being yours")
- [x] `LeagueRow` carries Roster size, so the view says something a bare number does not (`engine/tests/league.test.ts`: "carries the size of each Roster, so the row says more than a bare number", over a played Career)
- [x] Nothing in the engine writes a League position; a test asserts no field named `position` or `rank` exists on any state type (`content/tests/e5-league-position.test.ts`: a static scan of every declaration in `engine/src`, proved not vacuous by a pretend `rank` it does find, plus `LeagueRow`'s own fields read out of the source. `engine/tests/league.test.ts`: "has no field named position or rank on any state type, over 400 played Days", over every key of a Career that DL-22 made actually reach Day 400 — solvent, with forty Board refreshes, churn and Retirement in it, and asserting all four — where before it went insolvent on Day 70 and the scan walked a world three hundred and thirty Days younger than the claim)

---

## 2. Definition of done

- [x] A Rival is not a Guild and a Hero is a Hero wherever they work (ADR-0003) (`engine/tests/rivals.test.ts`, the "a Rival is not a Guild" block, and the "a Hero holds Regard for one employer at a time" block beneath it: the person keeps their id, age, Traits, calibre and every opinion they held when they cross, which `transfer.test.ts`'s "keeps everything about the person that is not their employer" and `retaliation.test.ts`'s "keeps their age, their Traits and what they thought of the people they worked with" each pin from one side)
- [x] Departure (E2) and poaching are visibly one mechanism: the Hero who walks out is the Hero somebody else approached (`engine/tests/e5-gate.test.ts`: "makes Departure and poaching visibly one mechanism" — over 25 played Careers, every Hero a Rival ever took was already inside the band E2 checks for Departure over; `engine/tests/retaliation.test.ts`: "takes the Hero whose Regard had soured by the same measure that loses them", and "never takes somebody who has already walked out in the same refresh")
- [x] Every Hero movement — Transfer, poach, retaliation — runs through one internal `moveHero` so the two directions cannot drift apart (`content/tests/e5-one-move.test.ts`: exactly two `guild.roster.push(` sites exist in the whole engine — world generation, and `moveHero` — and the statics around them; `engine/tests/e5-gate.test.ts`: "runs every Hero movement through one piece of bookkeeping", which plays all four ways onto or off a Roster and finds the same six marks left by each. `acceptApplicant` was refactored onto it and **every E4 test passed unmodified**)
- [x] The League is derived and is never written (`content/tests/e5-league-position.test.ts` and `engine/tests/league.test.ts`, both cited under E5-S6; `engine/tests/e5-gate.test.ts`: "never writes a League position, however far a Career is played")
- [x] Refusals are events; only programming errors throw (`engine/tests/e5-gate.test.ts`: "makes every refusal an event, and throws only for a programming error", played with an appetite the world cannot possibly satisfy; the byte-identical and throw-code blocks in `transfer.test.ts` and `poach.test.ts`)
- [x] Saves from E4 load; Rivals without a Roster are populated at load from the Career's own RNG, deterministically (`engine/tests/save.test.ts`'s E5 block: a document written before Rivals had people loads, is given Rosters, loads **twice to the same bytes**, and gets the Rosters a Career on that seed would have had; a Career loaded without content is populated at the first `advance`, before a Day is stepped. **Deviation:** the stream is derived from the seed and the Rival's id rather than the Career's own serialised RNG, which satisfies that clause's own stated intent more robustly and leaves a loaded Career on the same random path as an unloaded one — DL-21 §1, §13)
- [x] Architecture §3, §4, §6 and §7 updated in the same change; the E1 Board-refresh rule is restated with its E5 form (§3 state, `Person`/`Hero`/`RivalHero`/`AnyHero`, `Rival`, `LeagueRow`, `nextRivalHeroNumber`, the ledger and the reckoning, and the eighteen `GameConfig` fields; §4 the `rivalRegard` Consequence; §5 four new rule blocks **and the Board refresh restated in its E5 form**; §6 the **seventeen** new API entries, the four new result types and `deserialiseCareer`'s optional argument; §7 the six new events and `CoinChanged.reason`; §9 both front ends; §10 four new suites)

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

**As built**, four more fields are named, because a literal in rules code is a defect
(CLAUDE.md invariant 8) and one of them is what makes E5-S3 reachable at all
([DL-21](../00-decision-log.md#dl-21) §10): `rivalHeroRegardMin` (−3) and
`rivalHeroRegardMax` (+2), the band one of a Rival's own Heroes starts at — without it
nobody a Rival employs is ever poachable; `rivalStartingRegard` (0), which is "starts
neutral" named; and `rivalChurnGainChance` (0.5), which is churn's direction inside the
bounds. Every one of the eighteen is pinned at a **non-default** value by a test — true only
after [DL-22](../00-decision-log.md#dl-22) §10, which found `rivalHeroRegardMax` and
`souredRivalExtraTakes` driven nowhere off their defaults and closed both in
`engine/tests/e5-verification.test.ts` ("draws a Rival Hero's Regard against
rivalHeroRegardMax, not the number it defaults to" and "adds souredRivalExtraTakes for each
soured Rival, under a cap that does not swallow it").

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

**As built**, one more member: `RivalRegardChanged { day; rivalId; delta; value; reason }`,
which mirrors `PatronRegardChanged` and `HeroRegardForGuildmasterChanged` so that every
Regard movement in the game arrives as an event carrying the delta that actually landed
after clamping. It is emitted only where nothing else tells it — the `rivalRegard`
Consequence below — because `HeroPoached` already carries what a Poaching cost, and one
fact is told once ([DL-21](../00-decision-log.md#dl-21) §11). Where several refusals hold
at once, `TransferRefused` reports the first of `regard`, `heroRegard`, `rosterFull`,
`coin`: the obstacle hardest to shift is named first.

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

**As built**, three more selectors than §4 names, all read-only and all sharing rules the
engine already applies rather than restating them: `rivalOffers` / `rivalHeroOffer` /
`moveRefusal` ([DL-21](../00-decision-log.md#dl-21) §10), and — from the second verification
pass ([DL-22](../00-decision-log.md#dl-22) §2) — `retaliationRisks(career)`, which answers who
on **your** Roster another Guild could take as things stand and by whom, and
`hasRoomForAnother(rival, config)`, which is `retaliate`'s own "have they anywhere to put
anybody" guard. `newcomerRegard` was exported and used nowhere outside `rival.ts`, and is not
any more. Seventeen entries in all, which is what architecture §6 documents and what
`engine/src/index.ts` holds.

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

> **Where those tests are now.** E7 restructured the terminal front end and its suite (DL-25, DL-26): `cli/tests/display.test.ts` became `cli/tests/views.test.ts`, `layout.test.ts` and `screen.test.ts`, the screens that ask for a confirming keypress became `cli/tests/confirm.test.ts`, and `cli/tests/saves.test.ts` became `cli/tests/slots.test.ts`. Every assertion cited above moved with the code it covers; none was dropped.
