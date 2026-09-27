# Heroesim v2 — World State data model

The shape of the World State document, settled 2026-09-25 after three rounds of questioning.
The TypeScript types in `engine/` are the truth once they exist; this document records the
sections, the tables, the rules, and what the validator refuses. Vocabulary is
[`../CONTEXT.md`](../CONTEXT.md). Decisions hard to reverse are ADR-0008 and ADR-0009.

## 1. The document

One JSON document, three top-level sections with different lifecycles:

| Section | Lifecycle | Holds |
| --- | --- | --- |
| `meta` | Written at creation; changed only by the `rebase` action, which rewrites `config` | schema version, seed, content set id and version, the configuration in force, creation timestamp supplied by the caller |
| `world` | Copied once per Turn with `structuredClone`, then mutated | every table, the Board, random stream states, id counters, module slices, the current Turn |
| `history` | Append-only, shared by reference across Turns, never copied | entries and their indexes |

`advance(document, deps)` clones `world`, mutates the clone, appends to `history`, and
returns a new document that shares `meta` and `history` with the old one. `deps` is
`{ config, content, modules }`, the same object every engine entry point takes (approach §3). The History is the
one deliberate exception to "state in, new state out": the previous reference sees new entries
too, and nothing but the engine's append function may touch it (ADR-0008).

## 2. `meta`

```
version:        integer          schema version of this document
seed:           string           master seed the world was created from
content:        { id, version }  the content set the world was created under
config:         GameConfig       every tunable, as it was at creation
createdAt:      string           supplied by the caller, never read by rules: the clock from
                                 a front end, a fixed value from the harness so two runs of a
                                 seed compare byte for byte
```

Rules read `deps.config`, never `meta.config` directly. A front end passes `meta.config` as
`deps.config`, so a loaded game continues under the rules it was started with; the `rebase`
action rewrites `meta.config` to the current `defaultConfig` and appends a
`world.rules-adopted` Milestone carrying the old and new `configVersion`, so tuning reaches a
game when the player chooses and the History records when. The harness passes its own
configuration as `deps.config` and never rebases. A front end builds `deps.config` as
`{ ...defaultConfig, ...meta.config }`: a field the save has keeps its value, a field it
predates reads as the current default, a field the current `GameConfig` lacks is ignored
(rule 5). No config migration exists; `rebase` is the only thing that rewrites `meta.config`
(pre-M0 review D3). `configVersion` is a field of `GameConfig`,
bumped in the decision log whenever a default changes (owner, 2026-09-25, pre-M0 review D1).

## 3. `world`

### 3.1 Time, randomness, identity

```
turn:      integer                     absolute Turn index from 0
rng:       Record<StreamName, State>   one seeded generator per subsystem (ADR-0009)
counters:  Record<TableName, integer>  next id number per table
ended:     { turn, reason } | null     set once, when the player-controlled Guild's ending
                                       is reached (an accepted exception to ADR-0002,
                                       plan.md §1); advance on an ended world is a no-op
```

Day and time of day are derived: `day = floor(turn / 3)`, `timeOfDay = turn % 3` (morning,
afternoon, night). Years use `config.turnsPerYear`, whose default is 1,080 (360 Days), a
configuration default and not a decision.

Streams are named per drawing subsystem so that adding a subsystem never shifts another's
draws: `generation`, `board`, `quests`, `encounters`, `pool`, `heroes` (the Hero State
Engine), `progression`, `rivals`, `market`, each added in the milestone that introduces its
subsystem (ADR-0009 as amended 2026-09-26). A stream is seeded from the master seed and its
name. A new subsystem gets a new stream and never shares an old one. A module that draws
random numbers registers a stream of its own.

