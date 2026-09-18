# Heroesim

A guild-management simulation. The player runs an organisation of heroes, takes on paid
work, and sends them out to do it; the interesting output is the story of what happened
to them, not the score.

## Language

### People and groups

**Guild**:
The organisation the player runs: its Roster, its money, and its Standing with Patrons.
_Avoid_: Company, Lodge, Order, Agency

**Guildmaster**:
The player's character within the world — a modelled individual with their own Stats,
Traits, Background and Regard for others. Distinct from *the player*, who is the human
at the keyboard, and not a member of the Roster.
_Avoid_: Master, Owner, Boss, Player

**Hero**:
A named individual on the Roster, with their own Traits, history and Regard for the
Guildmaster and for other Heroes. Heroes are people rather than units: they can refuse
work, resent a decision, and leave.
_Avoid_: Adventurer, Character, Unit, Employee

**Roster**:
The set of Heroes currently in the Guild's employ. Deliberately small, so that losing
one is felt.
_Avoid_: Stable, Team, Squad

**Party**:
The Heroes assigned to a single Commission, drawn from the Roster and existing only for
that Commission's duration.
_Avoid_: Team, Squad, Band, Group

**Patron**:
A person or body that offers Commissions, holds Regard for the Guild based on how
previous ones went, and extends or withholds further work accordingly.
_Avoid_: Client, Employer, Quest-giver

**Sphere**:
The world a Patron's work comes from — the river towns, the temple, the mine consortium
— which shapes the flavour of the Commissions they post. Losing a Patron's Regard costs
you access to their Sphere, not merely a number.
_Avoid_: Domain (collides with the domain-model sense), Faction, Region, Category

### Rivals

**Rival**:
Another Guild: an identity, a Roster and a Standing, competing for Commissions and for
people. Deliberately not the same type as the player's Guild — a Rival has no Hall, no
Board and no coin of its own.
_Avoid_: Competitor, Enemy, Faction, Opponent, NPC guild

**Transfer**:
Moving a Hero from a Rival's Roster to your own with that Rival's consent, for a fee.
_Avoid_: Buy, Trade, Signing, Purchase

**Poaching**:
Approaching a Hero on a Rival's Roster whose Regard has soured, without that Rival's
consent. Cheaper than a Transfer, and it costs you their goodwill.
_Avoid_: Stealing, Headhunting, Raiding, Tapping up

### Regard and standing

**Regard**:
A directed opinion one party holds of another, carrying a value, the reason it last
moved, and its nature. Held between Heroes; by a Hero for the Guildmaster, or for the
Rival that employs them; by a Patron for a Guild; and by a Rival for your Guild.
_Avoid_: Reputation, Relationship, Opinion, Affinity, Loyalty, Morale

**Nature**:
What kind of thing a Regard is — neutral, a bond, a rivalry. The single place where new
kinds of relationship are added.
_Avoid_: Type, Kind, Category, Flavour

**Standing**:
A Guild's overall repute, derived from the Regard its Patrons hold for it. It has
exactly one job: gating the calibre of Applicants. Regard gets you work; Standing gets
you people. Commissions are never gated on Standing.
_Avoid_: Reputation, Fame, Rank

**League**:
Every Guild ordered by Standing. A view of something already modelled, never a currency
of its own — the only way to climb it is to earn Patrons' Regard.
_Avoid_: Ladder, Ranking, Leaderboard, League Standing, Score, Season

### Character

**Stat**:
One of four numeric capabilities, used to resolve Checks: **Might** (force), **Craft**
(expertise and making), **Nerve** (composure under fear) and **Guile** (cunning and
persuasion). The same four serve the Guildmaster, against Guild-side Checks.
_Avoid_: Attribute, Ability, Score, Skill

**Trait**:
A named fact about a person that conditionally modifies checks or changes how they
behave. The universal currency of character — a Background, an Injury and a Scar are all
Traits, so a person's history is readable as the Traits they have accrued.
_Avoid_: Perk, Flaw, Status, Condition, Modifier, Buff

**Background**:
The Traits a Hero or Guildmaster began with, before the Guild.
_Avoid_: Origin, Backstory, History

### Work and money

**Commission**:
A piece of paid work offered by a Patron, carrying terms, a fee and a deadline, and
undertaken by a Party.
_Avoid_: Quest, Job, Mission, Contract. Never use for the accounting sense of
"commission" (a percentage of a fee) — that sense has no place in this codebase.

**Board**:
Where the Commissions currently on offer are posted. A Patron whose Regard has soured
posts less to it, or nothing at all.
_Avoid_: Job board, Market, Quest log, Noticeboard

**Upkeep**:
The recurring cost of keeping the Roster, owed whether or not Heroes are working.
_Avoid_: Wages, Salary, Maintenance, Payroll

**Hall**:
The Guild's premises, and the only thing coin buys besides Upkeep — an infirmary that
shortens Injuries, a training yard, quarters that slow Regard decay.
_Avoid_: Base, Headquarters, Guildhall, Facilities

**Applicant**:
Someone offering to join the Roster. Their calibre is gated by Standing.
_Avoid_: Candidate, Recruit, Prospect

### Resolution

**Vignette**:
An authored template for a Beat, carrying slots filled from world state — this Hero,
this Trait, this Patron's Sphere — and conditions for when it may fire. Vignettes are
content on disk; the engine never changes to add one.
_Avoid_: Template, Script, Card, Snippet, Event

**Beat**:
One incident within a Commission — an ambush, an obstacle, a discovery, a quarrel —
resolved by a Check and narrated as roughly a paragraph. A Commission is a run of Beats.
_Avoid_: Encounter, Scene, Step, Round. Not to be confused with the events the engine
emits: a Beat happens in the world, an event is how the engine reports it.

**Check**:
Resolving a Beat against one of a Hero's Stats, conditionally modified by their Traits
and by the Party's Backing.
_Avoid_: Roll, Test, Save, Contest

**Backing**:
What the Guildmaster contributes to a Party they are not part of — the modifiers their
Stats, Traits and Regard with each member confer on it. Computed when the Party is
committed, and fixed for that Commission's duration.
_Avoid_: Buff, Support, Bonus, Aura, Morale

### What befalls a Hero

**Injury**:
A Trait that heals, carrying the span of Days after which it lifts.
_Avoid_: Wound, Damage, Hurt

**Scar**:
A permanent Trait left by something that happened, physical or mental.
_Avoid_: Trauma, Affliction, Permanent injury

**Death**:
Permanent. A dead Hero leaves the Roster but not the Guild's history — past Heroes stay
readable.
_Avoid_: Loss, Removal, Casualty

**Departure**:
A Hero leaving the Roster by choice, driven by low Regard. They may return.
_Avoid_: Quitting, Resignation, Desertion

**Retirement**:
A Hero leaving the Roster at the end of a career, by age. Distinct from Departure in
that it ends well.
_Avoid_: Ageing out, Retiral, Superannuation

### Time

**Day**:
The atomic unit by which the world advances. Commissions occupy a span of Days; the
player advances in stretches rather than one at a time.
_Avoid_: Turn, Tick, Round, Step

**Career**:
One playthrough: the span from taking over the Guild to the Guildmaster's retirement,
some twenty or thirty years. Ends in a reckoning of what the Guild became — or earlier,
in insolvency.
_Avoid_: Run, Game, Playthrough, Campaign, Session
