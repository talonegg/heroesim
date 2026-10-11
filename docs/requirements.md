# Heroesim — requirements

What the game is and does, what is built and what is deferred. The words are
[`CONTEXT.md`](../CONTEXT.md)'s; the design principles are in [`principles.md`](./principles.md), the
build approach in [`approach.md`](./approach.md), the save's shape in [`data-model.md`](./data-model.md),
and decisions that are hard to reverse in [`adr/`](./adr/). Code and documents cite the R and N
numbers, so they are never renumbered.

## 1. What the game is

A single-player guild-management simulation. The player is a Guildmaster running a Guild of
Heroes: taking Quests from Patrons, choosing who to send, and growing the Heroes and the Guild
over the years until Retirement or Bankruptcy.

The engine is mechanical first: the pull of the game is growth and management, not narration.
Story will come through Modules (Scenarios, Campaigns, Contacts) at the moments built for it, not
over every Quest.

### The six pillars

The game is a Guild, not a Party. The player runs an institution over the Guildmaster's career, and
a Quest serves that management (DL-256). Every system in the game serves at least one pillar. The
`v1.2` line's target design is the [Guild Management Design](./management-design.md).

1. **Recruitment is a gamble**: the player searches for Heroes worth signing, and signs them under uncertainty.
2. **Development is a decision**: the player decides how a Hero spends their limited time.
3. **Selection is a dilemma**: the strongest Hero is not always the right one to send.
4. **Careers matter**: a Hero has a trajectory, not only a Level.
5. **Reputation matters**: the Guild's success changes what is offered to it.
6. **History matters**: the Guild remembers what happened.

Loot and Campaigns are kept as features serving Reputation and History.

## 2. Scope

| Area | Built | Later, as a Module or a feature |
| --- | --- | --- |
| World State and World Engine | Yes | — |
| Generators | Heroes, Guild, Patron, Quest, Transfer | Random Event and Inciting Event Generators, as Modules |
| Turns and Fast forward | Yes | — |
| Heroes: Attributes, Stats, Skills, Traits, States | Yes | Skill growth, Class change |
| Portraits and Descriptive Attributes | Guildmasters' and Heroes', the Portraits chosen to fit; content has no Hero picture yet | Patron pictures; Guild Banners' heraldry |
| Fatigue: a Hero's weariness, rising away and falling at home, in bands; rest bands for every Guild | The State, its bands and the Quest clock (DL-282); its effect on Checks and harm (DL-284); rest bands to be built, v1.2.1 (DL-280) | Rest bands by a Guild's Hall; Fatigue as a Random Event's cause |
| The Captain: one a Guild, scaled by Leadership | To be built, v1.2.1 (DL-280) | Rival Guilds that compete for the post's Heroes (v1.2.2) |
| Progression: XP, Level, Potential, Decline | Yes | The Guildmaster Trait that sharpens Potential hints |
| Quest Engine | Encounters, Checks, Degrees, Synergies, Relationship, Items | Mid-Quest reports |
| Board and Patrons | Yes | Patrons approaching the Guild; Patron visits; Factions |
| Recruitment from the Unattached pool | Yes | Scouting and hidden information |
| Transfers with Rivals | Yes | Poaching |
| Items, Loot, Market | Yes | — |
| Hall Improvements | Three grades of each facility | Workers; grades 4 to 6 as late-game Wealth sinks with Upkeep (DL-83) |
| Rival Guilds: Roster, Wealth, Disposition | Yes | Rival encounters during Quests; a fuller Guild engine |
| Direct contests between Guilds | No | A later feature, separate from what [Guild Battle](../CONTEXT.md) names (DL-89) |
| Rankings by Fame and Wealth | Yes | Rankings by any Guild statistic |
| Endings: Retirement, Bankruptcy, Roster wiped | Yes | Defeated by a Rival, Hall lost, capture and indenture, Ultimate Campaign Victory |
| Saves: snapshots with History, on the player's machine | Yes | — (saves are never hosted, DL-89) |
| Front ends: CLI and browser, each exposing every engine action | Yes | — |
| Harness: an automatic policy over many seeds | Yes | — |
| Scenarios, Campaigns, Contacts, Factions | No | Modules |
| The Guildmaster joining a Party | No | With penalties: the Guild suffers while they are away; their Death ends the game |

