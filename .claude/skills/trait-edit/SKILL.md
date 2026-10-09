---
name: trait-edit
description: Adds, changes or removes a Guildmaster or Hero Trait through the content editor's commands, each edit checked and held as pending, the session ending with "Finish" and its test run. Use when asked to add, create, change, rename, rebalance or remove a Trait or its effects, excludes or cost.
---

# Trait edit

Makes the owner's change to the Trait lists through the editor: `add`, `change` and `remove`, held as
pending edits, then "Finish", which writes the files, raises the content version and runs `npm test`.
The editor makes every change; this skill decides what to ask it for.

Read `docs/agents/traits.md` first: its guardrails and shared steps bind every step. A use of a Trait in other content
(an Injury, an Encounter, a Query, a Biography sentence, a Calling, a Feature) is `trait-assign`'s.

**The root.** Commands run from the repository's root. For a trial on a scratch copy, add
`--root <dir>` to every command. Every command below is `npm run --silent edit -- traits … --json`.

## 1. The doctor

Follow `docs/agents/traits.md`, "The steps every session shares": step 1, the doctor, and where it
reports drift or a stale register file, step 2.

Done when: the doctor reports `"ok": true`, and any pending edits are ones the owner has said to keep.

## 2. The Trait as it stands

- **A change or a removal:** `traits show <key> --json`, its fields, effects and uses.
- **An addition:** `traits find <word> --json` for a Trait like it, and `traits show <key> --json`,
  which exits 1, `refused`, "is not a key of Traits", where the key is free. A key is lower case
  letters and digits joined by hyphens, fixed once made. The list is `guildmaster` or `hero`; a
  Guildmaster Trait has a `cost`: a buff costs, a penalty refunds (a negative cost).
- **The effects** are the list's known kinds, each with its fields as `tools/editor/README.md`'s
  "Effects" table gives them: a Guildmaster Trait's `classStatBonus`, `guildMoraleShift`,
  `upkeepFactor`; a Hero Trait's `statModifiers`, `encounterBonus`. A kind not there is an engine
  change: stop, and tell the owner.

Done when: the key, the list and every field the owner asked for are known.

## 3. The edits

Write the fields to a file in the session's scratchpad, as one JSON object, and pass it whole, so no
shell strips the quotes from the effects:

```sh
traits add <list> <key> --row @<scratchpad>/<key>.json --json
traits change <key> --row @<scratchpad>/<key>.json --json      # only the fields that change
traits remove <key> --json
```

`--name`, `--cost`, `--excludes a,b` and `--no-excludes` may be given as flags instead.

- **Exit 0.** Note the row as the editor shows it. An exclusion is written on both sides.
- **Exit 1, `refused`.** Nothing is held. Fix what each problem names and run it again.
- **A new Trait** wants its Biography sentences before "Finish", three at least: the content's tests
  hold a list for every Hero Trait, and the portrait tool's corpus test three sentences to every key
  that has one (`docs/agents/portraits.md`, "The rules for a sentence"). Give them with
  `trait-assign` (`biography-sentences`), in the same session.
- **A removal refused** carries `uses`: list each use's `at` to the owner as the uses to change first.
  Each is taken out with `trait-assign` (`traits unassign`), or changed as the owner says; then the
  removal is run again. Other Traits' `excludes` never refuse it: the editor takes the key out itself.

Done when: every edit the owner asked for is pending (`traits pending --json` lists each), or each
refusal is named to the owner with its uses.

## 4. Finish

```sh
traits finish --json
```

It takes as long as `npm test`, a few minutes; run it in the background where the session allows,
and wait for it. Then follow `docs/agents/traits.md`'s step 3: on exit 0 note `changed`,
`contentVersion` (from → to) and the tests' result; on `undone`, sort each failure as it says, and
finish again. Then run the doctor again (step 1).

Done when: `finish` exits 0, and the doctor after it reports `"ok": true` with no pending edits.

## 5. Tell the owner

Give each Trait added, changed or removed with its fields, the files `changed`, the content version's
change, the tests' result, any removal refused with its uses, and that `git diff` shows the rest, for
the owner to review and commit.