Ids are strings with a table prefix and a counter zero-padded to six digits in every table:
`hero-000042`, `guild-000002`, `quest-001337`, so that string order is numeric order for the
life of any plausible game (a 20-year game uses about 43,000 Quest ids); the validator refuses
a counter past 999,999. They are never reused; a dead Hero's id stays valid in the History. In
TypeScript each table's id is a branded string type, so the compiler keeps a `GuildId` out of
a `HeroId` parameter at no runtime cost.

### 3.2 Tables

Every table is a plain object keyed by id. Rows reference other rows by id only; no row
embeds another. Ordering for display comes from selectors, except where a row holds an
ordered list of ids (a Roster, the Board).

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
regard:         Record<EntityId, RegardEntry>
```
Upkeep is computed from the Roster and the Hall, not stored.

**guildmasters**
```
id, name, sex, guildId
enteredTurn, ageAtEntry
stats:          Record<StatKey, number>
traits:         TraitKey[]
regard:         Record<EntityId, RegardEntry>
```

**heroes**
```
id, name, sex, backgroundKey, classKey
enteredTurn, ageAtEntry                     age now = ageAtEntry + (turn - enteredTurn) / turnsPerYear
guildId:        GuildId | null              null means on no Roster: Unattached, or gone from the pool
unattachedSince: integer | null             the Turn the Hero last entered the Unattached pool; null
                                            on a Roster and once they have left the pool (DL-27)
leftPoolOnTurn: integer | null              set when the Hero left the pool unrecruited and an entry
                                            kept their row (rule 8): out of play, in no pool
partyId:        PartyId | null
stats:          Record<StatKey, number>     base values only
potential:      Record<StatKey, number>     hidden ceiling per Stat; stored plainly, the UI hides it
skills:         Record<SkillKey, 1..5>      absent means the Hero does not have the Skill
traits:         TraitKey[]
xp, level
injury:         { typeKey, healsOnTurn } | null
morale:         number
diedOnTurn:     integer | null
retiredOnTurn:  integer | null
transferredOnTurn: integer | null           the Turn of the Hero's last Transfer; null if never. No
                                            Transfer moves them within transferLockDays of it (DL-60)
regard:         Record<EntityId, RegardEntry>
```
A Hero's gear is not on the Hero: it is the Items, unique or a stack of one, whose holder is this Hero in a slot (3.3).

**patrons**
```
id, name, sphereKey
regard:         Record<EntityId, RegardEntry>
```
A Patron's Quest templates are looked up by `sphereKey` in content at draw time, never
stored (rule 1), so a content change reaches every Patron without a migration. A Patron's
Regard is for Guilds, keyed by Guild id; a Guildmaster's is for Patrons, Heroes and other
Guildmasters, and their Regard for a Guild is read through its Guildmaster, never stored
(M4-S5, DL-43).

**quests**
```
id, templateKey, patronId
difficulty, tags, reward, fameEffect
durationTurns:  integer                     durationDays × 3, from the template's range
demands:        [StatKey, weight][]         copied from the template at generation
skillKeys:      SkillKey[]                  copied from the template at generation
encounterKeys:  string[]                    drawn at generation (M4); empty before
requirements:   { partySizeMin, partySizeMax, classKey?, skillKey? }   copied from the template
lootTableKey:   string | null               the template's, copied at generation when its difficultyMin is
                                            above lootDifficultyThreshold, else null (M5-S5, DL-52)
status:         "offered" | "taken" | "resolved"
offeredOnTurn, expiresOnTurn
partyIds:       PartyId[]                   first build: at most one; later, at most one per Guild
```
The Board is `world.board: QuestId[]`, ordered, holding the offered Quests. A Quest row is
removed when it expires or resolves; the History keeps its record. The fields copied from
the template at generation make a Quest row self-contained: a template may change under a
live save without altering Quests already offered, and no content migration is needed.

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
A Party's consumables are the stacks whose holder is this Party (3.3). `quest.partyIds` and
`party.questId` must agree; the validator checks it.

**offers**
```
id, kind: "transfer"
fromGuildId, toGuildId, heroId
fee
offeredOnTurn, expiresOnTurn
```
A pending Transfer offer (M6). The Hero must be on `fromGuildId`'s Roster; an offer is removed
when accepted, declined or expired, and the History keeps its record. Other offer kinds may
join the union later.

**RegardEntry**, wherever a `regard` map appears:
```
{ value: number, since: turn, reason: string }   reason is a content key, an event type, or the
                                                 id of the module whose effect set it (M8-S2)
