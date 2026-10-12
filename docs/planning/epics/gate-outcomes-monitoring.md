# Gate outcomes: v1.2.1 against v1.2.0, v1.1.9 and v1.1.8

A record kept for tracking: the harness's full Gate outcomes of v1.2.1 as built to S10 (config 30, content 45, commit
`3170082`) beside the closing full Gates of v1.2.0, v1.1.9 and v1.1.8, and of v1.2.1 as released.
The owner asked for it on 2026-10-12: "document all outcomes from 1.2.1 against 1.2.0 and 1.1.8/9 in a table
in an md file for tracking later". It stays live in this folder, beside the open release's epic; v1.2.1's epic is archived as [v1.2.1-release.md](../archive/v1.2.1-release.md).

Why now. S11 was to tune Fatigue against the bands DL-290 proposed. Its full run, at today's settings, showed the
economy broken since S4: all 50 of the player's games ended in Bankruptcy, at a mean 9.45 years, and none ran
20 years. On the owner's answer to Q22 (c), 2026-10-12, S11's tuning stopped. The owner then released v1.2.1 as it
stands, the economy pass deferred (DL-293): PR #66, merged as `72d14e9`, tag `v1.2.1`, on 2026-10-12.

This file tracks the Gate's outcomes release by release (`docs/agents/documentation.md`). The reports are the source,
and a row here is only ever read from one. A later release's full Gate adds a run to the table below, and a column
only where its play differs.

## The runs

Five columns. Every run is a full `gate` profile, 50 seeds (`seed-0001` to `seed-0050`) up to 20 years, 8 worker
processes, on one machine (Node v26.9.0, AMD RYZEN AI MAX+ 395, 32 logical cores), no validation after each advance.

| Column | Report | Begun (local, +11:00) | Built at | Config, content, schema | Fingerprint of every seed's last save |
| --- | --- | --- | --- | --- | --- |
| v1.1.8 | `v1.1.8-gate-2026-10-09`, out of the tree, read with `git show 4220f57:harness/reports/v1.1.8-gate-2026-10-09.json`; committed in `bde71ec` (DL-229) | 2026-10-09 02:13 | v1.1.8's close, a full Gate run with `--expect` of its own fingerprint: v1.1.8 changed no play | 17, 37, 7 | `5dbfdaf460aea084ea1e6a37de78b44f74f32803ab98626ffed4a127b786e62b` |
| v1.1.9 | `v1.1.9-gate-2026-10-10`, in the tree; committed in `1570b79` (DL-252) | 2026-10-10 14:44 | v1.1.9's close | 17, 37, 7 | `5dbfdaf460aea084ea1e6a37de78b44f74f32803ab98626ffed4a127b786e62b` |
| v1.2.0 | `v1.2.0-gate-2026-10-11`, in the tree; committed in `cbd0723` (DL-274) | 2026-10-11 11:03 | v1.2.0's close | 21, 41, 9 | `59d52e71b712bd1721a81d42b41a43fd3f680a7f29003cfe2533d04807c42d11` |
| v1.2.1 baseline | `v1.2.1-s11-baseline-2026-10-12`, untracked | 2026-10-12 04:31 | `3170082`, S1 to S10 built and verified, today's settings | 30, 45, 11 | `027d238a8ca957bfb0326c4e0cd514b5becc49c712ce7a2664fd321ad42e9306` |
| v1.2.1 trial (fall ×2) | `v1.2.1-s11-trial-fall2x-2026-10-12`, untracked | 2026-10-12 04:37 | `3170082`, with `HEROESIM_CONFIG={"fatigueFallByQuarters":[10,12,14,16]}` (the shipped values are [5,6,7,8]) | 30, 45, 11 | `45da60b775cc6ef52c1fa475ed9d6e21551147f0c5682d1919ca9e54196138b1` |
| v1.2.1 closing Gate (the release) | `v1.2.1-close-gate-2026-10-12`, in the tree; committed in `95f2b57` | 2026-10-12 08:04 | after S12, the play of `3170082` | 30, 45, 11 | `027d238a…`, the baseline's |

