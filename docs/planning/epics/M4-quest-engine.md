# M4 — Quest Engine

**Objective:** a Quest's outcome depends on who was sent, together, with what they know
**Sessions:** 7–9 · **Depends on:** M3 · **Implements:** `plan.md` M4; R8 (Guildmaster Stats in Guild-side actions), R19, R21 (requirements), R24, R26; approach §1 "target: a sequence of typed encounters"
**Gate:** the stub is gone; a Quest resolves as a sequence of typed encounters whose checks read Stats, Skills, Relationship and Synergies; the harness reports encounter outcomes by check type

**Status:** not started

## 0. What lands in M4

- Encounter templates in content; each Quest instance carries a drawn encounter sequence.
- The check: Party capability against encounter difficulty, with Skills, Synergies and
  Relationship as modifiers, rolled from the `quests` stream.
- Consequences typed per encounter outcome; the Quest outcome aggregated from them.
- Regard between Heroes, and Relationship as a selector.
- Quest requirements (Class, Skill) enforced at dispatch.
- Guildmaster Stats' first rules: Negotiation on reward, Inspiration on Morale, Coaching on
  training, Influence on Patron Regard, Judgement on Potential hints; and Guildmaster
  Traits' effects (R8), generated since M1 with `effect: null`.
- Patron Regard for Guilds, and the Board weighting R22 asks for.

**Deliberately deferred:** Items in checks (M5); Rival encounters during Quests; the afternoon
phase reporting mid-Quest progress to the player (encounters resolve when the Party returns,
in one night, so a Quest is still a report and not a serial).

**Inputs:** 6.1–6.5.

## 1. Stories

### M4-S1 · Encounter templates and the drawn sequence · 1–2 sessions

`content/encounters.json`: `{ key, name, kind: "combat" | "travel" | "social" | "arcane" |
"stealth", demands: [StatKey, weight][], aggregate: "best" | "sum", skillKeys: SkillKey[],
difficultyFactor, consequences: { success: Consequence[], failure: Consequence[] } }` where
`Consequence` is a typed union: `injury { typeKey, chance, count }`, `death { chance }`,
`morale { delta }`, `regard { between: "party", delta }`, `xp { factor }`, `wealth { factor }`,
`fame { delta }`. Quest templates gain `encounterKinds: EncounterKind[]` and
`encountersMin/Max` (INPUTS 6.1). At Quest generation the sequence is drawn from the `encounters`
stream (new in M4, D7, so the Board a seed produces is unchanged by M4) and stored on the Quest row as `encounterKeys: string[]`, so the player could in
principle be told what kind of work it is.

**Acceptance:**

- [x] Content validation refuses an encounter naming an unknown Stat, Skill or injury type
- [x] Every generated Quest's `encounterKeys` are within its template's kinds and count
- [x] Twelve encounters ship, at least two per kind

### M4-S2 · The check · 2 sessions

`engine/src/quest-engine/check.ts`: `capability(party heroes, encounter, content, config)` =
aggregate of weighted effective Stats (`best` takes the best Hero per Stat, `sum` sums) plus
`skillBonus × max Skill rating held by any member` for each of the encounter's Skills plus
Synergy bonuses (S3), times the teamwork scalar (S4); `roll = capability × (1 ± variance)`
from `quests`; success when `roll >= encounter.difficultyFactor × quest.difficulty`; margin
recorded. `resolveQuest` becomes: for each encounter in order, check, apply consequences to a
working copy of the outcome, a `death` consequence removes the Hero from the rest of the
sequence; the Quest's band is derived from the count of successes (`all` strong, `majority`
success, else failure) so M2's Wealth and Fame rules still apply. Emits one
`quest.encounter` event per encounter (payload: key, kind, roll, target, outcome) before
`quest.resolved`. The stub file is deleted; `stubBands`/`stubVariance` leave the config with a
DL naming their successors.

