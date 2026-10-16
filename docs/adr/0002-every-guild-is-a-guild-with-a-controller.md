# Every Guild is a Guild; the difference is the controller

The player's Guild and every Rival Guild are the same type. What differs is the controller: the
player supplies choices to `advance`; a Rival's choices come from a Disposition. No engine rule
asks whether a Guild is the player's, but for the accepted exceptions below. We chose this over a
special player type because each special case is a bug waiting to be forgotten, the owner's
diagram already generates all Guilds from one generator, and it keeps open a future where other
players' Guilds are the Rivals.

## Consequences

Features that seem to belong only to the player (a Hall, a Market visit, Improvements, a Contract
renewed or released) exist for Rivals too, even if their Disposition never uses them. Rivals
dispatch through the same action, and their Quests resolve through the same Quest Engine as the
player's: "light" describes a Rival's choices, made by a Disposition, not a second resolver. One
code path, and Rival Heroes Level, are injured and die on the same rules and the same harness
counters (the owner, 2026-09-25).

A rule that binds every Guild alike is this decision, not an exception to it: every Guild's Heroes
Out of Contract can be taken by a free Offer, the player's included, and each Guild renews them or
lets them go by its own answer (DL-294 item 6, the owner's Q-C; DL-319).

## The accepted exceptions

No rule asks whether a Guild is the player's, except these, which the owner accepted:

1. The player's ending ends the game, while a Rival's ending folds that Guild (2026-09-25).
2. On the Board, the player's controller acts before the Rivals' (2026-09-25, R22).
3. The Transfer Generator never takes a Hero under Contract from the player's Guild (2026-09-25;
   narrowed to Heroes under Contract, DL-319).
4. Random Events befall the player's Guild only, and the harness reports their effects on it alone
   (2026-09-28, DL-82: the owner's decision, against the agents' recommendation that they befall
   every Guild alike, which would have needed no exception). The guard test gains it when that
   module lands.

`engine/src/controller-reads.test.ts` records every read of a Guild's controller the engine may make,
each with its reason. Its entries beyond these exceptions, such as a Guild answering a Transfer
through an Offer where a Rival answers at once through its Disposition (DL-57), are the difference in
controller this decision allows, not exceptions (DL-85). A read the list does not record, or a fifth
exception, needs the owner's decision, not a commit.

*Restated 2026-10-17* (DL-319) from the decision of 2026-09-25, its amendments of 2026-09-25,
2026-09-28 (DL-82) and 2026-10-08 (DL-220), and the decisions since that bear on it (DL-57, DL-85,
DL-294, DL-319). The wording it replaces is
[archived](./archive/0002-every-guild-is-a-guild-with-a-controller.md).
