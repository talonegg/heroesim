# M6 — Rivals

**Objective:** the other Guilds want what the player wants, and Heroes move between them
**Sessions:** 4–6 · **Depends on:** M5 · **Implements:** `plan.md` M6; R7 (dispositions), R28; approach §1 Transfer Generator; ADR-0002; requirements §5 open item on disposition names (INPUTS 7.5)
**Gate:** four named dispositions draw differently from the Board and the pool; Transfers work in both directions from the CLI; the harness reports Rivals transferring among themselves

**Status:** done — 2026-09-27 (`m6-rivals`)

## 0. What lands in M6

- `content/dispositions.json` with four entries and the rule for each.
- Transfers in and out, with the Morale cost to the Roster that stays.
- The Transfer Generator moving Heroes between Rivals as time passes.
- Rival Halls and Wealth advancing: dispositions that build and buy.
- Transfer offers as a fast-forward stop.

**Deliberately deferred:** Poaching; Rival encounters during Quests; hidden information
(R29). Rivals run the same Quest Engine as the player from M2 (ADR-0002 as amended
2026-09-25); "light" describes their choices, not their resolution.

**Inputs:** 7.5, 7.6.

## 1. Stories

### M6-S1 · Named dispositions · 1–2 sessions

`content/dispositions.json`: `steady`, `ambitious`, `miserly`, `reckless` (INPUTS 7.5), each
with weights the controller reads: `questRiskAppetite` (which difficulty band it prefers among
staffable Quests), `recruitThreshold` (Wealth multiple of Upkeep before recruiting),
`buildThreshold`, `gearThreshold`, `transferAppetite`. `rivalChoices` becomes one function
reading the weights, drawing tie-breaks from the `rivals` stream; the four are content rows,
not four code paths. Guild generation assigns dispositions round-robin so every world has all
four.

**Acceptance:**

- [x] Over 100 seeds, `reckless` Rivals take higher mean difficulty than `miserly` and lose
      more Heroes; `ambitious` builds first
- [x] A fifth disposition added to the JSON with different weights runs with no code change
      (test adds one in a fixture)
- [x] Only `rivals` advances during Rival choice

### M6-S2 · Transfers · 1–2 sessions

