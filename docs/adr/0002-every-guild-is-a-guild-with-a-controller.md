# Every Guild is a Guild; the difference is the controller

The player's Guild and every Rival Guild are the same type. What differs is the controller: the
player supplies choices to `advance`; a Rival's choices come from a disposition. No engine rule
asks whether a Guild is the player's. We chose this over a special player type because each
special case is a bug waiting to be forgotten, the owner's diagram already generates all Guilds
from one generator, and it keeps open a future where other players' Guilds are the Rivals.

## Consequences

Features that seem to belong only to the player (a Hall, a Market visit, Improvements) exist for
Rivals too, even if their disposition never uses them. Rival simulation is deliberately light:
their Quests do not run the Quest Engine in the first build.

*Amended 2026-09-25.* The last sentence is withdrawn. Rivals dispatch through the same action
and their Quests resolve through the same Quest Engine as the player's, from the first loop
milestone (M2 in [the first build's plan](../planning/archive/first-build-plan.md)). "Light" describes a Rival's *choices*, made by a
disposition, not a second resolver: one code path, and Rival Heroes Level, are injured and die
on the same rules and the same harness counters. Decided by the owner.

*Amended 2026-09-28.* A fourth accepted exception joins the three [the first build's plan](../planning/archive/first-build-plan.md) §1
recorded: Random Events, the first real module, befall the player's Guild only, and the harness
reports their effects on the player's Guild alone. The decision above stands for every other rule;
the exceptions, and every other read of a Guild's controller the engine is allowed, are listed in
the guard test `engine/src/controller-reads.test.ts`, as plan §1 now says. Decided by the owner
(DL-82), against the agents' recommendation that Random Events befall every Guild alike, which
would have needed no exception.

*Amended 2026-10-08.* The accepted exceptions are listed here, since the first build's plan, which
recorded them, is archived (DL-220). No rule asks whether a Guild is the player's, except these,
which the owner accepted:

1. The player's ending ends the game, while a Rival's ending folds that Guild (2026-09-25).
2. On the Board, the player's controller acts before the Rivals' (2026-09-25, R22).
3. The Transfer Generator never takes from the player's Guild (2026-09-25).
4. Random Events befall the player's Guild only, and the harness reports their effects on it alone
   (2026-09-28, DL-82). The guard test gains it when that module lands.

`engine/src/controller-reads.test.ts` records every read of a Guild's controller the engine may make,
each with its reason. Its entries beyond these exceptions, such as a Guild answering a Transfer
through an offer where a Rival answers through its Disposition, are the difference in controller this
decision allows, not exceptions (DL-85). A read the list does not record, or a fifth exception, needs
the owner's decision, not a commit.