Config: `checkVariance`, `skillBonusPerRating`, `bandBySuccessShare`.

**Acceptance:**

- [x] A Party lacking the encounter's Skills is beaten by one holding them at rating 3 on the
      same Stats, with variance 0
- [x] A Hero killed in encounter 2 contributes nothing to encounter 3
- [x] `quest.encounter` events arrive in sequence order with the Quest's Turn
- [x] The harness's M2 counters still report; `quest.resolved` bands are still produced

### M4-S3 · Synergies · 1 session

`content/synergies.json`: `{ key, name, requires: { classes?: Record<ClassKey, count>,
skills?: SkillKey[] }, bonus: { flat?: number, factor?: number }, kinds?: EncounterKind[] }`
(INPUTS 6.4). `synergiesFor(party heroes, content)` selector; applied in the check; emits
nothing per encounter but `quest.resolved` payload lists the Synergy keys that applied.

**Acceptance:**

- [ ] A Party matching a Synergy's requirement scores the bonus; one member short scores none
- [ ] A Synergy restricted to `kinds` applies only to those encounters
- [ ] `show party` (new CLI subcommand, before dispatch: `preview --heroes`) lists the
      Synergies a proposed Party would have

### M4-S4 · Regard between Heroes and Relationship · 1–2 sessions

`RegardEntry` maps on Heroes get their first writer: after a Quest, every pair in the Party
gains `regardPerSharedQuest` (more on success), emitted as `hero.regard-changed` only when the
value crosses a band (`hostile`, `cool`, `neutral`, `warm`, `close`) so the History is not
flooded. `relationship(a, b, world)` = the mean of the two Regards, clamped.
`teamwork(party, world, config)` = scalar over the mean pairwise Relationship (INPUTS 6.3).
Night `heroState` gains Regard decay toward neutral at `regardDecayPerYear` for pairs who have
not shared a Quest that year.

Config: `regardPerSharedQuest`, `regardOnSuccessBonus`, `regardBands`, `regardDecayPerYear`,
`teamworkRange`.

**Acceptance:**

- [ ] Two Heroes after ten shared successful Quests are `close`; the event fired at each band
      crossing and not otherwise
- [ ] `relationship` is symmetric and never stored (no field; test by grep of the type)
- [ ] A `close` Party out-scores a `hostile` one on identical Stats with variance 0

### M4-S5 · Requirements, Patron Regard, and the Guildmaster's Stats and Traits · 2 sessions

Dispatch's `requirement-unmet` rejection, made since M2-S4, gains a reason (`class`, `skill`,
`party-size`), and `preview` reports which a proposed Party would fail (E6). Patrons hold Regard for each Guild: +1 per success on their
Quest, −2 per failure, −1 when their offer expires untaken by anyone; Board refresh weights
Patrons by their mean Regard across Guilds, closing M2-S3's simplification. At night a
Patron's Regard for each Guild recovers toward neutral by `patronRegardRecoveryPerYear`
(the Patron State Engine of approach §1; a drift under data-model rule 10, so it emits only
on a band crossing), so a bad year with a Patron is not permanent. The Guildmaster's
Stats get one rule each, all Guild-side (R8):

| Stat | Rule | Config |
| --- | --- | --- |
| Negotiation | reward × (1 ± `negotiationRange` across the Stat range) at dispatch; signing fees and Transfer fees × (1 ∓ the same), applied inside the `signingFee` (M2-S8) and `transferFee` (M6-S2) selectors so every caller, the automatic policy included, pays the same price (R8: recruitment) | `negotiationRange` |
| Inspiration | Morale drift baseline shifted by up to `inspirationMoraleShift` | `inspirationMoraleShift` |
| Coaching | training XP × (1 + up to `coachingFactor`) | `coachingFactor` |
| Influence | Patron Regard gains × (1 + up to `influenceFactor`) | `influenceFactor` |
| Judgement | Potential hint bands narrowed by up to `judgementHintSharpening` | `judgementHintSharpening` |

