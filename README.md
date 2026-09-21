# Heroesim

A guild-management simulation for the terminal. You run a Guild of heroes, take paid work from
Patrons, choose who to send, and read what happened to them. The output that matters is the
story, not the score.

## Status

E1 (the core simulation loop) and the first web client (E8, stories S1–S5) are built and
verified as of 2026-09-19. You can play a full Career, in the terminal or in a browser, to
Retirement or Insolvency, and save and load along the way. A balance pass is in progress
(DL-13), and E2–E7 (Refusals, Injuries, Recruitment, Rivals, Chips, terminal UI polish) are not
yet started.

- [`docs/design.md`](./docs/design.md) — the whole design in one place
- [`CONTEXT.md`](./CONTEXT.md) — the glossary, and the words not to use
- [`docs/adr/`](./docs/adr/) — the decisions that were hard to reverse, and why

## Running it

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Play in the terminal | `npm run play` |
| Play in the browser | `npm run dev -w web` |
| Build an executable that serves the game to your browser | `npm run build:exe`, then run `web/release/heroesim.exe` |
| Run the tests | `npm test` |
| Build, then run the browser checks | `npm run build && npm run e2e` |
