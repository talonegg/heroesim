# Heroesim — World State data model

The shape of the World State document: its sections, its tables, the rules they keep and what the
validator refuses. The types in [`engine/src/document.ts`](../engine/src/document.ts) are the
truth, and `document.test.ts` holds this page's field lists (§2 to §4 and the §8 sketch) to them.
Vocabulary is [`../CONTEXT.md`](../CONTEXT.md). The decisions hard to reverse are ADR-0004 (a save
is a snapshot with its History inside), ADR-0008 as amended by ADR-0011 (the per-Turn copy) and
ADR-0009 (named random streams).

## 1. The document

One JSON document, three top-level sections with different lifecycles:

| Section | Lifecycle | Holds |
| --- | --- | --- |
| `meta` | Written at creation; `rebase` rewrites `config` and `configVersion` (§2), and a migration step, when the chain has one, `version` (§6) | schema version, seed, content set id and version, the configuration in force and the version of the defaults it was taken from, creation timestamp supplied by the caller |
| `world` | Copied by `copyWorld` once per Turn and once per Guild's action or list of actions, then mutated; its write-once rows frozen and shared, not copied (ADR-0011) | every table, the Board, random stream states, id counters, Module slices, the current Turn, the game's Ending once it falls |
| `history` | Append-only, shared by reference across Turns, never copied | entries and their indexes |

`advance(document, deps)` copies `world`, mutates the copy, appends to `history`, and returns a
new document sharing `meta` and `history` with the old one; `applyAction` does the same for one
Guild's action, and `applyActions` for a Guild's list of actions on one copy (DL-238). `rebase`
copies nothing: it returns a new `meta` with the same `world` and `history` (§2). The copy
(`copyWorld`) equals `structuredClone`'s, so the save is the same to the byte; how it freezes and
shares the write-once rows is ADR-0011's. `deps` is what play takes, `{ config, content, modules? }`
([`approach.md`](./approach.md) §3). The History is the one deliberate exception to "state in, new
state out": the old document sees new entries too, and only the engine's `append` touches it
(ADR-0008).

## 2. `meta`

```
version:        integer          schema version of this document
seed:           string           master seed the world was created from
content:        { id, version }  the content set the world was created under
configVersion:  integer          the version of the defaults `config` was taken from
config:         GameConfig       every tunable, as it was at creation or the last `rebase`
createdAt:      string           supplied by the caller, never read by rules: the clock from
                                 a front end, a fixed value from the harness so two runs of a
                                 seed compare byte for byte
```

`meta.config` holds the game's own rules. Only `rebase` rewrites it, to the current
`defaultConfig`, and `meta.configVersion`, to the current `configVersion`, appending a
`world.rules-adopted` Milestone with both versions: tuning reaches a game when the player chooses,
and the History says when (pre-M0 review D1, DL-84). No rule reads `meta.config`; play reads
`deps.config`, which `playDeps` makes from it (rule 5, [`approach.md`](./approach.md) §3). No
config migration exists. The defaults, `configVersion` and its changelog are data,
`engine/src/config.json`, changed only through the content editor's config kind
([`agents/config.md`](./agents/config.md), DL-204).

Content has no `rebase`: a content change reaches a saved game when it is loaded (pre-M0 review
D3), and no rule reads `meta.content`, which names the content set the game was created under.
Planned: on load, a content version other than `meta.content`'s is shown, a
`world.content-changed` Milestone appended and `meta.content` updated ([`plan.md`](./plan.md) §3,
DL-84 item 5).

## 3. `world`

### 3.1 Time, randomness, identity

```
turn:      integer                     absolute Turn index from 0
rng:       Record<StreamName, State>   one seeded generator per component (ADR-0009)
counters:  Record<TableName, integer>  next id number per table
ended:     { turn, reason } | null     set once, when the player-controlled Guild's ending
                                       is reached (an accepted exception to ADR-0002,
                                       listed there); advance on an ended world is a no-op
```

Day and time of day are derived: `day = floor(turn / 3)`, `timeOfDay = turn % 3` (morning,
afternoon, night). A Year is `config.turnsPerYear` Turns, a multiple of 3 so that no Day straddles
two Years (DL-210). Turn, Day and Year count from 0 in the save and in every rule; only the words
count from 1 ([`agents/ui-text.md`](./agents/ui-text.md), Dates).