- **v1.1.8 has a full run of its own**: `v1.1.8-gate`, its closing Gate (DL-229), whose report left the tree at
  v1.2.0's close and is read from git at `4220f57`. It was not a `neutral --expect` alone.
- **v1.1.8 and v1.1.9 are the same games**: the one fingerprint means identical play, so the two columns differ only
  in timings and in the Gate's copy line. v1.1.9 changed no play.
- **v1.2.0 changed play** (the Tiers, DL-262; Death by Tier, DL-265; the Party floor, DL-266), so the step from
  its two earlier columns is v1.2.0's, not v1.2.1's.
- **The closing Gate is the baseline's play.** Its fingerprint, config, content, schema and every Target are the
  baseline's; only the per-Turn copy line differs, in timing. So the outcomes table has no column for it: read the
  baseline's. Its Gate fails the same line, the save after 20 years (see below). The release went ahead on the owner's
  word (DL-293), not blocked by it.
- **† marks a Target counted from another report.** Eight of the Targets read counters the harness added with DL-259, so
  the v1.1.8 and v1.1.9 reports hold none for them. `v1.2.0-s2-gate-2026-10-10` (read from git at `240de81`)
  played the same 50 games, with the same fingerprint as v1.1.8, and counted them; their values are its.

## The outcomes