## 3. Functional requirements

### 3.1 World and time

- R1. The World State holds every Guild (the player's and Rivals, uniformly), every Hero
  (on a Roster or Unattached), Patrons, Regard between entities, Quests on the Board and in
  flight, Items, and the History.
- R2. A Day is three Turns, morning, afternoon and night, and a Year is 360 Days. The World Engine
  advances one Turn at a time; the player may Fast forward, and the engine stops early when a
  decision is needed. The engine counts Turns, Days and Years from 0; a player reads every date as
  the calendar writes it, "Year 2 Day 45, afternoon" ([`agents/ui-text.md`](./agents/ui-text.md),
  DL-210).
- R3. Fixed rhythm: the Board and the Market refresh in the morning; the Rivals act in the
  afternoon; at night training, the Quests whose Parties return, Levels, healing, Morale drift,
  Fatigue, ageing, Upkeep, Transfers, the Unattached pool's refresh and the Ending checks fall, and Random
  Events will fall too. The order is [`approach.md`](./approach.md) §2's.
- R4. A Guild is to have one Outing per Turn (the Market; later scouting and Patron visits) and
  has unlimited Hall actions (dispatch, recruit, equip, build, and Transfer bids and answers). The
  limit arrives with the second kind of Outing and binds every Guild; until then the Market is not
  limited (pre-M0 review B1, DL-89).
- R5. A new world is created from a seed and the player's setup (the Guild's name and Background,
  and the Guildmaster, R8) by the Heroes, Guild and Patron Generators; the starting Roster and
  Wealth come from the configuration and the seed. The Heroes Generator also refreshes the
  Unattached pool over time.
- R6. Later, as Modules (§2): the Random Event and Inciting Event Generators change the World
  State as time passes. Inciting Events are drawn at random or prescribed by an active
  Campaign, and may produce Quests. Both are content with conditions, not code.

### 3.2 Guilds and Guildmasters

- R7. Every Guild has a Roster, a Hall, Wealth, Fame, Upkeep and a Controller. The player controls
  theirs; each Rival is controlled by one of four Dispositions (`content/dispositions.json`), whose
  weights and thresholds decide the Quests it takes, whom it recruits, what it builds and buys, how
  it bids for Heroes, and its Party margin (DL-56).
- R8. The Guildmaster has Attributes (name, sex and age), three Descriptive Attributes no rule
  reads (Birthplace, Appearance and Biography), a Portrait, five Stats and Traits that buff or
  penalise the Guild or a Class (DL-88, DL-100). The Stats bear on the Guild alone: Negotiation
  sets rewards and fees, Inspiration the Heroes' Morale baseline, Coaching training XP, Influence
  gains in a Patron's Regard, and Judgement the Potential hints. The Guildmaster never joins a Party.
  At setup the player chooses the sex, the age, a Portrait of that sex and the five Stats, or leaves
  any of them to the seed (the page offers all four chosen or the whole Guildmaster drawn); each
  Stat chosen is within its range and all within the Stat points, points left unspent being lost
  (DL-149). The Traits are chosen or drawn within the
  Trait budget: each Guildmaster Trait has a whole-number cost, a buff costing points and a penalty
  refunding them, so the dearer buffs need penalties. Traits may exclude one another, each
  exclusion holding both ways, and no Guildmaster holds an excluded pair or more than
  `guildmasterTraitsMax` Traits. The player may write the Descriptive Attributes, each trimmed and
  held to a length, and any left blank are written from content (DL-125). A setup that breaks a
  rule is refused with a reason of its own. A drawn Guildmaster, a Rival's or a successor's, keeps
  the same budget and exclusions, their Traits drawn as one legal set (DL-109). Every Guildmaster
  starts between `guildmasterStartingAgeMin` and `guildmasterStartingAgeMax` and retires at
  `guildmasterRetirementAge` (DL-113); a Rival's Guildmaster who retires is succeeded, and
  the Guild carries on (Succession, DL-83, DL-100).
- R9. The Guildmaster holds Regard for Heroes, Patrons and other Guildmasters; their Regard for a
  Guild is their Regard for its Guildmaster.