Streams are named per drawing component, so that adding one never shifts another's draws
(ADR-0009). A stream is seeded from the master seed and its name. A new draw inside a component uses
that component's stream and shifts only its later draws; a new component gets a new stream and never
shares an old one; a Module that draws random numbers registers a stream of its own (Random Events
among them, so `events` is not a core stream). The core's streams, in the order of a new world's
`rng` keys (`streamNames`, `engine/src/rng.ts`):

| Stream | What draws from it | Decided |
| --- | --- | --- |
| `generation` | The world's creation: its Guilds, Heroes and Patrons, and the deals at creation; a Rival replacement and a Succession | ADR-0009, DL-28, DL-102 |
| `board` | The Quests the Board offers | Pre-M0 review D7 |
| `quests` | The Quest Engine's resolutions, Loot among them | D7, DL-84 |
| `encounters` | Each Quest's Encounter sequence, apart from the Board's draws | D7, DL-42 |
| `pool` | The Unattached pool's refill | D7 |
| `heroes` | The Hero State Engine: Retirement checks and ageing's Decline | D7, DL-84 |
| `progression` | The growth points of a Level gained | D7, DL-36 |
| `rivals` | The Rival controllers' Dispositions, and the Transfer Generator, an accepted exception | D7, DL-30, DL-84 |
| `market` | The Market's morning refresh | D7, DL-51 |
| `gm-portraits` | A Guildmaster's Portrait: one draw for each entering play, whatever is chosen | DL-125, DL-134, DL-135 |
| `descriptions` | A Guildmaster's descriptive Attributes: fifteen draws each, whatever is written | DL-125 |
| `hero-portraits` | A Hero's Portrait: one draw for each Hero generated | DL-134 item 2, DL-135 |
| `hero-descriptions` | A Hero's Appearance and Biography: thirteen draws each, whatever is written | DL-135 item 6 |

The last four are accepted exceptions too: each generates part of a Guildmaster or a Hero apart from
`generation` and `pool`, and takes a fixed number of draws, so a choice or a text moves no later
draw; the four stand last in `streamNames`, so they move no other stream's draws. A Hero's pictures
and words are two streams, so that pictures added later move no Hero's text, and apart from the
Guildmasters', so that neither role's draws move the other's.

An id is a table's prefix and a counter zero-padded to six digits, `hero-000042` or `quest-001337`,
so string order is numeric order. The validator refuses a counter past 999,999 or not above every
id in use. An id is never reused: a dead Hero's stays valid in the History. In TypeScript each
table's id is a branded string type, so the compiler keeps a `GuildId` out of a `HeroId` parameter
at no runtime cost.

### 3.2 Tables

Every table is a plain object keyed by id. A row refers to another by id only and never embeds it.
Display order comes from selectors, except in the ordered lists of ids: a Roster and the Board.

**guilds**
```
id, name, backgroundKey, foundedTurn
guildmasterId
rosterIds:      HeroId[]                    ordered
wealth, fame
belowFloorSince: turn | null                set while Wealth is below the Bankruptcy floor
foldedOnTurn:   turn | null                 a Rival that reached an ending; out of play and out of
                                            Rankings, its Roster released to the pool (DL-28)
hall:           Record<FacilityKey, grade>  infirmary, trainingYard, quarters
controller:     { kind: "player" } | { kind: "rival", disposition: DispositionKey }
regard:         Record<EntityId, RegardEntry>  reserved: nothing writes or reads it, a Guild's
                                            opinion being its Guildmaster's (DL-43 item 3, DL-84)
```
Upkeep is computed from the Roster and the Hall, not stored.

