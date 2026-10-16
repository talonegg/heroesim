# Gate outcomes: v1.2.3, v1.2.2 and v1.2.1 against v1.2.0, v1.1.9 and v1.1.8

A record kept for tracking: the harness's full Gate outcomes of v1.2.1 as built to S10 (config 30, content 45, commit
`3170082`) beside the closing full Gates of v1.2.0, v1.1.9 and v1.1.8, and of v1.2.1 as released; and v1.2.2's closing
full Gate (config 34, content 49, `6b5abd6`, DL-305) beside them, with its costs against v1.2.1's; and v1.2.3's
closing full Gate (config 38, content 50, `8050db0`, DL-324), with its costs against v1.2.2's.
The owner asked for it on 2026-10-12: "document all outcomes from 1.2.1 against 1.2.0 and 1.1.8/9 in a table
in an md file for tracking later". It stays live in this folder, beside the open release's epic; v1.2.1's and v1.2.2's epics are archived as [v1.2.1-release.md](../archive/v1.2.1-release.md) and [v1.2.2-release.md](../archive/v1.2.2-release.md).

Why now. S11 was to tune Fatigue against the bands DL-290 proposed. Its full run, at today's settings, showed the
economy broken since S4: all 50 of the player's games ended in Bankruptcy, at a mean 9.45 years, and none ran
20 years. On the owner's answer to Q22 (c), 2026-10-12, S11's tuning stopped. The owner then released v1.2.1 as it
stands, the economy pass deferred (DL-293): PR #66, merged as `72d14e9`, tag `v1.2.1`, on 2026-10-12.

This file tracks the Gate's outcomes release by release (`docs/agents/documentation.md`). The reports are the source,
and a row here is only ever read from one. A later release's full Gate adds a run to the table below, and a column
only where its play differs.

## The runs

Seven columns. Every run is a full `gate` profile, 50 seeds (`seed-0001` to `seed-0050`) up to 20 years, 8 worker
processes, on one machine (Node v26.9.0, AMD RYZEN AI MAX+ 395, 32 logical cores), no validation after each advance.

