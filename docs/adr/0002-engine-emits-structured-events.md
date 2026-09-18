# The engine emits structured events, not prose

The engine narrates by emitting typed events — `PartyAmbushed { partyId, heroIds, severity,
day }` — and never formatted text. Turning events into English is the front end's job. This
is what makes the planned extensions cheap: a live view is the same stream rendered as it
arrives rather than in a batch, and a graphical client renders the same stream as animation.
Both would be engine rewrites if the engine returned sentences.

## Consequences

Tests assert on events, not on strings, so rewording narration never breaks a test. The cost
is a rendering layer that turns events into readable prose — that layer is where the writing
craft lives, and it is deliberately outside the engine.
