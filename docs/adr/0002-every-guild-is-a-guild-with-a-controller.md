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
