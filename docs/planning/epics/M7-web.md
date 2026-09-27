# M7 — Web

**Objective:** the same engine, the same words, served from a URL at zero running cost
**Sessions:** 6–8 · **Depends on:** M6 · **Implements:** `plan.md` M7; R37, R38; N2; ADR-0007; principle 12
**Gate:** `https://<project>.pages.dev` serves the browser front end; a game is created, advanced, dispatched, recruited, saved to IndexedDB and reloaded; Playwright proves it; the bundle contains no network call

**Status:** in progress — M7-S1 to M7-S4 done, but for M7-S4's first box, a measure not met (a
20-year round trip through IndexedDB takes 3.6 s against 1 s; DL-67, left to the owner)

## 0. What lands in M7

- `web/` as a Vite + React application (INPUTS 7.7) importing `@heroesim/engine` and the
  content package's pure entry; content bundled at build time with `import.meta.glob`.
- One reducer whose actions are the engine's actions; nothing in `web/` computes a rule.
- Views: Guild, Roster, Hero page from the History, Board, Market, Rankings; actions: advance
  and fast forward, dispatch with consumables, recruit, transfer, buy, sell, equip, build.
- Saves in IndexedDB, compressed with `CompressionStream`, in the same serialised format the
  CLI writes, so a file from one can be imported into the other.
- A bundle gate refusing `fetch(`, `XMLHttpRequest`, `node:`, `process.env` and URL literals.
- Playwright journeys; a Cloudflare Pages deploy.

**Deliberately deferred:** responsive layouts beyond "works on a phone width without
horizontal scroll" (v1 built three; v2 builds one column that stacks); a router; PWA/offline
manifest; touch gestures; hosted saves (later, per requirements §2).

**Harvested from v1.** `web/scripts/check-bundle.mjs`, `vite.config.ts` with `base: './'`,
the `import.meta.glob` content load, the reducer-at-the-boundary shape, the Playwright
project and the `wrangler pages deploy` script were all built and verified on `feature/poc`
(DL-27 to DL-30 there). They are copied and adapted, not redesigned.

**Inputs:** 7.7, 7.8 (**blocking S5**), 7.9 (**blocking S5**), 7.10.

## 1. Stories

### M7-S1 · Workspace, bundling, the bundle gate · 1 session

`web/package.json` with `vite`, `react`, `react-dom`, `@vitejs/plugin-react`, `@types/react*`,
`jsdom`, `@testing-library/react`, `@playwright/test`, pinned. The root `vitest.config.ts`
gains the `web` project with jsdom. `web/src/content.ts` globs `../../content/*.json` as raw
text and calls `parseContent` + `validateContent`. `check-bundle.mjs` runs after every build.
ESLint: `web/**` may import `@heroesim/engine` and `@heroesim/content` by name only.

**Acceptance:**

- [x] `npm run build -w web` produces `web/dist/` that opens from the filesystem
- [x] The bundle gate fails a build containing a deliberate `fetch(` (tried, reverted, DL)
- [x] The browser content set deep-equals the Node entry's for the same files (test)
- [x] `engine/` still has zero dependencies (the M0 test still passes with React installed at
      the root)

### M7-S2 · State: one reducer · 1 session

`web/src/state/reducer.ts`: `useReducer` over `{ document, log: Event[], rejection: Rejection
| null, busy: boolean }` with one action per engine action plus `advance`, `fastForward`,
`newGame`, `load`. `deps.config` is `{ ...defaultConfig, ...document.meta.config }`, the same
rule the CLI uses (data-model §2, D3). Every action calls the engine and stores the returned document; a
`rejection` is stored, never thrown; `busy` drops a second action that arrives before the
first settles. A Vitest check over `web/src` asserts that only `state/` and `content.ts`
import anything but types from `@heroesim/engine`.

**Acceptance:**

- [x] The document is never mutated: a test freezes it and drives twenty actions
- [x] Every `Rejection` kind renders as a sentence (one map, tested for completeness against the
      union)
- [x] Two taps on Advance in one batch drive one engine call

### M7-S3 · Views and actions · 2–3 sessions

