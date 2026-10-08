# Heroesim

A guild-management simulation. You are a Guildmaster running a Guild of Heroes: take Quests
from Patrons, choose who to send, and grow the Heroes and the Guild over the years. The engine
is mechanical first; story-rich modules such as Campaigns and Scenarios come later.

**Where it stands.** The first build, M0 to M8, was released as `v1.0.0`, and the v1.1 line has
followed it a patch at a time: the page redesigned, then pictures, richer Quests and the tools.
Every release is a row of [`docs/plan.md`](docs/plan.md) §2's ledger, and what comes next is its
§4, Random Events (M10) among it. `main` is production: only a release branch's pull request
moves it, and merging one releases. Agents start from [`AGENTS.md`](AGENTS.md).

## Play

- **In a browser:** <https://heroesim.magical-potato.workers.dev> or <https://heroesims.pages.dev>:
  the same page at two addresses, on Cloudflare Workers and on Cloudflare Pages, each release
  deployed to both (DL-88, DL-94). One static page, the same engine as the terminal: no account,
  no server, no network call, and saves kept in the browser (R38, N2). The browser keeps saves per
  address: a game saved at one is not seen at the other, and moves between them only as a file,
  by "Export this game" at one and "Load a save file" at the other.
- **In a terminal:** `npm ci` once, then `npm run play -- help` for the commands.

## Portraits

The Portraits' pictures in `media/portraits/` are converted, registered and checked by the
portrait tool, `npm run portraits -- <command>`, described in
[`tools/portraits/README.md`](tools/portraits/README.md) (DL-135 item 11).

## Traits

Traits are added, changed and removed through the content editor, `npm run edit`, a local page with
commands underneath, described in [`tools/editor/README.md`](tools/editor/README.md) (DL-150).

## Harness

The harness plays games under an automatic policy and reports what they did: `npm run harness`, its
profiles (`gate`, `neutral`), probes, `compare` and the Gate's spec, `harness/gate.json`, are described
in [`harness/README.md`](harness/README.md) (DL-186).

## Deploy

CI deploys each release to both addresses when its pull request is merged (DL-124). How, the
checks it runs, the credentials and the deploy by hand are in [`docs/deploy.md`](docs/deploy.md);
every environment variable the repository reads is in [`docs/environment.md`](docs/environment.md).

## Documents

- [`AGENTS.md`](./AGENTS.md) and [`docs/agents/`](./docs/agents/) — how agents work here: the tools, the words, comments
- [`CONTEXT.md`](./CONTEXT.md) — the glossary, and the words not to use
- [`docs/requirements.md`](./docs/requirements.md) — what the game is, the first build, and what is deferred
- [`docs/principles.md`](./docs/principles.md) — the design principles and what goes wrong without each
- [`docs/approach.md`](./docs/approach.md) — architecture, Turn pipeline, layout, verification
- [`docs/data-model.md`](./docs/data-model.md) — the World State document: sections, tables, rules, validator
- [`docs/adr/`](./docs/adr/) — the decisions that are hard to reverse, and why
- [`docs/plan.md`](./docs/plan.md) — the delivery plan: milestones, the release ledger, what comes next
- [`docs/planning/epics/`](./docs/planning/epics/README.md) — the open release's epic
- [`docs/planning/archive/`](./docs/planning/archive/README.md) — the epics of finished milestones and releases, and the first build's inputs
- [`docs/decision-log.md`](./docs/decision-log.md) — the open release's decisions, appended as they are made
- [`docs/decisions/index.md`](./docs/decisions/index.md) — every decision: its date, title, what superseded it and its file
- [`docs/deploy.md`](./docs/deploy.md) and [`docs/environment.md`](./docs/environment.md) — the deploy, and every environment variable
- [`harness/README.md`](./harness/README.md), [`tools/editor/README.md`](./tools/editor/README.md), [`tools/portraits/README.md`](./tools/portraits/README.md) — the harness, the content editor, the portrait tool
- [`docs/images/`](./docs/images/) — the conceptual game-flow diagram this baseline was drawn from, and the runtime architecture

The v1 design and its proof of concept remain in history: the design at commit `059b645`, the
built game on branch `feature/poc`. v2 starts clean; nothing from v1 is assumed.
