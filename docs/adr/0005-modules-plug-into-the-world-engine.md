# Story features are modules that plug into the World Engine

Scenarios, Campaigns, Contacts, Factions, Scouting and Workers are modules: each registers with
the World Engine, owns a named slice of World State, and is called at defined Turn phases. The
core is a complete, measurable game with no module installed; individual Campaigns and
Scenarios are content files the relevant module reads. We chose this over growing the core
because features added to the core stop it being measurable and make "later" a fiction, and
over content-only because the engine would have to anticipate every kind of story before one is
written.

## Consequences

The module contract (registration, state slice, phases, events) is built in the first
increments and proven with a small module before any story module exists.
