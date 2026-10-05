# The write-once rows are frozen and shared by reference outside the per-Turn copy

*Amends ADR-0008.* The engine still produces each Turn's state, and each action's, by copying
`world` once and mutating the copy, but the copy is made by hand (`copyWorld`,
`engine/src/world-copy.ts`), not by `structuredClone`. The rows that are out of play for good,
which no rule writes again, are frozen all the way down and shared by reference between the world
copied and its copy, as the History is shared between documents: the Heroes who are dead, retired
or gone from the pool unrecruited, the retired Guildmasters, and the folded Guilds. Every other
value is copied, each object's keys in their order, so that the copy equals the one
`structuredClone` makes, key for key and in the same order at every depth, and the save is the same
to the byte. Every Hero's and Guildmaster's texts, the Appearance, Biography and Birthplace, are
shared too: they are strings, which the hand copy hands on by reference and never copies, so they
need no freezing and no table of their own. This is the historical set DL-84 item 6 decided, in the
spirit of ADR-0008, built without a new section of the document.

We chose this over moving the write-once rows to a section of their own beside `world` (the shape
data-model §7 sketched), which would have changed the saved shape, every fingerprint and every
reader of the tables, for a saving the hand copy gets with the shape kept; and over keeping
`structuredClone`, whose copy of the year-20 world allocates about 0.7 MiB and takes about 1.6 ms a
Turn (DL-174), most of it the out-of-play rows and the texts. A JSON-style copy runs at about a third
of `structuredClone`'s cost (DL-174).

The owner's answers (2026-10-05, DL-203), verbatim:

1. Design: "(c) Custom copy (Recommended)": same saved shape, no schema change, fingerprints hold;
   replace the per-Turn `structuredClone` of `world` with a hand copy that reuses frozen write-once
   rows by reference and deep-copies live rows (insertion order kept); a JSON-style copy runs at
   about 1/3 of structuredClone's cost (DL-174). A hidden write to a frozen row throws, which
   doubles as the "nothing writes the shared data" test.
2. What is shared: "Departed + texts + retired GMs": dead, retired and left-pool Heroes' rows, plus
   every Hero's and Guildmaster's texts (appearance, biography, birthplace), plus retired
   Guildmasters and folded Guilds. This closes the Module `adjustRegard` hole: a Module may no
   longer adjust a retired Guildmaster's Regard (refused as it refuses departed Heroes,
   `outOfPlay`); no shipped content uses it.
3. The Gate's per-Turn copy-time line: "Mean ≤ baseline +25% (Recommended)": the mean copy time
   over the run, the baseline measured at S17's full gate, may grow at most 25% without a DL entry.

## Consequences

A row is frozen by the first copy made of a world in which it is write-once, not as it leaves play:
the Turn or the action that took it out of play has ended by then, with every write of that night
made (a Hero who retires on a night is written, and then their gear moved, the same night). From
that copy on, a write to it is a bug, and since the engine's modules are ES modules, in strict mode,
it throws a TypeError where it happens; a test plays many Turns under the automatic policy and the
probe module to hold that nothing writes one. Freezing reaches into the document the copy was made
from: its write-once rows are frozen as they are shared, their values unchanged. A document is a
value: no front end changes one in place, and a test that changes a played document works on its
own copy (`structuredClone` makes rows that are not frozen).

A loaded save's rows are not frozen; the first copy freezes those that are write-once. The saved
shape, the schema version and `serialise` are unchanged, and a save written before this decision
loads and plays as it did.

A Module sees the Turn's world through the read-only view (`read-only.ts`), a Proxy that hands back a
frozen object's own properties as they are, as a Proxy must. A Module's `adjustRegard` refuses a
retired Guildmaster as a holder (`holder-gone`), as it refuses a Hero out of play and the
Guildmaster of a folded Guild; a Rule that writes a write-once row is the bug the freeze finds.

The copy's time and the World State's size as each year ends are harness measures, and the Gate
(`harness/gate.json`) holds the mean copy time over a full run within 25% of its baseline.