```
Absence means neutral. Relationship is computed from two lookups and never stored.

### 3.3 Items: unique rows and common stacks

Common Items (tools, potions, ordinary gear) are not individuals: they have a quantity and may
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
One stack per (definition, holder, slot); the validator refuses duplicates. "What is Brenna
carrying" is a filter over both tables; cache an index only if the harness shows it slow. Both
tables share one holder type: the Market holds a folded Guild's unique Items as well as stacks
(pre-M0 review D6, DL-48). A Hero's `slot` is one of `config.gearSlots`, and a slot holds one
Item at most: one unique Item or one stack of 1. `engine/src/items.ts` moves Items between
holders and keeps these rules. The Market's stacks are replaced each morning from the `market`
stream; a unique Item it lists stays until a Guild buys it (M5-S4, DL-51).

### 3.4 Module slices

```
modules:  Record<ModuleId, unknown>
```
The core clones the slice with the rest of `world` and never reads inside it. A module owns
validation and migration of its slice and stores its own version there if it needs one. A
module that draws keeps its stream in `rng` under a name of its own (§3.1). An installed
module's slice and stream are made when the world is created or, for a save made before the
module was installed, the first time it is played; a slice no installed module owns is kept,
never read, and warned of (M8-S1, DL-76).

At its hooks a module sees `world` read-only, in the types and at run time, and changes its own
slice in place. It changes a core table only through its effects (`adjustMorale`, `adjustWealth`,
`adjustRegard`, `injure`, `offerQuest`), each run by the core's own rule and explained by the
core's own event naming the module, so the core stays the only writer of its rows. Its own events,
typed `<module id>.<what-happened>` by the module and not by the engine's union, are History
entries like any other (M8-S2, DL-77).

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

Rules the engine's append function enforces:

- Entries arrive in Turn order, so a Turn range is a binary search on `entries`.
- `participants` lists every entity the event touches, including the Guild of any Hero
  involved, so a Guild's index already holds its Heroes' Quests, Injuries and Transfers.
- `labels` carries the display name of each participant at emission, so an entry narrates
  without a lookup that could fail after a row is removed.
- Appending costs one push to `entries` plus one integer per participant, one per type, and
  one if the entry is a Milestone.

A Hero's page is `byEntity[heroId]` sliced from the end and mapped to entries. Newest-first
paging is a slice with an offset. The harness's counters are the lengths of `byType`.

## 5. Rules

1. **Store base values only.** Tables hold what cannot be recomputed: Fame, Wealth, XP,
   Level, Morale, Regard, Injury, base Stats. Effective Stats, Relationship, Rankings, age,
   Upkeep and availability are selectors. No selector is cached until the harness shows it slow.
2. **Copy `world` once per Turn**, mutate the copy, share `meta` and `history`.
3. **History is append-only** and only the engine's append function touches it (ADR-0008).
4. **Named random streams**, one per subsystem (ADR-0009).
5. **Unknown keys are kept.** A Stat, Class or Item key the current content does not define
   survives a load; rules ignore it; the validator warns. A missing Stat reads as the
   content's default. The same holds for `meta.config`: a field the current `GameConfig`
   lacks is kept and ignored, and a field the save lacks reads as the current default (§2).
6. **JSON-safe values only**: no `Map`, `Set`, `Date`, class instances, `undefined`, `NaN` or
   `Infinity` anywhere in the document, so `structuredClone` and `JSON.stringify` agree.
7. **Canonical serialisation**: sorted keys, so the same state always produces the same bytes
   and the harness can check determinism by byte equality.
8. **Row lifecycle**: a Quest is removed when it expires or resolves; an Unattached Hero is
   removed when they leave the pool unrecruited unless a History entry *other than* their own
   `hero.generated` and `hero.left-pool` names them — those two entries every pool Hero has,
   and their labels narrate without the row; dead and retired Heroes stay, with their State.
   A Hero leaves the pool `unattachedStayDays` after the Day they entered it
   (`unattachedSince`); one whose row an entry keeps stays with `leftPoolOnTurn` set, out of
   play and out of the pool (DL-27).
   The validator knows the list of passive entry types and refuses a removal that a
   non-passive entry contradicts.
9. **Hidden information is stored plainly.** Potential is a field the front end does not show.
10. **Discrete changes are events; nightly drift is not.** A Quest outcome, an Injury, a Level,
    a Transfer, a purchase: each appends an entry. Morale drifting toward its baseline,
    training XP accruing, Regard decaying: each is a rule of `meta.config` applied at night,
    recomputable from the entries that bound it, and appends an entry only when the value
    crosses a band. No entry is ever dropped (R36, principle 11).

## 6. Versioning and the validator

`meta.version` is set from the first save. On load: if a migration chain exists from the
document's version to the current one, it runs, forward only, one step per version. If none
exists, the load is refused with the versions named. Modules migrate their own slices, after
the chain and before the validator, each reading its own version from inside its slice (DL-76).

The hand-written validator runs on every load and, in tests, after every `advance`. It never
runs per Turn in play.

| Check | Outcome |
| --- | --- |
| An id referenced by a row that does not exist in its table | refuse |
| A Hero on two Rosters, or in two Parties, or on a Roster of a Guild other than `guildId` | refuse |
| A Hero with a Guild and `unattachedSince` or `leftPoolOnTurn` set; one with no Guild both in the pool and gone from play, or neither | refuse |
| A Guildmaster whose `guildId` differs from the Guild that names them | refuse |
| A folded Guild with a Hero on its Roster or a Party of its own (DL-28) | refuse |
| `quest.partyIds` and `party.questId` disagree, or more Parties than the build allows | refuse |
| Two stacks with the same definition, holder and slot | refuse |
| A stack whose quantity is below 1; a Hero's gear slot holding more than one Item (DL-48) | refuse |
| An offer whose Hero is not on `fromGuildId`'s Roster, or whose `expiresOnTurn` is past | refuse |
| An id not of the form `<table>-<six digits>`, or a counter past 999,999 | refuse |
| A History position outside `entries` | refuse |
| A module slice its installed module refuses, or cannot migrate or read (DL-76) | refuse |
| A Stat, Class, Skill, Trait, Item, template or Injury type key the content does not define | warn |
| An Item a Hero holds in a slot `gearSlots` does not list, or that is not gear for its slot (DL-48) | warn |
| A module slice no installed module owns (DL-76) | warn |

A refused document names the failed check. Nothing is repaired silently.

## 7. Performance targets (provisional)

Not a priority in the first increments; to be rebaselined against the first harness runs.

| Measure | Target to react to |
| --- | --- |
| Advance one Turn | under 5 ms |
| Fast forward a year | under 1 s |
| Harness: 1,000 games of 20 years | under 10 min |
| Save after 20 years | under 20 MB |
| Load a save | under 1 s |

The History will dominate save size. The levers, in order: lean entries (ids and labels,
never entity copies), rule 10 (drift is not an event), and compression on write with Node's
built-in `zlib` or the browser's `CompressionStream`. Archiving or dropping old entries is not
a lever: R36 forbids it. A browser's `localStorage` holds about
5 MB per origin, so the web front end saves to IndexedDB.

## 8. Type sketch

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
  byEntity: Record<string, number[]>;
  byType: Record<string, number[]>;
  milestones: number[];
}
```
