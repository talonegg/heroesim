# Saves are snapshots of the World State, with the History inside

A save is the serialised World State, including the random source's state and the unbounded
History and Milestone lists. Loading never replays events through the engine. We chose this
over seed-plus-action-log replay because every balance change would invalidate every save, and
the numbers will be tuned for months. The History is kept for the player and for narration, not
for reconstruction.
