# Inputs Required From You

**Part of:** [Implementation Plan](README.md) · **Baselined:** 2026-09-19

Everything the build needs from you that cannot be derived from the design or code, ordered by when it is needed. Nothing here blocks the start of work; all of these have sensible defaults.

---

## The headline

**E1 needs almost nothing.** Engine design is done; implementation is the work. No API keys, no hosting account, no external configuration. It runs locally with a seeded RNG, so every run is reproducible and testable without a terminal.

The first decision that shapes the feel is the **Career length** — how many in-game years before Retirement? That should be chosen by mid-E1, but it is not blocking: a 20-year default will work fine until you decide you want 15 or 30.

---

## 1. Needed before E1 starts (pre-work confirmation)

| # | Input | Why | Default if you say nothing |
| --- | --- | --- | --- |
| 1.1 | **Confirm Node 22+** | Baseline for `typescript`, `vitest`, CLI tools. Verify with `node --version` | Proceed on Node 25.6.1 |
| 1.2 | **npm or yarn** | Package manager. Verify with `npm --version` | npm 11.9.0 already installed |
| 1.3 | **Save format preference** | JSON (fast, standard), TOML (human-readable), or plain text? | JSON — we can switch later if it feels wrong |

---

## 2. E1 — Core Loop

### E1-S2 & E1-S4: Game balance constants (decide by mid-S4)

| # | Input | Why | Default | Reasoning |
| --- | --- | --- | --- | --- |
| 2.1 | **Career length in years** | How long does a playthrough feel? | 20 years | Short enough for a weekend, long enough for narrative arc. Can be 15–30. |
| 2.2 | **Board refresh cycle** | How often do new Commissions appear? | Every 10 days | Affects rhythm and planning depth. Every 5 = frantic; every 15 = slow |
| 2.3 | **Upkeep amount** | How much does it cost to keep the Roster between Commissions? | **88 coin per 10 days** for four Heroes — 8 base plus 20 per Hero — adjusted after measured play, DL-13 | Affects economic tension. At 50 income ran at five times Upkeep and insolvency was unreachable; at 88 it runs at 1.6 times and the opening year can be lost |
| 2.4 | **Commission fee distribution** | What do jobs pay? | **45–115 coin, by difficulty** — adjusted after measured play, DL-13 | Balances Upkeep pressure and coin headroom for Hall upgrades (E3). Twenty years now ends near 30,000 coin rather than near 200,000 |
| 2.5 | **Difficulty curve** | Do Commissions get systematically harder? | Random by Patron and Sphere | Simplest; can add difficulty scaling later if campaigns feel stale |
| 2.5a | **Critical margin** | How far over the DC is a Check exceptional? | **DC + 9** — adjusted after measured play, DL-13 | At DC + 5 nearly half of all Beats were critical. At DC + 9 the mix is 30% failure, 45% success, 25% critical |
| 2.5b | **Patron Regard recovery** | How long before a Patron stops holding a grudge? | **+1 towards zero every 60 days** while negative — adjusted after measured play, DL-13 | Without it three Patrons in four had fallen silent by year 20 and one Board refresh in five was empty. A Patron is still lost by failing their work |
| 2.5c | **Passed-over dock floor** | How far can being passed over sour a Patron? | **Down to −3, and no further** — adjusted after measured play, DL-13 | A four-Hero Roster cannot take four to six postings, so the dock alone would silence every Patron in time. Only failing their own Commissions takes one below −3 |

These are all **easily tunable** — they are constants in config, not baked into the engine. Set a default and change them after playing. The defaults marked "adjusted after measured play" were changed by the E1 balance pass ([DL-13](../00-decision-log.md)), which measured 300 seeds × 20 years under the automatic policy; `content/tests/balance.measure.test.ts` is the harness, and it runs when `HEROESIM_BALANCE` is set.

### E1-S5: Career reckoning stats (decide by mid-S5)

| # | Stat | Purpose | Example |
| --- | --- | --- | --- |
| 2.6 | **Heroes alive at retirement** | Basic outcome metric | "Retired with 8 Heroes, lost 2 to Departure" |
| 2.7 | **Total Commissions completed** | Scope feel | "Took 47 jobs over 20 years" |
| 2.8 | **Favorite Patron** | Relationship highlight | "Your closest work was always with the River Towns" |
| 2.9 | **Largest coin balance** | Economic high water mark | "Wealthiest you've been: 340 coin" |
| 2.10 | **Guildmaster's final Stats** | Character arc reflection | Show starting and ending to see if they changed |

