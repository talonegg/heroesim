# Heroesim — design

The state of the design after a full grilling session. Every decision here was made
deliberately; where a decision was hard to reverse, surprising, or the result of a real
trade-off, it also has an ADR in [`adr/`](./adr/). The vocabulary is in
[`../CONTEXT.md`](../CONTEXT.md) and this document uses it precisely.

## The shape of the game

You run a Guild of heroes: you take paid work from Patrons, choose who to send, and read what
happened to them. It is a management game, not a role-playing one — you never control a Hero
directly, and you never leave the hall.

The thing the game is *for* is the story. Success looks like remembering Brenna, the archer who
kept going after Ashfall, not like remembering the composition that reached year twenty. Where
story and optimisation pull in different directions, story wins; that single commitment settles
more arguments than any other decision in this document.

It runs in a terminal, and it is built for an audience of one. Showing it to other people is a
stated non-goal — which is what makes it legitimate to skip onboarding, settings and save
migration entirely.

## Time and the loop

The world advances in **Days**. You move through them in stretches rather than one at a time,
stopping when something wants your attention.

In a stretch: the **Board** refreshes with the Commissions currently on offer; you commit
**Parties** to the ones you want; Parties are away for a span of Days and come back with a
report; **Upkeep** falls due whether or not anyone is working; **Applicants** turn up; and
**Rivals** take the Commissions you passed on.

You do not intervene once a Party has left. All of your agency sits in three places — which
Commissions you take, who you send, and the **Backing** you give them. If it ever feels passive,
the designed remedy is rare mid-Commission decision points where a Party sends word and waits,
not live tactical control.

## The Guild

The **Roster** is deliberately small — six to twelve active — because the whole design depends on
you flinching when a name goes grey.

The **Guildmaster** is you, in the world: a modelled person with Stats, Traits, a Background and
Regard, whom Heroes can like, fear or resent. They never join a Party. Their Stats resolve
Guild-side Checks — negotiating a fee, recruiting, talking round a Hero who is drifting — and
they shape what a Party can do through its **Backing**, computed when the Party is committed and
fixed for that Commission.

Coin is tight. **Upkeep** is owed continuously, and the only other thing to buy is the **Hall**:
an infirmary that shortens Injuries, a training yard, quarters that slow Regard decay. There is
deliberately no equipment — gear would modify Checks, which is already Traits' job.

## People

Every person has four **Stats** — **Might**, **Craft**, **Nerve**, **Guile** — and any number of
**Traits**. Four Stats keeps a Hero legible at a glance; a wider spread turns eight people into a
spreadsheet.

**Traits are the universal currency of character.** A Background is the Traits you started with.
An Injury is a Trait that lifts after a span of Days. A Scar is one that never does. This means a
person's whole history is readable as the Traits they have accrued, and one mechanism —
"a named fact that conditionally modifies a Check" — serves all of it.

**Regard** is a directed opinion, carrying a value, the reason it last moved, and a *nature*.
It runs between Heroes, from a Hero to the Guildmaster or to the Rival that employs them, from a
Patron to a Guild, and from a Rival to yours. Nature is the single place new kinds of
relationship get added — romance, when it comes, is a nature rather than a new system.

A Hero can leave you five ways: **Injury** and **Scar** change them, **Death** is permanent,
**Departure** is them walking out over low Regard, and **Retirement** is a career ending well.
The last one matters more than it looks: without it every exit is a failure and the tone flattens.
A dead Hero leaves the Roster but not the Guild's history.

Heroes can refuse work — through low Regard, or through a Trait that says *not this, not for
them*. You can insist, and it costs Regard and pushes them toward Departure. The refusal is a
price, never a wall.

## Work

**Patrons** offer Commissions, hold Regard for your Guild, and each belong to a **Sphere** — the
river towns, the temple, the mine consortium. The Sphere is what makes losing a Patron cost
something specific rather than numeric: you didn't lose twelve points, you lost temple work.

