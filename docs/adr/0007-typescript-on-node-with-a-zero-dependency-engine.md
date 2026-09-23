# TypeScript on Node 22, one repository, a zero-dependency engine

The engine, content loader, harness, CLI and browser front end are TypeScript in one npm
workspace on Node 22 with Vitest. The engine package has no dependencies; content is JSON so
that stays true. We chose this over Python (a good engine, but the browser front end becomes a
second codebase) and over a game engine such as Godot (rendering we do not need, and no
harness) because the same engine must run unchanged in a terminal, in a browser served as
static files, and in a test that plays a thousand games.
