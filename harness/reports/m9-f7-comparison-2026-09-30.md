# M9-F7: the 50 × 20 sweep against `f22f493`'s, Day by Day, with the founding Wealth set aside

Written 2026-09-30 for M9-F7 (DL-121). The sweep itself is `m9-f7-2026-09-30.md`, run at `ba44f6e`
(`guild.founded` names the Guild's founding Wealth, DL-120 item 4; `configVersion` 12, the player's
Guildmaster 30). `f22f493`'s is M9-F6's `m9-follow-on-2026-09-30.md`, run at `4da2ee9`: nothing
between `4da2ee9` and `f22f493` changes play (DL-119 item 4: `retiresOn` is new and no phase calls
it), and `5a3966c`, this story's start, changed only documents. DL-120's Consequences ask that the
games play Day for Day as at `f22f493`, with the field set aside.

## How it was compared

- *The games.* `seed-0001` to `seed-0050`, each played 20 years by the harness's `playGame` under its
  automatic policy, `defaultConfig` and the core content, at `ba44f6e`, 16 processes, not validated.
  `f22f493`'s side is M9-F6's own Day-by-Day hashes of the same 50 games at `4da2ee9`, kept in the
  close's scratchpad (`f6sweep/head-*.json`), not played again.
- *The Days.* As M9-F6 did (DL-119 item 5): each game's History cut by Day, each Day's entries hashed
  in order and chained to the Day before (SHA-256, 16 hex digits kept), with M9-F1's `questId`s and
  the Quest's participation taken out. Here the founding Wealth is also taken out of every
  `guild.founded` before hashing, the reading of M9-F1's pinned test as M9-F7 extends it
  (`engine/src/phases/quests-conclude.test.ts`). The script is in the scratchpad (`f7sweep/daily.mts`,
  M9-F6's with that one change and a count of the foundings that name a Wealth; `compare.mjs`), not in
  the repository.

## What it found

- **Every game plays Day for Day as at `f22f493`.** All 50 seeds' chains are equal on every one of
  their 360,050 Days together; no seed differs on any Day.
- **The field is written for every Guild founded.** All 388 `guild.founded` entries of the 50 games
  name a Wealth: the 50 players' Guilds, the 200 founding Rivals, and the 138 Rivals founded in a
  folded one's place.
- **Nothing else moves.** Every type's count is equal, and so are the History's entries, 12,864,442 in
  all, every fold (138) and every Succession (37) on the same Turn, for the same Guild.
- **The sweep's report** (`m9-f7-2026-09-30.md`) is `m9-follow-on-2026-09-30.md` again but for the
  lengths and the timings: every counter, yearly table and ending is equal. The field lengthens every
  save, so `seed-0001` replays at 106,330,913 characters where `f22f493`'s was 106,330,822 (91
  characters more for its 7 foundings), and the fingerprint moves:

  | Measure | `f22f493` (`4da2ee9`) | `ba44f6e` |
  | --- | ---: | ---: |
  | Rival folds | 138 | 138 |
  | Rival Guildmasters succeeded | 37 | 37 |
  | `seed-0001`'s last save, characters | 106,330,822 | 106,330,913 |
  | Fingerprint | `978ddc75…c47741` | `b4290f09…c1a7f8` |

  The new fingerprint is `b4290f09beea05aeb668bdd5e82709f12fb8f30f8a70a91bb305adb1bfc1a7f8`.
- *Timings* are not comparable: the machine was shared, and this run took 1,023 s against M9-F6's 449 s.

## Seed by seed

