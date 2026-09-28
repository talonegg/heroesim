# Heroesim

A guild-management simulation. The player runs a Guild of Heroes, takes Quests from Patrons,
chooses who to send, and grows the Heroes and the Guild over years. The engine is mechanical
first; story-rich modules such as Campaigns and Scenarios extend it.

Entries cite what they restate: R and N numbers are in `docs/requirements.md`, ADRs in
`docs/adr/`, and DL numbers and the pre-M0 review's letters in `docs/decision-log.md`. "To be
built" marks a decision the build does not carry yet.

## Language

### People and groups

**Guild**:
An organisation of Heroes with a Guildmaster, a Roster, a Hall, Wealth, Fame and a controller
(R7). The player's Guild and Rival Guilds are both Guilds, and the rules treat them alike, save
the accepted exceptions named under Controller.
_Avoid_: Company, Agency, Faction

**Guildmaster**:
The person who runs a Guild: a named individual whose Stats and Traits bear on running it, never
on fighting, for a Guildmaster joins no Party (R8; joining one is a later feature). Every Guild
has one (R7 to R9); the player's character is the Guildmaster of the player's Guild. Distinct
from the player, the human at the keyboard.
_Avoid_: Player, Owner, Boss

**Hero**:
A named individual who undertakes Quests, described by Attributes, Stats, Skills, Traits and
States: on one Guild's Roster, or an Unattached Hero on none. A dead or retired Hero is out of
play and stays in the History.
_Avoid_: Adventurer, Character, Unit, Employee

**Roster**:
The set of Heroes a Guild currently employs.
_Avoid_: Team, Squad, Stable

**Party**:
The Heroes a Guild assigns to one Quest, existing for that Quest's duration. A Party once
dispatched is never called home (DL-89); only its Guild's fold disbands it early (DL-28).
_Avoid_: Team, Squad, Band

**Patron**:
A person or body that offers Quests to Guilds.
_Avoid_: Client, Employer, Quest-giver

**Sphere**:
The walk of life a Patron belongs to, which decides the kinds of Quest they offer.
_Avoid_: Faction (until Factions exist), Category

**Contact**:
A non-player character the player can deal with who assists or hinders Quests, influences the
world as it advances and affects Campaign progress, but does not offer Quests.
_Avoid_: NPC, Ally, Informant

**Rival Guild**:
Any Guild the player does not run: a Rival, for short, whose controller is a Disposition. It
competes for Quests, Heroes and Rankings.
_Avoid_: Enemy, Opponent, AI guild, Competitor

**Disposition**:
The named rule set that makes a Rival Guild's choices.
_Avoid_: AI, Personality, Strategy

**Controller**:
What makes a Guild's choices: the player for the player's Guild, a Disposition for a Rival. It
is the only difference between Guilds (ADR-0002). No rule asks which controller a Guild has,
save the accepted exceptions plan §1 lists: the game ends when the player's Guild ends, the
Transfer Generator never takes from it, its controller acts first on the Board, and Random
Events befall it alone (DL-82).
_Avoid_: AI, Brain, Owner

**Guild Battle**:
The owner's diagram's name for conflict between Guilds. For now it maps to the deferred ending
Defeated by a Rival and to Rival encounters during Quests; direct contests between Guilds are a
separate later feature (DL-89). None of them is built.
_Avoid_: Guild war, Battle (alone), Clash

### What a Hero is made of

**Attribute**:
A fixed or slowly changing fact about a person. A Hero's are name, sex, age, Background and
Class (R12); a Guildmaster's are name, sex and age, and descriptive Attributes the player may
write at setup that no rule reads (R8; DL-88, to be built).
_Avoid_: Property, Field, Detail

**Class**:
A Hero's fixed archetype, chosen at generation: Warrior, Rogue, Mage or Healer. It raises its
leading Stats, sets how each Level grows Stats, gates Skills and is the first input to
Synergies.
_Avoid_: Role, Job, Type, Archetype

