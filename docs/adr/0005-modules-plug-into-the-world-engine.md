# Story features are modules that plug into the World Engine

Scenarios, Campaigns, Contacts, Factions, Scouting and Workers are modules: each registers with
the World Engine, owns a named slice of World State, and is called at defined Turn phases. The
core is a complete, measurable game with no module installed; individual Campaigns and
Scenarios are content files the relevant module reads. We chose this over growing the core
because features added to the core stop it being measurable and make "later" a fiction, and
over content-only because the engine would have to anticipate every kind of story before one is
written.

## Consequences

The module contract (registration, state slice, phases, events) is built before any story
module exists and proven with a small module.

*Amended 2026-09-25.* This originally read "built in the first increments". The delivery plan
([`../plan.md`](../plan.md)) builds the Turn pipeline flat and adds the contract as the last
milestone of the first build, so that the pipeline's phases are settled by use before they are
made an interface. The decision stands; only its timing moved. Decided by the owner.
