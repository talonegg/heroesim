# E8 — Web front end

**Objective:** The same engine, the same words, in a browser that works on a phone  
**Estimate:** 4–5 days · **Depends on:** E1 (first version), E7 (parity) · **Implements:** [DL-01](../00-decision-log.md#dl-01--a-web-front-end-is-in-scope-as-a-second-renderer-over-the-same-engine), [Architecture §9](../03-solution-architecture.md#9-front-ends) · **Realises:** ADR-0001, ADR-0002, DL-01, DL-02, DL-04, DL-05  
**Gate:** Playwright plays a Career at three viewports — new Career, commit a Party, advance until it returns, read the report, save, reload, load — with no horizontal overflow at 360px

**Status:** Built and independently verified 2026-09-20 (DL-27, DL-28). S1–S5 verified 2026-09-19; S6, the three earlier boxes that were open and the definition of done verified 2026-09-20 — nine defects and gaps found and fixed, seven design questions raised, both in [§6](#6-what-independent-verification-raised-for-the-owner).

---

## 0. What lands in E8

- **A Vite + React client** that runs the *same* engine package in the browser. No server, no API, no network call of any kind
- **Three responsive layouts**, by width, exactly as the architecture §9 specifies
- **Saves in `localStorage`** under `heroesim.career.<slot>`, holding the same document the CLI writes to a file (DL-02)
- **Content bundled** with `import.meta.glob`, parsed by the `content` package's pure entry — no file I/O reaches the browser
- **The same `narrate` package as the CLI**, so both front ends say the same thing about the same events
- **Playwright specs** at Pixel 7, iPad Mini and 1280×800, with screenshots kept under `docs/verification/`

**A first version is buildable on E1 alone** — Board, commit, advance, report, save. It is worth building there, because a browser is the only place the responsive work can be discovered early. **Parity with E7** — Roster, Patrons, League, Hall, Applicants, awaiting Parties, history — is what closes this epic.

**Deliberately deferred:**

- Any server, any hosting, any account. Zero running cost is a hard requirement, not a preference
- Service workers, offline install, PWA manifest. The page is static and already works offline once loaded
- Routing. One page, panes and a bottom bar (architecture §9: "no router")
- Animation beyond a CSS transition on a pane change
- Publishing to GitHub Pages (INPUTS 8b.3 — default no; `npm run build` produces a folder you can open)
- Touch gestures, drag-to-assign, long-press menus. Taps and a keyboard

---

## 1. Stories

### E8-S1 · Workspace, bundling and the pure content entry · 0.5–1 day

The repository is already npm workspaces (DL-05). `web` joins them and imports `engine`, `content` and `narrate` as source.

```ts
const files = import.meta.glob('../../content/**/*.toml', { query: '?raw', import: 'default', eager: true })
const content = validateContent(parseContent(files as Record<string, string>))
```

`parseContent(files: Record<string, string>): unknown` is the `content` package's **pure entry**: text in, objects out, no `fs`. If it does not exist yet — E1 built only the Node entry — it is added here and the Node entry is refactored to call it, so there is one parser.

**Acceptance:**

- [x] `npm run build -w web` produces a static bundle that opens from the filesystem (`npm run build -w web`, `vite.config.ts`: `base: './'`)
- [x] The built bundle contains no reference to `fs`, `node:*` or `process` (`web/scripts/check-bundle.mjs`, run after every build)
- [x] A unit test asserts the browser content and the Node content are deep-equal for the same files (`web/tests/content.test.ts`: "is deep-equal to the content the Node entry reads from disk")
- [x] ESLint forbids `web` from importing `cli`, and `engine` from importing either (`eslint.config.js`: `no-restricted-imports` blocks `engine/**` from importing any sibling; `web/tests/engine-imports.test.ts`: "nothing in web/src imports the terminal front end" enforces the `web`-forbids-`cli` half as a Vitest check rather than an ESLint rule)
- [x] A build-time check fails if the bundle contains `fetch(`, `XMLHttpRequest` or a URL literal outside a comment (`web/scripts/check-bundle.mjs`)

### E8-S2 · State, and one place decisions are made · 1 day

The engine is pure; React holds one `Career` and replaces it.

- A single `useReducer` whose actions are the engine calls: `commit`, `insist`, `advance`, `answer`, `accept`, `decline`, `transfer`, `poach`, `improveHall`
- Every action produces `{ career, events }`; the reducer stores the new Career and appends narrated paragraphs to a report log
- `EngineError` is caught at the reducer boundary and surfaced as a dismissible message using **the same code-to-sentence map the CLI uses** (`errors.ts` moves to `narrate` so both front ends share it)
- Nothing in `web/` computes a rule. If a component needs a number, a selector from the engine provides it

**Acceptance:**

- [x] One reducer; no component calls an engine function directly, enforced by a lint rule on imports (the "lint rule" is `web/tests/engine-imports.test.ts`: "are types only, except under `state/` and in `content.ts`" — a Vitest check over the source, not an ESLint rule)
- [x] The Career is never mutated — a test freezes it and drives twenty actions (`web/tests/careerReducer.test.ts`: "never mutates the Career it was given, over twenty actions")
- [x] Every `EngineError` code renders as a sentence, and the map is shared with the CLI, not copied (`web/tests/careerReducer.test.ts`: "turns every EngineError into a sentence rather than a crash"; `narrate/tests/errors.test.ts`: "has a sentence for every code"; `web/src/words.ts` re-exports `errorSentence` from `@heroesim/narrate`, the same function `cli/src/index.ts` imports)
- [x] Narrated paragraphs are identical to the CLI's for the same seed and decisions, asserted by a cross-package test (file: `web/tests/narration-parity.test.ts`, "says the same thing, paragraph for paragraph, with the terminal as the expected side" and "says the same thing at every single decision, not merely over the whole run"). One decision list, taken on both sides from the ids in the Career each has in hand, drives **26 decisions** and compares **142 paragraphs**: a Party committed, an insistence, stretches of Days, a return, a Hall purchase, an Applicant taken on and one declined, a Transfer, a refused Poaching, a waiting Party answered with a free option, with a paid one and with a turn-back, and a Party that acted on its own judgement — the last read off the engine's own `PartyAnswered.byDefault` so the list cannot claim a kind it did not reach ("exercises every kind of decision E8-S6 names"). The terminal side is its **own renderer**, `cli/src/layout.ts`'s `narrationLines`, read back at a width that wraps nothing, so a re-wording at either front end's own boundary fails the test — proved once by making `narrationLines` rewrite "came back" as "returned", which failed three of the six assertions, and then restored. It lives in `web/tests/` and loads the terminal's module by **file URL**, as `web/tests/save-interop.test.ts` does, because ESLint forbids `web` importing `cli` and `web/tsconfig.json`'s `rootDir` makes a static import a compile error (DL-27 §11)
- [x] Rapid repeated taps on `advance` cannot interleave two engine calls (`web/tests/careerReducer.test.ts`: "drops a second engine action that arrives before the first has settled"; `web/tests/app.test.tsx`: "two taps on Advance in one batch drive one engine call, not two")

### E8-S3 · Three layouts · 1–1.5 days

| Width | Layout |
| --- | --- |
| **< 600px** | Single column, bottom bar: **Board · Roster · Report**. One pane at a time, the bar always reachable with a thumb |
| **600–1023px** | Two columns: Board and Roster side by side, Report below, or Report replacing Roster on demand |
| **≥ 1024px** | Three panes: Board, Roster, Report, all visible at once |

Secondary views — Patrons, League, Hall, Applicants, former Heroes — are a sheet over the current pane on mobile and a fourth pane on desktop. An awaiting Party (E6) takes over the Report pane and raises a bar badge on mobile.

**Acceptance:**

- [x] Breakpoints are CSS container queries or media queries, never JavaScript width branching (`web/src/styles.css`: `@media (min-width: 600px)` / `(min-width: 1024px)`; no `innerWidth`, `matchMedia` or `resize` anywhere under `web/src`)
- [x] No horizontal scrolling at 320, 360, 414, 768, 1024 and 1280px, asserted by measuring `scrollWidth` against `clientWidth` (`web/e2e/layout.spec.ts` via `expectNoHorizontalOverflow` in `web/e2e/helpers.ts`, run at `WIDTHS = [320, 360, 414, 768, 1024, 1280]`)
- [x] Every interactive element is at least 40×40 CSS pixels, asserted by measuring every `button` and `a` in every pane (`web/e2e/layout.spec.ts` via `expectTapTargets` in `web/e2e/helpers.ts`)
- [x] Text reflows rather than truncating; no `text-overflow: ellipsis` on a Hero, Patron or Commission name (`web/src/styles.css`: "Names wrap; they are never cut off with an ellipsis (E8-S3)")
- [x] The bottom bar does not overlap content at the bottom of a scrolled pane (`env(safe-area-inset-bottom)` respected) (`web/src/styles.css`: `padding-bottom: calc(var(--tap) + 1.5rem + env(safe-area-inset-bottom))`)
- [x] At 200% browser zoom on the desktop viewport the layout falls back to the tablet arrangement rather than overflowing (file: `web/e2e/zoom.spec.ts`, "a desktop window at 200% zoom falls back to the tablet arrangement", run on all three projects). Zoom is emulated as what it is — a 1280×800 window at 200% is a **640×400 CSS-pixel viewport at `deviceScaleFactor: 2`**, so `innerWidth` reads 640 and every media query re-runs there; the spec asserts both numbers and both breakpoints before it asserts anything about the layout. Pinch zoom (`Emulation.setPageScaleFactor`) and a CSS `zoom`/`transform` were rejected because they leave the layout viewport alone and the check would pass without testing anything (DL-27 §12). What is asserted: the panes grid computes to **two** columns, the bottom bar is hidden, Board and Roster share a row with the Report under them, no horizontal overflow in the document or any scrollable container, and every tap target still at least 40×40. Evidence: `docs/verification/desktop/zoom-200.png`

### E8-S4 · Saves in the browser · 0.5 day

```ts
localStorage.setItem(`heroesim.career.${slot}`, serialiseCareer(career))
```

The stored string is **exactly** what `serialiseCareer` returns (DL-02). A slot index at `heroesim.slots` holds each slot's Guild name, Day, Year and Roster size for the picker, so listing slots never deserialises a Career.

**Acceptance:**

- [x] `config.webSlotCount` slots, plus one autosave slot written after every action (`web/tests/storage.test.ts`: "has three named slots and an autosave" — `webSlotCount` is not a `GameConfig` field, per §3's adopted default; the three named slots plus the autosave are `web/src/state/storage.ts`'s `NAMED_SLOTS` and `AUTOSAVE_SLOT`)
- [x] A save written by the web client deserialises in Node, and a `.career/*.json` file pasted in loads in the browser — a test does both directions (file: `web/tests/save-interop.test.ts`, "a slot file the CLI wrote, opened in the browser" and the web-to-CLI direction beside it, with the terminal's real `cli/src/slots.ts` loaded by file URL on the other end). Closed 2026-09-19 by that test, which post-dated the audit that left this box open; ticked here with its evidence
- [x] `QuotaExceededError` is caught and reported as a sentence naming the slot; nothing is silently dropped (`web/tests/storage.test.ts`: "reports a full quota as a sentence naming the slot, and drops nothing silently")
- [x] A refused `formatVersion` prints the refusal and leaves the stored document untouched (no migration — design non-goal) (`web/tests/storage.test.ts`: "refuses a save whose formatVersion does not match, and leaves it untouched")
- [x] Clearing a slot asks once and cannot be undone by a reload (`web/tests/app.test.tsx`: "asks once before clearing a slot"; `web/tests/storage.test.ts`: "clearing a slot empties it and drops it from the index")
- [x] Private-browsing mode, where `localStorage` throws on write, degrades to in-memory play with a visible warning (`web/tests/storage.test.ts`: "degrades to memory when localStorage throws, and says so")

### E8-S5 · Playwright, three devices, one journey · 1–1.5 days

Three projects on Chromium (DL-04): **mobile** Pixel 7, **tablet** an 820×1180 Chromium viewport, **desktop** 1280×800. The tablet project is an iPad-class *viewport* on the Chromium engine, not the Playwright `iPad Mini` device (which pulls in WebKit) — DL-10 supersedes the "iPad Mini" wording used when this story was drafted. Every project runs the same journey against a **built** bundle served locally:

1. New Career from a fixed seed
2. Read the Board; open a Commission; toggle two Heroes; commit
3. Advance until the Party returns
4. Read the report and assert a named Hero appears in it
5. Save to slot 1
6. Reload the page
7. Load slot 1 and assert the Day, coin and Roster match what was saved

Plus, per project: no horizontal overflow, tap targets ≥ 40px, and a screenshot of each layout written to `docs/verification/<project>/`.

**Acceptance:**

- [x] The journey passes on all three projects against a production build (`web/e2e/journey.spec.ts`, run across the `mobile`/`tablet`/`desktop` projects in `web/playwright.config.ts`)
- [x] The seed is fixed, so the assertions name an actual Hero and an actual Commission, not a placeholder (`web/e2e/helpers.ts`: `FIXED_SEED`; `web/e2e/journey.spec.ts` asserts a sent Hero's name appears in the report)
- [x] Screenshots are committed under `docs/verification/` and regenerated by `npm run e2e -w web` (`docs/verification/{mobile,tablet,desktop}/` — 12 images per project, 36 in total; `web/e2e/layout.spec.ts` writes them via `VERIFICATION_DIR`)
- [x] The overflow and tap-target checks run on every pane and every sheet, not just the landing view (`web/e2e/layout.spec.ts`, looping over `board`, `roster`, `report`, `party`, `slots`, plus the start screen and the reckoning)
- [x] A network-request listener asserts **zero** requests leave the origin during the whole journey (`web/e2e/journey.spec.ts`: the `page.on('request', ...)` listener and the `offOrigin` assertion)
- [x] The suite fails, not skips, if the bundle has not been built (`web/playwright.config.ts`: throws if `dist/index.html` is missing)

### E8-S6 · Parity with the terminal · 0.5 day

Once E7 has landed, the browser gains what the terminal has: Roster with Traits and Regard, Patrons by Sphere, League, Hall, Applicants, awaiting Parties, the rolling history, the reckoning.

**Acceptance:**

- [x] Every CLI view has a browser counterpart reading the same selectors listed in [E7 §4](E7-terminal-ui-and-saves.md#4-technical-notes). The three the browser did not have are built: **Patrons by Sphere** (`web/src/panes/Patrons.tsx`, off `patronsBySphere`, which reads the engine's own `postingPatrons` — files: `web/tests/parity.test.tsx`, "groups by Sphere and gives each Patron a Regard and the reason it last moved", "says what each Patron has on the Board, or that they have nothing on it", "says explicitly that a Patron at the floor is posting nothing", "names every Sphere in words, and never as an identifier"; `web/e2e/parity.spec.ts`, "the Patrons sheet groups by Sphere and says who is posting nothing"); **former Heroes** (`web/src/panes/Former.tsx`, off `formerCards` — "says how each one went, and when", "keeps their Traits and their Regard readable", "is newest first", "shows a departed or dead Hero nowhere on the Roster"; `web/e2e/parity.spec.ts`, "the former Heroes sheet says how each one went, and when"); and **the rolling five** (`web/src/panes/History.tsx`, off `narrate`'s own `entriesFrom`/`remember` — "keeps at most five, newest last", "is narrate’s own words, Day-stamped and never re-worded here", "renders every entry whole, with its Day stamp above it", "renders fewer than five with no padding and no placeholder rows"; `web/e2e/parity.spec.ts`, "the history holds the last five, and fewer than five with no padding" and "the history survives a save, a reload and a load"). The Roster gained the one thing it was missing, each Trait's **summary** (file: `web/tests/parity.test.tsx`, "gives every Trait the summary content gives it"). **Met as amended on one point** (DL-27 §7): E8-S6's fourth way a person goes, "taken by another Guild", is not an exit the engine records — `moveHero` takes a poached Hero off `formerHeroes` and puts them on that Guild's Roster — so both front ends' former-Heroes views show the three the engine does record, and the fourth is read on the other Guilds sheet and on the reckoning's own `Taken by another Guild` line
- [x] The reckoning renders and a finished Career offers only "new Career". **Met as amended twice — once at build time (DL-27 §9) and once by independent verification, which found the build-time amendment was not true of every ended Career.** `Shell.tsx` gated every control on `hasEnded` but **not** the Waiting-on-your-word pane: `waiting` was `wordCue(career).waiting > 0` alone, so a Career that ended while a Party was still standing mid-Commission kept the pane, its options, its countdown and its "leave it to their judgement and let the Days run" — a decision nobody can take, about a Career nobody can change. It is not a contrived state: a sweep of sixty seeds at `careerYears: 1` reached it on **nine** of them, and the one ended Career the tests used happened to be among the fifty-one that did not, so `expect(queryByTestId('pane-word')).toBeNull()` was passing vacuously. The gate is now `word.waiting > 0 && !ended`, and the state is reached on purpose (`web/tests/parity.test.tsx`, "asks for no word on a Party the Days can never reach again"). The header carried the same class of fault: it printed `Next Upkeep … in N Days · Board refreshes in N Days` under a reckoning, and a committed screenshot carried it — nothing falls due on a Guild that has finished and the Board will never refresh again. Both clocks are now hidden when `career.ended` is set, while the Day, the coin and the Standing stay, because those are what the Guild ended with ("says nothing about an Upkeep that will never fall due or a Board that will never refresh", with "shows both clocks while the Career is still running" beside it so the pair cannot pass by the cues having been deleted outright). The terminal never had either fault: `cli/src/main.ts`'s `readTheEnding` does not draw the main screen at all. The build-time amendment, unchanged: a finished Career offers no **decision about itself** — Advance, the Board's commit path, the Applicants, the Hall, the other Guilds' deals, the Saves control and the Word controls are all gone, and the header's cues go with them — and keeps the views that are only reading: the League, the Patrons, the former Heroes, the rolling five and the Roster, because the reckoning is the point of an ending and a player wants to read what the Guild became. The reckoning carries both lines the shared `reckoningLines` added, `Harm: N Injuries and M Scars between them.` and `Taken by another Guild: N Heroes.` (files: `web/tests/parity.test.tsx`, "renders the reckoning, with the harm line and the Heroes another Guild took", "offers no decision about itself: no Advance, no Send, no Applicants, no Hall, no deal", "keeps the read-only views, which is how a player reads what the Guild became"; `web/e2e/parity.spec.ts`, "a finished Career offers only a new one, and keeps the read-only views"; `web/e2e/layout.spec.ts`, "the start screen and the reckoning fit and can be tapped"). Loading an ended Career from a slot lands in the same state, which is how both tests reach it
- [x] Insisting on a refusing Hero (E2) takes two taps, as it takes two keypresses in the CLI (files: `web/tests/partyPicker.test.tsx`, "takes two taps to insist, and commits only on the second", "puts the insistence back behind two taps whenever the Party changes" and "commits a willing Party on one tap, and never claims to be insisting"; `web/e2e/refusals.spec.ts`, "names the Hero who will not go, and puts insisting behind a second tap", driving the built bundle). Built in E2 and confirmed still standing in this change
- [x] An awaiting Party (E6) cannot be advanced past, and shows the timeout countdown (files: `web/tests/word.test.tsx`, "will not let Advance pass it, and says why in the header" and "shows the prompt, both clocks and the coin the Guild holds"; `web/e2e/word.spec.ts`, "a Party waiting on word takes over the Report and says everything it is asking" and "two taps let the Days run, and the Party then decides for itself"). **Met as amended, deliberately:** DL-26 §2 gave the terminal a **summary** when two or more Parties wait and refused a number on that screen, and the browser does **not** copy it. That is a twenty-four-row budget rule and an ambiguity about what a keypress means; the browser scrolls, and every option is a labelled button tied to its own Party. So the browser shows every waiting Party **whole**, which is more information on a screen that has room for it — parity of information, not of arrangement (§3 above; DL-27 §10)
- [x] A cross-front-end test drives the same seed and decision list through both and diffs the narrated paragraphs (file: `web/tests/narration-parity.test.ts` — the same test, the same evidence, as E8-S2's last box above)

---

## 2. Definition of done

- [x] **Met as amended, and the amendment is that this sentence stopped being literally true at E2 and is restated here.** It was written of E8's *first version*, which stood on E1 alone. E2–E7 then landed, and each of them changed the engine, the content and `narrate` for its own reasons, recorded in DL-14 to DL-26 — that is what those epics were for, and it is not E8 drifting. What is true, and is what this box now asserts, is that **E8 itself adds nothing to the engine** beyond what [§4](#4-technical-notes) names: `content`'s pure entry (E8-S1) and `errorSentence` moving into `narrate` (E8-S2). E8-S6 adds no engine function, no config field, no event and no state; it touches the engine in exactly one place, and that is a **message**, not a rule — `deserialiseCareer` now says a document "carries no format version at all" where it used to say "is format version undefined", which named a JavaScript value at the player (DL-27 §14; file: `engine/tests/save.test.ts`, "is refused when the format version is not the one this engine writes"). It adds to `narrate` only words, one number format and the shared half of the rolling five that **both** front ends were already writing separately (DL-27 §§1–2, §6; files: `narrate/tests/e7-words.test.ts`; `cli/tests/history.test.ts`, which passes unmodified), which is the same rule DL-25 §15 followed. No content file changes
- [x] The browser makes no network request, ever, and a test proves it (files: `web/e2e/journey.spec.ts`, the `page.on('request', …)` listener and the `offOrigin` assertion, which now runs over the three new views as well; `web/scripts/check-bundle.mjs`, run after every build, which reported "3 built files, no network or filesystem reference")
- [x] The same save document works in both front ends, in both directions (file: `web/tests/save-interop.test.ts`, both directions with the terminal's real `cli/src/slots.ts` on the other end). The history E8-S6 added is kept **beside** the Career under `heroesim.history.<slot>`, precisely so that `heroesim.career.<slot>` stays exactly the string `serialiseCareer` returned and this box keeps holding (DL-02, DL-27 §6)
- [x] **Met as amended by independent verification.** All three layouts pass overflow and tap-target checks at every viewport listed in E8-S3 (files: `web/e2e/layout.spec.ts`, `applicants.spec.ts`, `hall.spec.ts`, `refusals.spec.ts`, `rivals.spec.ts`, `word.spec.ts` and `parity.spec.ts`, each sweeping 320/360/414/768/1024/1280 **and** the project's own viewport through `expectNoHorizontalOverflow` — which measures every scrollable container, not only the document — and `expectTapTargets`; plus `web/e2e/zoom.spec.ts` at 200% zoom). The amendment: as first written this box was **not true of `parity.spec.ts`**, whose More-sheet and ended-Career tests measured the project's own viewport only. Both now sweep all six widths, and both also count how deep the header wraps (`expectHeaderRows`)
- [x] Screenshots for all three devices are committed under `docs/verification/` — **109** images, 36 for mobile, 36 for tablet and 37 for desktop (the extra is `zoom-200.png`), regenerated by `npm run e2e -w web` and listed in `docs/verification/README.md`. Independent verification added the five the new views had no dark-theme shot of — `patrons-dark`, `former-dark`, `history-dark`, `more-dark` and `ended-dark` — because E8 §3 says both themes are tested for contrast and the five views this story added were light-only
- [x] `npm run typecheck`, `npm run lint`, `npm test` and `npm run e2e -w web` all pass. Measured at the end of **independent verification** (2026-09-20): typecheck clean; lint **0 errors** (1 pre-existing warning in `content/tests/zz-probe.scratch.test.ts`); `npm test` **1,629 tests passed and 5 skipped across 91 files (89 passed, 2 skipped), in about 180 s**; `npm run build -w web` clean; `npm run e2e -w web` **141 checks passed, 47 per project, against the built bundle**. **“From a clean checkout” is now proved as closely as it can be without touching git**: the working tree was copied to a directory outside the repository with `node_modules`, every `dist`, `.career`, `web/test-results` and `web/playwright-report` left behind, `npm ci` was run there from the committed lockfile, and typecheck, lint, the whole Vitest suite, the web build and the whole Playwright suite were run in that copy. All passed, with the same figures. The copy was deleted afterwards. What is still not proved is a fresh `git clone`, because E2–E7 and E8-S6 remain uncommitted in this working tree
- [x] Zero running cost: no hosting, no service, no dependency with a paid tier. No dependency was added in this change; the bundle check forbids a URL literal, a `fetch(` or an `XMLHttpRequest`, and the journey's listener proves nothing leaves the origin at run time
- [x] Architecture §9 and §10 updated in the same change (every pane including the three new ones and the More sheet, where the history lives, the zoom check and the cross-front-end narration test)

---

## 3. Known unknowns — adopted defaults

| Question | Adopted default | Change it if |
| --- | --- | --- |
| Browser storage slot count (INPUTS 8b.1) | 3 named slots plus 1 autosave, matching the CLI | Careers are kept long enough to want more |
| Minimum supported width (INPUTS 8b.2) | **360px** is the design floor; 320px is tested and must not overflow, but may wrap harder | A narrower device is actually used |
| Publish to GitHub Pages (INPUTS 8b.3) | **No.** `npm run build -w web` produces a folder you open locally | The game is to be shown to somebody, at which point Pages on a public repo is free and one click — and nothing about the build changes |
| React, or something smaller? | React, per DL-01, because the architecture already names it and the interaction model is trivial either way | The bundle exceeds a size that matters on a phone — measure before switching |
| Does the browser need the CLI's exact layout? | No. Same *content* and same *words*, different arrangement. Parity is of information, not of pixels | — |
| Where does the error sentence map live? | `narrate`, shared. It was written in E7 for the CLI and moves here | — |
| Is `webSlotCount` a `GameConfig` field? | No — it is a front-end constant, not a rule. `GameConfig` holds tunables the *simulation* reads | — |
| Dark mode? | Follows `prefers-color-scheme`; both themes tested for contrast | — |

---

## 4. Technical notes

### Engine additions: none

E8 consumes exactly the surface [E7 §4](E7-terminal-ui-and-saves.md#4-technical-notes) lists, and adds nothing to `engine`. Two additions land outside it:

```ts
// content — the pure entry (DL-03). If E1 built only the Node entry, it is extracted here.
export function parseContent(files: Record<string, string>): unknown
//   keys are paths, values are TOML text. No fs, no path, no process.
//   The Node entry becomes: readDir → read files → parseContent.

// narrate — moved from cli/src/errors.ts so both front ends share one map
export function errorSentence(code: EngineErrorCode, ctx?: Record<string, string | number>): string
```

### Web package

```
web/
  index.html
  vite.config.ts            base: './' so the build opens from the filesystem
  playwright.config.ts      three projects: mobile / tablet / desktop
  src/
    main.tsx  App.tsx
    state/careerReducer.ts  every engine call, one place
    state/selectors.ts      everything a pane reads off a Career; the only rules web/ holds
    state/storage.ts        localStorage adapter, slot index, quota handling
    content.ts              import.meta.glob → parseContent → validateContent
    layout/Shell.tsx        breakpoints, bottom bar, sheets
    panes/Board.tsx  Roster.tsx  Report.tsx  PartyPicker.tsx  SlotPicker.tsx
    panes/Hall.tsx  Applicants.tsx  Rivals.tsx  League.tsx  Word.tsx
    panes/Patrons.tsx  Former.tsx  History.tsx  More.tsx      // E8-S6, as built
    //   Word.tsx is E6's (DL-23): a Party that has sent word takes the Report pane's place
    //   while it stands, so it is a pane rather than a sheet over one.
    //   No `sheets/` directory exists or is planned: E8-S4 put the first sheet, Hall.tsx,
    //   under `panes/` beside the panes it sits over, E4's Applicants.tsx followed it there
    //   rather than opening a second folder for one file, E5's Rivals.tsx and League.tsx
    //   went to the same place — a sheet is a pane like any other — and E8-S6 added the
    //   last four there too. `More.tsx` is the one this story added that was not named in
    //   prose: the header already carried seven controls and wrapped to two rows at 360px,
    //   so the three secondary views are listed in words behind one of them (DL-27 §8).
    ui/Sheet.tsx  Stats.tsx  TraitChips.tsx
  e2e/
    journey.spec.ts         the seven steps, all three projects, through the E8-S6 views
    layout.spec.ts          overflow, tap targets, screenshots
    applicants.spec.ts  hall.spec.ts  refusals.spec.ts  rivals.spec.ts  smoke.spec.ts
    word.spec.ts            E6 in the browser
    parity.spec.ts          E8-S6: Patrons, former Heroes, the history, More, the ending
    zoom.spec.ts            E8-S3's last box: a desktop window at 200%
    helpers.ts
  tests/
    narration-parity.test.ts  E8-S2/E8-S6: the same decisions down both front ends, diffed
    save-interop.test.ts      E8-S4: a save document, both directions
```

### Storage

```ts
interface SlotIndexEntry { slot: string; guildName: string; day: number; year: number; rosterSize: number; savedOn: string }
//   heroesim.slots holds SlotIndexEntry[]; heroesim.career.<slot> holds serialiseCareer's exact output.
//   The CLI's SlotFile (E7 §4) wraps the same string with its history; the web client stores
//   history under heroesim.history.<slot>, so neither front end re-encodes a Career.
//
//   As built (E8-S6, DL-27 §6): heroesim.history.<slot> holds a JSON array of FULL
//   paragraphs, Day-stamped by narrate's own entriesFrom — the very function the terminal
//   uses. The browser trims nothing, because it wraps and scrolls. It is written with the
//   Career (including the autosave), read back with it, and removed with it; a history that
//   cannot be read gives back none rather than refusing the Career beside it, and a quota
//   that stops it is reported as a sentence naming the slot.
```

### Verification

| Check | Where | Evidence |
| --- | --- | --- |
| Journey, three devices | `e2e/journey.spec.ts` | `docs/verification/<project>/journey-*.png` |
| No horizontal overflow at 320–1280 | `e2e/layout.spec.ts` | assertion + screenshot |
| Tap targets ≥ 40px | `e2e/layout.spec.ts` | assertion over every button and link |
| No network requests | `e2e/journey.spec.ts` | `page.on('request')` listener, count must be 0 |
| Narration parity with the CLI | `web/tests/narration-parity.test.ts` | 26 decisions on one seed down both front ends' own paths, 142 paragraphs diffed, the terminal's renderer as the expected side |
| Save interoperability | `web/tests/save-interop.test.ts` | round trip through Node and through `localStorage`, with the terminal's real slot module on the other end |
| 200% browser zoom | `web/e2e/zoom.spec.ts` | a 640×400 CSS viewport at `deviceScaleFactor: 2`, asserted to be the tablet arrangement — `docs/verification/desktop/zoom-200.png` |

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The browser client drifts into holding rules React understands and the engine does not | One reducer, and a lint rule forbidding engine imports outside `state/`. Every number on screen comes from a selector |
| A dependency quietly adds a network call — a font, an analytics shim, an icon set | The zero-request assertion in the journey spec, plus a build-time grep for URL literals. Fonts are system stacks |
| Responsive work discovered at the end and expensive | The E1-era first version exists precisely to find it early. Layout specs run from the first commit of this epic |
| `localStorage` unavailable or full, and a Career is lost silently | Quota and private-browsing paths are explicit acceptance criteria, both with visible messages |
| Playwright screenshots churn on every unrelated change | Screenshots are evidence, not assertions — nothing fails on a pixel diff. The assertions are on overflow, tap size and content |
| Two front ends means every feature is built twice | `narrate` carries the words and the error sentences; the engine carries the rules. What is built twice is arrangement only, which is the point of DL-01 |
| The web client becomes the reference and the CLI rots | The CLI remains the reference front end (DL-01), and the parity test runs the CLI's narration as the expected side |

---

## 6. What independent verification raised for the owner

Verified 2026-09-20 by an agent that did not build it; what it changed is recorded in [DL-28](../00-decision-log.md#dl-28). Every acceptance box and every
definition-of-done item above was re-checked against the code, and about fifty mutations were
applied by hand and reverted. What it **fixed** is folded into the boxes above and listed here in
one place, each with a test proved to fail against the old code; what it **judged rather than
changed** is below, because each of those is a decision for the owner rather than a defect.

### 6.1 Fixed

1. **The Waiting-on-your-word pane, still offered on an ended Career** that stopped with a Party
   mid-Commission — reachable on 9 of 60 sampled seeds, and asserted against vacuously (E8-S6
   box 2 above).
2. **The ended Career's header stating an Upkeep that will never fall due and a Board that will
   never refresh** (E8-S6 box 2 above; every `docs/verification/*/ended.png` carried it).
3. **Ten identifier fallbacks in `web/src`** that could put an engine or content id in front of
   the player — `?? option.id`, `?? card.defaultOptionId`, `?? commissionId`, `?? sphereId`,
   `?? heroId` (four of them) and `?? applicantId` (two). E7's verifier found and fixed exactly
   this class in the terminal, where one of them was live ("Sending word costs 60 coin:
   send-coin"), and added `cli/tests/sweep.test.ts`'s check against the content's own id sets;
   the browser had no equivalent. Each now says what the terminal says in the same place —
   `Answer them`, `the work`, `Another Sphere`, `another Guild`, `somebody` — and
   **`web/tests/identifiers.test.tsx`** sweeps every pane and sheet of a played Career, the Word
   pane, the Party picker, the Patrons sheet and the former-Heroes sheet against the content's
   own id sets **and the Career's own ids**. It was proved to catch five injected leaks. Said
   honestly: none of the ten was reachable through a real code path — `commissionById` also
   searches the parties and `recentCommissions`, and `wordProse` labels every option — so this is
   hardening rather than a live bug.
4. **Two reading warts, fixed in `narrate` so both front ends changed together.** A retired Hero
   read "reached the end of a working life, Year 1, Day 20: reached the end of a working life",
   because the engine writes its own `REASON_REACHED_THE_END` into `hero.exit.reason` and both
   front ends printed the exit words and then the reason. `exitWords` and the new `exitReason`
   now live in `narrate` — they were a **fourth** block of player-facing words held word for word
   in both front ends, which no scan covered — and a reason that only repeats the going is
   dropped. The Applicants cue's "none can be taken on: none can be taken on just now" is fixed
   the same way: `noneCanBeTakenReason` moved to `narrate` (a **fifth** such block) and its
   generic branch now gives nothing rather than the phrase the cue already carries. That branch
   turns out to be **unreachable** — every guard in `acceptRefusal` above `InsufficientCoin` is
   Career-wide, so while every offer is refused the codes cannot disagree — which the test says
   rather than hides. Both front ends' shared-sentence scans were extended to the newly moved
   phrases, and made line-based so that a comment *about* a sentence is not read as a copy of it.
5. **Three holes in the rolling five**, each found by a surviving mutation and each now closed:
   the browser's history-quota failure could be swallowed in silence, although DL-27 §6 says it
   is reported as a sentence naming the slot; `historyKey` could stop using its slot — every slot
   sharing one window, and clearing one clearing them all — with nothing pinning it; and a
   `WORTH_REMEMBERING` kind could be dropped before `entriesFrom` and never reach the browser's
   history, because the test that claimed to cover it asserted only that the shared constant
   contained the kind. That last one read the very constant it claimed to pin; it is replaced by
   one that drives the real reducer and reads what the sheet would show.
6. **`narrate` had no source scan of its own** forbidding a coin figure printed by hand, although
   DL-27 §1 says there is one "in each front end" — and `narrate` is where all those sentences
   live. The played-Career sweep beside it only constrains a sentence whose amount happens to
   reach four figures on that seed: an ungrouped Hall cost, joining fee and Commission fee all
   survived it. The scan is now in `web/tests/engine-imports.test.ts` (`narrate` deliberately
   carries no node types) and catches all three.
7. **The definition of done's own claim** that `parity.spec.ts` sweeps all six widths was untrue
   of its More-sheet and its ended-Career tests, which measured the project's own viewport only.
   Both now sweep, and both count how deep the header wraps.
8. **Every sheet, from the keyboard.** `Sheet.tsx` declared `aria-modal="true"` but left focus on
   the control now behind the scrim, had no Escape, and gave focus nowhere on close; the More
   sheet's line saying what each control opens sat beside the control rather than being tied to
   it. Opening a sheet now takes focus into it, Escape closes it, closing returns focus to the
   control that opened it, and each More control carries `aria-describedby`.
9. **Dark-theme evidence for the five views this story added**, which were light-only although
   E8 §3 says both themes are tested for contrast.

### 6.2 Judged, not changed

Each of these is a decision for the owner.

1. **DL-27 §8's reason for the More sheet is not met at the design floor.** The decision was taken
   because "the header already carried seven controls and wrapped to two rows at 360px", and
   three more "would have taken it to three rows". Measured with `expectHeaderRows`: the eight
   controls it ended up with wrap to **three rows at 360px** — and at 320px — and to two only from
   414px up. The sheet reduced ten controls to eight; the row it was taken to save is still there
   at the floor. The measured truth is now pinned, so a ninth control cannot add a fourth row
   unnoticed.
2. **Eight pairs of front-end-authored sentences say the same fact in different words.** DL-27 §2
   moved three such sentences into `narrate` and read as though the class were closed. Driving
   both front ends over one seed and reading every view found at least eight more: the three Hall
   effects (and the browser alone tells the player that an infirmary "does not shorten one
   already borne"), the Hall and Applicants headers ("1,700 coin in hand" against "The Guild
   holds 1,700 coin"), the empty-Applicants line ("Let the Days run and see who comes" against
   "Advance a stretch of Days and see who comes"), the Rivals refusal clause ("they are content
   enough where they are" against "They are content enough where they are to hear nothing said
   against it"), the poach warning, the waiting-Party clock ("With no word from you they act on
   their own judgement in 3 Days" against "and act on their own judgement in 3 Days") and the
   mark on a Decision's default option ("[their own judgement]" against "With no word from you,
   this is what they will do"). E8 §3 asks for the same **words**, not only the same facts. Not
   moved here: it touches both front ends, `narrate` and several snapshots, and is a scope call.
3. **Three facts reach the browser player and not the terminal player**: the Patron and the
   Sphere on a Board card, a Hero's Background name on the Roster, and the Scar marker on another
   Guild's Hero. The terminal dropped Board columns for its 80-column budget (E7-S1), so this is
   probably right — but it is parity of information running one way, and it is not among the four
   differences DL-27 records.
4. **The terminal's ending screen offers no view at all**, while the browser keeps the Board, the
   Roster, the League, the Patrons, the former Heroes and the rolling five. DL-27 §9 records the
   browser half; nobody has asked whether the terminal should gain the same reading.
5. **The terminal collapses a run of consecutive `coin` paragraphs to one line with an `(xN)`
   count and the browser does not** — a fifth deliberate difference, recorded nowhere. It is
   harmless today because the run never occurs: 0 of 140 sampled steps across 20 seeds produced
   two `coin` paragraphs in a row, which also means the cross-front-end narration test's
   `(xN)`-stripping is a no-op that has never fired. If a run ever did occur, that test would
   fail rather than pass quietly, because only the terminal collapses.
6. **A save moved between front ends arrives with an empty history, and nothing says so.** The
   browser keeps the five under `heroesim.history.<slot>` and the terminal inside its slot file,
   which is exactly what DL-02 requires of the Career document — but a player who copies a
   `.career/*.json` into the browser, or pastes a browser save into `.career/`, silently loses
   what led up to it. §4 records where each keeps it; neither front end tells the player.
7. **An ended Career's Roster still says a Hero is "away … waiting on your word — back no sooner
   than Year 1, Day 165"**, a Day that will never come. The same class as the header clocks, one
   layer down and less clearly wrong: it is where they were when it ended.

### 6.3 On the cross-front-end narration test

It is **not** a tautology, and its own header says plainly what it cannot do. Both sides call the
same `narrateEvents`, so the *words* cannot differ by construction — but what each front end does
*around* the narration is its own, and that is what is compared: the terminal's `narrationLines`
against the browser's `careerReducer`. Seven injected divergences were all caught — a re-wording
on the browser side, a dropped paragraph, a reordering, and four different event kinds filtered
out before narration — and its "exercises every kind of decision" assertion bites: a timeout that
never fires and an Applicant never taken on each fail it. Its three config overrides are
legitimate and stated, because without them the Career goes insolvent before it reaches a
Transfer or a timeout.
