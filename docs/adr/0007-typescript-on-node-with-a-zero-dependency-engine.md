# TypeScript on Node 22, one repository, a zero-dependency engine

The engine, content loader, harness, CLI and browser front end are TypeScript in one npm
workspace on Node 22 with Vitest. The engine package has no dependencies; content is JSON so
that stays true. We chose this over Python (a good engine, but the browser front end becomes a
second codebase) and over a game engine such as Godot (rendering we do not need, and no
harness) because the same engine must run unchanged in a terminal, in a browser served as
static files, and in a test that plays a thousand games.

*Amended 2026-09-25.* "Node 22" reads "Node 22 or later": `engines` declares `>=22`,
development runs on the current release (26.9 at the time), and CI runs both 22 and the
development version so the floor is tested rather than assumed. Decided by the owner (pre-M0
review A8).

*Amended 2026-10-09.* "Node 22 or later" reads "Node 26 or later": the floor is the version
this repository is developed on, `engines` declares `>=26`, and CI tests the floor by testing
that version, `.node-version`, in one job. Nothing is released on Node 22 any more. The intent holds: the floor is tested rather
than assumed. Decided by the owner (DL-235).
