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
frozen, and the v1.0 line is not deployed again after `v1.1.0` (DL-86, DL-88, DL-110). `main` is
production and GitHub's default branch: only a release branch's pull request moves it, and merging
one releases (DL-124; see [Deploy](#deploy)).

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

One build of the page, gated, is uploaded to both addresses (INPUTS 7.8; DL-88, DL-92, DL-94):

- the Worker `heroesim`, Cloudflare Workers static assets configured by `web/wrangler.jsonc`, at
  <https://heroesim.magical-potato.workers.dev>: the Worker's name, then the account's workers.dev
  subdomain, `magical-potato`. The subdomain is account-wide and set in the Cloudflare dashboard
  (Workers & Pages, "Your subdomain"); changing it would move the address and strand the saves
  kept there;
- the Pages project `heroesims`, production branch `main`, at <https://heroesims.pages.dev>,
  deployed until Cloudflare retires Pages.

**A release is a merged pull request** (DL-122, DL-124). `main` is production: only a release
branch's pull request moves it, and each merge releases.
1. Work lands on the line's `v#.#-dev` and is merged into its `v#.#-release`. `check` runs on
   every push to either: lint, typecheck, the tests at Node 22 and at `.node-version`, and the
   browser specs in Chromium at three widths.
2. A push that leaves the release branch ahead of `main` makes CI open the branch's pull request
   to `main`, or update the open one (`release-pr.yml`). The pull request names the tag its merge
   will release.
3. **Merging it (with a merge commit) is the release.** `release.yml` tags the merge with the
   line's next patch, `v#.#.0` for a line's first (`web/scripts/release.mjs`), and runs the
   deploy (`deploy.yml`):
   - it refuses a tag not on `main`, or older than the newest release;
   - it runs the checks and the browser specs again;
   - it reads that Pages's production branch is `main`, so that no upload is a preview;
   - it runs `npm run deploy` from its clean checkout of the tag, which fails if Pages took the
     upload as anything but production;
   - it runs `npm run e2e:live -w web` on both addresses;
   - it publishes the record as the tag's GitHub Release.

   Leaving the pull request open holds the next release while commits gather.

If `main` ever takes a commit that no release branch holds (a direct push, or a pull request
from elsewhere), every later release is refused, because `main` differs from the pull request's
head. Merge `main` back into the current release branch and push it; the next pull request
releases both.

A new line needs only its two branches. Each new dev branch, a line's or a patch's, moves
Dependabot's `target-branch` (`.github/dependabot.yml`) to itself (DL-147), which takes effect once
released to `main`. Every day `watch.yml` does three things, and opens an issue when any of
them fails, or when the token expires within 30 days:
- it plays both addresses;
- it verifies the Cloudflare token and its expiry;
- it reads Pages's production branch.

A tag already pushed can be deployed again from the Actions tab ("deploy", "Run workflow", with
the tag). A rollback is the same run with "allow_older" ticked, and only to `v1.1.1` or later: code
older than a save may not load it. One deploy runs at a time. The two credentials are secrets of
the repository's `production` environment, never a file here (INPUTS 7.9), read only by the steps
that talk to Cloudflare:
- `CLOUDFLARE_API_TOKEN`: a custom API token scoped to the one account, from the "Edit Cloudflare
  Workers" template with Account › Cloudflare Pages › Edit added;
- `CLOUDFLARE_ACCOUNT_ID`: the account's id.

Set them with `gh secret set CLOUDFLARE_API_TOKEN --env production` and
`gh secret set CLOUDFLARE_ACCOUNT_ID --env production`, each reading its value from the prompt.

A Worker has no branches, so every upload to it goes live: the deploy runs only from a clean
checkout of a release tag, and refuses anything else (DL-92).

**By hand**, the same deploy runs from this machine, as every release before `v1.1.0` did. It is
for when CI cannot run:

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
   npx -y wrangler@4 pages deploy dist --project-name heroesims --branch main
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
3. **The record.** After both uploads the script prints the release's record, which CI publishes
   as the tag's GitHub Release (DL-88, DL-124). It holds:
   - the tag, the commit and the UTC time;
   - each wrangler run's version;
   - the Worker's version id and address;
   - the Pages deployment's URL, environment and commit.

   These are read from the file wrangler writes when `WRANGLER_OUTPUT_FILE_PATH` names one. With
   `HEROESIM_DEPLOY_RECORD` set, the record is also written to the file it names.

   The script fails if Pages took the upload as anything but production, or recorded another
   commit, or if the Worker is not at the address the live check reads. It only warns when
   wrangler wrote no record. If Pages fails after the Worker took the build, it prints the
   Worker's part, the record of the attempt.
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
