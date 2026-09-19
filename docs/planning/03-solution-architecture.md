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

interface HeroTrait { name: string; since: number; liftsOn?: number }
//   name refers to a TraitDef in content. liftsOn set ⇒ Injury (E3); absent ⇒ permanent.

interface Hero {
  id: string; name: string; pronouns: Pronouns
  stats: Stats
  background: string                            // name of the Background in content
  traits: HeroTrait[]
  regardForGuildmaster: Regard
  regardFor: Record<string, Regard>             // other Heroes, by id
  joinedOn: number
}

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
  backing: number                               // fixed at commit
  departedOn: number; returnsOn: number
  beatDays: number[]                            // Days on which a Beat fires
  beatsResolved: BeatResult[]
  vignettesUsed: string[]
}

interface Rival { id: string; name: string; standing: number }   // E1: names and Standing only

interface Guild {
  name: string
  guildmaster: Guildmaster
  roster: Hero[]
  formerHeroes: Hero[]                          // Death, Departure, Retirement keep them readable
  coin: number
  hall: string[]                                // improvements, E3
}

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
  ledger: CareerLedger                          // counters for the reckoning
  ended?: CareerEnd
}

interface CareerLedger {
  commissionsCompleted: number; commissionsFailed: number
  commissionsByPatron: Record<string, number>
  peakCoin: number; lastUpkeepNegative: boolean
}

interface CareerEnd { reason: 'retirement' | 'insolvency'; onDay: number; reckoning: Reckoning }

