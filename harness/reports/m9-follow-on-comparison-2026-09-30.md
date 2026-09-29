# M9 follow-on: the 50 × 20 sweep against `d476deb`'s, Day by Day

Written 2026-09-30 for M9-F6 (DL-119). The sweep itself is `m9-follow-on-2026-09-30.md`, run at
`4da2ee9` (`configVersion` 12, the player's Guildmaster 30); `d476deb`'s is
`m9-answers-2026-09-29.md` (DL-110: `34636bfd…d11b`, 134 Rival folds). This report says where each
seed's game first differs from `d476deb`'s, and why.

## How it was compared

- *The games.* `seed-0001` to `seed-0050`, each played 20 years by the harness's `playGame` under its
  automatic policy, `defaultConfig` and the core content: once at `4da2ee9`, and once at `d476deb` in
  a temporary worktree (since removed). `d476deb` and `86c7afa` hold the same `engine/`, `content/`
  and `harness/`, so `d476deb`'s games are the follow-on's starting point. 16 processes at each
  commit; not validated.
- *The Days.* Each game's History was cut by Day, and each Day's entries hashed in order, chained
  to the Day before (SHA-256, 16 hex digits kept). Before hashing, M9-F1's additions were taken out
  of every entry: the `questId` on `hero.morale-changed`, `patron.regard-changed`,
  `guildmaster.regard-changed` and `hero.regard-changed`, and the Quest as a participant (and its
  label) on those and on `hero.xp-gained`. That is the M9-F1 test's own reading of "nothing else
  moves" (`phases/quests-conclude.test.ts`), applied to whole games.
- *A seed's first difference* is the first Day whose chained hash differs. The script is in the
  close's scratchpad (`f6sweep/daily.mts`, `compare.mjs`), not in the repository.

## What it found

- **Every difference is explained.** 19 seeds hold no Succession, and their Histories are the same
  entry for entry, all 20 years, once M9-F1's `questId`s are taken out. The other 31 each first
  differ on the Day of their first Succession, and on no Day before it. No seed differs anywhere
  else.
- **The Guildmasters' ages.** Nothing in play reads an age but Retirement (DL-113 item 6), and the
  age is drawn by the same draw whatever its range (DL-114 item 4). So:
  - the player's Guildmaster at 30 (every seed) changes no Turn, since no one at 30 retires within
    20 years;
  - a Rival's founder drawn at 21 to 41 retires after the twentieth year, and changes nothing;
  - a founder drawn at 42 to 50 reaches 61 inside the twenty years and is succeeded on the night
    `retirementTurn` gives, unless the Rival folded first. There were 59 such founders of the 200
    (29.5%, DL-113's "about 30%"): 35 were succeeded and 24 folded first.
  - Two Rivals founded later in a fold's place drew 50 (Turn 3,629) and 48 (Turn 7,259), and were
    succeeded too. That makes 37 Successions in 31 seeds, all at 61; 6 seeds had two.
- **The Rivals kept, and lost, by them.** A successor draws new Traits and starts with Regard
  neutral (DL-102), so each game from its first Succession on is another game. Every fold before a
  seed's first Succession is the same fold on the same Turn. After it, 19 seeds' folds differ in
  Guild or Turn: 9 seeds' counts, the rest a fold moved or another Rival folding in its place. In
  all, 138 Rival folds where `d476deb` had 134; of the 37 Rivals succeeded, 13 folded later in the
  game, where 10 of the same Guilds folded at `d476deb`.
- **The new `questId`s.** They change no draw and no count: no Day of the 19 unchanged seeds
  differs once they are taken out. They lengthen every save, which is why `seed-0001`, a seed with
  no Succession, replays at 106,330,822 characters where `d476deb`'s was 103,734,506, and why the
  fingerprint moves in every seed: `978ddc75…c47741` against `34636bfd…d11b`.
- **Anything else.** Nothing: the counters that move (below) move in the 31 changed seeds, after
  their first Succession. Their History totals 12,864,442 entries where `d476deb`'s totals
  12,863,738 (257,289 a game against 257,275).

## The History's counts by type, the 50 games

Only the types whose count moved; every other type is equal.

| Type | `d476deb` | `4da2ee9` | Change |
| --- | ---: | ---: | ---: |
| `guild.founded` | 384 | 388 | +4 |
| `guildmaster.generated` | 384 | 388 | +4 |
| `hero.generated` | 292,587 | 292,607 | +20 |
| `quest.offered` | 1,328,627 | 1,328,555 | -72 |
| `quest.taken` | 1,153,763 | 1,153,723 | -40 |
| `hero.recruited` | 5,380 | 5,376 | -4 |
| `guild.improved` | 2,934 | 2,955 | +21 |
| `item.bought` | 200,333 | 200,590 | +257 |
| `item.equipped` | 23,113 | 23,139 | +26 |
| `quest.encounter` | 3,375,480 | 3,374,325 | -1,155 |
| `quest.resolved` | 1,152,901 | 1,152,810 | -91 |
| `hero.xp-gained` | 1,888,914 | 1,887,325 | -1,589 |
| `hero.morale-changed` | 1,818,228 | 1,819,650 | +1,422 |
| `hero.injured` | 61,925 | 61,954 | +29 |
| `quest.expired` | 174,564 | 174,532 | -32 |
| `quest.loot` | 127,001 | 126,975 | -26 |
| `hero.levelled` | 40,388 | 40,362 | -26 |
| `guild.upkeep-paid` | 179,598 | 179,586 | -12 |
| `hero.regard-changed` | 144,473 | 143,969 | -504 |
| `hero.healed` | 61,895 | 61,928 | +33 |
| `hero.left-pool` | 285,201 | 285,237 | +36 |
| `patron.regard-changed` | 229,868 | 230,269 | +401 |
| `item.expended` | 245,625 | 245,931 | +306 |
| `guildmaster.regard-changed` | 39,535 | 41,264 | +1,729 |
| `guild.below-floor` | 843 | 868 | +25 |
| `guild.floor-recovered` | 706 | 726 | +20 |
| `hero.died` | 5,479 | 5,422 | -57 |
| `item.returned` | 18,677 | 18,577 | -100 |
| `hero.declined` | 3,082 | 3,104 | +22 |
| `guild.transfer-offered` | 46 | 43 | -3 |
| `guild.transfer-offer-declined` | 46 | 43 | -3 |
| `hero.transferred` | 282 | 275 | -7 |
| `hero.left-guild` | 570 | 601 | +31 |
| `guild.folded` | 134 | 138 | +4 |
| `hero.retired` | 27 | 26 | -1 |
| `item.sold` | 95 | 94 | -1 |
| `guildmaster.succeeded` | 0 | 37 | +37 |

`guildmaster.succeeded` is the Successions. `guildmaster.regard-changed` rises most: a successor's
Regard starts neutral and crosses bands again. `guild.founded` and `guildmaster.generated` rise by
the 4 more folds' replacements.

## Seed by seed

| Seed | Successions (Turn, Day, Rival) | First Day that differs | Folds, `d476deb` | Folds, now | Entries, `d476deb` | Entries, now |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| seed-0001 | — | none: identical | 2 | 2 | 260,738 | 260,738 |
| seed-0002 | Turn 15,122 (Day 5,040), guild-000005 | Day 5,040 | 1 | 2 | 265,302 | 265,142 |
| seed-0003 | Turn 20,522 (Day 6,840), guild-000004 | Day 6,840 | 1 | 1 | 269,988 | 270,009 |
| seed-0004 | — | none: identical | 2 | 2 | 240,536 | 240,536 |
| seed-0005 | — | none: identical | 3 | 3 | 236,375 | 236,375 |
| seed-0006 | — | none: identical | 4 | 4 | 269,116 | 269,116 |
| seed-0007 | Turn 14,042 (Day 4,680), guild-000002; Turn 14,042 (Day 4,680), guild-000004 | Day 4,680 | 1 | 0 | 265,748 | 263,614 |
| seed-0008 | Turn 14,042 (Day 4,680), guild-000003; Turn 15,509 (Day 5,169), guild-000006 | Day 4,680 | 3 | 3 | 265,023 | 262,310 |
| seed-0009 | — | none: identical | 3 | 3 | 244,652 | 244,652 |
| seed-0010 | Turn 20,522 (Day 6,840), guild-000004 | Day 6,840 | 2 | 2 | 260,489 | 260,933 |
| seed-0011 | Turn 15,122 (Day 5,040), guild-000005 | Day 5,040 | 3 | 3 | 257,551 | 257,279 |
| seed-0012 | Turn 18,362 (Day 6,120), guild-000004 | Day 6,120 | 3 | 3 | 254,991 | 254,572 |
| seed-0013 | — | none: identical | 3 | 3 | 249,389 | 249,389 |
| seed-0014 | — | none: identical | 3 | 3 | 254,520 | 254,520 |
| seed-0015 | — | none: identical | 4 | 4 | 249,221 | 249,221 |
| seed-0016 | Turn 16,202 (Day 5,400), guild-000002; Turn 17,282 (Day 5,760), guild-000005 | Day 5,400 | 2 | 3 | 254,682 | 250,174 |
| seed-0017 | Turn 21,299 (Day 7,099), guild-000006 | Day 7,099 | 4 | 4 | 290,277 | 290,399 |
| seed-0018 | — | none: identical | 4 | 4 | 247,645 | 247,645 |
| seed-0019 | — | none: identical | 2 | 2 | 260,536 | 260,536 |
| seed-0020 | Turn 12,962 (Day 4,320), guild-000002 | Day 4,320 | 1 | 1 | 279,363 | 302,653 |
| seed-0021 | Turn 11,882 (Day 3,960), guild-000002 | Day 3,960 | 2 | 2 | 275,387 | 265,002 |
| seed-0022 | — | none: identical | 2 | 2 | 267,642 | 267,642 |
| seed-0023 | Turn 14,042 (Day 4,680), guild-000004; Turn 19,442 (Day 6,480), guild-000005 | Day 4,680 | 3 | 2 | 256,049 | 250,001 |
| seed-0024 | — | none: identical | 3 | 3 | 260,640 | 260,640 |
| seed-0025 | Turn 18,362 (Day 6,120), guild-000003 | Day 6,120 | 1 | 1 | 264,962 | 265,983 |
| seed-0026 | Turn 16,202 (Day 5,400), guild-000002 | Day 5,400 | 2 | 3 | 266,112 | 261,520 |
| seed-0027 | Turn 15,122 (Day 5,040), guild-000005; Turn 16,202 (Day 5,400), guild-000002 | Day 5,040 | 4 | 4 | 237,387 | 235,438 |
| seed-0028 | Turn 19,442 (Day 6,480), guild-000002 | Day 6,480 | 2 | 2 | 274,097 | 274,197 |
| seed-0029 | Turn 11,882 (Day 3,960), guild-000003; Turn 19,442 (Day 6,480), guild-000004 | Day 3,960 | 2 | 3 | 247,455 | 251,371 |
| seed-0030 | — | none: identical | 3 | 3 | 247,918 | 247,918 |
| seed-0031 | — | none: identical | 3 | 3 | 235,118 | 235,118 |
| seed-0032 | Turn 16,202 (Day 5,400), guild-000004 | Day 5,400 | 3 | 3 | 261,348 | 262,243 |
| seed-0033 | — | none: identical | 3 | 3 | 248,017 | 248,017 |
| seed-0034 | — | none: identical | 3 | 3 | 254,135 | 254,135 |
| seed-0035 | Turn 12,962 (Day 4,320), guild-000003 | Day 4,320 | 4 | 5 | 246,360 | 245,286 |
| seed-0036 | Turn 18,362 (Day 6,120), guild-000005 | Day 6,120 | 2 | 2 | 245,099 | 245,640 |
| seed-0037 | Turn 15,122 (Day 5,040), guild-000003 | Day 5,040 | 3 | 2 | 257,598 | 258,672 |
| seed-0038 | Turn 12,962 (Day 4,320), guild-000002 | Day 4,320 | 4 | 4 | 272,407 | 269,236 |
| seed-0039 | Turn 18,362 (Day 6,120), guild-000002 | Day 6,120 | 3 | 3 | 273,434 | 275,900 |
| seed-0040 | — | none: identical | 4 | 4 | 257,323 | 257,323 |
| seed-0041 | — | none: identical | 2 | 2 | 250,499 | 250,499 |
| seed-0042 | Turn 11,882 (Day 3,960), guild-000002 | Day 3,960 | 2 | 4 | 246,654 | 250,265 |
| seed-0043 | Turn 14,042 (Day 4,680), guild-000003 | Day 4,680 | 2 | 2 | 236,111 | 240,310 |
| seed-0044 | Turn 17,282 (Day 5,760), guild-000005 | Day 5,760 | 2 | 2 | 252,258 | 250,615 |
| seed-0045 | — | none: identical | 3 | 3 | 263,242 | 263,242 |
| seed-0046 | Turn 16,202 (Day 5,400), guild-000005 | Day 5,400 | 4 | 4 | 243,700 | 242,869 |
| seed-0047 | Turn 18,362 (Day 6,120), guild-000005 | Day 6,120 | 2 | 2 | 244,986 | 246,719 |
| seed-0048 | Turn 16,202 (Day 5,400), guild-000004 | Day 5,400 | 3 | 3 | 266,071 | 263,888 |
| seed-0049 | Turn 19,442 (Day 6,480), guild-000002 | Day 6,480 | 3 | 3 | 272,263 | 272,635 |
| seed-0050 | Turn 15,122 (Day 5,040), guild-000003 | Day 5,040 | 4 | 4 | 263,324 | 262,305 |

The machine was shared: the sweep's and these runs' timings are not comparable with DL-110's.
