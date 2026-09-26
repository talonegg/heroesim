# M6 — Rivals

**Objective:** the other Guilds want what the player wants, and Heroes move between them
**Sessions:** 4–6 · **Depends on:** M5 · **Implements:** `plan.md` M6; R7 (dispositions), R28; approach §1 Transfer Generator; ADR-0002; requirements §5 open item on disposition names (INPUTS 7.5)
**Gate:** four named dispositions draw differently from the Board and the pool; Transfers work in both directions from the CLI; the harness reports Rivals transferring among themselves

**Status:** not started

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

- [ ] Over 100 seeds × 20 years, Rival-to-Rival Transfers occur and the Roster-size
      distribution across Rivals stays within the generation range
- [ ] The player's Roster is never changed by this phase (harness assertion)

### M6-S4 · Rivals build and buy · 0.5–1 session

`rivalChoices` emits `build` and `buy` (armour first, by `gearThreshold`) actions; M5's Market
therefore has Rival demand. The `steady` test that Rivals ignore the Market is retired with a
DL.

**Acceptance:**

- [ ] Rival Hall grades rise over 20 years under `ambitious`; `miserly` stays at 0 longest
- [ ] Market stacks are bought by Rivals (harness counter by controller kind)

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
