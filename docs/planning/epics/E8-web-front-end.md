# E8 — Web front end

**Objective:** The same engine, the same words, in a browser that works on a phone  
**Estimate:** 4–5 days · **Depends on:** E1 (first version), E7 (parity) · **Implements:** [DL-01](../00-decision-log.md#dl-01--a-web-front-end-is-in-scope-as-a-second-renderer-over-the-same-engine), [Architecture §9](../03-solution-architecture.md#9-front-ends) · **Realises:** ADR-0001, ADR-0002, DL-01, DL-02, DL-04, DL-05  
**Gate:** Playwright plays a Career at three viewports — new Career, commit a Party, advance until it returns, read the report, save, reload, load — with no horizontal overflow at 360px

**Status:** S1–S5 built and verified 2026-09-19; S6 parity awaits E7.

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
- [ ] Narrated paragraphs are identical to the CLI's for the same seed and decisions, asserted by a cross-package test (not met: both front ends call the same `narrateEvents` from `@heroesim/narrate` directly, so there is no second implementation to diverge, but no test was found that drives the CLI and the web client on the same seed/decisions and diffs the output)
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
- [ ] At 200% browser zoom on the desktop viewport the layout falls back to the tablet arrangement rather than overflowing (not met: no test in `web/e2e/` emulates browser zoom or a reduced-viewport-at-desktop-project scenario)

### E8-S4 · Saves in the browser · 0.5 day

```ts
localStorage.setItem(`heroesim.career.${slot}`, serialiseCareer(career))
```

The stored string is **exactly** what `serialiseCareer` returns (DL-02). A slot index at `heroesim.slots` holds each slot's Guild name, Day, Year and Roster size for the picker, so listing slots never deserialises a Career.

**Acceptance:**

- [x] `config.webSlotCount` slots, plus one autosave slot written after every action (`web/tests/storage.test.ts`: "has three named slots and an autosave" — `webSlotCount` is not a `GameConfig` field, per §3's adopted default; the three named slots plus the autosave are `web/src/state/storage.ts`'s `NAMED_SLOTS` and `AUTOSAVE_SLOT`)
- [ ] A save written by the web client deserialises in Node, and a `.career/*.json` file pasted in loads in the browser — a test does both directions (not met: `web/tests/storage.test.ts` ("a document written here deserialises with the engine, as the CLI would read it") proves only the web-to-Node direction; no test was found that loads a CLI-written `.career/*.json` file into browser storage, though both directions share the same `serialiseCareer`/`deserialiseCareer` functions)
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

- [ ] Every CLI view has a browser counterpart reading the same selectors listed in [E7 §4](E7-terminal-ui-and-saves.md#4-technical-notes)
- [ ] The reckoning renders and a finished Career offers only "new Career"
- [ ] Insisting on a refusing Hero (E2) takes two taps, as it takes two keypresses in the CLI
- [ ] An awaiting Party (E6) cannot be advanced past, and shows the timeout countdown
- [ ] A cross-front-end test drives the same seed and decision list through both and diffs the narrated paragraphs

---

## 2. Definition of done

- [ ] The engine, content and narrate packages are unchanged except for the pure content entry and the shared error map
- [ ] The browser makes no network request, ever, and a test proves it
- [ ] The same save document works in both front ends, in both directions
- [ ] All three layouts pass overflow and tap-target checks at every viewport listed in E8-S3
- [ ] Screenshots for all three devices are committed under `docs/verification/`
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run e2e -w web` all pass from a clean checkout
- [ ] Zero running cost: no hosting, no service, no dependency with a paid tier
- [ ] Architecture §9 and §10 updated in the same change

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
    state/storage.ts        localStorage adapter, slot index, quota handling
    content.ts              import.meta.glob → parseContent → validateContent
    layout/Shell.tsx        breakpoints, bottom bar, sheets
    panes/Board.tsx  Roster.tsx  Report.tsx
    sheets/Patrons.tsx  League.tsx  Hall.tsx  Applicants.tsx  Former.tsx  Word.tsx
    ui/                     Button, Sheet, Stat, RegardBadge, TraitChip
  e2e/
    journey.spec.ts         the seven steps, all three projects
    layout.spec.ts          overflow, tap targets, screenshots
```

### Storage

```ts
interface SlotIndexEntry { slot: string; guildName: string; day: number; year: number; rosterSize: number; savedOn: string }
//   heroesim.slots holds SlotIndexEntry[]; heroesim.career.<slot> holds serialiseCareer's exact output.
//   The CLI's SlotFile (E7 §4) wraps the same string with its history; the web client stores
//   history under heroesim.history.<slot>, so neither front end re-encodes a Career.
```

### Verification

| Check | Where | Evidence |
| --- | --- | --- |
| Journey, three devices | `e2e/journey.spec.ts` | `docs/verification/<project>/journey-*.png` |
| No horizontal overflow at 320–1280 | `e2e/layout.spec.ts` | assertion + screenshot |
| Tap targets ≥ 40px | `e2e/layout.spec.ts` | assertion over every button and link |
| No network requests | `e2e/journey.spec.ts` | `page.on('request')` listener, count must be 0 |
| Narration parity with the CLI | Vitest, cross-package | diff of paragraphs for a fixed seed |
| Save interoperability | Vitest, both directions | round trip through Node and through `localStorage` |

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
