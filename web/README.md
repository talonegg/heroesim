# `@heroesim/web` — the browser front end

The same engine as the terminal, in a page. No server, no API, no network call of any
kind: the content is bundled, the rules are `@heroesim/engine`, the words are
`@heroesim/narrate`, and the saves are in the browser (DL-01, DL-02).

## Running it

Run everything from the repository root.

| Task | Command |
| --- | --- |
| Dev server | `npm run dev -w web` |
| Build (and check the bundle) | `npm run build` |
| Open the build | `npm run serve -w web`, then `http://127.0.0.1:4790/`. Opening `web/dist/index.html` from disk does **not** work in Chromium (E8 §6.2 item 8) |
| Build the launcher executable | `npm run build:exe` → `web/release/heroesim.exe` (needs Node 25.5+) |
| Preview the build | `npm run preview -w web -- --port 4173` |
| Unit tests | `npm test` (the `web` Vitest project) |
| Browser tests | `npm run build` first, then `npm run e2e` |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |

`npm run build` is `vite build` followed by `scripts/check-bundle.mjs`, which fails the
build if the built files contain `fetch(`, `XMLHttpRequest`, a quoted `node:` specifier,
`process.env`, or a URL literal that is not on its documented allow-list. The allow-list
holds only identifiers React carries — the four W3C XML namespace URIs and the React
error-decoder address — never anything the page resolves.

`npm run build:exe` runs the build above and then `scripts/build-exe.mjs`, which uses
`node --build-sea` to copy the running `node` binary and put `launcher/serve.mjs` and every
file under `dist` inside it (E8-S7, DL-29). No dependency, nothing downloaded; the result is
for the platform it was built on, about the size of `node`, unsigned and gitignored.
Started, it serves the page on `127.0.0.1:4790` — this machine only — and opens the default
browser. `--no-open` and `--port <n>` exist; the port is fixed by default because saves
belong to the origin, and a Career saved on one port is not listed on another. Starting a
second copy opens the browser at the first.

`npm run e2e` runs the Playwright suite against the **built** bundle, served by
`vite preview` on `127.0.0.1:4173`. It refuses to run at all if `web/dist` is missing.
Three projects, all on Chromium (DL-10): `mobile` (Pixel 7), `tablet` (an iPad-class
820×1180 viewport) and `desktop` (1280×800). Screenshots land under
`docs/verification/<project>/` and are evidence, not assertions.

## Where the saves live

`localStorage`, in the tab that wrote them.

| Key | Holds |
| --- | --- |
| `heroesim.career.1`, `.2`, `.3` | a named slot: exactly what `serialiseCareer` returns |
| `heroesim.career.autosave` | written after every action |
| `heroesim.slots` | the picker's index: Guild name, Day, Year, Roster size, when it was saved |

The stored string is the same document the CLI writes to `.career/<slot>.json`, so a save
moves between the two front ends by copy and paste. There is no migration: a save whose
`formatVersion` this engine does not write is refused, said so in a sentence, and left
exactly where it is.

If `localStorage` is unavailable — a private window, or storage blocked — the client says
so and keeps the Career in memory for the session. If it is full, the slot is named in
the message and nothing is dropped quietly.

## Shape

```
src/
  main.tsx  App.tsx          one page, no router
  content.ts                 import.meta.glob → parseContent (already validated)
  words.ts                   the only import of @heroesim/narrate
  seed.ts                    random-looking seeds, made in the front end
  state/careerReducer.ts     every engine call, one place
  state/selectors.ts         everything the panes read off a Career
  state/storage.ts           localStorage, the slot index, quota and private mode
  layout/Shell.tsx           header, the three panes, the bottom bar
  panes/                     Board, Roster, Report, PartyPicker, SlotPicker
  ui/                        Stats, TraitChips, Sheet
```

Only `state/` and `content.ts` may import engine **values**; everywhere else takes types
and goes through a selector. `tests/engine-imports.test.ts` enforces it.

The three layouts are chosen by media query alone — nothing measures the viewport in
JavaScript. Under 600px one pane at a time with a bottom bar; to 1023px Board and Roster
side by side with the Report below; above that all three at once.
