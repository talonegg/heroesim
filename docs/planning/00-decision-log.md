# Decision log

Significant decisions taken during the build, recorded before or alongside implementation. Append a new entry; never edit an accepted one — supersede it with a later entry that names it. Architecture decisions taken during the design session live in [`../adr/`](../adr/) and are not repeated here.

Format: `## DL-nn — title`, then Status, Date, Context, Decision, Consequences.

---

## DL-01 — A web front end is in scope, as a second renderer over the same engine

**Status:** Accepted · **Date:** 2026-09-19

**Context.** The design is terminal-first and says workspaces arrive "when a second front end actually exists, not before". The build goal set on 2026-09-19 requires the finished game to be verified by browser testing across mobile, tablet and desktop views. A terminal program cannot be verified that way; a browser front end can. ADR-0001 and ADR-0002 already anticipate a graphical client that renders the same event stream.

**Decision.** Add an epic, **E8 — Web front end**, delivering a responsive browser client built with Vite and React that runs the engine in the browser, uses the same narration layer as the CLI, and stores saves in the browser. The terminal CLI remains the reference front end and is built first (E1-S6). The repository becomes npm workspaces now, because the second front end now exists.

**Consequences.** Narration is a shared package so both front ends say the same thing. Content (Vignettes, Traits, names) must be loadable without Node file I/O. The web client adds Vite, React and Playwright as development dependencies; it adds no running cost and no external service.

## DL-02 — Saves are JSON snapshots; the CLI writes files, the web client writes browser storage

**Status:** Accepted · **Date:** 2026-09-19

**Context.** INPUTS-REQUIRED §1.3 offered JSON, TOML or plain text with JSON as the default. ADR-0004 fixes snapshots over replay.

**Decision.** The engine exposes `serialiseCareer(career): string` and `deserialiseCareer(text): Career`, producing a JSON document with a top-level `formatVersion`. The CLI stores slots at `.career/<slot>.json` (gitignored). The web client stores the same document in `localStorage` under `heroesim.career.<slot>`. The RNG state is part of the snapshot so a loaded Career continues on the same random path as an unsaved one.

**Consequences.** One serialiser, two storage adapters. No migration is attempted; a save whose `formatVersion` does not match is rejected with a clear message, as the design permits.

## DL-03 — Vignettes and other content are TOML files in a `content` package; conditions and consequences are data

**Status:** Accepted · **Date:** 2026-09-19

**Context.** E1-S2 proposed TOML "or JSON if TOML feels heavy". The E1 skeleton sketched `conditions` and `consequences` as TypeScript functions, which cannot live in a content file. The epics definition of done placed Vignettes under `engine/src/vignettes/`, but the engine must not read files and the web client must bundle them.

**Decision.** Content lives in `content/` as TOML: `content/vignettes/*.toml` (one Vignette per file), `content/traits.toml`, `content/spheres.toml` and `content/names.toml`. Vignette conditions, slot rules and consequences are declarative data validated by the engine at load. The `content` package parses TOML text into typed objects with `smol-toml`; it has a pure entry (text in, objects out) used by the web bundle and a Node entry that reads the directory for the CLI. The engine receives parsed content and never sees a file.

**Consequences.** Adding a Vignette is adding a file. The set of consequence kinds is a small closed vocabulary owned by the engine; a new kind is an engine change, a new Vignette is not. This supersedes the location given in the epics README definition of done.

## DL-04 — Verification: engine API contract tests in Vitest; browser tests with Playwright on Chromium at three viewports

**Status:** Accepted · **Date:** 2026-09-19

**Context.** The build goal requires "API testing" and "Chrome plugin browser testing including mobile, tablet and desktop views". The engine has no HTTP surface by design; its API is its exported functions. No Chrome MCP tool is connected in the build environment; Playwright 1.63 is.

**Decision.** "API testing" is a dedicated contract suite, `engine/tests/api.test.ts`, that exercises the public surface: determinism from seed, input immutability, serialise round-trip, typed rejection of invalid calls, and full-Career smoke runs across many seeds. The CLI gets a scripted end-to-end test that drives the real process over stdin. Browser testing uses Playwright driving Chromium with three projects: mobile (Pixel 7), tablet (iPad Mini) and desktop (1280×800), asserting layout, no horizontal overflow, tap-target size and a playable journey, and capturing screenshots as evidence.

**Consequences.** If a Chrome-specific tool becomes available later the same specs can run against it; the assertions do not depend on the driver.

## DL-05 — Package layout: engine, content, narrate, cli, web

**Status:** Accepted · **Date:** 2026-09-19

**Context.** Follows from DL-01 and DL-03.

**Decision.** Five npm workspaces at the repository root:

| Package | Purity | Job |
| --- | --- | --- |
| `engine` | pure, no dependencies | world state, rules, Checks, Beats, events, serialisation |
| `content` | pure entry + Node entry | TOML text → typed content; the content files themselves |
| `narrate` | pure | events + world + content → English paragraphs |
| `cli` | Node | terminal front end, file saves |
| `web` | browser | React front end, browser saves |