`transferIn(document, { guildId, heroId })`: from a Rival's Roster for `transferFee(hero,
buyingGuild)` (INPUTS 7.6; scaled by the buying Guildmaster's Negotiation, M4-S5); the Rival consents when its disposition's `transferAppetite` and its Roster size
allow (`transfer-refused` rejection otherwise). `transferOut(document, { guildId, heroId,
toGuildId })`: to a Rival that wants the Hero (same rule from the other side), the fee credited.
Both: `hero.transferred` (Milestone, payload from and to), the Hero's `partyId` must be null,
gear returns to the selling Guild, and every remaining Hero whose Regard for the transferred
Hero is `warm` or above loses `transferMoraleCost`, emitting `hero.morale-changed` only if a
band is crossed. The two Guildmasters' Regard for each other rises by
`guildmasterRegardPerTransferDeal` (R9; the third writer after M4-S5's two), emitting
`guildmaster.regard-changed` on a band crossing. Rivals use the same two functions in `rivalChoices`. A Rival wanting one of the player's
Heroes writes a row to `world.offers` (data-model §3.2) with `expiresOnTurn`; the
`transfer-offer` stop reason fires while one is pending; `acceptTransfer` / `declineTransfer`
remove it, and an expired offer is removed at night with `guild.transfer-offer-expired`.

Config: `transferFeeFactor`, `transferMoraleCost`, `transferRegardBand`,
`guildmasterRegardPerTransferDeal`.

**Acceptance:**

- [x] A Transfer out of a `close` Hero lowers the Morale of their friends and no one else's
- [x] Both directions leave the validator satisfied and the fee balanced (sum of Wealth across
      Guilds unchanged)
- [x] CLI `transfer --hero <id> --to <guildId>` and `transfer --hero <id> --in`
- [x] Fast forward stops with `transfer-offer` and the CLI shows the offer

### M6-S3 · Transfer Generator · 1 session

Night phase `transfers`, weekly: for each pair of Rivals, the `rivals` stream decides whether
the more `transferAppetite`-heavy one bids for a Hero of the other; the Transfer happens
through `transferIn` under the same consent rule. The player is never the source here (their
Heroes move only through their own `transferOut` or a `transfer-offer` they accept): the
Generator iterates over Guilds with `controller.kind === "rival"`. This is one of the three
accepted exceptions to ADR-0002 listed in `plan.md` §1.

Config: `transferGeneratorEveryDays`, `transferGeneratorChance`.

**Acceptance:**

- [x] Over 100 seeds × 20 years, Rival-to-Rival Transfers occur and the Roster-size
      distribution across Rivals stays within the generation range — `controllers/transfer-generator.test.ts`:
      `npm test` plays 4 seeds × 20 years, the 100 × 20 runs with the harness flag set (DL-59)
- [x] The player's Roster is never changed by this phase (harness assertion) — proved by an engine
      test around every run of the phase, over 100 seeds and the twenty-year sweep; the harness
      assertion itself came with the M6-close counters: `playerTransferred` in `harness/src/play.ts`,
      checked after every `advance` (DL-59, DL-69); in the M6 run, `harness/reports/m6-2026-09-27.md`
      (DL-69): 200 games × 20 years validated after every advance, 0 `hero.transferred` entries naming
      the player's Guild and 0 games the assertion stopped, beside 1,093 Transfers between Rivals, 63
      of them the Generator's, and 161 Transfer Offers for the player's Heroes, all declined

### M6-S4 · Rivals build and buy · 0.5–1 session

`rivalChoices` emits `build` and `buy` (armour first, by `gearThreshold`) actions; M5's Market
therefore has Rival demand. The `steady` test that Rivals ignore the Market is retired with a
DL.

**Acceptance:**

- [x] Rival Hall grades rise over 20 years under `ambitious`; `miserly` stays at 0 longest
- [x] Market stacks are bought by Rivals (harness counter by controller kind) — proved by
      `item.bought` by controller kind in an engine test; the harness counter itself came with
      the M6-close counters: Market purchases by buyer, by controller kind and by Disposition, in
      the report's "Rivals (M6)" (DL-58, DL-69); in the M6 run, `harness/reports/m6-2026-09-27.md`
      (DL-69): the Rivals made 24,281 Market purchases, 1.52 a Guild-year (`ambitious` 1.26, `miserly`
      1.55, `reckless` 1.81, `steady` 1.48), for 1,556,440 Wealth; the player's Guild 192.07 a Guild-year

## Measured

`npm run harness -- play.harness`, 2026-09-27, **200 seeds × up to 20 years**, validated after
every advance, config version 10, content version 14, schema version 3. Full report:
`harness/reports/m6-2026-09-27.md`; decisions DL-56 to DL-60, DL-63, DL-69, DL-71.

| Counter or measure | Result (M5 beside it) |
| --- | --- |
| Player games ended | 2 Bankruptcies in 200, `seed-0049` and `seed-0188` (none) |
| Rival folds a game | 2.88 (2.36); a Guild-year `ambitious` 0.021, `steady` 0.034, `miserly` 0.038, `reckless` 0.052 |
| The four Dispositions: mean difficulty taken; Deaths a Guild-year | `reckless` 55.1, 1.62; `ambitious` 45.1, 1.07; `steady` 41.4, 0.73; `miserly` 31.2, 0.45 |
| Rival-to-Rival Transfers | 1,093, 5.47 a game: 1,026 afternoon choices, 63 by the Transfer Generator, 4 with the seller in debt; 117 to a Guild that had sold the Hero before; mean fee 495 |
| Transfers into and out of the player's Guild | none — the policy declines every offer (161 made, all declined) and never transfers; the transfers-phase assertion never fired |
| Rival Rosters at a year-start | mean 5.94, median 5; below 4 0.3%, above 8 14.8%; `ambitious` 6.8, `reckless` 6.8, `miserly` 5.2, `steady` 4.9 |
| Rival Market purchases | 24,281, 1.52 a Guild-year (none); every `ambitious` Hall at grade 3 in every facility by year 10, `miserly` at 2.3 |
| The player's Rankings place | first by Fame at 89.5% of year-starts (mean place 2.10 in year 1, 1.07 in year 10), first by Wealth at 91.6% |
| Player Quests failed / success / strong | 14.9 / 13.7 / 71.3% (23.1 / 19.0 / 57.9%) — the Rivals now take the harder Quests |
| Rivals' Quests failed / success / strong | 12.9 / 12.0 / 75.1% (9.2 / 7.2 / 83.6%) |
| Deaths a game, player / Rivals | 34 / 77 (46 / 50) |
| Player mean Level at year 10; Wealth at year 20 | 7.60 (7.01); 190k (233k) |
| Wealth spent, the Rivals | Upkeep 98.0%, Improvements 1.3%, Items 0.3%, signing 0.3%, Transfers 0.1% |
| `advance` a Turn, one process; fast forward a year | 1.50 ms (1.08); 1.62 s (1.16 s; target 1 s) |
| Save after 20 years; load | mean 98.5 MiB, max 118.3 MiB (target 20 MB); load 4.5 s under 16 processes' load |

No validator refusal, no policy action refused, no harness assertion broken, the replay
byte-identical, all 200 saves round-trip. Left to the owner (DL-69): the two Bankruptcies; Rival
folds driven by Levels and wages outgrowing income; `transferAppetite` setting both how often a
Rival deals and whether it sells; `steady` and `miserly` sitting at 4 Heroes on idle Wealth; and
a Turn 40% slower than M5's, which M7's saves and fast forward will feel.

Verified independently on 2026-09-26 and 2026-09-27: the stories by five lenses (every box
proved; 72 mutants, the 9 survivors now killed; 14 defects fixed in DL-60) and the close by four
(the merge lost nothing; every M6 counter recounted by hand over 8 seeds × 20 years; 36 surviving
harness mutants now killed; errata in DL-71); 1,732 tests.

## 2. Configuration and events introduced

**Config:** `transferFeeFactor`, `transferMoraleCost`, `transferRegardBand`,
`guildmasterRegardPerTransferDeal`, `transferGeneratorEveryDays`, `transferGeneratorChance`;
disposition weights live in content.

**Events:** `hero.transferred` (Milestone), `guild.transfer-offered`,
`guild.transfer-offer-expired`.

**Actions:** `transferIn`, `transferOut`, `acceptTransfer`, `declineTransfer`. **Stop
reasons:** `transfer-offer`.

**Counters:** Transfers by direction and by controller kind, Rival Roster size and Wealth by
year, Rankings position of the player's Guild by year under the automatic policy.

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| Rivals strip the player's Roster with offers the policy accepts | The policy declines all offers in M6; a smarter policy is a DL after the counters are seen |
| Dispositions are four code paths in disguise | S1's fifth-disposition test is the guard |
