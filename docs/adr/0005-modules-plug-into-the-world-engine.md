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

*Closed 2026-09-27.* The timing this amendment records has happened: the contract (registration, a
state slice, the three phases, events, a stop and the effects API) was built as M8, the last
milestone of the first build, after the pipeline's phases were settled by use, and was proved by a
test-only probe module before any story module exists (DL-76 to DL-79). The first build is tagged
`m8-modules`. Random Events, the first real module, is the next work ([`../plan.md`](../plan.md) §4),
and the test of whether the contract fits a real feature.