A **Commission** carries terms, a fee and a deadline. It resolves as a run of **Beats** — an
ambush, an obstacle, a discovery, a quarrel — each settled by a **Check** against a Hero's Stat,
modified by their Traits and the Party's Backing, each emitting events. One Beat is about one
paragraph of the report you read when they return.

Beats come from **Vignettes**: authored templates with slots the engine fills from world state —
this Hero, this Trait, this Patron's Sphere. The story quality comes from specificity to the
people involved, not novelty of situation, so a familiar bridge is fine when it is *Brenna* who
freezes at it. Vignettes are content; adding one is writing a file, never changing the engine.

## Rivals and the League

Other Guilds exist, each with a visible **Roster** and a **Standing**. They are not the same type
as your Guild — no Hall, no Board, no coin — but their Heroes are ordinary Heroes, with Traits
and Regard you can read.

Heroes move between Guilds two ways. A **Transfer** is above board: you pay the Rival a fee and
they consent. **Poaching** is not: you approach a Hero whose Regard for their own Guild has
soured, cheaper, and it costs you that Rival's goodwill — which bites later, because a soured
Rival refuses Transfers, poaches yours harder, and takes more off your Board. The polite route
only exists as a real choice because the cheap one bills you.

The consequence worth noticing is symmetry: Rivals poach from you by exactly the same rule, so
**Regard is what defends your Roster**, not decoration. And Departure and poaching turn out to be
one mechanism seen from two sides — the Hero who walks out is the Hero someone else approached.

Rivals take Commissions you decline, which raises their Standing and drifts that Patron's Regard
away from you. That is what makes the Board a decision rather than a queue. Their Rosters churn:
they lose people on that work, recruit replacements, and age.

The **League** is simply every Guild ordered by Standing. It is a view of something already
modelled, never a currency — the only way to climb it is to earn Patrons' Regard, which is to say
by playing well. This is deliberate: a league score you could push directly is the most reliable
way to turn a story game into a spreadsheet.

## The Career

A **Career** runs from taking over the Guild to the Guildmaster's retirement, some twenty or
thirty years, and ends in a reckoning of what the Guild became. You start with a going concern —
three or four Heroes who already have history and Regard for one another, and a debt — rather
than an empty Roster, because an empty Roster means your first hour is recruitment admin before
any story exists.

Insolvency is the only way to *lose*. Retirement ends a Career without being a failure.

## Technical shape

TypeScript on Node 22+, Vitest, a single package with `engine/` and `cli/` and a lint rule
forbidding `engine/` from importing `cli/`. Workspaces when a second front end actually exists,
not before.

The engine is a pure library: no files, no output, no clock, no global random. Randomness and
time are injected, so a Career is reproducible from its seed and the whole simulation is testable
without a terminal (ADR-0001). It narrates by emitting typed events — never formatted prose — so
that a live view and, later, a graphical client are the same stream rendered differently rather
than engine rewrites (ADR-0002). Saves are state snapshots, not replayed event logs, because
replay would invalidate every save on every balance change (ADR-0004).

## Deliberately not doing

Each of these was considered and rejected on the record, so that nobody later "fixes" it:

- **No combat system.** Commissions resolve as Beats (ADR-0006).
- **No equipment.** It would duplicate what Traits already do.
- **No event sourcing**, despite a seeded RNG making it look free (ADR-0004).
- **The Guildmaster never takes the field** (ADR-0007).
- **Rivals are not fully simulated.** They take work and churn; they do not run Beats.
- **No separate league score.** The League is Standing, ranked.
- **No multiplayer, onboarding, settings or save migration.** Audience of one.

## Not settled yet

This was a design session, not a balance pass. Still open: the actual numbers on Stats and
Checks; how often the Board refreshes and Upkeep falls due; how many Patrons and Rivals a world
holds; the concrete Vignette authoring format; the shape of the terminal interface; and how long
a Commission typically runs in Days.
