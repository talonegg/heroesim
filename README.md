# Heroesim

A guild-management simulation. You are a Guildmaster running a Guild of Heroes: take Quests
from Patrons, choose who to send, and grow the Heroes and the Guild over the years. The engine
is mechanical first; story-rich modules such as Campaigns and Scenarios come later.

The design is v2, baselined 2026-09-24. Its first build is under way, milestone by milestone
([`docs/plan.md`](./docs/plan.md)).

## Play

- **In a browser:** <https://heroesims.pages.dev>. One static page, the same engine as the
  terminal: no account, no server, no network call, and saves kept in the browser (R38, N2).
- **In a terminal:** `npm ci` once, then `npm run play -- help` for the commands.

## Deploy

The page is built and gated on this machine and uploaded already built to Cloudflare Pages,
project `heroesims`, production branch `v1.0-release`. Nothing deploys from CI and no secret is
needed anywhere (INPUTS 7.8 and 7.9, DL-68).

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
