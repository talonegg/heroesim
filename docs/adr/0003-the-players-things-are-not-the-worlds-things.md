# The player's things are not the world's things

Where something the player owns shares a shape with something in the world, we model them as
distinct types that share their *parts*, rather than one type carrying a flag. This has now been
decided twice:

- **A Guildmaster is not a Hero.** Both have Stats, Traits, Background and Regard, so the obvious
  move is one type with an `isPlayer` flag. But a Hero can be dismissed, assigned to a Party and
  killed, and a Guildmaster can do none of those without ending the Career.
- **A Rival is not a Guild.** Both have a Roster and a Standing. But the player's Guild has a
  Hall, a Board, a Guildmaster and a coin balance, and a Rival has none of them.

In each case the unified type would carry fields that are meaningless for one of its inhabitants,
and every operation over them would need a "but is this the player's?" check in front. The ones
that forget the check are the bugs. Shared *value types* — Traits, Background, Regard, Roster —
carry the overlap instead.

## Consequences

Promoting a Rival to something the player could inhabit, or letting the Guildmaster take the
field, is expensive under this decision rather than free. Both were considered and rejected on
design grounds (ADR-0007), so the cost is already accepted — but it is a door closed, not ajar.
