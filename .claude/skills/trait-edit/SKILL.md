---
name: trait-edit
description: Adds, changes or removes a Guildmaster or Hero Trait through the content editor's commands, each edit checked and held as pending, the session ending with "Finish" and its test run. Use when asked to add, create, change, rename, rebalance or remove a Trait or its effects, excludes or cost.
---

# Trait edit

Makes the owner's change to the Trait lists through the editor: `add`, `change` and `remove`, held as
pending edits, then "Finish", which writes the files, raises the content version and runs `npm test`.
The editor makes every change; this skill decides what to ask it for.

Read `docs/agents/traits.md` first: its guardrails bind every step. A use of a Trait in other content
(an Injury, an Encounter, a Query, a Biography sentence, a Calling, a Feature) is `trait-assign`'s.

**The root.** Commands run from the repository's root. For a trial on a scratch copy, add
`--root <dir>` to every command. Every command below is `npm run --silent edit -- traits … --json`.

## 1. The doctor

```sh
npm run --silent edit -- traits doctor --json
```

- **`"ok": true`** with no pending edits: go on.
- **Drift or a stale doc**: follow the guardrails' "When the doctor reports drift": update the
  register (`content/src/uses/register.ts`), regenerate the doc (`npm run edit -- traits doc`), run
  the doctor again until it passes, and include both in this session's change.
- **Pending edits already there**: list them (`traits pending --json`) and ask the owner whether they
  are this session's to finish or to drop (`traits discard`).

Done when: the doctor reports `"ok": true`, and any pending edits are ones the owner has said to keep.

## 2. The Trait as it stands

- **A change or a removal:** `traits show <key> --json`, its fields, effects and uses.
- **An addition:** `traits find <word> --json` for a Trait like it, and `traits show <key>` to see
  that the key is free. A key is lower case letters and digits joined by hyphens, fixed once made.
  The list is `guildmaster` or `hero`; a Guildmaster Trait has a `cost`.
- **The effects** are the list's known kinds (`tools/editor/README.md`): a Guildmaster Trait's
  `classStatBonus`, `guildMoraleShift`, `upkeepFactor`; a Hero Trait's `statModifiers`,
  `encounterBonus`. A kind not there is an engine change: stop, and tell the owner.

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
and wait for it.

- **Exit 0.** Note `changed`, `contentVersion` (from → to) and the tests' result.
- **Exit 1, `undone`.** Every file is put back and the edits stay pending. Sort each failure as the
  guardrails' "When Finish is undone" says: the edit at fault, a use the tests want, or a test that
  pins the content as shipped, which waits for the owner's word. Then finish again.

Then the doctor again:

```sh
npm run --silent edit -- traits doctor --json
```

Done when: `finish` exits 0, and the doctor after it reports `"ok": true` with no pending edits.

## 5. Tell the owner

Give each Trait added, changed or removed with its fields, the files `changed`, the content version's
change, the tests' result, any removal refused with its uses, and that `git diff` shows the rest, for
the owner to review and commit.
