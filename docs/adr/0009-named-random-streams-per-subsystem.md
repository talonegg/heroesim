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
