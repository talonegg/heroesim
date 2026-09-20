# E7 — Terminal UI and Saves

**Objective:** The terminal front end becomes the thing you would choose to play, and never loses a Career  
**Status:** Built and independently verified 2026-09-20 (DL-25, DL-26)  
**Estimate:** 3–4 days · **Depends on:** E5 + E6 · **Implements:** [Architecture §9](../03-solution-architecture.md#9-front-ends) · **Realises:** ADR-0002, DL-02  
**Gate:** A full Career played end to end in an 80-column terminal without reaching for the scrollback, quit and resumed from an autosave, and read at 40 columns without breaking

**Gate evidence, with both assists disclosed.** `cli/tests/e2e.test.ts`'s "the E7 gate" block spawns the real process and plays it: "plays, quits and resumes without failing", "continues to the very same Career, byte for byte", "plays a full Career to Retirement without reaching for the scrollback", "keeps the whole of an 80-column run inside 80 columns" and "reads at 40 columns without breaking". The Retirement run is assisted by **two** overrides, not one, and both are stated here because either alone would leave the reader with a false picture of how much the assist is doing: `--config startingCoin=2500` **and** `--years 1`. The first buys the Days: a keypress script cannot read the Board, so it cannot choose work it will finish, and at the shipped `startingCoin` of 500 six script shapes across three seeds went insolvent on Days 70–160 of 360, every time. The second shortens the Career to one Year, so the run reaches a Retirement inside a test's time budget rather than playing twenty Years of blind cycles. Both are honest — the gate is about the **terminal** holding up over a whole Career, not about a blind script being a good player — and neither is a balance change: they are command-line overrides in one test, and the shipped defaults are untouched.

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

- [x] **Met as amended.** Every line is ≤ 80 characters for every reachable state (file: `cli/tests/sweep.test.ts`, "renders at 40, 60, 80 and 120 columns with nothing over the width and nothing cut short"). The amendment is the shape of the fleet, not the promise: **200 seeded Careers** are played under two policies and sampled at up to three states each — 600 states — and every view including this screen is measured at **four** widths rather than one, and again after paging and again through the ASCII fallback. It also **asserts what it saw**, because a fleet that never reaches the interesting states measures a screen nobody looks at: an awaiting Party 30, an injured Hero 194, a Hero another Guild could take 52, a wronged Rival 150, a door nobody can be taken from 60, a Patron at the posting floor 13, an ended Career 50. The content is the authored content with adversarially long Guild, Hero, Patron, Sphere and Commission names injected through it. It runs in about 40 s
- [x] **Met as amended, and the amendment is the whole of [DL-26](../00-decision-log.md#dl-26--e7-verification-the-main-screen-is-laid-out-inside-a-stated-priority-order-it-enforces-an-awaiting-party-the-screen-cannot-hold-whole-becomes-a-loud-summary-and-one-named-key-every-confirmation-moves-out-of-the-loop-and-a-history-entry-never-ends-mid-clause) §1.** **Twenty-four rows, for every reachable state.** This box was ticked on a test that rendered **one** fresh-Career state, and independent verification then measured the real screen at 80 columns over **4,188 played states**: nobody waiting, 64 of 2,458 over the budget, worst 28; **one** Party waiting, **1,217 of 1,405 over (87%)**, worst 39; two waiting, all 294 over, worst 52; three waiting, all 29 over, worst 63; four waiting, both over, worst 70. As now built the screen has a **stated priority order and a budget it enforces** — RECENTLY, then the Applicants cue to one line, then the AWAY block to a one-line count, then the awaiting-Party block to the loud summary, then the AWAY count altogether; the header, the Upkeep line, the Roster line, the key hints and the **Board** never yield, and nothing is cut mid-sentence or with an ellipsis. Re-measured over the same 4,188 states after the fix: **nothing over 24 rows in any bucket, at 80 columns or at 120**. Held to a fleet rather than to one state (file: `cli/tests/rows.test.ts`, "holds every reachable state inside the budget at 80 and at 120 columns" — 40 seeded Careers, 1,482 states, asserting it saw every bucket, a block yielding, the whole word block and the summary; and "reports the worst row count it reached in each bucket"). The order itself is pinned in `cli/tests/layout.test.ts`, "yields in the stated order and never out of it", "keeps the header, the Upkeep, the Roster and the keys at every rung" and "never gives up the Board, whatever the budget"
- [x] The Upkeep timer, coin, Day and Roster size are always visible (file: `cli/tests/layout.test.ts`, "always shows the Guild, the Day, the Year, the coin and Standing", "always shows the Upkeep owed and the Days until it", "always shows how big the Roster is", "keeps the Upkeep, the coin, the Day and the Roster whatever it gives up" — which drives the row budget until the history is gone and asserts the four are still there — and "keeps the header, the Upkeep, the Roster and the keys at every rung", which walks the whole priority order)
- [x] **Met as amended** (DL-26 §2). An awaiting Party (E6) displaces the Board as the top block and cannot be ignored — **whole** where the rows are there for it, and as a **loud summary** naming who waits, on what, how long they have waited and how many Days are left, soonest first, where they are not. Two or more Parties waiting is always the summary, at every width, because their prompts and options never fit one screen; the summary points at `w`, which opens the Word view where every prompt and every option is whole, paged at twenty rows like every other view, and a single keypress still answers. A number answers only in the whole form, where the options are numbered in front of the player, and the key hints say which of the two is true (files: `cli/tests/layout.test.ts`, "displaces the Board as the top block", "cannot be ignored: the keys say a number answers them", "is the summary at every width when two or more are waiting", "names who is waiting, on what, how long, and how long is left, soonest first", "sends the player to the key that shows the whole of it", "still displaces the Board and still cannot be ignored", "shows one Party whole where the rows are there for it" and "says in the keys exactly what is true in each case"; `cli/tests/rows.test.ts`, which asserts the Word view kept every prompt and every option whole at every waiting state of the fleet; `cli/tests/e2e.test.ts`, "makes the waiting Party the loudest thing on the screen", "shows the prompt and the options whole behind w, and answers there" and "refuses to advance while a Party waits, and says which and for how long", driving the real process)
- [x] **Met as amended.** Nothing is printed that the player cannot act on from this screen. The amendment is one removal: the Board row no longer carries the Patron's name, because the title, fee, difficulty, span and Beats already fill 80 columns and a second line per Commission costs six of the twenty-four rows. The Patron is on the commit screen before anybody is sent, and in the Patrons view with their Regard, which is where it is acted on
- [x] Numbers are grouped with a thin separator and coin is never abbreviated (files: `cli/tests/screen.test.ts`, "groups a four-figure sum and never abbreviates coin"; `cli/tests/layout.test.ts`, "groups a four-figure sum and never abbreviates coin", which asserts `1,140 coin` and that no `1.1k` appears anywhere on the screen)

### E7-S2 · The history of the last five decisions · 0.5 day

A rolling window of what the player did and what came of it, held by the CLI — never by the engine, which has no memory of decisions as decisions.

- Each entry is one `narrate` paragraph, trimmed to two lines at 80 columns and above, and given its first sentence whole under a Day stamp of its own below 80 (DL-26 §4)
- Entries are Day-stamped and cover: Parties committed, Parties returned, insistence, Departure, harm, Hall purchases, Transfers, Decisions answered
- It survives save and load, because it is part of the CLI's own slot file alongside the Career

**Acceptance:**

- [x] Exactly five entries, oldest dropped, and a test drives twenty decisions and asserts the window (file: `cli/tests/history.test.ts`, "keeps exactly five, oldest dropped, over twenty decisions")
- [x] Entries are derived from events through `narrate`, never re-worded by the CLI (file: `cli/tests/history.test.ts`, "remembers a Party going out, in narrate's own words", which asserts the entry is character for character the Day stamp plus the paragraph `narrateEvents` returned). A `Paragraph` carries no event type, so the filtering happens **before** the narration rather than after it — a Hall purchase arrives as a `coin` paragraph exactly as Upkeep does, and the two cannot be told apart afterwards (DL-25 §14)
- [x] The history is in the slot file and a reloaded Career shows the same five (files: `cli/tests/history.test.ts`, "is saved beside the Career and comes back identical"; `cli/tests/slots.test.ts`, "gives back exactly the Career that was saved, and the history beside it")
- [x] A Career with fewer than five decisions renders without padding or placeholder rows (file: `cli/tests/history.test.ts`, "renders fewer than five with no padding and no placeholder rows")
- [x] **Added by the build, and corrected by verification** (DL-26 §4, superseding DL-25 §14). Trimming is the one cut E7 sanctions, and until DL-26 it cut at a **word** boundary where no sentence was in range — which at 40 columns, where a sixteen-column Day stamp leaves about sixty characters, stopped **every** entry before the thing it was about to say: "Year 2, Day 120 · Elswith Greyeye set out on The tithe barge down to". There was no ellipsis, so the shared no-cut helper passed. As now built: at 80 columns and above it is still two lines and it ends at a **sentence** boundary where there is one in range and at a **clause** boundary — the author's own comma, semicolon, colon or dash, kept as `narrate` wrote it — where there is not; **below 80 columns the Day stamp takes a line of its own and the entry is given the lines its first sentence needs**, because the screen is stacked and scrolls there anyway. Never mid-word, never on a word that merely points at the next one, and never with an ellipsis (file: `cli/tests/history.test.ts`, "cuts at a sentence boundary where there is one in range", "cuts at a clause boundary where there is no sentence in range", "never ends mid-word, never on an ellipsis, and never on a word pointing forward", and the whole of "a history entry never ends mid-clause" — the three entries a verifier read off a real 40-column screen, adversarially long Hero, Patron and Commission names at four widths, and the five-entry window). The entry is stored **whole**, so the same five reloaded at another width trim to that width rather than to the one they were saved at ("is stored whole and trimmed at render time, so the width never reaches the file")

### E7-S3 · Roster, Patrons and League views · 1 day

Three read-only screens, each one keypress away and one keypress back.

- **Roster:** name, age, Stats, Traits with their summaries, Regard for the Guildmaster with its last reason, status (available / away until Day N / injured until Day N). Sorted by status then name
- **Patrons:** grouped by Sphere, each with Regard, the reason it last moved, and what they have on the Board. A Patron at −5 is shown explicitly as posting nothing, because silence is information
- **League:** `league()` rendered in Standing order with Roster sizes, the player's row marked with a leading `>`

**Acceptance:**

- [x] Each view fits 80 columns and pages at 20 rows with a clear "more" indicator (files: `cli/tests/views.test.ts`, "renders at 80 with nothing over the width and nothing cut short" and the same at 40, 60 and 120; `cli/tests/screen.test.ts`, "repeats the heading and says which page this is", "breaks at a blank line so an entry is never split down the middle" and "loses no line across the pages"; `cli/tests/e2e.test.ts`, "pages a view that does not fit, with a clear indicator", driving the real process)
- [x] Regard is shown as a number *and* its reason; a bare number is never the whole cell (files: `cli/tests/views.test.ts`, "never shows a bare number for Regard: the reason is beside it" for the Roster and "groups by Sphere and gives each Patron a Regard and the reason it last moved" for the Patrons)
- [x] The Roster view shows a departed or dead Hero nowhere, and `formerHeroes` is reachable from it as a separate page (files: `cli/tests/views.test.ts`, "shows a departed or dead Hero nowhere" and "says how each one went, and when"; `cli/tests/e2e.test.ts`, "opens each of them and comes back on one keypress")
- [x] The League marks the player without reordering, and shows Standing's derivation in a footer line (files: `cli/tests/views.test.ts`, "marks your own row and does not move it for being yours" and "puts Standing's derivation in a footer, word for word with the browser"; `cli/tests/e2e.test.ts`, "marks your own row in the League with a leading arrow, and explains Standing"). The footer is now one sentence in `narrate` rather than a copy in each front end (DL-25 §15)
- [x] All three views are pure functions from `Career` to `string[]` and are snapshot-tested (file: `cli/tests/views.test.ts`, "is the same text as last time, at 40" and the same at 60, 80 and 120, over all **seven** views rather than three — the Hall, the former Heroes, the Applicants and the other Guilds moved to the same shape). Every one is `render(career, width, content?)`, holds no state and reads no terminal: colour is applied at the output boundary in `screen.ts`, which is what makes the signature possible (DL-25 §8)
- [x] **Added by the build.** The Roster says where an away Hero is **in full** and abbreviates nowhere, which retires DL-24 §A2a's fifteen-column `no sooner, 3d` (file: `cli/tests/views.test.ts`, "says where an away Hero is, in full and never abbreviated"; DL-25 §7)

### E7-S4 · Slots, autosave and graceful quit · 0.5–1 day

- `.career/<slot>.json` per DL-02, gitignored; the slot picker lists each slot's Guild name, Day, Year and Roster size
- Writes are atomic: write to `<slot>.json.tmp`, `fsync`, rename
- `q` autosaves to the current slot and says where it went; `SIGINT` does the same
- Loading a save whose `formatVersion` does not match is refused with a sentence naming the version found and expected — never migrated (design non-goal)

**Acceptance:**

- [x] An interrupted write never leaves a corrupt slot; a test kills the process mid-write and reloads (file: `cli/tests/slots.test.ts`, "leaves the slot that was already there intact, and the next save repairs the rest" — a child process is killed while it holds the very temporary file a save writes to, and the slot beside it still loads with its history; "writes over a stale temporary file from a killed write rather than appending to it"; "renames over an existing slot, which is the whole of the atomic write on Windows")
- [x] **Met as amended, and the amendment is where the last step is proved rather than whether it is.** Ctrl-C at any prompt autosaves and exits 0. What the suite proves: the handler writes the autosave and says where it went (file: `cli/tests/loop.test.ts`, "writes the autosave and says where it went"); the loop installs it on the process that owns the Career ("is installed on the real process by the loop that owns the Career"); and, in a **spawned Node process** that loads the CLI’s own modules and sits at a prompt, the program registers exactly one `SIGINT` listener and running it autosaves a Career that loads again and leaves exit code 0 ("registers on SIGINT, autosaves and exits 0 when it runs"). **Delivery itself is proved by hand, and it is provable:** a PowerShell sharing the child's console calls `kernel32!SetConsoleCtrlHandler(NULL, TRUE)` to deafen itself and then `kernel32!GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0)` — a real Ctrl-C from the operating system — and the child printed `Interrupted. The Career is autosaved to …` and the slot reloaded. Done twice, with no new dependency. It is **left out of the automated suite** because it needs the runner to share and deafen a console, which is not safe inside a Vitest run: the same console-wide event would take the runner down with the child. `process.kill(pid, 'SIGINT')` on Windows is the thing that cannot do it — it terminates through `TerminateProcess` and runs no handler (DL-25 §12, corrected 2026-09-20)
- [x] The slot picker reads each slot's header without deserialising the whole Career (file: `cli/tests/slots.test.ts`, "carries a header the picker can read without deserialising the Career" and "reports each slot with the Guild, the Day, the Year and the Roster size"; `cli/tests/e2e.test.ts`, "lists what is saved, with the Guild, the Day, the Year and the Roster size"). This is **§4's `SlotFile` amended**: those four facts live inside the `career` string, so the shape §4 sketches could not answer this box at all; the file carries a `header` written from the Career by one function, and a test asserts it agrees with the document it wraps (DL-25 §9)
- [x] A mismatched `formatVersion` prints the refusal and leaves the file untouched (file: `cli/tests/slots.test.ts`, "refuses a slot format it does not read, naming both versions, and changes nothing", which compares the bytes on disk before and after; "refuses a save whose Career is written by another engine format version"; "reports a slot format it does not read, rather than pretending to know what is in it" for the listing)
- [x] A Career that has ended is loadable, shows its reckoning, and offers only "new Career" and "quit" (file: `cli/tests/loop.test.ts`, "is loadable, shows its reckoning, and offers only a new Career and quitting", which also asserts the Board and the ordinary keys are **gone**; "takes b for a new Career, and nothing else for anything else"; "clears its own autosave rather than leaving one dangling"). Beginning a new Career is `b` and deliberately **not** `n`: a player who has been pressing `n` to let the Days run must not start one by muscle memory the moment this one ends (file: `cli/tests/input.test.ts`, "does not take n for a new Career")

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

- [x] Every `EngineError` code has a mapped sentence, and a test asserts the map is exhaustive over the union (file: `cli/tests/errors.test.ts`, "has a sentence for every code, and a different one for each", exhaustive by `satisfies Record<EngineErrorCode, true>` so a new code fails the build until somebody writes its sentence). **There is one map and it is `narrate`'s**: `cli/src/errors.ts` is a re-export and a test proves the file holds no other code at all ("is narrate's, re-exported and not copied"), because E8-S2 moved `errorSentence` into the shared package so both front ends say the same thing about the same rejection
- [x] No sentence names an identifier, a type or a function (file: `cli/tests/errors.test.ts`, "names no identifier, no type and no function"). Audited beside it against the vocabulary's avoid-list ("uses the vocabulary and none of the words it forbids") and against the rule that a sentence must be something a person can act on ("tells the player something they can do about it")
- [x] All views render at 40, 60, 80 and 120 columns with no line exceeding the width (files: `cli/tests/views.test.ts` and `cli/tests/layout.test.ts` at four widths on both ordinary and adversarially long names; `cli/tests/sweep.test.ts` over 600 played states). Every width assertion is one shared helper that holds **both** halves of the rule at once — no line over the width **and** no line cut short — because three verifiers in a row caught a `clip`ped line that passed a width-only test
- [x] With `NO_COLOR=1` the output contains no ANSI escape sequence at all (files: `cli/tests/screen.test.ts`, "is off under NO_COLOR, whatever the terminal is" and "puts no escape at all into the output when it is off"; `cli/tests/e2e.test.ts`, "puts no ANSI escape at all in the output under NO_COLOR", which spawns the real process with `--colour` **and** `NO_COLOR=1` set, because the environment beats the command line)
- [x] With a non-UTF-8 locale the output is pure ASCII (files: `cli/tests/screen.test.ts`, "maps every mark the game prints, one character for one" and "leaves nothing a 7-bit terminal cannot show"; `cli/tests/e2e.test.ts`, "is pure ASCII under a locale that is not UTF-8", which checks every character of a whole spawned session). The transform is applied in `screen.ts` at the output boundary and **not** in `narrate`, whose words are shared with the browser
- [x] A snapshot test at 40 columns is committed, so narrow-terminal breakage is a failing test rather than a discovery (files: `cli/tests/__snapshots__/views.test.ts.snap` and `layout.test.ts.snap`, written at 40, 60, 80 and 120 for every view and for the main screen)

---

## 2. Definition of done

- [x] **Met as amended, and the amendment is §0's own contradiction with §3, named and resolved.** The engine gains **no state, no event and no new function**. It gains exactly two things: `config.startingDebt`, which §3's adopted default requires and the last box below is about; and a **re-export** of `postingPatrons`, which has been in `board.ts` since E1 and is what `refreshBoard` itself asks — the Patrons view has to say a Patron is posting nothing and must not decide for itself where the floor is, which is the rule DL-18 followed and §4 states (files: `engine/tests/e7-additions.test.ts`; `content/tests/e7-starting-debt.test.ts`; DL-25 §§1–2)
- [x] **Met as amended.** All prose comes from `narrate`; the CLI composes paragraphs and never writes sentences of its own except error messages and labels. Four sentences the two front ends were keeping **identical copies** of moved into `narrate` in this change — `STANDING_EXPLAINED`, the turn-back sentence, the sentence that says another Guild could take a Hero, and the difficulty band — and the web keeps its own selector names as pass-throughs (file: `narrate/tests/e7-words.test.ts`; DL-25 §15). The amendment is the handful the terminal still writes, each of them a **label or a hedge on one** rather than a sentence about the world: `back no sooner than …, and later the longer they wait` in the Away block and the Roster (DL-24 §A2a's wording, kept), `available` / `away until` / `injured until`, the three Hall effects, the Applicants cue, the reason a move cannot be made, and the confirmations that state what a keypress will cost
- [x] Every view is a pure `Career → string[]` function, snapshot-tested at four widths (file: `cli/tests/views.test.ts`, seven views × four widths, plus `cli/tests/layout.test.ts` for the main screen). The signature is `render(career, width, content?)`: colour is applied at the output boundary in `screen.ts`, so no view takes a palette and no view makes a presentation decision (DL-25 §8)
- [x] The scripted end-to-end test plays to Retirement, quits mid-Career, reloads and continues (file: `cli/tests/e2e.test.ts`, "plays a full Career to Retirement without reaching for the scrollback", "says where the autosave went when the player leaves" and "continues to the very same Career, byte for byte")
- [x] No Career is lost by any exit path: quit, Ctrl-C, or an error during a view (file: `cli/tests/loop.test.ts` — "autosaves and says where it went", "autosaves when the input simply runs out", "autosaves the Career before it says a word about it" with a **throwing view injected**, and "writes the autosave and says where it went" for the interrupt handler; what an interrupt test can and cannot prove on Windows is stated in E7-S4's box above)
- [x] Saves from E6 load unchanged (file: `cli/tests/slots.test.ts`, "a save written before E7 wrapped one" — "loads, with an empty history", "is listed with its Guild, Day, Year and Roster size all the same", "is left exactly as it was by reading it"). A bare `serialiseCareer` string is what every save E1 to E6 wrote, so reading both shapes is what this box **requires**, not a migration (DL-25 §10)
- [x] The starting debt the design mentions and DL-06 deferred to E7 lands here as a config field: `config.startingDebt`, defaulting to 0, taken out of the opening float and out of `ledger.peakCoin` with it and **tracked nowhere afterwards** (files: `engine/tests/e7-additions.test.ts`, "opens the Guild short by the debt it inherited" at a non-default 137, "is inert at its default: the same seed gives the same Career, byte for byte" over 400 played Days, "emits no event of its own, even when it is set", "takes its default in a save written before it was named"; `content/tests/e7-starting-debt.test.ts`, "is read in exactly one file, and that file is world generation"). It is visible to the player because the coin line is the true balance from Day 1, and because `narrate` names it once at the opening when it is non-zero (file: `narrate/tests/e7-words.test.ts`, "is said once, at the opening, when there is one" and "says nothing at all when there is none")

---

## 3. Known unknowns — adopted defaults

| Question | Adopted default | Change it if |
| --- | --- | --- |
| Terminal size (INPUTS 8.1) | 80×24 assumed; 40 columns supported and tested as the floor | A phone SSH client in portrait is narrower than 40 |
| Save location (INPUTS 8.2) | `./.career/`, gitignored, per DL-02 | Careers are wanted across checkouts, at which point `~/.heroesim/` |
| Keyboard layout (INPUTS 8.3) | Number keys for Commissions, letters for Heroes and views, single keypress with no Enter where unambiguous. **As built**, with one exception the build added: a keypress that **spends coin** always takes a second, confirming one (DL-20 §6, settled in DL-25 §3), and `r` is the Roster with the other Guilds on `o`, which is what E7-S1's own mock draws (DL-25 §13) | Single-key input fights a screen reader, in which case line mode with Enter |
| Rich output (INPUTS 8.4) | ANSI colour when the terminal supports it and `NO_COLOR` is unset; ASCII box rules always; no Unicode box-drawing | — |
| How many save slots? | Three named slots plus one autosave slot | Three is not enough to keep a Career you are fond of |
| Does the history persist per slot or globally? | Per slot, in the slot file beside the Career | — |
| Is there a starting debt? | Adopted: yes, `config.startingDebt: 0` exists and defaults to **0**, so the mechanism is present and off. Set it and the first years bite. **As built** (DL-25 §1): an opening deduction and nothing else — the Guild opens at `startingCoin - startingDebt` and `ledger.peakCoin` with it, nothing is tracked afterwards, no event is emitted and no draw is taken, so at 0 the game is bit for bit what it was. This is §0's "nothing lands in the engine" yielding to this row, which is a decision already taken | Playing a first Career shows the opening is too comfortable |

---

## 4. Technical notes

### Engine additions: none

E7 consumes the existing surface only. The full list of engine reads the CLI depends on, which is also the list that must stay stable:

```ts
standing(career)                    // E1  — header, League footer
availableHeroes(career)             // E1/E3 — commit screen
heroById / commissionById           // E1  — every view
serialiseCareer / deserialiseCareer // E1, DL-02 — slots
upkeepDue(career)                   // E1  — Upkeep's cost, shown before it is owed (DL-18)
daysUntilUpkeep / daysUntilBoardRefresh(career) // E1 — the status line's two clocks (DL-18)
yearOf(day, config) / dayOfYear(day, config)    // E1 — the Year a Day falls in (DL-18)
proposeParty(career, …)             // E2  — refusals shown before commitment
injuredHeroes(career)               // E3  — Roster status
unavailableAmong(career)            // E3  — who on the Roster cannot be sent, and why (DL-18)
maxCalibre(career)                  // E4  — Applicant batch view
applicantById(career, id)           // E4  — one Applicant, by id
acceptRefusal(career, applicantId)  // E4  — why an offer cannot be taken, and the shortfall (DL-19 §8)
applicantOffers(career)             // E4  — every Applicant waiting, with the Days they have left
league(career)                      // E5  — League view
employerRegard(career, heroId)      // E5  — formerHeroes and Rival Rosters
rivalById(career, id)               // E5  — one other Guild, by id
rivalHeroById(career, heroId)       // E5  — one of their people, and who employs them
souredRivals(career)                // E5  — who is taking more off your Board, and why
rivalOffers(career, rivalId)        // E5  — both fees and both refusals, before the coin is spent
rivalHeroOffer(career, rivalId, heroId)  // E5 — the same for one person
transferFee / poachFee(hero, config)     // E5 — what each move costs
isPoachable(regard, config)         // E5  — the one predicate, in both directions
retaliationRisks(career)            // E5  — who on your Roster another Guild could take, and by whom (DL-22 §2)
hasRoomForAnother(rival, config)    // E5  — whether a wronged Guild can take anybody at all (DL-22 §2)
awaitingParties(career)             // E6  — the top block
wordOffers(career, content)         // E6  — every Party waiting, with both clocks, which option
                                    //       the timeout takes, and whether each can be taken now
wordOffer(career, partyId, content) // E6  — the same for one Party
turnBackFee(fee, score, beatCount, config) // E6 — what calling a Commission off would pay
projectedReturn(career, partyId)    // E6  — the earliest Day a waiting Party can be home (DL-24 §A2a)
turnBackOutcome(career, partyId, content) // E6 — what calling THIS Party home would pay, before
                                    //       it is chosen; also on the offer's turnBack option (DL-24 §A2b)
postingPatrons(career)              // E1  — who is posting, and so who is posting nothing (DL-25 §2)
narrateEvents(events, career, content) // narrate — all prose
wordProse(subject, career, content)    // narrate — a Decision's prompt and its option labels
errorSentence(code, ctx)               // narrate — the one map, re-exported by cli/src/errors.ts
reckoningLines(reckoning, career)      // narrate — what the Guild became, the harm line included
formatDay(day, career) / joinNames     // narrate — the Day as a player reads it, and a list of names
difficultyWord(difficulty, config)     // narrate — one set of band words for both front ends (DL-25 §5)
atRiskSentence / turnBackSentence / STANDING_EXPLAINED  // narrate — words both front ends share
```

**E7 added one read of its own, and it is a re-export** (DL-25 §2). The Patrons view has to say that a Patron at the floor is posting nothing, and "the floor" is `patron.regardForGuild.value > config.patronPostsAboveRegard` — a rule. `postingPatrons` has been in `engine/src/board.ts` since E1 and is what `refreshBoard` itself asks; it is now re-exported from `engine/src/index.ts`, attributed to **E1**, which owns the Board and the Patrons, exactly as DL-18 §1 re-exported `unavailableAmong`. No behaviour changed and no rule was added.

If a view wants something not on this list, the selector is added to the epic that owns the data, with its own unit tests, and this list grows. It is never computed in `cli/`. It already has: `upkeepDue`, the two countdowns, `yearOf`/`dayOfYear` and `unavailableAmong` were added ahead of E7 itself, once `web`'s and the CLI's own front-end code were both found restating them (DL-18), so that this epic still adds none of its own. E4 added `applicantById`, `acceptRefusal` and `applicantOffers` beside the `maxCalibre` this list already named, under the same rule (DL-19 §8). E5 added `rivalOffers` and `rivalHeroOffer` beside the `league` and `employerRegard` this list already named — "can this Hero be brought over or taken right now, and if not why, and for how much", answered before the coin is spent — with `rivalById`, `rivalHeroById`, `souredRivals`, `transferFee`, `poachFee` and `isPoachable` for the readings a view needs around them (DL-21 §10). E5's verification added two more under the same rule (DL-22 §2): `retaliationRisks`, because both front ends were showing a Hero's Regard and marking nowhere the line at which another Guild can take them, and `hasRoomForAnother`, because a wronged Guild whose own Roster is full is harmless and neither front end said so. Both share the predicates `retaliate` itself uses, so a view can never say something the next Board refresh contradicts. E6 added `wordOffers` and `wordOffer` beside the `awaitingParties` this list already named, under the same rule (DL-23 §9): a screen that shows a Party's options has to know what each one costs, **which of them the Guild can take now** — coin moves while a Party waits, so affordability cannot be frozen at the moment the word arrived — which one the timeout will take, and how many Days are left before it does. None of it is computed in `cli/`, and none of it carries a word of prose: `narrate`'s `wordProse` fills the prompt and the labels from content. E6's verification added the last two under the same rule (DL-24 §A2), and they land here rather than in E7 precisely because **E7 adds nothing to the engine**: `projectedReturn`, because both front ends were showing a waiting Party's `returnsOn` and it is a Day that will slip; and `turnBackOutcome`, because `turnBackFee` was exported but a view would have had to assemble its four arguments — the fee, the score with the option's own Consequences already applied, and the Beat count — which is a rule restated in a front end.

**E7 also inherits one open question about the CLI, and one answer.** DL-20 §6 raised that accepting an Applicant and buying a Hall improvement each take one bare keypress while insisting takes two, which protects the free action and not the 80–250 coin one; that is still E7's to settle for those screens. E5's own two coin spends — a Transfer at 150–250 and a Poaching at 75–125 — already take a second confirming keypress, and E7 should make the older screens match rather than the other way about.

### CLI modules

```
cli/src/
  index.ts         three lines: the entry point `npm run play` and every spawned test use
  main.ts          the loop: read key, call engine, narrate, render
  screen.ts        width detection, colour and ASCII capability, wrapping, paging, coin
  layout.ts        the main screen, and the narration after a step
  views/roster.ts  views/patrons.ts  views/league.ts  views/hall.ts  views/former.ts
  views/applicants.ts  views/rivals.ts  views/shared.ts   (shared.ts renders nothing)
  commit.ts        Commission pick → Hero toggle → proposeParty → insist confirm → commitParty
  word.ts          the awaiting-Party screen (E6)
  history.ts       the rolling five
  slots.ts         list, load, save, autosave, atomic write
  confirm.ts       the screens that ask for the second keypress (DL-26 §3)
  errors.ts        a re-export of `narrate`'s one map, and nothing else
```

**As built**, with four notes. `confirm.ts` is the fourth: every screen that asks for a confirming keypress — the Hall, an Applicant, a move between Guilds, a paid Decision option and quitting from a named slot — is a pure function there rather than a block inside the loop, because the E5 verification's five tests about a Transfer confirmation that claimed a consent the Rival had refused had nowhere to live once the loop held the text (DL-26 §3). `views/applicants.ts`, `views/rivals.ts` and `views/shared.ts` are beside the five §4 names: the first two were already views in all but name, and `shared.ts` holds the readings several of them make of a Career — where every Hero is, who is takeable — asked once so that two screens can never describe one person differently. `index.ts` survives as the entry point so that `npm run play` and every spawned end-to-end test keep pointing at one path while the modules behind it move. And `errors.ts` is a re-export rather than a map, because `errorSentence` lives in `narrate` where E8-S2 put it, with one exhaustive switch over the union that both front ends read.

Every module under `views/` exports `render(career, width, content?): string[]` and holds no state. `screen.ts` is the only module that reads `process.env` or touches the terminal, which `cli/tests/screen.test.ts` asserts by scanning the source; a lint rule forbids `cli/` from reaching into another workspace's source rather than its package entry point.

### Slot file

```ts
interface SlotHeader { guildName: string; day: number; year: number; rosterSize: number; seed: string; ended: boolean }
interface SlotFile { formatVersion: 1; savedOn: string; header: SlotHeader; career: string; history: string[] }
//   career is the exact string serialiseCareer returned — the CLI never re-encodes it,
//   so DL-02's one-serialiser rule holds and the web client (E8) reads the same document.
```

**`header` is the one field the build added** (DL-25 §9), and it is what makes E7-S4's own acceptance box reachable: the Guild, the Day, the Year and the Roster size live **inside** the `career` string, so a picker reading the shape sketched above would have to parse and walk the whole document. The header is written from the Career by one function, and `cli/tests/slots.test.ts` asserts it agrees with the document it wraps. Three slots are named — `one`, `two`, `three` — beside one `autosave`, which nothing but an autosave ever writes. A **bare `serialiseCareer` string**, which is every save E1 to E6 wrote, is read rather than refused, with an empty history; that is what the definition of done's "saves from E6 load unchanged" requires, and nothing on disk is rewritten by reading it (DL-25 §10).

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