**Stat**:
A numeric capability that a Quest is assessed against and that grows with experience. Stats
are a keyed set defined in content, each in one of four areas. A Hero's initial Stats:
Physical (Strength, Dexterity, Weaponry, Constitution, Endurance), Mental (Intelligence,
Knowledge, Perception, Wits, Courage, Willpower), Magical (Arcana, Power, Spelllore, Spirit,
Resistance) and Social (Leadership, Charisma, Diplomacy, Adaptability). A Guildmaster's:
Inspiration, Influence, Negotiation, Coaching, Judgement. No Stat name is shared between
Heroes and Guildmasters, so a Stat key names one thing.
_Avoid_: Attribute (see above), Ability, Score

**Leading Stat**:
A Stat a Class favours: raised at generation and given most of each Level's growth. Every Class
leads four; DL-87 gives each a fifth (to be built). No Class leads Leadership, which grows
slowly and alike for every Hero (DL-87).
_Avoid_: Primary Stat, Main Stat, Class Stat

**Skill**:
A named proficiency a Hero holds, rated 1 to 5. A Hero either has a Skill at a rating or
does not have it at all.
_Avoid_: Ability, Talent, Trait (on a Hero), Perk

**Trait**:
A named binary mark: on a Guildmaster, a buff or penalty to the Guild or to a Class; on a Hero,
a lasting mark such as one left by a healed Injury. Hero Traits have no effect yet: DL-85 gives
them effects, and DL-87 lets one Trait carry several, so a Trait may trade a buff for a penalty
(both to be built).
_Avoid_: Perk, Flaw, Buff, Modifier (as a noun)

**Level**:
A Hero's rank of experience. XP earned from Quests and training raises it, and each Level
raises Stats along the Class's growth profile.
_Avoid_: Rank, Tier, Grade

**XP**:
Experience points, earned from Quests and training, that raise a Hero's Level.
_Avoid_: Experience (alone), Points, Growth

**Potential**:
A hidden per-Hero ceiling on each Stat, shown to the player only as a hint, which the
Guildmaster's Judgement sharpens: by DL-85 a poor Judge sees fewer, coarser hints and a sharp
one finer hints (to be built). By DL-83, Decline lowers it too (to be built).
_Avoid_: Cap, Ceiling, Talent, Rating

**Decline**:
The yearly loss of a Hero's Stats in some areas once past an age (R17). Today a Level can grow
a lost point back; by DL-83 Decline lowers Potential too, so it cannot (to be built).
_Avoid_: Ageing (for the loss itself), Deterioration

**State**:
A transient condition of a Hero: an Injury, Morale, Death, and the Regard the Hero holds for
others.
_Avoid_: Status, Condition, Flag

**Injury**:
A State with a type and a number of Days to heal, faster in an infirmary. Some types leave a
permanent Trait when they heal.
_Avoid_: Wound, Damage, Hurt

**Death**:
A permanent State. A dead Hero leaves the Roster but stays in the History.
_Avoid_: Loss, Removal, Casualty

**Morale**:
A Hero's contentment.
_Avoid_: Happiness, Mood, Loyalty

**Morale band**:
One of the named ranges a Hero's Morale falls in. Random Events are to be the first rule to
read them (DL-82).
_Avoid_: Mood, Tier

**Regard**:
The opinion one entity holds of another, whether Hero, Guild, Guildmaster or Patron.
_Avoid_: Reputation, Opinion, Affinity, Standing

**Regard band**:
One of the named ranges a Regard value falls in; a History entry is recorded when a value
crosses one.
_Avoid_: Tier, Level (of Regard)

**Relationship**:
A score between two entities computed from the Regard each holds for the other.
_Avoid_: Bond, Link, Connection

### Work

**Quest**:
A piece of work offered by a Patron and undertaken by a Party, whose outcome is determined by
the Quest Engine.
_Avoid_: Mission, Commission, Job, Contract, Task

**Quest template**:
A content row a Quest is drawn from: its Spheres, Stat demands, Skills, requirements, the ranges
of its difficulty, duration and Party size, its reward and Fame effect, its tags and its Loot
table. A Quest copies what it carries at generation, so a changed template never alters a Quest
already offered (DL-25). No rule reads the tags; they are kept for Random Events' conditions
(DL-82).
_Avoid_: Quest type, Blueprint, Archetype

