# Heroesim

A guild-management simulation. You run a Guild of heroes, take paid work from Patrons, choose who to send, and read what happened. The story is the product, not the score. Terminal front end first; a browser front end renders the same event stream.

Read, in order, before changing anything: `CONTEXT.md` (binding vocabulary, with words to avoid), `docs/design.md`, `docs/adr/`, `docs/planning/03-solution-architecture.md` (the engine contract), `docs/planning/00-decision-log.md`. The build plan is `docs/planning/epics/`.

## Invariants

1. **The engine is a pure library.** No files, no output, no clock, no global random. Randomness and time are injected (ADR-0001). `Math.random`, `Date.now`, `new Date()`, `console` and `fs` do not appear under `engine/`. ESLint enforces it.
2. **The engine emits typed events, never prose** (ADR-0002). Tests assert on events, not strings. Narration lives in `narrate/`.
3. **Engine functions are pure.** `Career` in, `{ career, events }` out. Never mutate an input.
4. **Traits are the universal currency of character** (ADR-0005). No parallel injury or scar systems.
5. **Beats come from authored Vignettes with slots** (ADR-0008). Vignettes are TOML under `content/vignettes/`. Adding one never changes the engine.
6. **The Guildmaster never joins a Party** (ADR-0007).
7. **Saves are snapshots, not event logs** (ADR-0004). One serialiser; storage adapters differ per front end.
8. **Every tunable is a named, defaulted field on `GameConfig`.** A literal balance number in rules code is a defect.
9. **No external services, no network, no paid dependency, no credentials.** Zero running cost.
10. **Use the vocabulary exactly.** Commission not quest or job; Roster not team; Regard not reputation; Check not roll (the d20 is a roll inside a Check). See `CONTEXT.md` for the full avoid-list.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| All tests | `npm test` |
| One package | `npm test -w engine` |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Play in the terminal | `npm run play` |
| Web dev server | `npm run dev -w web` |
| Browser tests (needs a built web app) | `npm run e2e -w web` |
| Build the launcher executable (needs Node 25.5+, DL-29) | `npm run build:exe` → `web/release/` |

## Layout

```
engine/    pure rules and state; tests in engine/tests
content/   TOML content and its parser; pure entry and Node entry
narrate/   events → English paragraphs
cli/       terminal front end; saves to .career/ (gitignored)
web/       Vite + React front end; saves to localStorage; Playwright specs in web/e2e
docs/      design, ADRs, planning, verification evidence
```

## Conventions

- British English in docs, prose and UI. Coin is the currency and is never abbreviated.
- Record a significant decision in `docs/planning/00-decision-log.md` before implementing it. Append; never edit an accepted entry.
- Update the relevant planning document in the same change as the code.
- Commit messages name the epic and story, e.g. `E1-S2: Beat resolution and Vignette selection`.
- Prefer boring and testable. One maintainer, intermittent hours.
