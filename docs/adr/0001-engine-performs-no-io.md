# The simulation engine performs no I/O

Heroesim runs in a terminal today, but the presentation is expected to change: after-action
reports may gain a live view, and a graphical front end may follow. So the engine is a pure
TypeScript library — it reads no files, writes no output, and does not consult the clock or a
global random source. Every front end is a renderer over the same engine.

## Consequences

Randomness and time must be *injected* rather than reached for: the engine takes a seeded RNG
and is advanced explicitly, never calling `Math.random()` or `Date.now()`. This is what makes a
run reproducible from its seed, and the entire simulation testable without a terminal.
