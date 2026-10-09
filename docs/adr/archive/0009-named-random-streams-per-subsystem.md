# ADR-0009 as it stood to 2026-10-07

The wording of [ADR-0009](../0009-named-random-streams-per-subsystem.md), word for word, before it was
restated on 2026-10-08 from this text and every decision since (DL-222). Only links are re-pointed
to where their files are from here.

---

# One named random stream per subsystem, not one stream for the engine

The engine keeps a map of seeded generators in `world.rng`, one per subsystem (generation,
board, quests, heroes, rivals, events, market), each seeded from the master seed and its own
name. A module that draws random numbers registers a stream of its own. We chose this over a
single stream because with one stream every new subsystem that draws a random number shifts
every later draw, so adding Items in a later increment would change what every existing seed
plays; with named streams a seed keeps producing the same Board and the same Heroes after the
Market is added.

## Consequences

A rule must draw from the stream that owns it, and a test can check each stream's state
advances only when its subsystem runs. Inserting a new draw inside one subsystem still shifts
that subsystem's later draws; that is accepted, since saves are snapshots and not seeds.

*Amended 2026-09-26.* The list above named seven streams by area; the plan showed that
"subsystem" has to mean *the thing that draws*, or a later milestone's draws land in an earlier
milestone's stream and the pool a seed produces changes when Levels are added. The core streams
are `generation`, `board`, `quests`, `encounters`, `pool`, `heroes` (the Hero State Engine),
`progression`, `rivals` and `market`, each added in the milestone that introduces its
subsystem; `events` is dropped from the core, since Random Events is a module and registers
its own. The rule: a new subsystem gets a new stream and never shares an old one. Decided by
the owner (pre-M0 review D7).

*Amended 2026-09-28.* "Subsystem" means a *component*, in the sense of
[`../approach.md`](../../approach.md) §1 (the Quest Engine, the Hero State Engine, the Market Engine
and so on). A new draw inside an existing component uses that component's stream, as ageing's
decline draws from `heroes` and Loot, part of a Quest's outcome, from `quests`; it shifts that
component's later draws, which the Consequences accept. A new component still gets a new stream
and never shares an old one. The Transfer Generator, a component of its own, draws from
`rivals`, and that is an accepted exception rather than a stream of its own. This records what
the build already does, so no seed's game changes. Decided by the owner (DL-84).

*Amended 2026-09-30.* A Guildmaster's Portrait (`portraits`, v1.1.2-S3) and descriptive
Attributes (`descriptions`, v1.1.2-S5) are drawn on streams of their own, though both are part
of generating a Guildmaster. Drawn from `generation`, they would shift every later draw of it,
and v1.1.2 moves no existing draw, so that a seed plays as it did in v1.1.1. This is an accepted
exception, like the Transfer Generator's, and each is appended last to the streams. Decided by
the owner (DL-125; built in DL-130).

*Amended 2026-10-01.* The Guildmaster's Portrait stream is named `gm-portraits`, not `portraits`,
from v1.1.2-S7, before `v1.1.2` was released, so that Heroes' Portraits can be drawn on a stream
of their own, `hero-portraits`, later. No released save held `portraits`. Decided by the owner
(DL-134, DL-135; built in DL-137).

*Amended 2026-10-01, again.* A Hero's Portrait (`hero-portraits`) and a Hero's Appearance and
Biography (`hero-descriptions`, v1.1.3-S6) are drawn on streams of their own, though both are part
of generating a Hero. Drawn from `generation` or `pool`, which the Heroes Generator draws from, they
would shift every later draw of those streams, and v1.1.3 moves no existing draw. They are two, not
one, so that Hero pictures added later move no Hero's text, and apart from the Guildmasters' two, so
that neither role's draws move the other's. They are accepted exceptions, as the 2026-09-30 ones are,
each appended last to the streams, `hero-portraits` before `hero-descriptions`. Each Hero takes a
fixed number of draws of each, whatever is written. Decided by the owner (DL-134 item 2, DL-135
item 6; built in DL-142).
