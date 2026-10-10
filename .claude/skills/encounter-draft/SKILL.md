---
name: encounter-draft
description: Drafts an Encounter from the owner's brief - its kind and tags, its Checks and pass formula, its consequences by Degree - through the content editor's encounters commands, held as pending; sets its Checks' targets with the harness's calibration at the shipped content's aim (DL-166), holds it to quests doctor, then writes a draft for the owner's review and runs "Finish" only on their approval. Use when asked to draft, write or add an Encounter or a Finale, when a Beat's pool is too short, or when quest-draft hands one off.
---

# Encounter draft

Turns a brief ("a bell rings under the mere; someone must dive for it") into an Encounter held as a
pending edit, through the editor's `encounters …` commands, its Checks' targets set by the
calibration as the shipped Encounters' were (DL-162, DL-166), then shows the owner a draft before
anything is written. The editor makes every change and every check; the calibration sets the
numbers; this skill decides the rest.

Read `docs/agents/quests.md` first: its guardrails and shared steps bind every step. The words are
`CONTEXT.md`'s (Encounter, Check, Query, Degree, Exposure, Guard, Finale, Deadly); a Check's score
is a Query (ADR-0010); the commands are `tools/editor/README.md`'s "Quest templates and Encounters";
the calibration is `harness/README.md`'s `calibrate`, its variables in `docs/environment.md`.

**Handed off by `quest-draft`**, steps 1 to 3 run, then `quest-draft` adds the template that plays
the Encounter, then steps 4 and 5 here: the calibration aims a Finale by its template, and the doctor
fails an Encounter no Beat or Finale plays.

**The root.** Commands run from the repository's root; for a trial on a scratch copy, add
`--root <dir>` to every command. Every command below is `npm run --silent edit -- encounters … --json`.
**The scratchpad** is the session's scratchpad directory, or the system's temp folder, outside the
repository: row files, the calibration's copies and reports, and the review draft go there.
**The shell** is a POSIX one (Claude Code's Bash tool): step 4's `VAR=value npm …` lines need it, and
Windows PowerShell strips the double quotes from a JSON argument such as `--pass '["and","a","b"]'`.

## 1. The doctor

Follow `docs/agents/quests.md`, "The steps every session shares", step 1: `quests doctor --json`.
Pending edits `quest-draft` made in this session are the owner's brief too: keep them.

Done when: it reports `"ok": true`, its notes are named to the owner, and any other pending edits are
ones the owner has said to keep.

## 2. The Encounter

- **Its peers.** `encounters list --json`, then `encounters show <key>` for two or three of the kind
  the brief needs: their Checks, pass formulas and consequences are the model. A new key is lower
  case words joined by hyphens, fixed once made; `encounters show <key> --json` exits 1, `refused`, "is
  not an Encounter", where it is free.
- **Its kind**, one of `combat`, `travel`, `social`, `arcane`, `stealth`, `lore`, and **its tags**,
  taken from those the templates carry (`quests list --json`): a template sharing one draws it
  `encounterTagWeight` times as often. A Beat's pool draws it by kind and tag, or by name; a Finale is
  named by its template and drawn by no pool. **A kind and tags put it in the shipped templates'
  pools** that draw by them (`drawnBy`, step 3): each such Beat then plays it, a change to that
  template's play, named in the draft (step 5).
- **Its Checks**, one to four, each a `key`, a `name` the narration and the Board show, a `score` (a
  Query over the Party: the best Hero's Stat, the least of the Party's, the best few with falling
  weights, a Class's or a Skill's Hero), the `skills` that help it, and a target: write
  `"flat": 0, "difficultyFactor": 0.1` for now, which step 4 replaces. A `raw` Check, a gate, keeps a
  target of its own and is never tuned. Lean on the right Hero and the weakest link rather than on
  headcount, as the shipped Checks do.
- **Its pass formula**, `["and"|"or", …]` or `["at-least", k, …]`, naming every Check once; one Check
  needs none.
- **Its consequences**, by Degree (`failure`, `setback`, `success`, `triumph`), each of a kind with
  its fields as `content/src/kinds/encounters.ts` gives them: an Injury on a Failure, with `among`,
  `exposedBy` and `guardedBy` where the brief says who is hurt; a smaller loss on a Setback; Fame, XP
  or Wealth on a Success or a Triumph, near its peers'. A Triumph with no list reads Success's, a
  Setback with none Failure's. **A Death** only where the brief says it kills, at its peers' 2 to 5%:
  it is scaled by the Tier (DL-265), so it falls only at Tiers whose `deathScale` is above 0, and makes
  those Tiers' Quests Deadly. **An earned Trait** is a use of a Trait: give it after "Finish" with
  `trait-assign` (`encounter-trait`), never here.

Done when: every field has a value from the brief or a peer, the targets aside.

## 3. The edits

Write the Encounter to `<scratchpad>/<key>.json` as one JSON object and pass it whole, so no shell
strips its quotes:

```sh
encounters add <key> --row @<scratchpad>/<key>.json --json
```

A part of one, after `add` or on an existing Encounter:

```sh
encounters change <key> --row @<scratchpad>/<key>-change.json --json
encounters check add <key> --row @<scratchpad>/<check>.json [--pass <json or @file>] --json
encounters check change <key> <check> <field>=<value> ... [--pass <json or @file>] --json
encounters check remove <key> <check> [--pass <json or @file>] --json
encounters consequence add <key> <degree> [<at>] <field>=<value> ... --json
encounters consequence change <key> <degree> <at> <field>=<value> ... --json
encounters consequence remove <key> <degree> <at> --json
```

- **Exit 0.** The edit is pending; `encounters show <key>` gives the Encounter as it now stands, and
  the Beats that may draw it (`drawnBy`).
- **Exit 1, `refused`.** Nothing is held. Fix what each problem names and run it again.

Done when: `encounters pending --json` lists the edit.

## 4. The targets, by the calibration

Each Check's target is `flat + difficultyFactor × difficulty`. The calibration sets them as DL-166
item 2 set the shipped Encounters': random Parties of 3 at Level 5 succeed at the Encounter, Success
or better, with a chance of 0.56 at difficulty 60, every Check as hard on its own, and 0.4 of each
target its flat term; a Finale at the middle of its template's difficulties instead, with Parties of
at least the template's least (`aimOf`).

The calibration reads drafts, a directory of content folders each taken whole in place of the
core's (DL-260), never the pending edits. So build one in the scratchpad, from the content and the
pending rows, with `<D>` its path:

```sh
mkdir -p <D>/encounters <D>/quest-templates
cp content/encounters/*.json <D>/encounters/
cp content/quest-templates/*.json <D>/quest-templates/
npm run --silent edit -- encounters show <key> --json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).row,null,2)))" \
  > <D>/encounters/<key>.json
```

Do the same, `quests show <key>` into `<D>/quest-templates/<key>.json`, for each template the pending
edits add or change (a Finale is aimed by its template), and delete the copy of a row they remove.

`<D>` is an absolute path. **Tune**, a harness run, alone and in the background (`delivery.md` rule
6), under a minute:

```sh
mkdir -p <scratchpad>/calibrate/tuned
HEROESIM_DRAFTS=<D> HEROESIM_TUNE=0.56 HEROESIM_FLAT=0.4 \
  HEROESIM_CALIBRATION_OUT=<scratchpad>/calibrate/tuned npm run harness -- calibrate
```

`HEROESIM_CALIBRATION_OUT` always: without it the run writes over `docs/quests/calibration.md`. The
run writes each tuned Check's `flat` and `difficultyFactor` into every file of `<D>/encounters/`;
read them from the drafted Encounter's file alone (the copies of the shipped ones are retuned too,
and are not wanted). Put them in through the editor, a Check at a time:

```sh
encounters check change <key> <check> flat=<flat> difficultyFactor=<factor> --json
```

**Read**: build `<D>` again from the content and the pending rows (the tuning rewrote the copies),
and calibrate once more, untuned, alone, into `<scratchpad>/calibrate/review`:

```sh
mkdir -p <scratchpad>/calibrate/review
HEROESIM_DRAFTS=<D> HEROESIM_CALIBRATION_OUT=<scratchpad>/calibrate/review npm run harness -- calibrate
```

In its `calibration.md`:
- **"## The Encounters", "### <its name> (<kind>…)":** each cell is Triumph · Success · Setback ·
  Failure, by Level and Party size at each difficulty, and each Check's table follows. The row
  "Level 5, 3 Heroes" at difficulty 60 holds Triumph and Success near 56% together; a Finale's comes
  near it at its template's middle difficulty, between the columns. Set its line "Success or better
  at Level 5, 2 to 4 Heroes" beside two peers' of its kind. A Check no Party scores on (a Class or a
  Skill none has) shows near 0 everywhere: a score to rethink.
- **"## The coverage grid":** the Stats its Checks add, and the gate still met.
- **"## The templates":** the template that ends on it, or draws it, by Level and third.
- **"## The estimate against the resolver":** the widest gap under 5 standard errors (the run fails
  otherwise).

Done when: every tunable Check holds the tuning's numbers, pending, and the review calibration has
run.

## 5. The doctor again, and the draft for review

Run `quests doctor --json` (step 1). It must report `"ok": true`: an Encounter that no Beat's pool
draws and no template plays as its Finale fails it, so a new one is given its Beat or its template
first (`quest-draft`), or its kind and tags are those a pool draws.

Then write `<scratchpad>/encounter-draft-<key>.md` from `encounters show <key>` and the review
calibration:

- the brief; its name, kind and tags; the Beats that may draw it, or the template it ends, the
  shipped templates' Beats among them marked as changed;
- **each Check**: its name, what its score reads in words, its Skills, its target (`flat` + factor ×
  difficulty, and its value at 60); the pass formula in words;
- **its consequences** by Degree, in words, a Death marked with the Tiers it can fall at;
- **its calibration**: the "Success or better" line, the Level 5 row of Parties of 3, and its peers'
  lines beside it; the run's command lines;
- the doctor's reading, and `encounters pending`'s list.

Show the owner the draft, and ask: approve, change, or drop it. A change returns to the step it
touches, a Check's score or the pass formula changed going through step 4 again.

Done when: the owner has approved the draft as it stands, or said to drop it.

## 6. Finish, or discard

**Approved:** `encounters finish --json`, which writes every pending edit, the templates' too, raises
the content version once and runs `npm test`, a few minutes; run it in the background where the
session allows, and wait for it. Follow `docs/agents/quests.md`'s step 3 on `undone`, then run the
doctor again (step 1). A template drafted with it is approved with it, or its draft dropped first.

**Dropped**, or a trial: `encounters discard <key> --json`; then `encounters pending --json` lists it
no more. A template whose Beat or Finale names it is discarded first (`quests discard <key>`), or the
discard is refused.

Done when: `finish` exits 0 and the doctor after it reports `"ok": true` with no pending edits; or the
edit is discarded.

## 7. Tell the owner

Give the Encounter's key, its Checks with their targets, its consequences, its calibration line, the
files `changed`, the content version's change and the tests' result; or that the draft was
discarded. Content that changes play is proved as `delivery.md` says: a quick run and `compare`.
`git diff` shows the rest, for the owner to review and commit.