**guildmasters**
```
id, name, sex, guildId                      a retired Guildmaster keeps their guildId
enteredTurn, ageAtEntry
stats:          Record<StatKey, number>
traits:         TraitKey[]                  Guildmaster Traits, none excluding another (DL-150)
birthplace, appearance, biography: string   the descriptive Attributes, which no rule reads: the
                                            player's at setup, trimmed, at most 60, 280 and 1,000
                                            characters (`descriptiveAttributeMaxLength`); each left
                                            blank written on `descriptions` as they enter play
                                            (DL-102, DL-132)
portraitKey:    string | null               the Guildmaster picture their Portrait shows: the
                                            player's choice at setup, else chosen on `gm-portraits`
                                            as they enter play (`choosePortrait`; CONTEXT.md,
                                            Portrait); null for the Silhouette (DL-135, DL-144)
retiredOnTurn:  integer | null              set when the Guildmaster retired and was succeeded; no
                                            Guild in play names them then (DL-100 item 3, DL-102)
regard:         Record<EntityId, RegardEntry>
```

**heroes**
```
id, name, sex, backgroundKey, classKey
enteredTurn, ageAtEntry                     age now: ageAtEntry plus the whole years completed
                                            since enteredTurn (`ageOf`, DL-21 item 9, DL-86)
guildId:        GuildId | null              their Guild, kept by a dead or retired Hero; null in
                                            the Unattached pool or once gone from it
unattachedSince: integer | null             the Turn the Hero last entered the Unattached pool; null
                                            on a Roster and once they have left the pool (DL-27)
leftPoolOnTurn: integer | null              set when the Hero left the pool unrecruited and an entry
                                            kept their row (rule 8): out of play, in no pool
partyId:        PartyId | null
stats:          Record<StatKey, number>     base values only
potential:      Record<StatKey, number>     hidden ceiling per Stat; stored plainly, the UI hides it
skills:         Record<SkillKey, 1..5>      absent means the Hero does not have the Skill
traits:         TraitKey[]                  Hero Traits, none excluding another (DL-150); one an
                                            Injury leaves replaces any it conflicts with, and one
                                            earned on a Quest joins it (`hero.trait-gained`)
xp, level
injury:         { typeKey, healsOnTurn } | null
morale:         number
diedOnTurn:     integer | null
retiredOnTurn:  integer | null
transferredOnTurn: integer | null           the Turn of the Hero's last Transfer; null if never. No
                                            Transfer moves them within transferLockDays of it (DL-60)
portraitKey:    string | null               the Hero picture their Portrait shows, of their sex and
                                            Class, chosen on `hero-portraits` as they are generated
                                            (`choosePortrait`; CONTEXT.md, Portrait); null for the
                                            Silhouette (DL-135)
appearance, biography: string               the descriptive Attributes, which no rule reads and the
                                            player never edits: written on `hero-descriptions` as
                                            they are generated, at most 280 and 1,000 characters
                                            (DL-135 item 6). A Hero has no Birthplace
regard:         Record<EntityId, RegardEntry>
```
A Hero's Gear is not on the Hero: it is the Items, a Unique Item or a stack of one, that the Hero
holds in a slot (§3.3).

**patrons**
```
id, name, sphereKey
sex:            "female" | "male" | null    the sex that came with the Patron's name (DL-125
                                            item 5); null kept for a Patron that is a body
regard:         Record<EntityId, RegardEntry>
```
A Patron's Quest templates are looked up by `sphereKey` in content at draw time, never
stored (rule 1), so a content change reaches every Patron without a migration. A Patron's
Regard is for Guilds, keyed by Guild id; a Guildmaster's is for Patrons, Heroes and other
Guildmasters, and their Regard for a Guild is read through its Guildmaster, never stored
(DL-43). A Hero's is for other Heroes, keyed by their id (DL-46).

**quests**
```
id, templateKey, patronId
difficulty, tags, reward, fameEffect
durationTurns:  integer                     durationDays × 3, from the template's range
skillKeys:      SkillKey[]                  copied from the template; read by no rule, each Check
                                            reading its own Skills (DL-248)
encounterKeys:  EncounterKey[]              one or more, drawn at generation in the order met,
                                            weighted by the tags each shares with the template,
                                            the last the template's Finale when it names one
                                            (DL-160, DL-248)
requirements:   { partySizeMin, partySizeMax, classKey?, skillKey? }   copied from the template
lootTableKey:   string | null               the template's, copied at generation when its difficultyMin is
                                            above lootDifficultyThreshold, else null (DL-52)
status:         "offered" | "taken" | "resolved"
offeredOnTurn, expiresOnTurn
partyIds:       PartyId[]                   at most one (`maxPartiesPerQuest`); several Guilds'
                                            Parties on one Quest is a candidate (plan.md §3, DL-89)
```
The Board is `world.board: QuestId[]`, ordered, holding the offered Quests. The fields copied from
the template at generation make a Quest row self-contained: a template may change under a live
save without altering Quests already offered, and no content migration is needed.

