---
name: trait-assign
description: Adds, takes out or changes in place a Trait's use in other content through the content editor's assign, unassign and update commands, held as pending and ended with "Finish" and its test run - an Injury's leavesTrait, an Encounter's trait consequence (its chance or among changed in place), a has-trait in a Check, harm or Synergy, a Biography sentence, a Calling's suits or clashes, a Feature's shows. Use when asked to give a Trait to, attach it to, or take it off other content, to change how likely an Encounter grants a Trait or who may take it, to reword a Trait's Biography sentence, or to clear a Trait's uses before removing it.
---

# Trait assign

Puts a Trait's key into other content, takes it out, or changes a use where it stands, through the
register's entry for that place (`traits assign`, `traits unassign`, `traits update`), held as
pending edits, then "Finish". The editor makes every change; this skill finds the entry and the
target or the place.

Read `docs/agents/traits.md` first: its guardrails bind every step, and its register part, "In
content", gives each entry, what it does, its target's fields and its command line. Adding, changing
or removing a Trait itself is `trait-edit`'s.

**The root.** Commands run from the repository's root. For a trial on a scratch copy, add
`--root <dir>` to every command. Every command below is `npm run --silent edit -- traits … --json`.

## 1. The doctor

```sh
npm run --silent edit -- traits doctor --json
```

- **`"ok": true`** with no pending edits: go on.
- **Drift or a stale doc**: follow the guardrails' "When the doctor reports drift": update the
  register (`content/src/uses/register.ts`), regenerate the doc (`npm run edit -- traits doc`), run
  the doctor again until it passes, and include both in this session's change. An entry's `add` and
  `remove` are what this skill runs on, so they are current before it acts.
- **Pending edits already there**: list them (`traits pending --json`) and ask the owner whether they
  are this session's to finish or to drop (`traits discard`).

Done when: the doctor reports `"ok": true`, and any pending edits are ones the owner has said to keep.

## 2. The entry and the target

`traits show <key> --json` gives the Trait's list and its uses now. Then match the place the owner
names to its entry in the doc's register part:

| The place | The entry |
| --- | --- |
| An Injury leaves the Trait as it heals | `injury-leaves-trait` |
| An Encounter grants it on a Triumph, or lays it on a Failure | `encounter-trait` |
| A Check's score, a harm's `among` or a trait consequence's `among` reads who holds it | `encounter-has-trait` |
| A Synergy needs a Hero holding it | `synergy-has-trait` |
| A Biography sentence for a person holding it | `biography-sentences` |
| A picture's Calling suits it, or clashes with it (Guildmaster Traits) | `portrait-callings` |
| A picture's Feature shows it (Hero Traits) | `portrait-features` |
| Another Trait of its list excludes it | `excludes` |

Each target field the entry names takes a key the content defines: read it from the content file the
entry names (`content/injuries.json`, `encounters.json`, `synergies.json`, `descriptions.json`,
`portrait-appearances.json`). A `path` is the place of a Set Query inside the Encounter or Synergy
(`checks.0.score.1`, `consequences.failure.0.among`): read the Encounter to find it.

- **The old form.** An Encounter with no `checks`, or a Synergy whose `requires` is an object of
  Classes and Skills, is in the old form: it has no Query to filter, and the refusal says "in the old
  form". Writing it in Queries is content work outside the editor's kinds (v1.1.4-S10 writes the
  shipped content so): tell the owner, and assign once it is written.
- **A Biography sentence** keeps `docs/agents/portraits.md`'s rules for a sentence: the pronoun
  slots, a capital first, a full stop last, the glossary's terms capitalised.

**Taking a use out, or changing one in place,** needs its entry and its place: `traits uses <key>
--json` gives each use's `entry` and `at`. Each Biography sentence is a use of its own (`…traits.lame.2`). Taking a use out
of a list moves those after it: take several out of one list from the last, or read `uses` again
after each.

**Changing a use in place** (`traits update`, v1.1.6-S4) is for a use that holds values besides the
key: an Encounter's trait consequence (`chance`, `among`; `among` `null` takes it out) and a Biography
sentence (`sentence`). The doc's "Changing a use" line for each entry names its values; an entry whose
use is the key alone refuses it, and is changed by unassigning the use and assigning another.

Done when: each use to add has its entry and every target field the doc marks as wanted, each use to
take out has its entry and `at`, and each use to change has its entry, `at` and the values to give.

## 3. Assign, unassign and update

```sh
traits assign <key> <entry> <field>=<value> ... --json
traits assign <key> <entry> --target @<scratchpad>/target.json --json
traits unassign <key> <entry> "<at>" --json
traits update <key> <entry> "<at>" <field>=<value> ... --json
traits update <key> <entry> "<at>" --target @<scratchpad>/values.json --json
```

A value is read as JSON where it is JSON (`chance=0.05`) and as text where it is not. A target with
JSON in it (`among`), or a sentence, goes in a file in the session's scratchpad as one JSON object,
passed with `--target @<file>`, so no shell strips its quotes.

- **Exit 0.** `added` names the new use's `at`, always one: a use the place holds already is refused,
  naming it; `uses` lists every use now.
- **Exit 1, `refused`.** Nothing is held. A field the entry lacks, a Trait of the other list, a place
  that is not there, a sentence the content's checks refuse: fix what each problem names and run it
  again.
- **A use the register cannot take out** (a `has-trait` that is neither a `where`'s filter nor part
  of an `and` or `or`) is refused: ask the owner how that Query should read without it.
- **`update`, exit 0.** `at` names the use changed; `uses` lists every use now. `"unchanged": true`
  means the use holds those values already, and nothing is held.
- **`update`, exit 1, `refused`.** A place where the Trait has no use names its uses: take the `at`
  from them. A value the entry does not change, an entry whose use is the key alone, a chance the
  content's checks refuse (above 1, say): fix what each problem names and run it again.

Done when: `traits pending --json` lists an edit for each use asked for, and `traits uses <key>` shows
each added or gone; each use changed is an `update` edit there, with its values.

## 4. Finish

```sh
traits finish --json
```

It takes as long as `npm test`, a few minutes; run it in the background where the session allows,
and wait for it.

- **Exit 0.** Note `changed`, `contentVersion` (from → to, raised in `content/version.json`) and the
  tests' result.
- **Exit 1, `undone`.** Every file is put back and the edits stay pending. Sort each failure as the
  guardrails' "When Finish is undone" says: the edit at fault, a use the tests want, or a test that
  pins the content as shipped, which waits for the owner's word. Then finish again.

Then the doctor again:

```sh
npm run --silent edit -- traits doctor --json
```

Done when: `finish` exits 0, and the doctor after it reports `"ok": true` with no pending edits.

## 5. Tell the owner

Give each use added, taken out or changed with its `at` (and a change's values), the files `changed`, the content version's change,
the tests' result, and that `git diff` shows the rest, for the owner to review and commit.
