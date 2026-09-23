# Heroesim

A guild-management simulation. The player runs a Guild of Heroes, takes Quests from Patrons,
chooses who to send, and grows the Heroes and the Guild over years. The engine is mechanical
first; story-rich modules such as Campaigns and Scenarios extend it.

## Language

### People and groups

**Guild**:
An organisation of Heroes with a Roster, a Hall, Wealth and a place in the Rankings. The
player's Guild and Rival Guilds are both Guilds.
_Avoid_: Company, Agency, Faction

**Guildmaster**:
The player's character within the world: a named person whose Stats and Traits bear on
running the Guild, never on fighting. Distinct from the player, the human at the keyboard.
_Avoid_: Player, Owner, Boss

**Hero**:
A named individual on a Guild's Roster, described by Attributes, Stats, Skills, Traits and States.
_Avoid_: Adventurer, Character, Unit, Employee

**Roster**:
The set of Heroes a Guild currently employs.
_Avoid_: Team, Squad, Stable

**Party**:
The Heroes assigned to one Quest, existing for that Quest's duration.
_Avoid_: Team, Squad, Band

**Patron**:
A person or body that offers Quests to Guilds.
_Avoid_: Client, Employer, Quest-giver

**Contact**:
A non-player character the player can deal with who assists or hinders Quests, influences the
world as it advances and affects Campaign progress, but does not offer Quests.
_Avoid_: NPC, Ally, Informant

**Rival Guild**:
Any Guild the player does not run. It competes for Quests, Heroes and Rankings.
_Avoid_: Enemy, Opponent, AI guild, Competitor

### What a Hero is made of

**Attribute**:
A fixed or slowly changing fact about a Hero: name, sex, age, Background, Class.
_Avoid_: Property, Field, Detail

**Class**:
A Hero's fixed archetype, chosen at generation: Warrior, Rogue, Mage or Healer. It biases
Stats, gates Skills and is the first input to Synergies.
_Avoid_: Role, Job, Type, Archetype

**Stat**:
A numeric capability that a Quest is assessed against and that grows with experience. Stats
are a keyed set defined in content, each in one of four areas. A Hero's initial Stats:
Physical (Strength, Dexterity, Weaponry, Constitution, Endurance), Mental (Intelligence,
Knowledge, Perception, Wits, Courage, Willpower), Magical (Arcana, Power, Spelllore, Spirit,
Resistance) and Social (Leadership, Charisma, Diplomacy, Adaptability). A Guildmaster's: Leadership,
Influence, Negotiation, Coaching, Perception.
_Avoid_: Attribute (see above), Ability, Score

**Skill**:
A named proficiency a Hero holds, rated 1 to 5. A Hero either has a Skill at a rating or
does not have it at all.
_Avoid_: Ability, Talent, Trait (on a Hero), Perk

**Trait**:
A named binary modifier: on the Guildmaster, a buff or penalty to the Guild or to a Class; on
a Hero, a lasting mark such as one left by a healed Injury.
_Avoid_: Perk, Flaw, Buff, Modifier (as a noun)

**Level**:
A Hero's rank of experience. XP earned from Quests and training raises it, and each Level
raises Stats along the Class's growth profile.
_Avoid_: Rank, Tier, Grade

**XP**:
Experience points, earned from Quests and training, that raise a Hero's Level.
_Avoid_: Experience (alone), Points, Growth

**Potential**:
A hidden per-Hero ceiling on each Stat, shown to the player only as a hint.
_Avoid_: Cap, Ceiling, Talent, Rating

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

**Regard**:
The opinion one entity holds of another, whether Hero, Guild, Guildmaster or Patron.
_Avoid_: Reputation, Opinion, Affinity, Standing

**Relationship**:
A score between two entities computed from the Regard each holds for the other.
_Avoid_: Bond, Link, Connection

### Work

**Quest**:
A piece of work offered by a Patron and undertaken by a Party, whose outcome is determined by
the Quest Engine.
_Avoid_: Mission, Commission, Job, Contract, Task

**Quest Engine**:
The part of the engine that assesses a Quest against the Party sent and produces the outcome:
effects on each Hero, reward or penalty, Loot, and what the world learns from it.
_Avoid_: Mission Engine, Combat system, Resolver

**Board**:
Where the Quests currently on offer are posted. Every Guild draws from it.
_Avoid_: Quest log, Noticeboard, Job board

**Loot**:
Items awarded by a Quest's outcome.
_Avoid_: Drops, Rewards (for Items), Treasure

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
Quests or alters the World State.
_Avoid_: Trigger, Hook, Plot point

**Random Event**:
Something that befalls the Guild or its Heroes between Quests, drawn by the World Engine as
time passes.
_Avoid_: Incident, Happening

### The world and time

**World State**:
Everything the engine knows: Guilds, Heroes, Patrons, Regard, Quests, the Board, and the
History. A save is a snapshot of it.
_Avoid_: Game state, Model, Database, Save (for the data itself)

**World Engine**:
The part of the engine that advances the World State Turn by Turn, according to the rules and
the player's choices.
_Avoid_: Simulation, Game loop, Orchestrator

**History**:
The log of key activities kept inside the World State.
_Avoid_: Event log, Journal, Audit trail

**Day**:
Three Turns: morning, afternoon and night.
_Avoid_: Tick, Round

**Turn**:
The unit by which the World Engine advances. Quests span several Days; the player may fast
forward Turns. The Board and Market refresh in the morning; healing, Morale drift and Random
Events fall at night.
_Avoid_: Step, Phase, Tick

**Outing**:
The one action per Turn that takes the Guildmaster out of the Hall: the Market, scouting, a
Patron visit. Actions inside the Hall are not limited.
_Avoid_: Action, Move, Action point

**Milestone**:
A History entry that is never dropped: a Level gained, a Death, a Transfer, a Campaign beat.
_Avoid_: Highlight, Achievement, Key event

### Setup

**Background**:
The narrative history of the player's Guild, chosen at setup.
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

**Item**:
A thing the Guild owns and equips or expends: permanent gear that a Hero carries, or a
consumable that is used up.
_Avoid_: Equipment (for the general concept), Gear (for consumables), Inventory

**Unattached Hero**:
A Hero on no Roster, in a pool the Heroes Generator refreshes and every Guild recruits from
for a signing fee.
_Avoid_: Free agent, Mercenary, Recruit (as a noun), Candidate

**Transfer**:
Moving a Hero between Guilds for a fee, in either direction. Transferring out a Hero the
Roster holds in high Regard costs the Guild the Morale of the Heroes who stay.
_Avoid_: Sell, Buy, Trade, Signing, Poach (until poaching is a distinct thing)

**Fame**:
A Guild's renown, rising and falling with Quest outcomes and the player's dealings with
Patrons, Contacts and Inciting Events. Never spent.
_Avoid_: Reputation, Prestige, Renown, Standing

**Rankings**:
Every Guild ordered by Fame, Wealth or any other Guild statistic.
_Avoid_: League, Leaderboard, Ladder, Score

### Endings

**Retirement**:
A Hero or Guildmaster leaving the game at the end of a career. Its likelihood rises with age
and with injury.
_Avoid_: Ageing out, Quitting

**Bankruptcy**:
The Guild's Wealth staying below the floor for long enough that the game ends.
_Avoid_: Insolvency, Game over, Ruin
