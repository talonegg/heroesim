# Stats, Classes, Skills and Synergies are content, not engine shape

A Hero's Stats are a keyed set defined in a content file, not fixed fields on a type. Classes,
Skills, Synergies, Items and Quest templates are likewise data with conditions the engine
matches and effects it applies. We chose this because the owner wants the initial twenty Hero
Stats and five Guildmaster Stats to be easy to add, change or remove between releases, and
because a Class or Synergy that needs an engine change is a Class or Synergy nobody adds.

## Consequences

The engine addresses Stats by key and must tolerate a Stat that no rule reads. Type safety over
Stat names comes from content validation at load time, not from the compiler.
