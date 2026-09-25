# Heroesim v2 — World State data model

The shape of the World State document, settled 2026-09-25 after three rounds of questioning.
The TypeScript types in `engine/` are the truth once they exist; this document records the
sections, the tables, the rules, and what the validator refuses. Vocabulary is
[`../CONTEXT.md`](../CONTEXT.md). Decisions hard to reverse are ADR-0008 and ADR-0009.

## 1. The document

One JSON document, three top-level sections with different lifecycles:

| Section | Lifecycle | Holds |
| --- | --- | --- |
| `meta` | Written at creation, never changed | schema version, seed, content set id and version, the configuration snapshot, creation timestamp supplied by the caller |
| `world` | Copied once per Turn with `structuredClone`, then mutated | every table, the Board, random stream states, id counters, module slices, the current Turn |
| `history` | Append-only, shared by reference across Turns, never copied | entries and their indexes |

`advance(document, choices)` clones `world`, mutates the clone, appends to `history`, and
returns a new document that shares `meta` and `history` with the old one. The History is the
one deliberate exception to "state in, new state out": the previous reference sees new entries
too, and nothing but the engine's append function may touch it (ADR-0008).

## 2. `meta`

```
version:        integer          schema version of this document
seed:           string           master seed the world was created from
content:        { id, version }  the content set the world was created under
config:         GameConfig       every tunable, as it was at creation
createdAt:      string           ISO timestamp supplied by the caller, never read by rules
```

Loading uses `meta.config`, not current defaults, so a game continues under the rules it was
started with. The harness passes configuration explicitly and ignores this field.

## 3. `world`

### 3.1 Time, randomness, identity

```
turn:      integer                     absolute Turn index from 0
rng:       Record<StreamName, State>   one seeded generator per subsystem (ADR-0009)
counters:  Record<TableName, integer>  next id number per table
```

Day and time of day are derived: `day = floor(turn / 3)`, `timeOfDay = turn % 3` (morning,
afternoon, night). Years use `config.turnsPerYear`, whose default is 1,080 (360 Days), a
configuration default and not a decision.

Streams are named per subsystem so that adding a subsystem never shifts another's draws:
`generation`, `board`, `quests`, `heroes`, `rivals`, `events`, `market`. A stream is seeded
from the master seed and its name. A module that draws random numbers registers a stream of
its own.

Ids are strings with a table prefix and a zero-padded counter: `hero-0042`, `guild-0002`,
`quest-01337`. They are never reused; a dead Hero's id stays valid in the History. In
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
guildId:        GuildId | null              null means Unattached
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
regard:         Record<EntityId, RegardEntry>
```
Equipment is not on the Hero: it is the unique Items whose holder is this Hero (3.3).

**patrons**
```
id, name, sphereKey
questTemplateKeys: QuestTemplateKey[]
regard:         Record<EntityId, RegardEntry>
```

**quests**
```
id, templateKey, patronId
difficulty, tags, durationTurns, reward, fameEffect
requirements:   { partySize, classKey?, skillKey? }
lootTableKey:   string | null
status:         "offered" | "taken" | "resolved"
offeredOnTurn, expiresOnTurn
partyIds:       PartyId[]                   first build: at most one; later, at most one per Guild
```
The Board is `world.board: QuestId[]`, ordered, holding the offered Quests. A Quest row is
removed when it expires or resolves; the History keeps its record.

**parties**
```
id, questId, guildId
heroIds:        HeroId[]
departedOnTurn, returnsOnTurn
```
A Party's consumables are the stacks whose holder is this Party (3.3). `quest.partyIds` and
`party.questId` must agree; the validator checks it.

**RegardEntry**, wherever a `regard` map appears:
```
{ value: number, since: turn, reason: string }   reason is a content key or event type
```
Absence means neutral. Relationship is computed from two lookups and never stored.

### 3.3 Items: unique rows and common stacks

Common Items (tools, potions, ordinary gear) are not individuals: they have a quantity and may
be held in several places at once. Unique Items (magical, special, Campaign) are individuals
with exactly one holder. The row carries its holder in both cases; nothing else records it.

**items** (unique)
```
id, definitionKey
holder:         { kind: "hero", id, slot } | { kind: "guild", id } | { kind: "party", id }
```

**stacks** (common)
```
id, definitionKey, quantity
holder:         { kind: "hero", id, slot } | { kind: "guild", id } | { kind: "party", id } | { kind: "market" }
```
One stack per (definition, holder, slot); the validator refuses duplicates. "What is Brenna
carrying" is a filter over both tables; cache an index only if the harness shows it slow.

### 3.4 Module slices

```
modules:  Record<ModuleId, unknown>
```
The core clones the slice with the rest of `world` and never reads inside it. A module owns
validation and migration of its slice and stores its own version there if it needs one.

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
   content's default.
6. **JSON-safe values only**: no `Map`, `Set`, `Date`, class instances, `undefined`, `NaN` or
   `Infinity` anywhere in the document, so `structuredClone` and `JSON.stringify` agree.
7. **Canonical serialisation**: sorted keys, so the same state always produces the same bytes
   and the harness can check determinism by byte equality.
8. **Row lifecycle**: a Quest is removed when it expires or resolves; an Unattached Hero is
   removed when they leave the pool unrecruited unless they appear in any History entry; dead
   and retired Heroes stay, with their State.
9. **Hidden information is stored plainly.** Potential is a field the front end does not show.

## 6. Versioning and the validator

`meta.version` is set from the first save. On load: if a migration chain exists from the
document's version to the current one, it runs, forward only, one step per version. If none
exists, the load is refused with the versions named. Modules migrate their own slices.

The hand-written validator runs on every load and, in tests, after every `advance`. It never
runs per Turn in play.

| Check | Outcome |
| --- | --- |
| An id referenced by a row that does not exist in its table | refuse |
| A Hero on two Rosters, or in two Parties, or on a Roster of a Guild other than `guildId` | refuse |
| A Guildmaster whose `guildId` differs from the Guild that names them | refuse |
| `quest.partyIds` and `party.questId` disagree, or more Parties than the build allows | refuse |
| Two stacks with the same definition, holder and slot | refuse |
| A History position outside `entries` | refuse |
| A Stat, Class, Skill, Trait, Item or template key the content does not define | warn |

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
never entity copies), compression on write with Node's built-in `zlib` or the browser's
`CompressionStream`, and only then archiving old years. A browser's `localStorage` holds about
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
  guilds: Record<GuildId, Guild>;
  guildmasters: Record<GuildmasterId, Guildmaster>;
  heroes: Record<HeroId, Hero>;
  patrons: Record<PatronId, Patron>;
  quests: Record<QuestId, Quest>;
  parties: Record<PartyId, Party>;
  items: Record<ItemId, UniqueItem>;
  stacks: Record<StackId, Stack>;
  board: QuestId[];
  modules: Record<ModuleId, unknown>;
}

interface History {
  entries: Entry[];
  byEntity: Record<string, number[]>;
  byType: Record<string, number[]>;
  milestones: number[];
}
```
