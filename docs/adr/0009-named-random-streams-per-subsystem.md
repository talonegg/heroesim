# One named random stream per component, not one stream for the engine

The engine keeps its random streams in `world.rng`, one for each component that draws, in the sense
of [`../approach.md`](../approach.md) §1: the Quest Generator, the Quest Engine, the Hero State
Engine, the Market Engine and so on. Each is xoshiro128\*\* seeded by cyrb128 of
`<master seed>:<stream name>`, so a stream depends on the seed and its own name alone (DL-12). We
chose this over one stream because with one stream every new draw shifts every later draw, and
adding a feature would change what every existing seed plays; with named streams a seed keeps
producing the same Board and the same Heroes when a component is added.

## The rules

1. **A rule draws from its component's stream only.** A new draw inside a component uses that
   stream and shifts only its later draws, as a Rival replacement and a Succession draw from the
   Guild Generator's `generation` (DL-28, DL-102).
2. **A new component gets a new stream** and never shares an old one. It is appended last to
   `streamNames` (`engine/src/rng.ts`), whose order is a new world's `rng` keys (pre-M0 review D7,
   DL-84). A stream's name is in every save, so it is renamed only before any release holds it
   (DL-135).
3. **A draw count is fixed by the rule, never by what is chosen or written**, so a choice moves no
   later draw. A Portrait is one draw whatever is chosen; a Guildmaster's texts are fifteen draws, and
   a Hero's thirteen, whatever is written; a weighted draw with every weight 1 draws exactly as the
   unweighted one (DL-130, DL-132, DL-142, DL-202, DL-208).
4. **Accepted exceptions**, each made so that no existing draw moved:
   - the Transfer Generator, a component of its own, draws from `rivals` (DL-84);
   - the pictures and words of Guildmasters and Heroes, though part of generating them, are drawn on
     four streams of their own: `gm-portraits` and `descriptions` for a Guildmaster, `hero-portraits`
     and `hero-descriptions` for a Hero. They are two a role, so that neither role's draws move the
     other's, and pictures apart from words, so that pictures added later move no text (DL-125,
     DL-134, DL-135).
5. **A module registers a stream of its own**, named as no core stream or other module's, and its
   hooks, and any Quest it offers, draw from that stream alone, so no core stream moves (DL-76,
   DL-77). Random Events is a module, so the core has no `events` stream (D7).
6. **A save lacking a stream gains it**, core or module, freshly seeded, when it next advances
   (`ensureStreams`, `ensureModules`): no migration, and no other stream moves (DL-25, DL-76).
7. **Outside the world.** A front end draws cosmetics from its own source, never `world.rng` (DL-12,
   ADR-0001). The setup's "Again" for a Guildmaster's texts draws from `descriptions-<n>`, seeded the
   same way, which no world holds (DL-132).

The streams in force, and what draws from each, are listed in
[`../data-model.md`](../data-model.md) §3.1.

## Consequences

A test can check that each stream advances only when its component runs, and pinned tests catch a
moved draw. Adding a component or a module changes no seed's existing play. A new draw inside a
component, or a rule that changes how often a stream is drawn, as slower Levels draw `progression`
less (DL-185), does change that stream's later draws; that is accepted, since saves are snapshots and
not seeds (ADR-0004), and "no draw moves" is claimed only once checked. Changing the generator, its
seeding, or any draw's arithmetic or count changes every seed's game, and needs a DL entry
superseding DL-12.

*Restated 2026-10-08* (DL-222) from the decision of 2026-09-25, its amendments of 2026-09-26 (pre-M0
review D7), 2026-09-28 (DL-84), 2026-09-30 (DL-125) and 2026-10-01 (DL-134, DL-135), and the
decisions since that bear on streams. The wording it replaces is
[archived](./archive/0009-named-random-streams-per-subsystem.md).