**Stat demand**:
A Hero Stat a piece of work asks for, with a weight; a Quest template's or an Encounter's
weights sum to one. A Quest's demands describe the work as a whole; each Check reads its
Encounter's (DL-06, DL-42).
_Avoid_: Requirement (a Quest's requirements are its Party size and any Class or Skill it needs),
Weighting

**Quest Engine**:
The part of the engine that assesses a Quest against the Party sent and produces the outcome:
effects on each Hero, reward or penalty, Loot, and what the world learns from it.
_Avoid_: Mission Engine, Combat system, Resolver

**Encounter**:
One typed step of a Quest, resolved by a Check with typed consequences.
_Avoid_: Beat, Scene, Event

**Check**:
The comparison of a Party's capability against an Encounter's difficulty.
_Avoid_: Roll (for the whole), Test, Save

**Quest band**:
How well a Quest went: failure, success or strong success, read from the share of its
Encounters the Party succeeded at (DL-42). By DL-83 a strong success needs a margin, and by
DL-85 it pays a premium (both to be built).
_Avoid_: Result, Grade, Tier

**Board**:
Where the Quests currently on offer are posted. Every Guild draws from it.
_Avoid_: Quest log, Noticeboard, Job board

**Loot**:
Items awarded by a Quest's outcome.
_Avoid_: Drops, Rewards (for Items), Treasure

**Loot table**:
A content list of Items, each with a weight and a quantity range, from which a Quest's Loot is
drawn. A Quest carries one only when its template names one and it is hard enough (DL-52).
_Avoid_: Drop table, Treasure table

**Synergy**:
An authored bonus that applies when a Party contains a particular combination of Classes or
Skills. Relationship between members scales teamwork separately.
_Avoid_: Combo, Bonus (alone), Chemistry

**Campaign**:
A plotted set of Quests and Inciting Events, triggered through the World Engine, that changes
the world as it unfolds and can be won or lost.
_Avoid_: Storyline, Arc, Chapter, Season

**Inciting Event**:
A change in the world, drawn at random or prescribed by an active Campaign, that produces
Quests or alters the World State (R6). Unlike a Random Event it may produce Quests; its
generator is a later module that belongs with Campaigns (DL-82).
_Avoid_: Trigger, Hook, Plot point

**Random Event**:
Something that befalls the player's Guild or the Heroes on its Roster as time passes, drawn at
night by the Random Events module from content with conditions (R3, R6). By DL-82 it befalls
the player's Guild alone, a fourth accepted exception to ADR-0002; it is an outcome, never a
choice the player answers; it never causes a Death; and, unlike an Inciting Event, it never
produces a Quest.
_Avoid_: Incident, Happening, Event (alone)

### The world and time

**World State**:
Everything the engine knows: Guilds, Heroes, Patrons, Regard, Quests, the Board, Items, the
installed modules' slices, and the History. A save is a snapshot of it.
_Avoid_: Game state, Model, Database, Save (for the data itself)

**World Engine**:
The part of the engine that advances the World State Turn by Turn, according to the rules and
each Guild's controller, calling each installed module at its hooks.
_Avoid_: Simulation, Game loop, Orchestrator

**Generator**:
A part of the engine that draws new things into the world from the seed, at creation and as
time passes: the Heroes, Guild, Patron and Quest Generators, and the Transfer Generator's bids.
The Random Event and Inciting Event generators come later, as modules (requirements §2).
_Avoid_: Factory, Spawner

**State Engine**:
A part of the engine that advances one kind of entity each night: the Hero State Engine
(healing, Morale drift, Regard decay, Retirement), the Guild State Engine (Upkeep and the
Bankruptcy floor) and the Patron State Engine (Patron Regard recovering towards neutral).
_Avoid_: System, Manager, Updater

**Event**:
A typed record of one change the engine made, saying when it happened and whom it concerns.
Engine calls return events, never prose; front ends narrate them and the History keeps each as
an entry (ADR-0003). A module's own events are typed by the module.
_Avoid_: Message, Log line; "Event" alone for a Random or Inciting Event

**History**:
The record inside the World State of every event, kept per Guild and per Hero with a list of
Milestones; never bounded, and no entry is dropped (R36). Every discrete change is an entry;
nightly drift, and the changes DL-84 names, are recorded only when they cross a band.
_Avoid_: Event log, Journal, Audit trail

**Milestone**:
A History entry marked as one a Hero's or a Guild's page always shows first: a Level gained,
a Death, a Transfer, a Campaign beat. No entry is dropped; a Milestone is one that is surfaced.
_Avoid_: Highlight, Achievement, Key event

**Day**:
Three Turns: morning, afternoon and night.
_Avoid_: Tick, Round

**Turn**:
The unit by which the World Engine advances, three to a Day. The Board and Market refresh in the
morning and the Rivals act in the afternoon; at night Quests conclude, and healing, Morale
drift, ageing, Upkeep and the ending checks fall, as Random Events will once that module exists
(R3, approach §2). Quests span several Days.
_Avoid_: Step, Phase, Tick

**Action**:
A choice made through the engine, accepted with events or refused with a typed reason and
nothing changed: dispatching a Party, recruiting, a Transfer, a Transfer Offer or its answer,
buying, selling, equipping and unequipping gear, building an Improvement, and rebase. The player
acts between Turns, while time stands still; the Rivals act in the afternoon.
_Avoid_: Command (a front end's word), Move, Order

**Outing**:
An action that takes the Guildmaster out of the Hall: the Market, and later scouting and Patron
visits. The limit of one Outing per Turn arrives with the second kind of Outing; until then the
Market is the only one and is not limited (R4, pre-M0 review B1). When the limit comes, it binds
every Guild (DL-89). Actions inside the Hall are never limited.
_Avoid_: Action point, Move, Trip

**Fast forward**:
Playing Turn after Turn for a watched Guild until a fast-forward stop holds or a set number of
Turns has passed; it lands exactly where as many single Turns would (DL-33).
_Avoid_: Skip, Auto-play, Simulate

**Fast-forward stop**:
A typed reason fast forward halts. Some always stop it: an ending, the watched Guild's Party
coming home, a decision it needs to make, a Transfer Offer for it, and a module asking; others
only when the caller names them, such as the Unattached pool refreshing (approach §2, DL-33).
To be built: an always-on stop when the watched Guild falls below the Bankruptcy floor, and
opt-in stops for a Quest it can staff appearing (DL-85) and for a Random Event (DL-82).
_Avoid_: Interrupt, Pause, Breakpoint

**Watched Guild**:
The Guild whose Parties, decisions and Transfer Offers stop fast forward, named by whoever runs
it: in a front end, the player's. So no rule needs to ask which Guild is the player's (DL-33).
_Avoid_: Current Guild, Active Guild

**Rebase**:
The action by which a game in play adopts the rules now in force: its configuration becomes the
current defaults, and a Milestone records when (pre-M0 review D1). Until then a loaded game
plays under the rules it began with, a field newer than the save reading as today's default
(DL-84). DL-82 extends rebase to modules' tunables (to be built).
_Avoid_: Upgrade, Migration (which changes a save's shape, not its rules)

### Modules

**Module**:
A feature that plugs into the World Engine rather than the core: it owns a slice, is called at
its hooks, and changes the core's rows only through its effects (ADR-0005, DL-76, DL-77). The
core is a complete game with none installed. By DL-82 a game's modules are chosen when it
begins, on by default, and recorded in its save, and an older save takes one on only when the
player adopts it (to be built). Which later features are modules is decided per feature, in its
epic (DL-89).
_Avoid_: Plugin, Extension, Add-on, Mod

**Module slice**:
The part of the World State a module owns, under its id. The core copies it with the rest of
the world and never reads inside it; the module makes, migrates and validates it and keeps its
own tunables there (DL-76, DL-78).
_Avoid_: Module state, Namespace, Store

**Hook**:
A point in the Turn where the World Engine calls each installed module: morning, afternoon and
night. At a hook a module reads the world without changing it, changes its own slice, makes its
own events, applies effects and may ask fast forward to stop (DL-77). DL-82 adds a hook at
rebase, through which a module adopts its current tunables (to be built).
_Avoid_: Callback, Handler, Listener

**Effect**:
One of the few typed changes a module may make to the core's rows, each run by the core's own
rule and explained by the core's own event naming the module: adjusting Morale, Wealth or
Regard, injuring a Hero, and offering a Quest (DL-77). A new kind is an engine change with a
decision of its own, and by DL-82 no effect reaches an Unattached Hero (to be built). Not a
Trait's effect, the buff or penalty a Trait applies.
_Avoid_: Write, Mutation, Command

### Setup

**Background**:
The named narrative history of a Guild or a Hero, with two owners as Trait has: a Guild's,
chosen by the player for theirs at setup and drawn for a Rival's, and a Hero's, drawn at
generation (R5, R12). Flavour only: no rule reads it, and DL-85 keeps it so for now, to be
revisited.
_Avoid_: Backstory, Origin, Lore

**Scenario**:
A preset starting situation with some randomness: the opening debt, Roster, resources and any
authored Campaign a new game begins with.
_Avoid_: Difficulty, Preset, Mode, Start

### Trade and standing

**Wealth**:
A Guild's coin: the currency that buys Items, recruits Heroes, pays Upkeep and builds the
Hall.
_Avoid_: Gold, Money, Funds, Treasury

**Upkeep**:
The recurring cost of the Roster's wages and the Hall's maintenance.
_Avoid_: Wages (alone), Salary, Running costs

**Hall**:
The Guild's premises: an infirmary, a training yard and quarters, each raised by Improvements
and, later, staffed by Workers.
_Avoid_: Base, Headquarters, Guildhall, Facilities

**Improvement**:
A one-off purchase for Wealth that raises a Hall facility's grade.
_Avoid_: Upgrade, Building, Feature

**Worker**:
A non-Hero person hired for a wage within Upkeep, whose Stat scales what a Hall facility does.
_Avoid_: Staff, Employee, NPC, Hireling

**Market**:
Where the Guild buys and sells Items. An Item sells for less than it costs to buy.
_Avoid_: Shop, Store, Exchange, Bazaar

**Market Engine**:
The part of the engine that refreshes the Market and prices Items.
_Avoid_: Economy, Shop system

**Item**:
A thing the Guild owns and equips or expends: permanent gear that a Hero carries, or a
consumable that is used up.
_Avoid_: Equipment (for the general concept), Gear (for consumables), Inventory

**Gear**:
An Item a Hero carries in one of their slots, changing their Stats; a slot holds one Item at
most (R30, DL-48).
_Avoid_: Equipment, Kit

**Consumable**:
An Item a Party is given at dispatch and the Quest Engine uses up; what is left comes home with
the Party (R23, R30, DL-50).
_Avoid_: Supplies, Potion (for the general concept)

**Holding**:
The Items a Guild owns that no Hero carries and no Party has taken (DL-48).
_Avoid_: Inventory, Stash, Vault

**Common Item**:
An Item that is not an individual: tools, potions, ordinary gear. It has a quantity and may
be held in several places at once, including the Market.
_Avoid_: Stackable, Generic item, Commodity

**Unique Item**:
An Item that is an individual, magical, special or belonging to a Campaign, with exactly one
holder at a time.
_Avoid_: Artefact, Legendary, Named item

**Unattached Hero**:
A Hero on no Roster, in a pool the Heroes Generator refreshes and every Guild recruits from
for a signing fee.
_Avoid_: Free agent, Mercenary, Recruit (as a noun), Candidate

**Transfer**:
Moving a Hero between Guilds for a fee, in either direction. Transferring out a Hero costs the
Morale of each Hero who stays and held them in high Regard (R28, pre-M0 review D5); by DL-82 it
also lowers those Heroes' Regard for the Guildmaster, and by DL-85 Heroes content or close with
their Roster refuse to leave (both to be built).
_Avoid_: Sell, Buy, Trade, Signing, Poach (until poaching is a distinct thing)

**Transfer Offer**:
A pending bid for a Hero, held until accepted, declined or expired. A Rival answers a bid at
once and the player's Guild through Transfer Offers: a difference of controller, not a rule
about the player's Guild (DL-57, DL-85).
_Avoid_: Bid, Request

**Transfer lock**:
The Days after a Transfer during which that Hero cannot be transferred again: 90, the same for
every Guild (DL-60, DL-69; confirmed by DL-85).
_Avoid_: Cooldown, Embargo

**Transfer Generator**:
The weekly night rule by which Rivals bid for one another's Heroes. It never takes from the
player's Guild, an accepted exception to ADR-0002 (plan §1, DL-59).
_Avoid_: Transfer window, Trade market

**Fame**:
A Guild's renown, rising and falling with Quest outcomes; never spent. It orders the Rankings
and gates which Unattached Heroes will sign for a Guild (R10, pre-M0 review B4); dealings with
Patrons, Contacts and Inciting Events will move it later. DL-85 accepts it as dormant for now:
its further uses wait for Scouting and Contacts.
_Avoid_: Reputation, Prestige, Renown, Standing

**Rankings**:
Every Guild in play ordered by Fame or by Wealth; a folded Guild is out of them (R10, DL-28).
Ordering by any other Guild statistic is a later feature (requirements §2).
_Avoid_: League, Leaderboard, Ladder, Score

### Endings

**Ending**:
How a Guild's story closes: Retirement, Bankruptcy or Roster wiped in the first build; Defeated
by a Rival, Hall lost, capture and indenture, and Ultimate Campaign Victory later (R34). The
player's Guild's ending ends the game; a Rival's folds it (pre-M0 review A2, DL-28), save that
by DL-83 a Rival whose Guildmaster retires continues under a successor (to be built).
_Avoid_: Game over (for a Rival), Loss, Defeat (alone)

**Retirement**:
A Hero or Guildmaster leaving the game at the end of a career. A Hero's is a yearly chance that
rises with each year of age past a threshold and is higher while injured (R20, DL-29); by DL-83
it reads the Hero's injury history (to be built). A Guildmaster's comes at a fixed age and is an
ending (R34, DL-28).
_Avoid_: Ageing out, Quitting

**Succession**:
A new Guildmaster taking over a Rival Guild whose Guildmaster retires, the Guild, its Roster and
its Wealth continuing (DL-83, superseding DL-28's fold). To be built; until then such a Rival
folds.
_Avoid_: Replacement (a new Rival after a fold), Handover

**Bankruptcy**:
A Guild's Wealth staying below the Bankruptcy floor for a grace of Days, after which the Guild
ends. For the player's Guild the game ends; a Rival folds: its Heroes go to the Unattached pool,
its Unique Items to the Market, and its stacks of Common Items are discarded (pre-M0 review D6
as DL-51 and DL-54 carry it out; words aligned by DL-87).
_Avoid_: Insolvency, Game over, Ruin

**Roster wiped**:
The ending of a Guild with no Heroes on its Roster and too little Wealth to sign the cheapest
Unattached Hero (R34, DL-28).
_Avoid_: Wipe-out, Party wipe

**Fold**:
What a Rival's ending does to it: it leaves play and the Rankings, its Parties in flight are
disbanded unresolved, its Heroes go to the Unattached pool, its Unique Items are sold to the
Market and its stacks of Common Items discarded, and a new Rival replaces it after a delay of
30 Days (DL-28, DL-51, DL-54; words aligned by DL-87; the delay confirmed by DL-83). Only a Rival
folds.
_Avoid_: Collapse, Dissolution, Elimination, Game over (for a Rival)

### Measuring

**Harness**:
The program that plays many seeded games under the automatic policy and reports the counters
every balance decision is read against (N10). Each game it plays is a twenty-year slice, not a
whole game (DL-83). By DL-82 a run with the default modules carries the balance targets, and a
run of the core alone guards the core.
_Avoid_: Simulator, Test bot, Benchmark

**Automatic policy**:
The harness's stand-in for the player: fixed rules that play the player's Guild through the same
actions a human would. DL-83 adds an active policy beside it, and the harness reports both (to be
built).
_Avoid_: AI, Bot, Autoplayer