Emits `patron.regard-changed` on band crossings.

Guildmaster Traits get their effects (R8; generated in M1-S6 with `effect: null`). `traits.json`
rows with `owner: "guildmaster"` carry one effect from a closed union: `classStatBonus
{ classKey, statKey, delta }` applied in `effectiveStats` for Heroes of that Class on this
Guild; `guildMoraleShift { delta }` on the Morale baseline; `upkeepFactor { factor }` in the
`upkeep` selector. Six starter Traits, three buffs and three penalties (INPUTS 3.13). A new
effect kind is an engine change and earns a DL.

Guildmaster Regard (R9) gets its writers, with no first-build reader (owner, pre-M0 review B3):
for a Patron, `guildmasterRegardOnPatronSuccess` / `OnPatronFailure` when one of their Quests
resolves; for a Hero on the Roster, `guildmasterRegardOnHeroSuccess` / `OnHeroFailure` per
Quest outcome band; for a Rival Guildmaster, written in M6-S2 on Transfer deals. Regard for a
Guild is a selector over Regard for its Guildmaster, never stored (rule 1). Band crossings emit
`guildmaster.regard-changed` (data-model rule 10). Rival Guildmasters accrue Regard the same
way (ADR-0002). Because nothing reads these values in the first build, the M4 harness reports
the band distribution of the player's Guildmaster's Regard at year 10 so their scale can be
judged before a module depends on it. CLI `show guildmaster` lists Stats, Traits and Regard
by band.

**Acceptance:**

- [x] Each Guildmaster Regard writer has one test; a Patron whose Quests always fail ends in a
      lower band than one whose always succeed
- [x] `show guildmaster` prints Regard as bands, never as numbers, for Patrons, Heroes and
      (from M6) Rival Guildmasters

- [x] Each Trait effect kind has one test showing its effect through the selector it lives in
      and no effect elsewhere; a Rival Guildmaster's Trait affects the Rival's Heroes the same way
- [x] A Quest requiring a Healer rejects a Party without one, naming `class`
- [x] A Patron whose Quests always fail offers fewer over a year than one whose succeed
      (harness fixture, 50 seeds)
- [x] A Patron left at `cool` with no further dealings returns to `neutral` within
      `1 / patronRegardRecoveryPerYear` years, emitting one `patron.regard-changed`
- [x] Each Guildmaster Stat has one test at the bottom and top of its range showing the effect
      and no other

## 2. Configuration and events introduced

**Config:** `checkVariance`, `skillBonusPerRating`, `bandBySuccessShare`,
`regardPerSharedQuest`, `regardOnSuccessBonus`, `regardBands`, `regardDecayPerYear`,
`teamworkRange`, `negotiationRange`, `inspirationMoraleShift`, `coachingFactor`,
`influenceFactor`, `judgementHintSharpening`, `patronRegardOnSuccess/Failure/Expiry`,
`guildmasterRegardOnPatronSuccess/Failure`, `guildmasterRegardOnHeroSuccess/Failure`,
`patronRegardRecoveryPerYear`.

**Events:** `quest.encounter`, `hero.regard-changed`, `patron.regard-changed`,
`guildmaster.regard-changed`.

**Counters:** encounter outcomes by kind and by outcome, Synergies applied per Quest, Injuries
by type, Relationship band distribution within the player's Roster at year 10, Patrons silent
(no offer in a year).

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| Encounter chains make every hard Quest lethal | `death.chance` is per consequence; the harness's deaths counter has an M2 baseline to compare to, and the pass is a DL |
| Regard maps grow quadratically with Heroes met | Only Party members gain Regard for each other; a Roster of 8 over 20 years is a few hundred entries. Measured in S4's harness run |
| Guildmaster rules creep into fighting | Each rule is in a Guild-side phase or action, never in `check.ts`; a lint test greps `check.ts` for `guildmaster` |
