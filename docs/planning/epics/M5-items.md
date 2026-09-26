# M5 — Items

**Objective:** Wealth has something to buy, and hard Quests leave something behind
**Sessions:** 6–8 · **Depends on:** M4 · **Implements:** `plan.md` M5; R30–R32; `data-model.md` §3.3; principle 2 pull 4 (Loot)
**Gate:** gear, consumables, the Market and Loot exist; from the CLI a human buys, sells, equips, and dispatches with consumables that are expended; the harness reports Wealth spent by category

**Status:** done — 2026-09-27 (`m5-items`)

## 0. What lands in M5

- Item definitions in content; the `items` (unique) and `stacks` (common) tables get rules.
- Gear slots on a Hero modifying effective Stats through the selector the check already uses.
- Consumables assigned at dispatch and expended by the Quest Engine.
- The Market: a stack holder, refreshed each morning from the `market` stream; buy and sell.
- Loot tables and Loot on strong success.
- (Hall Improvements moved to M3-S6, D8.)

**Deliberately deferred:** a trade-goods economy (R30 forbids); Rival Guilds buying Items
(their disposition ignores the Market until M6 says otherwise; the Market Engine still runs
for everyone, ADR-0002); Workers (module).

**Inputs:** 7.1–7.4.

## 1. Stories

### M5-S1 · Item definitions and holders · 1 session

`content/items.json`: `{ key, name, kind: "gear" | "consumable", unique: boolean, slot?:
"weapon" | "armour" | "trinket", statModifiers?: Record<StatKey, number>, effect?:
ConsumableEffect, buyPrice, tags }`. `ConsumableEffect` is a typed union: `reroll { kinds }`,
`bonus { flat, kinds }`, `heal { days }`. Twenty to start: nine gear (three per slot at three
grades), six consumables, five unique gear as Loot only (`buyPrice: null`).
`engine/src/items.ts`: `holdings(world, holder)` over both tables; `moveStack(world, stackId,
quantity, toHolder)` splitting and merging so one stack per (definition, holder, slot) holds
(rule in §3.3); `moveItem(world, itemId, toHolder)`.

Config: `gearSlots`.

**Acceptance:**

- [x] Moving 3 of a stack of 5 to a holder that already has 2 leaves stacks of 2 and 5
- [x] The validator's duplicate-stack check fires on a hand-built duplicate and never after
      `moveStack`
- [x] Content validation refuses gear without a slot and consumables with one

### M5-S2 · Equip and effective Stats · 1 session

`equip(document, { guildId, heroId, itemId | stackId, slot })` and `unequip`; rejections
`not-gear`, `slot-occupied`, `hero-unavailable`, `not-held-by-guild`. `effectiveStats(hero,
world, content)` selector = base + gear modifiers, used by the check and by `show hero`
(base and effective side by side). Gear on a dead or retired Hero returns to the Guild's
holding at night with `item.returned`.

**Acceptance:**

- [x] Equipping a +2 Strength weapon raises the effective Stat and not the base
- [x] The check uses effective Stats (a geared Party beats an identical bare one, variance 0)
- [x] A Hero's gear is back with the Guild the night after their Death
- [x] CLI `equip --hero <id> --item <id>` and `unequip`

### M5-S3 · Consumables at dispatch and in the check · 1–2 sessions

Dispatch accepts `consumables: [{ definitionKey, quantity }]`, moving stacks from the Guild's
holding to the Party's. The check consumes: a `bonus` consumable adds its flat bonus to the
first encounter of a matching kind and is expended; a `reroll` re-rolls the first failed
matching encounter once; a `heal` shortens an Injury taken on the Quest. Unused consumables
return to the Guild on the Party's return. Emits `item.expended`.

**Acceptance:**

- [x] A `reroll` consumable turns exactly one failure into a second roll and is gone after
- [x] Unused consumables are back with the Guild after `quest.resolved`
- [x] The Party's holdings are empty after resolution (validator: no stack held by a removed
      Party)

### M5-S4 · The Market · 1–2 sessions

Morning phase `marketRefresh` after `boardRefresh`: the Market's stacks are cleared and
`marketSize` stacks drawn from the `market` stream over non-Loot-only definitions, quantities
1–5. `buy(document, { guildId, definitionKey, quantity })` and `sell(document, { guildId,
stackId | itemId, quantity })`, at `buyPrice` and `buyPrice × sellRatio`; rejections
`not-in-market`, `insufficient-wealth`, `insufficient-quantity`. The Market is the one holder
whose stacks are not owned by a Guild. A folding Guild's unique Items (M2-S10, D6) are listed
on the Market at sell price with `item.sold`; its stacks are discarded.

Config: `marketSize`, `marketStackMin/Max`, `sellRatio`.

**Acceptance:**

- [x] Buying deducts `buyPrice × quantity` and moves the stack; selling credits at `sellRatio`
- [x] Only the `market` stream advances during refresh
- [x] CLI `show market`, `buy`, `sell`
- [x] Rivals' Wealth is unaffected by the Market in M5 (`steady` ignores it; a test asserts)

