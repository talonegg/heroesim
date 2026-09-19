# E7 — Terminal UI and Saves

**Objective:** The terminal front end becomes the thing you would choose to play, and never loses a Career  
**Estimate:** 3–4 days · **Depends on:** E5 + E6 · **Implements:** [Architecture §9](../03-solution-architecture.md#9-front-ends) · **Realises:** ADR-0002, DL-02  
**Gate:** A full Career played end to end in an 80-column terminal without reaching for the scrollback, quit and resumed from an autosave, and read at 40 columns without breaking

---

## 0. What lands in E7

- **An 80-column layout** that holds: Board, Roster summary, coin and the Upkeep timer, all above the fold
- **A history of the last five decisions** and their outcomes, so the screen answers "what just happened?" without scrolling
- **A Roster view** with Traits, Regard for the Guildmaster, age, Injury spans and who is away
- **A Patrons view by Sphere**, with Regard and what they are currently posting
- **A League view** (E5's `league()`) rendered as a table
- **Graceful quit with autosave**, multiple named slots, and a slot picker that shows what is in each
- **Clear error messages**: every `EngineError` code maps to a sentence a person can act on
- **Narrow-terminal accessibility**: readable at 40 columns, colour never load-bearing, ASCII fallback

**Nothing lands in the engine.** E7 adds no state, no config field, no event and no engine function. If a view wants data the engine does not expose, that is a gap in the epic that introduced the data, and the selector is added there with its own tests — not bolted onto the CLI.

**Deliberately deferred:**

- Onboarding, a settings menu, and save migration (design non-goals, all three)
- Mouse support, scrollback management and alternate-screen mode
- Anything animated. ANSI colour yes; ANSI motion no
- Rendering the same views in a browser (E8, which reuses `narrate` and nothing else from here)

---

## 1. Stories

### E7-S1 · The main screen · 1 day

One screen, 80 columns, 24 rows, that a player can act from without scrolling.

```
 Hollowmere Guild                        Day 412  ·  Year 2  ·  1,140 coin
 ---------------------------------------------------------------------------
 BOARD                                          Upkeep 98 in 4 days
  1  Escort the tithe wagons      River Towns   DC 11   160c   7d   4 beats
  2  The mine at Ash Hollow       Consortium    DC 14   200c   9d   5 beats
 ...
 AWAY   Brenna, Oswin, Tam       return day 418
 ROSTER 7 of 12   ·  2 injured  ·  1 unhappy
 ---------------------------------------------------------------------------
 RECENTLY
  d409  Tam came home limping. Turned ankle, a fortnight.
  ...
 [1-6] commission   [r] roster   [p] patrons   [l] league   [h] hall
 [n] advance        [s] save     [q] quit
```

**Acceptance:**

- [ ] Every line is ≤ 80 characters for every reachable state, asserted by a test that renders 200 seeded Careers and measures
- [ ] The Upkeep timer, coin, Day and Roster size are always visible
- [ ] An awaiting Party (E6) displaces the Board as the top block and cannot be ignored
- [ ] Nothing is printed that the player cannot act on from this screen
- [ ] Numbers are grouped with a thin separator and coin is never abbreviated (`1,140 coin`, never `1.1k`)

### E7-S2 · The history of the last five decisions · 0.5 day

A rolling window of what the player did and what came of it, held by the CLI — never by the engine, which has no memory of decisions as decisions.

- Each entry is one `narrate` paragraph, trimmed to two lines
- Entries are Day-stamped and cover: Parties committed, Parties returned, insistence, Departure, harm, Hall purchases, Transfers, Decisions answered
- It survives save and load, because it is part of the CLI's own slot file alongside the Career

**Acceptance:**

- [ ] Exactly five entries, oldest dropped, and a test drives twenty decisions and asserts the window
- [ ] Entries are derived from events through `narrate`, never re-worded by the CLI
- [ ] The history is in the slot file and a reloaded Career shows the same five
- [ ] A Career with fewer than five decisions renders without padding or placeholder rows

### E7-S3 · Roster, Patrons and League views · 1 day

Three read-only screens, each one keypress away and one keypress back.

- **Roster:** name, age, Stats, Traits with their summaries, Regard for the Guildmaster with its last reason, status (available / away until Day N / injured until Day N). Sorted by status then name
- **Patrons:** grouped by Sphere, each with Regard, the reason it last moved, and what they have on the Board. A Patron at −5 is shown explicitly as posting nothing, because silence is information
- **League:** `league()` rendered in Standing order with Roster sizes, the player's row marked with a leading `>`

**Acceptance:**

- [ ] Each view fits 80 columns and pages at 20 rows with a clear "more" indicator
- [ ] Regard is shown as a number *and* its reason; a bare number is never the whole cell
- [ ] The Roster view shows a departed or dead Hero nowhere, and `formerHeroes` is reachable from it as a separate page
- [ ] The League marks the player without reordering, and shows Standing's derivation in a footer line
- [ ] All three views are pure functions from `Career` to `string[]` and are snapshot-tested

### E7-S4 · Slots, autosave and graceful quit · 0.5–1 day

- `.career/<slot>.json` per DL-02, gitignored; the slot picker lists each slot's Guild name, Day, Year and Roster size
- Writes are atomic: write to `<slot>.json.tmp`, `fsync`, rename
- `q` autosaves to the current slot and says where it went; `SIGINT` does the same
- Loading a save whose `formatVersion` does not match is refused with a sentence naming the version found and expected — never migrated (design non-goal)

**Acceptance:**

- [ ] An interrupted write never leaves a corrupt slot; a test kills the process mid-write and reloads
- [ ] Ctrl-C at any prompt autosaves and exits 0
- [ ] The slot picker reads each slot's header without deserialising the whole Career
- [ ] A mismatched `formatVersion` prints the refusal and leaves the file untouched
- [ ] A Career that has ended is loadable, shows its reckoning, and offers only "new Career" and "quit"

### E7-S5 · Errors, and reading at 40 columns · 0.5 day

Every `EngineError` code gets a sentence. `HeroRefused` becomes "Brenna will not take this one. Press `i` to insist — it will cost her Regard." `InsufficientCoin` becomes "That costs 200 coin and you have 140."

**Accessibility note.** The CLI is the only front end for a player using a screen reader, a braille display, or a phone SSH client, and all three are narrower than 80 columns.

- Width is read from `process.stdout.columns`, defaulting to 80 when it is unknown
- **Below 80 columns** the layout stacks: no columns, no tables, one label-and-value per line. Nothing is truncated with an ellipsis — it wraps
- **At or below 40 columns** headers shorten to a single word and the key hints go one per line. This is the floor, and it is tested
- Colour is never the only carrier of meaning: an injured Hero is marked `(injured)`, not merely printed in red
- `NO_COLOR` or a non-TTY stdout disables colour entirely; `TERM=dumb` or a non-UTF-8 locale falls back to ASCII with no box-drawing characters
- Every screen reads top to bottom in the order a screen reader would speak it: heading, then content, then actions

**Acceptance:**

- [ ] Every `EngineError` code has a mapped sentence, and a test asserts the map is exhaustive over the union
- [ ] No sentence names an identifier, a type or a function
- [ ] All views render at 40, 60, 80 and 120 columns with no line exceeding the width
- [ ] With `NO_COLOR=1` the output contains no ANSI escape sequence at all
- [ ] With a non-UTF-8 locale the output is pure ASCII
- [ ] A snapshot test at 40 columns is committed, so narrow-terminal breakage is a failing test rather than a discovery

---

## 2. Definition of done

- [ ] The engine is untouched: no new state, config field, event or exported function
- [ ] All prose comes from `narrate`; the CLI composes paragraphs and never writes sentences of its own except error messages and labels
- [ ] Every view is a pure `Career → string[]` function, snapshot-tested at four widths
- [ ] The scripted end-to-end test plays to Retirement, quits mid-Career, reloads and continues
- [ ] No Career is lost by any exit path: quit, Ctrl-C, or an error during a view
- [ ] Saves from E6 load unchanged
- [ ] The starting debt the design mentions and DL-06 deferred to E7 either lands here as a config field or is struck from the design in the same change

---

## 3. Known unknowns — adopted defaults

| Question | Adopted default | Change it if |
| --- | --- | --- |
| Terminal size (INPUTS 8.1) | 80×24 assumed; 40 columns supported and tested as the floor | A phone SSH client in portrait is narrower than 40 |
| Save location (INPUTS 8.2) | `./.career/`, gitignored, per DL-02 | Careers are wanted across checkouts, at which point `~/.heroesim/` |
| Keyboard layout (INPUTS 8.3) | Number keys for Commissions, letters for Heroes and views, single keypress with no Enter where unambiguous | Single-key input fights a screen reader, in which case line mode with Enter |
| Rich output (INPUTS 8.4) | ANSI colour when the terminal supports it and `NO_COLOR` is unset; ASCII box rules always; no Unicode box-drawing | — |
| How many save slots? | Three named slots plus one autosave slot | Three is not enough to keep a Career you are fond of |
| Does the history persist per slot or globally? | Per slot, in the slot file beside the Career | — |
| Is there a starting debt? | Adopted: yes, `config.startingDebt: 0` exists and defaults to **0**, so the mechanism is present and off. Set it and the first years bite | Playing a first Career shows the opening is too comfortable |

---

## 4. Technical notes

### Engine additions: none

E7 consumes the existing surface only. The full list of engine reads the CLI depends on, which is also the list that must stay stable:

```ts
standing(career)                    // E1  — header, League footer
availableHeroes(career)             // E1/E3 — commit screen
heroById / commissionById           // E1  — every view
serialiseCareer / deserialiseCareer // E1, DL-02 — slots
proposeParty(career, …)             // E2  — refusals shown before commitment
injuredHeroes(career)               // E3  — Roster status
maxCalibre(career)                  // E4  — Applicant batch view
league(career)                      // E5  — League view
employerRegard(career, heroId)      // E5  — formerHeroes and Rival Rosters
awaitingParties(career)             // E6  — the top block
narrateEvents(events, career, content) // narrate — all prose
```

If a view wants something not on this list, the selector is added to the epic that owns the data, with its own unit tests, and this list grows. It is never computed in `cli/`.

### CLI modules

```
cli/src/
  main.ts          the loop: read key, call engine, narrate, render
  screen.ts        width detection, colour and ASCII capability, wrapping
  layout.ts        the main screen
  views/roster.ts  views/patrons.ts  views/league.ts  views/hall.ts  views/former.ts
  commit.ts        Commission pick → Hero toggle → proposeParty → insist confirm → commitParty
  word.ts          the awaiting-Party screen (E6)
  history.ts       the rolling five
  slots.ts         list, load, save, autosave, atomic write
  errors.ts        EngineError code → sentence, exhaustive over the union
```

Every module under `views/` exports `render(career, width): string[]` and holds no state. `screen.ts` is the only module that reads `process.env` or `process.stdout`.

### Slot file

```ts
interface SlotFile { formatVersion: 1; savedOn: string; career: string; history: string[] }
//   career is the exact string serialiseCareer returned — the CLI never re-encodes it,
//   so DL-02's one-serialiser rule holds and the web client (E8) reads the same document.
```

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| A view quietly needs engine data and someone computes it in the CLI | The dependency list in §4 is the contract, and a lint rule forbids `cli/` from importing engine internals — only the package entry point |
| The 80-column promise breaks as content grows | A test renders 200 seeded Careers through every view at four widths and measures every line. Long Guild, Hero and Commission names are generated adversarially |
| Autosave overwrites a Career the player wanted kept | Autosave has its own slot and never writes over a named one. Quitting from a named slot asks once |
| Colour makes the output unreadable rather than clearer | Colour carries emphasis only; every state it marks is also in the text. `NO_COLOR` produces identical information |
| Narrow-terminal support is claimed but never exercised | A committed 40-column snapshot for every view, so a regression fails CI rather than surfacing on a train |
| Polish expands until E8 never starts | E7 adds nothing to the engine and nothing to content. If a story here needs either, it belongs to another epic |