Each cell is the report's figure. "in" and "out" mark a value inside or outside its band, as the harness does. The
band column is the DL-83 target (with DL-256 item 10 for the player's Deaths and DL-69 item 4 for the Rivals), or,
for the Fatigue group, the bands DL-290 item 5 proposed, which the owner has not approved. Notes follow the table.

| Measure | v1.1.8 | v1.1.9 | v1.2.0 | v1.2.1 baseline | v1.2.1 trial (fall ×2) | Band |
| --- | --- | --- | --- | --- | --- | --- |
| **Games (the player's endings, 50 games of up to 20 years)** | | | | | | |
| Ended by Retirement | 0 | 0 | 0 | 0 | 0 |  |
| Ended by Bankruptcy | 0 | 0 | 0 | 50 | 31 |  |
| Ended by a wiped Roster | 0 | 0 | 0 | 0 | 0 |  |
| Ran the full 20 years | 50 (100%) | 50 (100%) | 50 (100%) | 0 (0%) | 19 (38%) |  |
| Mean Years survived (min to max) | 20.00 (20.00 to 20.00) | 20.00 (20.00 to 20.00) | 20.00 (20.00 to 20.00) | 9.45 (4.64 to 14.94) | 17.40 (10.11 to 20.00) |  |
| **The player's Guild** | | | | | | |
| Bankruptcy or wiped Roster, a share of games | 0.0% out | 0.0% out | 0.0% out | 100.0% out | 62.0% out | 5.0% to 15.0% |
| Quests taken a Guild-year | 403.4 | 403.4 | 189.4 | 139.9 | 153.4 |  |
| Quests failed, a share of those resolved | 6.8% out | 6.8% out | 1.1% out | 3.0% out | 2.0% out | 20.0% to 30.0% |
| Quests a strong success, a share of those resolved | 72.7% out | 72.7% out | 85.2% out | 68.6% out | 76.4% out | at most 50.0% |
| Hero Deaths a game | 4.28 in | 4.28 in | 0.24 out | 0.00 out | 0.22 out | 3.00 to 8.00 |
| Hero Deaths a Guild-year | 0.214 | 0.214 | 0.012 | 0.000 | 0.013 |  |
| Injuries a game | 72.52 | 72.52 | 17.72 | 18.90 | 31.02 |  |
| Injuries a Guild-year | 3.63 | 3.63 | 0.89 | 2.00 | 1.78 |  |
| Wealth in months of Upkeep, the mean of year-starts after 2 years | 36.13 out † | 36.13 out † | 36.57 out | 6.18 in | 14.53 out | 6.00 to 12.00 |
| Quest rewards a Guild-year | 61,150 | 61,150 | 60,050 | 32,881 | 44,973 |  |
| Upkeep a Guild-year | 45,664 | 45,664 | 47,253 | 31,348 | 41,693 |  |
| Everything spent a Guild-year | 50,421 | 50,421 | 50,098 | 33,115 | 44,267 |  |
| Quest rewards less Upkeep a Guild-year | 15,486 | 15,486 | 12,797 | 1,533 | 3,279 |  |
| Quest reward a Quest resolved | 152 | 152 | 317 | 235 | 293 |  |
| Mean Level of its Heroes after 10 years | 8.34 in | 8.34 in | 8.71 in | 7.00 out | 8.00 out | 8.00 to 10.00 |
| Games in play at the start of year 11 | 50 | 50 | 50 | 16 | 50 |  |
| Wealth at the start of year 6, a Guild (5 years played) | 88,524 (50 games) | 88,524 (50 games) | 105,584 (50 games) | 18,330 (49 games) | 54,910 (50 games) |  |
| Wealth at the start of year 11, a Guild (10 years played) | 159,162 (50 games) | 159,162 (50 games) | 168,630 (50 games) | 12,964 (16 games) | 58,229 (50 games) |  |
| Heroes recruited a game | 9.54 | 9.54 | 5.74 | 4.04 | 4.98 |  |
| **The Rivals** | | | | | | |
| Folds a game | 2.74 in | 2.74 in | 2.18 in | 10.94 out | 40.58 out | 1.50 to 3.50 |
| Folds a Rival Guild-year | 0.034 | 0.034 | 0.027 | 0.297 | 0.612 |  |
| Rival Guildmasters succeeded a game | 0.90 | 0.90 | 1.02 | 0.00 | 0.30 |  |
| Quests taken a Guild-year | 220.6 | 220.6 | 211.9 | 90.0 | 95.2 |  |
| Quests failed, a share of those resolved | 13.3% | 13.3% | 5.6% | 22.3% | 18.6% |  |
| Quests a strong success, a share of those resolved | 55.0% | 55.0% | 60.3% | 31.7% | 41.1% |  |
| Heroes recruited a game | 38.06 | 38.06 | 85.62 | 2.56 | 6.90 |  |
| Heroes recruited a Guild-year | 0.477 | 0.477 | 1.073 | 0.069 | 0.104 |  |
| Hero Deaths a game | 24.66 | 24.66 | 7.66 | 0.34 | 9.58 |  |
| Hero Deaths a Guild-year | 0.309 | 0.309 | 0.096 | 0.009 | 0.145 |  |
| Injuries a game | 411.64 | 411.64 | 249.82 | 190.80 | 382.22 |  |
| Quest rewards less Upkeep a Guild-year | 1,561 | 1,561 | 5,074 | 1,672 | 764 |  |
| Wealth a Guild at the start of year 6 (5 years played) | 28,777 | 28,777 | 60,404 | 7,001 | 25,666 |  |
| Wealth a Guild at the start of year 11 (10 years played) | 41,483 | 41,483 | 104,149 | 9,849 | 29,855 |  |
| **The other DL-83 and DL-69 Targets (the seven above carry their band in place)** | | | | | | |
| The player first in the Rankings by Fame, a share of year-starts | 91.2% out | 91.2% out | 31.9% out | 99.1% out | 95.8% out | 40.0% to 60.0% |
| The player first in the Rankings by Wealth, a share of year-starts | 95.2% out | 95.2% out | 42.2% in | 60.0% in | 75.1% out | 40.0% to 60.0% |
| The highest Level a Hero of the player's has reached by year 20, the mean over the games in play then | 11.58 out † | 11.58 out † | 11.04 out | — | 10.00 out | 14.00 to 17.00 |
| `ambitious` Rivals at the Roster floor with more than 20 Upkeeps in hand, a share of year-starts | 11.3% in † | 11.3% in † | 4.8% in | 0.6% in | 4.6% in | under 50.0% |
| `miserly` Rivals at the Roster floor with more than 20 Upkeeps in hand, a share of year-starts | 29.4% in † | 29.4% in † | 7.0% in | 1.2% in | 7.9% in | under 50.0% |
| `reckless` Rivals at the Roster floor with more than 20 Upkeeps in hand, a share of year-starts | 3.8% in † | 3.8% in † | 0.8% in | 0.2% in | 1.0% in | under 50.0% |
| `steady` Rivals at the Roster floor with more than 20 Upkeeps in hand, a share of year-starts | 26.5% in † | 26.5% in † | 15.2% in | 0.0% in | 13.3% in | under 50.0% |
| Transfers between Rivals back to the seller, a share of those between Rivals | 9.0% in | 9.0% in | 16.4% out | 0.0% in | 6.3% in | under 15.0% |
| Transfers back to a seller within 90 Days, a game | 0.00 in † | 0.00 in † | 0.00 in | 0.00 in | 0.00 in | none |
| Transfers that left the seller below the Roster floor, a game | 0.00 in † | 0.00 in † | 0.00 in | 0.00 in | 0.00 in | none |
| **The Gate's correctness lines** | | | | | | |
| Policy actions the rules refused | 0 | 0 | 0 | 0 | 0 |  |
| Games the validator refused | not validated | not validated | not validated | not validated | not validated |  |
| Games a harness assertion stopped | 0 | 0 | 0 | 0 | 0 |  |
| Games neither ended nor played to their last Turn | 0 | 0 | 0 | 0 | 0 |  |
| Saves that load and serialise back identically | 50 of 50 | 50 of 50 | 50 of 50 | 50 of 50 | 50 of 50 |  |
| One seed replayed alone, its last save identical | seed-0001: identical | seed-0001: identical | seed-0001: identical | seed-0001: identical | seed-0002: identical |  |
| The save after 20 years, gzipped: mean, max (games) | 17.51 MiB, 20.64 MiB (50) | 17.51 MiB, 20.64 MiB (50) | 16.31 MiB, 22.68 MiB (50) | — (0 games) | 9.76 MiB, 18.99 MiB (19) | mean under 30 MiB |
| The save after 20 years, uncompressed: mean, max (games read) | 134.44 MiB, 156.90 MiB (50 games) | 134.44 MiB, 156.90 MiB (50 games) | 123.48 MiB, 170.40 MiB (50 games) | 34.19 MiB, 55.85 MiB (last documents, games that ended early) | 81.32 MiB, 149.56 MiB (19 games) |  |
| The per-Turn copy's share of a Turn | 0.2410 (pass) | 0.3900 (fail) | 0.3882 (pass) | 0.4743 (pass) | 0.4890 (fail) | at most 0.4875 from v1.2.0 |
| The Gate, line by line | pass | fail | pass | fail | fail |  |
| **Speed** | | | | | | |
| Total run time, seconds (the games' share) | 1,423.5 (1,338.8) | 891.9 (841.8) | 1,550.9 (1,456.8) | 281.2 (265.1) | 602.8 (559.1) |  |
| Each Turn's `advance`: mean, p99, in ms | 5.586, 49.514 | 3.688, 14.184 | 7.897, 32.574 | 2.507, 7.543 | 2.946, 11.950 |  |
| **Fatigue and the Captain (DL-290; the bands are proposals, awaiting the owner)** | | | | | | |
| The player: Quests sent with a Hero tired or worse | — | — | — | 0.0% | 0.0% | 0% to 5% |
| The player: mean Fatigue at dispatch, a Hero | — | — | — | 43.7 | 37.3 |  |
| The player: free Heroes a rest band kept home | — | — | — | 72.0% | 56.9% | 45% to 70% |
| The player: Guild-Days a rest band kept a Hero home | — | — | — | 84.9% | 62.0% |  |
| The player: Days recovering to below the rest band, the mean (recoveries ended) | — | — | — | 3.90 (125,801) | 2.17 (228,755) | 1.5 to 3.0 |
| The player: Days recovering to fresh, the mean (recoveries ended) | — | — | — | 6.54 (3,583) | 2.61 (25,417) |  |
| The player: Quests a Captain led | — | — | — | 25.2% | 25.3% | 25% to 45% |
| The player: Injuries relieved, by Healer, Item, both or neither | — | — | — | 68.8% relieved (Healer 7.3, Item 48.9, both 12.6); 31.2% neither; of 945 | 86.0% relieved (Healer 3.0, Item 66.2, both 16.8); 14.0% neither; of 1,551 | 50% to 85% relieved |
| The player: Injuries at the last Encounter, none after to ease | — | — | — | 46.6% | 40.8% |  |
| The Rivals: Quests sent with a Hero tired or worse | — | — | — | 52.3% | 44.1% | 25% to 45% |
| The Rivals: mean Fatigue at dispatch, a Hero | — | — | — | 58.6 | 45.3 |  |
| The Rivals: free Heroes a rest band kept home | — | — | — | 56.7% | 33.0% | 35% to 55% |
| The Rivals: Guild-Days a rest band kept a Hero home | — | — | — | 48.0% | 25.0% |  |
| The Rivals: Days recovering to below the rest band, the mean (recoveries ended) | — | — | — | 3.88 (216,795) | 1.60 (406,089) | 1.5 to 3.5 |
| The Rivals: Days recovering to fresh, the mean (recoveries ended) | — | — | — | 6.99 (19,975) | 2.46 (121,976) |  |
| The Rivals: Quests a Captain led | — | — | — | 33.6% | 32.3% | 30% to 50% |
| The Rivals: Injuries relieved, by Healer, Item, both or neither | — | — | — | 78.0% relieved (Healer 3.5, Item 63.3, both 11.2); 22.0% neither; of 9,540 | 74.3% relieved (Healer 5.3, Item 57.3, both 11.7); 25.7% neither; of 19,111 | 50% to 85% relieved |
| The Rivals: Injuries at the last Encounter, none after to ease | — | — | — | 46.0% | 40.9% |  |

Notes on the table.

- **A game** is the report's total over its 50 games. The baseline's games stop at a mean 9.45 years, the trial's at
  17.40, the others' at 20, so a count a game is not like for like across them. **A Guild-year** is a year of one Guild
  in play, from its founding until it folds or the game stops (the report's Progression section); the player's are
  the player's Guild, the Rivals' every Rival Guild and its replacements. The rows by Guild-year divide an event's
  total by those years: Quests taken, Deaths, Injuries, recruits and folds.
- **Quests taken a Guild-year** is the Targets' Quest weight (the player's baseline 139.93 is the report's own);
  for the Rivals it is Quests taken over their Guild-years. **Failed** and **strong** are shares of the Quests
  resolved (the report's Counters section; for the player's, also Targets).
- **Quest rewards, Upkeep and everything spent** are the Items section's per-Guild-year columns. **Rewards less Upkeep**
  is their difference, and **reward a Quest resolved** is the Quest rewards total over the Quests resolved; both are
  derived here. Everything spent adds the signing fees, Transfers, Items, Improvements and Upkeep.
- **Wealth at the start of year 6 and year 11** is the report's table of year-starts after 5 and 10 years played,
  the mean over the games in play then. The baseline's year 11 is 16 games, those that had lasted, so it is survivors
  only. The player's is a Guild's Wealth, the Rivals' Wealth a Guild.
- **The Targets** of v1.2.0, the baseline and the trial are the reports' own. The v1.1.8 and v1.1.9 columns were read by running the harness's `targets()` over each report's totals, which reproduces the printed
  Targets of v1.2.0 and the baseline and, for v1.1.9, the baseline column v1.2.0's report printed. The trial's mean
  Level after 10 years is 7.995, printed 8.00 and outside the band, as its report marks it.
- **The Gate's lines** are the report's own verdicts against `harness/gate.json` as it stood for that run. v1.1.9's fail
  is the copy line against v1.1.8's limit of 0.31625; the owner anchored the limit at that run (DL-252), so v1.2.0 on
  reads at most 0.4875. The baseline's fail is the save line: no game ran 20 years, so there is no save to gzip
  (`—`, 0 games). The trial's fail is the copy line, 0.4890 against at most 0.4875, over 851 copies. The baseline's
  copy share passes over 447 copies, which is not like for like either.
- **Speed.** Mean `advance` fell between v1.1.8 and v1.1.9 by design (the Best Party module, DL-237) and rose at v1.2.0,
  when the Rivals' Rosters grew (15.7 Heroes a Guild at year 5, against 7.2). The baseline's and the trial's are lower
  because their games end sooner and their saves are smaller (the baseline's last documents average 34.19 MiB
  uncompressed, against 134.44 MiB for v1.1.8's 20-year games); a longer game slows each Turn. Total run time is wall-clock for the 50 games.
- **Fatigue's lines** exist only from DL-290, so older columns read `—`. A recovery is counted from a Hero's
  homecoming; "to fresh" is mostly cut short by the next dispatch (97% of the player's recoveries to fresh in the
  baseline), so its mean reads low. **Relieved** is an Injury taken on a Quest that a Healer, a heal Item or both
  eased; **neither** is the rest. **Injuries at the last Encounter** are the share of the Injuries taken with no
  Encounter after them to ease.

## What moved, and when

v1.2.0 moved play first. Against v1.1.9, v1.2.0 gave the player 189 Quests a Guild-year where there were 403, and its
Hero Deaths fell from 4.28 a game to 0.24 (DL-265's Death by Tier), while the Rivals recruited more (38.06 a game
to 85.62) and failed fewer Quests (13.3% to 5.6%). v1.2.0 closed with 8 of 17 Targets outside their bands (DL-274).

Within v1.2.1, the quick runs (4 games of 2 years, early Rosters at Tier 1) show each story's move. Each row is the
story built on the one above; the full reports are the 4 × 2 `v1.2.1-s*-quick` ones, not committed.

| After | Config | Fingerprint | The player: Quests | failed | strong | The Rivals: Quests | failed | strong | recruits | Injuries | Folds |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v1.2.0's play with S1 built (the start) | 21 | `9e153592…` | 2,322 | 1.9% | 76.9% | 4,845 | 8.2% | 55.5% | 17 | 80 | 0 |
| S2, Fatigue stored (DL-282) | 22 | `71805c74…` | 2,322 | 1.9% | 76.9% | 4,845 | 8.2% | 55.5% | 17 | 80 | 0 |
| S3, Morale's line (DL-283) | 23 | `d328ba73…` | 2,299 | 1.7% | 78.9% | 4,914 | 5.8% | 62.9% | 27 | 46 | 0 |
| S4, the form module and the hurt at 0.6 (DL-284) | 25 | `aa38227f…` | 2,244 | 9.2% | 55.5% | 4,435 | 26.2% | 26.0% | 0 | 252 | 0 |
| S4 with the owner's Morale values (Q18, DL-283 item 4) | 26 | `80d9a820…` | 2,244 | 9.2% | 55.5% | 4,435 | 26.2% | 26.0% | 0 | 252 | 0 |
| S5, relief from the hurt (DL-285) | 27 | `b9b3a8ab…` | 2,246 | 9.5% | 54.3% | 4,450 | 26.4% | 26.9% | 0 | 249 | 0 |
| S6, the rest bands (DL-286) | 28 | `70ea18ba…` | 1,706 | 5.3% | 65.5% | 3,751 | 24.5% | 31.7% | 0 | 189 | 2 |
| S7, the Captain (DL-287) | 29 | `89c4c91f…` | 1,671 | 3.4% | 65.1% | 3,821 | 22.6% | 32.5% | 0 | 188 | 1 |
| S8, the Rivals' heal Items (DL-288) | 30 | `290b6d18…` | 1,733 | 3.6% | 67.1% | 3,787 | 22.0% | 31.9% | 0 | 150 | 1 |
| S10, the harness's lines: play unchanged (DL-290) | 30 | `290b6d18…` | 1,733 | 3.6% | 67.1% | 3,787 | 22.0% | 31.9% | 0 | 150 | 1 |

- **S3, Morale's line (DL-283).** Morale's form a line through the baseline (the band factors `moraleCheckFactor`
  removed), with the owner's Morale values (Q18). The Rivals, who build quarters, gain most: strong successes 55.5% to
  62.9%, failed Quests 8.2% to 5.8%, recruits 17 to 27, Injuries 80 to 46.
- **S4, the form module (DL-284).** Fatigue weighs on Stats, Checks and harm (`fatigueScaling`), and the hurt takes
  its gap by area at the owner's `hurtCheckFactor` 0.6 (0.93 before). With no rest band yet, both sides' Heroes set out
  at a mean Fatigue of 82 to 88, over 80% exhausted. The player's failed Quests rose from 1.7% to 9.2%, the Rivals'
  from 5.8% to 26.2% and their strong successes fell from 62.9% to 26.0%; their Injuries rose from 46 to 252 and they,
  poorer, recruited no one. Recruits are 0 in every quick run from here on. The full Gates, which carry S1 to S10, read
  as the Rivals' failed Quests from 5.6% (v1.2.0) to 22.3% and their recruits from 85.62 a game to 2.56.
- **S5, relief from the hurt (DL-285).** A Healer or a heal Item eases the hurt: within the noise of changed draws.
- **S6, the rest bands (DL-286).** The player's Heroes set out at a mean Fatigue of 43 (87 before), none tired or worse
  (93% before); the Rivals' at 56 (82), 45% tired or worse (90%). Fewer Quests were taken (the player's 2,246 to 1,706,
  the Rivals' 4,450 to 3,751) and fewer failed (the player's 9.5% to 5.3%); the Rivals' failed Quests 26.4% to 24.5%.
  Two Rival Guilds folded to Bankruptcy (none before).
- **S7, the Captain (DL-287).** The player's failed Quests 5.3% to 3.4%, the Rivals' 24.5% to 22.6%; one fold.
- **S8, the Rivals' heal Items (DL-288).** The Rivals buy heal Items and carry one of each: their Injuries 188 to 150,
  failed Quests 22.6% to 22.0%, still no recruit, their Wealth stays far below `recruitThreshold` times their Upkeep.
- **S9 and S10** changed no play (S10's fingerprint is S8's, `290b6d18…`).
- **S11, the full runs (Q22).** The baseline is the first full Gate with S1 to S10: all 50 games end in Bankruptcy, at a
  mean 9.45 years (4.64 to 14.94), and the Rivals fold 10.94 a game against 2.18 at v1.2.0. The trial doubles
  `fatigueFallByQuarters` and nothing else: the player's Bankruptcies fall from 50 to 31 games (19 run the 20 years),
  the Rivals recruit 6.90 a game (2.56 before), and the Rivals fold 40.58 a game (10.94) and lose 9.58 Heroes to
  Death a game (0.34), where the player's Deaths rise from 0.00 to 0.22 a game. Neither run puts the player's
  Bankruptcy inside its band.

## Open for the economy release

No tuning value is proposed here; these are the measures and the settings to read.

- **The player's Quest volume against its Upkeep.** Quests taken a Guild-year: 403.4 (v1.1.8), 189.4 (v1.2.0),
  139.9 (baseline). Quest rewards less Upkeep a Guild-year: 15,486, 12,797, 1,533, with the reward a Quest resolved
  152, 317, 235; everything spent in the baseline (33,115) exceeds the rewards taken (32,881). The rest band keeps 72.0%
  of the player's free Heroes home in the baseline (84.9% of its Guild-Days keep at least one Hero home). Wealth in
  months of Upkeep reads 6.18, inside its band, over the games in play at each year-start, while every game ends in
  Bankruptcy.
- **Rival failure, recruiting and folds.** Failed Quests 5.6% (v1.2.0) to 22.3%; strong successes 60.3% to 31.7%;
  recruits 85.62 a game to 2.56; folds 2.18 a game to 10.94 (0.027 to 0.297 a Guild-year); Wealth a Rival Guild at the
  start of year 11, 104,149 to 9,849; Rival Guildmasters succeeded 1.02 a game to 0.00. A Rival recruits only above its
  Disposition's `recruitThreshold` (Upkeeps in hand): `steady` 60, `ambitious` 45, `miserly` 60, `reckless` 30
  (`content/dispositions.json`; set before this release, not added by it).
- **The save at 20 years.** The baseline cannot measure it: no game ran 20 years, so the Gate's gzipped-save line
  fails by absence, and its last documents (34.19 MiB uncompressed on average) are of games that ended at a mean 9.45 years. The trial's
  19 full games gzip to a mean 9.76 MiB and a max 18.99 MiB, against v1.2.0's 16.31 and 22.68; the limit is a mean
  under 30 MiB. Any change that lets games run to 20 years re-measures it.
- **The settings this release added or changed**, with their values in `engine/src/config.json` now (the Fatigue
  section, the Captain's, the reliefs, the Morale values, `hurtCheckFactor`), and the Dispositions' `restBand`:

| Setting | Current value | Added or changed by |
| --- | --- | --- |
| `fatigueMax` | 100 | S2 (DL-282) |
| `fatigueBands` | fresh 0, weary 25, tired 50, exhausted 75 | S2 (DL-282) |
| `fatigueRiseByTier` | 4, 5, 6, 7, 8 a night away, by Tier | S2 (DL-282) |
| `fatigueFallByQuarters` | 5, 6, 7, 8 a night at home, by quarters grade (the trial: 10, 12, 14, 16); now the quarters' `fatigueFall` in content (DL-297) | S2 (DL-282) |
| `fatigueScaling` | 0.4 | S4 (DL-284) |
| `playerRestBand` | tired | S6 (DL-286) |
| `hurtCheckFactor` | 0.6, taken whole by the Physical Stats and half by the rest (0.93 before) | S4 (DL-284), the owner's value |
| `healerHurtRelief` | 0.5 | S5 (DL-285) |
| `healItemHurtRelief` | 0.5 | S5 (DL-285) |
| `captainFormFactor` | 1.05 | S7 (DL-287) |
| `captainHomecomingMorale` | 5 | S7 (DL-287) |
| `captainHomeBaselineBonus` | 5 | S7 (DL-287) |
| `captainChangeMoraleCost` | −10 | S7 (DL-287) |
| `captainChangeLockDays` | 30 | S7 (DL-287) |
| `rivalHealItemStock` | 2 | S8 (DL-288) |
| `moraleBaseline` | 50 (60 before) | the owner's Morale values (DL-283 item 4, Q18) |
| `moraleBands` | wretched 0, low 11, steady 35, high 66, elated 90 | the owner's Morale values (DL-283 item 4, Q18) |
| `moraleOnRosterDeath` | −20 (−10 before) | the owner's Morale values (DL-283 item 4, Q18) |
| `restBand`, by Disposition | `steady` tired, `ambitious` exhausted, `miserly` tired, `reckless` none | S6 (DL-286), `content/dispositions.json` |

`moraleCheckFactor` was removed at S3 (DL-283), and the Morale line's other settings (`moraleMin`, `moraleMax`,
`moraleOnStrongSuccess`) did not change.
