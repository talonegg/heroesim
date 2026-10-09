# Traits: the rules for the editor, the register and the skills

How Traits are found, added, changed, removed and used in other content (DL-150 items 7 to 16). Three
places hold it:
- The content editor, `tools/editor`, makes each change to a Trait and to each use of one. How it
  works is [`tools/editor/README.md`](../../tools/editor/README.md): its commands, pending edits,
  "Finish", its journal and `busy`, `recover`, `--root`, JSON and the exit codes.
- The register, `content/src/uses/`, lists every place a Trait is used, in content and in the engine.
  It is written out in [`traits-register.md`](traits-register.md).
- This page holds the rules (DL-219).

```sh
npm run edit                                   # the page, on this machine only
npm run --silent edit -- traits <command> --json
```

| Skill | Run it to | It changes |
| --- | --- | --- |
| `trait-find` | find a Trait by name, effect or use; the content that uses it; the rules and events that read Traits | nothing |
| `trait-edit` | add, change or remove a Trait | the Trait lists, through `add`, `change`, `remove` and `finish` |
| `trait-assign` | add, take out or change in place a Trait's use in other content | the content holding the use, through `assign`, `unassign`, `update` and `finish` |

Ask Claude Code for one by name, or say what you want done to a Trait. Each works on the current
branch, from the repository's root.

## Guardrails

- **The only route** (DL-150 item 15). Every Trait is added, changed, removed and assigned through
  the editor: its page, its commands, or the `trait-*` skills, which run the commands. No Trait file,
  and no use of a Trait in other content, is edited by hand or by a script of a session's own.
- **Content only, never a save** (DL-150 item 16). The editor and the skills change what the game
  ships. No saved game, `.saves/` file or document of a world is read for an edit or changed: every
  change to a world is an event in its History, made by playing.
- **A key is fixed once made** (DL-150 item 9): a new key is a new Trait. **A Trait in use is not
  removed** (DL-150 item 10): change or unassign each use first.
- **A use the register cannot take out** (a `has-trait` inside a `not`, say) is refused: ask the owner
  how that Query is to read without it.
- **A new effect kind** is an engine change, made on the owner's request (DL-150 item 8).
- **Nothing is committed or pushed** by the editor or a skill. Read `git diff`, and commit it yourself.
- **Edits left pending** at a session's end are named to the owner, never left silently.

## The steps every session shares

The skills `trait-edit` and `trait-assign` both begin and end with these steps.

1. **The doctor.** `npm run --silent edit -- traits doctor --json` runs the drift and freshness
   checks, the content's checks, and whether the pending edits apply. Run it before acting and again
   after "Finish". It must report `"ok": true` both times. Edits already pending are named to the
   owner before more are added.
2. **When the doctor reports drift,** the register and the code differ: a rule of the engine or a
   check of the content reads a Trait where the register does not say so, or a listed one no longer
   does.
   1. Read each problem: its file, line and declaration.
   2. Update the register, `content/src/uses/register.ts`. Add the declaration to the engine entry
      whose rule it belongs to (its `sources`, or `through`), or as a new entry, or take out a name
      that reads no Trait now. A new place in content where a Trait's key stands is a new content
      entry, with its `find`, and an `add` and `remove` where they are safe.
   3. Write the register's file again: `npm run edit -- traits doc`.
   4. Run the doctor again until it passes. Include both, the register and its file, in the change.

   A stale register file alone is mended by step 3. The doctor also names content that fails its
   checks, and pending edits that no longer apply: fix the content through the editor, or drop the
   edits with `traits discard`.
3. **"Finish"** ends a session's edits (DL-150 item 11). It writes the files, raises the content
   version and runs `npm test`, a few minutes; the editor's README says how. When it is undone, read
   each failure for what it holds:
   - *the edit at fault* (a value a rule refuses): change the edit, or discard it, and finish again;
   - *a use the tests want* (`content/src/content.test.ts` holds a Biography sentence for every Hero
     Trait, say): add it with `trait-assign`, and finish again;
   - *a test that pins the content as shipped* (a value a decision fixed, such as the four Injury
     Traits' Stat changes, DL-148 item 24): show it to the owner, as `delivery.md`'s rule 4 says.
     With their word the test is changed, as code, in the same change, and "Finish" run again;
     without it the edit is discarded.
4. **Tell the owner** the edits finished, the content version's change, and that `git diff` shows
   them.

## Each story's close

Every epic follows these rules (DL-150 item 14):

- **A story that touches the engine** (`engine/src/`) or the content's checks
  (`content/src/validate.ts`) runs `npm run edit -- traits doctor` at its close. It fixes any drift
  as step 2 says, in the same change.
- **Its DL entry says what changed for Traits.** That is the register's entries added, changed or
  taken out and why, or a new effect kind, event or use in content. Otherwise it says, in so many
  words, "Nothing changed for Traits; the doctor reports no drift."
- **A story that changes a Trait or a use of one** does it through the editor or the skills. Its DL
  entry names the "Finish" and the content version it raised.
- **An epic's close** runs the doctor among its checks.