**parties**
```
id, questId, guildId
heroIds:        HeroId[]
departedOnTurn
returnsOnTurn:  integer                     always a night Turn: the night of
                                            dayOf(departedOnTurn) + durationDays; the Quest
                                            resolves in that night phase and the Heroes are
                                            free from the next morning
```
A Party's Consumables are the stacks it holds (§3.3). `quest.partyIds` and `party.questId` must
agree; the validator checks it.

**offers**
```
id, kind: "transfer"
fromGuildId, toGuildId, heroId
fee
offeredOnTurn, expiresOnTurn
```
A pending Transfer Offer. Its Hero is on `fromGuildId`'s Roster; rule 8 says when its row goes,
and the History keeps its record.

**RegardEntry**, wherever a `regard` map appears:
```
{ value: number, since: turn, reason: string }   reason is a content key, an event type, or the
                                                 id of the Module whose Effect set it (DL-77)
```
Absence means neutral. Relationship is computed from two lookups and never stored.

### 3.3 Items: unique rows and common stacks

Common Items (tools, potions, ordinary Gear) are not individuals: they have a quantity and may
be held in several places at once. Unique Items (magical, special, Campaign) are individuals
with exactly one holder. The row carries its holder in both cases; nothing else records it.

**items** (unique)
```
id, definitionKey
holder:         { kind: "hero", id, slot } | { kind: "guild", id } | { kind: "party", id } | { kind: "market" }
```

**stacks** (common)
```
id, definitionKey
quantity:       integer                     at least 1; an emptied stack is removed
holder:         { kind: "hero", id, slot } | { kind: "guild", id } | { kind: "party", id } | { kind: "market" }
```
One stack per (definition, holder, slot); the validator refuses duplicates. What a holder has is a
filter over both tables (`holdings`, `items.ts`); an index is cached only if the harness shows it
slow (rule 1). Both tables share one holder type: the Market holds a folded Guild's Unique Items as
well as stacks (pre-M0 review D6, DL-48). A Hero's `slot` is one of the engine's `gearSlotKeys`,
and a slot holds one Item at most: one Unique Item or one stack of 1. `engine/src/items.ts` moves
Items between holders and keeps these rules. The Market's stacks are replaced each morning from the
`market` stream; a Unique Item it lists stays until a Guild buys it (DL-51).

### 3.4 Module slices

```
modules:  Record<ModuleId, unknown>
```
The core copies each slice with `world` and never reads inside it. A Module owns its slice's
validation and migration, keeps its own version there if it needs one, and keeps its own tunables
there, which are not `GameConfig` fields (DL-78). A Module that draws keeps its stream in `rng`
under its own name (§3.1). An installed Module's slice and stream are made when the world is
created or, for a save made before it was installed, the first time it is played; a slice no
installed Module owns is kept, never read, and warned of (DL-76).

At its Hooks a Module sees `world` read-only, by whatever route it reads, and changes its own slice
in place. It changes a core table only through its Effects (`adjustMorale`, `adjustWealth`,
`adjustRegard`, `injure`, `offerQuest`), each run by the core's own rule and explained by the
core's own event naming the Module, so the core stays the only writer of its rows. A Regard Effect,
like the core's own Regard changes, emits only on a band crossing, the entry naming the Module as
its reason. A Module's own events, typed `<module id>.<what-happened>`, are History entries like
any other (DL-77). Every event a Hook is handed is the History's frozen copy, and what a Hook is
given works only for that call (DL-80).

