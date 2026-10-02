# Heroesim v2 — baseline requirements

Established 2026-09-24 from the owner's conceptual game-flow diagram and four rounds of
questioning. This is the baseline: what the game is, what the first build contains, and what
is deferred and why. Vocabulary is binding and lives in [`../CONTEXT.md`](../CONTEXT.md).
Decisions that are hard to reverse have an ADR in [`adr/`](./adr/). The design principles are
in [`principles.md`](./principles.md) and the build approach in [`approach.md`](./approach.md).

## 1. What the game is

A single-player guild-management simulation. The player is a Guildmaster running a Guild of
Heroes: taking Quests from Patrons, choosing who to send, and growing the Heroes and the Guild
over the years until Retirement or Bankruptcy.

The engine is mechanical first. The pull of the game is growth and management, not narration.
Story arrives later through modules (Scenarios, Campaigns, Contacts) where it will matter,
rather than over every Quest.

### The five pulls

Every system in the game must serve at least one of these:

1. **Managing the Guild**: recruiting and transferring the best Heroes, managing team dynamics
   and Relationships.
2. **Growing a young Hero** and watching them reach their Potential.
3. **Harder, richer Quests** as the Guild develops, demanding different Skills, Classes and
   Synergies.
4. **Loot** from hard Quests that benefits Heroes or the Guild.
5. **Campaigns** (later): story, Contacts, Patrons and Factions, scripted events with
   cathartic pay-offs.

## 2. Scope

| Area | First build | Later module or expansion |
| --- | --- | --- |
| World State and World Engine | Yes | — |
| Generators: Heroes, Guild, Patron, Quest, Transfer | Yes | Random Event and Inciting Event generators, as modules |
| Turn structure, fast forward | Yes | — |
| Heroes: Attributes, Stats, Skills (rated), Traits, States | Yes | Skill growth, Class change, gender-linked mechanics |
| Progression: XP, Level, Potential, ageing decline | Yes | Guildmaster Traits that sharpen Potential hints |
| Quest Engine | Full: encounters, checks, Synergies, Relationship, Items (a stub in M2, replaced in M4; amended 2026-09-28, DL-86, originally "Stub: difficulty against Party" here and the full engine later) | — |
| Board and Patrons | Yes | Patrons approaching the Guild; visiting Patrons; Factions |
| Recruitment from the Unattached pool | Yes | Scouting and hidden information |
| Transfers with Rivals | Yes | Poaching |
| Items, Loot, Market | Yes, from M5 (amended 2026-09-28, DL-86; originally "After the stub loop") | — |
| Hall Improvements | Yes, from M3, pre-M0 review D8 (amended 2026-09-28, DL-86; originally "After the stub loop") | Workers |
| Rival Guilds: Roster, Wealth, disposition | Yes | Rival encounters during Quests; fuller Guild engine |
| Direct contests between Guilds (DL-89; one reading of the owner's diagram's Guild Battle box) | No | A later feature (added 2026-09-28, DL-89). The term Guild Battle keeps CONTEXT's meaning: Defeated by a Rival and Rival encounters during Quests |
| Rankings by Fame and Wealth | Yes | Rankings by any Guild statistic |
| Endings: Retirement, Bankruptcy, Roster wiped | Yes | Defeated by a Rival, Hall lost, capture and indenture, Ultimate Campaign Victory |
| Saves: snapshot with History | Yes | ~~Hosted saves following a player across devices~~ Struck 2026-09-28 (DL-89): saves are files only, exported and imported |
| Front ends: CLI and browser, exposing every engine action as it lands | Yes | — |
| Harness: automatic policy over many seeds | Yes | — |
| Scenarios, Campaigns, Contacts, Factions | No | Modules |
| Guildmaster joining a Party | No | With penalties: Guild suffers while away; death ends the game |

## 3. Functional requirements

### 3.1 World and time

