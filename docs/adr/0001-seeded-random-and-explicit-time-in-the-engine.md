# The engine uses a seeded random source and an explicit clock

The engine takes a seeded random generator whose state is part of the World State, and time
advances only when `advance` is called. It never reads the platform's random source or clock.
We chose this over global randomness because the engine is meant to be measured by a harness
over thousands of games, and a harness without a seed compares noise, not rules; it also makes
a reported bug replayable from its seed and the player's choices. Front-end cosmetics may use
global randomness, since they are outside the World State.

## Consequences

Every rule that draws a random number is handed the generator. Inserting a new draw into an
existing sequence changes every later draw, so old seeds produce different games after a rule
change; that is accepted because saves are snapshots, not seeds.