The document holds slices, not a list of the Modules installed: whoever plays it installs them for
each run or command (`HEROESIM_MODULES`, [`environment.md`](./environment.md); the CLI's
`--modules`; the page's `?modules=`), and only the test-only probe ships. A front end gives a
Module's event one generic sentence naming the Module, the type and whom it concerns (DL-79).
Decided and not built: a game's Modules chosen at creation, on by default, and recorded in `meta`,
a save made before then adopting a Module only by an explicit action (DL-82, with Random Events,
[`plan.md`](./plan.md) §3); and a Module's Regard Effect always emitting (DL-84).

## 4. `history`

```
entries:     Entry[]                        position is the sequence number
byEntity:    Record<EntityId, integer[]>    ascending positions
byType:      Record<EventType, integer[]>   ascending positions
milestones:  integer[]                      ascending positions
```

An entry is the engine's event plus where it sits in time:
```
{ turn, type, participants: EntityId[], labels: Record<EntityId, string>,
  milestone: boolean, payload: <typed per event type; ids only, never entity copies> }
```

`emit` completes an event from the World State (`emit.ts`); `append`, the History's only writer,
checks the entry's type, participants and Turn, and indexes it (`history.ts`):

- Entries arrive in Turn order, so a Turn range is a binary search on `entries` (`entriesBetween`).
- `participants` lists every entity the event touches, with the Guild of any Hero involved, so a
  Guild's index already holds its Heroes' Quests, Injuries and Transfers.
- `labels` holds the display name, at emission, of each participant that has one (a Guild,
  Guildmaster, Hero or Patron), so an entry narrates without a lookup that could fail once a row
  is removed.
- Some types require a payload field, which the validator holds (`entry-field-missing`, DL-246):
  a Guild's founding names its Wealth; an entry caused by a Quest's return names the Quest
  (`questCauses`); an Encounter names its Degree, the Check that decided it and the Checks rolled.
- Appending costs one push to `entries` plus one integer per participant, one per type, and one
  for a Milestone.

The History's readers are `entriesFor` (an entity's entries, newest first, paged),
`entriesBetween` (a Turn range), `count` (a type's length in `byType`), `names` (whether an entry
names an entity, which `record` reads for rule 8), and `returnOf` and `nightsReturnOf`, which name
a Quest's return and the entries of its night (DL-242); the Retirement check reads a Hero's
entries from `byEntity` (`hero-state.ts`). The harness
reads its counters through `byType`, or observes them in play
([`harness/README.md`](../harness/README.md)).

## 5. Rules

1. **Store base values only.** Tables hold what cannot be recomputed: Fame, Wealth, XP,
   Level, Morale, Regard, Injury, base Stats. Effective Stats, Relationship, Rankings, age,
   Upkeep and availability are selectors. A selector is cached only once the harness shows it
   slow, and never in the document (the Best Party, DL-237).
2. **Copy `world` once per Turn**, and once per Guild's action or list of actions; mutate the copy;
   share `meta` and `history`, which `rebase` alone replaces with a new `meta` (ADR-0011, DL-238).
3. **History is append-only** and only the engine's `append` touches it (ADR-0008).
4. **Named random streams**, one per component that draws (ADR-0009).
5. **Unknown keys are kept.** A Stat, Class or Item key the current content does not define
   survives a load; rules ignore it; the validator warns. A missing Stat reads as the
   content's default. The same holds for `meta.config`: a field the current `GameConfig`
   lacks is kept and ignored, and a field the save lacks reads as the current default (§2).
6. **JSON-safe values only**: no `Map`, `Set`, `Date`, class instances, functions, symbols,
   bigints, `undefined`, `NaN`, `Infinity`, negative zero, cycles or array holes anywhere in the
   document (`json-safe.ts`), so `structuredClone` and `JSON.stringify` agree.
7. **Canonical serialisation**: sorted keys, so the same state always produces the same bytes
   and the harness can check determinism by byte equality.
