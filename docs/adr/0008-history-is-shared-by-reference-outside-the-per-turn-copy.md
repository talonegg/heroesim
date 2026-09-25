# The History is append-only and shared by reference outside the per-Turn copy

The engine produces each Turn's state by copying the `world` section once with
`structuredClone` and mutating the copy. The `history` section is unbounded (R36), so copying
it each Turn would make a Turn cost grow with the age of the game. Instead `history` sits
beside `world` in the document, is appended to in place by one engine function, and is shared
by reference between the old document and the new. We chose this over capping the History
(which R36 forbids) and over keeping it in a separate document (which splits the save and
makes the harness stitch two things).

## Consequences

This is the one deliberate exception to "state in, new state out": after `advance`, the
previous document reference sees the new entries too. Nothing but the engine's append function
may touch `history`, a test asserts that entries only ever grow, and per-entity and per-type
indexes are maintained on append so a Hero's page never scans the whole log.