- R10. Rankings order every Guild by Fame and by Wealth. Fame rises and falls with Quest
  outcomes and, later, with dealings with Patrons, Contacts and Inciting Events. Fame is never
  spent: it gates which Unattached Heroes will sign for a Guild, a Hero refusing a Guild whose Fame
  is below a threshold that rises with their Level, and, later, Campaigns (pre-M0 review B4).
- R11. Wealth is the currency. It pays Upkeep (wages and Hall maintenance), signing fees,
  Transfer fees, Items and Hall Improvements.

### 3.3 Heroes

- R12. A Hero has Attributes (name, sex, age, Background, Class), two Descriptive Attributes
  (Appearance and Biography) written as they are generated, a Portrait, Stats, Skills, Traits and
  States. Sex decides names, Portraits and narration; content may also read it to choose which
  Heroes a Check or a harm reads, never to set a value (DL-148 item 6).
- R13. Classes are Warrior, Rogue, Mage and Healer, fixed at generation, defined as content.
  A Class raises its Leading Stats at generation, gates Skills, sets the growth profile per Level,
  and is an input to Synergies.
- R14. Stats are a keyed set in content (`content/stats.json`), not fixed fields, so a release can
  add, change or remove one without changing the engine's shape. Each Stat is in one of four areas,
  Physical, Mental, Magical or Social, which group it for display and choose which Stats Decline
  lowers (`declineAreas`). Heroes and Guildmasters have their own Stats and share no key
  ([`CONTEXT.md`](../CONTEXT.md), Stat).
- R15. Skills are named proficiencies rated 1 to 5; a Hero holds a Skill at a rating or not at all.
  A Check that is not raw adds `skillBonusPerRating` for each point of the best rating the Party
  holds in each of the Check's own Skills, and a Query may read a rating (ADR-0010). Skill growth is
  deferred.
- R16. A Hero's Traits are marks left by their history: an Injury that heals may leave one, and a
  Quest may rarely earn one, a positive one on an Encounter's Triumph when the Quest ends a strong
  success, a negative one to a Hero that Encounter injured at the Degree Failure (DL-150, DL-168
  item 5). Hero Traits and Guildmaster Traits are two lists in content, and each Trait carries a
  list of effects. A Hero or a Guildmaster holds any number of Traits, never two that conflict; a
  Trait an Injury leaves replaces one it conflicts with.
- R17. Progression: XP from Quests and training raises a Hero's Level; each Level raises Stats
  along the Class's growth profile up to the Hero's Potential. Potential is a hidden per-Stat
  ceiling, shown only as a hint. Stats decline past an age.
- R18. States: Injury (a type and Days to heal, faster with an infirmary; some types leave a
  Trait), Morale, Fatigue (R39), Death (permanent; the Hero stays in the History), and Regard for
  others.
- R19. Relationship between two entities is computed from their mutual Regard. Relationship
  within a Party scales teamwork in the Quest Engine.
- R20. Retirement of a Hero is likelier with age and with injury.
- R39. Fatigue is a State from 0 to 100, 0 for a Hero generated: it rises each Day a Hero is away,
  by the Quest's Tier, and falls each night at home by the Guild's quarters, read Day by Day on a
  Quest and projected by the estimate, and read in four named bands, fresh, weary, tired and
  exhausted. The higher it is, the more it takes from a Hero's Stats on a Check, from the Physical
  and Magical more than from the Mental and Social, and the more it raises their Injury and Death
  chances. A Guild's rest band, its Disposition's or the player's, leaves its Heroes at or past it
  out of the Parties it chooses, and the player may still send anyone. Every figure is a setting
  (DL-280; the State, its bands and its Day on a Quest by DL-282, its effect on Stats and chances
  by DL-284, the rest band to be built, v1.2.1).
- R40. A Guild names one Captain from its Roster, freely, by its Guildmaster's controller; changing
  it costs the outgoing Captain Morale and locks the post for a time, and a post left empty is
  filled without either. The Captain's Party brings more of its Stats to a Check, its Heroes come
  home with more Morale, and the Roster's Morale baseline is higher while they are at home, each
  scaled by the Captain's Leadership (DL-280; to be built, v1.2.1).

### 3.4 Quests