- R1. The World State holds every Guild (the player's and Rivals, uniformly), every Hero
  (on a Roster or Unattached), Patrons, Regard between entities, Quests on the Board and in
  flight, Items, and the History.
- R2. A Day is three Turns: morning, afternoon, night. The World Engine advances one Turn at a
  time; the player may fast forward, and the engine stops early when a decision is needed.
- R3. Fixed rhythm: the Board and Market refresh in the morning; Quests in flight advance every
  Turn; healing, Morale drift and ageing fall at night, where Random Events will also fall
  once that module exists.
- R4. The player has one Outing per Turn (Market, scouting, a Patron visit) and unlimited Hall
  actions (dispatch, recruit, equip, inspect, build). The Outing limit is built with the
  second kind of Outing — scouting or Patron visits, both modules; in the first build the
  Market is the only Outing and is not limited (owner, 2026-09-25, pre-M0 review B1). When the
  limit is built it applies to every Guild, not only the player's (amended 2026-09-28, DL-89).
- R5. Generation: a new world is created from a seed and a setup (Guildmaster, Guild
  Background, starting Roster and Wealth) by the Heroes, Guild and Patron Generators. The
  Heroes Generator also refreshes the Unattached pool over time.
- R6. Later, as modules (§2): the Random Event and Inciting Event generators change the World
  State as time passes. Inciting Events are drawn at random or prescribed by an active
  Campaign, and may produce Quests. Both are content with conditions, not code.

### 3.2 Guilds and Guildmasters

- R7. Every Guild has a Roster, a Hall, Wealth, Fame, Upkeep and a controller. The player's
  Guild is controlled by the player; a Rival by a disposition (three or four named kinds) that
  weights its draws from the Board and the Unattached pool.
- R8. The Guildmaster has Attributes (name, sex, age, and three descriptive Attributes with no
  rule effect, in the owner's words "origin, appearance, short bio": Birthplace, Appearance and
  Biography, DL-88, DL-100), Stats (Inspiration, Influence,
  Negotiation, Coaching, Judgement — renamed from Leadership and Perception on 2026-09-26 so
  no Stat key is shared with Heroes, pre-M0 review D4) and Traits that buff or penalise the Guild or a Class.
  Guildmaster Stats resolve Guild-side actions only: negotiation, recruitment, Morale, training.
  The Guildmaster never joins a Party in the first build.
  At setup the player may choose the Guildmaster's Traits, their sex, their age (21 to 50) and
  the descriptive Attributes, each a short text trimmed and held to a length; whatever is left
  unset is drawn from the seed, and a player who chooses no Traits has none. Traits are chosen
  within a point budget: each Guildmaster Trait has a whole-number cost in content, a buff costing
  points and a penalty refunding them, and the player spends a fixed budget
  (`guildmasterTraitBudget`, 1), so the dearer buffs need penalties. Traits may exclude one
  another, each exclusion holding both ways, and no Guildmaster holds an excluded pair or more
  than `guildmasterTraitsMax` Traits. A drawn Guildmaster, a Rival's or a successor's, follows
  the same budget and exclusions, and their descriptive Attributes are empty. A setup that breaks
  one of these rules is refused with a reason of its own. Every Guildmaster, the player's and every
  drawn one, starts 21 to 50 and retires at 61. A Rival's Guildmaster who retires is
  succeeded, and the Guild carries on (Succession, DL-83, DL-100). (Amended 2026-09-28, DL-88;
  originally "Attributes (name, sex, details)", with "details" undefined and the sex drawn at
  setup; the owner's decision, where the agents recommended an optional sex at setup and striking
  "details". Amended again 2026-09-29 with the terms, the costs, the budget and the exclusions of
  DL-100 item 3, the owner's approval of an agent's values; built in M9-S2, DL-102. A drawn
  Guildmaster's Traits are then drawn as one whole legal set, uniformly among the sets of the count
  drawn, by the owner's DL-109 item 1; built in DL-110. Amended again 2026-09-29 by the owner's
  DL-113 item 4: every Guildmaster 21 to 50 at the start, originally 30 to 45, and retiring at 61,
  originally 65; built in M9-F1, DL-114.)
- R9. The Guildmaster holds Regard for Heroes, Guilds, other Guildmasters and Patrons.
- R10. Rankings order every Guild by Fame and by Wealth. Fame rises and falls with Quest
  outcomes and, later, with dealings with Patrons, Contacts and Inciting Events. Fame is never
  spent; it gates which Unattached Heroes will sign for a Guild — a Hero refuses a Guild whose
  Fame is below a threshold that rises with the Hero's Level — and, later, Campaigns (owner,
  2026-09-25, pre-M0 review B4; originally "Applicant calibre").
