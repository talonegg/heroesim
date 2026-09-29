# Heroesim

A guild-management simulation. You are a Guildmaster running a Guild of Heroes: take Quests
from Patrons, choose who to send, and grow the Heroes and the Guild over the years. The engine
is mechanical first; story-rich modules such as Campaigns and Scenarios come later.

The design is v2, baselined 2026-09-24. Its first build is complete, built milestone by milestone
and tagged `m8-modules` on 2026-09-28 ([`docs/plan.md`](./docs/plan.md)); the same commit is
tagged `v1.0.0`, the first release. `v1.0.1`, a small hotfix release, serves the page from
Cloudflare Workers beside Pages (see [Deploy](#deploy)). The v1.1 line is M9, the page
redesigned (DL-99): views in a shell in place of one long column, the History as the one place to
read what happened to any Guild, Hero or Patron, a Party builder, and a new style, with the
Guildmaster's setup (#30) and two fast-forward stops (#32), and the owner's follow-on from playing
it (DL-111 to DL-121): a Quest's return as one entry with its report, the World History, the Guild
in four parts with its Stores and Treasury, and the Market and the Guildmaster as views. It is
released as `v1.1.0` on `v1.1-release`, tagged `m9-redesign` too (#37, DL-123). Random Events, the
first real module, follows on the v1.2 line as M10 (DL-99). `v1.0-dev` and `v1.0-release` are
frozen, and the v1.0 line is not deployed again after `v1.1.0` (DL-86, DL-88, DL-110). GitHub's
default branch is the latest release branch, `v1.1-release` (DL-88).

## Play

- **In a browser:** <https://heroesim.magical-potato.workers.dev> or <https://heroesims.pages.dev>:
  the same page at two addresses, on Cloudflare Workers and on Cloudflare Pages, each release
  deployed to both (DL-88, DL-94). One static page, the same engine as the terminal: no account,
  no server, no network call, and saves kept in the browser (R38, N2). The browser keeps saves per
  address: a game saved at one is not seen at the other, and moves between them only as a file,
  by "Export this game" at one and "Load a save file" at the other.
- **In a terminal:** `npm ci` once, then `npm run play -- help` for the commands.

## Deploy

One build of the page, gated, is uploaded to both addresses (INPUTS 7.8; DL-88, DL-92, DL-94):

- the Worker `heroesim`, Cloudflare Workers static assets configured by `web/wrangler.jsonc`, at
  <https://heroesim.magical-potato.workers.dev>: the Worker's name, then the account's workers.dev
  subdomain, `magical-potato`. The subdomain is account-wide and set in the Cloudflare dashboard
  (Workers & Pages, "Your subdomain"); changing it would move the address and strand the saves
  kept there;
- the Pages project `heroesims`, production branch `v1.1-release`, at <https://heroesims.pages.dev>,
  deployed until Cloudflare retires Pages.

**A release deploys from CI** (DL-122, superseding DL-68's "nothing deploys from CI"). Pushing a
`v*` tag runs `.github/workflows/deploy.yml`:
- it refuses a tag whose commit is not on the branch the deploy names (`releaseBranch` in
  `web/scripts/deploy.mjs`, `v1.1-release`), so a tag on the frozen v1.0 line never deploys;
- it runs the checks `check.yml` runs (lint, typecheck, tests);
- it runs `npm run deploy` from its clean checkout of the tag, and then `npm run e2e:live -w web`
  on both addresses.

A tag already pushed can be deployed again from the Actions tab ("deploy", "Run workflow", with
the tag). One deploy runs at a time. The two credentials are secrets of the repository's
`production` environment, never a file here (INPUTS 7.9):
- `CLOUDFLARE_API_TOKEN`: a custom API token scoped to the one account, from the "Edit Cloudflare
  Workers" template with Account › Cloudflare Pages › Edit added;
- `CLOUDFLARE_ACCOUNT_ID`: the account's id.

Set them with `gh secret set CLOUDFLARE_API_TOKEN --env production` and
`gh secret set CLOUDFLARE_ACCOUNT_ID --env production`, each reading its value from the prompt.

A release is therefore: merge the release into its release branch and push it (`check` runs),
then tag its head `v*` and push the tag. Production serves the latest release: the deploy moved
to `v1.1-release` at that branch's first release, `v1.1.0` (DL-86, DL-123). A Worker has no
branches, so every upload to it goes live: the deploy runs only from a clean checkout of a release
tag, and refuses anything else (DL-92).

**By hand**, the same deploy runs from this machine, as every release before `v1.1.0` did:

1. **Once per machine:** `npx wrangler login`. It opens the browser to sign in to Cloudflare and
   keeps its token in wrangler's own directory under your user profile, never in this repository.
   If the login sees more than one account, wrangler asks which at each upload.
2. **Each release, from a clean checkout of its release tag,** cloned from the clone that holds
   the tag (DL-92):

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
   npx -y wrangler@4 pages deploy dist --project-name heroesims --branch v1.1-release
   ```

   A Worker version records its commit only in its message or tag; Pages reads the commit from
   git. `--branch` is always given, because a deploy Pages takes for any other branch is a
   preview that never reaches the address. Pages warns, every time, that `web/wrangler.jsonc`
   lacks `pages_build_output_dir` and ignores the file: it is the Worker's, and the warning is
   expected.

   The Worker goes first, so that a failure there leaves pages.dev, where the players' saves are,
   as it was. `npm run deploy --dry-run` (or `node scripts/deploy.mjs --dry-run` from `web/`)
   runs the checks and the build and prints both wrangler commands, running neither. Any other
   argument the script receives is refused, and so is a flag npm keeps for itself whose name
   holds "dry" or "run": npm hands the script `--dryrun` as `npm_config_dryrun`, and from the
   root even `npm run deploy -- --dryrun`. A flag npm keeps under any other name never reaches
   the script, and on a clean checkout of a release tag the deploy goes ahead (DL-97).
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