| Seed | `guild.founded` | naming a Wealth | Folds | Successions | Entries | First Day that differs |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| seed-0001 | 7 | 7 | 2 | 0 | 260,738 | none: identical |
| seed-0002 | 7 | 7 | 2 | 1 | 265,142 | none: identical |
| seed-0003 | 6 | 6 | 1 | 1 | 270,009 | none: identical |
| seed-0004 | 7 | 7 | 2 | 0 | 240,536 | none: identical |
| seed-0005 | 8 | 8 | 3 | 0 | 236,375 | none: identical |
| seed-0006 | 9 | 9 | 4 | 0 | 269,116 | none: identical |
| seed-0007 | 5 | 5 | 0 | 2 | 263,614 | none: identical |
| seed-0008 | 8 | 8 | 3 | 2 | 262,310 | none: identical |
| seed-0009 | 8 | 8 | 3 | 0 | 244,652 | none: identical |
| seed-0010 | 7 | 7 | 2 | 1 | 260,933 | none: identical |
| seed-0011 | 8 | 8 | 3 | 1 | 257,279 | none: identical |
| seed-0012 | 8 | 8 | 3 | 1 | 254,572 | none: identical |
| seed-0013 | 8 | 8 | 3 | 0 | 249,389 | none: identical |
| seed-0014 | 8 | 8 | 3 | 0 | 254,520 | none: identical |
| seed-0015 | 9 | 9 | 4 | 0 | 249,221 | none: identical |
| seed-0016 | 8 | 8 | 3 | 2 | 250,174 | none: identical |
| seed-0017 | 9 | 9 | 4 | 1 | 290,399 | none: identical |
| seed-0018 | 9 | 9 | 4 | 0 | 247,645 | none: identical |
| seed-0019 | 7 | 7 | 2 | 0 | 260,536 | none: identical |
| seed-0020 | 6 | 6 | 1 | 1 | 302,653 | none: identical |
| seed-0021 | 7 | 7 | 2 | 1 | 265,002 | none: identical |
| seed-0022 | 7 | 7 | 2 | 0 | 267,642 | none: identical |
| seed-0023 | 7 | 7 | 2 | 2 | 250,001 | none: identical |
| seed-0024 | 8 | 8 | 3 | 0 | 260,640 | none: identical |
| seed-0025 | 6 | 6 | 1 | 1 | 265,983 | none: identical |
| seed-0026 | 8 | 8 | 3 | 1 | 261,520 | none: identical |
| seed-0027 | 9 | 9 | 4 | 2 | 235,438 | none: identical |
| seed-0028 | 7 | 7 | 2 | 1 | 274,197 | none: identical |
| seed-0029 | 8 | 8 | 3 | 2 | 251,371 | none: identical |
| seed-0030 | 8 | 8 | 3 | 0 | 247,918 | none: identical |
| seed-0031 | 8 | 8 | 3 | 0 | 235,118 | none: identical |
| seed-0032 | 8 | 8 | 3 | 1 | 262,243 | none: identical |
| seed-0033 | 8 | 8 | 3 | 0 | 248,017 | none: identical |
| seed-0034 | 8 | 8 | 3 | 0 | 254,135 | none: identical |
| seed-0035 | 10 | 10 | 5 | 1 | 245,286 | none: identical |
| seed-0036 | 7 | 7 | 2 | 1 | 245,640 | none: identical |
| seed-0037 | 7 | 7 | 2 | 1 | 258,672 | none: identical |
| seed-0038 | 9 | 9 | 4 | 1 | 269,236 | none: identical |
| seed-0039 | 8 | 8 | 3 | 1 | 275,900 | none: identical |
| seed-0040 | 9 | 9 | 4 | 0 | 257,323 | none: identical |
| seed-0041 | 7 | 7 | 2 | 0 | 250,499 | none: identical |
| seed-0042 | 9 | 9 | 4 | 1 | 250,265 | none: identical |
| seed-0043 | 7 | 7 | 2 | 1 | 240,310 | none: identical |
| seed-0044 | 7 | 7 | 2 | 1 | 250,615 | none: identical |
| seed-0045 | 8 | 8 | 3 | 0 | 263,242 | none: identical |
| seed-0046 | 9 | 9 | 4 | 1 | 242,869 | none: identical |
| seed-0047 | 7 | 7 | 2 | 1 | 246,719 | none: identical |
| seed-0048 | 8 | 8 | 3 | 1 | 263,888 | none: identical |
| seed-0049 | 8 | 8 | 3 | 1 | 272,635 | none: identical |
| seed-0050 | 9 | 9 | 4 | 1 | 262,305 | none: identical |