ESLint forbids `engine` from importing any other workspace and forbids `Math.random`, `Date.now` and `new Date()` inside `engine` and `narrate`.

**Consequences.** The engine's only inputs are a seed, content and player decisions. Everything a test needs is constructible in memory.

## DL-06 — E1 balance defaults adopted from INPUTS-REQUIRED; a year is 360 Days

**Status:** Accepted · **Date:** 2026-09-19

**Context.** The design leaves the numbers open. The owner has not overridden the defaults offered in INPUTS-REQUIRED.

**Decision.** `GameConfig` defaults: Career 20 years; a year is 360 Days (12 months of 30); Board refreshes every 10 Days; Upkeep 50 coin every 10 Days; starting coin 500; Board holds 4–6 Commissions; Commission fees 80–200 coin by difficulty; a Commission runs 5–10 Days with 3–5 Beats; Check DCs 8–15; Stats 1–5; d20 Checks with critical at DC+5; one Rival takes one unclaimed Commission per refresh. Insolvency is coin below zero at two consecutive Upkeeps. Every number is a named field on `GameConfig`, overridable per Career and stored in the save.

**Consequences.** Balance is tuned by changing config, not code. The starting debt mentioned in the design is deferred to E7 polish; E1 starts at the configured coin with no debt.

## DL-07 — The RNG is a seeded xoshiro128** whose state is part of the Career

**Status:** Accepted · **Date:** 2026-09-19

**Context.** ADR-0001 requires injected randomness; E1-S7 requires a loaded Career to behave identically to an unsaved one.

**Decision.** The engine implements a small xoshiro128** generator seeded by hashing the seed string. Its four 32-bit words live on the Career and are serialised with it. Engine functions are pure: each takes a Career and returns a new Career plus events, never mutating its input.

**Consequences.** Same seed and same decisions give the same story on any machine. Tests can assert exact event sequences.

## DL-08 — Beat narration templates are content; the engine emits identifiers, the narrate package fills slots

**Status:** Accepted · **Date:** 2026-09-19

**Context.** ADR-0002 forbids prose in the engine, yet Vignettes carry narrative templates.

**Decision.** A `BeatResolved` event carries the Vignette id, the outcome and the resolved slot bindings (hero id, patron id, sphere id, trait name). The narrate package looks up the Vignette's template for that outcome and fills tokens such as `{hero}`, `{hero.they}`, `{patron}`, `{sphere}` and `{guildmaster}` from the world snapshot. Heroes carry pronouns so templates read correctly.

**Consequences.** Engine tests never see a sentence. Rewording a Vignette changes no test.

## DL-09 — E1 additions to the engine contract: Commission tags, a Party score, a bounded record of finished work, the rule and world-generation constants on `GameConfig`, and Injuries that lift

**Status:** Accepted · **Date:** 2026-09-19

**Context.** Building E1 against [solution architecture](03-solution-architecture.md) §2–§8 turned up five places where the contract is silent but the code cannot be. Vignette selection matches on "the Commission's tags" (§5) and the `Commission` in §3 carries none. Commission score accumulates across Beats and from `score` consequences, and `Party` in §3 has nowhere to hold it. A committed Commission leaves the Board and its Party is removed on return, so `commissionById` — and therefore `narrate`'s `{commission}` token — would have nothing to resolve. §5 states several balance numbers as literals (±1 Patron Regard, +1 Rival Standing, the −4 posting floor, the d20, the 5..20 DC clamp, the ×10 Standing scale) and world generation needs a dozen more (Stat totals, starting Regard bands, how many bonds), while CLAUDE.md invariant 8 makes a balance literal in rules code a defect. And `TraitLifted` is in the E1 event union while the rule that fires it is deferred to E3, which over twenty years leaves every Hero permanently carrying every Injury they ever took.

**Decision.**

1. `Commission` gains `tags: string[]`, copied from the Sphere's entry for that title. Vignette selection reads them from there.
2. `Party` gains `score: number`, the Commission's running score, reported on `PartyReturned`.
3. `Party` gains `commission: Commission`, the record itself, and `Career` gains `recentCommissions: Commission[]` — the last `config.recentCommissionsKept` (24) finished Commissions, newest first. `commissionById` searches the Board, then Parties, then that list. Bounded, so a save stays small.
4. `GameConfig` gains named fields for every remaining rule constant and every world-generation number, defaulted to the values §5 and this epic state. The §3 fields keep their DL-06 defaults unchanged.
5. An Injury whose `liftsOn` has arrived is removed at the start of the Day and reported with `TraitLifted`. Giving a Trait somebody already holds extends the span rather than duplicating it. E3 still owns the infirmary, the Hall and everything else about Injuries.

**Consequences.** All five are additions: no existing field changes shape and no event member changes (ADR-0002's rule that later epics only add still holds). `narrate` can resolve `{commission}` for any Beat or return in the events of a call. Balance is tuned by editing `defaultConfig`, which the E1 contract suite's retirement-rate assertion is allowed to drive; it did not need to. Under the automatic policy the defaults as written reach Retirement on all two hundred seeds of the contract suite's fixture world, and on 188 of two hundred over the authored content, the other twelve ending in insolvency.
