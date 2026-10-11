# The harness

The harness plays games of the engine under an automatic policy (`src/policy.ts`, INPUTS 4.14) and
reports what they did: counters from each game's History, the measures of a Turn and a save, and a
fingerprint of every seed's last save. It runs under Vitest, in a project of its own that exists only
when `HEROESIM_HARNESS` is set, so `npm test` never plays it. `npm run harness` sets it.

## Commands

| Command | What it runs |
| --- | --- |
| `npm run harness` | The default runs: 1,000 worlds created, then 200 games of 20 years played (INPUTS 4.13) |
| `npm run harness -- gate <name>` | A release's Gate: 50 games of 20 years in 8 processes, the replay played once, alone, and compared with its shard's record, checked against `harness/gate.json` |
| `npm run harness -- neutral <name> --expect <fingerprint>` | A play-neutral story's proof: 10 games of 20 years, one process a game up to 10, more games sharing the 10 (DL-231 Q13, DL-251), its fingerprint checked against the one given (DL-186 item 30) |
| `npm run harness -- succession` | The Succession probe: 50 games of 12 years, the first Rival's Guildmaster at 50 (M9-F1) |
| `npm run harness -- estimate` | The estimate probe: 200 Parties and Quests, each resolved 20,000 times (v1.1.4-S5) |
| `npm run harness -- calibrate` | The calibration of the content, or of drafts (v1.1.4-S9): `docs/quests/calibration.md`, kept, and `calibration.json`, generated and ignored, which `npm run quest-review` reads; v1.1.4's is an asset of its GitHub Release (DL-218) |
| `npm run harness -- rivals-build-and-buy transfer-generator` | The engine's twenty-year boxes, out of `npm test` (DL-230): Rivals build and buy over 4 seeds, and the Transfer Generator over 100, about fifty minutes alone; a bare `npm run harness` runs them too |
| `npm run harness -- resolve.harness patron-offers.harness` | The engine's boxes kept apart at full size, out of `npm test` (DL-246): harm that reads the Stats over 20,000 draws a test, and Patron Regard on the Board over 50 seeds, whose first 10 `npm test` plays; seconds, alone, at a close; a bare `npm run harness` runs them too |
| `npm run harness -- speed` | The tests of a time limit, `*.speed.test.ts`, out of `npm test` (DL-233): the History's range read under 1 ms and the validator under 50 ms; seconds, alone, at a close; a bare `npm run harness` runs them too, beside its sweeps |
| `npm run harness -- compare <a> <b>` | What moved between two play sweeps' JSON reports: the play counters, and apart from them the save's sizes, measures that the save's shape and its config move (DL-205) |

`<name>` names the report: its release, or a word, each with kebab-case words after it if wanted, as
`v1.1.9-s3-neutral`; a milestone's `m<n>` is refused, since delivery is tracked by release (DL-228). The
default runs are named `creation` and `play`. Words after a command, or any
other words, pass through to Vitest: `npm run harness -- play.harness` plays the play sweep alone.
`compare` takes a report's path or its name in `harness/reports/`, with or without `.json`, or its
Markdown's path.

Sweeps run one at a time, with nothing else running, since a 20-year game's process holds about
1.3 GB (DL-184).