interface Reckoning {
  years: number
  heroesOnRoster: number; heroesLost: number
  commissionsCompleted: number; commissionsFailed: number
  favouritePatron?: { id: string; name: string; count: number }
  peakCoin: number; finalCoin: number
  standing: number
  guildmasterStats: { start: Stats; end: Stats }
}
```

**Standing** is derived, never stored on the Guild: `standing(career) = round(mean(patron.regardForGuild.value) × 10)` for the player's Guild. Rivals carry a stored `standing` because they are not simulated.

### `GameConfig`

Every tunable is a named field with a default. The config is stored in the save.

```ts
interface GameConfig {
  careerYears: 20; daysPerYear: 360
  boardRefreshEveryDays: 10; boardSizeMin: 4; boardSizeMax: 6
  upkeepEveryDays: 10; upkeepPerHero: 12; upkeepBase: 2       // 4 Heroes ⇒ 50
  startingCoin: 500
  feeMin: 80; feeMax: 200
  commissionSpanMin: 5; commissionSpanMax: 10
  beatsMin: 3; beatsMax: 5
  difficultyMin: 8; difficultyMax: 15
  criticalMargin: 5
  backingMax: 3
  rivalTakesPerRefresh: 1
  startingHeroes: 4; patronCount: 5; rivalCount: 4
}
```

## 4. Content

Parsed from TOML by `content`; validated by `engine`'s `validateContent(unknown): Content`, which throws a `ContentError` naming the file and field.

```ts
interface TraitDef {
  name: string; kind: 'background' | 'disposition' | 'injury' | 'scar'
  summary: string
  modifiers: { stat?: Stat; tags?: string[]; delta: number }[]  // applies when the Beat's Stat matches (if given) and any tag matches (if given)
  backing?: number                                              // Guildmaster-only contribution to Backing
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

interface Content { traits: TraitDef[]; backgrounds: BackgroundDef[]; spheres: SphereDef[]; names: NamePools; vignettes: Vignette[] }
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
consequences = [{ kind = "score", delta = -1 }, { kind = "coin", delta = -15 }]

[outcomes.success]
narrative = "{hero} is awake before the others and meets the first of them at the tree line. It is short and ugly and it is enough."
consequences = [{ kind = "score", delta = 1 }]

[outcomes.critical]
narrative = "{hero} lets them come all the way in, then closes the trap. Two of the Patron's missing crates are among what they drop."
consequences = [{ kind = "score", delta = 2 }, { kind = "patronRegard", delta = 1, reason = "recovered the lost crates" }]
```

Narrative tokens, filled by `narrate`: `{hero}`, `{hero.they}`, `{hero.them}`, `{hero.their}`, `{hero.is}`, `{hero.has}`, `{hero.moves}` (verb agreement: they move / she moves), `{patron}`, `{sphere}`, `{guildmaster}`, `{commission}`, `{trait}` (the requiresTrait or with_trait name if any). Unknown tokens are a content validation error.

## 5. Rules

**Check.** `roll = d20`, `total = roll + hero.stats[stat] + traitModifiers + party.backing`. `critical` if `total ≥ dc + config.criticalMargin`; `success` if `total ≥ dc`; else `failure`. `dc = vignette.difficulty + (commission.difficulty − 11)` clamped to 5..20, so hard Commissions make every Beat harder.

**Trait modifiers.** Sum of `delta` over the Hero's Traits whose modifier matches: `stat` absent or equal to the Beat's Stat, and `tags` absent or intersecting the Vignette's tags.

**Backing.** Computed once at commit: `clamp(round((gm.Nerve + gm.Guile) / 2) − 2, 0, config.backingMax) + Σ gm.traits[].backing`. Regard does not yet contribute (E2).

**Vignette selection.** At each Beat Day: candidates are Vignettes whose conditions hold (beat index within min/max, sphere matches if given, Commission tags intersect if given, a Party member has `requiresTrait` if given), preferring ones not yet used on this Commission when any remain; pick by weight. If no candidate exists, fall back to any Vignette whose only failing condition is `tags`. If still none, throw `ContentError` — the starter set must make this unreachable and a test proves it.

**Slot hero.** `any` picks uniformly among the Party; `with_trait:X` picks among members holding X, else any; `highest:Stat`/`lowest:Stat` pick the extreme, ties broken by RNG.

**Commission score.** Each Beat adds `+2` critical, `+1` success, `−1` failure, plus any `score` consequences. On return, `succeeded = score ≥ ceil(beatCount / 2)`. Success pays the fee, Patron Regard +1, and counts for the favourite Patron; failure pays nothing and Patron Regard −1.

**Board refresh.** Unclaimed Commissions: one is taken by a random Rival (`CommissionTakenByRival`, Rival Standing +1, that Patron's Regard −1 with reason "you passed on their work") and the rest expire. The Board is refilled to a size in `[boardSizeMin, boardSizeMax]` from Patrons whose Regard is above −4, weighting Patrons with higher Regard. A Patron at −5 posts nothing.

**Upkeep.** `upkeepBase + upkeepPerHero × roster.length`, deducted whether anyone worked. If coin < 0 at this Upkeep and `ledger.lastUpkeepNegative` was already true, the Career ends in insolvency.

**Retirement.** When `day` reaches `careerYears × daysPerYear + 1`, the Career ends in retirement with the reckoning. `advance` never steps past the end.

## 6. Engine API

All functions are pure. `Career` in, `{ career, events }` out. Inputs are never mutated.

```ts
export function newCareer(seed: string, content: Content, config?: Partial<GameConfig>): Step
export function advance(career: Career, days: number, content: Content): Step
//   Runs Day by Day, resolving Beats, returns, Upkeep and refreshes; stops early if the Career ends.
export function advanceUntilAttention(career: Career, content: Content, maxDays?: number): Step
//   Stops after the first Day on which a Party returns, the Board refreshes, or the Career ends.
export function commitParty(career: Career, commissionId: string, heroIds: string[], content: Content): Step
//   Throws EngineError('CommissionNotOnBoard' | 'HeroNotAvailable' | 'EmptyParty' | 'CareerEnded').
export function serialiseCareer(career: Career): string
export function deserialiseCareer(text: string): Career        // throws SaveError on any mismatch
export function validateContent(raw: unknown): Content          // throws ContentError
export function standing(career: Career): number
export function availableHeroes(career: Career): Hero[]         // not away on a Party
export function heroById(career: Career, id: string): Hero | undefined
export function commissionById(career: Career, id: string): Commission | undefined

interface Step { career: Career; events: GameEvent[] }
```

## 7. Events

Every event carries `day`. Names are past-tense facts. No event carries prose.

```ts
type GameEvent =
  | { type: 'CareerStarted'; day; seed; guildName; heroIds: string[] }
  | { type: 'BoardRefreshed'; day; commissionIds: string[] }
  | { type: 'CommissionPosted'; day; commissionId; patronId }
  | { type: 'CommissionExpired'; day; commissionId; patronId }
  | { type: 'CommissionTakenByRival'; day; commissionId; patronId; rivalId }
  | { type: 'PartyCommitted'; day; partyId; commissionId; heroIds; backing; returnsOn }
  | { type: 'BeatResolved'; day; partyId; commissionId; vignetteId; beatIndex; heroId; stat; roll; total; dc; result: BeatResult; slots: { heroId; patronId; sphereId; trait?: string } }
  | { type: 'ConsequenceApplied'; day; partyId; consequence: Consequence; heroId?: string }
  | { type: 'PartyReturned'; day; partyId; commissionId; patronId; heroIds; succeeded: boolean; score; feePaid }
  | { type: 'CoinChanged'; day; delta; balance; reason: 'fee' | 'upkeep' | 'consequence' }
  | { type: 'PatronRegardChanged'; day; patronId; delta; value; reason }
  | { type: 'HeroRegardForGuildmasterChanged'; day; heroId; delta; value; reason }
  | { type: 'TraitGained'; day; heroId; trait; liftsOn?: number }
  | { type: 'TraitLifted'; day; heroId; trait }
  | { type: 'UpkeepOwed'; day; amount; balance }
  | { type: 'CareerEnded'; day; reason: 'retirement' | 'insolvency'; reckoning: Reckoning }
```

Later epics add to this union; they never change an existing member's shape.

## 8. Saves

`serialiseCareer` writes `JSON.stringify(career, null, 2)`. `deserialiseCareer` parses, checks `formatVersion === 1`, checks the structural shape, and returns the Career. `deserialiseCareer(serialiseCareer(c))` deep-equals `c` for every reachable Career, and a test proves it across many seeds and decision paths.

## 9. Front ends

**CLI.** Node, `node:readline`, no rendering dependency. Loop: show Board, Roster, coin and Upkeep timer; accept a command; call the engine; narrate; repeat. Commands: `1`–`6` pick a Commission then `a`–`l` toggle Heroes and `Enter` commits; `n` advance until attention; `s` save; `l` load; `q` quit. Output fits 80 columns.

**Web.** Vite + React, no router. Three layouts by width: under 600px single column with a bottom bar (Board / Roster / Report); 600–1023px two columns; 1024px and up three panes. Saves in `localStorage`. Content bundled via `import.meta.glob('../../content/**/*.toml', { query: '?raw' })` and parsed with the pure content entry. Nothing is fetched from the network.

**Narrate.** `narrateEvents(events, career, content): Paragraph[]` where `Paragraph = { kind: 'beat' | 'return' | 'board' | 'coin' | 'end' | 'note'; text: string; day: number }`. Groups a Party's Beats and its return into one report. Both front ends render the same paragraphs.

## 10. Verification

| Layer | Tool | Proves |
| --- | --- | --- |
| Engine unit | Vitest | Checks, selection, refresh, Upkeep, ending, serialisation |
| Engine API contract | Vitest `engine/tests/api.test.ts` | Determinism, immutability, round-trip, typed errors, 200-seed full-Career smoke, auto-player survives ≥ 10 years on most seeds |
| Content | Vitest | Every TOML file loads; every token resolves; every Commission tag set has a Vignette |
| Narrate | Vitest | Every Vignette outcome renders with every pronoun set; no `{` survives |
| CLI end-to-end | Vitest spawning the process | Scripted stdin plays to Retirement; save then load resumes |
| Web unit | Vitest + Testing Library | Components render state and dispatch decisions |
| Browser | Playwright, Chromium, three device projects | Journey to a returned Party and a saved game; no horizontal overflow; tap targets ≥ 40px; screenshots kept under `docs/verification/` |
| Static | `tsc --noEmit`, ESLint | Purity rules, import boundaries |

The definition of done in [epics/README.md](epics/README.md) §5 applies to every epic.
