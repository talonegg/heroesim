# Heroesim

A guild-management simulation. You are a Guildmaster running a Guild of Heroes: take Quests
from Patrons, choose who to send, and grow the Heroes and the Guild over the years. The engine
is mechanical first; story-rich modules such as Campaigns and Scenarios come later.

The design is v2, baselined 2026-09-24. Its first build is complete, built milestone by milestone
and tagged `m8-modules` on 2026-09-28 ([`docs/plan.md`](./docs/plan.md)); the same commit is
tagged `v1.0.0`, the first release. `v1.0.1`, a small hotfix release, serves the page from
Cloudflare Workers beside Pages (see [Deploy](#deploy)); then comes Random Events, the first real
module, on the v1.1 line: built on `v1.1-dev`, released by merging into `v1.1-release`, with
milestone tags continuing from `m9-random-events`. `v1.0-dev` and `v1.0-release` are frozen but
for v1.0.x hotfix releases (DL-86, DL-88, DL-91, DL-92). GitHub's default branch is the latest
release branch: `v1.0-release`, until `v1.1-release`'s first release (DL-88).

## Play

- **In a browser:** <https://heroesim.magical-potato.workers.dev> or <https://heroesims.pages.dev>:
  the same page at two addresses, on Cloudflare Workers and on Cloudflare Pages, each release
  deployed to both (DL-88, DL-94). One static page, the same engine as the terminal: no account,
  no server, no network call, and saves kept in the browser (R38, N2). The browser keeps saves per
  address: a game saved at one is not seen at the other, and moves between them only as a file,
  by "Export this game" at one and "Load a save file" at the other.
- **In a terminal:** `npm ci` once, then `npm run play -- help` for the commands.

## Deploy

The page is built and gated on this machine, and that one build is uploaded to both addresses
(INPUTS 7.8; DL-88, DL-92, DL-94):

- the Worker `heroesim`, Cloudflare Workers static assets configured by `web/wrangler.jsonc`, at
  <https://heroesim.magical-potato.workers.dev>: the Worker's name, then the account's workers.dev
  subdomain, `magical-potato`. The subdomain is account-wide and set in the Cloudflare dashboard
  (Workers & Pages, "Your subdomain"); changing it would move the address and strand the saves
  kept there;
- the Pages project `heroesims`, production branch `v1.0-release`, at <https://heroesims.pages.dev>,
  deployed until Cloudflare retires Pages.

Nothing deploys from CI and no secret is needed anywhere (INPUTS 7.9, DL-68). Production serves
the latest release: the deploy moves to `v1.1-release` at that branch's first release, and v1.0
stays live until then (DL-86). A Worker has no branches, so every upload to it goes live: the
deploy runs only from a clean checkout of a release tag, and refuses anything else (DL-92).

1. **Once per machine:** `npx wrangler login`. It opens the browser to sign in to Cloudflare and
   keeps its token in wrangler's own directory under your user profile, never in this repository.
   If the login sees more than one account, wrangler asks which at each upload.
2. **Each release, from a clean checkout of its release tag,** cloned from the clone that holds
   the tag, since the tag is pushed only once the deploy and the live check have passed (DL-92):

   ```sh
   git clone --branch v1.0.1 . ../heroesim-deploy   # the release's tag
   cd ../heroesim-deploy && npm ci
   npm run deploy
   npm run e2e:live -w web
   ```

   `npm run deploy` runs `web/scripts/deploy.mjs`. It refuses, before it builds anything, unless
   `git status --porcelain` prints nothing, `git tag --points-at HEAD` lists one release tag
   (`v*`), no other wrangler configuration, nor the redirect `.wrangler/deploy/config.json`, sits
   in `web/` or above it, where wrangler would find it first, and no `.env` or `.env.local` sits
   in `web/`, which wrangler would load into its environment (git ignores `.wrangler/` and `.env`,
   so the clean check does not see them; DL-97). Then it builds once (`npm run build -w web`: the
   Vite build and the bundle gate) and uploads that build from `web/`, stopping at the first
   failure, first to the Worker, then to Pages:

   ```sh
   npx -y wrangler@4 deploy --config wrangler.jsonc --tag <tag> --message "<tag> at commit <sha>"
   npx -y wrangler@4 pages deploy dist --project-name heroesims --branch v1.0-release
   ```

   A Worker version records its commit only in its message or tag; Pages reads the commit from
   git. `--branch` is always given, because a deploy Pages takes for any other branch is a
   preview that never reaches the address. Pages warns, every time, that `web/wrangler.jsonc`
   lacks `pages_build_output_dir` and ignores the file: it is the Worker's, and the warning is
   expected.

   The Worker goes first, so that a failure there leaves pages.dev, where the players' saves are,
   as it was. `npm run deploy --dry-run` (or `node scripts/deploy.mjs --dry-run` from `web/`)
   runs the checks and the build and prints both wrangler commands, running neither. Any other
   flag is refused, a mistyped one npm keeps for itself among them: npm hands the script
   `--dryrun` as `npm_config_dryrun`, and from the root even `npm run deploy -- --dryrun` (DL-97).
3. **The record.** After both uploads the script prints what the release's decision-log entry
   records with the live check's result (DL-88): the tag, the commit, the UTC time, each wrangler
   run's version, the Worker's version id and address, and the Pages deployment's URL,
   environment and commit, read from the file wrangler writes when `WRANGLER_OUTPUT_FILE_PATH`
   names one. It warns loudly if the Worker is not at the address the live check reads. If Pages
   fails after the Worker took the build, it prints the Worker's part, for the entry that records
   the attempt.
4. **After each deploy:** `npm run e2e:live -w web` plays a game on both addresses, each in
   Chromium at a phone's width and a desktop's (four tests), saves it in IndexedDB, reloads and
   loads it, and fails if the page asks anything of another origin (DL-75). With
   `HEROESIM_LIVE_URL` set to one address it checks that address alone (two tests): for a Worker
   that wrangler reported at another address, checked there and then on pages.dev before the
   address here, in `web/scripts/deploy.mjs` and in INPUTS 7.8 is corrected.

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