- R11. Wealth is the currency. It pays Upkeep (wages and Hall maintenance), signing fees,
  Transfer fees, Items and Hall Improvements.

### 3.3 Heroes

- R12. A Hero has Attributes (name, sex, age, Background, Class), Stats, Skills, Traits and
  States. Sex affects narration and names only in the first build. (Amended 2026-10-02, DL-148
  item 6: from `v1.1.4`, content may also read Sex to decide which Heroes a Check or a harm
  reads, where the story calls for it, and never to set a Stat's value or a score.)
- R13. Classes are Warrior, Rogue, Mage and Healer, fixed at generation, defined as content.
  A Class biases starting Stats, gates Skills, sets the growth profile per Level, and is an
  input to Synergies.
- R14. Stats are a keyed set defined in content, not fixed fields, so they can be added,
  changed or removed between releases without touching the engine's shape. Each Stat belongs
  to one of four areas, used for display. Initial Hero Stats:

  | Area | Stats |
  | --- | --- |
  | Physical | Strength, Dexterity, Weaponry, Constitution, Endurance |
  | Mental | Intelligence, Knowledge, Perception, Wits, Courage, Willpower |
  | Magical | Arcana, Power, Spelllore, Spirit, Resistance |
  | Social | Leadership, Charisma, Diplomacy, Adaptability |

  Not every Stat is read by every rule in every release.
- R15. Skills are named proficiencies rated 1 to 5. The rating is in the data model from the
  first build; the stub Quest Engine reads it as a flat modifier. Skill growth is deferred.
- R16. Traits on a Hero are binary marks left by history, such as a healed Injury.
- R17. Progression: XP from Quests and training raises a Hero's Level; each Level raises Stats
  along the Class's growth profile up to the Hero's Potential. Potential is a hidden per-Stat
  ceiling, shown only as a hint. Stats decline past an age.
- R18. States: Injury (a type and Days to heal, faster with an infirmary; some types leave a
  Trait), Morale, Death (permanent; the Hero stays in the History), and Regard for others.
- R19. Relationship between two entities is computed from their mutual Regard. Relationship
  within a Party scales teamwork in the Quest Engine.
- R20. Retirement of a Hero is likelier with age and with injury.

### 3.4 Quests

- R21. A Quest carries: Patron, difficulty, type or tags, duration in Days, reward in Wealth,
  Fame effect, requirements (Party size, a needed Class or Skill), a deadline to accept, and a
  Loot table reference for hard Quests. The shape is expandable.
- R22. The Board refreshes each morning with Quests drawn from Patrons, weighted by each
  Patron's Regard for the Guild. Every Guild's controller draws from the same Board, the player
  first.
- R23. A Party is dispatched from the Roster with consumable Items assigned. The Party is
  unavailable while away.
- R24. The Quest Engine assesses the Quest against the Party: Stats, Skills, Relationship,
  Synergies, Items and further qualifiers as they are added. It produces the outcome: XP,
  Injuries or Death, Morale and Regard changes, reward or penalty, Fame effect, Loot, and typed
  events the front end narrates and the World Engine feeds back into the world. A Hero's Stats
  change through the Levels that XP brings and through ageing, and a Hero gains a Trait when
  certain Injuries heal (R18); Hero Traits gain effects (decided, to be built). (Amended
  2026-09-28, DL-85: originally the outcome also listed "Stat changes" and "new Traits", which
  no Quest outcome was built to produce. This rewording to what is built is the owner's stated
  intent, made provisionally; its exact words await the owner's confirmation, DL-85 item 10.)
  (Amended 2026-10-02, DL-148 items 24 and 25: from `v1.1.4`, Hero Traits have effects, Stat
  changes or a bonus on an Encounter's Checks, and a Quest's outcome may give a Hero a new
  Trait, rarely: a positive one, drawn on an Encounter's Triumph, only when the Quest ends a
  strong success, and a negative one only to a Hero a failed Encounter injured. The words are
  the agent's, for the owner to confirm.)
- R25. First build: a stub Quest Engine that compares difficulty against the Party's summed
  Stats and applies simple outcomes. Target: a sequence of typed encounters, each a check with
  typed consequences. (Amended 2026-09-28, DL-86: the first build reached the target. M2 built
  the stub, scoring weighted Stat demands carried on the Quest (DL-06), and M4 replaced it with
  typed encounters (DL-42).) (Amended 2026-10-02, DL-148 items 7 and 8: from `v1.1.4`, an
  encounter holds one to four named checks, each a query over the Party written in content, and
  each check and encounter comes out a Degree: Triumph, Success, Setback or Failure.)
- R26. Synergies are authored bonuses for combinations of Classes or Skills, defined as
  content. (Amended 2026-10-02, DL-148 item 20: from `v1.1.4`, for any condition on the Party a
  query can state, its Classes, Skills, Stats and more, the old combinations among them.)

### 3.5 Recruitment and transfers

- R27. An Unattached pool of Heroes exists in the World State, refreshed by the Heroes
  Generator. Any Guild recruits from it for a signing fee set by Level and Stats.
- R28. Transfers move a Hero between Guilds for a fee in either direction. Transferring out a
  Hero lowers the Morale of each remaining Hero who held them in high Regard; the rest are
  untouched (pre-M0 review D5: pairwise, not the Roster's mean).
- R29. First build: no hidden information. Stats of Heroes outside the player's Guild are
  visible. Scouting mechanics are deferred.

### 3.6 Items and Market

- R30. Items are permanent gear (two or three slots per Hero, modifying Stats) or consumables
  (assigned at dispatch, expended automatically by the Quest Engine). No trade-goods economy.
- R31. The Market buys and sells Items; the sell price is below the purchase price. It
  refreshes each morning.
- R32. Loot is Items awarded by a Quest's outcome, weighted toward hard Quests.

### 3.7 The Hall

- R33. The Hall has an infirmary (faster healing), a training yard (XP off-Quest) and quarters
  (Morale). Each is raised by Improvements bought for Wealth. Workers, hired staff with a wage
  and a Stat that scale a facility, are deferred.

### 3.8 Endings

- R34. First build: Retirement (the Guildmaster's age), Bankruptcy (Wealth below a floor for
  long enough), Roster wiped (no Heroes and no Wealth to recruit). Deferred: Defeated by a
  Rival, Hall lost, capture and indenture, Ultimate Campaign Victory after a Fame threshold.
  Retirement ends the player's game; a Rival's Guildmaster who retires is succeeded instead
  (amended 2026-09-29, DL-83 item 19, DL-100; originally a Rival folded on it, DL-28).

### 3.9 Saves and History

- R35. A save is a snapshot of the World State, written locally. Loading never replays the
  game.
- R36. The History inside the World State keeps every engine event, per Guild and per Hero,
  and a list of Milestones. Neither list is bounded: no event is dropped. Every discrete
  change is an event; a nightly drift (Morale toward its baseline, training XP, Regard decay)
  is a configured rule that emits an event only when it crosses a band (principle 11). Two
  discrete changes are named exceptions and also emit only on a band crossing: a change of
  Regard made by the core's own rules, and the Morale cost of a Transfer to the Heroes who stay.
  A module's change of Regard always emits (amended 2026-09-28, DL-84; decided, to be built).

### 3.10 Front ends

- R37. The engine is a library; front ends render its state and events. The first build ships
  a CLI and a browser front end, each a viewer of the world plus every engine action, added to
  the front end in the increment that adds it to the engine (owner, 2026-09-25, pre-M0 review
  A6; originally "advance, dispatch and recruit").
- R38. The browser build deploys as static files at zero running cost. It is one page with one
  classic script, so it opens from the filesystem (`file://`) as well as from its host,
  and a later change may not break that (added 2026-09-28, DL-88; until then only M7-S1's
  acceptance box, DL-64).

## 4. Non-functional requirements

- N1. **Deterministic engine.** A seeded random source whose state is part of the World State,
  and time that advances only when the engine is told to. A game is reproducible from its seed,
  the player's choices and the rules in force, which `meta.config` holds and a
  `world.rules-adopted` entry records whenever they change. Decided, to be built: the content
  in force is recorded too, `meta.content` naming it and a `world.content-changed` Milestone
  marking a load under content of another version (amended 2026-09-28, DL-84; data-model §2).
  Front-end cosmetics may use global randomness (ADR-0001).
- N2. **Single player, siloed, local.** Each player has their own World State and saves
  locally. No player accounts, no server, no network call, no paid dependency; a hosting
  account that serves static files at zero running cost is allowed (pre-M0 review D10.2).
  Zero running cost now; low cost for a small group later, still siloed.
- N3. **Every Guild is a Guild.** The engine never assumes the player's Guild is special;
  the difference is the controller (ADR-0002).
- N4. **Typed events plus state out of the engine, never prose** (ADR-0003).
- N5. **Snapshot saves with History inside** (ADR-0004).
- N6. **Modules plug into the World Engine at defined phases** and own their slice of state.
  The core runs with none installed (ADR-0005).
- N7. **Content over code.** Classes, Stats, Skills, Synergies, Items, Quest templates and
  events are data files; adding one never changes the engine (ADR-0006).
- N8. **TypeScript on Node 22 or later, zero dependencies in the engine**, Vitest, one
  repository (ADR-0007 as amended 2026-09-25).
- N9. **Every tunable is a named, defaulted configuration field.** A literal balance number
  in rules code is a defect.
- N10. **Measured before tuned.** A harness with an automatic policy plays many seeded games
  and reports the counters each increment defines.
- N11. **Vocabulary is binding.** `CONTEXT.md` names the terms and the words to avoid.

## 5. Open items

- Balance numbers everywhere: Stat ranges, XP curves, Upkeep, fees, difficulty, harm rates,
  Morale and Regard scales. Set defaults per increment and measure them (N10). *2026-09-28:*
  the values in force at `m8-modules` are accepted as the owner's, except those DL-82 to DL-89
  change or leave for proposals (DL-90), and the owner has set target bands for the balance
  that tuning aims at after Random Events (DL-83).
- ~~Whether the stub Quest Engine assesses a Quest by area sums or by a weighted list of Stat
  demands carried on the Quest.~~ Resolved 2026-09-25 in the plan interview: weighted Stat
  demands and Skill keys carried on the Quest template and copied to the Quest row; the area
  grouping stays display-only (`plan.md` §5, pre-M0 review F4).
- ~~Rival disposition names.~~ Resolved by INPUTS 7.5 in M6-S1: `steady`, `ambitious`,
  `miserly` and `reckless`, four rows of weights in `content/dispositions.json` (DL-56).
- Which Hall Improvement grades exist and what each costs. *2026-09-28:* three grades of each
  facility exist, priced in `content/improvements.json` since M3-S6 (DL-38). The owner adds
  dearer grades 4 to 6 as late-game Wealth sinks with upkeep; their effects and prices are
  still open, to be proposed for the owner's approval (DL-83; the owner's decision, where the
  agents recommended keeping three grades and re-pricing them).
