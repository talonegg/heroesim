# M9-V114-S9-DRAFTS-DEGREES harness report: play

Run begun 2026-10-03 03:35:31 +10:00 · 50 seeds, `seed-0001` to `seed-0050` · up to 20 years (21,600 Turns) each · content `core` version 25 with the drafts of `hero-traits.json`, `quest-templates.json`, `encounters.json`, `synergies.json`, `items.json` · config version 13, schema version 6, the defaults changed by `{"checkDegrees":{"triumph":1.35,"success":1,"setback":0.75},"strongTriumphShare":0.6}` · `createdAt: "harness"` · validated after every advance: no

Policy (INPUTS 4.14): first decline every Transfer Offer made for its Heroes (M6-S2); then the gear it holds onto Heroes with the slot empty (M5-S2); the highest-reward Quest it can staff, the Party the engine's `partyFor` names by the chance estimate at a margin of 0.05 (v1.1.4-S6), carrying one of each consumable held that serves the Quest (DL-62); one purchase a Turn: the infirmary's next grade while Wealth exceeds 3 times its cost (M3-S6), else one armour while a Hero has none and Wealth exceeds 3 times its price (M5-S4), else the cheapest Hero who would sign while Wealth exceeds 3 Upkeeps and the Roster is below 8, else consumables toward 2 of each while Wealth exceeds 3 times their cost and, once paid, 20 Upkeeps (DL-62); never sell; never transfer a Hero in or out.

Machine: Node v26.9.0 · Windows_NT 10.0.26300 x64 · AMD RYZEN AI MAX+ 395 w/ Radeon 8060S (32 logical cores) · games shared among 16 processes

## Summary

| Measure | Result |
| --- | --- |
| Games played | 50 |
| Games ended | retirement 0, bankruptcy 24, roster-wiped 0; ran the full 20 years 26 |
| Years survived | mean 13.52, min 0.17, max 20.00 (a game that ran its full length counts its length) |
| Rival folds | 413, 8.26 a game |
| Rival Guildmasters succeeded | 9, 0.18 a game |
| Policy actions the rules refused | 0 |
| Games the validator refused | not validated |
| Games a harness assertion stopped | 0 |
| Byte equality, one seed played twice | `seed-0002`: identical (115,184,036 characters) |
| Saves that load and serialise back identically | 50 of 50 |
| Fingerprint of every seed's last save | `7563e4a395d21ed02f6ee052bf3c8d01dda4b74beb6216495a1dd308b4b45904` |
| `advance` per Turn | mean 7.073 ms, p99 56.150 ms |
| Total run time | 1,242.9 s, the games 800.1 s of it |

## Counters

Read from each game's History through `history.byType`; an entry counts for the Guild it names.

| Quests | Taken | Resolved | Failed | Succeeded | Strong success |
| --- | ---: | ---: | ---: | ---: | ---: |
| The player's Guild | 227,614 | 227,444 | 45,951 (20.2%) | 78,392 (34.5%) | 103,101 (45.3%) |
| The Rivals | 502,873 | 501,652 | 99,315 (19.8%) | 171,137 (34.1%) | 231,200 (46.1%) |

| Heroes | Player's | a game | Rivals' | a game |
| --- | ---: | ---: | ---: | ---: |
| `hero.injured` | 7,456 | 149.12 | 15,586 | 311.72 |
| `hero.died` | 435 | 8.70 | 857 | 17.14 |
| `hero.recruited` | 631 | 12.62 | 418 | 8.36 |
| `hero.retired` | 18 | 0.36 | 5 | 0.10 |
| `hero.trait-gained` | 927 | 18.54 | 2,136 | 42.72 |
| `hero.trait-lost` | 0 | 0.00 | 0 | 0.00 |
| Heroes sent on a Quest | 831 | 16.62 | 4,014 | 80.28 |

Traits earned per Hero career (a Hero sent on a Quest at least once): the player's 1.116, the Rivals' 0.532.

| Ending | `game.ended` (the player) | `guild.folded` (Rivals) |
| --- | ---: | ---: |
| retirement | 0 | 0 |
| bankruptcy | 24 | 413 |
| roster-wiped | 0 | 0 |

A Rival Guildmaster's Retirement is met by Succession (`guildmaster.succeeded`, M9-S2), not a fold: 9 in all.

| Bankruptcy floor | Player's | a game | Rivals' | a game |
| --- | ---: | ---: | ---: | ---: |
| Fell below it (`guild.below-floor`) | 202 | 4.04 | 4,060 | 81.20 |
| Back to it or more (`guild.floor-recovered`) | 177 | 3.54 | 3,641 | 72.82 |

Games ending in each year (year 0 is the first): 0: 7, 1: 6, 2: 0, 3: 0, 4: 1, 5: 0, 6: 1, 7: 0, 8: 0, 9: 1, 10: 0, 11: 1, 12: 2, 13: 0, 14: 0, 15: 1, 16: 0, 17: 2, 18: 2, 19: 0.

## Progression, Fame and the Hall (M3)

A Guild is in play from the Turn it was founded until it folds or the game stops; a Guild-year is a year of one Guild in play. Entries count for the Guild they name.

| Per Guild-year | The player's Guild | The Rivals |
| --- | ---: | ---: |
| Guild-years in play | 675.8 | 2,669.0 |
| Levels gained, `hero.levelled` (a Guild-year) | 5,608 (8.30) | 18,958 (7.10) |
| Declines, `hero.declined` (a Guild-year) | 1,118 (1.65) | 1,368 (0.51) |

In each year (year 0 is the first):

| Year | Player's Guild-years | Levels a Guild-year | Declines a Guild-year | Rivals' Guild-years | Levels a Guild-year | Declines a Guild-year |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 46.9 | 29.80 | 0.00 | 183.8 | 20.52 | 0.00 |
| 1 | 39.8 | 13.07 | 0.00 | 156.2 | 9.31 | 0.00 |
| 2 | 37.0 | 11.38 | 0.00 | 145.7 | 7.67 | 0.00 |
| 3 | 37.0 | 9.16 | 0.00 | 146.5 | 6.16 | 0.00 |
| 4 | 36.6 | 7.74 | 0.30 | 145.1 | 5.16 | 0.15 |
| 5 | 36.0 | 6.19 | 0.67 | 143.0 | 5.55 | 0.30 |
| 6 | 35.2 | 7.48 | 1.00 | 139.5 | 4.80 | 0.50 |
| 7 | 35.0 | 5.46 | 1.11 | 138.9 | 5.03 | 0.67 |
| 8 | 35.0 | 6.57 | 1.31 | 138.1 | 5.38 | 0.85 |
| 9 | 34.7 | 5.37 | 1.67 | 137.0 | 5.56 | 0.85 |
| 10 | 34.0 | 6.24 | 2.00 | 134.1 | 6.34 | 0.79 |
| 11 | 33.1 | 5.35 | 2.24 | 130.0 | 6.18 | 0.75 |
| 12 | 31.9 | 5.26 | 2.48 | 126.0 | 6.04 | 0.83 |
| 13 | 31.0 | 5.00 | 2.81 | 122.1 | 6.30 | 0.85 |
| 14 | 31.0 | 4.23 | 3.00 | 122.4 | 6.15 | 0.77 |
| 15 | 30.3 | 3.89 | 3.56 | 119.8 | 5.95 | 0.80 |
| 16 | 30.0 | 5.43 | 3.50 | 118.4 | 6.31 | 0.70 |
| 17 | 28.6 | 5.55 | 3.42 | 113.3 | 5.91 | 0.67 |
| 18 | 26.9 | 5.62 | 3.72 | 106.0 | 5.92 | 0.66 |
| 19 | 26.0 | 4.65 | 3.58 | 103.0 | 5.83 | 0.73 |

The Guilds in play and their Rosters as each year begins, before the policy acts (0 is the new world), over the games in play then; a Hero is at Potential when any Stat has reached its Potential, where growth stops:

