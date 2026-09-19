# Heroesim Implementation Plan — Executive Summary

**Baselined:** 2026-09-19 · **Total build: 25–34 focused days** ([the register is the source](README.md#2-epic-register)) · **Master clock: narrative coherence, not calendar**

**Status:** E1 and the first web client (E8-S1–S5) are built and verified as of 2026-09-19: 375
Vitest tests across engine, content, narrate, cli and web; 24 Playwright checks at mobile, tablet
and desktop, all on Chromium; 36 screenshots kept as evidence under `docs/verification/`.

---

## The Plan at a Glance

Eight vertical-slice epics, each delivering a complete playable game end-to-end:

1. **E1** — Core loop: take Commissions, commit Parties, resolve Beats (5–7 days)
2. **E2** — Refusals: Heroes say no; relationships matter (3–4 days)
3. **E3** — Injuries & Scars: Heroes wear history (2–3 days)
4. **E4** — Recruitment: Applicants and Standing gates (2–3 days)
5. **E5** — Rivals & League: Transfers, Poaching, Rival churn (4–5 days)
6. **E6** — Chips & mid-Commission stakes (2–3 days)
7. **E7** — Terminal UI polish and saves (3–4 days)
8. **E8** — Web front end: the same engine in a browser, three responsive layouts (4–5 days)

**Why this structure:** Each epic lands with a game you can play. No feature layers that integrate later; no "the engine is done, now we build the UI" phase. After E1, you have playable Careers. After E2, refusals matter. After E5, Rivals exist. After E7, the terminal is polished. After E8, it plays on a phone. The discipline of vertical slices prevents you from shipping a beautiful shell over an empty core.

**On E8.** It was added by [DL-01](../00-decision-log.md#dl-01--a-web-front-end-is-in-scope-as-a-second-renderer-over-the-same-engine) and it adds nothing to the engine: it is a second renderer over the same event stream, sharing the same narration package and the same save document as the terminal. It is also the only front end that can be verified across mobile, tablet and desktop, which the build goal asks for. Its first version is worth building straight after E1; parity with E7 closes it. Still zero running cost, still no network call.

**Why narrative, not calendar:** There is no GW1 deadline. Each epic starts when its dependencies are coherent and all acceptance criteria are understood. This gives you time to see what a Career *feels* like before you build systems on top of it.

---

## What You Get After E1 (the first 5–7 days)

A player can:
1. Create a Career with one button
2. Make decisions (take Commission, commit Heroes, advance time)
3. See consequences (Beats, prose reports, Coin changes)
4. Play to Retirement without intervention
5. See a reckoning (Heroes alive, Commissions completed, favorite Patron, peak wealth)
6. Load a previous save and resume

That is playable. Not pretty, not balanced, not comprehensive. **Working.**

---

## What's Already Done (the Design)

- Complete vocabulary (`CONTEXT.md`): Guild, Guildmaster, Hero, Roster, Commission, Beat, Vignette, Party, Regard, Sphere, Rivals, League, etc.
- Eight architecture decisions (`adr/`): pure engine, structured events, Traits-as-universal-currency, Vignettes, Beats-not-combat, no Guildmaster-in-Party, no Rivals-AI, snapshots-not-event-sourcing
- Full design document (`design.md`): time/loop, people, work, Rivals, Career, deliberately-not-doing, not-settled-yet

You do not need to argue about what the game *is*. That is locked. You only need to build it.

---

## What You Need to Decide (None of this blocks E1)

| Decision | Default | When |
|----------|---------|------|
| Save file format (JSON, TOML, plain text) | JSON | Anytime; E1-S7 deadline is soft |
| Career length in years | 20 years | By E1-S5, but 20 is fine |
| Board refresh cycle | Every 10 days | By E1-S4, but 10 is fine |
| Upkeep amount | 88 coin per 10 days for four Heroes (adjusted after measured play, DL-13) | Decided; retune after playing |
| Difficulty curve | Random by Patron/Sphere | By E1-S2, but random is fine |
| Vignette authoring format | Same as save format (JSON or TOML) | By E1-S8, but JSON is fine |

**The pattern:** Decide by mid-epic, but every question has a sensible default. You can always change the numbers after playing a Career and seeing what feels right.

---

## What You Don't Need (Deliberately Out of Scope)

- API keys or external services
- Hosting account or CI setup (optional; E1 is local only)
- Login, accounts, or multiplayer
- Cloud saves or sync (saves live in `./.career/`, you can git-sync if you want)
- Settings menu or save migration
- Graphical or animated display (terminal and text only)
- Mobile app (play over SSH, or on your laptop)

**Zero running cost. Zero external dependencies. Single-player, local-first.**

---

## Dependencies and Environment

**You already have:**
- Node 25.6.1 (target 22+)
- npm 11.9.0
- git 2.53.0
- GitHub CLI (gh) authenticated

**You don't need:**
- Python (this is TypeScript)
- Docker
- Any package managers beyond npm
- Any external services

**Workspace** (five npm packages, per [DL-05](../00-decision-log.md#dl-05--package-layout-engine-content-narrate-cli-web)):
```
heroesim/
  engine/        pure library (no I/O, injected RNG)
  content/       TOML content and its parser; a pure entry and a Node entry
  narrate/       events → English paragraphs, shared by both front ends
  cli/           terminal front end, file saves
  web/           React front end, browser saves (E8)
  docs/planning/ this plan, design, decisions, ADRs
```

One rule: ESLint forbids `engine/` from importing any other package, so the engine stays a library forever.

---

## How to Start E1

1. Read `docs/planning/epics/E1-core-loop.md` (the full epic spec)
2. Confirm Node 22+, npm, and your save format preference (or use JSON)
3. Create the workspace layout above
4. Build stories S1–S8 in order:
   - S1: Engine type shapes (Career, Guild, Patron, Commission, Party, Beat, Check, Vignette)
   - S2: Beat resolution (d20 Checks, Vignette slot-filling, success/failure/critical outcomes)
   - S3: Guildmaster & Backing (Stats, Traits, Regard tracking, Backing computation)
   - S4: Board & Upkeep (game loop, refresh, Rival action, Standing, Coin)
   - S5: Retirement & Insolvency (Career end, reckoning, statistics)
   - S6: CLI (event loop, narration, input, display)
   - S7: Saves (snapshots, load, multiple slots)
   - S8: Starter Vignettes (6–8 authored templates)

5. Acceptance: A player loads the CLI, creates a Career, plays to Retirement, sees a reckoning

**Estimated effort:** 5–7 focused days. Not calendar days; the FPL rebuild went 25–32 focused days in 3 calendar days. Pace as you go; quality matters more than speed.

---

## Why This Differs From FPL DOF

| Aspect | FPL DOF | Heroesim |
|--------|---------|----------|
| **Deadline** | GW1 (21 Aug 2026) — immovable | None — narrative coherence gates work |
| **Build pattern** | Horizontal layers (data → model → UI) | Vertical slices (each epic is playable end-to-end) |
| **Inputs needed** | Many (API keys, config, FPL team ID, etc.) | Almost none initially (save format is optional) |
| **Scope** | Large (38 gameweeks, live operation) | Small (one playthrough, ~20 years in-game) |
| **Multiplayer** | Single-user, but team/league IDs entered in UI | Single-user, saves in local ./.career/ |
| **External services** | FPL API, odds APIs, GitHub Pages hosting | None; pure local engine + CLI |
| **Balance** | Tuned against FPL metagame | Tuned by playing Careers yourself |

**Both use the same planning structure** (epics, stories, definition of done, decision log). The difference is pacing: FPL is calendar-driven at speed; heroesim is narrative-driven at leisure.

---

## Next Steps From You

1. **Read** the full design docs if you haven't already:
   - `docs/design.md` (2.2k words, the whole game)
   - `CONTEXT.md` (vocabulary, what words to use)
   - `docs/adr/` (eight decisions and their reasoning)

2. **Decide** (optional; defaults work):
   - Save format preference (JSON is fine)
   - Any narrative tone preferences (optional; can discover while playing)

3. **Confirm** you're OK with the E1 spec in `docs/planning/epics/E1-core-loop.md`, or ask for changes

4. **Start building** when ready — no blocking inputs

---

## Key Documents

| Document | Purpose | Length |
|----------|---------|--------|
| `README.md` | Master plan overview, epic graph, sequencing rationale, definition of done | ~180 lines |
| `E1-core-loop.md` | Full epic spec: 8 stories, acceptance criteria, technical setup, risks | ~430 lines |
| `E2`…`E8` | One spec each: stories, acceptance, adopted defaults, exact engine additions, risks | 200–270 lines each |
| `../03-solution-architecture.md` | The engine contract — state, config, content, rules, API, events, saves. Wins over any epic sketch | ~325 lines |
| `INPUTS-REQUIRED.md` | All decisions you might make, defaults, when to decide | ~180 lines |
| `../design.md` | Complete game design (already written) | ~220 lines |
| `../CONTEXT.md` | Vocabulary and terminology (already written) | ~270 lines |
| `../adr/` | Eight architecture decisions with reasoning (already written) | ~100 lines total |

Everything is in the repo at `c:\JHH\source\heroesim\docs\planning\`.

---

## The Honest Question

**"Why a month of focused days if there's no deadline?"**

Because shipping a game you want to play takes time, and rushing it makes it not fun. The epics are not a rigid schedule; they are a framework for vertical slices. If E1 takes 10 days because you got the Vignette authoring right, that is better than 5 days and a format you hate. If E2 takes 5 days because refusals turn out simple, that is better than 3 days and a mechanic that doesn't feel right.

**The discipline is the vertical slices, not the dates.** Each epic lands with a playable game; that forces good decisions about scope and coherence.

---

**Baselined:** 2026-09-19 · **Ready to start:** Whenever you are · **Estimated delivery (if all goes well, no rush): late October / early November 2026**

Questions? Read the full epic specs or ask in a follow-up.