| Column | Report | Begun (local, +11:00) | Built at | Config, content, schema | Fingerprint of every seed's last save |
| --- | --- | --- | --- | --- | --- |
| v1.1.8 | `v1.1.8-gate-2026-10-09`, out of the tree, read with `git show 4220f57:harness/reports/v1.1.8-gate-2026-10-09.json`; committed in `bde71ec` (DL-229) | 2026-10-09 02:13 | v1.1.8's close, a full Gate run with `--expect` of its own fingerprint: v1.1.8 changed no play | 17, 37, 7 | `5dbfdaf460aea084ea1e6a37de78b44f74f32803ab98626ffed4a127b786e62b` |
| v1.1.9 | `v1.1.9-gate-2026-10-10`, in the tree; committed in `1570b79` (DL-252) | 2026-10-10 14:44 | v1.1.9's close | 17, 37, 7 | `5dbfdaf460aea084ea1e6a37de78b44f74f32803ab98626ffed4a127b786e62b` |
| v1.2.0 | `v1.2.0-gate-2026-10-11`, in the tree; committed in `cbd0723` (DL-274) | 2026-10-11 11:03 | v1.2.0's close | 21, 41, 9 | `59d52e71b712bd1721a81d42b41a43fd3f680a7f29003cfe2533d04807c42d11` |
| v1.2.1 baseline | `v1.2.1-s11-baseline-2026-10-12`, untracked | 2026-10-12 04:31 | `3170082`, S1 to S10 built and verified, today's settings | 30, 45, 11 | `027d238a8ca957bfb0326c4e0cd514b5becc49c712ce7a2664fd321ad42e9306` |
| v1.2.1 trial (fall ×2) | `v1.2.1-s11-trial-fall2x-2026-10-12`, untracked | 2026-10-12 04:37 | `3170082`, with `HEROESIM_CONFIG={"fatigueFallByQuarters":[10,12,14,16]}` (the shipped values are [5,6,7,8]) | 30, 45, 11 | `45da60b775cc6ef52c1fa475ed9d6e21551147f0c5682d1919ca9e54196138b1` |
| v1.2.1 closing Gate (the release) | `v1.2.1-close-gate-2026-10-12`, in the tree; committed in `95f2b57` | 2026-10-12 08:04 | after S12, the play of `3170082` | 30, 45, 11 | `027d238a…`, the baseline's |
| v1.2.2 closing Gate | `v1.2.2-close-gate-2026-10-16`, in the tree; committed with DL-305's record of the close | 2026-10-16 02:27 | `6b5abd6`, S1 to S9 built and verified, the review's fixes in (DL-305) | 34, 49, 13 | `6729030490de637566ac5241eb06945a23492057458f6507ffd7f905e6a6bbd4` |
| v1.2.3 closing Gate | `v1.2.3-close-gate-2026-10-17`, in the tree; committed with DL-324's record of the close | 2026-10-17 04:26 | `8050db0`, S1 to S9 built and verified, the review's fixes in (DL-324) | 38, 50, 14 | `2c37bfa72aceb89f543beab6d6c7a9648728a960b050f9f2cf4bf7060648035e` |

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
- **v1.2.2 changed play** (the Hall's upkeep apart from the wages, DL-298; the surplus sold, DL-301), so it has a
  column, v1.2.2 in the outcomes. Its fingerprint was the same over two runs. Its Gate fails the line v1.2.1's did, the
  save after 20 years, for the same reason: no game ran 20 years. It is recorded and does not block (Q20, DL-305). Its
  Targets' baseline column is v1.2.0's (`HEROESIM_BASELINE`'s default).
- **v1.2.3 changed play** (Contracts: a wage set at signing, renewal, release, the Transfer fee from the wages left,
  the free Offer and Under Offer, DL-315 to DL-322), so it has a column. Its Gate passes every line: 15 games ran 20
  years, so the save after 20 years is measured again. The Gate's baseline stays v1.2.0's (DL-324), and so does its
  Targets' baseline column.
- **† marks a Target counted from another report.** Eight of the Targets read counters the harness added with DL-259, so
  the v1.1.8 and v1.1.9 reports hold none for them. `v1.2.0-s2-gate-2026-10-10` (read from git at `240de81`)
  played the same 50 games, with the same fingerprint as v1.1.8, and counted them; their values are its.

## The outcomes

Each cell is the report's figure. "in" and "out" mark a value inside or outside its band, as the harness does. The
band column is the DL-83 target (with DL-256 item 10 for the player's Deaths and DL-69 item 4 for the Rivals), or,
for the Fatigue group, the bands DL-290 item 5 proposed, which the owner has not approved. Notes follow the table.

| Measure | v1.1.8 | v1.1.9 | v1.2.0 | v1.2.1 baseline | v1.2.1 trial (fall ×2) | v1.2.2 | v1.2.3 | Band |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Games (the player's endings, 50 games of up to 20 years)** | | | | | | | | | |
| Ended by Retirement | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| Ended by Bankruptcy | 0 | 0 | 0 | 50 | 31 | 50 | 30 |  |
| Ended by a wiped Roster | 0 | 0 | 0 | 0 | 0 | 0 | 5 |  |
| Ran the full 20 years | 50 (100%) | 50 (100%) | 50 (100%) | 0 (0%) | 19 (38%) | 0 (0%) | 15 (30%) |  |
| Mean Years survived (min to max) | 20.00 (20.00 to 20.00) | 20.00 (20.00 to 20.00) | 20.00 (20.00 to 20.00) | 9.45 (4.64 to 14.94) | 17.40 (10.11 to 20.00) | 9.82 (4.53 to 15.58) | 15.76 (6.05 to 20.00) |  |
| **The player's Guild** | | | | | | | | | |
| Bankruptcy or wiped Roster, a share of games | 0.0% out | 0.0% out | 0.0% out | 100.0% out | 62.0% out | 100.0% out | 70.0% out | 5.0% to 15.0% |
| Quests taken a Guild-year | 403.4 | 403.4 | 189.4 | 139.9 | 153.4 | 138.6 | 130.7 |  |
| Quests failed, a share of those resolved | 6.8% out | 6.8% out | 1.1% out | 3.0% out | 2.0% out | 3.1% out | 3.5% out | 20.0% to 30.0% |
| Quests a strong success, a share of those resolved | 72.7% out | 72.7% out | 85.2% out | 68.6% out | 76.4% out | 68.2% out | 72.1% out | at most 50.0% |
| Hero Deaths a game | 4.28 in | 4.28 in | 0.24 out | 0.00 out | 0.22 out | 0.00 out | 0.24 out | 3.00 to 8.00 |
| Hero Deaths a Guild-year | 0.214 | 0.214 | 0.012 | 0.000 | 0.013 | 0.000 | 0.015 |  |
| Injuries a game | 72.52 | 72.52 | 17.72 | 18.90 | 31.02 | 20.12 | 30.60 |  |
| Injuries a Guild-year | 3.63 | 3.63 | 0.89 | 2.00 | 1.78 | 2.05 | 1.94 |  |
| Wealth in months of Upkeep, the mean of year-starts after 2 years | 36.13 out † | 36.13 out † | 36.57 out | 6.18 in | 14.53 out | 5.80 out | 13.17 out | 6.00 to 12.00 |
| Quest rewards a Guild-year | 61,150 | 61,150 | 60,050 | 32,881 | 44,973 | 32,804 | 32,150 |  |
| Upkeep a Guild-year | 45,664 | 45,664 | 47,253 | 31,348 | 41,693 | 31,428 ‡ | 29,557 ‡ |  |
| Everything spent a Guild-year | 50,421 | 50,421 | 50,098 | 33,115 | 44,267 | 33,249 | 32,093 |  |
| Quest rewards less Upkeep a Guild-year | 15,486 | 15,486 | 12,797 | 1,533 | 3,279 | 1,376 | 2,593 |  |
| Quest reward a Quest resolved | 152 | 152 | 317 | 235 | 293 | 237 | 246 |  |
| Mean Level of its Heroes after 10 years | 8.34 in | 8.34 in | 8.71 in | 7.00 out | 8.00 out | 7.00 out | 6.95 out | 8.00 to 10.00 |
| Games in play at the start of year 11 | 50 | 50 | 50 | 16 | 50 | 20 | 47 |  |
| Wealth at the start of year 6, a Guild (5 years played) | 88,524 (50 games) | 88,524 (50 games) | 105,584 (50 games) | 18,330 (49 games) | 54,910 (50 games) | 18,385 (49 games) | 37,085 (50 games) |  |
| Wealth at the start of year 11, a Guild (10 years played) | 159,162 (50 games) | 159,162 (50 games) | 168,630 (50 games) | 12,964 (16 games) | 58,229 (50 games) | 10,100 (20 games) | 30,659 (47 games) |  |
| Heroes recruited a game | 9.54 | 9.54 | 5.74 | 4.04 | 4.98 | 4.00 | 6.80 |  |
| **The Rivals** | | | | | | | | | |
| Folds a game | 2.74 in | 2.74 in | 2.18 in | 10.94 out | 40.58 out | 9.14 out | 5.24 out | 1.50 to 3.50 |
| Folds a Rival Guild-year | 0.034 | 0.034 | 0.027 | 0.297 | 0.612 | 0.237 | 0.084 |  |
| Rival Guildmasters succeeded a game | 0.90 | 0.90 | 1.02 | 0.00 | 0.30 | 0.00 | 0.44 |  |
| Quests taken a Guild-year | 220.6 | 220.6 | 211.9 | 90.0 | 95.2 | 89.4 | 185.6 |  |
| Quests failed, a share of those resolved | 13.3% | 13.3% | 5.6% | 22.3% | 18.6% | 21.1% | 11.8% |  |
| Quests a strong success, a share of those resolved | 55.0% | 55.0% | 60.3% | 31.7% | 41.1% | 32.7% | 49.5% |  |
| Heroes recruited a game | 38.06 | 38.06 | 85.62 | 2.56 | 6.90 | 3.00 | 143.06 |  |
| Heroes recruited a Guild-year | 0.477 | 0.477 | 1.073 | 0.069 | 0.104 | 0.078 | 2.285 |  |
| Hero Deaths a game | 24.66 | 24.66 | 7.66 | 0.34 | 9.58 | 0.16 | 6.96 |  |
| Hero Deaths a Guild-year | 0.309 | 0.309 | 0.096 | 0.009 | 0.145 | 0.004 | 0.111 |  |
| Injuries a game | 411.64 | 411.64 | 249.82 | 190.80 | 382.22 | 193.76 | 440.96 |  |
| Quest rewards less Upkeep a Guild-year | 1,561 | 1,561 | 5,074 | 1,672 | 764 | 1,584 ‡ | 5,504 ‡ |  |
| Wealth a Guild at the start of year 6 (5 years played) | 28,777 | 28,777 | 60,404 | 7,001 | 25,666 | 8,132 | 47,757 |  |
| Wealth a Guild at the start of year 11 (10 years played) | 41,483 | 41,483 | 104,149 | 9,849 | 29,855 | 8,741 | 65,807 |  |
| **The other DL-83 and DL-69 Targets (the seven above carry their band in place)** | | | | | | | | | |
| The player first in the Rankings by Fame, a share of year-starts | 91.2% out | 91.2% out | 31.9% out | 99.1% out | 95.8% out | 97.9% out | 31.3% out | 40.0% to 60.0% |
| The player first in the Rankings by Wealth, a share of year-starts | 95.2% out | 95.2% out | 42.2% in | 60.0% in | 75.1% out | 55.7% in | 19.9% out | 40.0% to 60.0% |
| The highest Level a Hero of the player's has reached by year 20, the mean over the games in play then | 11.58 out † | 11.58 out † | 11.04 out | — | 10.00 out | — | 8.87 out | 14.00 to 17.00 |
| `ambitious` Rivals at the Roster floor with more than 20 Upkeeps in hand, a share of year-starts (v1.2.2: 6.67 Upkeeps of a month, §) | 11.3% in † | 11.3% in † | 4.8% in | 0.6% in | 4.6% in | 1.2% in | 7.9% in | under 50.0% |
| `miserly` Rivals at the Roster floor with more than 20 Upkeeps in hand, a share of year-starts (v1.2.2: 6.67 Upkeeps of a month, §) | 29.4% in † | 29.4% in † | 7.0% in | 1.2% in | 7.9% in | 0.8% in | 9.0% in | under 50.0% |
| `reckless` Rivals at the Roster floor with more than 20 Upkeeps in hand, a share of year-starts (v1.2.2: 6.67 Upkeeps of a month, §) | 3.8% in † | 3.8% in † | 0.8% in | 0.2% in | 1.0% in | 2.0% in | 0.4% in | under 50.0% |
| `steady` Rivals at the Roster floor with more than 20 Upkeeps in hand, a share of year-starts (v1.2.2: 6.67 Upkeeps of a month, §) | 26.5% in † | 26.5% in † | 15.2% in | 0.0% in | 13.3% in | 0.8% in | 9.1% in | under 50.0% |
| Transfers between Rivals back to the seller, a share of those between Rivals | 9.0% in | 9.0% in | 16.4% out | 0.0% in | 6.3% in | 0.0% in | 9.6% in | under 15.0% |
| Transfers back to a seller within 90 Days, a game | 0.00 in † | 0.00 in † | 0.00 in | 0.00 in | 0.00 in | 0.00 in | 0.00 in | none |
| Transfers that left the seller below the Roster floor, a game | 0.00 in † | 0.00 in † | 0.00 in | 0.00 in | 0.00 in | 0.00 in | 0.00 in | none |
| **The Gate's correctness lines** | | | | | | | | | |
| Policy actions the rules refused | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| Games the validator refused | not validated | not validated | not validated | not validated | not validated | not validated | not validated |  |
| Games a harness assertion stopped | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| Games neither ended nor played to their last Turn | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| Saves that load and serialise back identically | 50 of 50 | 50 of 50 | 50 of 50 | 50 of 50 | 50 of 50 | 50 of 50 | 50 of 50 |  |
| One seed replayed alone, its last save identical | seed-0001: identical | seed-0001: identical | seed-0001: identical | seed-0001: identical | seed-0002: identical | seed-0001: identical | seed-0004: identical |  |
| The save after 20 years, gzipped: mean, max (games) | 17.51 MiB, 20.64 MiB (50) | 17.51 MiB, 20.64 MiB (50) | 16.31 MiB, 22.68 MiB (50) | — (0 games) | 9.76 MiB, 18.99 MiB (19) | — (0 games) | 19.17 MiB, 24.42 MiB (15) | mean under 30 MiB |
| The save after 20 years, uncompressed: mean, max (games read) | 134.44 MiB, 156.90 MiB (50 games) | 134.44 MiB, 156.90 MiB (50 games) | 123.48 MiB, 170.40 MiB (50 games) | 34.19 MiB, 55.85 MiB (last documents, games that ended early) | 81.32 MiB, 149.56 MiB (19 games) | 35.47 MiB, 62.72 MiB (last documents, games that ended early) | 147.40 MiB, 185.67 MiB (15 games) |  |
| The per-Turn copy's share of a Turn | 0.2410 (pass) | 0.3900 (fail) | 0.3882 (pass) | 0.4743 (pass) | 0.4890 (fail) | 0.4436 (pass) | 0.2546 (pass) | at most 0.4875 from v1.2.0 |
| The Gate, line by line | pass | fail | pass | fail | fail | fail | pass |  |
| **Speed** | | | | | | | | | |
| Total run time, seconds (the games' share) | 1,423.5 (1,338.8) | 891.9 (841.8) | 1,550.9 (1,456.8) | 281.2 (265.1) | 602.8 (559.1) | 269.5 (257.4) | 2,504.5 (2,175.7) |  |
| Each Turn's `advance`: mean, p99, in ms | 5.586, 49.514 | 3.688, 14.184 | 7.897, 32.574 | 2.507, 7.543 | 2.946, 11.950 | 2.372, 7.583 | 15.590, 90.739 |  |
| **Fatigue and the Captain (DL-290; the bands are proposals, awaiting the owner)** | | | | | | | | | |
| The player: Quests sent with a Hero tired or worse | — | — | — | 0.0% | 0.0% | 0.0% | 0.0% | 0% to 5% |
| The player: mean Fatigue at dispatch, a Hero | — | — | — | 43.7 | 37.3 | 43.6 | 43.8 |  |
| The player: free Heroes a rest band kept home | — | — | — | 72.0% | 56.9% | 72.1% | 73.5% | 45% to 70% |
| The player: Guild-Days a rest band kept a Hero home | — | — | — | 84.9% | 62.0% | 85.2% | 85.0% |  |
| The player: Days recovering to below the rest band, the mean (recoveries ended) | — | — | — | 3.90 (125,801) | 2.17 (228,755) | 3.95 (129,416) | 4.19 (197,125) | 1.5 to 3.0 |
| The player: Days recovering to fresh, the mean (recoveries ended) | — | — | — | 6.54 (3,583) | 2.61 (25,417) | 6.51 (3,878) | 6.56 (5,574) |  |
| The player: Quests a Captain led | — | — | — | 25.2% | 25.3% | 25.2% | 25.6% | 25% to 45% |
| The player: Injuries relieved, by Healer, Item, both or neither | — | — | — | 68.8% relieved (Healer 7.3, Item 48.9, both 12.6); 31.2% neither; of 945 | 86.0% relieved (Healer 3.0, Item 66.2, both 16.8); 14.0% neither; of 1,551 | 57.0% relieved (Healer 10.4, Item 36.5, both 10.0); 43.0% neither; of 1,006 | 57.2% relieved (Healer 11.1, Item 38.0, both 8.0); 42.8% neither; of 1,530 | 50% to 85% relieved |
| The player: Injuries at the last Encounter, none after to ease | — | — | — | 46.6% | 40.8% | 43.5% | 42.5% |  |
| The Rivals: Quests sent with a Hero tired or worse | — | — | — | 52.3% | 44.1% | 52.3% | 39.7% | 25% to 45% |
| The Rivals: mean Fatigue at dispatch, a Hero | — | — | — | 58.6 | 45.3 | 58.2 | 39.1 |  |
| The Rivals: free Heroes a rest band kept home | — | — | — | 56.7% | 33.0% | 56.0% | 16.7% | 35% to 55% |
| The Rivals: Guild-Days a rest band kept a Hero home | — | — | — | 48.0% | 25.0% | 48.1% | 52.6% |  |
| The Rivals: Days recovering to below the rest band, the mean (recoveries ended) | — | — | — | 3.88 (216,795) | 1.60 (406,089) | 3.90 (224,091) | 3.45 (670,094) | 1.5 to 3.5 |
| The Rivals: Days recovering to fresh, the mean (recoveries ended) | — | — | — | 6.99 (19,975) | 2.46 (121,976) | 7.04 (22,250) | 6.09 (425,848) |  |
| The Rivals: Quests a Captain led | — | — | — | 33.6% | 32.3% | 33.5% | 14.5% | 30% to 50% |
| The Rivals: Injuries relieved, by Healer, Item, both or neither | — | — | — | 78.0% relieved (Healer 3.5, Item 63.3, both 11.2); 22.0% neither; of 9,540 | 74.3% relieved (Healer 5.3, Item 57.3, both 11.7); 25.7% neither; of 19,111 | 68.5% relieved (Healer 5.6, Item 53.3, both 9.6); 31.5% neither; of 9,688 | 52.5% relieved (Healer 9.7, Item 35.8, both 7.1); 47.5% neither; of 22,048 | 50% to 85% relieved |
| The Rivals: Injuries at the last Encounter, none after to ease | — | — | — | 46.0% | 40.9% | 46.6% | 43.6% |  |

Notes on the table.

- **A game** is the report's total over its 50 games. The baseline's games stop at a mean 9.45 years, v1.2.2's at
  9.82, v1.2.3's at 15.76, the trial's at 17.40, the others' at 20, so a count a game is not like for like across them. **A Guild-year** is a year of one Guild
  in play, from its founding until it folds or the game stops (the report's Progression section); the player's are
  the player's Guild, the Rivals' every Rival Guild and its replacements. The rows by Guild-year divide an event's
  total by those years: Quests taken, Deaths, Injuries, recruits and folds.
- **Quests taken a Guild-year** is the Targets' Quest weight (the player's baseline 139.93 is the report's own);
  for the Rivals it is Quests taken over their Guild-years. **Failed** and **strong** are shares of the Quests
  resolved (the report's Counters section; for the player's, also Targets).
- **Quest rewards, Upkeep and everything spent** are the Items section's per-Guild-year columns. **Rewards less Upkeep**
  is their difference, and **reward a Quest resolved** is the Quest rewards total over the Quests resolved; both are
  derived here. Everything spent adds the signing fees, Transfers, Items, Improvements and Upkeep.
- **‡ v1.2.2's and v1.2.3's Upkeep** is the report's "Upkeep in all": the wages, the Hall's upkeep and the Improvements' upkeep,
  charged apart from DL-298 on. Up to v1.2.1 it was one charge, the wages and `hallMaintenancePerGrade` together. Its
  lines against v1.2.1's are under "What moved, and when".
- **§ The hoarding rows.** Up to v1.2.1 one Upkeep was 10 Days of costs, and the Target read more than 20 of them. From
  v1.2.2 one Upkeep is a month of costs, and the Target reads more than 6.67 of them, the same money (DL-300). The
  v1.2.2 column's rows count the same thing as the earlier columns' rows.
- **Wealth at the start of year 6 and year 11** is the report's table of year-starts after 5 and 10 years played,
  the mean over the games in play then. The baseline's year 11 is 16 games, those that had lasted, so it is survivors
  only. The player's is a Guild's Wealth, the Rivals' Wealth a Guild.
- **The Targets** of v1.2.0, the baseline, the trial and v1.2.2 are the reports' own. The v1.1.8 and v1.1.9 columns were read by running the harness's `targets()` over each report's totals, which reproduces the printed
  Targets of v1.2.0 and the baseline and, for v1.1.9, the baseline column v1.2.0's report printed. The trial's mean
  Level after 10 years is 7.995, printed 8.00 and outside the band, as its report marks it.
- **The Gate's lines** are the report's own verdicts against `harness/gate.json` as it stood for that run. v1.1.9's fail
  is the copy line against v1.1.8's limit of 0.31625; the owner anchored the limit at that run (DL-252), so v1.2.0 on
  reads at most 0.4875. The baseline's fail is the save line: no game ran 20 years, so there is no save to gzip
  (`—`, 0 games). The trial's fail is the copy line, 0.4890 against at most 0.4875, over 851 copies. The baseline's
  copy share passes over 447 copies, which is not like for like either. v1.2.2's fail is the baseline's: no game ran 20
  years. Its copy share passes over 467 copies. v1.2.3 passes every line, its copy share over 773 copies.
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

Within v1.2.2, the quick runs (4 games of 2 years) show each story's move, in the same form; the full reports are the
4 × 2 `v1.2.2-s*` ones, not committed.

| After | Config | Fingerprint | The player: Quests | failed | strong | The Rivals: Quests | failed | strong | recruits | Injuries | Folds |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v1.2.1's play with S1 built (the start) | 30 | `290b6d18…` | 1,733 | 3.6% | 67.1% | 3,787 | 22.0% | 31.9% | 0 | 150 | 1 |
| S2, Silver (DL-296) | 30 | `290b6d18…` | 1,733 | 3.6% | 67.1% | 3,787 | 22.0% | 31.9% | 0 | 150 | 1 |
| S3, Facilities as content (DL-297) | 31 | `389f5232…` | 1,733 | 3.6% | 67.1% | 3,787 | 22.0% | 31.9% | 0 | 150 | 1 |
| S4, the Hall's upkeep apart from the wages (DL-298) | 32 | `ad1bc510…` | 1,717 | 4.1% | 66.9% | 3,789 | 23.1% | 32.3% | 0 | 165 | 1 |
| S5, one Upkeep a month (DL-300) | 33 | `3a36abef…` | 1,717 | 4.1% | 66.9% | 3,789 | 23.1% | 32.3% | 0 | 165 | 1 |
| S6, loot-only values and the surplus sold (DL-301) | 34 | `93c75e85…` | 1,721 | 4.3% | 65.3% | 3,805 | 21.1% | 34.0% | 0 | 148 | 1 |
| S7 and S8, the Treasury and the page: play unchanged (DL-302, DL-303) | 34 | `93c75e85…` | 1,721 | 4.3% | 65.3% | 3,805 | 21.1% | 34.0% | 0 | 148 | 1 |

- **S2 and S3** changed no play. S2's fingerprint is the start's. S3's moved with the schema alone, and its counters
  are S2's (DL-297).
- **S4, the Hall's upkeep (DL-298).** Against S3's quick run, the Upkeep a Guild-year moved +3.3% for the player and
  −1.2% for the Rivals. The Hall's line alone moved +15.2% and −18.0%. These figures are in the commit `c9ebd92`; S3's
  side comes from a scratch run that split each charge by its parts.
- **S5, one Upkeep a month (DL-300).** The fingerprint moved with the versions, and the counters are S4's: dividing the
  thresholds by 3 left every choice as it was.
- **S6, the surplus sold (DL-301).** The Rivals' failed Quests went from 23.1% to 21.1%, and their Injuries from 165 to 148.
- **The close (DL-305).** The full Gate, read against v1.2.1's close (the baseline's play):
  - The player is still bankrupt in 50 of 50 games, at a mean 9.82 years (9.45).
  - Its Wealth in months of Upkeep is 5.80, now below its band (6.18).
  - The Rivals fold 9.14 times a game (10.94).
  - The player's Injuries relieved fell from 68.8% to 57.0%, and those by an Item alone from 48.9% to 36.5%. The
    report does not say why.
- **v1.2.3's close (DL-324).** The full Gate, read against v1.2.2's close:
  - The player is bankrupt in 30 games and its Roster wiped in 5, where all 50 were bankrupt; 15 run the 20 years,
    and the games last a mean 15.76 years (9.82).
  - Its Wealth in months of Upkeep is 13.17, above its band (5.80, below it).
  - The Rivals fold 5.24 times a game (9.14), and grow: about 24 Heroes a Rival Guild-year, 33 at year 20, from about
    6; they recruit 143.06 Heroes a game (3.00) and Transfer 714 among themselves (21).
  - Contracts: 65.1% of the player's Hero-Days and 79.7% of the Rivals' are Out of Contract; the player renews 710
    and releases 293, the Rivals 1,286 and 1,051, every release after its Contract's end, so no payout is paid.
  - Each Turn's `advance` is slower, 15.590 ms against 2.372, the games longer and the Rosters larger.

### The costs against v1.2.1's (Q21)

Each side's costs a Guild-year, by line, from the two closing reports' Items sections. Each line is the report's total
over its Guild-years: the player's 472.4 and the Rivals' 1,844.6 at v1.2.1, and 491.0 and 1,926.4 at v1.2.2. The
change is v1.2.2's over v1.2.1's.

| A Guild-year | The player: v1.2.1 | v1.2.2 | Change | The Rivals: v1.2.1 | v1.2.2 | Change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Spent: signing fees | 46.5 | 44.2 | −4.9% | 7.3 | 8.2 | +12.0% |
| Spent: Transfers | 0.0 | 0.0 | — | 6.0 | 5.3 | −12.7% |
| Spent: Items | 1,540.8 | 1,604.0 | +4.1% | 687.0 | 799.1 | +16.3% |
| Spent: Improvements | 179.9 | 173.1 | −3.8% | 646.5 | 534.4 | −17.3% |
| Upkeep: the wages | in Upkeep in all | 30,211.9 | — | in Upkeep in all | 21,087.8 | — |
| Upkeep: the Hall's | in Upkeep in all | 853.7 | — | in Upkeep in all | 749.2 | — |
| Upkeep: the Improvements' | in Upkeep in all | 362.1 | — | in Upkeep in all | 602.2 | — |
| Upkeep: the Hall's and the Improvements', a month (÷ 12) | not in the report | 101.3 | — | not in the report | 112.6 | — |
| Upkeep in all | 31,347.8 | 31,427.7 | +0.3% | 21,558.5 | 22,439.1 | +4.1% |
| Spent in all | 33,115.0 | 33,249.0 | +0.4% | 22,905.3 | 23,786.1 | +3.8% |
| Taken: Quest rewards | 32,880.6 | 32,804.0 | −0.2% | 23,230.5 | 24,022.8 | +3.4% |
| Taken: Item sales | 0.0 | 220.1 | — | 2.0, at folds | 295.6 | — |

- **Within 10%:**
  - every line of the player's;
  - the Rivals' Upkeep in all, their spending in all and their Quest rewards.
- **Outside 10%:** four of the Rivals' lines, none set by a v1.2.2 default. They move with the Rivals' play:
  - Items +16.3%;
  - Improvements −17.3%;
  - signing fees +12.0% and Transfers −12.7%, each under 10 a Guild-year.
- **What cannot be compared.** v1.2.1's report holds Upkeep as one figure, `wealth.*.upkeep` (`guild.upkeep-paid`).
  Neither its wages nor its `hallMaintenancePerGrade` part can be read from it, so no report sets v1.2.2's wages or
  its Hall's and Improvements' upkeep against v1.2.1's. The only like-for-like split is S4's quick run against S3's,
  above.
- **The epic's §2 reckoning:**
  - *v1.2.2's side holds.* The Hall's and Improvements' upkeep a month is 101.3 for the player and 112.6 for a Rival.
    The epic reckoned about 100 for each.
  - *The "against" figures cannot be checked.* The epic gave about 90 for the player and about 130 for a Rival at
    v1.2.1. These are its own reckoning from config and v1.2.1's grades, not report figures.
  - *A new Guild's "about 50 more" is not in the report.* No line reads a Guild's first charge. The rule gives the
    player's founding Roster of 4 Heroes 30 + 5 × 4 = 50 a month.
- Reported, not tuned (Q20). The owner accepted the four Rival lines outside 10% as they are, for `v1.2.4` to read
  (2026-10-16).

### The costs against v1.2.2's (Q21)

Each side's costs a Guild-year, by line, from the two closing reports' Items sections, as above: the player's 491.0
and the Rivals' 1,926.4 Guild-years at v1.2.2, and 788.2 and 3,131.0 at v1.2.3. The change is v1.2.3's over v1.2.2's.

| A Guild-year | The player: v1.2.2 | v1.2.3 | Change | The Rivals: v1.2.2 | v1.2.3 | Change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Spent: signing fees | 44.2 | 46.7 | +5.7% | 8.2 | 242.4 | +2,856% |
| Spent: Transfers | 0.0 | 0.0 | — | 5.3 | 295.6 | +5,477% |
| Spent: release payouts | not a line | 0.0 | — | not a line | 0.0 | — |
| Spent: Items | 1,604.0 | 2,381.3 | +48.5% | 799.1 | 2,073.6 | +159.5% |
| Spent: Improvements | 173.1 | 107.8 | −37.7% | 534.4 | 365.2 | −31.7% |
| Upkeep: the wages | 30,211.9 | 28,345.6 | −6.2% | 21,087.8 | 72,710.2 | +244.8% |
| Upkeep: the Hall's | 853.7 | 847.4 | −0.7% | 749.2 | 1,809.3 | +141.5% |
| Upkeep: the Improvements' | 362.1 | 364.1 | +0.6% | 602.2 | 888.9 | +47.6% |
| Upkeep in all | 31,427.7 | 29,557.1 | −6.0% | 22,439.1 | 75,408.3 | +236.1% |
| Spent in all | 33,249.0 | 32,093.0 | −3.5% | 23,786.1 | 78,385.1 | +229.5% |
| Taken: Quest rewards | 32,804.0 | 32,150.3 | −2.0% | 24,022.8 | 80,912.2 | +236.8% |
| Taken: Item sales | 220.1 | 313.4 | +42.4% | 295.6 | 2,077.6 | +602.8% |
| Taken: Transfers | 0.0 | 0.0 | — | 5.3 | 295.6 | +5,477% |

- **The wages' aim, within 10% (Q21).** The player's wages a Guild-year are 6.2% below v1.2.2's, within it. The
  Rivals' are 244.8% above, outside it, because a Rival's Roster grew: about 6.3 Heroes in a Rival Guild-year at
  v1.2.2 (the year-starts' Rosters weighted by Guild-years, an estimate) against 23.9 at v1.2.3 (the Contracts' Hero-Days).
  A Hero's wage a year fell on both sides, about 3,979 to 3,600 for the player (−9.5%) and 3,324 to 3,046 for a Rival
  (−8.4%), on the same reckoning. No refit, by the owner's Q-K (DL-315); `v1.2.4` tunes the wages.
- **The Transfer fee, unfitted (DL-312).** 714 Transfers against 21, 14.28 a game, all between Rivals, at a mean fee
  of 1,296 against 484; 17 of them free Offers taken, for no fee. The player paid and took no fee; 15 of its Heroes
  Out of Contract went to Rivals by a free Offer the policy let run out, for no fee.
- **The rest move with the Rivals' Rosters and the longer games.** Every line of the Rivals' is outside 10%; the
  player's Items (+48.5%), Improvements (−37.7%) and Item sales (+42.4%) are outside it, its Upkeep, spending and
  rewards within.
- Reported, not tuned (Q20).

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
  under 30 MiB. v1.2.2's close cannot measure it either: no game ran 20 years. v1.2.3's 15 full games gzip to a mean
  19.17 MiB and a max 24.42 MiB, within the limit (DL-324).
- **The surplus in debt (DL-301; S6's verifier, for `v1.2.4`).** In debt a Rival equips nothing, carries no heal Item and
  sells its whole Holding. The policy still equips first and keeps the pieces it equips, since it has no debt sale. The
  two sides meet debt by different rules.
- **The surplus and gear upgrades (for `v1.2.5`).** The surplus counts gear against empty slots alone, because the
  controllers equip only into an empty slot (`gearChoices`). When `v1.2.5` brings gear upgrades (#25's rest), the rule
  must stop selling a piece better than one a Hero carries.
- **The Hall's charge against v1.2.1's.** No report splits v1.2.1's Upkeep, so v1.2.2's Hall and Improvements' lines
  have no v1.2.1 figure. They are measured against v1.2.2's close from here on (the costs above).
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