| After years | Games | Player's Wealth | Heroes | Mean Level | At Potential | Rivals' Wealth a Guild | Heroes a Guild | Mean Level | At Potential |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 50 | 500 | 4.0 | 1.00 | 0 (0.0%) | 495 | 5.9 | 1.00 | 0 (0.0%) |
| 1 | 43 | 4,215 | 7.9 | 4.34 | 48 (14.1%) | 3,059 | 5.4 | 3.96 | 77 (8.4%) |
| 2 | 37 | 11,593 | 7.9 | 5.40 | 81 (27.6%) | 4,825 | 5.3 | 4.94 | 154 (20.1%) |
| 3 | 37 | 23,178 | 8.0 | 6.28 | 109 (36.8%) | 7,472 | 5.2 | 5.61 | 218 (28.6%) |
| 4 | 37 | 33,563 | 8.0 | 7.06 | 136 (45.9%) | 9,982 | 5.2 | 6.19 | 272 (35.4%) |
| 5 | 36 | 45,051 | 8.0 | 7.75 | 152 (52.8%) | 11,763 | 5.2 | 6.70 | 291 (39.3%) |
| 6 | 36 | 53,521 | 8.0 | 8.18 | 164 (56.9%) | 12,384 | 5.2 | 7.03 | 329 (43.9%) |
| 7 | 35 | 63,371 | 8.0 | 8.59 | 163 (58.2%) | 12,394 | 5.2 | 7.19 | 339 (47.2%) |
| 8 | 35 | 68,669 | 8.0 | 8.81 | 160 (57.1%) | 11,883 | 5.1 | 7.36 | 353 (50.2%) |
| 9 | 35 | 72,638 | 8.0 | 9.26 | 172 (61.4%) | 11,010 | 5.2 | 7.07 | 328 (45.2%) |
| 10 | 34 | 78,083 | 8.0 | 9.37 | 167 (61.6%) | 10,659 | 5.3 | 7.13 | 304 (43.5%) |
| 11 | 34 | 80,609 | 8.0 | 9.77 | 178 (65.7%) | 10,364 | 5.3 | 6.99 | 300 (42.1%) |
| 12 | 33 | 86,271 | 7.9 | 10.03 | 179 (68.3%) | 10,213 | 5.2 | 6.84 | 277 (40.3%) |
| 13 | 31 | 94,054 | 8.0 | 10.28 | 174 (70.2%) | 10,780 | 5.4 | 6.94 | 264 (40.6%) |
| 14 | 31 | 96,501 | 8.0 | 10.69 | 172 (69.4%) | 10,529 | 5.3 | 6.84 | 269 (40.7%) |
| 15 | 31 | 97,176 | 8.0 | 11.10 | 180 (72.6%) | 10,432 | 5.5 | 6.96 | 287 (42.4%) |
| 16 | 30 | 101,105 | 8.0 | 11.00 | 174 (72.5%) | 10,480 | 5.4 | 6.97 | 262 (40.9%) |
| 17 | 30 | 99,116 | 8.0 | 10.97 | 171 (71.3%) | 10,807 | 5.3 | 6.98 | 261 (41.6%) |
| 18 | 28 | 103,634 | 8.0 | 10.78 | 154 (68.8%) | 11,228 | 5.4 | 6.81 | 248 (41.4%) |
| 19 | 26 | 109,709 | 8.0 | 10.79 | 142 (68.3%) | 10,704 | 5.4 | 7.04 | 248 (44.8%) |
| 20 | 26 | 108,585 | 8.0 | 11.08 | 147 (71.0%) | 10,226 | 5.4 | 7.30 | 256 (45.6%) |

Heroes with a Stat at Potential after 10 years, over the 34 games in play then: the player's Roster 167 of 271 (61.6%); the Rivals' Rosters 304 of 699 (43.5%).

Growth against decline (M3-S4): over the Guilds on whose Roster a Hero declined, the Levels gained before the first decline and from it on, and the Stat points Levels added and declines took from it on:

| Rosters with a decline | Guilds | Levels a Guild-year before | Levels a Guild-year after | Points grown a Guild-year after | Points declined a Guild-year after |
| --- | ---: | ---: | ---: | ---: | ---: |
| The player's Guild | 34 | 12.51 | 5.45 | 14.64 | 2.64 |
| The Rivals | 176 | 7.10 | 3.19 | 8.74 | 1.82 |

Retirements by age (`hero.retired`):

| Age | Player's | Rivals' |
| --- | ---: | ---: |
| 45 to 49 | 10 | 3 |
| 50 to 54 | 8 | 2 |

Signings refused by Fame (M3-S5, DL-38 item 9): each morning before the policy acts, the pool Heroes who would refuse each Guild in play (`unsignableHeroes`), whether or not the Guild asks:

| Signings refused by Fame | Hero-Days refused | Guild-Days | Refused a Guild-Day | Guild-Days with one or more |
| --- | ---: | ---: | ---: | ---: |
| The player's Guild | 1,466 | 243,310 | 0.006 | 272 (0.1%) |
| The Rivals | 3,568 | 960,890 | 0.004 | 751 (0.1%) |

`signing-refused` rejections returned to the automatic policy: 0. A Rival's refused choice is dropped inside the afternoon's phase (DL-30), out of the harness's sight; `steady` asks only Heroes who would sign (DL-38 item 5).

Improvement grades reached by year 10 (M3-S6, DL-38 item 15), over the 34 games that reached it: the Guilds founded before it, replacement Rivals included, by the highest grade each facility reached before it; the Rivals' rows again by Disposition (M6, DL-69):

| Controller: facility | Guilds | Mean grade | Grade 0 | Grade 1 | Grade 2 | Grade 3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| The player's Guild: infirmary | 34 | 3.00 | 0 | 0 | 0 | 34 |
| The player's Guild: trainingYard | 34 | 0.00 | 34 | 0 | 0 | 0 |
| The player's Guild: quarters | 34 | 0.00 | 34 | 0 | 0 | 0 |
| The Rivals: infirmary | 322 | 1.76 | 65 | 72 | 60 | 125 |
| The Rivals: trainingYard | 322 | 1.67 | 72 | 76 | 60 | 114 |
| The Rivals: quarters | 322 | 1.55 | 79 | 81 | 67 | 95 |
| The Rivals, `ambitious`: infirmary | 93 | 2.51 | 0 | 17 | 12 | 64 |
| The Rivals, `ambitious`: trainingYard | 93 | 2.38 | 3 | 16 | 17 | 57 |
| The Rivals, `ambitious`: quarters | 93 | 2.16 | 6 | 18 | 24 | 45 |
| The Rivals, `miserly`: infirmary | 54 | 0.89 | 19 | 22 | 13 | 0 |
| The Rivals, `miserly`: trainingYard | 54 | 0.87 | 19 | 23 | 12 | 0 |
| The Rivals, `miserly`: quarters | 54 | 0.83 | 20 | 23 | 11 | 0 |
| The Rivals, `reckless`: infirmary | 110 | 1.52 | 38 | 17 | 15 | 40 |
| The Rivals, `reckless`: trainingYard | 110 | 1.44 | 42 | 18 | 10 | 40 |
| The Rivals, `reckless`: quarters | 110 | 1.32 | 44 | 22 | 9 | 35 |
| The Rivals, `steady`: infirmary | 65 | 1.83 | 8 | 16 | 20 | 21 |
| The Rivals, `steady`: trainingYard | 65 | 1.72 | 8 | 19 | 21 | 17 |
| The Rivals, `steady`: quarters | 65 | 1.68 | 9 | 18 | 23 | 15 |

## The Quest Engine (M4)

Encounter outcomes by kind (`quest.encounter`), by the Guild that sent the Party, with the Heroes its consequences injured and killed a Check:

