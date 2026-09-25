# M1 — World State

**Objective:** a seeded world that exists, validates, saves, loads and shows, before any rule advances it
**Sessions:** 12–14 · **Depends on:** M0 · **Implements:** `plan.md` M1; `data-model.md` in full; R1, R5, R7, R8, R12–R16, R27 (the pool's existence), R35, R36; ADR-0001, ADR-0006, ADR-0008, ADR-0009
**Gate:** `heroesim new --seed x` then `show` prints Guilds, Rosters, the pool and Patrons; `save` then `load` round-trips byte-for-byte; the harness creates 1,000 worlds twice and every pair is byte-identical

**Status:** in progress — M1-S1 to M1-S4 done

## 0. What lands in M1

- `engine/`: the `WorldDocument` types, branded ids, the `GameConfig` with `defaultConfig`,
  named random streams, the History append function with its indexes, the validator, canonical
  serialisation with `meta.version`, and `createWorld`.
- `content/`: `stats.json`, `classes.json`, `skills.json`, `traits.json`, `backgrounds.json`,
  `names.json`, `spheres.json`, a content schema validator, and a loader with a pure entry
  (text in, `ContentSet` out) and a Node entry (reads the directory).
- Generators for the Guildmaster, Heroes, Guilds, Patrons and the Unattached pool, each drawing
  from the `generation` stream.
- `cli/`: `new`, `show`, `save`, `load`, over a save file.
- `harness/`: the Vitest project behind `HEROESIM_HARNESS`, creating N worlds and reporting
  Stat distributions, Roster and pool sizes, and byte equality.

**Deliberately deferred:** anything that changes a world after creation (M2); Quest templates
and the Board (M2); Items and stacks (tables exist and are empty, rules do not, M5);
migrations beyond the refusal (there is nothing to migrate from); Regard between Heroes beyond
neutral (M4).

**Inputs:** 3.1–3.12. None blocking.

## 1. Stories

### M1-S1 · Document types and ids · 1 session

`engine/src/document.ts`: `WorldDocument { meta, world, history }`, `Meta`, `World`, `History`,
`Entry`, the tables of `data-model.md` §3.2 as interfaces, and one branded id type per table
with a `makeId(table, n)` producing `hero-000042` (six digits in every table, data-model
§3.1). `RegardEntry`. `Holder` for Items.
`engine/src/config.ts`: `GameConfig` and `defaultConfig`, both empty of rules yet:
`turnsPerYear`, `schemaVersion`, `configVersion` (bumped in the decision log whenever a
default changes; `rebase` records it, data-model §2). `EngineDeps = { config, content,
modules? }` is the one object every entry point takes (approach §3).

A test, `document.test.ts`, asserts `isJsonSafe(defaultDocument)`: a recursive check refusing
`undefined`, `NaN`, `Infinity`, `Map`, `Set`, `Date`, functions and class instances (rule 6).
`isJsonSafe` is exported because the validator and the tests reuse it.

**Acceptance:**

- [x] The compiler refuses a `GuildId` where a `HeroId` is expected (a `// @ts-expect-error`
      test line)
- [x] `isJsonSafe` refuses each forbidden value kind and accepts a nested plain document
- [x] Every interface in `data-model.md` §3.2 and §4 has a type of the same name and fields

### M1-S2 · Seeded random streams · 1 session

`engine/src/rng.ts`: a small PRNG with a serialisable state. Proposed: **xoshiro128\*\***
(four `uint32` in a plain array, fast, well distributed for a game) seeded through a string
hash (**cyrb128**) of `${masterSeed}:${streamName}`. Both fit in a hundred lines with no
dependency. Recorded as DL-12 because a different PRNG later changes every seed's game.

API: `createStreams(seed, names): Record<StreamName, RngState>`; `next(state): number` in
`[0, 1)` mutating the state in place (the state lives inside the per-Turn `world` copy, so
in-place is safe); `int(state, min, max)`, `pick(state, array)`, `shuffle(state, array)`,
`chance(state, p)`. The core names from ADR-0009 as amended — `generation`, `board`, `quests`, `encounters`,
`pool`, `heroes`, `progression`, `rivals`, `market` — as a `const` tuple, each entry added in
the milestone that introduces its subsystem (M1 has `generation` only); a new subsystem never
shares an old stream (D7).

**Acceptance:**

- [x] The same seed and name produce the same first thousand draws across two processes
- [x] Two names from one seed produce different sequences
- [x] `RngState` is JSON-safe and a state serialised and deserialised continues the sequence
      exactly
- [x] Drawing from `board` leaves `heroes` unchanged (deep-equal before and after)
- [x] Nothing in `engine/` imports `rng.ts`'s state type except through `world.rng`

### M1-S3 · History append and indexes · 1 session

`engine/src/history.ts`: `createHistory()`, `append(history, entry)` (ADR-0008) maintaining
`byEntity`, `byType`, `milestones`; `entriesFor(history, entityId, { from, limit })` newest
first; `entriesBetween(history, fromTurn, toTurn)` by binary search; `count(history, type)`.
`Entry` and `Event` are the same shape; `append` is the only writer and the module exports no
other mutator.

**Acceptance:**

- [x] After N appends, `entries.length === N` and every index position points at an entry of the
      right entity or type
- [x] Appending an entry with a lower `turn` than the last throws (programming error, rule 1 of
      §4)
- [x] A test freezes every entry after append and reads back unchanged
- [x] `entriesBetween` on 10,000 entries returns the right slice and runs under 1 ms

### M1-S4 · Content set and loader · 2 sessions

`content/` files, JSON, each an object keyed by content key:

| File | Row | Source |
| --- | --- | --- |
| `stats.json` | `{ key, name, area, min, max, default, owner: "hero" \| "guildmaster" }` | R14; areas Physical, Mental, Magical, Social; the five Guildmaster Stats |
| `classes.json` | `{ key, name, leadingStats: StatKey[], gatedSkills: SkillKey[], growth: Record<StatKey, weight> }` | R13; four Classes |
| `skills.json` | `{ key, name }` | R15; twelve to start, three per Class |
| `traits.json` | `{ key, name, owner: "hero" \| "guildmaster", effect: null }` | R8, R16; six Guildmaster Traits and the Injury-left Hero Traits; effects arrive with the rules that read them (M4-S5 for the Guildmaster's) |
| `backgrounds.json` | `{ key, name, owner: "hero" \| "guild" }` | INPUTS 3.10 |
| `names.json` | `{ given: { female: [], male: [] }, family: [], guild: [], patron: [] }` | INPUTS 3.9 |
| `spheres.json` | `{ key, name }` | INPUTS 3.8 |

The *shape* of content belongs to the engine: `engine/src/content-types.ts` defines
`ContentSet` and every row type above (`Stat`, `Class`, `Skill`, `Trait`, `Background`,
`Sphere`, and from M2 `QuestTemplate`), because the engine is what reads them by key
(ADR-0006). The content package imports those types and does only parsing and validation;
the engine imports nothing from it (A3 of the pre-M0 review).

`content/src/index.ts` (pure): `parseContent(files: Record<string, string>): ContentSet` and
`validateContent(set): ContentSet` refusing a Class that names a Stat or Skill that does not
exist, a Stat with `min > max`, duplicate keys, an empty name list. `content/src/node.ts`:
`loadContent(dir = <package>/): ContentSet` reading the directory with `node:fs`. `ContentSet`
carries `{ id: "core", version: 1 }` for `meta.content`.

**Acceptance:**

- [x] `loadContent()` returns twenty Hero Stats in four areas and five Guildmaster Stats, four
      Classes, and validates
- [x] Each refusal above has a test with a fixture that triggers it, and the message names the
      key
- [x] The pure entry and the Node entry return deep-equal sets for the same files
- [x] `engine/` imports nothing from `@heroesim/content`, not even a type; `content/` imports
      its types from `@heroesim/engine` (the M0-S2 boundary test covers both directions)
- [x] `tsc -b` succeeds with `content` referencing `engine` and `engine` referencing nothing

### M1-S5 · Heroes Generator · 1–2 sessions

`engine/src/generators/heroes.ts`: `generateHero(world, content, config, { classKey?, level? })`
drawing from `world.rng.generation`: sex, name, Background, Class (uniform unless given), age
(INPUTS 3.5), base Stats per Stat from its range with the Class bias on leading Stats (INPUTS
3.6), Potential per Stat, starting Skills from the gated list (INPUTS 3.11), `xp: 0`,
`level: 1`, `morale: config.moraleBaseline`, no Injury, no Traits, empty Regard. Emits
`hero.generated` with `participants: [heroId]`.

Config: `heroStartingAgeMin/Max`, `statBiasMin/Max`, `potentialGapMin/Max`,
`startingSkillsMin/Max`, `startingSkillRatingMax`, `moraleBaseline`.

**Acceptance:**

- [x] Over 10,000 generated Heroes every Stat stays in its content range and Potential ≥ base
- [x] A Warrior's mean Strength exceeds a Mage's by at least the minimum bias
- [x] Only Skills gated by the Hero's Class appear
- [x] Every draw comes from `generation`: the other six streams are unchanged after generation

### M1-S6 · Guild, Guildmaster and Patron Generators; `createWorld` · 2 sessions

`engine/src/generators/guilds.ts`: `generateGuild(world, content, config, { controller,
rosterSize, wealth, name? })` making the Guild, its Guildmaster (Stats from the five Guildmaster
Stats, age from `guildmasterStartingAgeMin/Max`, and `guildmasterTraitsMin/Max` Traits drawn
from the `owner: "guildmaster"` rows of `traits.json`, whose effects stay `null` until M4-S5)
and its Roster through the Heroes Generator, `hall` at grade 0 for each facility, `fame: 0`.
Rival Guildmasters get Traits the same way (ADR-0002), so Rivals differ in a way the player
can read.
`engine/src/generators/patrons.ts`: `generatePatron` with a Sphere; a Patron's Quest
templates are looked up by Sphere in content at draw time, never stored (data-model §3.2, D3). `engine/src/create.ts`:
`createWorld(content, config, seed, setup: { guildmasterName, guildName, backgroundKey })
-> { document, events }`: meta from config and content, streams, the player's Guild from the
setup with `rosterSize: config.startingRosterSize` and `wealth: config.startingWealth`,
`config.rivalCount` Rival Guilds with `controller: { kind: "rival", disposition: "steady" }`,
`config.patronCount` Patrons, `config.unattachedPoolSize` Unattached Heroes, and the first
History entries: `world.created`, `guild.founded` per Guild (a Milestone).

Config: `startingRosterSize`, `startingWealth`, `rivalCount`, `rivalRosterMin/Max`,
`rivalStartingWealthMin/Max`, `patronCount`, `unattachedPoolSize`, `guildmasterStartingAgeMin/Max`,
`guildmasterTraitsMin/Max`.

**Acceptance:**

- [x] `createWorld` returns a document that the validator (S7) accepts — *wired in M1-S10:
      `engine/src/create.test.ts` with the fixture content, `harness/src/creation.test.ts` with
      the core content*
- [x] Every Guild, player and Rival, is produced by the same function; the only difference in
      the output is `controller` (a test diffs a player Guild and a Rival Guild generated with the
      same parameters)
- [x] The player's starting Roster has one Hero per Class when `startingRosterSize` is 4
- [x] `meta.config` deep-equals the config passed in and `meta.seed` the seed

### M1-S7 · Validator · 1 session

`engine/src/validate.ts`: `validate(document, content): { ok: true, warnings } | { ok: false,
failures }`, every check in `data-model.md` §6 as a named function returning a list, so a
failure names its check and the offending id. Runs in every engine test through a `withValid`
helper that wraps a document assertion.

**Acceptance:**

- [x] One test per refusal row in `data-model.md` §6, each mutating a valid document into the
      failing shape and asserting the named check
- [x] An unknown Stat key on a Hero warns and does not refuse; the Hero's other Stats still read
- [x] Validating a 1,000-Hero world runs under 50 ms

### M1-S8 · Canonical serialisation, save and load · 1 session

`engine/src/serialise.ts`: `serialise(document): string` with keys sorted recursively (arrays
untouched), no whitespace; `deserialise(text, deps): { ok: true, document } | { ok: false,
reason }` checking `meta.version` against `config.schemaVersion`, running the migration chain
(empty in M1; the chain is a `Record<number, (doc) => doc>` so M2 onward can add a step), then
the validator. A version with no chain refuses, naming both versions.

**Acceptance:**

- [x] `serialise(deserialise(serialise(d)))` equals `serialise(d)` byte for byte
- [x] Two documents that differ only in key insertion order serialise identically
- [x] A document with `meta.version: 999` is refused with both versions in the reason
- [x] `structuredClone(world)` and `JSON.parse(JSON.stringify(world))` deep-equal

### M1-S9 · CLI: `new`, `show`, `save`, `load` · 1–2 sessions

`cli/src/main.ts`: a non-interactive command runner, `heroesim <command> [flags]`, run through
`npm run play -- <command>`. Every command reads the save named by `--save` (default
`.saves/current.json`, dir from `HEROESIM_SAVE_DIR`), acts, and writes it back, so the CLI is
stateless between invocations and stays thin. It builds `deps.config` as
`{ ...defaultConfig, ...meta.config }` (data-model §2, D3) and passes the content set and, from
M8, the module list. `new --seed <s> --guild <name> --master <name>
[--background <key>]` creates and saves; `show [guilds|roster [guildId]|pool|patrons|hero
<id>|history [entityId]]` prints tables; `save --as <file>` copies; `load <file>` sets the
current save. Output goes through one `render` module of plain `string` tables; no colour, no
prompts. The CLI generates a readable seed when none is given, using `Math.random` (it is
outside the engine).

**Acceptance:**

- [x] `new`, `show roster`, `show pool`, `show patrons`, `show hero <id>` work end to end on a
      real file
- [x] `show hero` never prints Potential (rule 9); a test greps the output
- [x] A refused load prints the reason and exits non-zero
- [x] `cli/` contains no rule: every number shown comes from a document field or an engine
      selector

### M1-S10 · Harness skeleton and the determinism measure · 1 session

`harness/src/create.harness.test.ts` under a Vitest project that is skipped unless
`HEROESIM_HARNESS` is set; `npm run harness` sets it. Creates `HEROESIM_SEEDS` (default 1,000)
worlds from seeds `seed-0001`… with `createdAt: "harness"` so `meta` compares byte for byte
(D10.1), reports per-Stat mean and spread by Class, Roster and pool
sizes, and creation time; then creates each world a second time and compares `serialise`
output byte for byte. Writes a Markdown report to `harness/reports/m1-<date>.md` (gitignored
except the one committed at the tag).

**Acceptance:**

- [x] 1,000 worlds byte-identical across two runs (**Measure:** recorded in DL-13 with the
      creation time per world)
- [x] The report lists every Stat's mean per Class and no Class has a Stat outside its range
- [x] `npm test` without the flag skips the harness project in under a second

## 2. Configuration and events introduced

**Config:** `schemaVersion`, `turnsPerYear`, `startingRosterSize`, `startingWealth`,
`rivalCount`, `rivalRosterMin/Max`, `rivalStartingWealthMin/Max`, `patronCount`,
`unattachedPoolSize`, `heroStartingAgeMin/Max`, `guildmasterStartingAgeMin/Max`,
`guildmasterTraitsMin/Max`,
`statBiasMin/Max`, `potentialGapMin/Max`, `startingSkillsMin/Max`, `startingSkillRatingMax`,
`moraleBaseline`.

**Events:** `world.created`, `guild.founded` (Milestone), `hero.generated`,
`guildmaster.generated`, `patron.generated`.

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| Key-sorted JSON is slow at 20 MB | Not measured until M2-S12; the sort is one recursive pass and v1's saves were sorted the same way. If it shows, sort at save time only and compare hashes in the harness |
| Content keys drift from `CONTEXT.md` vocabulary | Content validation checks keys are kebab-case; a test asserts every Stat name in `stats.json` appears verbatim in `CONTEXT.md`'s Stat entry |
| The PRNG choice turns out weak | The streams' API hides the algorithm; swapping it is one file and one DL entry, at the cost of every existing seed, which saves-as-snapshots tolerates |
