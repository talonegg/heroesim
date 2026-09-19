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

## DL-10 — All three browser projects run on Chromium; the tablet is an iPad-class viewport, not WebKit

**Status:** Accepted · **Date:** 2026-09-19 · **Supersedes:** the "iPad Mini" wording of [DL-04](#dl-04--verification-engine-api-contract-tests-in-vitest-browser-tests-with-playwright-on-chromium-at-three-viewports)

**Context.** DL-04 fixed three Playwright projects — mobile, tablet and desktop — and named the tablet one "iPad Mini". In Playwright's device registry `devices['iPad Mini']` carries `defaultBrowserType: 'webkit'`, so taking that device literally pulls in a second browser engine. The owner's stated requirement is Chrome-engine browser testing across mobile, tablet and desktop views; a WebKit run is neither asked for nor verifiable against that requirement, and it doubles the browser download on a machine that has no need for it.

**Decision.** All three projects run on Chromium. The tablet project is an iPad-class **viewport** on Chromium — 820×1180 at `deviceScaleFactor: 2`, with `isMobile` and `hasTouch` set — rather than the iPad Mini device descriptor. `mobile` stays `devices['Pixel 7']` and `desktop` stays Desktop Chrome at 1280×800. WebKit is not installed and is not run.

**Consequences.** What DL-04 set out to prove — the three layouts, no horizontal overflow, tap targets, the journey — is proved on the engine the owner uses, at the widths that matter. The assertions still do not depend on the driver, so a WebKit or a Chrome-MCP run can be added later without touching a spec. Safari-specific rendering is not covered by this suite, and nothing in the client is written against a WebKit quirk; if the game is ever shown on an iPad this is the gap to close first.

## DL-11 — An ended Career is an empty Step from `advance`, a rejection from `commitParty`; and `deserialiseCareer` refuses a document it can only half-believe

**Status:** Accepted · **Date:** 2026-09-19

**Context.** Independent verification of the E1 engine turned up two places where the contract in [solution architecture](03-solution-architecture.md) §6 and §8 is silent and the code had to choose. First, §6 lists `CareerEnded` as one of `commitParty`'s rejections and says nothing about what the two advancing calls do once a Career has ended; `advance` and `advanceUntilAttention` both return an empty `Step`. Second, §8 says `deserialiseCareer` "checks the structural shape", and the check stopped at the outside of `ended.reckoning`: a save whose reckoning was a table but not a reckoning loaded without complaint and then threw a `TypeError` out of `cloneCareer` on the next call — a half-world let in at the boundary and blowing up somewhere else.

**Decision.**

1. Advancing an ended Career is not an error. `advance` and `advanceUntilAttention` return `{ career, events: [] }`, and the two agree; `commitParty` alone throws `EngineError('CareerEnded')`, because it is a decision the world can no longer honour and a front end must be told. Time passing over a finished Career is a no-op a front end may poll without a `try`.
2. `deserialiseCareer` validates the whole of `ended.reckoning`, including `guildmasterStats.start` and `.end` and the optional `favouritePatron`, and refuses a value outside its union for `pronouns`, a Regard's `nature`, an entry of `beatsResolved` and `ended.reason`, as well as a `liftsOn` that is not a number and a non-string entry in `tags`, `heroIds`, `vignettesUsed` or `hall`. The two answers a save may get are a `SaveError` naming the field, or a Career the engine can go on using. Never a `TypeError` two calls later.

**Consequences.** Both are pinned by tests: `engine/tests/loop.test.ts` holds the empty-Step rule beside the `commitParty` rejection, and `engine/tests/save.test.ts` corrupts every one of the four hundred-odd paths through a fully populated save seven ways each and requires a `SaveError` or a Career that still advances. The save format is unchanged and `formatVersion` stays 1 — nothing this engine ever wrote is now refused, only documents that were already malformed. A front end that stores its own extra keys alongside a Career is still tolerated: unknown fields are not rejected, but the engine drops them on the next call, so a front end must keep its own state in its own document.

## DL-12 — The narration contract: a `commit` Paragraph, a `partyId` that groups a report, strict Day order, and two flags that let the CLI be driven by a file

**Status:** Accepted · **Date:** 2026-09-19

**Context.** Building `narrate` and the CLI against [solution architecture](03-solution-architecture.md) §9 turned up three places where the sketch there cannot be taken literally. §9 gives `Paragraph = { kind: 'beat' | 'return' | 'board' | 'coin' | 'end' | 'note'; text; day }` and says narration "groups a Party's Beats and its return into one report". A Party is committed on one Day and its Beats fall on later ones, so a report cannot be one contiguous block without reordering paragraphs out of Day order — and Day order is what makes a stretch of advanced Days readable. `PartyCommitted` also has no kind in that list, yet it is the one event that reports a decision the player just made. Separately, §9 says the CLI uses `node:readline`, which cannot be driven by a test without a pseudo-terminal, while DL-04 requires "a scripted end-to-end test that drives the real process".

**Decision.**

1. `Paragraph` gains a seventh kind, `commit`, for `PartyCommitted`, and an optional `partyId`. `narrateEvents` returns paragraphs in the order the events happened, which is Day order and never anything else. A report is the paragraphs sharing a `partyId` — its Beats, the notes attached to them, and the `return` that closes it — so both front ends can group a report without either of them reordering time.
2. Accounting events never get a paragraph of their own. A coin movement from a fee or a Consequence is folded into the `beat` or `return` that caused it; a Regard movement and a Trait given or lifted fold into one short `note` carrying the Day it happened on and, where it belongs to one, the `partyId`; `ConsequenceApplied` is silent, because the movement it announces arrives as its own event with the clamping applied, and a score change is already told by the Beat.
3. The CLI takes `--script <file>`, which reads commands from a file one per line instead of from the terminal, and `--quiet`, which drops the Board redraw between commands so that only the narration is printed. They are the seam the end-to-end test drives, and they are the same code path as a terminal session — the only difference is where a line comes from.

**Consequences.** This supersedes the `Paragraph` shape in §9 and nothing else; it is an addition, so a front end that switches on the six kinds §9 lists still compiles and merely ignores `commit`. The Day-order guarantee is pinned by `narrate/tests/stream.test.ts` over a real one-year Career, and the report grouping by an assertion that every `return` shares its `partyId` with at least one earlier `beat`. The CLI's end-to-end test spawns the real process with `node --import tsx`, so nothing in the loop is mocked, and the two flags are ordinary flags a player may also use.

## DL-13 — The E1 balance pass: Commission score counted once, a wider critical margin, Patron Regard that recovers, and an economy where coin is tight

**Status:** Accepted · **Date:** 2026-09-19 · **Supersedes:** the Upkeep, fee and critical-margin lines of [DL-06](#dl-06--e1-balance-defaults-adopted-from-inputs-required-a-year-is-360-days) — "Upkeep 50 coin every 10 Days", "Commission fees 80–200 coin by difficulty" and "critical at DC+5" — and the "188 of two hundred over the authored content" figure in DL-09's consequences

**Context.** DL-06 adopted the INPUTS-REQUIRED defaults unplayed, and E1 shipped without anyone measuring what twenty years of them felt like. An independent verification of 500 seeds × 20 years under the automatic policy over the real authored content found one defect and three balance failures, and a measurement harness reproduced every one of them at 300 seeds:

| | Before |
| --- | --- |
| retirement rate | 93.7% |
| final coin, mean / median | 152,941 / 196,185 |
| Beat mix (failure / success / critical) | 29.5% / 24.9% / 45.5% |
| mean margin over DC | 3.61 |
| Patrons at or below the −4 posting floor at year 20 | 73.1% |
| Board refreshes that left the Board empty | 20.8% |
| fee income against Upkeep, per year | 9,548 against 1,800 (5.3×) |

1. **The Commission score was counted twice (F9).** The engine adds `scoreCritical`/`scoreSuccess`/`scoreFailure` per Beat *and* every one of the thirty authored outcomes carried an identical `{ kind = "score", delta = … }` consequence, so every Beat was worth twice what the rule says. A Commission of three Beats cleared its threshold on one good Beat.
2. **Criticals were the common outcome (F8).** 45.5% of Beats were critical against 24.9% ordinary successes, which flattens the Check: the band between "it worked" and "it went perfectly" barely existed.
3. **Patrons ratcheted down into silence (F6).** Every refresh docked one Patron a point for work the Roster was never large enough to take, gains were wasted against the +5 clamp, and four Heroes can only cover about two of the four to six postings. By year 20 three Patrons in four had gone quiet and one refresh in five posted nothing at all — a death spiral, and the largest threat to the game staying interesting.
4. **Coin was never a decision (F7).** Income ran at five times Upkeep and insolvency was unreachable after year two, against the design's "Coin is tight".
5. Two smaller defects: `{trait}` could be admitted where the Hero the slot resolved to need not hold it (F11), and `deserialiseCareer` returned the parsed document as a `Career`, so a front end's extra keys survived until something else happened to clone it (F13).

**Decision.**

1. **The per-Beat increment is the rule; content adds score only for the exceptional (F9).** All thirty `score` consequences are removed from `content/vignettes/*.toml` and from the engine's test fixture. The `score` consequence kind stays supported and is pinned by a test of its own, so an authored outcome can still be worth more than its result — it simply is not how ordinary Beats are scored. This is what solution architecture §5 already said; §4's illustrative TOML block still shows the doubled form and should be read as illustration rather than as a pattern to copy.
2. **`criticalMargin` 5 → 9 (F8).** Nothing else about the Check moves: Stats generation, DCs and the difficulty pivot are untouched. Eight was tried first, as the verification suggested, and left criticals at 29.4% — outside the 15–25% target; nine puts all three bands inside it without shifting a single DC.
3. **A Patron's disappointment fades (F6a).** New `patronRegardRecoveryEveryDays` (60): a Patron whose Regard for the Guild is negative recovers one point towards zero every sixty Days, reported as `PatronRegardChanged` with reason `"time passed"`. Regard at or above zero is untouched — goodwill is earned, and its decay belongs to E2. Zero switches the rule off, which is how the two "nobody will post" tests hold their world still.
4. **Being passed over never silences a Patron (F6b).** New `patronPassedOverAboveRegard` (−3): the `patronRegardOnPassedOver` dock applies only while that Patron's Regard is strictly above it. The guard sits one point above the posting floor, so no Patron can be argued into silence by work they were never asked for. Failing a Patron's own Commission still docks them without limit, so a Sphere can still be lost — by failing its Patron, which is the only way it should be losable.
5. **The economy is rescaled so that coin is a decision (F7).** `upkeepPerHero` 12 → 20 and `upkeepBase` 2 → 8, so a four-Hero Roster owes 88 every ten Days rather than 50; `feeMin` 80 → 45 and `feeMax` 200 → 115. Failure still pays nothing. Fee income now runs at 1.6× Upkeep rather than 5.3×, and the starting 500 coin is about six Upkeeps of runway.
6. **`{trait}` is admitted only when the slot and the condition agree (F11).** `validateContent` now requires both a `with_trait:X` Hero slot *and* a `conditions.requiresTrait` naming the same `X` before a narrative may carry `{trait}`. Neither alone keeps the promise the prose makes: the slot falls back to any Party member when nobody holds `X`, and the condition only says that *somebody* in the Party does. The validator route was taken rather than dropping the binding in the engine because `narrate`'s `fillTokens` throws a `NarrationError` on an unfilled token, which would turn a wrong sentence into a crash. Alongside it, `fillHeroSlot` reports a slot Trait only when the Hero it resolved to actually holds it, so `BeatResolved.slots.trait` never names a Trait its Hero lacks either.
7. **`deserialiseCareer` returns `cloneCareer(parsed as Career)` (F13).** Unknown fields are dropped at the boundary, deliberately and in one place, rather than riding along until the next call. This narrows the timing of DL-11's "the engine drops them on the next call" to "the engine drops them on load"; nothing a front end may legitimately keep in its own document changes.

**Consequences.** Measured over 300 seeds × 20 years under the same automatic policy, after all of the above:

| | Before | After | Target |
| --- | --- | --- | --- |
| retirement rate | 93.7% | 87.0% | at least 80% |
| final coin, mean / median | 152,941 / 196,185 | 29,720 / 30,430 | low tens of thousands |
| Beat failure | 29.5% | 29.9% | 25–35% |
| Beat success | 24.9% | 44.9% | 40–50% |
| Beat critical | 45.5% | 25.2% | 15–25% |
| mean margin over DC | 3.61 | 3.53 | — |
| Patrons at or below the floor at year 20 | 73.1% | 14.2% | under 25% |
| refreshes that left the Board empty | 20.8% | 0.6% | under 5% |
| fee income against Upkeep, per year | 9,548 / 1,800 | 5,100 / 3,168 | Upkeep must bite |
| Commissions taken per year | 76.1 | 95.5 | — |
| Commissions that succeed | 81.7% | 62.5% | — |

A Guildmaster who sends one weak Hero alone at the hardest work on the Board fails about half of the first two years' Commissions and goes insolvent on all 100 seeds, at a median of Day 120: insolvency is reachable again, which the design says is the only way to lose. Under the automatic policy nearly every insolvency falls inside the first two years, so the opening is where a Career is now lost and the 500 starting coin is the whole of the buffer. That is deliberate, and E3's Hall and E4/E5's Transfers will add sinks rather than relief; if the opening proves too sharp to play, `startingCoin` is the dial to turn, not the fee scale.

The measurement is committed as `content/tests/balance.measure.test.ts`, skipped unless `HEROESIM_BALANCE` is set, so the next balance pass starts from these numbers rather than from a fresh argument; `HEROESIM_BALANCE_CONFIG` takes `GameConfig` overrides, so a candidate default is measured before it is adopted. `engine/tests/api.test.ts` keeps its assertions unchanged — the fixture world still retires on 198 of 200 seeds — and two Check assertions in `check.test.ts` are rewritten off `config.criticalMargin` rather than off the number it happened to hold, which is what they should have said from the start. INPUTS-REQUIRED §2 carries the changed defaults.