### M5-S5 · Loot · 1 session

`content/loot-tables.json`: `{ key, entries: [{ definitionKey, weight, quantityMin/Max }] }`;
Quest templates' `lootTableKey` is set for templates with `difficultyMin` above
`lootDifficultyThreshold`. On a strong success the Quest Engine draws one entry from `quests`
and awards it to the Guild's holding (a unique Item is created with a fresh id), emitting
`quest.loot` (Milestone when unique).

Config: `lootDifficultyThreshold`, `lootOnBands`.

**Acceptance:**

- [x] Loot appears only on the configured bands and only from templates with a table
- [x] A unique Loot Item exists once in `world.items` with the Guild as holder
- [x] The harness's Loot counter rises with the player's mean Quest difficulty (proved in the engine,
      `quest-engine/loot.test.ts`, DL-52; and in the M5 run, `harness/reports/m5-2026-09-26.md`, DL-62:
      the player's Loot a Quest resolved is none below difficulty 40, then 0.051 at 40 to 49 (mean
      44.7), 0.108 at 50 to 59, 0.184 at 60 to 69, 0.200 at 70 to 79, 0.364 at 80 to 89 and 0.425 at
      90 to 99 (mean 94.1))

### M5-S6 · (moved) Hall Improvements

Now M3-S6, so the infirmary and training yard are exercised in the milestones whose rules
read them (pre-M0 review D8, owner, 2026-09-26).

## Measured

`npm run harness -- play.harness`, 2026-09-26, **200 seeds × up to 20 years**, validated after
every advance, config version 8, content version 12. Full report: `harness/reports/m5-2026-09-26.md`;
decisions DL-48 to DL-52, DL-54, DL-61, DL-62.

| Counter or measure | Result (M4 beside it) |
| --- | --- |
| Player games ended | none in 200; every game ran 20 years (M4: 1 Bankruptcy) |
| Rival folds a game | 2.36 (2.24) |
| Player Quests failed / success / strong | 23.1 / 19.0 / 57.9% (37.7 / 21.2 / 41.1%) |
| Rivals' Quests failed / success / strong | 9.2 / 7.2 / 83.6% (11.7 / 8.1 / 80.2%) |
| Encounter Checks succeeding, player / Rivals | 76.9% / 90.1% (63.7% / 87.7%) |
| Deaths a game, player / Rivals | 46 / 50 (84 / 63) |
| Player mean Level at year 10; Wealth at year 20 | 7.01 (5.42); 233k (268k) |
| Wealth spent by category, the player | Upkeep 83.4%, Items 15.9%, signing 0.6%, Improvements 0.2% |
| Wealth spent by category, the Rivals | Upkeep 99.3%, Improvements 0.5%, signing 0.2%; no Items — `steady` ignores the Market until M6-S4 |
| Consumables, the player | 2.71 carried and 0.80 expended a Quest; 59.7% of Quests expend one or more |
| Loot, the player | 0.122 awards a Quest resolved: none below difficulty 40, 0.051 at 40–49 rising to 0.425 at 90–99; 533 unique Items in 200 games |
| Items sold at a fold | 227 Items, 68,100 Wealth to the Rivals folding |
| `advance` a Turn, one process; fast forward a year | 1.08 ms; 1.16 s (target 1 s) |
| Save after 20 years; load | mean 99.8 MiB, max 118.9 MiB (target 20 MB); load 4.5 s under 16 processes' load |

No validator refusal, no policy action refused, the replay byte-identical, all 200 saves
round-trip. M5 makes the player's Guild much stronger (gear, consumables and Loot); M6's
dispositions let Rivals buy from the Market too.

Verified independently on 2026-09-27: every box and the gate proved, 83 mutants (73 killed at
first, the 10 survivors now killed by new tests), and three CLI wordings fixed (`show market`
counts Items and kinds, Encounter lines are numbered, Loot reads "2 × Physician's kit"); no rule,
default or content value changed; 1,579 tests.

## 2. Configuration and events introduced

**Config:** `gearSlots`, `marketSize`, `marketStackMin/Max`, `sellRatio`,
`lootDifficultyThreshold`, `lootOnBands`.

**Events:** `item.returned`, `item.expended`, `item.bought`, `item.sold`, `quest.loot`
(Milestone when unique).

**Actions:** `equip`, `unequip`, `buy`, `sell`; `dispatch` gains `consumables`.

**Counters:** Wealth spent by category (signing, Transfer, Items, Improvements, Upkeep), Loot
awarded by table, consumables expended per Quest.

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| The automatic policy never buys, so the Market is untested by the harness | The policy gains one rule in S4: buy one armour per un-armoured Hero when Wealth allows (its build rule arrived with M3-S6). Recorded as a DL with the counters before and after |
| Item effects want a new kind of consequence every week | `ConsumableEffect` is a closed union; a new kind is an engine change and must earn its DL |
