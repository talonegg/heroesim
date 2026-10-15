---
name: trait-find
description: Finds a Guildmaster or Hero Trait by name, effect or use, the content that uses it, and the rules and events of the engine that read Traits, through the content editor's commands. Changes nothing. Use when asked which Traits there are, what a Trait does, where a Trait is used, or what reads Traits.
---

# Trait find

Answers a question about Traits from the editor's own commands and the register: which Trait, what
it does, where its key stands in content, and which rules read it. It changes no file: on drift it
stops and names it (step 1). The one write its commands may make is the editor's own, putting back
a "Finish" cut off, which the command reports as `recovered`; tell the owner when one does.

Read `docs/agents/traits.md` first: its guardrails bind every step. The register,
`docs/agents/traits-register.md`, says what each use and each rule is.

**The root.** Commands run from the repository's root. For a trial on a scratch copy, add
`--root <dir>` to every command.

## 1. The doctor

```sh
npm run --silent edit -- traits doctor --json
```

- **`"ok": true`**: go on.
- **Drift or a stale doc**: the answer would rest on a register that no longer matches the code. This
  skill changes nothing, so stop: name each problem the doctor gives (its file, line and declaration)
  to the owner, and say that the fix is the guardrails' "When the doctor reports drift", a change of
  the register and the doc made apart from this search. Answer only once the doctor passes, or with
  the owner's word that an answer from the register as it stands will do, saying so.
- **Pending edits** (`pending.edits` above 0): someone's session is under way. Answer from the
  content with them made, as every command reads it, and say they are pending.

Done when: the doctor passes, or what it reports is named to the owner.

## 2. The search

Pick each command the question needs:

| The question | The command |
| --- | --- |
| A Trait by a word of its key, name or effect, or by a place it is used (`deep-cut`, `morale`, `perception`) | `traits find <text> --json` |
| Every Trait of both lists | `traits list --json` |
| One Trait: its fields, effects, uses and the rules that read it | `traits show <key> --json` |
| Every use of a Trait in content | `traits uses <key> --json` |
| The rules and events that read Traits, and where in the code | `docs/agents/traits-register.md`: "In the engine and the content's checks" |

Each prefixed `npm run --silent edit -- `. An effect is found in its words (`courage`, `-2 perception`,
`Hall upkeep ×`) and as JSON (`encounterBonus`). `find` gives each match's `matched` (key, name, effects, uses); follow each
with `show`.

Done when: every Trait the question names, or the search finds, has its `show`, and each part of the
question has a command's answer behind it.

## 3. Tell the owner

For each Trait: its key and list, its name, its effects in words, and each use's `at` with whether it
refuses removal. For the rules: each entry's id, what it reads and the declarations it names. Say
which commands gave each answer, and that nothing changed.
