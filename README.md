# Heroesim

A guild-management simulation. You are a Guildmaster running a Guild of Heroes: take Quests
from Patrons, choose who to send, and grow the Heroes and the Guild over the years. The engine
is mechanical first; story-rich modules such as Campaigns and Scenarios come later.

The design is v2, baselined 2026-09-24. Its first build is complete, built milestone by milestone
and tagged `m8-modules` on 2026-09-28 ([`docs/plan.md`](./docs/plan.md)); the same commit is
tagged `v1.0.0`, the first release. Next comes a small v1.0.x release that moves the deploy (see
[Deploy](#deploy)), then Random Events, the first real module, on the v1.1 line: built on
`v1.1-dev`, released by merging into `v1.1-release`, with milestone tags continuing from
`m9-random-events`. `v1.0-dev` and `v1.0-release` are frozen but for v1.0.x hotfix releases (DL-86, DL-88, DL-91). GitHub's
default branch is the latest release branch: `v1.0-release`, until `v1.1-release`'s first release
(DL-88).

## Play

- **In a browser:** <https://heroesims.pages.dev>. One static page, the same engine as the
  terminal: no account, no server, no network call, and saves kept in the browser (R38, N2). A
  move to Cloudflare Workers, at a new `workers.dev` address, is decided and not yet made; this
  address stays deployed beside it (DL-88). The browser keeps saves per address, so a game saved
  at one is not seen at the other.
- **In a terminal:** `npm ci` once, then `npm run play -- help` for the commands.

## Deploy

The page is built and gated on this machine and uploaded already built to Cloudflare Pages,
project `heroesims`, production branch `v1.0-release`. Nothing deploys from CI and no secret is
needed anywhere (INPUTS 7.8 and 7.9, DL-68). The steps below are the deploy until the move to
Cloudflare Workers lands.

**Decided, not yet built.** The page moves to Cloudflare Workers static assets, at a new
`workers.dev` address, in a small v1.0.x release before Random Events, which also changes
`npm run deploy`, this section and `e2e:live`. <https://heroesims.pages.dev> goes on being
deployed beside it until Cloudflare retires Pages (INPUTS 7.8, answered anew in DL-88).
Production serves the latest release: the deploy moves to `v1.1-release` at that branch's first
release, and v1.0 stays live until then (DL-86). Each release records the commit deployed, the
date and the `e2e:live` result (DL-88).

1. **Once per machine:** `npx wrangler login`. It opens the browser to sign in to Cloudflare and
   keeps its token in wrangler's own directory under your user profile, never in this repository.
2. **Each release, from a checkout of `v1.0-release`:** `npm run deploy`. That is
   `npm run build -w web` (the Vite build and the bundle gate), then
   `npx -y wrangler@4 pages deploy dist --project-name heroesims --branch v1.0-release`, which
   publishes `web/dist` to <https://heroesims.pages.dev>. The page published is whatever the
   checkout builds; `--branch` is always given, because a deploy Pages takes for any other
   branch is a preview that never reaches the URL.
3. **After each deploy:** `npm run e2e:live -w web` plays a game on <https://heroesims.pages.dev>
   in Chromium at a phone's width and a desktop's, saves it in IndexedDB, reloads and loads it,
   and fails if the page asks anything of another origin (DL-75).

Wrangler keeps its working state in `.wrangler/`, which `.gitignore` excludes;
`web/src/deploy.test.ts` fails if a token, an account id or that directory ever enters the
repository.

## Documents

- [`CONTEXT.md`](./CONTEXT.md) — the glossary, and the words not to use
- [`docs/requirements.md`](./docs/requirements.md) — what the game is, the first build, and what is deferred
- [`docs/principles.md`](./docs/principles.md) — the design principles and what goes wrong without each
- [`docs/approach.md`](./docs/approach.md) — architecture, Turn pipeline, layout, verification
- [`docs/plan.md`](./docs/plan.md) — the delivery plan: milestones, session-sized increments, what "done" means
- [`docs/decision-log.md`](./docs/decision-log.md) — decisions taken during the build, appended as they are made
- [`docs/planning/epics/`](./docs/planning/epics/README.md) — the implementation plan: one epic per milestone, and the inputs required from the owner
- [`docs/data-model.md`](./docs/data-model.md) — the World State document: sections, tables, rules, validator
- [`docs/adr/`](./docs/adr/) — the decisions that are hard to reverse, and why
- [`docs/images/`](./docs/images/) — the conceptual game-flow diagram this baseline was drawn from

The v1 design and its proof of concept remain in history: the design at commit `059b645`, the
built game on branch `feature/poc`. v2 starts clean; nothing from v1 is assumed.
