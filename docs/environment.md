# Environment variables

Every environment variable the repository reads, in one place: moved from the first build's
`INPUTS-REQUIRED.md` §9 (DL-217), which code cites as "INPUTS §9".


None are needed before M7, and none are read by the engine, ever.

| Variable | Read by | Needed when | Where it lives |
| --- | --- | --- | --- |
| `HEROESIM_HARNESS` | `harness/` Vitest project | Running the harness (M1 on) | Shell, or `npm run harness` sets it |
| `HEROESIM_SEEDS` | `harness/` | Optional count for a harness run, by the run (named apart in `harness/src/settings.ts`, v1.1.6-S2): the worlds a creation sweep creates (1,000, M1-S10), the games a play sweep plays (200, DL-34 item 7; a profile's own), the games of a module run or the Succession probe (50), the seeds each estimate sample is resolved for (20,000) or a calibration's spot-check seeds (4,000) | Shell |
| `HEROESIM_VALIDATE` | `harness/` | Run the validator after every `advance` in a harness run (M2-S12) | Shell |
| `HEROESIM_MODULES` | `harness/` | Comma-separated module ids to install for a harness run (M8-S3): the run plays `HEROESIM_SEEDS` seeds (50 by default) with the modules and with none, in place of the creation and play runs (DL-78) | Shell |
| `HEROESIM_PROFILE`, `HEROESIM_PROBE`, `HEROESIM_MILESTONE`, `HEROESIM_EXPECT` | `harness/` | The run a command names: a profile (`gate`, `neutral`) and its report's name and expected fingerprint, or a probe (`succession`, `estimate`, `calibrate`); set by `npm run harness -- <command>` from its words (v1.1.6-S2, DL-186 items 13 and 30) | Shell, or `npm run harness` sets them |
| `HEROESIM_YEARS`, `HEROESIM_WORKERS`, `HEROESIM_REPLAY` | `harness/` | Optional: the years each game plays (M9-S2), the child processes at once (v1.1.4-S10), and whether the play sweep replays one seed; each overrides a profile's value | Shell |
| `HEROESIM_DRAFTS`, `HEROESIM_CONFIG`, `HEROESIM_POLICY` | `harness/` | Optional trials: draft content files, config values and the automatic policy's values played in place of the core's and the defaults (v1.1.4-S9; `HEROESIM_POLICY` v1.1.6-S2) | Shell |
| `HEROESIM_BASELINE` | `harness/` | Optional: the run report whose values a play sweep's Targets set beside its own, a path or a name in `harness/reports/`, or `none`; v1.1.9's closing gate unless set (DL-259) | Shell |
| `HEROESIM_SAMPLES`, `HEROESIM_PARTIES`, `HEROESIM_TUNE`, `HEROESIM_FLAT`, `HEROESIM_CALIBRATION_OUT` | `harness/` | Optional, the estimate probe's and the calibration's own (v1.1.4-S5, v1.1.4-S9); every harness variable is parsed by `harness/src/settings.ts`, which refuses a bad value and an unknown `HEROESIM_*` name by name | Shell |
| `MEASURE_PEAK_LOG` | `tools/measure/peak.mjs` | Optional: the file each Node process of a measured run appends its peak memory and time to, when `peak.mjs` is preloaded (DL-233) | Shell |
| `HEROESIM_SAVE_DIR` | `cli/` | Optional override of `.saves/` | Shell |
| `HEROESIM_LIVE_URL` | `web/playwright.live.config.ts` | Optional: one address for `npm run e2e:live -w web` to check, in place of the two addresses of [`deploy.md`](deploy.md) (DL-94) | Shell |
| `HEROESIM_DEPLOY_RECORD` | `web/scripts/deploy.mjs` | Optional: a file the deploy's record is also written to, for the tag's GitHub Release (DL-124 item 8) | CI's deploy job |
| `GITHUB_REPOSITORY`, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`, `GH_TOKEN` | `web/scripts/tested.mjs`, and `gh` the token | The deploy's choice whether `npm test` and the browser specs run again (DL-235): the repository whose runs of `check` it reads, the files its choice and reason are written to, and the token `gh api` reads with; GitHub Actions sets the first three, and the step `GH_TOKEN` | CI's deploy job |
| `HEROESIM_OWNER_PICTURES` | `tools/portraits/src/owner.test.ts` | Set to run the tests of the owner's 40 Guildmaster pictures, which `npm test` and CI skip: the folder that holds them, `..\heroesim-inbox\guildmaster\` on the owner's machine (DL-136, DL-234) | Shell |
| `WRANGLER_OUTPUT_FILE_PATH` | `wrangler` | Set by `web/scripts/deploy.mjs` for each wrangler run, to a file in the system's temporary directory from which it reads the deploy's record (DL-94); never set by hand | The deploy's own process |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `wrangler` | The deploy in CI (`deploy.yml`, DL-124); `CLOUDFLARE_ACCOUNT_ID` also for a deploy by hand when the login sees more than one account (DL-94) | The repository's `production` environment's secrets, or the deploying process alone; never a file in the repository |

Nothing else. If a story finds it needs a variable, it is added here first.