The last `neutral` baseline is
`036f5572ae584d30a558e8665bbcfd66cd80937e47b310d6cd2c26d95c7d8e0e` (`v1.2.0-close-neutral`, DL-274: schema 9,
config version 21, content version 41, v1.2.0's games), the reference every play-neutral story's `--expect` reads. The
Tiers (DL-262), Death by Tier (DL-265) and the Party floor (DL-266) changed play, so the earlier ones, v1.1.9's
`661789f1…` (`v1.2.0-s4-neutral`, schema 7) and the 4 × 2 quick check `62fab24b…` (`v1.2.0-s8-quick`), are no longer
`--expect`'s. Each changes only with a DL entry, as at a story that changes play or the
save's shape or raises the content version or the config version, both of which every save records
(with `meta.config`). The full `gate`'s, 50 × 20, is
`59d52e71b712bd1721a81d42b41a43fd3f680a7f29003cfe2533d04807c42d11` (`v1.2.0-gate`, v1.2.0's close, the
Gate's baseline in `gate.json`, DL-274).

## Settings

Every `HEROESIM_*` variable a run reads is parsed in one place, `src/settings.ts`, each bad value
refused by its name and an unknown `HEROESIM_*` name refused, so a mistyped setting fails the run
rather than playing something else. [`docs/environment.md`](../docs/environment.md) lists them. A variable set in the shell overrides a
profile's value: `HEROESIM_SEEDS=4 HEROESIM_YEARS=2 npm run harness -- gate v1.1.9-trial` plays the
Gate's run small. `HEROESIM_CONFIG` plays config values in place of the defaults, and
`HEROESIM_POLICY` the automatic policy's, each a JSON object of keys, checked before play: the config
by the engine's rule for every setting (`runConfig`, v1.1.6-S7, DL-193), a bad one refused by its name
before any game starts, and each game played under the engine's `playDeps`, as a front end's is.

`HEROESIM_SEEDS` means a run's own count: the worlds a creation sweep creates, the games a play sweep,
a module run or the Succession probe plays, the seeds each of the estimate's samples is resolved for,
or the seeds of each of the calibration's spot-check samples.

## Reports

Each run writes its Markdown report to `harness/reports/<name>-<date>.md`. A play sweep writes
its JSON report beside it (`src/run-report.ts`): what it played (seeds, years, content, config and
policy), its fingerprint, each game's line with its seed's own fingerprint (`games[].fingerprint`,
DL-188 item 6), its timings, its totals and its Targets: the data the Gate, `compare` and a later
run's Targets read.

`harness/reports/` is ignored by Git. A report a DL entry or a release's Gate cites is committed, its
Markdown and its JSON force-added (DL-186 item 28). A passing `gate` or `neutral` run prints the line:
`git add -f harness/reports/<name>.md harness/reports/<name>.json`.

The tree keeps only the reports that a test, `gate.json`, a live document or the open release's DL
entries cite. The rest leave it at a release's record (DL-223). The baseline is the closing
`gate` of the latest release that changed play, or one the owner asks for, as v1.1.8's (DL-229); the
previous one leaves the tree (`docs/agents/documentation.md`). Those v1.1.8's close removed, the
v1.1.6 baselines among them, are read from git at `efa515b` (DL-229). Those v1.1.9's record
removed, its stories' `neutral` runs, S1's baseline and v1.1.8's `neutral` reference among them, are
read from git at `fb55a8c`. The baseline v1.2.0's close replaced, `v1.1.8-gate`, is read from git at
`4220f57` (DL-274). The 84 committed before 2026-10-08 that nothing live cited are
read from git history: `git ls-tree --name-only b6d455c harness/reports/` lists them, and
`git show b6d455c:harness/reports/<name>` prints one.

## Targets

A play sweep's reports open, after the Summary and the Gate, with its Targets (`src/targets.ts`,
DL-259): the owner's target bands for the automatic policy's games (DL-83, the player's Deaths by
DL-256 item 10) and DL-69 item 4's lines for the Rivals, each declared once with the entry that set
it, and the Quest weight, the player's and each Disposition's. Each is measured with its standard
error over the games, set beside the value of the run report `HEROESIM_BASELINE` names
(`v1.2.0-gate-2026-10-11`, the release's closing gate, unless set, DL-270, DL-274; `none` for none), and marked inside or outside its band. None fails a run
(DL-257 item 7). The core-only run carries them until a module is on by default (DL-82 item 18).

## Counters

Each counter a play sweep reports is declared once, in `src/game-counters.ts` (DL-239): how a game
gives it, read from its History once it stops or gathered by an observer of the play loop as it is
played; where its total starts and how each game folds into it (summed, the greatest, or joined); its
kind; and its rows and lines in the report. The totals (`sweepTotals`, `src/counter.ts`) and the
report (`src/play-report.ts`) read nothing else, so a new counter is one declaration. Its kind decides
how two runs compare: `compare` lists the play counters that moved and, apart, the measures (the
save's sizes, DL-205), and leaves out the timings (the World State's copy) and the modules' own
counters, which the module report states apart.

The play loop (`src/play.ts`) tells its observers each moment of a game: the world created, each Turn
before the policy chooses, each action applied, each `advance`, each year's end, and the game's end.
The replay plays with none.

## The Gate

`harness/gate.json` declares what a release's closing sweep must meet, line by line, with each line's
source (`src/gate.ts`). Its invariants hold on any run: no policy action refused; no game invalid,
stopped by a harness assertion, unfinished or failing its round trip; the replay identical: one seed
played once more, alone, its last save's length and fingerprint the same as its shard recorded. Its
bands are set on its run, 50 games of 20 years, and read "not comparable" on a run of another shape:
the save after 20 years, its gzipped mean under 30 MiB; and the per-Turn copy's share of a Turn, the mean time of the copy (`copyWorld`, timed as
each year ended) over the mean time of `advance`, at most 25% over its baseline share, 0.390 (1.438 ms
over 3.688 ms, measured at v1.1.9's closing full gate, DL-252), so at most 0.4875 (DL-206 item 17, DL-207),
printed as it is applied, and the share printed to as many places as show it above the limit when it
fails; a run with no copy times or no `advance` times reads "not comparable", naming the times missing
and printing those measured. The report prints both times and the share. The Traits earned a player's Hero career, the save's uncompressed size and the player's
Bankruptcies are not lines of the Gate; the report prints them, the Bankruptcies in its Targets
(DL-257 item 7). The estimate probe reads its two limits from it. A `gate` or `neutral`
run prints each line's verdict and writes them into both reports; it fails when a line fails.

The spec binds: the owner approved its first draft on 2026-10-05 (DL-188), its `status` `approved`. Its
lines and baselines change only with a DL entry (DL-186 item 13).