- R21. A Quest carries its Patron, its Tier, difficulty, tags, duration in Days, reward in Wealth,
  Fame effect, requirements (its least Party, and any Class or Skill it needs), the Encounters drawn for
  it when it is posted with its Beats' lines, the Turn its offer expires, and, when its Tier awards
  Loot, a Loot table. It copies these from its Quest template, so a changed template never alters a
  Quest already offered (DL-25). Its Tier is drawn among those its template offers, up to the
  highest Tier any Guild in play has unlocked by the mean Level of its four best Heroes, the lower
  Tiers kept on offer (DL-271), and sets its difficulty band, its Days, its Beats, its Loot and its
  reward and XP factors (DL-257, DL-262).
- R22. The Board refreshes each morning with Quests drawn from the Patrons, each Patron weighted
  by their mean Regard for the Guilds in play (DL-43), up to its size, which may grow with the
  Years to a cap (DL-261). Every Guild draws from the one Board, the player's first.
- R23. A Party is dispatched from the Roster with Consumables assigned. The Party is
  unavailable while away. It is no fewer than its Quest's least Party, two Heroes or more, with
  no most, and nothing caps the Parties a Guild has out (DL-257 item 6, DL-266). A Guild whose
  Fame is below the Fame minimum of a Quest's Tier may not take it (DL-257 item 3, DL-264).
- R24. The Quest Engine assesses a Quest against the Party: its Stats, Skills, Traits, Form,
  Relationship, Synergies and Consumables. It produces the outcome: XP, Injuries or Death, Morale
  and Regard changes, reward or penalty, Fame effect, Loot, and the typed events the front ends
  narrate and the World Engine feeds back into the world. A Death's chance is its Encounter's times
  the Death factor and the Quest's Tier's Death scale, held at 1, and a Quest that can kill is
  Deadly (DL-257 item 5, DL-265). A Hero's Stats change through the Levels that XP brings, through
  ageing and through their Traits' effects, and a Hero gains a Trait as R16 says (DL-148, DL-150).
- R25. A Quest is a sequence of Encounters met in order, any Finale last. An Encounter holds one
  to four Checks, each a Query over the Party written in content (ADR-0010). Each Check and
  Encounter comes out a Degree, Triumph, Success, Setback or Failure, and the share of Encounters
  at Success or better gives the Quest band, a strong success also needing `strongTriumphShare` of
  them Triumphs (DL-42, DL-148 items 7 and 8).
- R26. Synergies are authored bonuses in content, each applying when the Party meets requirements
  written as Queries over its Classes, Skills, Stats and more (DL-148 item 20).

### 3.5 Recruitment and transfers

- R27. An Unattached pool of Heroes exists in the World State, refreshed by the Heroes
  Generator. Any Guild recruits from it for a signing fee set by Level and Stats.
- R28. Transfers move a Hero between Guilds for a fee in either direction. Transferring out a
  Hero lowers the Morale of each remaining Hero who held them in high Regard; the rest are
  untouched (pre-M0 review D5).
- R29. The player sees the Stats of every Hero, in any Guild or the pool; only Potential is hidden
  (R17). Scouting and hidden information are deferred.

### 3.6 Items and Market

- R30. Items are Gear or Consumables. A Hero carries Gear in three slots, weapon, armour and
  trinket, one Item to a slot, and it changes their Stats. Consumables are assigned to a Party at
  dispatch and expended by the Quest Engine: a bonus to an Encounter's Checks, a reroll of a
  failed Encounter, or healing, spent at an Injury as it is taken, easing it for the rest of the
  Quest and shortening it (DL-50, DL-285). There is no trade-goods economy.
- R31. The Market buys and sells Items; the sell price is below the purchase price. It
  refreshes each morning.
- R32. Loot is an Item, or a stack of a common one, drawn from a Quest's Loot table and awarded
  when the Quest ends on a band in `lootOnBands`. Only a Quest of a Tier whose `loot` is true
  carries a table, and on a Quest with a Finale the Finale must end at a Degree in
  `lootOnFinaleDegrees` (DL-52, DL-202, DL-262).

### 3.7 The Hall

- R33. The Hall has an infirmary (faster healing), a training yard (XP off-Quest) and quarters
  (Morale), each raised through three grades by Improvements bought for Wealth; each grade adds
  to Upkeep. Workers, hired staff with a wage and a Stat that scale a facility, are deferred.

