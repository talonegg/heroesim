# Quest templates and Encounters: the rules for the editor and the skills

How Quest templates and Encounters are found, added, changed and removed (DL-257 item 8, DL-267). Two
places hold it:
- The content editor, `tools/editor`, makes each change: a template, its Tiers, Beats, overrides and
  Finale; an Encounter, its Checks, consequences and tags. How it works is
  [`tools/editor/README.md`](../../tools/editor/README.md): its commands, pending edits, "Finish",
  its journal and `busy`, `recover`, `--root`, JSON and the exit codes.
- This page holds the rules.

What a template and an Encounter are, their Tiers, Beats, pools and Finales, is in `CONTEXT.md` and
the content's checks (`content/src/kinds/quest-templates.ts`, `encounters.ts`); the Tier ladder is
`engine/src/config.json`'s `tiers` (`docs/agents/config.md`).

```sh
npm run --silent edit -- quests <command> --json
npm run --silent edit -- encounters <command> --json
```

| Skill | Run it to | It changes |
| --- | --- | --- |
| `quest-draft` | draft a template from a brief: its Tiers, its Beats' lines and pools in the order each Tier plays them, overrides and Finale | the Quest templates, through `quests …` and `finish` |
| `encounter-draft` | draft an Encounter from a brief: its Checks, pass formula, consequences and tags, its targets set by the harness's calibration (DL-166) | the Encounters, through `encounters …` and `finish` |

Both hold their edits pending, run the doctor, and write a draft to the session's scratchpad for the
owner's review; "Finish" runs only on the owner's approval (DL-268). `quest-draft` hands an Encounter
the content lacks to `encounter-draft`, in the same session. Ask Claude Code for one by name, or say
what you want done to a template or an Encounter. Each works on the current branch, from the
repository's root.

## Guardrails

- **The only route** (DL-257 item 8). Every Quest template and Encounter is added, changed and
  removed through the editor's commands or the skills, which run them. No file of `content/quest-templates/`
  or `content/encounters/` is edited by hand or by a script of a session's own.
- **Content only, never a save.** The editor and the skills change what the game ships. No saved
  game, `.saves/` file or document of a world is read for an edit or changed.
- **One session for both.** A Beat's pool reads the Encounters, so their edits are held together in
  `.editor/quests.json`: an Encounter added and a Beat that draws it are checked as one, and either
  family's `finish` writes them all.
- **A key is fixed once made:** a new key is a new row. **An Encounter in use is not removed:** a
  pool that names it or a template that plays it as its Finale is changed first, each use named.
- **A change the content's checks refuse is refused,** naming why: a pool too small for its draws, a
  Tier playing more Beats than the template has, an override of a Tier it does not offer, a Party
  below two (DL-266). Nothing is held.
- **A Tier's figures** are the ladder's in config; a template overrides one for one Tier with
  `quests override`. The ladder itself is a tuning value, changed as `config.md` says.
- **A Trait's use in an Encounter is `trait-assign`'s** (`traits.md`): a `trait` consequence, and a
  `has-trait` in a Check's score or a consequence's `among`. The `encounters` commands would write
  one, since the content's checks take it (a `trait` consequence is refused only in `success` and
  `setback`), so never give one through them, in a row, a Check or a consequence.
- **A new consequence kind, Check field or Beat criterion** is an engine change, made on the owner's
  request.
- **Nothing is committed or pushed** by the editor or a skill. Read `git diff`, and commit it yourself.
- **Edits left pending** at a session's end are named to the owner, never left silently.

## The steps every session shares

1. **The doctor.** `npm run --silent edit -- quests doctor --json` runs the content's checks and its
   own: every Beat's pool may draw its Encounter, every Tier offered plays its Beats, every Encounter
   is drawn by the pool of some Beat a Tier plays or is a Finale, every Finale is placed; and holds
   the pending edits to all of them. Run it before acting and again after "Finish". It must report `"ok": true` both times.
   Edits already pending are named to the owner before more are added. A note (`!`), a Beat no Tier
   of its template plays, fails nothing: tell the owner.
2. **When the doctor fails,** read each problem: its file and path (`quest-templates/x.json:
   beats.2.pool`), or the content check's (`questTemplates.x.beats.2.pool`). Fix the content through
   the commands, or drop the edits at fault with `quests discard` or `encounters discard`.
3. **"Finish"** ends a session's edits. It writes each row's file, raises the content version and
   runs `npm test`, a few minutes. When it is undone, read each failure for what it holds:
   - *the edit at fault*: change the edit, or discard it, and finish again;
   - *a test that pins the content as shipped* (a template's count, an Encounter's Death chance a
     test plays): show it to the owner, as `delivery.md`'s rule 4 says. With their word the test is
     changed, as code, in the same change, and "Finish" run again; without it the edit is discarded.
4. **Tell the owner** the edits finished, the content version's change, and that `git diff` shows
   them. Content that changes play is proved as `delivery.md` says: a quick run and `compare`.

## Each story's close

- **A story that touches the engine** (`engine/src/`) or the content's checks
  (`content/src/validate.ts` and the content kinds, `content/src/kinds/`) runs
  `npm run edit -- quests doctor` at its close, beside the traits doctor, and records both readings.
- **A story that changes a Quest template or an Encounter** does it through the editor or the skills.
  Its DL entry names the "Finish" and the content version it raised.
