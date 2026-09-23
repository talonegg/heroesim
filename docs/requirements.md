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
| Generators: Heroes, Guild, Patron, Quest | Yes | Random Event, Inciting Event, Transfer generators |
| Turn structure, fast forward | Yes | — |
| Heroes: Attributes, Stats, Skills (rated), Traits, States | Yes | Skill growth, Class change, gender-linked mechanics |
| Progression: XP, Level, Potential, ageing decline | Yes | Guildmaster Traits that sharpen Potential hints |
| Quest Engine | Stub: difficulty against Party | Full: encounters, checks, Synergies, Relationship, Items |
| Board and Patrons | Yes | Patrons approaching the Guild; visiting Patrons; Factions |
| Recruitment from the Unattached pool | Yes | Scouting and hidden information |
| Transfers with Rivals | Yes | Poaching |
| Items, Loot, Market | After the stub loop | — |
| Hall Improvements | After the stub loop | Workers |
| Rival Guilds: Roster, Wealth, disposition | Yes | Rival encounters during Quests; fuller Guild engine |
| Rankings by Fame and Wealth | Yes | Rankings by any Guild statistic |
| Endings: Retirement, Bankruptcy, Roster wiped | Yes | Defeated by a Rival, Hall lost, capture and indenture, Ultimate Campaign Victory |
| Saves: snapshot with History | Yes | Hosted saves following a player across devices |
| Front ends: CLI and browser viewer with advance, dispatch, recruit | Yes | Full action set |
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
  Turn; healing, Morale drift, ageing and Random Events fall at night.
- R4. The player has one Outing per Turn (Market, scouting, a Patron visit) and unlimited Hall
  actions (dispatch, recruit, equip, inspect, build).
- R5. Generation: a new world is created from a seed and a setup (Guildmaster, Guild
  Background, starting Roster and Wealth) by the Heroes, Guild and Patron Generators. The
  Heroes Generator also refreshes the Unattached pool over time.
- R6. The Random Event and Inciting Event generators change the World State as time passes.
  Inciting Events are drawn at random or prescribed by an active Campaign, and may produce
  Quests. Both are content with conditions, not code.

### 3.2 Guilds and Guildmasters

- R7. Every Guild has a Roster, a Hall, Wealth, Fame, Upkeep and a controller. The player's
  Guild is controlled by the player; a Rival by a disposition (three or four named kinds) that
  weights its draws from the Board and the Unattached pool.
- R8. The Guildmaster has Attributes (name, sex, details), Stats (Leadership, Influence,
  Negotiation, Coaching, Perception) and Traits that buff or penalise the Guild or a Class.
  Guildmaster Stats resolve Guild-side actions only: negotiation, recruitment, Morale, training.
  The Guildmaster never joins a Party in the first build.
- R9. The Guildmaster holds Regard for Heroes, Guilds, other Guildmasters and Patrons.
- R10. Rankings order every Guild by Fame and by Wealth. Fame rises and falls with Quest
  outcomes and, later, with dealings with Patrons, Contacts and Inciting Events. Fame is never
  spent; it gates Campaigns and Applicant calibre.
- R11. Wealth is the currency. It pays Upkeep (wages and Hall maintenance), signing fees,
  Transfer fees, Items and Hall Improvements.

### 3.3 Heroes

- R12. A Hero has Attributes (name, sex, age, Background, Class), Stats, Skills, Traits and
  States. Sex affects narration and names only in the first build.
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
  Synergies, Items and further qualifiers as they are added. It produces the outcome: XP, Stat
  changes, new Traits, Injuries or Death, Regard changes, reward or penalty, Fame effect, Loot,
  and typed events the front end narrates and the World Engine feeds back into the world.
- R25. First build: a stub Quest Engine that compares difficulty against the Party's summed
  Stats and applies simple outcomes. Target: a sequence of typed encounters, each a check with
  typed consequences.
- R26. Synergies are authored bonuses for combinations of Classes or Skills, defined as
  content.

### 3.5 Recruitment and transfers

- R27. An Unattached pool of Heroes exists in the World State, refreshed by the Heroes
  Generator. Any Guild recruits from it for a signing fee set by Level and Stats.
- R28. Transfers move a Hero between Guilds for a fee in either direction. Transferring out a
  Hero the Roster holds in high Regard lowers the Morale of the Heroes who stay.
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

### 3.9 Saves and History

- R35. A save is a snapshot of the World State, written locally. Loading never replays the
  game.
- R36. The History inside the World State keeps every engine event, per Guild and per Hero,
  and a list of Milestones. Neither list is bounded: no significant event is dropped.

### 3.10 Front ends

- R37. The engine is a library; front ends render its state and events. The first build ships
  a CLI and a browser front end, each a viewer of the world plus advance, dispatch and recruit.
- R38. The browser build deploys as static files at zero running cost.

## 4. Non-functional requirements

- N1. **Deterministic engine.** A seeded random source whose state is part of the World State,
  and time that advances only when the engine is told to. A game is reproducible from its seed
  and the player's choices. Front-end cosmetics may use global randomness (ADR-0001).
- N2. **Single player, siloed, local.** Each player has their own World State and saves
  locally. No accounts, server, network call or paid dependency. Zero running cost now; low
  cost for a small group later, still siloed.
- N3. **Every Guild is a Guild.** The engine never assumes the player's Guild is special;
  the difference is the controller (ADR-0002).
- N4. **Typed events plus state out of the engine, never prose** (ADR-0003).
- N5. **Snapshot saves with History inside** (ADR-0004).
- N6. **Modules plug into the World Engine at defined phases** and own their slice of state.
  The core runs with none installed (ADR-0005).
- N7. **Content over code.** Classes, Stats, Skills, Synergies, Items, Quest templates and
  events are data files; adding one never changes the engine (ADR-0006).
- N8. **TypeScript on Node 22, zero dependencies in the engine**, Vitest, one repository
  (ADR-0007).
- N9. **Every tunable is a named, defaulted configuration field.** A literal balance number
  in rules code is a defect.
- N10. **Measured before tuned.** A harness with an automatic policy plays many seeded games
  and reports the counters each increment defines.
- N11. **Vocabulary is binding.** `CONTEXT.md` names the terms and the words to avoid.

## 5. Open items

- Balance numbers everywhere: Stat ranges, XP curves, Upkeep, fees, difficulty, harm rates,
  Morale and Regard scales. Set defaults per increment and measure them (N10).
- Whether the stub Quest Engine assesses a Quest by area sums or by a weighted list of Stat
  demands carried on the Quest. The latter keeps the area grouping display-only.
- Rival disposition names.
- Which Hall Improvement grades exist and what each costs.