### 3.8 Endings

- R34. The player's game ends at Retirement (the Guildmaster's age), Bankruptcy (Wealth below a
  floor for a grace of Days) or Roster wiped (no Heroes and too little Wealth to sign one). A
  Rival's Bankruptcy or wiped Roster folds it, and a new Rival is founded in its place after
  `rivalReplacementDays`; a Rival whose Guildmaster retires carries on under a successor (DL-28,
  DL-83 item 19, DL-100). Deferred: Defeated by a Rival, Hall lost, capture and indenture,
  Ultimate Campaign Victory after a Fame threshold.

### 3.9 Saves and History

- R35. A save is a snapshot of the World State, kept on the player's machine: the CLI writes it
  as a file, and the page keeps it gzipped in the browser and exports and imports the same file
  (DL-67, DL-89). Loading never replays the game.
- R36. The History inside the World State keeps every recorded event, per Guild and per Hero, and a
  list of Milestones; it is unbounded and nothing is dropped from it. Every discrete change is an
  event. A nightly drift, Morale toward its baseline or Regard decay, emits one only when it crosses
  a band (principle 11), and so do two discrete changes: a change of Regard by the core's own rules,
  and the Morale a Transfer costs the Heroes who stay (DL-84). Training XP emits none: the Level it
  brings records it. A Module's change of Regard will always emit one (DL-84, to be built). A Hero's
  arrival in the Unattached pool, and their leaving it unhired, are emitted but never recorded: a
  hired Hero's History begins at their signing (DL-211).

### 3.10 Front ends

- R37. The engine is a library; front ends render its state and events. The game ships a CLI and
  a browser front end, each a viewer of the world that exposes every engine action (pre-M0 review
  A6); a new action reaches both in the story that adds it to the engine.
- R38. The browser build deploys as static files ([`deploy.md`](./deploy.md)). It is one page
  with one classic script, so it opens from the filesystem (`file://`) as well as from its host,
  and no change may break that (DL-88).

## 4. Non-functional requirements

- N1. **Deterministic engine.** A seeded random source whose state is part of the World State,
  and time that advances only when the engine is told to. A game is reproducible from its seed,
  the player's choices and the rules in force: `meta.config` holds the rules and `meta.content`
  the content the game was created under, and a `world.rules-adopted` Milestone records each
  `rebase` ([`data-model.md`](./data-model.md) §2). Recording a load under other content is to be
  built (DL-84). Front-end cosmetics may use global randomness (ADR-0001).
- N2. **Single player, siloed, local.** Each player has their own World State and saves
  locally. No player accounts, no server, no network call, no paid dependency; a hosting
  account that serves static files at zero running cost is allowed (principle 12). A small group
  may later share a low-cost host, each player still siloed.
- N3. **Every Guild is a Guild.** The engine never assumes the player's Guild is special;
  the difference is the controller (ADR-0002).
- N4. **Typed events plus state out of the engine, never prose** (ADR-0003).
- N5. **Snapshot saves with History inside** (ADR-0004).
- N6. **Modules plug into the World Engine at defined phases** and own their slice of state.
  The core runs with none installed (ADR-0005).
- N7. **Content over code.** Classes, Stats, Skills, Traits, Encounters, Synergies, Items, Quest
  templates and Dispositions are data in `content/`, and Random Events will be; adding one never
  changes the engine (ADR-0006).
- N8. **TypeScript on Node 26 or later, zero dependencies in the engine**, Vitest, one
  repository (ADR-0007, DL-235).
- N9. **Every tunable is a named, defaulted configuration field** in `engine/src/config.json`. A
  literal balance number in rules code is a defect.
- N10. **Measured before tuned.** A harness plays many seeded games under an automatic policy and
  reports the counters it declares ([`harness/README.md`](../harness/README.md)).
- N11. **Vocabulary is binding.** `CONTEXT.md` names the terms and the words to avoid.

## 5. Open items

Open work is [`plan.md`](./plan.md) §3's: the balance toward DL-83's target bands is the economy
pass (#51). The Hall's grades 4 to 6 (§2 above) are open: their effects and prices are to be
proposed for the owner's approval (DL-83).