| Controller: kind | Checks | Succeeded | Failed | Injured a Check | Killed a Check |
| --- | ---: | ---: | ---: | ---: | ---: |
| The player's Guild: combat | 145,353 | 118,343 (81.4%) | 27,010 (18.6%) | 0.022 | 0.001 |
| The player's Guild: travel | 151,877 | 128,556 (84.6%) | 23,321 (15.4%) | 0.006 | 0.000 |
| The player's Guild: social | 106,498 | 88,474 (83.1%) | 18,024 (16.9%) | 0.000 | 0.000 |
| The player's Guild: arcane | 60,938 | 51,648 (84.8%) | 9,290 (15.2%) | 0.009 | 0.001 |
| The player's Guild: stealth | 184,636 | 144,234 (78.1%) | 40,402 (21.9%) | 0.014 | 0.001 |
| The player's Guild: lore | 58,388 | 42,422 (72.7%) | 15,966 (27.3%) | 0.008 | 0.000 |
| The player's Guild: every kind | 707,690 | 573,677 (81.1%) | 134,013 (18.9%) | 0.011 | 0.001 |
| The Rivals: combat | 314,571 | 247,370 (78.6%) | 67,201 (21.4%) | 0.025 | 0.001 |
| The Rivals: travel | 353,684 | 302,468 (85.5%) | 51,216 (14.5%) | 0.005 | 0.000 |
| The Rivals: social | 206,396 | 173,631 (84.1%) | 32,765 (15.9%) | 0.000 | 0.000 |
| The Rivals: arcane | 110,511 | 91,136 (82.5%) | 19,375 (17.5%) | 0.009 | 0.000 |
| The Rivals: stealth | 322,306 | 243,896 (75.7%) | 78,410 (24.3%) | 0.013 | 0.001 |
| The Rivals: lore | 129,389 | 100,022 (77.3%) | 29,367 (22.7%) | 0.007 | 0.000 |
| The Rivals: every kind | 1,436,857 | 1,158,523 (80.6%) | 278,334 (19.4%) | 0.011 | 0.001 |

