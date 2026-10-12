# Deploy

How a release reaches the page's two addresses, and how to deploy by hand when CI cannot. Moved
from the README (DL-217); the environment variables it names are in [`environment.md`](environment.md).


One build of the page, gated, is uploaded to both addresses (INPUTS 7.8; DL-88, DL-92, DL-94):

- the Worker `heroesim`, Cloudflare Workers static assets configured by `web/wrangler.jsonc`, at
  <https://heroesim.magical-potato.workers.dev>: the Worker's name, then the account's workers.dev
  subdomain, `magical-potato`. The subdomain is account-wide and set in the Cloudflare dashboard
  (Workers & Pages, "Your subdomain"); changing it would move the address and strand the saves
  kept there;
- the Pages project `heroesims`, production branch `main`, at <https://heroesims.pages.dev>,
  deployed until Cloudflare retires Pages.

**A release is a merged pull request** (DL-122, DL-124). `main` is production: only a release
branch's pull request moves it, and each merge releases unless it is a record (DL-255, below).
1. Work lands on a dev branch, the line's `v#.#-dev` or a patch's own `v1.1.N-dev`, and the line's
   `v#.#-release` is moved to it. `check` runs on every push to either: lint, typecheck and the
   tests on `.node-version`, the floor (DL-235), and the browser specs in Chromium at three widths.
2. A push that leaves the release branch ahead of `main` makes CI open the branch's pull request
   to `main`, or update the open one (`release-pr.yml`). The pull request names the tag its merge
   will release.
3. **Merging it (with a merge commit) is the release.** `release.yml` tags the merge with the
   line's next patch, `v#.#.0` for a line's first (`web/scripts/release.mjs`), and runs the
   deploy (`deploy.yml`):
   - it refuses a tag not on `main`, or older than the newest release;
   - it runs the lint and the typecheck;
   - it runs `npm test` and the browser specs again unless the tag's tree has passed them already
     (DL-235). `web/scripts/tested.mjs` skips them only when the tag is a merge whose tree is its
     second parent's, the release branch's tip, and GitHub records a push run of `check` that
     passed on that tip. Anything uncertain runs them: a deploy run by hand, no second parent,
     another tree, GitHub's record unread, or no run of `check` that passed. The run's summary
     says which, and why;
   - it reads that Pages's production branch is `main`, so that no upload is a preview;
   - it runs `npm run deploy` from its clean checkout of the tag, which builds the page and its
     bundle gate every time, and fails if Pages took the upload as anything but production;
   - it runs `npm run e2e:live -w web` on both addresses;
   - it publishes the record as the tag's GitHub Release.

   Leaving the pull request open holds the next release while commits gather.

**A record releases nothing** (DL-255). When every path that differs between the newest release
tag and the branch's tip lies in `docs/`, `harness/reports/` or `.github/`, is a Markdown file
(`*.md`), or is `web/scripts/release.mjs`, its types or its test, the merge is a record:
`node web/scripts/release.mjs record <commit>` prints `record`, and otherwise `release`. A rename
counts both its paths. `release-pr.yml` titles such a pull request "Record from `<branch>` (no
release)". Merging it, `release.yml` refuses as it would a release's merge (a push to `main` that
merged no one release branch's pull request, a tree other than that pull request's head, an older
line's branch), then makes no tag and calls no deploy, and says so in the run's summary; the newest
release stays production. If the judgement itself fails, the run fails, and nothing is tagged. A
merge that changes anything else releases, and its tag holds the records merged before it.

If `main` ever takes a commit that no release branch holds (a direct push, or a pull request
from elsewhere), every later release is refused, because `main` differs from the pull request's
head. Merge `main` back into the current release branch and push it; the next pull request
releases both.

A new line needs only its two branches. Each new dev branch, a line's or a patch's, moves
Dependabot's `target-branch` (`.github/dependabot.yml`) to itself (DL-147), which takes effect once
released to `main`. Every Monday `watch.yml` does three things, and opens an issue when any of
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
   loads it, and fails if the page asks anything of another origin (DL-75), but on Pages
   Cloudflare's Web Analytics beacon, which Pages adds at the edge (DL-279). With
   `HEROESIM_LIVE_URL` set to one address it checks that address alone (two tests): for a Worker
   that wrangler reported at another address, checked there and then on pages.dev before the
   address here and in `web/scripts/deploy.mjs` is corrected.

Wrangler keeps its working state in `.wrangler/`, which `.gitignore` excludes;
`web/src/deploy.test.ts` fails if a token, an account id or that directory ever enters the
repository.