Single column, sections in the order the Turn reads: header (Guild, Wealth, Fame, Day and
time of day, Rankings position), Board with dispatch (pick Heroes and consumables, preview
Synergies), Roster with Hero pages (History newest first, paged), Market, Hall with build,
Rankings, and the log of events since the last action narrated in the front end's own
`narrate.ts` (typed event in, sentence out, tested for every event type). Fast forward with
the stop reasons as buttons. A "new rules available" notice when `meta.config.configVersion`
is behind `defaultConfig`, with a `rebase` button (D1). No component calls the engine.

**Acceptance:**

- [x] Every event type in the engine's union has a sentence; a test enumerates the union
- [x] Every CLI command has a browser equivalent (a table in this section, ticked as built)
- [x] `show hero`'s rule holds: Potential is never rendered (test greps the rendered DOM)
- [x] No horizontal overflow at 360px width (Playwright, S4: `web/e2e/layout.spec.ts` and each
      step of `web/e2e/journey.spec.ts`, DL-67)

**Every CLI command and its browser equivalent** (the second box; a row is ticked when its
equivalent is built; M7-S3 part 1, DL-66, built the first nine; M7-S3 part 2, DL-73, built the
rest, each driven through the page's own controls in `web/src/views/*.test.tsx`):

| CLI command | In the browser | Built |
| --- | --- | --- |
| `new` | "A new game": the Guild's and the Guildmaster's names, a Guild Background or one drawn from the seed, and a readable seed the player may change; with a game in hand, "Start a new game" says it goes unless exported (`--force`) | [x] |
| `show` | The header: the Guild, its Wealth and Fame, the Day and time of day, its place in the Rankings, and the seed | [x] |
| `show board` | The Board: each Quest's Patron, terms, demands, Skills that help and Encounters | [x] |
| `preview` | The Board's preview of the Party being chosen, as it changes: each requirement met or missed, who cannot go, the Synergies and on how many Encounters, the consumables, the reward agreed, and dispatch's own verdict (the engine's `previewDispatch`) | [x] |
| `dispatch` | The Board's "Send the Party", with the Heroes and consumables chosen | [x] |
| `show roster` | The Roster: each Hero's Class, Level, age, Morale and whereabouts, and what the Guild holds | [x] |
| `show hero <heroId>` | A Hero's page, opened from the Roster, the pool or another Guild's Roster: Attributes and State, Stats with their hints, gear, Skills, Relationships as bands | [x] |
| `show history <heroId>` | A Hero's page: their Milestones first, then their History, newest first, a page at a time | [x] |
| `advance [--turns n]`, `advance --until <stops>` | "Advance a Turn"; "Fast forward"; "Fast forward until new Heroes join the pool". Why it stopped is a sentence with a button where the CLI names a command, and the log narrates what happened. One Turn per tap: `--turns n` is fast forward's work here; `--max` is a year, the CLI's default | [x] |
| `show guilds` | The Guilds: every Guild with its controller, Guildmaster, Background, Roster, Wealth, Fame and Upkeep, a folded one marked with its Day | [x] |
| `show rankings [--by fame\|wealth]` | The Rankings, by Fame or by Wealth, the player choosing which | [x] |
| `show roster <guildId>` | Another Guild's page, opened from the Guilds: its Roster, each Hero with the Transfer fee the player's Guild would pay, and each Hero's page | [x] |
| `show hall [guildId]` | The Hall: each facility's grade, the Improvement built, what it does, the next grade's Improvement and cost, and the Upkeep; another Guild's on its page | [x] |
| `build` | "Build <Improvement>", from the Hall | [x] |
| `show pool` | The Unattached pool: each Hero's signing fee and whether they would sign, the Guild's Fame, and each Hero's page | [x] |
| `recruit` | "Recruit <Hero>", from the pool or the Hero's page | [x] |
| `show patrons` | The Patrons, each Sphere, and their Regard for the player's Guild, as bands | [x] |
| `show guildmaster [guildId]` | The Guildmaster: Stats and what each bears on, Traits and what each does, Regard for Patrons, the Roster and the other Guilds as bands; another Guild's on its page | [x] |
| `show market` | The Market: what is for sale at what price, and what each Item the Guild holds sells for | [x] |
| `buy`, `sell` | Buy and sell, by the quantity asked, from the Market | [x] |
| `equip`, `unequip` | Equip gear the Guild holds and unequip a slot, from a Hero's page | [x] |
| `transfer --to`, `transfer --in` | Transfer one of the player's Heroes out to the Guild chosen, each with the fee it would pay, from the Hero's page; "Take <Hero> in" from another Guild's Roster or the Hero's page | [x] |
| `show offers`, `accept`, `decline` | The Transfer Offers made for the player's Heroes, each accepted or declined | [x] |
| `show history [entityId]` | The History: the whole History or a Guild's, newest first, a page at a time; a Hero's is on their page | [x] |
| `rebase` | The "new rules available" notice while the game's rules are behind this release's, and "Adopt the new rules" (D1) | [x] |
| `save --as`, `load` | "This game": export the game as the save file the CLI writes, and load a save file, the CLI's or the page's, before a game or in place of one. Saves kept in IndexedDB: "Saved in this browser", in "This game" and "A new game" (M7-S4, DL-67) | [x] |
| `help` | The page's own words: each section says what it is for and what its controls do, and each control is named by what it does | [x] |

### M7-S4 · IndexedDB saves and Playwright · 1–2 sessions

`web/src/saves.ts`: `save(name, document)` serialising with the engine's `serialise`,
compressing with `CompressionStream("gzip")`, storing a `Blob` in IndexedDB under
`heroesim.saves`; `load(name)` reversing it and running `deserialise`; `export(name)` downloads
the uncompressed JSON the CLI can read; `import(file)`. Playwright specs at 360×800 and
1280×800: new game, advance a Day, dispatch, fast forward until the Party returns, save,
reload the page, load, read the same Turn; export, and a Node test loads the exported file
with the CLI's loader.

**Acceptance:**

- [ ] A 20-year save from `npm run harness:sample` (`harness/samples/twenty-years.json`,
      gitignored, M2-S12) round-trips through IndexedDB under 1 s and its compressed size is
      recorded (**Measure**, DL) — **not met, measured (DL-67):** the round trip takes 3.6 to
      3.8 s in Chromium (save 2.3 to 2.5 s, load after a reload 1.3 s; `npm run measure -w web`);
      compressed size 12,662,505 bytes from 113,281,366 (8.9 to 1). The time is the engine's
      `serialise` and `deserialise` of a 113 MB save and gzip; IndexedDB takes milliseconds. Left
      to the owner (data-model §7, DL-08)
- [x] The exported file is byte-identical to `serialise(document)` (`web/src/saves.test.ts`,
      `web/src/views/saves.test.tsx`; in Chromium, `e2e/journey.spec.ts` and the measure)
- [x] Both Playwright journeys pass locally; `npm run e2e` (`e2e/journey.spec.ts` at 360×800 and
      1280×800, the CLI loading the export; `e2e/no-storage.spec.ts` with storage blocked;
      16 passed)

### M7-S5 · Deploy · 0.5–1 session

`web/package.json` `deploy`: `npm run build && npx -y wrangler@4 pages deploy dist
--project-name <INPUTS 7.8> --branch <production branch>`. First run: `npx wrangler login`
(interactive, once, on this machine; INPUTS 7.9). The URL goes in `README.md`. No workflow
change unless 7.9 chose CI deploy, in which case `.github/workflows/deploy.yml` on tag push
reads the two secrets and nothing else.

**Acceptance:**

- [ ] The URL serves the build; a fresh browser creates a game and saves
- [ ] The repository contains no token, account id or `.wrangler/` state (`.gitignore` gains
      `.wrangler/`)
- [ ] `README.md` names the URL and the deploy command

## 2. Configuration and events introduced

None in the engine. The web front end adds no config; its narration map is a front-end
concern.

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| Vite or React major versions moved since v1 | Pinned exactly; the app is one reducer and plain components, so a migration is small |
| IndexedDB is unavailable (private mode) | `saves.ts` reports a typed failure and the app runs without saving; Playwright has one spec with storage blocked |
| The deploy is a preview, not production (v1 DL-30 §3) | `--branch` is in the script, never inferred |
