# M3 — Progression

**Objective:** a Hero the player recruited at 19 is measurably different at 29
**Sessions:** 6–7 · **Depends on:** M2 · **Implements:** `plan.md` M3; R10, R17, R33; principle 2 (growth is the pull)
**Gate:** Heroes gain Levels toward their Potential and decline with age; `show rankings` orders Guilds by Fame and by Wealth; a Hall facility can be raised with `build`; the harness reports Levels gained, Heroes at Potential and Improvement grades reached

**Status:** not started

## 0. What lands in M3

- XP thresholds, Levels, and Class growth profiles applying Stat points on level-up.
- Potential hints as a selector.
- Ageing decline.
- Rankings selectors and the CLI `rankings` command.
- Training yard XP off-Quest.
- Hall Improvements: `build`, `content/improvements.json`, `quartersMoraleBonus` — moved here
  from M5 so the infirmary (M2) and the training yard (M3) can be exercised where their rules
  land (pre-M0 review D8).

**Deliberately deferred:** Skill growth (later module); Guildmaster Coaching affecting training
(M4 gives the Guildmaster Stats their first rules); Rankings by any other statistic.

**Inputs:** 5.1–5.5.

## 1. Stories

### M3-S1 · XP thresholds and level-up · 1–2 sessions

`engine/src/progression.ts`: `xpForLevel(level, config)` (INPUTS 5.2); night phase
`levelUps` after `questsConclude`: for each Hero whose `xp >= xpForLevel(level + 1)`, raise
`level`, apply `growthPoints` Stat points distributed by the Class's `growth` weights, each
point drawn from the `progression` stream (new in M3, D7) and skipped when the Stat is at Potential (the point is
lost, not redirected, so Potential binds), emit `hero.levelled` (Milestone, payload the Stat
deltas). Multiple level-ups in one night are allowed and emit one event each.
`content/classes.json` `growth` weights are validated to sum to 1.

Config: `xpCurveBase`, `xpCurveExponent`, `levelCap`, `growthPointsPerLevel`.

**Acceptance:**

- [x] A Hero with XP for three Levels gains three in one night with three events
- [x] No Stat exceeds Potential after 10,000 level-ups over random Heroes
- [x] Level never exceeds `levelCap`; XP still accrues past it
- [x] Upkeep rises with Level (M2's `wagePerLevel` now has an effect; test the delta)

### M3-S2 · XP sources: Quests and the training yard · 1 session

The stub's `xpPerHero` becomes `difficulty × xpPerDifficultyPoint × bandFactor` (INPUTS 5.1).
Night phase `training`: every Hero on a Roster, not injured and not in a Party, gains
`xpPerTrainingDay × hall.trainingYard` per night (grade 0 gives nothing), emitting no event
per night — `hero.xp-gained` is emitted only for Quest XP, and training XP is a nightly drift
under data-model rule 10: recomputable from the Hero's Level history and the yard's grade, and
recorded by the `hero.levelled` entry it eventually causes.

Config: `xpPerDifficultyPoint`, `xpBandFactor`, `xpPerTrainingDay`.

**Acceptance:**

- [x] A Hero idle at grade 1 for a year has gained `360 × xpPerTrainingDay` XP
- [x] An injured or away Hero gains no training XP
- [x] `history.entries` grows by zero per night from training

### M3-S3 · Potential hints · 0.5 session

`potentialHint(hero, statKey, config): "modest" | "promising" | "exceptional"` from the gap
between base and Potential (INPUTS 5.4). CLI `show hero` prints the hint beside each Stat and
still never the number.

Config: `potentialHintBands`.

**Acceptance:**

- [x] The three bands partition the gap range with no hole
- [x] `show hero` output contains hints and no Potential number (the M1 grep test extended)

### M3-S4 · Ageing decline · 1 session

Night phase `ageing`, on the Hero's entry anniversary alongside the Retirement check: past
`declineAge`, one Physical Stat drawn from `heroes` loses `declinePerYear`, emitting
`hero.declined`. Potential is untouched; a declined Stat may be re-grown by level-up.

Config: `declineAge`, `declinePerYear`, `declineAreas`.

**Acceptance:**

- [x] No decline before `declineAge`; exactly one Stat per year after it
- [x] Only Stats in `declineAreas` decline
- [ ] The harness's Levels-gained counter still rises after decline starts (growth outpaces
      decline for a young Roster) — open: needs M3-S1's `levelUps` and the M3 harness counters,
      built in parallel; closed after they merge (DL-37)

