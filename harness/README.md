# The harness

The harness plays games of the engine under an automatic policy (`src/policy.ts`, INPUTS 4.14) and
reports what they did: counters from each game's History, the measures of a Turn and a save, and a
fingerprint of every seed's last save. It runs under Vitest, in a project of its own that exists only
when `HEROESIM_HARNESS` is set, so `npm test` never plays it. `npm run harness` sets it.

## Commands

| Command | What it runs |
| --- | --- |
| `npm run harness` | The milestone's runs: 1,000 worlds created, then 200 games of 20 years played (INPUTS 4.13) |
| `npm run harness -- gate <milestone>` | A release's Gate: 50 games of 20 years in 8 processes, the replay played once, alone, and compared with its shard's record, checked against `harness/gate.json` |
| `npm run harness -- neutral <milestone> --expect <fingerprint>` | A play-neutral story's proof: 10 games of 20 years in 8 processes, about 7 minutes, its fingerprint checked against the one given (DL-186 item 30) |
| `npm run harness -- succession` | The Succession probe: 50 games of 12 years, the first Rival's Guildmaster at 50 (M9-F1) |
| `npm run harness -- estimate` | The estimate probe: 200 Parties and Quests, each resolved 20,000 times (v1.1.4-S5) |
| `npm run harness -- calibrate` | The calibration of the content, or of drafts (v1.1.4-S9) |
| `npm run harness -- compare <a> <b>` | What moved between two play sweeps' JSON reports |

`<milestone>` names the report: `m<n>` or `m<n>-<name>`, as `m9-v116-s3`. Words after a command, or any
other words, pass through to Vitest: `npm run harness -- play.harness` plays the play sweep alone.
`compare` takes a report's path or its name in `harness/reports/`, with or without `.json`, or its
Markdown's path.

Sweeps run one at a time, with nothing else running, since a 20-year game's process holds about
1.3 GB (DL-184).

The current `neutral` baseline, every play-neutral story's `--expect`, is
`7298b50207f77bb6d0a5ba5255e3520c796f746d936d94a20ce38202ed117482` (`m9-v116-s14`, v1.1.6-S14, DL-200:
schema 7, config version 14, content version 35; S7's was `bfbd3701…` at 34). The 4 × 2 quick check at
content 35 is `0082146222404990afda7d25d031f2a89d5ed279a45c4b942ace1b8671bd8f33`. It changes only with a DL entry,
as at a story that changes play or the save's shape (v1.1.6-S7 and S17) or raises the content version.
The full `gate`'s, 50 × 20, is `143a44c770f94185d5565da7457c87c32bebc97e78ddfab9ed186f2d83d881b9`
(`m9-v116-s7`, DL-193).

## Settings

Every `HEROESIM_*` variable a run reads is parsed in one place, `src/settings.ts`, each bad value
refused by its name and an unknown `HEROESIM_*` name refused, so a mistyped setting fails the run
rather than playing something else. INPUTS §9 lists them. A variable set in the shell overrides a
profile's value: `HEROESIM_SEEDS=4 HEROESIM_YEARS=2 npm run harness -- gate m9-trial` plays the
Gate's run small. `HEROESIM_CONFIG` plays config values in place of the defaults, and
`HEROESIM_POLICY` the automatic policy's, each a JSON object of keys, checked before play: the config
by the engine's rule for every setting (`runConfig`, v1.1.6-S7, DL-193), a bad one refused by its name
before any game starts, and each game played under the engine's `playDeps`, as a front end's is.

`HEROESIM_SEEDS` means a run's own count: the worlds a creation sweep creates, the games a play sweep,
a module run or the Succession probe plays, the seeds each of the estimate's samples is resolved for,
or the seeds of each of the calibration's spot-check samples.

## Reports

Each run writes its Markdown report to `harness/reports/<milestone>-<date>.md`. A play sweep writes
its JSON report beside it (`src/run-report.ts`): what it played (seeds, years, content, config and
policy), its fingerprint, each game's line, its timings and its totals, the data the Gate and
`compare` read.

`harness/reports/` is ignored by Git. A report a DL entry or a release's Gate cites is committed, its
Markdown and its JSON force-added (DL-186 item 28). A passing `gate` or `neutral` run prints the line:
`git add -f harness/reports/<name>.md harness/reports/<name>.json`.

## The Gate

`harness/gate.json` declares what a release's closing sweep must meet, line by line, with each line's
source (`src/gate.ts`). Its invariants hold on any run: no policy action refused; no game invalid,
stopped by a harness assertion, unfinished or failing its round trip; the replay identical: one seed
played once more, alone, its last save's length and fingerprint the same as its shard recorded. Its
bands are set on its run, 50 games of 20 years, and read "not comparable" on a run of another shape:
the player's Bankruptcies, at most 3 of 50, and the save after 20 years, its gzipped mean under
30 MiB. The Traits earned a player's Hero career and the save's uncompressed size are not lines of the
Gate; the report prints them. The estimate probe reads its two limits from it. A `gate` or `neutral`
run prints each line's verdict and writes them into both reports; it fails when a line fails.

The spec binds: the owner approved its first draft on 2026-10-05 (DL-188), its `status` `approved`. Its
lines and baselines change only with a DL entry (DL-186 item 13).