8. **Row lifecycle.** A Quest's row is removed when it expires, resolves or is abandoned by a
   folding Guild; a Party's when it comes home or its Guild folds; a Transfer Offer's when it is
   answered or withdrawn (its night passed, its Hero gone from the Roster, a Guild folded); a
   stack's when it empties, the Market's at each Market refresh, and a folding Guild's when it is
   discarded. The History keeps their records; unique Items, Patrons, Guilds and Guildmasters keep
   their rows. Dead and retired Heroes keep their rows, with their State. A Hero leaves the
   Unattached pool `unattachedStayDays` after the Day they entered it (`unattachedSince`); their row
   is removed once the Turn's events are in, unless an entry names them, before their leaving or
   after it in the same Turn (a Module's `onNight`). Then their row stays, out of play with
   `leftPoolOnTurn` set, and their `hero.left-pool` is recorded (DL-27, DL-214). One reading of the
   Turn's events, `record`, decides both, so the row and the History never disagree (DL-211). A save
   made before DL-211 holds a `hero.generated` and a `hero.left-pool` for every pool Hero; the
   validator accepts a Hero's row removed that only these passive entries name, and refuses one any
   other entry names (`removed-hero-in-history`).
9. **Hidden information is stored plainly.** Potential is a field the front end does not show.
10. **Discrete changes are entries; nightly drift is not** ([principle 11](./principles.md),
    [R36](./requirements.md)). A Quest outcome, an Injury, a Level, a Transfer, a purchase each
    appends an entry. Morale drifting toward its baseline and Regard decaying are rules of the
    config applied at night, recomputable from the entries that bound them, and append an entry
    only when a value crosses a band; training XP is recorded by the Level it brings. Two discrete
    changes also append only on a band crossing: a Regard change by the core's own rules (DL-43
    item 2) and the Morale cost a Transfer lays on the Heroes who stay (DL-57 item 4). The pool's
    comings and goings of a Hero no entry names are emitted, for the Turn's log, the pool's stop
    and the harness, and never appended (`record`, DL-211). No entry is ever dropped.

## 6. Versioning and the validator

A new document's `meta.version` is the engine's `schemaVersion`. On load, the migration chain
brings an older document forward, one step per version; where no chain leads from its version, the
load is refused, naming both versions. The chain is empty (`migrations`, `serialise.ts`), so a save
of any older schema is refused, and a front end says an older Heroesim saved it (DL-125 item 10.2,
DL-130, DL-135 item 7, DL-193). Then each installed Module migrates its own slice, reading its
version from inside it (DL-76); then the validator runs; then the game's config is checked
([`approach.md`](./approach.md) §3).

The hand-written validator runs on every load and, in tests, after every `advance`. It never
runs per Turn in play. Each check is named as the code names it (`refusalChecks`,
`warningChecks`, `validate.ts`).

**Refused** (the document is not played):

| Check | What it refuses |
| --- | --- |
| `document-shape` | A section, row or entry missing a field or holding one of the wrong kind; a holder's kind, or a `sex` other than `"female"` or `"male"` (a Patron's may be `null`, DL-133); a Quest with no Encounter (DL-248) |
| `json-safe` | A value rule 6 forbids |
| `id-format`, `counter-range` | An id not of the form `<table>-<six digits>`; a counter past 999,999 or not above every id in use |
| `dangling-reference` | An id naming no row of its table |
| `hero-on-two-rosters`, `hero-in-two-parties`, `roster-guild-mismatch`, `party-member-mismatch` | A Hero on two Rosters or in two Parties; a Roster and a Hero's `guildId`, or a Party and a Hero's `partyId`, that disagree |
| `unattached-mismatch` | A Hero with a Guild and `unattachedSince` or `leftPoolOnTurn` set; one with no Guild both in the pool and gone from play, or neither |
| `guildmaster-guild-mismatch`, `retired-guildmaster-in-office` | A Guildmaster whose `guildId` is not the Guild that names them; a Guild in play naming a retired Guildmaster (DL-102) |
| `folded-guild-in-play` | A folded Guild with a Hero on its Roster or a Party of its own (DL-28) |
| `departed-hero-in-play` | A Hero out of play on a Roster, in a Party or with a `partyId`: their row is frozen (ADR-0011) |
| `quest-party-mismatch`, `too-many-parties` | `quest.partyIds` and `party.questId` disagree; more Parties on a Quest than `maxPartiesPerQuest` |
| `duplicate-stack`, `empty-stack`, `gear-slot-overfull` | Two stacks of one definition, holder and slot; a stack below 1; a Hero's slot holding more than one Item (DL-48) |
| `offer-hero-not-on-roster`, `offer-expired` | A Transfer Offer whose Hero is not on `fromGuildId`'s Roster, or whose `expiresOnTurn` is past |
| `history-position-out-of-range`, `history-index-mismatch`, `history-turn-order` | An index position outside `entries`; an index that disagrees with the entries; an entry out of Turn order or after `world.turn` |
| `removed-hero-in-history` | A Hero's row removed while an entry other than the passive two names them (rule 8) |
| `entry-field-missing` | An entry lacking a field its type requires (§4, DL-246) |
| `module-slice` | A slice its installed Module refuses, or cannot migrate or read (DL-76) |