### M3-S5 · Rankings, and Fame gating signings · 1–2 sessions

`rankings(world, by: "fame" | "wealth"): { guildId, value, rank }[]` selector, ties by Guild
id. CLI `show rankings [--by wealth]`. Rank is not stored (rule 1); a `guild.rank-changed`
event is *not* emitted in M3 — a DL records that Rankings are read, not narrated, until a
front end asks.

Fame's first rule (R10 as amended, pre-M0 review B4): an Unattached Hero refuses to sign for
a Guild whose Fame is below `fameRequiredPerLevel × (hero.level − 1)`, so a Level 1 Hero
signs anywhere. `recruit` gains the
rejection `signing-refused` with the shortfall in its payload; `show pool` marks Heroes the
Guild cannot yet sign. The automatic policy and the `steady` disposition skip Heroes they
cannot sign. Rivals are gated identically (ADR-0002).

Config: `fameRequiredPerLevel`.

**Acceptance:**

- [x] Every Guild appears once, ordered, with the player's Guild not special-cased
- [x] `by: "wealth"` and `by: "fame"` differ on a fixture built to make them differ
- [x] A Guild at Fame 0 is refused by a Level 5 Hero and accepted by a Level 1 Hero with the
      default; raising Fame past the threshold flips the refusal
- [x] The harness counts signings refused by Fame per controller kind — each morning before the
      policy acts, `unsignableHeroes` for every Guild in play, by controller kind, beside the
      `signing-refused` rejections returned (`observe` in `harness/src/counters.ts`, tested in
      `counters.test.ts`; reported in `harness/reports/m3-*.md`, DL-40)

### M3-S6 · Hall Improvements · 1 session

Moved from M5 (D8). `content/improvements.json`: `{ facility, grade, cost, name }` (INPUTS
7.3). `build(document, { guildId, facility }, deps)` raises the grade by one at the next
grade's cost; rejections `max-grade`, `insufficient-wealth`. `infirmaryHealFactor` (M2-S6),
`xpPerTrainingDay` (M3-S2) and a new `quartersMoraleBonus` on the Morale baseline read the
grade. Emits `guild.improved` (Milestone). The automatic policy and the `steady` disposition
build the infirmary when Wealth exceeds three times its cost, so the harness exercises it.

Config: `quartersMoraleBonus`.

**Acceptance:**

- [x] Each facility climbs from 0 to its top grade with the right cumulative cost and refuses
      beyond
- [x] Quarters at grade 1 shift the Morale baseline by the configured amount; the yard at
      grade 1 makes an idle Hero gain XP; the infirmary at grade 1 shortens a new Injury — the
      yard end to end: `build --facility training-yard`, then five idle Days, every Roster Hero
      gains `xpPerTrainingDay` a night and a twin at grade 0 none (`cli/src/commands/build.test.ts`,
      DL-40)
- [x] CLI `build --facility infirmary`

## 2. Configuration and events introduced

**Config:** `xpCurveBase`, `xpCurveExponent`, `levelCap`, `growthPointsPerLevel`,
`xpPerDifficultyPoint`, `xpBandFactor`, `xpPerTrainingDay`, `potentialHintBands`, `declineAge`,
`declinePerYear`, `declineAreas`, `fameRequiredPerLevel`, `quartersMoraleBonus`.

**Events:** `hero.levelled` (Milestone), `hero.declined`, `guild.improved` (Milestone).

**Counters:** Levels gained per Guild-year, Heroes with any Stat at Potential after 10 years,
mean Level of the player's Roster by year, Retirements by age band, signings refused by Fame
per controller kind, Improvement grades reached by year 10 per controller kind.

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| Rivals' Heroes never level because `steady` takes easy Quests | The counter is per Guild; if Rival Levels stay flat, `steady`'s Quest choice is widened in M6, not here |
| The XP curve makes Level 20 unreachable or trivial in 20 years | The harness reports mean Level by year; the curve is two config numbers |