The reckoning does not need to be pretty; it is a list. You can decide which stats matter once you see what a Career feels like.

### E1-S8: Starter Vignettes

| # | Input | Format | What it gives you |
| --- | --- | --- | --- |
| 2.11 | **Tone: are Patrons comic or gritty?** | Narrative | Affects prose flavor ("The pompous merchant changed his tune" vs. "The client was furious") |
| 2.12 | **Tone: how dark can it get?** | Narrative | Can Vignettes narrate betrayal, loss, sacrifice? Or is it all triumph and funny failures? |
| 2.13 | **Tone: are commissions always payable?** | Narrative | Can a job end with "you got paid, but at cost" (Hero injured)? Or only "you got paid, all well"? |

These shape the Vignette set, but they are **not blocking**. A neutral, moderately-dark, balanced-payoff starter set will work fine; you can pivot after playing one Career.

---

## 3. E2 — Refusals and Regard

| # | Input | Why | Blocking? | Default |
| --- | --- | --- | --- | --- |
| 3.1 | **Regard decay rate** | How fast do Heroes drift away if ignored? | No | −1 per 30 days inactive |
| 3.2 | **Insistence cost** | How much Regard does forcing a refusal cost? | No | −2 Regard + risk of Departure |
| 3.3 | **Refusal Trait examples** | Which Traits allow refusals? ("Worn" → refuses work; "Craven" → refuses dangerous work?) | No | You can define these when writing Vignettes |

---

## 4. E3 — Injuries and Scars

| # | Input | Why | Blocking? | Default |
| --- | --- | --- | --- | --- |
| 4.1 | **Injury duration** | How many days before an Injury lifts? | No | 15–30 days (varies by severity) |
| 4.2 | **Hall improvements: cost and effect** | Infirmary shortens recovery by 25%? 50%? Training yard speeds Trait gain? | No | Infirmary costs 200 coin, halves injury duration |
| 4.3 | **Scar flavors** | What kinds of permanent Traits can Scars be? ("Scarred" is obvious; what else? "Haunted"? "Broken"?) | No | Decide when writing Vignette outcomes |

---

## 5. E4 — Recruitment

| # | Input | Why | Blocking? | Default |
| --- | --- | --- | --- | --- |
| 5.1 | **Applicant frequency** | How often do new people show up? | No | Every 20 days (varies with Standing) |
| 5.2 | **Standing → Applicant calibre** | High Standing = better Applicants? | No | Yes — low Standing gets 1-Star Heroes, high Standing gets 3-Star |
| 5.3 | **How many Applicants to choose from?** | Do they come one at a time, or in a batch? | No | Batch of 2–3, choose one or wait |

---

## 6. E5 — Rivals and the League

