# Saves are snapshots, not replayed event logs

ADR-0001 gives the engine a seeded RNG and ADR-0002 gives it a full event stream, which together
make event-sourced saves — persist the seed and the log, rebuild state by replay — look almost
free. We are not doing that. Under replay, every balance change invalidates every existing save,
and on a project that will be re-tuned constantly that cost is paid over and over for an
elegance nobody sees.

The event stream stays what it is for: the narration channel. World state is serialised directly.
