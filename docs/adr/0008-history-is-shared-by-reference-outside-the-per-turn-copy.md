# The History is append-only and shared by reference outside the per-Turn copy

*Amended by [ADR-0011](0011-write-once-rows-are-shared-by-reference-outside-the-per-turn-copy.md)
(2026-10-05, DL-203): the copy is made by hand (`copyWorld`), not with `structuredClone`, and the
write-once rows are frozen and shared by reference outside it, as the History is.*

*Amended 2026-10-06 (DL-206 items 20 and 21, DL-211): the History stays append-only, but not
every event is an entry. The Unattached pool's comings and goings of a Hero no entry names, a
Hero generated into the pool and their leaving it unhired, are emitted and not appended
(`engine/src/record.ts`, which hands the rest to `append`): they are not History, so nothing is
removed. A hired Hero's History begins at their signing.*

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