| # | Input | Why | Blocking? | Default |
| --- | --- | --- | --- | --- |
| 6.1 | **How many Rival Guilds exist?** | Affects League feel (3 Rivals = intimate; 10 = sprawling) | No | 4–6 Rivals, equally spaced in Standing |
| 6.2 | **Transfer fee formula** | How much does a Rival charge for a Hero? | No | 100 coin + 50 × (Hero's Star rating) |
| 6.3 | **Poaching mechanics: cost + risk** | Cheaper than Transfer, but costs Rival's Regard and risks retaliation | No | 50% of Transfer fee, −5 Rival Regard, they retaliate by Poaching from you |
| 6.4 | **Rival turn order** | Do all Rivals act each day, or once per Board refresh? | No | Once per Board refresh (less AI overhead) |
| 6.5 | **Published League view** | Where do League standings live? Terminal-only, GitHub Pages, Observable, personal domain? | No | Terminal-only for E5; publishing is E7 or later |

---

## 7. E6 — Chips and Tacticals

| # | Input | Why | Blocking? | Default |
| --- | --- | --- | --- | --- |
| 7.1 | **When can Chips fire?** | Mid-Commission decision point (e.g., Party sends word day 3 of 7)? Or only between Commissions? | No | Mid-Commission; rare random events (20% chance per Beat) trigger a decision |
| 7.2 | **Chip effects** | What does each Chip do? (E.g., "Double Prize" = +1.5× Commission fee; "Recall" = pull a Hero home early without penalty) | No | Define after E6 starts; balance against play feel |

---

## 8. E7 — Terminal UI and Saves

| # | Input | Why | Blocking? | Default |
| --- | --- | --- | --- | --- |
| 8.1 | **Terminal size assumptions** | Minimum width (80, 100, 120 chars)? Minimum height? | No | 80 wide, 24 tall (standard terminal). Test on mobile SSH clients too |
| 8.2 | **Save file location** | `.career/` (git-ignored), `.heroesim-local/`, or `~/.heroesim/`? | No | `./.career/` in the repo root, gitignored |
| 8.3 | **Keyboard layout** | Arrow keys + Enter, or vim keys (hjkl), or number keys for menu selection? | No | Number keys for menu (1–6 for Commissions); letter keys for Heroes (a–f) |
| 8.4 | **Rich output** | Tables with borders, ANSI colors, Unicode box-drawing? Or plain text? | No | ANSI colors yes; Unicode box-drawing only if terminal detects support |
| 8.5 | **Narrow terminals** | Is 80 columns the floor, or should it read on a phone SSH client? | No | 40 columns is the tested floor; below 80 the layout stacks rather than truncating |

---

## 8b. E8 — Web front end

Added by [DL-01](../00-decision-log.md#dl-01--a-web-front-end-is-in-scope-as-a-second-renderer-over-the-same-engine). The browser client runs the same engine and says the same words; these three are the only things it needs from you, and all three have defaults.

| # | Input | Why | Blocking? | Default |
| --- | --- | --- | --- | --- |
| 8b.1 | **Browser storage slot count** | How many Careers live in `localStorage` at once? Each is a whole Career document, so this is a storage budget as well as a preference | No | **3 named slots plus 1 autosave**, matching the CLI (8.2). A Career is a few hundred kilobytes, so four slots sit well inside any browser's quota |
| 8b.2 | **Minimum supported width** | Sets what "no horizontal overflow" is tested against, and therefore how hard the single-column layout has to work | No | **360px** is the design floor — a Pixel 7 in portrait. 320px is also tested and must not overflow, but may wrap harder. Tap targets are at least 40×40 CSS pixels at every width |
| 8b.3 | **Publish to GitHub Pages?** | The build is a static folder, so publishing is free and one click on a public repo — but it makes a private game public | No | **No.** `npm run build -w web` produces a folder you open locally, and the Playwright suite runs against that. Say yes and nothing about the build changes; only a workflow is added |

Two things this epic deliberately does **not** need from you, because the answers are already fixed: the save format (DL-02 — the browser stores exactly what the CLI writes, so a Career moves between them) and the test driver (DL-04 — Playwright on Chromium at three viewports; no Chrome extension or MCP tool is required).

---

## 9. Never needed (deliberately out of scope)

These will not be implemented, by design:

- **Account/login system** — single-player, local saves only
- **Multiplayer or shared League** — your Guild is yours
- **Save migration or versioning** — old saves may break on rule changes; that is acceptable
- **Cloud saves or sync** — saves live in `.career/` and in browser storage; neither leaves the machine
- **Settings menu in the UI** — all tuning is in a config file (not yet committed; see 1.3 above)
- **Animated or graphical view** — text only in both front ends. E7 may add ANSI colour, E8 a CSS transition; neither adds graphics
- **Mobile app** — no app store, no packaging. E8's browser client is responsive and plays on a phone from a local build; that is the whole of the mobile story
- **A server, an API or a hosted service** — the browser client runs the engine itself and makes no network request at all (DL-01, ADR-0001)

---

## How to communicate these

**For each epic, about a week before it starts, you'll get a "questions ready?" check** — a one-line reminder listing what needs a decision. If you have nothing to say, the default applies and work starts immediately. If you have thoughts, share them in the turn before the epic begins; they become the epic's constraints.

The goal: **no surprise decisions mid-epic, and no default that feels wrong once you see the game working.**

---

## What environment variables or config files do you need?

**For E1–E5:** None. The engine is seeded with a string; the CLI reads from `.career/` saves.

**For E6+** (if Chips need async event sources): You might want a `HEROESIM_CONFIG` path or a `.heroesim.toml` file in the repo root, but that is not needed yet.

**For publishing** (E8, and only if you say yes to 8b.3): You'd decide on a URL and enable GitHub Pages in the repo settings — one click on a public repo. The default is not to. No environment variables are needed for the game itself either way, because the browser client runs entirely in the page.

---

## Quick checklist: ready to start E1?

- [ ] Node 22+ installed (you have 25.6.1)
- [ ] npm or yarn available (you have npm 11.9.0)
- [ ] You've read the design docs and ADRs
- [ ] You've decided on a save format (default: JSON is fine)
- [ ] You have a sense of Career length you like (default: 20 years is fine)

**If all boxes are checked, or you're OK with the defaults, E1 is ready to start.**