**Warned** (the key is kept and ignored, rule 5, and the load goes on):

| Check | What it warns of |
| --- | --- |
| `unknown-stat`, `unknown-class`, `unknown-skill`, `unknown-background`, `unknown-sphere`, `unknown-item`, `unknown-template`, `unknown-injury`, `unknown-disposition`, `unknown-encounter`, `unknown-loot-table` | A Stat, Class, Skill, Background, Sphere, Item, Quest template, Injury type, Disposition, Encounter or Loot table key that content does not define |
| `unknown-trait` | A Guildmaster's Trait that is no Guildmaster Trait content defines, or a Hero's that is no Hero Trait |
| `unknown-portrait` | A Guildmaster's Portrait that is no Guildmaster picture content lists, or a Hero's that is no Hero picture (DL-125 item 3) |
| `unknown-slot` | An Item a Hero holds in a slot that is no gear slot (`gearSlotKeys`, DL-48) |
| `excluded-traits` | Two Traits one person holds, one excluding the other (DL-150) |
| `misplaced-item` | An Item in a Hero's slot that is not Gear for that slot (DL-48) |
| `portrait-of-another-sex` | A `portraitKey` naming a picture of the other sex (DL-130) |
| `unknown-module` | A slice no installed Module owns (DL-76) |

A refused document names the failed check and the offending id or path; nothing is repaired.

## 7. Performance targets

The targets a release is held to are the lines of the harness's Gate,
[`harness/gate.json`](../harness/gate.json), changed only with a DL entry (DL-188); the harness's
report reads them from there and names each measure. Its save line measures the save gzipped, as
the page keeps it, with no guard on the uncompressed size (DL-188).

The History dominates save size. Its levers are lean entries (ids and labels, never entity copies),
rule 10 (drift is no entry), not recording the pool's comings and goings of a Hero never hired
(DL-211), and compression on write: the page's saves are gzipped (DL-67); the CLI's are planned
([`plan.md`](./plan.md) §3), and the harness's sample (`harness:sample`) is to be too (DL-84
item 2). Archiving or dropping old entries is no lever: R36 forbids it,
and no schema change is made for a leaner entry (DL-84). For the cost of a Turn, the write-once
rows (dead, retired and gone Heroes, retired Guildmasters, folded Guilds) stay in their tables,
frozen and shared by the copy, so the saved shape is unchanged (ADR-0011). A browser's
`localStorage` holds about 5 MiB per origin, so the page saves to IndexedDB.

## 8. Type sketch

The interfaces of `document.ts`, abridged; `document.test.ts` holds each table's row type and the
`World`, `History` and `WorldDocument` fields to this sketch.

```ts
type HeroId = string & { readonly __brand: "HeroId" };   // one per table

interface WorldDocument {
  meta: Meta;
  world: World;
  history: History;
}

interface World {
  turn: number;
  rng: Record<StreamName, RngState>;
  counters: Record<TableName, number>;
  ended: { turn: number; reason: EndingReason } | null;
  guilds: Record<GuildId, Guild>;
  guildmasters: Record<GuildmasterId, Guildmaster>;
  heroes: Record<HeroId, Hero>;
  patrons: Record<PatronId, Patron>;
  quests: Record<QuestId, Quest>;
  parties: Record<PartyId, Party>;
  items: Record<ItemId, UniqueItem>;
  stacks: Record<StackId, Stack>;
  board: QuestId[];
  offers: Record<OfferId, TransferOffer>;
  modules: Record<ModuleId, unknown>;
}

interface History {
  entries: Entry[];
  byEntity: Record<EntityId, number[]>;
  byType: Record<EventType, number[]>;
  milestones: number[];
}
```