Synergies applied per Quest (`quest.resolved`'s `synergyKeys`; a Quest names each Synergy once):

| Synergies | Quests resolved | With one or more | Synergies a Quest |
| --- | ---: | ---: | ---: |
| The player's Guild | 227,444 | 184,821 (81.3%) | 1.046 |
| The Rivals | 501,652 | 373,808 (74.5%) | 0.920 |

| Quests applying it | Player's | Rivals' |
| --- | ---: | ---: |
| `a-full-company` | 1,920 (0.8%) | 4,258 (0.8%) |
| `old-hands` | 169,174 (74.4%) | 315,737 (62.9%) |
| `scouting-ahead` | 15,776 (6.9%) | 23,221 (4.6%) |
| `shadow-and-spell` | 15,337 (6.7%) | 33,536 (6.7%) |
| `shield-wall` | 354 (0.2%) | 123 (0.0%) |
| `sword-and-salve` | 25,808 (11.3%) | 67,051 (13.4%) |
| `two-learned-heads` | 596 (0.3%) | 613 (0.1%) |
| `under-a-captain` | 0 (0.0%) | 94 (0.0%) |
| `wards-and-blessings` | 9,053 (4.0%) | 16,965 (3.4%) |

Injuries by type (`hero.injured`), by the Guild the Hero was on:

| Injury type | Player's | Rivals' |
| --- | ---: | ---: |
| `broken-arm` | 1,381 (18.5%) | 2,363 (15.2%) |
| `bruised-ribs` | 1,268 (17.0%) | 3,047 (19.5%) |
| `deep-cut` | 3,195 (42.9%) | 7,206 (46.2%) |
| `eye-wound` | 450 (6.0%) | 867 (5.6%) |
| `lung-fever` | 890 (11.9%) | 1,557 (10.0%) |
| `shattered-knee` | 205 (2.7%) | 386 (2.5%) |
| `sprained-ankle` | 67 (0.9%) | 160 (1.0%) |
| Every type | 7,456 | 15,586 |

Patrons silent: in each year played in full, the Patrons in the world as it began that offered no Quest in it (no `quest.offered` naming them): 0 of 7,980 Patron-years (0.0%).

| Year | Patron-years | Silent |
| ---: | ---: | ---: |
| 0 | 516 | 0 (0.0%) |
| 1 | 444 | 0 (0.0%) |
| 2 | 444 | 0 (0.0%) |
| 3 | 444 | 0 (0.0%) |
| 4 | 432 | 0 (0.0%) |
| 5 | 432 | 0 (0.0%) |
| 6 | 420 | 0 (0.0%) |
| 7 | 420 | 0 (0.0%) |
| 8 | 420 | 0 (0.0%) |
| 9 | 408 | 0 (0.0%) |
| 10 | 408 | 0 (0.0%) |
| 11 | 396 | 0 (0.0%) |
| 12 | 372 | 0 (0.0%) |
| 13 | 372 | 0 (0.0%) |
| 14 | 372 | 0 (0.0%) |
| 15 | 360 | 0 (0.0%) |
| 16 | 360 | 0 (0.0%) |
| 17 | 336 | 0 (0.0%) |
| 18 | 312 | 0 (0.0%) |
| 19 | 312 | 0 (0.0%) |

The player's Guild's Regard after 10 years, over the 34 games in play then, by band (a Relationship is the mean of two Heroes' Regard for each other, each unordered pair of the Roster once; the Guildmaster's Regard is each entry of its map, which nothing reads in the first build):

| Regard | Counted | hostile | cool | neutral | warm | close |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Relationships within the player's Roster | 945 | 0 (0.0%) | 0 (0.0%) | 70 (7.4%) | 71 (7.5%) | 804 (85.1%) |
| The player's Guildmaster for Patrons | 408 | 0 (0.0%) | 2 (0.5%) | 1 (0.2%) | 5 (1.2%) | 400 (98.0%) |
| The player's Guildmaster for Heroes | 538 | 59 (11.0%) | 57 (10.6%) | 51 (9.5%) | 22 (4.1%) | 349 (64.9%) |

## Items (M5)

Wealth spent by category and taken, by the Guild each entry names; a Guild-year as in M3's table. A Transfer's fee (M6) is spent by the Guild the Hero joins and taken by the Guild they leave.

| Wealth | Player's | a Guild-year | Rivals' | a Guild-year |
| --- | ---: | ---: | ---: | ---: |
| Spent: signing fees (`hero.recruited` `fee`) | 67,892 | 100.5 | 44,471 | 16.7 |
| Spent: Transfers (`hero.transferred` `fee`, the buying Guild) | 0 | 0.0 | 5,296 | 2.0 |
| Spent: Items (`item.bought` `cost`) | 2,672,160 | 3,953.8 | 563,235 | 211.0 |
| Spent: Improvements (`guild.improved` `cost`) | 68,100 | 100.8 | 1,339,900 | 502.0 |
| Spent: Upkeep (`guild.upkeep-paid` `amount`) | 34,320,650 | 50,782.3 | 70,697,178 | 26,487.8 |
| Spent in all | 37,128,802 | 54,937.4 | 72,650,080 | 27,219.5 |
| Taken: Quest rewards (`quest.resolved` `wealthDelta`) | 39,890,244 | 59,023.3 | 73,496,778 | 27,536.7 |
| Taken: Transfers (`hero.transferred` `fee`, the selling Guild) | 0 | 0.0 | 5,296 | 2.0 |
| Taken: the Market, `item.sold` `sale` (`proceeds`) | 0 | 0.0 | 0 | 0.0 |
| Taken: the Market, `item.sold` `fold` (`proceeds`) | 0 | 0.0 | 27,000 | 10.1 |
| Taken in all | 39,890,244 | 59,023.3 | 73,529,074 | 27,548.8 |
| Items bought (`item.bought` `quantity`) | 87,329 | 129.2 | 10,314 | 3.9 |
| Items sold, `sale` | 0 | 0.0 | 0 | 0.0 |
| Items sold, `fold` | 0 | 0.0 | 90 | 0.0 |

Shares of the Wealth spent: The player's Guild: signing 0.2%, Transfers 0.0%, Items 7.2%, Improvements 0.2%, Upkeep 92.4%; The Rivals: signing 0.1%, Transfers 0.0%, Items 0.8%, Improvements 1.8%, Upkeep 97.3%.

Loot awarded by table (`quest.loot` by `lootTableKey`): awards, the Items they gave, and the awards of a unique Item:

| Loot table | Player's awards | a Guild-year | Items | Unique | Rivals' awards | a Guild-year | Items | Unique |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `greater-loot` | 18,658 | 27.6 | 29,567 | 65 | 18,161 | 6.8 | 28,846 | 83 |
| `lesser-loot` | 7,742 | 11.5 | 12,345 | 4 | 16,181 | 6.1 | 26,020 | 18 |
| Every table | 26,400 | 39.1 | 41,912 | 69 | 34,342 | 12.9 | 54,866 | 101 |

Loot a Quest resolved: the player's Guild 0.116 an award a Quest resolved; the Rivals 0.068 an award a Quest resolved.

The player's Quests by the difficulty the policy saw as it dispatched (no entry records it), 227,444 resolved, mean difficulty 47.6, 26,400 Loot awards (0.116 a Quest). By the Quest's difficulty (M5-S5's third box):

| Difficulty | Quests resolved | Mean difficulty | Strong | Loot awards | Loot a Quest | Unique |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 to 19 | 24,808 | 14.6 | 13,287 (53.6%) | 0 | 0.000 | 0 |
| 20 to 29 | 32,867 | 24.8 | 14,990 (45.6%) | 0 | 0.000 | 0 |
| 30 to 39 | 29,426 | 34.3 | 14,066 (47.8%) | 0 | 0.000 | 0 |
| 40 to 49 | 32,348 | 44.5 | 16,776 (51.9%) | 2,920 | 0.090 | 6 |
| 50 to 59 | 37,041 | 54.5 | 18,173 (49.1%) | 6,250 | 0.169 | 11 |
| 60 to 69 | 29,364 | 64.5 | 12,101 (41.2%) | 6,672 | 0.227 | 25 |
| 70 to 79 | 25,302 | 74.1 | 8,638 (34.1%) | 6,221 | 0.246 | 13 |
| 80 to 89 | 12,359 | 83.6 | 4,346 (35.2%) | 3,669 | 0.297 | 12 |
| 90 to 99 | 3,607 | 94.0 | 667 (18.5%) | 615 | 0.171 | 2 |
| 100 to 109 | 322 | 100.0 | 57 (17.7%) | 53 | 0.165 | 0 |

By the year resolved in (year 0 is the first):

| Year | Quests resolved | Mean difficulty | Strong | Loot awards | Loot a Quest | Unique |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 12,653 | 48.8 | 1,350 (10.7%) | 298 | 0.024 | 2 |
| 1 | 12,254 | 48.1 | 2,187 (17.8%) | 533 | 0.043 | 5 |
| 2 | 12,247 | 47.8 | 3,745 (30.6%) | 1,007 | 0.082 | 7 |
| 3 | 12,358 | 48.0 | 4,592 (37.2%) | 1,225 | 0.099 | 13 |
| 4 | 12,295 | 48.0 | 5,181 (42.1%) | 1,388 | 0.113 | 12 |
| 5 | 12,078 | 47.7 | 5,630 (46.6%) | 1,481 | 0.123 | 5 |
| 6 | 12,044 | 47.8 | 5,749 (47.7%) | 1,552 | 0.129 | 2 |
| 7 | 11,879 | 47.4 | 5,774 (48.6%) | 1,512 | 0.127 | 4 |
| 8 | 11,927 | 47.4 | 5,921 (49.6%) | 1,534 | 0.129 | 4 |
| 9 | 11,843 | 47.3 | 5,996 (50.6%) | 1,464 | 0.124 | 3 |
| 10 | 11,485 | 47.8 | 5,798 (50.5%) | 1,556 | 0.135 | 4 |
| 11 | 11,470 | 47.4 | 5,996 (52.3%) | 1,511 | 0.132 | 3 |
| 12 | 11,050 | 47.4 | 5,882 (53.2%) | 1,474 | 0.133 | 2 |
| 13 | 11,051 | 47.0 | 6,021 (54.5%) | 1,522 | 0.138 | 0 |
| 14 | 10,932 | 47.2 | 6,269 (57.3%) | 1,599 | 0.146 | 1 |
| 15 | 10,810 | 47.0 | 6,205 (57.4%) | 1,562 | 0.144 | 1 |
| 16 | 10,522 | 47.4 | 5,700 (54.2%) | 1,468 | 0.140 | 1 |
| 17 | 10,076 | 46.9 | 5,302 (52.6%) | 1,290 | 0.128 | 0 |
| 18 | 9,352 | 47.2 | 4,880 (52.2%) | 1,211 | 0.129 | 0 |
| 19 | 9,118 | 47.3 | 4,923 (54.0%) | 1,213 | 0.133 | 0 |

Consumables carried (`quest.taken`'s `consumables`) and expended (`item.expended`) against the Quests resolved:

| Consumables | Quests resolved | Carried | a Quest | Expended | a Quest | Quests with one or more | bonus | reroll | heal |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| The player's Guild | 227,444 | 575,198 | 2.529 | 106,912 | 0.470 | 87,611 (38.5%) | 74,864 | 27,093 | 4,955 |
| The Rivals | 501,652 | 0 | 0.000 | 0 | 0.000 | 0 (0.0%) | 0 | 0 | 0 |

| Expended, by definition | Player's | Rivals' |
| --- | ---: | ---: |
| `blessed-candle` | 12,858 | 0 |
| `grappling-line` | 14,235 | 0 |
| `healing-draught` | 1,452 | 0 |
| `lockpicks` | 40,240 | 0 |
| `physicians-kit` | 3,503 | 0 |
| `whetstone` | 34,624 | 0 |

Gear moved (`item.equipped`, `item.unequipped`, and `item.returned` by its `cause`):

| Gear | Equipped | a Guild-year | Unequipped | Returned: died | Returned: retired | Returned: guild-folded | Returned: transferred |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| The player's Guild | 2,015 | 3.0 | 0 | 991 | 54 | 0 | 0 |
| The Rivals | 11,717 | 4.4 | 0 | 2,481 | 15 | 6,026 | 33 |

## Rivals (M6)

Read from each game's History as before, a Transfer counting for both its Guilds (`hero.transferred`'s `fromGuildId`, the seller, and `toGuildId`, the buyer); a side is the player's Guild or a Rival's Disposition. What no entry records the play loop reads from the world each `advance` begins with: the difficulty of each Quest a Rival takes, and whether an afternoon Transfer's seller was in debt.

The M6-S3 harness assertion: `hero.transferred` entries naming the player's Guild, 0; games it stopped, 0. The automatic policy declines every Transfer Offer and never transfers, and the Transfer Generator never takes from the player, so any such entry is a harness failure: it stops its game and is listed under "Harness assertions broken", as a validator refusal is under its own heading.

Transfers by direction:

| Transfers | Count | a game | Fees | Mean fee |
| --- | ---: | ---: | ---: | ---: |
| Into the player's Guild | 0 | 0.00 | 0 | — |
| Out of the player's Guild | 0 | 0.00 | 0 | — |
| Rival to Rival | 11 | 0.22 | 5,296 | 481 |
| Every Transfer | 11 | 0.22 | 5,296 | 481 |

Rival to Rival, by how each happened. No entry says which action made a Transfer: an accepted offer names it, a night's is the Generator's (Rivals choose in the afternoon), and an afternoon's is the buyer's choice unless the seller was in debt as the afternoon began, when it may be the seller's debt sale instead; the entries cannot tell those two apart.

| Rival to Rival | Count | a game | Fees | Mean fee |
| --- | ---: | ---: | ---: | ---: |
| An afternoon, the seller out of debt: the buyer's choice (`transferChoice`) | 11 | 0.22 | 5,296 | 481 |
| An afternoon, the seller in debt: the buyer's choice or the seller's debt sale (`debtTransfer`) | 0 | 0.00 | 0 | — |
| A night: the Transfer Generator | 0 | 0.00 | 0 | — |
| An accepted Transfer Offer (`offerId` set) | 0 | 0.00 | 0 | — |

Transfers that took a Hero to a Guild that had sold them before (DL-60's lock): 0.

By side, bought and sold:

| Side | Bought | Fees paid | Sold | Fees taken | Net Heroes |
| --- | ---: | ---: | ---: | ---: | ---: |
| The player's Guild | 0 | 0 | 0 | 0 | 0 |
| `ambitious` | 1 | 614 | 5 | 2,569 | -4 |
| `miserly` | 0 | 0 | 0 | 0 | 0 |
| `reckless` | 10 | 4,682 | 0 | 0 | 10 |
| `steady` | 0 | 0 | 6 | 2,727 | -6 |

| Sold by, bought by | The player's Guild | `ambitious` | `miserly` | `reckless` | `steady` |
| --- | ---: | ---: | ---: | ---: | ---: |
| The player's Guild | 0 | 0 | 0 | 0 | 0 |
| `ambitious` | 0 | 0 | 0 | 5 | 0 |
| `miserly` | 0 | 0 | 0 | 0 | 0 |
| `reckless` | 0 | 0 | 0 | 0 | 0 |
| `steady` | 0 | 1 | 0 | 5 | 0 |

Transfer Offers, by the Guild that made them and the Guild asked: made (`guild.transfer-offered`), accepted (a `hero.transferred` naming the offer), declined (`guild.transfer-offer-declined`), ended unanswered (`guild.transfer-offer-expired` by its `cause`), and standing when the game stopped:

| Offers | Made | Mean fee | Accepted | Declined | Ended: expired | Ended: hero-left | Ended: guild-folded | Standing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `reckless` to the player's Guild | 1 | 719 | 0 | 1 | 0 | 0 | 0 | 0 |

The Rivals in play as each year began, before the policy acts (0 is the new world): each Roster's size against the range a Rival is generated with (`rivalRosterMin` 4 to `rivalRosterMax` 8), and its Wealth against its starting range (`rivalStartingWealthMin` 300 to `rivalStartingWealthMax` 700); a median is the middle year-start, the lower of two:

| Year | Rival year-starts | Roster, mean | median | below 4 | above 8 | Wealth, mean | median | below 300 | above 700 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 5.91 | 6 | 0.0% | 0.0% | 495 | 499 | 0.0% | 0.0% |
| 1 | 171 | 5.39 | 5 | 1.2% | 0.0% | 3,059 | 2,077 | 18.1% | 74.3% |
| 2 | 144 | 5.31 | 5 | 0.7% | 0.0% | 4,825 | 3,863 | 11.1% | 81.9% |
| 3 | 147 | 5.18 | 5 | 1.4% | 0.0% | 7,472 | 6,015 | 7.5% | 88.4% |
| 4 | 148 | 5.20 | 5 | 0.7% | 0.0% | 9,982 | 8,911 | 6.1% | 89.2% |
| 5 | 142 | 5.21 | 5 | 0.0% | 0.7% | 11,763 | 9,827 | 7.7% | 89.4% |
| 6 | 144 | 5.21 | 5 | 0.7% | 2.1% | 12,384 | 10,049 | 6.9% | 88.2% |
| 7 | 139 | 5.17 | 5 | 0.7% | 2.2% | 12,394 | 9,353 | 4.3% | 95.0% |
| 8 | 138 | 5.09 | 5 | 0.0% | 1.4% | 11,883 | 8,686 | 8.0% | 89.1% |
| 9 | 139 | 5.22 | 5 | 0.0% | 2.9% | 11,010 | 7,282 | 7.9% | 89.2% |
| 10 | 133 | 5.26 | 5 | 0.0% | 3.8% | 10,659 | 7,151 | 10.5% | 85.7% |
| 11 | 135 | 5.27 | 5 | 0.0% | 3.7% | 10,364 | 7,130 | 5.2% | 90.4% |
| 12 | 131 | 5.24 | 5 | 0.0% | 3.8% | 10,213 | 7,564 | 8.4% | 87.0% |
| 13 | 121 | 5.37 | 5 | 0.8% | 5.0% | 10,780 | 7,805 | 7.4% | 86.8% |
| 14 | 124 | 5.33 | 4 | 0.8% | 7.3% | 10,529 | 8,378 | 11.3% | 86.3% |
| 15 | 124 | 5.46 | 5 | 0.8% | 5.6% | 10,432 | 7,298 | 8.9% | 87.1% |
| 16 | 119 | 5.38 | 5 | 0.8% | 6.7% | 10,480 | 8,927 | 10.1% | 84.9% |
| 17 | 118 | 5.31 | 5 | 1.7% | 5.1% | 10,807 | 8,062 | 6.8% | 89.0% |
| 18 | 110 | 5.45 | 5 | 0.9% | 7.3% | 11,228 | 9,173 | 7.3% | 87.3% |
| 19 | 102 | 5.43 | 5 | 0.0% | 7.8% | 10,704 | 7,238 | 4.9% | 89.2% |
| 20 | 103 | 5.45 | 5 | 1.0% | 6.8% | 10,226 | 7,547 | 8.7% | 88.3% |

By Disposition, over every year-start, then year by year:

| Disposition | Rival year-starts | Roster, mean | median | below 4 | above 8 | Wealth, mean | median | below 300 | above 700 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `ambitious` | 707 | 5.24 | 5 | 1.6% | 1.7% | 8,987 | 4,956 | 17.1% | 68.9% |
| `miserly` | 714 | 5.28 | 5 | 0.0% | 0.0% | 8,684 | 7,537 | 2.0% | 89.1% |
| `reckless` | 701 | 5.88 | 5 | 0.6% | 10.7% | 11,637 | 6,015 | 8.8% | 79.3% |
| `steady` | 710 | 4.94 | 4 | 0.1% | 0.0% | 7,729 | 5,430 | 3.8% | 86.6% |
| Every Rival | 2,832 | 5.33 | 5 | 0.6% | 3.1% | 9,251 | 6,395 | 7.9% | 81.0% |

| Disposition | Year | Rival year-starts | Roster, mean | median | below 4 | above 8 | Wealth, mean | median | below 300 | above 700 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `ambitious` | 0 | 50 | 6.22 | 6 | 0.0% | 0.0% | 474 | 456 | 0.0% | 0.0% |
| `ambitious` | 1 | 43 | 5.30 | 5 | 2.3% | 0.0% | 1,007 | 329 | 46.5% | 41.9% |
| `ambitious` | 2 | 37 | 5.27 | 5 | 2.7% | 0.0% | 3,067 | 935 | 27.0% | 59.5% |
| `ambitious` | 3 | 36 | 5.39 | 5 | 5.6% | 0.0% | 7,120 | 5,013 | 25.0% | 63.9% |
| `ambitious` | 4 | 37 | 5.43 | 5 | 2.7% | 0.0% | 10,218 | 8,530 | 21.6% | 70.3% |
| `ambitious` | 5 | 35 | 5.49 | 5 | 0.0% | 2.9% | 13,045 | 10,897 | 17.1% | 77.1% |
| `ambitious` | 6 | 36 | 5.31 | 5 | 0.0% | 2.8% | 14,050 | 10,565 | 8.3% | 77.8% |
| `ambitious` | 7 | 35 | 5.29 | 5 | 0.0% | 2.9% | 14,635 | 11,831 | 11.4% | 88.6% |
| `ambitious` | 8 | 35 | 5.17 | 5 | 0.0% | 2.9% | 14,304 | 12,240 | 8.6% | 88.6% |
| `ambitious` | 9 | 35 | 5.17 | 5 | 0.0% | 2.9% | 13,735 | 12,245 | 5.7% | 91.4% |
| `ambitious` | 10 | 33 | 5.12 | 5 | 0.0% | 3.0% | 13,117 | 11,123 | 9.1% | 84.8% |
| `ambitious` | 11 | 34 | 4.91 | 4 | 0.0% | 2.9% | 11,267 | 6,853 | 8.8% | 76.5% |
| `ambitious` | 12 | 32 | 5.00 | 4 | 0.0% | 3.1% | 10,052 | 3,260 | 25.0% | 68.8% |
| `ambitious` | 13 | 29 | 5.17 | 5 | 3.4% | 3.4% | 10,326 | 4,719 | 10.3% | 75.9% |
| `ambitious` | 14 | 31 | 4.94 | 4 | 3.2% | 3.2% | 8,825 | 4,581 | 32.3% | 67.7% |
| `ambitious` | 15 | 31 | 5.03 | 4 | 3.2% | 3.2% | 7,870 | 5,629 | 19.4% | 71.0% |
| `ambitious` | 16 | 30 | 4.87 | 4 | 3.3% | 3.3% | 7,554 | 5,451 | 20.0% | 76.7% |
| `ambitious` | 17 | 30 | 4.97 | 4 | 3.3% | 0.0% | 7,981 | 6,929 | 16.7% | 76.7% |
| `ambitious` | 18 | 28 | 4.96 | 4 | 3.6% | 0.0% | 8,365 | 4,297 | 21.4% | 71.4% |
| `ambitious` | 19 | 25 | 5.08 | 4 | 0.0% | 0.0% | 8,296 | 4,425 | 8.0% | 88.0% |
| `ambitious` | 20 | 25 | 5.16 | 4 | 0.0% | 0.0% | 8,830 | 6,117 | 16.0% | 80.0% |
| `miserly` | 0 | 50 | 5.88 | 6 | 0.0% | 0.0% | 507 | 500 | 0.0% | 0.0% |
| `miserly` | 1 | 43 | 5.70 | 5 | 0.0% | 0.0% | 6,559 | 6,699 | 0.0% | 100.0% |
| `miserly` | 2 | 37 | 5.57 | 5 | 0.0% | 0.0% | 8,875 | 7,911 | 0.0% | 100.0% |
| `miserly` | 3 | 37 | 5.30 | 5 | 0.0% | 0.0% | 10,206 | 9,412 | 0.0% | 100.0% |
| `miserly` | 4 | 37 | 5.19 | 5 | 0.0% | 0.0% | 12,448 | 11,707 | 0.0% | 100.0% |
| `miserly` | 5 | 36 | 5.25 | 5 | 0.0% | 0.0% | 13,036 | 12,581 | 0.0% | 100.0% |
| `miserly` | 6 | 36 | 5.22 | 5 | 0.0% | 0.0% | 12,415 | 11,645 | 8.3% | 88.9% |
| `miserly` | 7 | 35 | 5.11 | 5 | 0.0% | 0.0% | 11,952 | 12,234 | 0.0% | 100.0% |
| `miserly` | 8 | 35 | 4.94 | 5 | 0.0% | 0.0% | 9,923 | 7,937 | 2.9% | 91.4% |
| `miserly` | 9 | 35 | 4.97 | 5 | 0.0% | 0.0% | 7,522 | 6,445 | 5.7% | 85.7% |
| `miserly` | 10 | 34 | 5.12 | 5 | 0.0% | 0.0% | 6,951 | 6,130 | 5.9% | 85.3% |
| `miserly` | 11 | 34 | 5.35 | 5 | 0.0% | 0.0% | 6,494 | 6,709 | 5.9% | 94.1% |
| `miserly` | 12 | 33 | 5.09 | 5 | 0.0% | 0.0% | 6,599 | 7,530 | 0.0% | 97.0% |
| `miserly` | 13 | 30 | 5.23 | 5 | 0.0% | 0.0% | 6,842 | 6,265 | 3.3% | 96.7% |
| `miserly` | 14 | 31 | 5.32 | 5 | 0.0% | 0.0% | 7,622 | 8,665 | 6.5% | 87.1% |
| `miserly` | 15 | 31 | 5.26 | 5 | 0.0% | 0.0% | 9,339 | 7,499 | 3.2% | 96.8% |
| `miserly` | 16 | 30 | 5.27 | 5 | 0.0% | 0.0% | 10,180 | 8,937 | 0.0% | 96.7% |
| `miserly` | 17 | 30 | 5.20 | 5 | 0.0% | 0.0% | 10,206 | 8,013 | 0.0% | 100.0% |
| `miserly` | 18 | 28 | 5.14 | 5 | 0.0% | 0.0% | 10,224 | 10,977 | 0.0% | 96.4% |
| `miserly` | 19 | 26 | 5.19 | 5 | 0.0% | 0.0% | 9,534 | 9,599 | 0.0% | 100.0% |
| `miserly` | 20 | 26 | 5.12 | 5 | 0.0% | 0.0% | 8,838 | 7,547 | 0.0% | 100.0% |
| `reckless` | 0 | 50 | 5.76 | 6 | 0.0% | 0.0% | 499 | 504 | 0.0% | 0.0% |
| `reckless` | 1 | 42 | 5.29 | 5 | 2.4% | 0.0% | 1,146 | 932 | 23.8% | 61.9% |
| `reckless` | 2 | 35 | 5.26 | 5 | 0.0% | 0.0% | 2,142 | 1,405 | 17.1% | 71.4% |
| `reckless` | 3 | 37 | 5.05 | 5 | 0.0% | 0.0% | 5,538 | 3,008 | 2.7% | 91.9% |
| `reckless` | 4 | 37 | 5.16 | 5 | 0.0% | 0.0% | 8,538 | 6,083 | 0.0% | 91.9% |
| `reckless` | 5 | 36 | 5.14 | 5 | 0.0% | 0.0% | 11,497 | 9,416 | 8.3% | 88.9% |
| `reckless` | 6 | 36 | 5.53 | 5 | 0.0% | 5.6% | 13,504 | 14,175 | 5.6% | 91.7% |
| `reckless` | 7 | 34 | 5.47 | 5 | 2.9% | 5.9% | 13,693 | 9,353 | 5.9% | 94.1% |
| `reckless` | 8 | 33 | 5.52 | 5 | 0.0% | 3.0% | 14,464 | 12,616 | 15.2% | 84.8% |
| `reckless` | 9 | 34 | 6.00 | 6 | 0.0% | 8.8% | 14,429 | 7,604 | 11.8% | 88.2% |
| `reckless` | 10 | 33 | 6.09 | 6 | 0.0% | 12.1% | 14,367 | 5,767 | 15.2% | 84.8% |
| `reckless` | 11 | 33 | 5.91 | 5 | 0.0% | 12.1% | 15,573 | 10,149 | 3.0% | 97.0% |
| `reckless` | 12 | 33 | 5.88 | 5 | 0.0% | 12.1% | 15,856 | 13,785 | 6.1% | 93.9% |
| `reckless` | 13 | 31 | 6.45 | 5 | 0.0% | 16.1% | 17,292 | 13,688 | 12.9% | 83.9% |
| `reckless` | 14 | 31 | 6.42 | 5 | 0.0% | 25.8% | 17,086 | 13,370 | 0.0% | 96.8% |
| `reckless` | 15 | 31 | 6.52 | 6 | 0.0% | 19.4% | 16,358 | 12,797 | 9.7% | 83.9% |
| `reckless` | 16 | 30 | 6.50 | 6 | 0.0% | 23.3% | 15,309 | 11,008 | 13.3% | 80.0% |
| `reckless` | 17 | 28 | 6.36 | 5 | 3.6% | 21.4% | 15,926 | 8,979 | 7.1% | 85.7% |
| `reckless` | 18 | 26 | 6.92 | 6 | 0.0% | 30.8% | 16,720 | 11,640 | 7.7% | 84.6% |
| `reckless` | 19 | 25 | 6.84 | 5 | 0.0% | 32.0% | 15,288 | 9,651 | 8.0% | 76.0% |
| `reckless` | 20 | 26 | 6.85 | 6 | 3.8% | 26.9% | 13,432 | 8,826 | 15.4% | 76.9% |
| `steady` | 0 | 50 | 5.78 | 5 | 0.0% | 0.0% | 498 | 498 | 0.0% | 0.0% |
| `steady` | 1 | 43 | 5.26 | 5 | 0.0% | 0.0% | 3,481 | 3,773 | 2.3% | 93.0% |
| `steady` | 2 | 35 | 5.14 | 4 | 0.0% | 0.0% | 5,083 | 4,646 | 0.0% | 97.1% |
| `steady` | 3 | 37 | 5.00 | 4 | 0.0% | 0.0% | 7,015 | 4,761 | 2.7% | 97.3% |
| `steady` | 4 | 37 | 5.00 | 4 | 0.0% | 0.0% | 8,723 | 6,345 | 2.7% | 94.6% |
| `steady` | 5 | 35 | 4.97 | 4 | 0.0% | 0.0% | 9,447 | 7,617 | 5.7% | 91.4% |
| `steady` | 6 | 36 | 4.78 | 4 | 2.8% | 0.0% | 9,565 | 5,732 | 5.6% | 94.4% |
| `steady` | 7 | 35 | 4.80 | 4 | 0.0% | 0.0% | 9,334 | 6,021 | 0.0% | 97.1% |
| `steady` | 8 | 35 | 4.77 | 4 | 0.0% | 0.0% | 8,990 | 6,473 | 5.7% | 91.4% |
| `steady` | 9 | 35 | 4.74 | 4 | 0.0% | 0.0% | 8,452 | 6,240 | 8.6% | 91.4% |
| `steady` | 10 | 33 | 4.70 | 4 | 0.0% | 0.0% | 8,313 | 6,096 | 12.1% | 87.9% |
| `steady` | 11 | 34 | 4.94 | 4 | 0.0% | 0.0% | 8,275 | 6,630 | 2.9% | 94.1% |
| `steady` | 12 | 33 | 5.00 | 4 | 0.0% | 0.0% | 8,341 | 8,023 | 3.0% | 87.9% |
| `steady` | 13 | 31 | 4.61 | 4 | 0.0% | 0.0% | 8,502 | 6,646 | 3.2% | 90.3% |
| `steady` | 14 | 31 | 4.65 | 4 | 0.0% | 0.0% | 8,581 | 8,775 | 6.5% | 93.5% |
| `steady` | 15 | 31 | 5.03 | 4 | 0.0% | 0.0% | 8,163 | 6,104 | 3.2% | 96.8% |
| `steady` | 16 | 29 | 4.86 | 4 | 0.0% | 0.0% | 8,824 | 7,740 | 6.9% | 86.2% |
| `steady` | 17 | 30 | 4.80 | 4 | 0.0% | 0.0% | 9,456 | 8,062 | 3.3% | 93.3% |
| `steady` | 18 | 28 | 4.86 | 4 | 0.0% | 0.0% | 9,995 | 8,542 | 0.0% | 96.4% |
| `steady` | 19 | 26 | 4.65 | 4 | 0.0% | 0.0% | 9,780 | 6,416 | 3.8% | 92.3% |
| `steady` | 20 | 26 | 4.65 | 4 | 0.0% | 0.0% | 9,750 | 7,505 | 3.8% | 96.2% |

The player's Guild's place in the Rankings (the engine's `rankings`, every Guild in play) as each year began, by Fame:

| Year | Games | Mean place | Place 1 | Place 2 | Place 3 | Place 4 | Place 5 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 50 | 1.00 | 50 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 1 | 43 | 3.84 | 4 (9.3%) | 2 (4.7%) | 7 (16.3%) | 14 (32.6%) | 16 (37.2%) |
| 2 | 37 | 3.03 | 6 (16.2%) | 6 (16.2%) | 12 (32.4%) | 7 (18.9%) | 6 (16.2%) |
| 3 | 37 | 2.30 | 13 (35.1%) | 10 (27.0%) | 6 (16.2%) | 6 (16.2%) | 2 (5.4%) |
| 4 | 37 | 2.03 | 17 (45.9%) | 9 (24.3%) | 6 (16.2%) | 3 (8.1%) | 2 (5.4%) |
| 5 | 36 | 1.69 | 21 (58.3%) | 9 (25.0%) | 3 (8.3%) | 2 (5.6%) | 1 (2.8%) |
| 6 | 36 | 1.47 | 24 (66.7%) | 9 (25.0%) | 1 (2.8%) | 2 (5.6%) | 0 (0.0%) |
| 7 | 35 | 1.26 | 27 (77.1%) | 7 (20.0%) | 1 (2.9%) | 0 (0.0%) | 0 (0.0%) |
| 8 | 35 | 1.11 | 31 (88.6%) | 4 (11.4%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 9 | 35 | 1.11 | 31 (88.6%) | 4 (11.4%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 10 | 34 | 1.06 | 32 (94.1%) | 2 (5.9%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 11 | 34 | 1.06 | 32 (94.1%) | 2 (5.9%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 12 | 33 | 1.06 | 31 (93.9%) | 2 (6.1%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 13 | 31 | 1.06 | 29 (93.5%) | 2 (6.5%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 14 | 31 | 1.03 | 30 (96.8%) | 1 (3.2%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 15 | 31 | 1.03 | 30 (96.8%) | 1 (3.2%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 16 | 30 | 1.03 | 29 (96.7%) | 1 (3.3%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 17 | 30 | 1.00 | 30 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 18 | 28 | 1.00 | 28 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 19 | 26 | 1.00 | 26 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 20 | 26 | 1.00 | 26 (100.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| Every year | 715 | 1.49 | 547 (76.5%) | 71 (9.9%) | 36 (5.0%) | 34 (4.8%) | 27 (3.8%) |

By Wealth:

| Year | Games | Mean place | Place 1 | Place 2 | Place 3 | Place 4 | Place 5 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 50 | 2.96 | 3 (6.0%) | 14 (28.0%) | 19 (38.0%) | 10 (20.0%) | 4 (8.0%) |
| 1 | 43 | 2.35 | 13 (30.2%) | 11 (25.6%) | 12 (27.9%) | 5 (11.6%) | 2 (4.7%) |
| 2 | 37 | 1.65 | 19 (51.4%) | 13 (35.1%) | 4 (10.8%) | 1 (2.7%) | 0 (0.0%) |
| 3 | 37 | 1.41 | 27 (73.0%) | 7 (18.9%) | 1 (2.7%) | 2 (5.4%) | 0 (0.0%) |
| 4 | 37 | 1.27 | 32 (86.5%) | 1 (2.7%) | 3 (8.1%) | 1 (2.7%) | 0 (0.0%) |
| 5 | 36 | 1.11 | 33 (91.7%) | 2 (5.6%) | 1 (2.8%) | 0 (0.0%) | 0 (0.0%) |
| 6 | 36 | 1.19 | 32 (88.9%) | 2 (5.6%) | 1 (2.8%) | 1 (2.8%) | 0 (0.0%) |
| 7 | 35 | 1.11 | 32 (91.4%) | 2 (5.7%) | 1 (2.9%) | 0 (0.0%) | 0 (0.0%) |
| 8 | 35 | 1.17 | 29 (82.9%) | 6 (17.1%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 9 | 35 | 1.20 | 31 (88.6%) | 3 (8.6%) | 0 (0.0%) | 0 (0.0%) | 1 (2.9%) |
| 10 | 34 | 1.12 | 30 (88.2%) | 4 (11.8%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 11 | 34 | 1.32 | 30 (88.2%) | 1 (2.9%) | 1 (2.9%) | 0 (0.0%) | 2 (5.9%) |
| 12 | 33 | 1.21 | 28 (84.8%) | 3 (9.1%) | 2 (6.1%) | 0 (0.0%) | 0 (0.0%) |
| 13 | 31 | 1.10 | 28 (90.3%) | 3 (9.7%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| 14 | 31 | 1.13 | 28 (90.3%) | 2 (6.5%) | 1 (3.2%) | 0 (0.0%) | 0 (0.0%) |
| 15 | 31 | 1.23 | 27 (87.1%) | 3 (9.7%) | 0 (0.0%) | 0 (0.0%) | 1 (3.2%) |
| 16 | 30 | 1.27 | 26 (86.7%) | 1 (3.3%) | 2 (6.7%) | 1 (3.3%) | 0 (0.0%) |
| 17 | 30 | 1.50 | 23 (76.7%) | 2 (6.7%) | 3 (10.0%) | 1 (3.3%) | 1 (3.3%) |
| 18 | 28 | 1.46 | 22 (78.6%) | 1 (3.6%) | 3 (10.7%) | 2 (7.1%) | 0 (0.0%) |
| 19 | 26 | 1.35 | 22 (84.6%) | 1 (3.8%) | 1 (3.8%) | 2 (7.7%) | 0 (0.0%) |
| 20 | 26 | 1.35 | 22 (84.6%) | 1 (3.8%) | 2 (7.7%) | 0 (0.0%) | 1 (3.8%) |
| Every year | 715 | 1.45 | 537 (75.1%) | 83 (11.6%) | 57 (8.0%) | 26 (3.6%) | 12 (1.7%) |

Market purchases (`item.bought`), by the buying Guild:

| Market purchases | Purchases | a Guild-year | Items | Cost | Mean cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| The player's Guild | 79,200 | 117.19 | 87,329 | 2,672,160 | 34 |
| The Rivals | 10,314 | 3.86 | 10,314 | 563,235 | 55 |
| The Rivals, `ambitious` | 3,097 | 4.66 | 3,097 | 169,115 | 55 |
| The Rivals, `miserly` | 1,847 | 2.75 | 1,847 | 73,795 | 40 |
| The Rivals, `reckless` | 3,299 | 4.98 | 3,299 | 196,035 | 59 |
| The Rivals, `steady` | 2,071 | 3.09 | 2,071 | 124,290 | 60 |

Each Disposition's character: its Rivals (replacements included) and their years in play; the Quests they took (`quest.taken`) and the mean difficulty of the 502,873 of 502,873 whose difficulty the play loop read; the share failed of those resolved; Deaths (`hero.died`) and recruits (`hero.recruited`) a Guild-year; folds (`guild.folded`, retirement / bankruptcy / roster-wiped); and the Roster and Wealth at a year-start:

| Disposition | Rivals | Guild-years | Quests a Guild-year | Mean difficulty | Failed | Deaths a Guild-year | Recruits a Guild-year | Folds | Folds a Guild-year | Roster | Wealth |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `ambitious` | 184 | 664.6 | 184.7 | 43.5 | 18.8% | 0.31 | 0.10 | 136 (0 / 136 / 0) | 0.205 | 5.2 | 8,987 |
| `miserly` | 102 | 671.5 | 216.1 | 31.2 | 16.6% | 0.24 | 0.08 | 52 (0 / 52 / 0) | 0.077 | 5.3 | 8,684 |
| `reckless` | 204 | 663.0 | 174.7 | 54.6 | 24.7% | 0.43 | 0.31 | 155 (0 / 155 / 0) | 0.234 | 5.9 | 11,637 |
| `steady` | 120 | 670.0 | 177.9 | 40.7 | 19.9% | 0.30 | 0.14 | 70 (0 / 70 / 0) | 0.104 | 4.9 | 7,729 |

## Portraits (v1.1.3-S5)

Every Guildmaster who entered play, the player's and every Rival's, founding, replacing or succeeding, by their Guild's controller. A Portrait is chosen to fit a Guildmaster already drawn (DL-134 item 5), so none of these moves a play counter.

| Guildmasters | Player's | Rivals' | All |
| --- | ---: | ---: | ---: |
| Entered play | 50 | 619 | 669 |
| With a picture | 50 (100.0%) | 615 (99.4%) | 665 (99.4%) |
| With the Silhouette | 0 (0.0%) | 4 (0.6%) | 4 (0.6%) |
| Their picture's `apparentAge` holds their age | 50 (100.0%) | 599 (97.4%) | 649 (97.6%) |
| Their picture's Calling clashes with a Trait | 0 (0.0%) | 2 (0.3%) | 2 (0.3%) |

The last two are shares of those with a picture.

## Heroes described (v1.1.3-S6)

Every Hero generated, at creation, in the pool and on a new Rival's Roster. A Portrait is chosen to fit a Hero already drawn and their texts follow it (DL-135 items 3 and 6), each on a stream of its own, so none of these moves a play counter.

| Heroes | Count |
| --- | ---: |
| Generated | 198,798 |
| With a picture | 0 (0.0%) |
| With the Silhouette | 198,798 (100.0%) |
| Given a picture another Hero on a Roster or in the pool held (a repeat) | 0 (—) |
| With an empty Appearance or Biography | 0 |
| The longest Appearance written, in characters (at most 280) | 278 |
| The longest Biography written, in characters (at most 1,000) | 353 |

The save as each year ended: `serialise(document).length` in characters, its bytes while it is ASCII, over the games that reached it, and the part the Heroes' `portraitKey`, `appearance` and `biography` take:

| Year | Games | Mean MiB | Max MiB | Heroes' fields, mean MiB | Heroes' fields, max MiB | Share of the mean |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 43 | 5.47 | 6.32 | 0.03 | 0.03 | 0.5% |
| 2 | 37 | 10.93 | 12.25 | 0.03 | 0.04 | 0.3% |
| 3 | 37 | 16.49 | 18.25 | 0.03 | 0.05 | 0.2% |
| 4 | 37 | 22.16 | 24.40 | 0.03 | 0.05 | 0.2% |
| 5 | 36 | 27.92 | 31.27 | 0.04 | 0.05 | 0.1% |
| 6 | 36 | 33.64 | 37.96 | 0.04 | 0.05 | 0.1% |
| 7 | 35 | 39.30 | 44.95 | 0.04 | 0.06 | 0.1% |
| 8 | 35 | 45.00 | 52.19 | 0.04 | 0.06 | 0.1% |
| 9 | 35 | 50.69 | 59.41 | 0.04 | 0.07 | 0.1% |
| 10 | 34 | 56.60 | 66.40 | 0.05 | 0.07 | 0.1% |
| 11 | 34 | 62.37 | 72.99 | 0.05 | 0.08 | 0.1% |
| 12 | 33 | 68.35 | 79.47 | 0.05 | 0.08 | 0.1% |
| 13 | 31 | 74.42 | 85.93 | 0.05 | 0.08 | 0.1% |
| 14 | 31 | 80.32 | 92.04 | 0.06 | 0.09 | 0.1% |
| 15 | 31 | 86.22 | 98.83 | 0.06 | 0.09 | 0.1% |
| 16 | 30 | 92.15 | 106.22 | 0.06 | 0.10 | 0.1% |
| 17 | 30 | 98.04 | 113.14 | 0.06 | 0.10 | 0.1% |
| 18 | 28 | 104.21 | 119.72 | 0.07 | 0.11 | 0.1% |
| 19 | 26 | 110.25 | 126.32 | 0.07 | 0.11 | 0.1% |
| 20 | 26 | 116.16 | 132.95 | 0.07 | 0.11 | 0.1% |

The largest save at year 20: 139,409,545 characters, 132.95 MiB; gzipped, as the page keeps it in IndexedDB (DL-67): mean 15.22 MiB, max 17.52 MiB.

## Measures

| Per Turn, ms | Mean | p50 | p99 | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `advance` | 7.073 | 4.433 | 56.150 | 0.427 | 3,800.597 |
| `advance`, `seed-0002` replayed alone | 4.477 | 2.528 | 30.479 | 0.533 | 286.403 |

The last document, over the 26 games that ran the full 20 years:

| Per game | Mean | p50 | p99 | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `history.entries.length` | 238,409 | 235,317 | 268,345 | 226,576 | 268,345 |
| `serialise(document).length` | 121,799,307 | 119,723,110 | 139,409,545 | 114,832,719 | 139,409,545 |
| `serialise`, ms | 4,673.0 | 3,998.7 | 11,250.8 | 1,936.6 | 11,250.8 |
| `deserialise` (parse, migrate, validate), ms | 4,867.8 | 4,113.7 | 11,762.4 | 1,944.7 | 11,762.4 |

Against data-model §7's provisional targets (recorded, not chased: DL-08):

| Measure | Target | Measured |
| --- | --- | --- |
| Advance one Turn | under 5 ms | mean 7.073 ms, p99 56.150 ms under 16 processes' load; mean 4.477 ms, p99 30.479 ms alone (`seed-0002` replayed) |
| Fast forward a year | under 1 s | 4,835 ms (mean `advance` alone × 1,080 Turns) |
| Harness: 1,000 games of 20 years | under 10 min | 395 min (this run's wall-clock time per Turn played in 16 processes, no validation included, × 21,600 Turns × 1,000 games) |
| Save after 20 years | under 20 MiB | mean 116.16 MiB, max 132.95 MiB (the 26 games that ran 20 years) |
| Load a save | under 1 s | mean 4,868 ms, max 11,762 ms under 16 processes' load (the 26 games that ran 20 years) |

