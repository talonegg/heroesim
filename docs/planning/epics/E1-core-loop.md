# E1 — Core Simulation Loop

**Objective:** First playable Career — take Commissions, commit Parties, resolve Beats, see what happened  
**Estimate:** 5–7 days · **Depends on:** None · **Implements:** [Design §2–4](../design.md#time-and-the-loop) · **Realises:** ADR-0001, ADR-0002, ADR-0006, ADR-0008  
**Gate:** E1 passes full playthrough to Retirement; save/load works end-to-end

---

## 0. What lands in E1

- **Engine:** pure library that takes a seeded RNG and returns typed events
- **CLI:** reads events, narrates them as prose, and manages the Career loop
- **World state:** Guild (Guildmaster, Roster, Coin, Standing), Patrons, Commissions, Parties
- **Beats:** a small starter Vignette set (6–8 templates) and the Beat resolution engine
- **Saves:** state snapshots, load/save from `.career/` directory, not JSON — minimal format TBD
- **End-to-end:** a player can load a Career, make decisions until Retirement, and see a score reckoning

**Not in E1 (deferral is deliberate, not omission):**

- Refusals or Regard (E2)
- Injuries or Scars (E3)
- Applicants or recruitment (E4)
- Rivals or Transfers (E5)
- Chips or mid-Commission decision points (E6)
- Terminal UI polish, rich tables, navigation (E7)

---

## 1. Stories

### E1-S1 · Engine: world state and event types · 1.5–2 days

The engine is a pure TypeScript library: no I/O, no global RNG, no wall clock.

**What it models:**

- A `Guild` with a `Guildmaster` (Stats, Traits, Background, Regard), a `Roster` of Heroes, Coin, and Standing
- `Patrons`, each with a `Sphere`, who post `Commissions` on the Board
- A `Commission`: terms, fee, deadline (Days), difficulty curve
- A `Party`: Heroes assigned to a Commission, with `Backing` from the Guildmaster
- A `Check`: a Stat roll modified by Traits and Backing, resolving a Beat
- A `Beat`: a single incident (ambush, obstacle, discovery, quarrel), one Check, one event emitted
- A `Career`: 20–30 in-game years, ending in Retirement or Insolvency

**Engine interface** (TypeScript skeleton):

```typescript
type RNG = { nextInt(max: number): number }
type CareerSeed = string // for reproducibility

interface Engine {
  newCareer(seed: CareerSeed, config: GameConfig): Career
  advance(career: Career, days: number): GameEvent[] // Player stops here
  commitParty(career: Career, commissionId: Id, heroIds: Id[]): GameEvent[]
  payUpkeep(career: Career): GameEvent[] // Automatic
  // No other I/O. RNG is passed in, Career is passed through events, time is explicit.
}

type GameEvent = 
  | { type: 'PartyCommitted', partyId, heroIds, commission }
  | { type: 'BoardRefreshed', commissions }
  | { type: 'BeatResolved', partyId, result, narrative }
  | { type: 'UpkeepOwed', amount, balance }
  | { type: 'CareerEnded', reckoning }
  // + others defined in the design
```

The `Career` state object is serialisable (to support saves); the engine never touches the filesystem.

**Acceptance:**

- [ ] Engine compiles with zero lint errors
- [ ] All event types are defined in `engine/src/events.ts` with JSDoc
- [ ] Type tests verify Events are nominal (no accidental overlaps)
- [ ] A new Career can be created and advanced 100 Days without crashing
- [ ] All RNG calls are injected (no `Math.random()` anywhere in engine)

### E1-S2 · Commission and Beat resolution engine · 1.5–2 days

Commissions resolve as a sequence of Beats.

**What happens:**

1. A Party is committed to a Commission
2. The Commission runs for its span of Days (e.g., 5–10 days)
3. Each day (or between days), the engine may fire a Vignette (templates for Beats)
4. Each Vignette slot is filled from world state (this Hero, this Trait, this Patron's Sphere)
5. A Beat fires: a `Check` against one Hero's Stat + Trait modifiers + Party Backing
6. The Check result (success, failure, critical) determines the narrative and any consequence
7. Events are emitted; the Commission ends when its deadline arrives

**Beat resolution:**

```typescript
interface Vignette {
  id: string
  name: string
  conditions: (world: Career) => boolean
  slots: {
    hero: Hero // or chosen per conditions
    trait?: Trait // optional, checked
    sphere?: Sphere // which Patron's work is this?
    difficulty: number // 8–15, sets the DC
  }
  statTargeted: 'Might' | 'Craft' | 'Nerve' | 'Guile'
  outcomes: {
    failure: { narrative: string, consequences: (hero, world) => GameEvent[] }
    success: { narrative: string, consequences: (hero, world) => GameEvent[] }
    critical: { narrative: string, consequences: (hero, world) => GameEvent[] }
  }
}

function checkResult(stat: number, traits: Trait[], backing: number, dc: number, rng: RNG): 'critical' | 'success' | 'failure' {
  const roll = rng.nextInt(20) + 1 // d20, canonical
  const total = roll + stat + traitMod + backing
  return total >= dc + 5 ? 'critical' : total >= dc ? 'success' : 'failure'
}
```

Vignettes are authored in TOML (or JSON if TOML feels heavy); each file is one Vignette. **The engine knows nothing about file I/O; Vignettes are loaded by the CLI and passed in.**

Starter Vignette set: 6–8 templates covering basic scenarios (ambush, obstacle, discovery, quarrel, success, failure with a twist). These are **not** comprehensive; they are enough for a playable first Career.

**Acceptance:**

- [ ] A Commission runs for its full span without crashing
- [ ] Beats fire from Vignettes, with slots filled correctly
- [ ] Stat checks use d20, apply modifiers, and have three outcomes
- [ ] Check results are deterministic given a seed (no RNG leakage)
- [ ] Failed Checks do not end a Commission prematurely (Beats accumulate)
- [ ] Six starter Vignettes are committed and load without parse errors
- [ ] Event stream records each Beat and outcome

### E1-S3 · Guildmaster and Party Backing · 1 day

The Guildmaster is a modelled person with Stats, Traits, and Regard for each Hero.

**How Backing works:**

When a Party is committed, its Backing is computed once and fixed for the Commission:
- Each Hero's Traits applied
- The Guildmaster's Stats and Traits applied (they are not in the Party, but they support it)
- The Guildmaster's Regard for each Hero applied
- A numeric bonus added to all Checks that Party makes

This is asymmetric: the Guildmaster's presence is felt, but they never appear in a Check.

**Acceptance:**

- [ ] A Guildmaster is created with four Stats (each 1–5), Traits, and a Background
- [ ] Backing is computed for a Party when it is committed
- [ ] Backing modifies Checks numerically (e.g., +1, +2)
- [ ] Regard scores exist but do not *yet* affect Backing (that is E2)
- [ ] Saves include the Guildmaster's full state

### E1-S4 · Board refresh and Upkeep cycle · 1 day

The loop advances: the Board refreshes, Upkeep falls due, Rivals take Commissions you don't.

**Game loop:**

1. Player views the Board (list of Commissions)
2. Player advances time (e.g., "skip 3 days")
3. Player commits Parties to Commissions, or dismisses them
4. Engine resolves Parties, emits Events
5. Upkeep is owed (whether or not anyone worked)
6. Board refreshes with new Commissions
7. Repeat until Career ends (Retirement or Insolvency)

**Constants (TBD, you may refine these):**

- Upkeep per 10 days: ~50 coin (configurable)
- Commission fees: 80–200 coin (by difficulty)
- Starting coin: 500 coin
- Board size: 4–6 live Commissions
- Rival action: they take 1 Commission per refresh (if Board has one left)

**Acceptance:**

- [ ] Player can advance by N days and the Board updates
- [ ] Upkeep is tallied and deducted; Insolvency triggers if coin < 0
- [ ] Rivals take unclaimed Commissions (event emitted)
- [ ] Standing and Coin balance are tracked through a full Career

### E1-S5 · Career lifecycle: Retirement and Insolvency · 0.5 day

A Career ends when either:

1. **Retirement:** The Guildmaster reaches a natural age (set at Career start; e.g., 20–30 years) and retires well. Player gets a reckoning of what the Guild became: Heroes alive, Heroes lost, total Commissions completed, favorite Patron, largest coin balance reached.

2. **Insolvency:** Coin goes negative and stays there. Career ends in failure (no moral victory possible). Reckoning shows the same stats, but tone is "what went wrong."

**Acceptance:**

- [ ] A Career can run to Retirement without error
- [ ] Insolvency ends a Career and emits a `CareerEnded` event
- [ ] The reckoning shows meaningful summary stats
- [ ] Saves are deleted on Career exit (no weird dangling state)

### E1-S6 · CLI: event loop and narration · 1.5–2 days

The CLI is the front end. It reads events and turns them into prose.

**What it does:**

1. Loads or creates a Career (from `.career/` directory)
2. Shows the Board, asks for decisions
3. Calls the engine with those decisions
4. Narrates the events (turns `BeatResolved` into English)
5. Shows updated world state
6. Loops until Career ends

**Narration rules** (not language-heavy, but character-specific):

- "An ambush!" should become "A night attack on your camp. [Hero name] freezes, knife in hand." when that Hero is Craven.
- "Success" should become specific: "You talked the Patron down from 150 to 120 coin" based on the Guildmaster's Guile and traits.
- Failure modes are distinct: a sword falls differently than a negotiation does.

**Terminal output:**

- Board: list of Commissions, refreshed each decision point
- Party status: Heroes on active Commissions, days remaining
- Coin and Upkeep timer: how much you have, how much is owed
- Prose report: what happened to each returned Party
- History: last 5 decisions / outcomes

**Accept inputs:**

- Keyboard: number keys (1–6 to pick a Commission), letter keys (a–z to assign Heroes), `s` to save, `q` to quit

**Acceptance:**

- [ ] CLI compiles and runs without panicking
- [ ] Board displays correctly on a 80-char wide terminal
- [ ] Events are narrated with character names and Trait-specific flavor
- [ ] A full Career can be played through the CLI from start to Retirement
- [ ] Saves are atomic (no partial corrupted state)
- [ ] Terminal output is readable under 2 minutes of gameplay without scrollback

### E1-S7 · Saves and load: state snapshots · 1 day

Saves are snapshots of the Career state, not event logs. A save file contains:

```
<seed>
<game config (Board refresh rate, Upkeep, etc.)>
<Guild state (Guildmaster, Roster, Coin, Standing)>
<Patrons and Board state>
<current Day>
<each Hero's Traits and state>
```

Format: JSON or plain text, your choice. (JSON is probably easier; TOML if you want it human-readable at a glance.)

**Load contract:**

- Load must succeed on any valid save file
- Load must not corrupt state (load and resave must be identical)
- Old saves remain playable even if game rules change (mostly; some incompat is OK if announced)

**Acceptance:**

- [ ] A Career can be saved at any decision point
- [ ] A saved Career can be loaded and resumed
- [ ] Loaded Career behaves identically to unsaved (same RNG path)
- [ ] Multiple save slots work (`.career/slot1.json`, `.career/slot2.json`, etc.)

### E1-S8 · Starter Vignettes: six templates · 2 days

Write 6–8 Vignettes that cover the common scenarios. These are authored content (not generated); each is a small story template with slots.

**Starter set examples:**

1. **Ambush** — "A night attack. Will the party hold?"
2. **Negotiation** — "The client changes terms mid-work. Will you acquiesce?"
3. **Obstacle** — "A river crossing, a locked door, a guard. Might, Craft, or Guile?"
4. **Discovery** — "You find something unexpected. Treasure? Trap?"
5. **Failure with a twist** — "The work goes sideways, but there is a way out if you're clever."
6. **Success** — "The work is done. But word spreads in unexpected directions."

Each Vignette includes:

- Narrative template with slot markers: `{Hero} does {action}, but {obstacle}?`
- Condition (when may this fire? e.g., "second or later Beat of this Commission")
- Stat targeted
- Difficulty (DC 8–12 for common, 15 for hard)
- Three outcomes (failure, success, critical), each with prose and consequences

**Acceptance:**

- [ ] Six Vignettes are committed to `engine/src/vignettes/`
- [ ] Each loads and parses without error
- [ ] Slot markers are documented (which Vignette expects which slots)
- [ ] A full Commission fires at least three different Vignettes

---

## 2. Definition of done

- [x] Engine is a pure library (no I/O, injected RNG, explicit time)
- [x] Engine emits structured events (no prose in engine)
- [x] CLI narrates events into readable English
- [x] Beats resolve via d20 Checks against Stats + Trait + Backing modifiers
- [x] Commissions run to completion; Parties return with a report
- [x] Upkeep, Board refresh, and Rival action work for a full Career
- [x] A Career can be played to Retirement or Insolvency
- [x] Saves persist and load correctly
- [x] Starter Vignettes (6–8) are authored and playable
- [x] Full end-to-end playthrough works on a clean checkout

---

## 3. Known unknowns (not blocking E1, but decide before midway)

| Question | When to answer | Why |
| --- | --- | --- |
| **Save format:** JSON, TOML, or plain text? | E1-S7 is 50% done | Affects load performance and human readability |
| **Vignette authoring language:** TOML, JSON, YAML, or DSL? | E1-S8 is 50% done | Affects how fast content can be written later |
| **How many in-game years per Career?** | Before E1-S5 | Sets the feel (short and tight vs. long and wandering) |
| **How often does the Board refresh?** | Before E1-S4 | Every 5 days? 10? Tied to Upkeep? |
| **Upkeep amount per cycle?** | Before E1-S4 | Affects economic tension (too cheap = no pressure; too dear = no play) |
| **Difficulty curve shape** | Before E1-S2 | Do commissions get systematically harder? Easier? Random? |

---

## 4. Technical setup

### Workspace and repo layout

```
heroesim/
  engine/
    src/
      index.ts           exports { Engine, GameEvent, Career, ... }
      world.ts           Guild, Patron, Commission, Party types
      check.ts           stat resolution and Checks
      beat.ts            Beat firing and resolution
      vignette.ts        Vignette loading and slot-filling
      vignettes/         *.toml or *.json files, one per template
    tests/
      index.test.ts      E2E: newCareer → advance → commitParty → save → load
      check.test.ts      d20 resolution: cases for success/failure/critical
      beat.test.ts       Vignette firing conditions
  cli/
    src/
      index.ts           main loop, input handling
      display.ts         Board and state rendering
      narrate.ts         Events → prose
      saves.ts           load/save operations
    .eslintrc.json       shared with engine
  docs/
    planning/
      README.md          (this plan)
      epics/
        E1-core-loop.md  (this file)
        E2-...md         (next epics)
      design.md          (already exists)
      adr/               (already exists)
      CONTEXT.md         (already exists)
  package.json
  tsconfig.json
  vitest.config.ts
  vite.config.ts (for build, if needed)
```

### Linting and testing

- **Lint:** ESLint configured to forbid `engine/` importing `cli/` (a one-line rule)
- **Type check:** `tsc --noEmit`
- **Test:** Vitest, tests in `__tests__` directories or `.test.ts` alongside source
- **CI:** GitHub Actions (optional for E1, required by E7)

### TypeScript config

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Vignette authoring becomes tedious | Keep templates small (6–8 starters). If authoring feels like a grind by mid-E1, simplify the slot language before E8 |
| Save format conflicts with later goals | Document the save contract now; if E2 needs new fields, an expansion rule is in place before the save breaks |
| Stat/Trait interaction gets complex | Trait modifiers are numeric only (no branching logic in traits). If a trait needs conditional behavior, it is a new Vignette condition, not a trait special case |
| Career feels too fast or too slow | Adjust Board refresh rate and Upkeep timing before E1-S4 completes. A Career should feel like 1–2 hours of play |

---

## 6. Definition of "playable"

At the end of E1, a player can:

1. Load the CLI
2. Create a new Career with one button press
3. Make 20–30 decisions (take Commission, commit Heroes, advance time)
4. See consequences (Beats, prose reports, Coin changes)
5. Play to Retirement without intervention
6. See a reckoning
7. Load a previous save and continue

That is playable. It is not pretty, not comprehensive, and not balanced. It is *working*.

---

## 7. Next: E2 onwards

Once E1 is done, E2–E4 can start in parallel. They all assume a working core loop and add systems on top:

- **E2:** Refusals. Heroes refuse work based on Regard (not yet built) and Traits. Insistence costs.
- **E3:** Injuries and Scars. Commissions inflict Traits that may heal or stay forever.
- **E4:** Recruitment. Applicants appear, Standing determines calibre.

**Do not start E2 until E1 is genuinely playable to Retirement.**
