# Domain docs

How agents use this repository's domain documentation. The repository has one context.

## Before exploring, read these

- **`CONTEXT.md`** at the root: the glossary, and the words not to use.
- **`docs/adr/`**: the ADRs that touch the area you are about to work in.
- **`docs/decisions/index.md`**: the decisions (`DL-nn`) the code and the docs cite, each with its
  file; open the file for the entry's text.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for the domain-modeling skill, which changes `CONTEXT.md` and the ADRs).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
